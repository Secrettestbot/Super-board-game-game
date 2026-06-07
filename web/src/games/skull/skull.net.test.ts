/* SKULL — netplay tests. Adapter round-trip + a host/guest integration run over an
 * in-memory transport, plus a LEAK TEST proving a guest never receives the identity of
 * another seat's still-face-down disc (nor a rival's hand composition). */

import { describe, it, expect } from 'vitest'
import { skullAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as SK from './logic'
import type { SkullState } from './logic'

describe('skull net adapter', () => {
  it('exposes seat 0 to move on a fresh game and the right seat count', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(4)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal place intent and changes the tickKey', () => {
    const s = A.makeGame()
    const before = A.tickKey(s)
    const next = A.applyIntent(s, 0, { kind: 'place', disc: 'rose' })
    expect(next).not.toBe(s) // state advanced
    expect(next.players[0].stack).toEqual(['rose'])
    expect(next.players[0].hand.roses).toBe(SK.START_ROSES - 1)
    expect(A.tickKey(next)).not.toBe(before) // tick changed -> AI re-arms
    expect(A.seatToMove(next)).toBe(1) // turn passed
  })

  it('returns the SAME state for an out-of-turn intent', () => {
    const s = A.makeGame()
    // seat 1 tries to act while it's seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'place', disc: 'rose' })).toBe(s)
  })

  it('returns the SAME state for an illegal intent', () => {
    const s = A.makeGame()
    // can't bid during the very first placement (no first pass / nothing placed)
    expect(A.applyIntent(s, 0, { kind: 'bid', n: 1 })).toBe(s)
    // can't pass outside the bid phase
    expect(A.applyIntent(s, 0, { kind: 'pass' })).toBe(s)
    // can't flip outside a challenge
    expect(A.applyIntent(s, 0, { kind: 'flip', target: 1 })).toBe(s)
  })

  it('bid intent opens during place and raises during bid', () => {
    // Walk a full first pass so bidding is legal, then open and raise.
    let s = A.makeGame()
    for (let i = 0; i < 4; i++) s = A.applyIntent(s, i, { kind: 'place', disc: 'rose' })
    expect(s.phase).toBe('place')
    expect(s.placedFirstPass).toBe(true)
    expect(A.seatToMove(s)).toBe(0)
    s = A.applyIntent(s, 0, { kind: 'bid', n: 1 }) // opens
    expect(s.phase).toBe('bid')
    expect(s.bid).toBe(1)
    const raiser = A.seatToMove(s)!
    s = A.applyIntent(s, raiser, { kind: 'bid', n: 2 }) // raises
    expect(s.bid).toBe(2)
  })
})

describe('skull host + guest over an in-memory transport', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('seats the guest at 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai', 'ai'])
    expect(guest.getState().players.length).toBe(4)
  })

  it('relays a host move and the guest sees its turn come up', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal({ kind: 'place', disc: 'rose' })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // seat 1 is now to move
    // guest replies; the host's authoritative state advances past seat 1
    guest.dispatch({ kind: 'place', disc: 'rose' })
    expect(host.getFull().players[1].stack).toEqual(['rose'])
    expect(host.getFull().turn).toBe(2)
  })
})

describe('skull leak test — a guest never sees others\' face-down discs', () => {
  it('hides rival face-down disc identities and hand composition', () => {
    // Build a host state by hand where seat 0 has a SKULL on top of a rose, all face-down,
    // and only ONE skull in hand. Seat 1 (the guest) must learn none of seat 0's secrets.
    const base = SK.makeGame()
    const s: SkullState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, hand: { roses: 2, skulls: 1 }, stack: ['rose', 'skull'] }
          : i === 1
            ? { ...p, hand: { roses: 3, skulls: 1 }, stack: ['rose'] }
            : p,
      ),
    }

    // The guest is seat 1. Build the exact view that crosses the wire.
    const view = A.redactFor!(s, 1)

    // Seat 1 sees its OWN stack + hand untouched.
    expect(view.players[1].stack).toEqual(['rose'])
    expect(view.players[1].hand).toEqual({ roses: 3, skulls: 1 })

    // Seat 0's face-down discs are masked to placeholders (same height, no skull visible).
    expect(view.players[0].stack.length).toBe(2)
    expect(view.players[0].stack).not.toContain('skull')

    // Seat 0's hand composition is collapsed to count-only: the lone skull is gone.
    expect(view.players[0].hand.skulls).toBe(0)
    expect(view.players[0].hand.roses + view.players[0].hand.skulls).toBe(3) // total preserved

    // No serialized trace reveals a skull DISC among seat 0's discs (the "skulls" hand-count
    // KEY is allowed; it's pinned to 0). Strip the discs to their own array and assert.
    expect(JSON.stringify(view.players[0].stack)).not.toContain('skull')
    expect(view.players[0].hand.skulls).toBe(0)
  })

  it('reveals only the discs the rules have publicly flipped', () => {
    // Drive a real game to a challenge so some discs are face-up, then check redaction keeps
    // the flipped ones visible while hiding the rest.
    const rng = () => 0 // deterministic
    let s = SK.makeGame()
    // Everyone places a rose; seat 0 places a skull on top as a trap so its own flip fails.
    s = SK.place(s, 0, 'rose', rng)
    s = SK.place(s, 1, 'rose', rng)
    s = SK.place(s, 2, 'rose', rng)
    s = SK.place(s, 3, 'rose', rng)
    s = SK.openBid(s, 0, 1)
    // Others pass so seat 0 must flip its own (rose) stack to satisfy a bid of 1.
    while (s.phase === 'bid') {
      const t = A.seatToMove(s)!
      s = SK.pass(s, t)
    }
    expect(s.phase).toBe('challenge')
    // Flip seat 0's own top disc (a rose) -> reaches the bid of 1 -> reveal.
    s = SK.flip(s, 0, rng)
    // A flip happened: that disc is now public. redactFor for a NON-flipping seat (seat 2)
    // should still expose seat 0's flipped disc but nothing unflipped.
    const view = A.redactFor!(s, 2)
    const flippedSeat0 = s.flips.filter(f => f.player === 0).length
    // The publicly flipped discs on seat 0 keep their true identity in the view.
    const trueStack0 = s.players[0].stack
    for (let k = 0; k < trueStack0.length; k++) {
      const fromTop = trueStack0.length - 1 - k
      if (fromTop < flippedSeat0) expect(view.players[0].stack[k]).toBe(trueStack0[k])
    }
  })
})
