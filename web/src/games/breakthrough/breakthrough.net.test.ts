/* Browser-free integration test of breakthrough's netplay path: adapter round-trip plus
 * a HostSession + GuestSession wired through an in-memory transport pair. */

import { describe, it, expect } from 'vitest'
import { breakthroughAdapter as A, type BreakthroughIntent } from './net'
import * as BT from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('breakthrough net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = BT.legalMoves(s.board, 'w')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1) // now Black's turn
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const m = BT.legalMoves(s.board, 'w')[0]
    // seat 1 (Black) tries to move while it is White's turn
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same ref)', () => {
    const s = A.makeGame()
    // White pawn at row 6 cannot leap to row 0
    expect(A.applyIntent(s, 0, { from: 6 * 8, to: 0 })).toBe(s)
  })

  it('aiStep advances the Black (AI) seat', () => {
    // aiMove plays for Black, the AI side. Get White out of the way first.
    let s = A.makeGame()
    const m = BT.legalMoves(s.board, 'w')[0]
    s = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(A.seatToMove(s)).toBe(1) // Black to move
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before) // AI made a move
    expect(A.seatToMove(s)).toBe(0) // back to White
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('breakthrough netplay session (host + guest over in-memory transport)', () => {
  it('assigns the guest the open seat and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.mySeat()).toBe(1) // host is seat 0 (White), guest gets seat 1 (Black)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(64)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (White, seat 0) moves first
    const m0 = BT.legalMoves(host.getFull().board, 'w')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to } as BreakthroughIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Black's (guest's) turn, view synced
    expect(guest.getState().turn).toBe('b')

    // guest (Black, seat 1) replies; intent travels host-ward and applies
    const m1 = BT.legalMoves(guest.getState().board, 'b')[0]
    guest.dispatch({ from: m1.from, to: m1.to } as BreakthroughIntent)
    expect(host.getFull().turn).toBe('w') // back to White
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().board.join('')).toBe(host.getFull().board.join(''))
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().board.join('')
    // it is White's (host) turn, but the guest tries to move a Black pawn
    const m = BT.legalMoves(host.getFull().board, 'b')[0]
    guest.dispatch({ from: m.from, to: m.to } as BreakthroughIntent)
    expect(host.getFull().board.join('')).toBe(before) // rejected, nothing changed
  })
})
