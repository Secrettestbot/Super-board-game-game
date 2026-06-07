/* Browser-free integration test of the netplay path for Chinese Checkers: the
 * adapter round-trip, plus a HostSession + GuestSession wired through an in-memory
 * transport pair playing real moves. This is the multi-seat validation case. */

import { describe, it, expect } from 'vitest'
import { chineseCheckersAdapter as A, type ChineseCheckersIntent } from './net'
import * as CC from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('chinese_checkers net adapter', () => {
  it('starts with player 0 (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = CC.legalMoves(s, 0)[0]
    const s2 = A.applyIntent(s, 0, { path: m })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    expect(s2.last).toEqual(m)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const m = CC.legalMoves(s, 0)[0]
    // seat 1 cannot move while it is seat 0's turn
    expect(A.applyIntent(s, 1, { path: m })).toBe(s)
  })

  it('ignores an illegal intent (returns same ref)', () => {
    const s = A.makeGame()
    // a path that is not in the legal set (empty/from-empty/from-foe)
    expect(A.applyIntent(s, 0, { path: [0, 1] })).toBe(s)
    expect(A.applyIntent(s, 0, { path: [] })).toBe(s)
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

describe('chinese_checkers host + guest over in-memory transport', () => {
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
    expect(guest.getState().board.length).toBe(CC.HOLE_COUNT)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()

    // host (seat 0) plays a legal move
    const m0 = CC.legalMoves(host.getFull(), 0)[0]
    host.dispatchLocal({ path: m0 } as ChineseCheckersIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's turn, view synced
    expect(guest.getState().turn).toBe(1)

    // guest (seat 1) replies; intent travels host-ward and applies
    const m1 = CC.legalMoves(guest.getState(), 1)[0]
    guest.dispatch({ path: m1 } as ChineseCheckersIntent)
    expect(host.getFull().turn).toBe(0) // back to seat 0
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('host ignores an out-of-turn guest intent', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it is seat 0's (host) turn, but the guest tries to move its own pegs
    const m = CC.legalMoves(host.getFull(), 1)[0]
    guest.dispatch({ path: m } as ChineseCheckersIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
