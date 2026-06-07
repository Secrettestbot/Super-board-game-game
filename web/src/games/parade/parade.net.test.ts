/* PARADE — netplay tests. Adapter round-trip + a real host/guest integration over an
 * in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries
 * another seat's private hand cards (or the face-down deck's real contents). */

import { describe, it, expect } from 'vitest'
import { paradeAdapter as A, type ParadeIntent } from './net'
import * as P from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game from a fixed deck order so every assertion is reproducible.
 *  Deal order (logic.ts): 5 rounds dealing one card per player (15 hand cards),
 *  then 6 to the parade, remainder to the deck (drawn from the END). */
function game() { return P.makeGame(P.fullDeck()) }

describe('parade net adapter', () => {
  it('starts with seat 0 to move on a 3-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal play and passes the turn to seat 1', () => {
    const s = game()
    const card = s.hands[0][0]
    const s2 = A.applyIntent(s, 0, { kind: 'play', cardId: card.id })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    // the played card is no longer in seat 0's hand
    expect(s2.hands[0].some(c => c.id === card.id)).toBe(false)
    // tickKey changed (the log grew + the turn advanced)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // seat 1 tries to act while it is seat 0's turn
    const card = s.hands[1][0]
    expect(A.applyIntent(s, 1, { kind: 'play', cardId: card.id })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a card id that is not in seat 0's hand (it belongs to seat 1)
    const others = s.hands[1][0]
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: others.id })).toBe(s)
    // a card id that exists nowhere
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 9999 })).toBe(s)
    // a malformed intent kind
    expect(A.applyIntent(s, 0, { kind: 'nope', cardId: s.hands[0][0].id } as unknown as ParadeIntent)).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('parade host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai'])
    // guest sees the public parade line (6 cards at the start)
    expect(guest.getState().parade.length).toBe(6)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) plays first
    const h0 = host.getFull().hands[0][0]
    host.dispatchLocal({ kind: 'play', cardId: h0.id } as ParadeIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const beforeLog = host.getFull().log.length
    const g0 = guest.getState().hands[1][0]
    guest.dispatch({ kind: 'play', cardId: g0.id } as ParadeIntent)
    expect(host.getFull().log.length).toBeGreaterThan(beforeLog)
    expect(host.getFull().turn).toBe(2) // seat 2 (the AI seat) is next
    // guest's view reflects the host's authoritative state
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().log.length
    // it is the host's (seat 0) turn, but the guest tries to play
    const g0 = guest.getState().hands[1][0]
    guest.dispatch({ kind: 'play', cardId: g0.id } as ParadeIntent)
    expect(host.getFull().log.length).toBe(before) // nothing changed
  })
})

describe('parade hidden-info redaction (leak test)', () => {
  it("the guest's view never carries another seat's hand cards or the real deck", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.hands[1]).toEqual(full.hands[1])
    // ...but every other seat's hand is blanked (count preserved, contents hidden).
    expect(view.hands[0].length).toBe(full.hands[0].length)
    expect(view.hands[2].length).toBe(full.hands[2].length)
    expect(view.hands[0].every(c => c.id === -1 && c.value === -1)).toBe(true)
    expect(view.hands[2].every(c => c.id === -1 && c.value === -1)).toBe(true)
    // ...and the face-down deck is blanked but keeps its count.
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(c => c.id === -1 && c.value === -1)).toBe(true)

    // The public parade line and collected piles are unchanged (shared face-up info).
    expect(view.parade).toEqual(full.parade)
    expect(view.collected).toEqual(full.collected)

    // No secret card (id / color+value pairing) from the hidden regions may surface in the
    // wire view. Gather every card id the guest is allowed to see (its own hand, the
    // public parade, and the collected piles) and confirm none of the hidden cards' ids
    // appear OUTSIDE that public set. We compare the actual id multiset rather than raw
    // string matching, since e.g. "id":3 is a substring of the legitimately-public "id":34.
    const publicIds = new Set<number>([
      ...full.hands[1].map(c => c.id),
      ...full.parade.map(c => c.id),
      ...full.collected.flat().map(c => c.id),
    ])
    const secretIds = [
      ...full.hands[0].map(c => c.id),
      ...full.hands[2].map(c => c.id),
      ...full.deck.map(c => c.id),
    ].filter(id => !publicIds.has(id))
    expect(secretIds.length).toBeGreaterThan(0) // sanity: there really are secrets to hide

    // Collect every card id actually present in the wire view, then assert no secret id
    // is among them.
    const wireIds = new Set<number>([
      ...view.hands.flat().map(c => c.id),
      ...view.deck.map(c => c.id),
      ...view.parade.map(c => c.id),
      ...view.collected.flat().map(c => c.id),
    ])
    for (const id of secretIds) expect(wireIds.has(id)).toBe(false)
    // And the blanked regions never carry a real (non-placeholder) value either.
    expect([...view.hands[0], ...view.hands[2], ...view.deck].every(c => c.value === -1)).toBe(true)
  })
})
