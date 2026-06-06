import { describe, it, expect } from 'vitest'
import { penteAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('pente net adapter', () => {
  it('starts with Black (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { cell: 6 * 13 + 6 })
    expect(s2).not.toBe(s)
    expect(s2.board[6 * 13 + 6]).toBe('b')
    expect(A.seatToMove(s2)).toBe(1) // now White's (seat 1) turn
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    // seat 1 (White) cannot move first
    expect(A.applyIntent(s, 1, { cell: 6 * 13 + 6 })).toBe(s)
  })

  it('ignores an illegal intent on an occupied cell (returns same state)', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { cell: 6 * 13 + 6 })
    expect(A.seatToMove(s2)).toBe(1)
    // seat 1 tries to play on the just-occupied cell -> rejected, same ref
    expect(A.applyIntent(s2, 1, { cell: 6 * 13 + 6 })).toBe(s2)
  })

  it('aiStep advances seat 1 (White) and changes the tickKey', () => {
    // AI = seat 1 (White); make a Black move so it is White's turn, then let the AI reply.
    let s = A.applyIntent(A.makeGame(), 0, { cell: 6 * 13 + 6 })
    expect(A.seatToMove(s)).toBe(1)
    const k0 = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.seatToMove(s)).toBe(0) // back to Black
    expect(A.tickKey(s)).not.toBe(k0)
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('pente netplay session (host + guest over in-memory transport)', () => {
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
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(169)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Black, seat 0) plays first
    host.dispatchLocal({ cell: 6 * 13 + 6 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now White's (guest's) turn, view synced
    expect(guest.getState().board[6 * 13 + 6]).toBe('b')

    // guest (White, seat 1) replies; intent travels host-ward and applies
    guest.dispatch({ cell: 6 * 13 + 7 })
    expect(host.getFull().board[6 * 13 + 7]).toBe('w')
    expect(host.getFull().turn).toBe('b') // back to Black
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().board.filter(Boolean).length
    // it's Black's (host) turn, but the guest tries to move
    guest.dispatch({ cell: 6 * 13 + 6 })
    expect(host.getFull().board.filter(Boolean).length).toBe(before) // unchanged
  })
})
