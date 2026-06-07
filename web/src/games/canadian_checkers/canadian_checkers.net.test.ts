import { describe, it, expect } from 'vitest'
import { canadianCheckersAdapter as A } from './net'
import * as CC from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('canadian_checkers net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = CC.legalMoves(s)[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const m = CC.legalMoves(s)[0]
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { from: 0, to: 143 })).toBe(s)
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

describe('canadian_checkers net session (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(144)
  })

  it('relays moves both directions and stays in sync', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    // host (seat 0) moves first
    const m0 = CC.legalMoves(host.getFull())[0]
    host.dispatchLocal({ from: m0.from, to: m0.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const m1 = CC.legalMoves(guest.getState())[0]
    guest.dispatch({ from: m1.from, to: m1.to })
    expect(host.getFull().turn).toBe(0)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })
})
