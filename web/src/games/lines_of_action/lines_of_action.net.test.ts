/* LINES OF ACTION — netplay tests. Adapter round-trip (legal advances, out-of-turn
   & illegal return the same ref) + a host/guest sync over an in-memory transport. */

import { describe, it, expect } from 'vitest'
import { linesOfActionAdapter as A } from './net'
import * as LOA from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('lines_of_action net adapter', () => {
  it('starts with Black (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = LOA.legalMoves(s.board, 'b')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const m = LOA.legalMoves(s.board, 'b')[0]
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // from an empty corner to a far square — never legal
    expect(A.applyIntent(s, 0, { from: LOA.idx(0, 0), to: LOA.idx(7, 7) })).toBe(s)
    // from one of seat 0's own pieces but to a non-reachable square
    const own = LOA.legalMoves(s.board, 'b')[0].from
    expect(A.applyIntent(s, 0, { from: own, to: own })).toBe(s)
  })

  it('aiStep drives the White seat and the tickKey changes every move', () => {
    // The AI side is White (seat 1); seat 0 (Black) is the human. We advance Black
    // with a legal intent, then let aiStep play White, checking tickKey moves each ply.
    let s = A.makeGame()
    let key = A.tickKey(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      if (seat === 0) {
        const m = LOA.legalMoves(s.board, 'b')[0]
        s = A.applyIntent(s, 0, { from: m.from, to: m.to })
      } else {
        s = A.aiStep(s, seat)
      }
      const nk = A.tickKey(s)
      expect(nk).not.toBe(key)
      key = nk
    }
  })
})

describe('lines_of_action host + guest sync (in-memory transport)', () => {
  it('assigns the guest seat 1 and stays in sync across moves', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(64)

    // host (Black, seat 0) plays a legal move
    const m0 = LOA.legalMoves(host.getFull().board, 'b')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now White's (guest's) turn, view synced

    // guest (White, seat 1) replies; intent travels host-ward and applies
    const m1 = LOA.legalMoves(guest.getState().board, 'w')[0]
    guest.dispatch({ from: m1.from, to: m1.to })
    expect(host.getFull().turn).toBe('b') // back to Black
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const before = host.getFull().log.length
    // it's Black's (host) turn, but the guest tries to move
    const m = LOA.legalMoves(host.getFull().board, 'w')[0]
    guest.dispatch({ from: m.from, to: m.to })
    expect(host.getFull().log.length).toBe(before) // rejected, nothing changed
  })
})
