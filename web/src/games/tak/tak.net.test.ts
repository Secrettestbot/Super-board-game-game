/* Browser-free integration test of Tak online play: the adapter round-trips legal
 * intents (a place + a stack move) and rejects illegal/out-of-turn ones, and a
 * HostSession + GuestSession stay in sync over an in-memory transport. */

import { describe, it, expect } from 'vitest'
import { takAdapter as A, type TakIntent } from './net'
import * as T from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('tak net adapter', () => {
  it('starts with player 0 (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal place then a legal stack move, advancing the turn', () => {
    const s0 = A.makeGame()

    // Seat 0 places a flat at the center (a legal placement on an empty board).
    const place: TakIntent = { kind: 'place', at: T.idx(2, 2), piece: 'flat' }
    const s1 = A.applyIntent(s0, 0, place)
    expect(s1).not.toBe(s0)
    expect(s1.board[T.idx(2, 2)].length).toBe(1)
    expect(A.seatToMove(s1)).toBe(1)

    // Seat 1 places something so we get back to a state where seat 0 controls a
    // stack it can move. Seat 0 then carries its flat one square.
    const s2 = A.applyIntent(s1, 1, { kind: 'place', at: T.idx(0, 0), piece: 'flat' })
    expect(A.seatToMove(s2)).toBe(0)

    const move = T.legalMoves(s2).find(m => m.kind === 'move')
    expect(move).toBeTruthy()
    const s3 = A.applyIntent(s2, 0, move!)
    expect(s3).not.toBe(s2)
    expect(A.seatToMove(s3)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const place: TakIntent = { kind: 'place', at: T.idx(2, 2), piece: 'flat' }
    expect(A.applyIntent(s, 1, place)).toBe(s) // seat 1 cannot move on seat 0's turn
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // A stack move from an empty square is illegal.
    const bad: TakIntent = { kind: 'move', from: T.idx(0, 0), dir: 1, drops: [1] }
    expect(A.applyIntent(s, 0, bad)).toBe(s)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])

    // Host (seat 0) places a flat; turn passes to the guest.
    host.dispatchLocal({ kind: 'place', at: T.idx(2, 2), piece: 'flat' })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[T.idx(2, 2)].length).toBe(1)

    // Guest (seat 1) replies; the intent travels host-ward and applies.
    const before = host.getFull().moveCount
    guest.dispatch({ kind: 'place', at: T.idx(0, 0), piece: 'flat' })
    expect(host.getFull().moveCount).toBe(before + 1)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().moveCount).toBe(host.getFull().moveCount)
  })
})
