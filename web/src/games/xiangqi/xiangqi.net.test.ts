import { describe, it, expect } from 'vitest'
import { xiangqiAdapter as A, type XiangqiIntent } from './net'
import * as XQ from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('xiangqi net adapter', () => {
  it('starts with Red (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = XQ.legalMoves(s.board, 'r')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const m = XQ.legalMoves(s.board, 'r')[0]
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // a Red piece moving onto its own piece is never legal
    const illegal: XiangqiIntent = { from: XQ.id(9, 0), to: XQ.id(9, 1) }
    expect(A.applyIntent(s, 0, illegal)).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      s = seat === 0
        ? A.applyIntent(s, 0, pick(s))
        : A.aiStep(s, seat)
      const now = A.seatToMove(s)
      if (now != null) { expect(now).not.toBe(last); last = now }
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

function pick(s: XQ.XiangqiState): XiangqiIntent {
  const m = XQ.legalMoves(s.board, s.turn!)[0]
  return { from: m.from, to: m.to }
}

describe('xiangqi netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().board.length).toBe(XQ.W * XQ.H)
  })

  it('relays guest intents to the host and broadcasts the new view back', () => {
    const { host, guest } = connect()
    // host (Red, seat 0) moves first
    const m0 = XQ.legalMoves(host.getFull().board, 'r')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (Black, seat 1) replies; intent travels host-ward and applies
    const m1 = XQ.legalMoves(guest.getState().board, 'b')[0]
    guest.dispatch({ from: m1.from, to: m1.to })
    expect(host.getFull().turn).toBe('r') // back to Red
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().moveNo).toBe(host.getFull().moveNo)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().moveNo
    const m = XQ.legalMoves(host.getFull().board, 'r')[0]
    guest.dispatch({ from: m.from, to: m.to })
    expect(host.getFull().moveNo).toBe(before)
  })
})
