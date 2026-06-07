/* RADLANDS — netplay adapter tests. Three parts per PORTING.md:
 *   1. adapter round-trip: a legal intent advances state; illegal / out-of-turn return ===.
 *   2. host + guest sync over an in-memory transport (the headless proof of the online path).
 *   3. leak test: a guest's redacted view never carries the opponent's private hand or the
 *      face-down deck contents (counts stay intact). */

import { describe, it, expect } from 'vitest'
import { radlandsAdapter as A, type RadlandsIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as R from './logic'

/** Pull a concrete legal intent of a given turn-action kind for the seat to move. */
function legalIntent(s: R.RadlandsState, seat: 0 | 1, type: R.LegalAction['type']): RadlandsIntent | null {
  const a = R.legalActions(s, seat).find(x => x.type === type)
  if (!a) return null
  if (a.type === 'play') return { t: 'play', cardId: a.cardId, column: a.column, slot: a.slot }
  if (a.type === 'event') return { t: 'event', cardId: a.cardId }
  if (a.type === 'ability') return { t: 'ability', source: a.source, target: a.target }
  return { t: 'end' }
}

describe('radlands net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // a legal seat-0 intent changes state + bumps the tickKey
    const before = A.tickKey(s)
    const intent = legalIntent(s, 0, 'end') ?? { t: 'end' as const }
    const after = A.applyIntent(s, 0, intent)
    expect(after).not.toBe(s)
    expect(A.tickKey(after)).not.toBe(before)
    expect(after.turn).toBe(1) // ending passes the turn

    // out-of-turn: seat 1 acting while it is seat 0's turn -> unchanged (===)
    expect(A.applyIntent(s, 1, { t: 'end' })).toBe(s)

    // illegal: deploy a card not in hand -> unchanged (===)
    expect(A.applyIntent(s, 0, { t: 'play', cardId: 'nonsuch', column: 0, slot: 0 })).toBe(s)
    // illegal: ability from a source the seat doesn't own -> unchanged (===)
    expect(A.applyIntent(s, 0, { t: 'ability', source: { player: 1, column: 0, slot: -1 }, target: null })).toBe(s)
  })

  it('does not mutate the input state when applying an intent', () => {
    const s = A.makeGame()
    const snap = JSON.stringify(s)
    A.applyIntent(s, 0, { t: 'end' })
    expect(JSON.stringify(s)).toBe(snap) // original untouched (pure)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) ends its turn -> turn passes to the guest, view synced
    host.dispatchLocal({ t: 'end' })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(1)

    // guest (seat 1) replies with a legal move; intent travels host-ward and applies
    const reply = legalIntent(guest.getState(), 1, 'end') ?? { t: 'end' as const }
    guest.dispatch(reply)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
  })

  it('redacts the opponent hand + both decks for a guest, keeping counts (leak test)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    const full = host.getFull()
    const view = guest.getState()

    // guest is seat 1: sees its OWN real hand, identical to the host's truth
    expect(view.players[1].hand).toEqual(full.players[1].hand)
    // the opponent's (seat 0) hand is fully masked, count preserved
    expect(view.players[0].hand.length).toBe(full.players[0].hand.length)
    expect(view.players[0].hand.every(c => c === '?')).toBe(true)
    // both decks are face-down/masked, counts preserved
    expect(view.players[0].deck.length).toBe(full.players[0].deck.length)
    expect(view.players[1].deck.length).toBe(full.players[1].deck.length)
    expect(view.players[0].deck.every(c => c === '?')).toBe(true)
    expect(view.players[1].deck.every(c => c === '?')).toBe(true)

    // the opponent's private hand cards must not surface via their (redacted) hand array
    const wire = JSON.stringify(view)
    for (const card of new Set(full.players[0].hand)) {
      expect(view.players[0].hand).not.toContain(card)
    }
    // the deck order/contents (secret for BOTH players) must not leak
    for (const card of new Set([...full.players[0].deck, ...full.players[1].deck])) {
      expect(view.players[0].deck).not.toContain(card)
      expect(view.players[1].deck).not.toContain(card)
    }
    // the masked view is still valid JSON that round-trips
    expect(JSON.parse(wire).players[0].hand.length).toBe(full.players[0].hand.length)
  })
})
