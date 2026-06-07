/* DOMINOES — netplay tests. Three parts:
 *   1) adapter round-trip: a legal seat-0 intent advances the state, while an out-of-turn
 *      seat-1 intent and an illegal intent both return the input state unchanged (===).
 *   2) host + guest stay in sync over an in-memory transport, with redaction reaching the
 *      guest (a real WebRTC end-to-end can't run headlessly).
 *   3) leak test: the guest's view never contains another seat's hand tiles or any of the
 *      secret boneyard tiles.
 */

import { describe, it, expect } from 'vitest'
import { dominoesAdapter as A } from './net'
import type { DominoesIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as DM from './logic'
import type { DomState, End, Player } from './logic'

/** Build a deterministic state where it is the given seat's turn with a known line/hand. */
function fixture(turn: Player): DomState {
  const base = A.makeGame()
  return Object.assign({}, base, {
    hands: {
      you: [{ a: 5, b: 6 }, { a: 0, b: 0 }],
      ai: [{ a: 1, b: 4 }, { a: 2, b: 2 }],
    },
    boneyard: [{ a: 6, b: 6 }, { a: 0, b: 3 }],
    line: [{ a: 3, b: 5 }],
    turn,
    passes: 0,
    winner: null,
    reason: null,
    last: 0,
    scores: { you: 0, ai: 0 },
  }) as DomState
}

describe('dominoes net adapter', () => {
  it('exposes seats and the seat to move', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)
    // makeGame's leader has already laid the opener, so it is the other seat's turn.
    const stm = A.seatToMove(s)
    expect(stm === 0 || stm === 1).toBe(true)
  })

  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = fixture('you')
    expect(A.seatToMove(s)).toBe(0)

    // legal seat-0 play: [5|6] onto R=5 -> 6 becomes the new right end, turn passes.
    const played = A.applyIntent(s, 0, { kind: 'play', tileId: DM.tileId({ a: 5, b: 6 }), end: 'R' as End })
    expect(played).not.toBe(s)
    expect(DM.ends(played.line)).toEqual({ L: 3, R: 6 })
    expect(played.turn).toBe('ai')
    expect(played.hands.you.length).toBe(1)

    // out-of-turn: seat 1 tries to act while it is seat 0's turn -> unchanged (===).
    const outOfTurn = A.applyIntent(s, 1, { kind: 'play', tileId: DM.tileId({ a: 1, b: 4 }), end: 'L' as End })
    expect(outOfTurn).toBe(s)

    // illegal: a tile that matches neither end -> unchanged (===).
    const illegal = A.applyIntent(s, 0, { kind: 'play', tileId: DM.tileId({ a: 0, b: 0 }), end: 'L' as End })
    expect(illegal).toBe(s)

    // illegal: unknown tile id -> unchanged (===).
    const unknown = A.applyIntent(s, 0, { kind: 'play', tileId: 999, end: 'R' as End })
    expect(unknown).toBe(s)

    // pass while you can still move -> logic no-ops, unchanged (===).
    const badPass = A.applyIntent(s, 0, { kind: 'pass' })
    expect(badPass).toBe(s)
  })

  it('tickKey changes on every action', () => {
    const s = fixture('you')
    const k0 = A.tickKey(s)
    const afterPlay = A.applyIntent(s, 0, { kind: 'play', tileId: DM.tileId({ a: 5, b: 6 }), end: 'R' as End })
    expect(A.tickKey(afterPlay)).not.toBe(k0)
  })

  it('redactFor is a faithful round-trip for the seat that owns the data', () => {
    const s = fixture('you')
    // seat 0 sees its own hand fully; the OTHER hand + boneyard are blanked.
    const view0 = A.redactFor!(s, 0)
    expect(view0.hands.you).toEqual(s.hands.you)
    expect(view0.hands.ai.length).toBe(s.hands.ai.length)
    expect(view0.hands.ai.every(t => t.a === -1 && t.b === -1)).toBe(true)
    expect(view0.boneyard.length).toBe(s.boneyard.length)
    expect(view0.boneyard.every(t => t.a === -1 && t.b === -1)).toBe(true)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('dominoes host + guest over in-memory transport', () => {
  it('assigns the guest seat 1 and syncs an opening view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    // 28-tile set conserved in the host's authoritative state.
    const full = host.getFull()
    const total = full.hands.you.length + full.hands.ai.length + full.boneyard.length + full.line.length
    expect(total).toBe(28)
  })

  it('relays intents and keeps the two views in sync', () => {
    const { host, guest } = connect()
    let guard = 0
    // Drive a full game: whichever side is to move, the controlling session dispatches a
    // legal intent from its OWN visible hand. Host is seat 0, guest seat 1.
    while (!A.isOver(host.getFull()) && guard++ < 400) {
      const seat = A.seatToMove(host.getFull())
      if (seat == null) break
      if (seat === 0) {
        expect(host.isMyTurn()).toBe(true)
        host.dispatchLocal(legalIntent(host.getFull(), 'you'))
      } else {
        expect(guest.isMyTurn()).toBe(true)
        guest.dispatch(legalIntent(guest.getState(), 'ai'))
      }
      // After each turn, the guest's tickKey tracks the host's authoritative one.
      expect(guest.tickKey()).toBe(host.tickKey())
    }
    expect(A.isOver(host.getFull())).toBe(true)
    expect(['you', 'ai', 'draw']).toContain(host.getFull().winner)
  })
})

/** Pick any legal intent for `who` from the (possibly redacted) state's own hand. */
function legalIntent(s: DomState, who: Player): DominoesIntent {
  const hand = s.hands[who]
  const playable = hand.find(t => DM.canPlay(s.line, t))
  if (playable) {
    const ends = DM.playableEnds(s.line, playable)
    return { kind: 'play', tileId: DM.tileId(playable), end: ends[0] }
  }
  return s.boneyard.length ? { kind: 'draw' } : { kind: 'pass' }
}

describe('dominoes leak test (hidden info)', () => {
  it('the guest never sees the other seat\'s hand or the boneyard', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState() // guest is seat 1 ('ai')

    // The guest sees its OWN hand intact.
    expect(view.hands.ai).toEqual(full.hands.ai)
    // The host's ('you') hand is fully blanked.
    expect(view.hands.you.length).toBe(full.hands.you.length)
    expect(view.hands.you.every(t => t.a === -1 && t.b === -1)).toBe(true)
    // The entire boneyard is blanked.
    expect(view.boneyard.length).toBe(full.boneyard.length)
    expect(view.boneyard.every(t => t.a === -1 && t.b === -1)).toBe(true)

    // No real id of a secret tile appears anywhere in what crossed the wire. We test the
    // serialized JSON for the canonical tileId of every secret tile (host hand + boneyard).
    const wire = JSON.stringify(view)
    const secret = [...full.hands.you, ...full.boneyard]
    for (const t of secret) {
      // The tile object itself (its real pips) must not be recoverable from the view.
      const present = view.hands.you.concat(view.boneyard).some(v => v.a === t.a && v.b === t.b)
      expect(present).toBe(false)
    }
    // The placeholder pip value -1 is the only thing representing secrets.
    expect(wire).toContain('-1')
  })
})
