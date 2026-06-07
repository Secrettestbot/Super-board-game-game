/* POINT SALAD — netplay tests. Adapter round-trip (legal/illegal/out-of-turn), a
   host+guest in-memory sync, and a redaction leak test proving the face-down pile order
   never crosses the wire to a guest. */

import { describe, it, expect } from 'vitest'
import { pointSaladAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as PS from './logic'

describe('point_salad net adapter', () => {
  it('reports 3 seats and seat 0 to move on a fresh game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal takePoint intent and advances the turn', () => {
    const s = A.makeGame(PS.buildDeck())
    const before = s.piles[0].length
    const ns = A.applyIntent(s, 0, { kind: 'takePoint', id: 0 })
    expect(ns).not.toBe(s)
    expect(ns.players[0].points.length).toBe(1)
    expect(ns.piles[0].length).toBe(before - 1)
    expect(A.seatToMove(ns)).toBe(1)
    expect(A.tickKey(ns)).not.toBe(A.tickKey(s))
  })

  it('round-trips a legal takeVeg intent', () => {
    const s = A.makeGame(PS.buildDeck())
    const ns = A.applyIntent(s, 0, { kind: 'takeVeg', ids: [0, 1] })
    expect(ns).not.toBe(s)
    const got = PS.VEG.reduce((a, x) => a + ns.players[0].veg[x], 0)
    expect(got).toBe(2)
    expect(A.seatToMove(ns)).toBe(1)
  })

  it('returns the SAME state for out-of-turn, illegal, and flip (no-op) intents', () => {
    const s = A.makeGame(PS.buildDeck())
    // out of turn: seat 1 acting while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'takePoint', id: 0 })).toBe(s)
    // illegal takeVeg: same slot twice
    expect(A.applyIntent(s, 0, { kind: 'takeVeg', ids: [0, 0] })).toBe(s)
    // illegal takeVeg: wrong count
    expect(A.applyIntent(s, 0, { kind: 'takeVeg', ids: [0, 1, 2] })).toBe(s)
    // illegal takePoint: out-of-range pile
    expect(A.applyIntent(s, 0, { kind: 'takePoint', id: 9 })).toBe(s)
    // flip has no action in this build -> no-op
    expect(A.applyIntent(s, 0, { kind: 'flip', cardId: 0 })).toBe(s)
  })

  it('round-trips redactFor to an equivalent visible state', () => {
    const s = A.makeGame(PS.buildDeck())
    const view = A.redactFor!(s, 1)
    // counts preserved
    expect(view.piles.map(p => p.length)).toEqual(s.piles.map(p => p.length))
    expect(PS.cardsLeft(view)).toBe(PS.cardsLeft(s))
    // public top criterion preserved for each pile
    for (let p = 0; p < PS.N_PILES; p++) {
      expect(PS.pileTop(view, p)).toEqual(PS.pileTop(s, p))
    }
    // market (public) untouched
    expect(view.market).toEqual(s.market)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('point_salad host + guest over an in-memory transport', () => {
  it('seats the guest and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai'])
    expect(guest.getState().players.length).toBe(3)
  })

  it('relays the host move and lets the guest reply on its turn', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    // host (seat 0) takes a point card
    host.dispatchLocal({ kind: 'takePoint', id: 0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1 (guest) to move, view synced
    expect(guest.getState().players[0].points.length).toBe(1)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = PS.cardsLeft(host.getFull())
    guest.dispatch({ kind: 'takeVeg', ids: [0, 1] })
    expect(PS.cardsLeft(host.getFull())).toBeLessThan(before)
    expect(host.getFull().turn).toBe(2) // advanced to seat 2 (an AI seat)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = PS.cardsLeft(host.getFull())
    // it is seat 0's (host) turn, but the guest tries to move
    guest.dispatch({ kind: 'takePoint', id: 0 })
    expect(PS.cardsLeft(host.getFull())).toBe(before) // rejected, nothing changed
  })
})

describe('point_salad redaction reaches the guest (no face-down leak)', () => {
  it("the guest's view scrubs every below-top pile card to the placeholder", () => {
    const host = new HostSession(A)
    const full = host.getFull()
    // The secret order: every criterion that sits BELOW the top of some pile.
    const hidden = new Set<string>()
    for (const pile of full.piles) {
      for (let i = 0; i < pile.length - 1; i++) hidden.add(pile[i].crit)
    }
    expect(hidden.size).toBeGreaterThan(0) // the deck has real hidden depth

    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    const view = guest.getState()

    // Every non-top pile slot must be the HIDDEN placeholder, never the real card.
    for (const pile of view.piles) {
      for (let i = 0; i < pile.length - 1; i++) expect(pile[i].crit).toBe('?')
    }
    // Public info still intact: pile counts and the visible top criterion.
    expect(view.piles.map(p => p.length)).toEqual(full.piles.map(p => p.length))
    for (let p = 0; p < PS.N_PILES; p++) {
      expect(view.piles[p][view.piles[p].length - 1]?.crit).toBe(full.piles[p][full.piles[p].length - 1]?.crit)
    }
    // The placeholder marker crossed the wire; no leaked hidden criterion appears as a
    // full pile entry (we asserted every below-top slot is '?', above).
    expect(JSON.stringify(view)).toContain('"crit":"?"')
  })
})
