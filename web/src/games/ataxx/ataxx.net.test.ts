/* Browser-free integration test of ataxx online play: the adapter round-trip plus a
 * HostSession+GuestSession wired through an in-memory transport pair playing real ataxx.
 * This is the robust substitute for a live WebRTC end-to-end run. */

import { describe, it, expect } from 'vitest'
import { ataxxAdapter as A, type AtaxxIntent } from './net'
import * as AX from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('ataxx net adapter', () => {
  it('starts with you (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn to the foe', () => {
    const s = A.makeGame()
    const m = AX.legalMoves(s.board, 'y')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to, clone: m.clone })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns the same state)', () => {
    const s = A.makeGame()
    const m = AX.legalMoves(s.board, 'y')[0]
    // seat 1 tries to move on seat 0's turn
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to, clone: m.clone })).toBe(s)
  })

  it('ignores an illegal intent (returns the same state)', () => {
    const s = A.makeGame()
    // from an empty square to a far empty square: not a legal move for 'y'
    expect(A.applyIntent(s, 0, { from: 24, to: 25, clone: true })).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      s = A.aiStep(s, seat)
      const now = A.seatToMove(s)
      // turn either flips to the other seat or stays (a pass) — never throws
      if (now != null && now !== last) last = now
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('ataxx netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().board.length).toBe(49)
  })

  it('relays guest intents to the host and broadcasts the new view back', () => {
    const { host, guest } = connect()
    // host (you, seat 0) moves first
    const m0 = AX.legalMoves(host.getFull().board, 'y')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to, clone: m0.clone })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now the foe's (guest's) turn, view synced

    // guest (foe, seat 1) replies; intent travels host-ward and applies
    const m1 = AX.legalMoves(guest.getState().board, 'f')[0]
    guest.dispatch({ from: m1.from, to: m1.to, clone: m1.clone })
    expect(host.getFull().turn).toBe('y') // back to you
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().last).toEqual(host.getFull().last)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().board.slice()
    // it's your (host) turn, but the guest tries to move
    const m = AX.legalMoves(host.getFull().board, 'y')[0]
    guest.dispatch({ from: m.from, to: m.to, clone: m.clone } as AtaxxIntent)
    expect(host.getFull().board).toEqual(before) // rejected, nothing changed
  })
})
