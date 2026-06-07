import { describe, it, expect } from 'vitest'
import { quixoAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as Q from './logic'

describe('quixo net adapter', () => {
  it('starts with X (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal slide and passes the turn', () => {
    const s = A.makeGame()
    const m = Q.legalMoves(s)[0]
    const s2 = A.applyIntent(s, 0, { cell: m.cell, dir: m.dir })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const m = Q.legalMoves(s)[0]
    expect(A.applyIntent(s, 1, { cell: m.cell, dir: m.dir })).toBe(s)
  })

  it('ignores an illegal intent (returns same ref)', () => {
    const s = A.makeGame()
    // cell 12 is the center (not on the border) -> illegal to take
    expect(A.applyIntent(s, 0, { cell: 12, dir: 'up' })).toBe(s)
  })

  it('aiStep plays the AI seat (1) and the tickKey changes every move', () => {
    // quixo's aiTurn plays only for the 'ai' side (seat 1), so drive seat 0 via a human
    // intent and seat 1 via aiStep, exactly as the session does for an unfilled seat.
    let s = A.makeGame()
    for (let i = 0; i < 4 && !A.isOver(s); i++) {
      const before = A.tickKey(s)
      const seat = A.seatToMove(s)!
      if (seat === 1) {
        s = A.aiStep(s, seat)
      } else {
        const m = Q.legalMoves(s)[0]
        s = A.applyIntent(s, 0, { cell: m.cell, dir: m.dir })
      }
      expect(A.tickKey(s)).not.toBe(before) // every transition re-arms the AI timer
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('quixo netplay session (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and keeps host + guest in sync', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (X, seat 0) makes a legal slide
    const m0 = Q.legalMoves(host.getFull())[0]
    host.dispatchLocal({ cell: m0.cell, dir: m0.dir })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's turn, view synced

    // guest (O, seat 1) replies; intent travels host-ward and applies
    const beforeLen = host.getFull().log.length
    const m1 = Q.legalMoves(guest.getState())[0]
    guest.dispatch({ cell: m1.cell, dir: m1.dir })
    expect(host.getFull().log.length).toBe(beforeLen + 1)
    expect(host.isMyTurn()).toBe(true) // back to seat 0
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
  })
})
