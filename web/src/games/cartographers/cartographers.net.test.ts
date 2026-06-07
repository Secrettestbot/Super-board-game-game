/* CARTOGRAPHERS — netplay tests. Proves the adapter validates intents, that a HostSession
 * and GuestSession stay in sync over an in-memory transport, and that redactFor never leaks
 * the not-yet-revealed deck order to a guest. */

import { describe, it, expect } from 'vitest'
import { cartographersAdapter as A, type CartographersIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as C from './logic'
import type { State } from './logic'

/** Build a legal seat-0 'place' intent for the current card (first shape, first terrain). */
function legalPlace(s: State): CartographersIntent {
  const card = s.card!
  for (let si = 0; si < card.shapes.length; si++) {
    const placements = C.legalPlacements(s.maps[0].grid, card.shapes[si])
    if (placements.length) {
      return { kind: 'place', shapeId: si, cells: placements[0], terrain: card.terrains[0] }
    }
  }
  throw new Error('no legal placement on a fresh map')
}

describe('cartographers net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // seat 0 (you) owes a placement first
    expect(A.isOver(s)).toBe(false)

    const intent = legalPlace(s)

    // out-of-turn: seat 1 cannot act while seat 0 still owes a placement -> unchanged ref
    expect(A.applyIntent(s, 1, intent)).toBe(s)

    // illegal: a 'skip' is only legal when truly deadlocked (a fresh map is not) -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'skip' })).toBe(s)
    // illegal: cells off the open grid -> unchanged ref
    expect(A.applyIntent(s, 0, { kind: 'place', shapeId: 0, cells: [[-1, -1]], terrain: s.card!.terrains[0] })).toBe(s)
    // illegal: terrain the card does not allow -> unchanged ref
    const badTerrain = (['forest', 'village', 'farm', 'water', 'monster'] as const).find(t => !s.card!.terrains.includes(t))!
    expect(A.applyIntent(s, 0, { ...(intent as { cells: unknown; shapeId: number }), kind: 'place', terrain: badTerrain } as CartographersIntent)).toBe(s)

    // legal seat-0 place: state advances and the turn passes to seat 1
    const s1 = A.applyIntent(s, 0, intent)
    expect(s1).not.toBe(s)
    expect(s1.maps[0].placed).toBe(true)
    expect(A.seatToMove(s1)).toBe(1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))
  })

  it('seat 1 (rival) plays via aiStep and the card advances', () => {
    const s0 = A.makeGame()
    const s1 = A.applyIntent(s0, 0, legalPlace(s0)) // seat 0 places
    expect(A.seatToMove(s1)).toBe(1)
    const s2 = A.aiStep(s1, 1) // rival/AI resolves -> both placed -> next card or season end
    expect(s2).not.toBe(s1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))
    // back to seat 0 to act on the freshly drawn card (or a season-end interstitial it drives)
    expect(A.seatToMove(s2)).toBe(0)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true) // seat 0 to move
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) places a legal shape
    host.dispatchLocal(legalPlace(host.getFull()))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now the guest's (seat 1) turn, view synced

    // guest (seat 1) replies with its own legal placement; intent travels host-ward
    const gv = guest.getState()
    let gIntent: CartographersIntent | null = null
    for (let si = 0; si < gv.card!.shapes.length; si++) {
      const p = C.legalPlacements(gv.maps[1].grid, gv.card!.shapes[si])
      if (p.length) { gIntent = { kind: 'place', shapeId: si, cells: p[0], terrain: gv.card!.terrains[0] }; break }
    }
    expect(gIntent).not.toBeNull()
    const stepBefore = host.getFull().step
    guest.dispatch(gIntent!)

    // host's authoritative state advanced past the resolved card (both seats acted, then
    // the logic drew the next card and cleared the placed flags for a fresh round)
    const after = host.getFull()
    expect(after.step).toBeGreaterThan(stepBefore)
    expect(after.maps[1].placed).toBe(false)
    // and seat 0 is to act again on the next card -> host's turn
    expect(host.isMyTurn()).toBe(true)
    // guest's synced view matches the host's step
    expect(guest.getState().step).toBe(after.step)
  })

  it('redactFor hides the not-yet-revealed deck order from a guest (no leak)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()

    // the current card is public and intact on the guest's view
    expect(view.card!.id).toBe(full.card!.id)
    expect(view.deck[full.cardIdx].id).toBe(full.card!.id)

    // every OTHER deck card's identity is blanked
    const upcoming = full.deck.filter((_, i) => i !== full.cardIdx)
    const serial = JSON.stringify(view)
    for (const card of upcoming) {
      expect(serial).not.toContain(card.id)
      expect(serial).not.toContain(card.name)
    }
    // redacted entries are placeholders
    for (let i = 0; i < view.deck.length; i++) {
      if (i === full.cardIdx) continue
      expect(view.deck[i].id).toBe('?')
    }
  })
})
