import { describe, it, expect } from 'vitest'
import { wariAdapter as A } from './net'
import * as W from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('wari net adapter', () => {
  it('starts with you (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal sow and passes the turn', () => {
    const s = A.makeGame()
    const from = W.legalMoves(s.pits, 'you')[0]
    const s2 = A.applyIntent(s, 0, from)
    expect(s2).not.toBe(s)
    expect(s2.moveCount).toBe(s.moveCount + 1)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const from = W.legalMoves(s.pits, 'ai')[0] // a real AI pit, but it's seat 0's turn
    expect(A.applyIntent(s, 1, from)).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // pit 6 belongs to the AI; seat 0 cannot sow it
    expect(A.applyIntent(s, 0, 6)).toBe(s)
    // empty-pit sow after we hollow out pit 0 by a legal move is not directly testable
    // here, but an out-of-range index is also illegal and unchanged.
    expect(A.applyIntent(s, 0, 99)).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      s = seat === 0 ? A.applyIntent(s, 0, W.legalMoves(s.pits, 'you')[0]) : A.aiStep(s, seat)
      const now = A.seatToMove(s)
      if (now != null) { expect(now).not.toBe(last); last = now }
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('wari netplay (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().pits.length).toBe(12)
  })

  it('relays host + guest sows and stays in sync', () => {
    const { host, guest } = connect()
    // host (seat 0 = 'you') moves first
    const m0 = W.legalMoves(host.getFull().pits, 'you')[0]
    host.dispatchLocal(m0)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe('ai')

    // guest (seat 1 = 'ai') replies
    const m1 = W.legalMoves(guest.getState().pits, 'ai')[0]
    guest.dispatch(m1)
    expect(host.getFull().turn).toBe('you')
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().moveCount).toBe(host.getFull().moveCount)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().moveCount
    // it's seat 0's (host) turn, but the guest tries to move
    const m = W.legalMoves(host.getFull().pits, 'ai')[0]
    guest.dispatch(m)
    expect(host.getFull().moveCount).toBe(before)
  })
})
