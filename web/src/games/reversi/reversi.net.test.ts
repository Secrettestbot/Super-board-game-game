import { describe, it, expect } from 'vitest'
import { reversiAdapter as A, type ReversiIntent } from './net'
import * as RV from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('reversi net adapter', () => {
  it('starts with Black (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const cell = RV.legalMoves(s.board, 'b')[0]
    const s2 = A.applyIntent(s, 0, { cell })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const cell = RV.legalMoves(s.board, 'b')[0]
    expect(A.applyIntent(s, 1, { cell })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // a corner is never a legal opening move
    expect(A.applyIntent(s, 0, { cell: 0 })).toBe(s)
  })

  it('aiStep advances for the White seat and changes the tickKey', () => {
    let s = A.makeGame()
    const c = RV.legalMoves(s.board, 'b')[0]
    s = A.applyIntent(s, 0, { cell: c }) // now seat 1 (White) to move
    expect(A.seatToMove(s)).toBe(1)
    const k = A.tickKey(s)
    const s2 = A.aiStep(s, 1)
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(k)
  })
})

describe('reversi netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().board.length).toBe(64)
  })

  it('relays a host move then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (Black, seat 0) moves first
    const c0 = RV.legalMoves(host.getFull().board, 'b')[0]
    host.dispatchLocal({ cell: c0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now White's (guest's) turn, view synced

    // guest (White, seat 1) replies; intent travels host-ward and applies
    const c1 = RV.legalMoves(guest.getState().board, 'w')[0]
    guest.dispatch({ cell: c1 })
    expect(host.getFull().turn).toBe('b') // back to Black (no pass in the opening)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().last).toBe(host.getFull().last)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it's Black's (host) turn, but the guest tries to move
    const c = RV.legalMoves(host.getFull().board, 'b')[0]
    guest.dispatch({ cell: c } as ReversiIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
