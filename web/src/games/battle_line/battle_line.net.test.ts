/* BATTLE LINE — netplay tests. Adapter round-trip (legal play/draw + illegal/out-of-turn
 * rejection), a real host/guest integration over an in-memory transport, and a hidden-info
 * LEAK test proving the guest's view never carries the other seat's private hand cards or
 * the face-down draw deck. */

import { describe, it, expect } from 'vitest'
import { battleLineAdapter as A, type BattleLineIntent } from './net'
import * as BL from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game: a fixed full 60-card draw order (top = end of array). Seat 0 holds
 * the first 7 cards, seat 1 the next 7, the rest is the deck. */
function game() {
  return BL.makeGame(BL.buildDeck())
}

describe('battle_line net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal play then draw, advancing turn to seat 1', () => {
    const s = game()
    const card = s.hands[0][0]
    const tick0 = A.tickKey(s)
    const afterPlay = A.applyIntent(s, 0, { kind: 'play', cardId: card.id, flag: 0 })
    expect(afterPlay).not.toBe(s)
    expect(afterPlay.phase).toBe('draw')
    expect(afterPlay.turn).toBe(0) // still seat 0, now must draw
    expect(A.tickKey(afterPlay)).not.toBe(tick0)
    // the card moved from hand 0 onto flag 0's seat-0 side
    expect(afterPlay.hands[0].find(c => c.id === card.id)).toBeUndefined()
    expect(afterPlay.flags[0].you.some(c => c.id === card.id)).toBe(true)

    const afterDraw = A.applyIntent(afterPlay, 0, { kind: 'draw', deck: 'troop' })
    expect(afterDraw).not.toBe(afterPlay)
    expect(afterDraw.turn).toBe(1) // now seat 1's turn
    expect(afterDraw.phase).toBe('play')
    expect(A.seatToMove(afterDraw)).toBe(1)
    expect(A.tickKey(afterDraw)).not.toBe(A.tickKey(afterPlay))
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    const foeCard = s.hands[1][0]
    // seat 1 tries to play while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'play', cardId: foeCard.id, flag: 0 })).toBe(s)
    // seat 1 tries to draw out of turn
    expect(A.applyIntent(s, 1, { kind: 'draw', deck: 'troop' })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a card id not in seat 0's hand
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 999, flag: 0 })).toBe(s)
    // a card seat 0 does NOT hold (belongs to seat 1)
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: s.hands[1][0].id, flag: 0 })).toBe(s)
    // an out-of-range flag index
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: s.hands[0][0].id, flag: 99 })).toBe(s)
    // drawing during the play phase while a legal play exists is not allowed
    expect(A.applyIntent(s, 0, { kind: 'draw', deck: 'troop' })).toBe(s)
    // claiming a flag that is not decided
    expect(A.applyIntent(s, 0, { kind: 'claim', flag: 0 })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('battle_line host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().flags.length).toBe(BL.FLAGS)
  })

  it('relays the host turn (play + draw), then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays then draws
    const hCard = host.getFull().hands[0][0]
    host.dispatchLocal({ kind: 'play', cardId: hCard.id, flag: 0 } as BattleLineIntent)
    host.dispatchLocal({ kind: 'draw', deck: 'troop' } as BattleLineIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's (guest's) turn, view synced

    // guest (seat 1) replies; intent travels host-ward and applies
    const beforeTick = host.getFull().tick
    const gCard = guest.getState().hands[1][0]
    expect(gCard.value).toBeGreaterThan(0) // guest sees its OWN real hand
    guest.dispatch({ kind: 'play', cardId: gCard.id, flag: 1 } as BattleLineIntent)
    expect(host.getFull().tick).toBe(beforeTick + 1)
    expect(host.getFull().flags[1].foe.some(c => c.id === gCard.id)).toBe(true)
    guest.dispatch({ kind: 'draw', deck: 'troop' } as BattleLineIntent)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative tick
    expect(guest.getState().tick).toBe(host.getFull().tick)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().tick
    // it is the host's (seat 0) turn, but the guest tries to play
    const gCard = guest.getState().hands[1][0]
    guest.dispatch({ kind: 'play', cardId: gCard.id, flag: 0 } as BattleLineIntent)
    expect(host.getFull().tick).toBe(before) // nothing changed
  })
})

describe('battle_line hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the other seat's hand cards or the deck", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.hands[1]).toEqual(full.hands[1])
    // ...but seat 0's hand is blanked to placeholders (count preserved).
    expect(view.hands[0].length).toBe(full.hands[0].length)
    expect(view.hands[0].every(c => c.id === -1 && c.value === -1)).toBe(true)
    // ...and the face-down deck is fully blanked (count preserved so the UI shows N left).
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(c => c.id === -1 && c.value === -1)).toBe(true)

    // The only real card ids the wire view may carry are the public ones: this seat's own
    // hand, plus any cards already placed on flags. Seat 0's secret hand ids and every deck
    // id must be absent. (Ids are globally unique, so a leak would surface an id from the
    // secret sets in the wire's id list.)
    const idsInWire = new Set<number>()
    const collect = (o: unknown): void => {
      if (Array.isArray(o)) { for (const v of o) collect(v) }
      else if (o && typeof o === 'object') {
        const rec = o as Record<string, unknown>
        if (typeof rec.id === 'number' && typeof rec.colour === 'string') idsInWire.add(rec.id)
        for (const v of Object.values(rec)) collect(v)
      }
    }
    collect(view)
    for (const c of full.hands[0]) expect(idsInWire.has(c.id)).toBe(false)
    for (const c of full.deck) expect(idsInWire.has(c.id)).toBe(false)
    // Sanity: the guest's own real hand ids ARE present (so the test isn't vacuously passing).
    for (const c of full.hands[1]) expect(idsInWire.has(c.id)).toBe(true)
  })
})
