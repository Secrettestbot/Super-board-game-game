/* KINGDOMINO — netplay tests. Adapter round-trip (legal / illegal / out-of-turn) plus
   a host+guest in-memory sync proving the online path end-to-end without a browser.
   Perfect information, so no leak test is needed. */

import { describe, it, expect } from 'vitest'
import { kingdominoAdapter as A, type KingdominoIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as KD from './logic'
import type { KingdomState } from './logic'

/** A fresh game with a fixed deck so the lineup/order are deterministic. */
function game(): KingdomState {
  return KD.makeGame(KD.buildDeck())
}

/** The current active player's legal claim intent (first un-claimed lineup tile). */
function aLegalClaim(s: KingdomState): KingdominoIntent {
  const idx = s.lineup.findIndex(e => e.claimedBy == null)
  return { kind: 'claim', lineIndex: idx }
}

describe('kingdomino net adapter', () => {
  it('reports seats, active seat, and over-state', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // round 1 starts in claim phase, player 0 first
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal claim and passes the turn', () => {
    const s = game()
    expect(s.phase).toBe('claim')
    const ns = A.applyIntent(s, 0, aLegalClaim(s))
    expect(ns).not.toBe(s) // a new state
    expect(A.tickKey(ns)).not.toBe(A.tickKey(s)) // tick advanced
    expect(A.seatToMove(ns)).toBe(1) // now player 1
  })

  it('rejects an out-of-turn intent (returns the SAME state)', () => {
    const s = game()
    // it is seat 0's turn; seat 1 tries to act
    expect(A.applyIntent(s, 1, aLegalClaim(s))).toBe(s)
  })

  it('rejects an illegal intent (returns the SAME state)', () => {
    const s = game()
    // claiming a non-existent lineup index
    expect(A.applyIntent(s, 0, { kind: 'claim', lineIndex: 99 })).toBe(s)
    // a place intent during the claim phase is illegal
    expect(A.applyIntent(s, 0, { kind: 'place', placement: { anchor: 0, orient: 0 } })).toBe(s)
  })

  it('rejects an illegal placement once in the place phase', () => {
    // round 1: both players claim, then round 2 begins in the place phase for player 0.
    let s = game()
    s = A.applyIntent(s, 0, aLegalClaim(s))
    s = A.applyIntent(s, 1, aLegalClaim(s))
    expect(s.phase).toBe('place')
    const seat = A.seatToMove(s)!
    // index 99 is off-grid -> not a legal placement -> unchanged
    expect(A.applyIntent(s, seat, { kind: 'place', placement: { anchor: 99, orient: 0 } })).toBe(s)
    // a legal placement does change the state
    const claimed = s.players[seat].claimed!
    const legal = KD.legalPlacements(s.players[seat].grid, claimed)
    const ns = A.applyIntent(s, seat, { kind: 'place', placement: legal[0] })
    expect(ns).not.toBe(s)
  })
})

describe('kingdomino host + guest over an in-memory transport', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().players.length).toBe(2)
  })

  it('relays a host claim then a guest claim, staying in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) claims
    host.dispatchLocal(aLegalClaim(host.getFull()))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's turn, view synced

    const tickBefore = A.tickKey(host.getFull())
    // guest (seat 1) claims; intent travels host-ward and applies
    guest.dispatch(aLegalClaim(guest.getState()))
    expect(A.tickKey(host.getFull())).not.toBe(tickBefore) // host advanced
    // round 2 begins in the place phase for seat 0 (host)
    expect(host.getFull().phase).toBe('place')
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().tick).toBe(host.getFull().tick)
  })

  it('a vacated seat reverts to AI when the guest drops', () => {
    const { host, guest } = connect()
    expect(host.aiSeat()).toBe(null) // seat 0 (host) to move
    host.dispatchLocal(aLegalClaim(host.getFull())) // now seat 1's turn
    expect(host.aiSeat()).toBe(null) // seat 1 is the guest
    guest.close()
    expect(host.guestCount()).toBe(0)
    expect(host.aiSeat()).toBe(1) // seat 1 now AI, and it's its turn
  })
})

describe('kingdomino adapter aiStep drives both seats to a finished game', () => {
  it('self-plays to completion for any active seat', () => {
    let s = A.makeGame()
    for (let i = 0; i < 1000 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      const next = A.aiStep(s, seat)
      expect(next).not.toBe(s) // every aiStep makes progress
      s = next
    }
    expect(A.isOver(s)).toBe(true)
    expect(A.seatToMove(s)).toBe(null)
  })
})
