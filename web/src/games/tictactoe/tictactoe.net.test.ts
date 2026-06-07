/* Browser-free integration test of tic-tac-toe online play: adapter round-trip plus a
 * HostSession + GuestSession wired through an in-memory transport pair. */

import { describe, it, expect } from 'vitest'
import { ticTacToeAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('tic-tac-toe net adapter', () => {
  it('starts with X (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, 4) // X to center
    expect(s2).not.toBe(s)
    expect(s2.board[4]).toBe('x')
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 1, 0)).toBe(s) // seat 1 (O) tries to move first
  })

  it('ignores an illegal / occupied intent (returns same ref)', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, 0)
    expect(A.applyIntent(s2, 1, 0)).toBe(s2) // cell 0 already taken
    expect(A.applyIntent(s, 0, 99)).toBe(s)  // out of range
  })

  it('tickKey changes on every move', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, 0)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })
})

describe('tic-tac-toe netplay session (host + guest over in-memory transport)', () => {
  it('host + guest stay in sync', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1) // host is seat 0 (X), guest gets seat 1 (O)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (X, seat 0) plays the center; view syncs to the guest
    host.dispatchLocal(4)
    expect(host.getFull().board[4]).toBe('x')
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[4]).toBe('x')

    // guest (O, seat 1) replies; intent travels host-ward and applies
    guest.dispatch(0)
    expect(host.getFull().board[0]).toBe('o')
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().board[0]).toBe('o')
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    // it's X's (host) turn, but the guest tries to move
    guest.dispatch(0)
    expect(host.getFull().board.every(c => c == null)).toBe(true)
  })
})
