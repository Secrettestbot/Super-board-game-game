/* Browser-free integration test of mijnlieff online play: adapter round-trip plus a
 * HostSession + GuestSession wired through an in-memory transport, exchanging real moves. */

import { describe, it, expect } from 'vitest'
import { mijnlieffAdapter as A } from './net'
import * as M from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('mijnlieff net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal placement and passes the turn', () => {
    const s = A.makeGame()
    const cell = M.legalPlacements(s)[0]
    const s2 = A.applyIntent(s, 0, { pieceType: 'straight', cell })
    expect(s2).not.toBe(s)
    expect(s2.board[cell]).toEqual({ owner: 0, type: 'straight' })
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const cell = M.legalPlacements(s)[0]
    expect(A.applyIntent(s, 1, { pieceType: 'straight', cell })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // a centre cell is banned on the opening move -> illegal
    const banned = M.idx(1, 1)
    expect(M.legalPlacements(s)).not.toContain(banned)
    expect(A.applyIntent(s, 0, { pieceType: 'straight', cell: banned })).toBe(s)
  })

  it('aiStep advances the game', () => {
    let s = A.makeGame()
    const before = A.tickKey(s)
    s = A.aiStep(s, A.seatToMove(s)!)
    expect(A.tickKey(s)).not.toBe(before)
  })
})

describe('mijnlieff netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().board.length).toBe(M.SIZE)
  })

  it('relays moves both directions and stays in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) places first
    const c0 = M.legalPlacements(host.getFull())[0]
    host.dispatchLocal({ pieceType: 'straight', cell: c0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[c0]).toEqual({ owner: 0, type: 'straight' })

    // guest (seat 1) replies; intent travels host-ward and applies
    const gState = guest.getState()
    const c1 = M.legalPlacements(gState)[0]
    const t1 = M.TYPES.find(t => gState.hands[1][t] > 0)!
    guest.dispatch({ pieceType: t1, cell: c1 })
    expect(host.getFull().board[c1]).toEqual({ owner: 1, type: t1 })
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().board[c1]).toEqual(host.getFull().board[c1])
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().board.filter(Boolean).length
    // it's seat 0's (host) turn, but the guest tries to move
    const c = M.legalPlacements(host.getFull())[0]
    guest.dispatch({ pieceType: 'straight', cell: c })
    expect(host.getFull().board.filter(Boolean).length).toBe(before)
  })
})
