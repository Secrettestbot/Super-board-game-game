import { describe, it, expect } from 'vitest'
import { blockadeAdapter as A, type BlockadeIntent } from './net'
import * as BL from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** Build a legal full turn (move + a wall, when walls remain) for `seat` from a state. */
function legalTurn(s: BL.BlockadeState, seat: 0 | 1): BlockadeIntent {
  // pick a legal move for pawn 0 (it always has at least one from the start cells)
  const m = BL.legalMoves(s, seat, 0)
  expect(m.length).toBeGreaterThan(0)
  const [r, c] = m[0]
  // resolve the move to find the awaiting-wall state, then pick a legal wall
  const moved = BL.move(s, seat, 0, r, c)
  if (moved.winner != null || moved.turn !== seat) return { idx: 0, r, c } // turn already complete
  const walls = BL.legalWalls(moved, seat)
  expect(walls.length).toBeGreaterThan(0)
  return { idx: 0, r, c, wall: walls[0] }
}

describe('blockade net adapter', () => {
  it('starts with you (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal full turn (move + wall) and passes the turn', () => {
    const s = A.makeGame()
    const turn = legalTurn(s, 0)
    const s2 = A.applyIntent(s, 0, turn)
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1) // turn passed to the opponent
    expect(s2.walls.length).toBe(1)  // the wall landed
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const turn = legalTurn(s, 0)
    expect(A.applyIntent(s, 1, turn)).toBe(s)
  })

  it('ignores an illegal move (returns same state ref)', () => {
    const s = A.makeGame()
    // (0,0) is empty/far from any of seat 0's pawns -> not a legal move
    expect(A.applyIntent(s, 0, { idx: 0, r: 0, c: 0 })).toBe(s)
  })

  it('ignores a legal move with an illegal/missing wall (returns same state ref)', () => {
    const s = A.makeGame()
    const m = BL.legalMoves(s, 0, 0)[0]
    // legal move but no wall supplied, while walls remain -> whole turn rejected
    expect(A.applyIntent(s, 0, { idx: 0, r: m[0], c: m[1] })).toBe(s)
    // legal move but a geometrically out-of-range wall -> whole turn rejected
    const bad = { idx: 0, r: m[0], c: m[1], wall: { r: 99, c: 99, o: 'h' as const } }
    expect(A.applyIntent(s, 0, bad)).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    // play one human turn so it becomes the AI seat's move
    s = A.applyIntent(s, 0, legalTurn(s, 0))
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before)
    expect(A.isOver(s) || A.seatToMove(s) === 0).toBe(true)
  })
})

describe('blockade host + guest over an in-memory transport', () => {
  it('host (seat 0) and guest (seat 1) stay in sync across full turns', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host plays its full turn
    host.dispatchLocal(legalTurn(host.getFull(), 0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // view synced down to the guest
    expect(guest.getState().walls.length).toBe(host.getFull().walls.length)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().walls.length
    guest.dispatch(legalTurn(guest.getState(), 1))
    expect(host.getFull().walls.length).toBe(before + 1)
    expect(host.isMyTurn()).toBe(true) // back to the host
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('ignores an out-of-turn guest intent (host stays authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    const before = host.getFull().walls.length
    // it is the host's (seat 0) turn, but the guest tries to move its own pawn upward
    guest.dispatch({ idx: 0, r: 1, c: 3 })
    expect(host.getFull().walls.length).toBe(before) // rejected
    expect(host.isMyTurn()).toBe(true)
  })
})
