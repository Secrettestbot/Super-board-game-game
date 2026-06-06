import { describe, it, expect } from 'vitest'
import { blokusDuoAdapter as A, type BlokusDuoIntent } from './net'
import * as B from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** Build a wire intent from a concrete legal Placement. */
function intentOf(p: B.Placement): BlokusDuoIntent {
  return { pieceId: p.pieceId, orient: p.orient, r: p.r, c: p.c }
}

describe('blokus_duo net adapter', () => {
  it('starts with the human (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal placement and passes the turn', () => {
    const s = A.makeGame()
    const p = B.legalPlacements(s, 0)[0]
    const s2 = A.applyIntent(s, 0, intentOf(p))
    expect(s2).not.toBe(s)
    expect(s2.scores[0]).toBe(p.cells.length)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const p = B.legalPlacements(s, 1)[0]
    expect(A.applyIntent(s, 1, intentOf(p))).toBe(s)
  })

  it('ignores an illegal placement (returns same state)', () => {
    const s = A.makeGame()
    // First move must cover the start cell; piece 0 anchored at (0,0) does not.
    expect(A.applyIntent(s, 0, { pieceId: 0, orient: 0, r: 0, c: 0 })).toBe(s)
  })

  it('ignores a bogus pass when the player can still move', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { pieceId: null })).toBe(s)
  })

  it('aiStep advances and produces a string tickKey', () => {
    let s = A.makeGame()
    // human moves first so it becomes the AI seat's turn
    s = A.applyIntent(s, 0, intentOf(B.legalPlacements(s, 0)[0]))
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before)
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('blokus_duo host + guest sync (in-memory transport)', () => {
  it('relays moves both ways and stays in sync', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays a legal placement
    const p0 = B.legalPlacements(host.getFull(), 0)[0]
    host.dispatchLocal(intentOf(p0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().scores[0]).toBe(p0.cells.length)

    // guest (seat 1) replies; intent travels host-ward and applies
    const p1 = B.legalPlacements(guest.getState(), 1)[0]
    guest.dispatch(intentOf(p1))
    expect(host.getFull().turn).toBe(0)
    expect(host.isMyTurn()).toBe(true)
    expect(host.getFull().scores[1]).toBe(p1.cells.length)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().step).toBe(host.getFull().step)
  })
})
