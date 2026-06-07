import { describe, it, expect } from 'vitest'
import { havannahAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('havannah net adapter', () => {
  it('starts with Ember (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const cell = s.cells[0]
    const s2 = A.applyIntent(s, 0, { cell })
    expect(s2).not.toBe(s)
    expect(s2.board[cell]).toBe(0)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    // seat 1 tries to move on seat 0's turn
    expect(A.applyIntent(s, 1, { cell: s.cells[0] })).toBe(s)
  })

  it('ignores an illegal (occupied) intent (returns same state)', () => {
    const s = A.makeGame()
    const cell = s.cells[0]
    const s2 = A.applyIntent(s, 0, { cell }) // now seat 1's turn, cell occupied
    // seat 1 plays onto the occupied cell -> no-op (same ref)
    expect(A.applyIntent(s2, 1, { cell })).toBe(s2)
  })

  it('ignores an off-board intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { cell: '999,999' })).toBe(s)
  })

  it('tickKey changes on every move', () => {
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const s1 = A.applyIntent(s, 0, { cell: s.cells[0] })
    const k1 = A.tickKey(s1)
    const s2 = A.applyIntent(s1, 1, { cell: s.cells[1] })
    const k2 = A.tickKey(s2)
    expect(k1).not.toBe(k0)
    expect(k2).not.toBe(k1)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      s = A.aiStep(s, seat)
      const now = A.seatToMove(s)
      if (now != null) { expect(now).not.toBe(last); last = now }
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('havannah net session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().cells.length).toBe(host.getFull().cells.length)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Ember, seat 0) moves first
    const c0 = host.getFull().cells[0]
    host.dispatchLocal({ cell: c0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[c0]).toBe(0)

    // guest (Frost, seat 1) replies
    const c1 = guest.getState().cells[1]
    guest.dispatch({ cell: c1 })
    expect(host.getFull().board[c1]).toBe(1)
    expect(host.getFull().turn).toBe(0)
    expect(host.isMyTurn()).toBe(true)
  })

  it('host rejects an out-of-turn guest intent', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it's seat 0's (host) turn; guest tries to play
    guest.dispatch({ cell: host.getFull().cells[0] })
    expect(A.tickKey(host.getFull())).toBe(before)
  })
})
