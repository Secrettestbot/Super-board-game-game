import { describe, it, expect } from 'vitest'
import { quoridorAdapter as A } from './net'
import type { QuoridorIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('quoridor net adapter', () => {
  it('starts with the bottom pawn (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal pawn move and passes the turn', () => {
    const s = A.makeGame()
    // bottom pawn starts at (8,4); a legal step is up to (7,4)
    const s2 = A.applyIntent(s, 0, { kind: 'move', r: 7, c: 4 })
    expect(s2).not.toBe(s)
    expect(s2.pawns.you).toEqual({ r: 7, c: 4 })
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('applies a legal wall placement and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { kind: 'wall', r: 4, c: 4, o: 'h' })
    expect(s2).not.toBe(s)
    expect(s2.walls).toHaveLength(1)
    expect(s2.left.you).toBe(9)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    // seat 1 cannot move while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'move', r: 1, c: 4 })).toBe(s)
    expect(A.applyIntent(s, 1, { kind: 'wall', r: 4, c: 4, o: 'h' })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // not a neighbour of (8,4)
    expect(A.applyIntent(s, 0, { kind: 'move', r: 0, c: 0 })).toBe(s)
    // out-of-bounds wall slot
    expect(A.applyIntent(s, 0, { kind: 'wall', r: -1, c: 0, o: 'h' })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'wall', r: 0, c: 8, o: 'h' })).toBe(s)
  })

  it('aiStep advances the AI seat (seat 1)', () => {
    // Move seat 0 first so it becomes the AI seat's (seat 1) turn.
    let s = A.applyIntent(A.makeGame(), 0, { kind: 'move', r: 7, c: 4 })
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before)
    // after the AI plays, control returns to seat 0 (or the game ended)
    expect([0, null]).toContain(A.seatToMove(s))
  })

  it('tickKey changes on every transition', () => {
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const s1 = A.applyIntent(s, 0, { kind: 'move', r: 7, c: 4 })
    const k1 = A.tickKey(s1)
    expect(k1).not.toBe(k0)
    const s2 = A.applyIntent(s1, 1, { kind: 'move', r: 1, c: 4 })
    expect(A.tickKey(s2)).not.toBe(k1)
  })
})

describe('quoridor netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().pawns.ai).toEqual({ r: 0, c: 4 })
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0, bottom pawn) moves up
    host.dispatchLocal({ kind: 'move', r: 7, c: 4 } as QuoridorIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().pawns.you).toEqual({ r: 7, c: 4 })

    // guest (seat 1, top pawn) replies; intent travels host-ward and applies
    guest.dispatch({ kind: 'move', r: 1, c: 4 } as QuoridorIntent)
    expect(host.getFull().pawns.ai).toEqual({ r: 1, c: 4 })
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().pawns.ai).toEqual({ r: 1, c: 4 })
  })

  it('host placing a wall syncs to the guest', () => {
    const { host, guest } = connect()
    host.dispatchLocal({ kind: 'wall', r: 4, c: 4, o: 'h' } as QuoridorIntent)
    expect(host.getFull().walls).toHaveLength(1)
    expect(guest.getState().walls).toHaveLength(1)
    expect(guest.getState().left.you).toBe(9)
    expect(guest.isMyTurn()).toBe(true)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().pawns.ai
    // it is the host's (seat 0) turn, but the guest tries to move
    guest.dispatch({ kind: 'move', r: 1, c: 4 } as QuoridorIntent)
    expect(host.getFull().pawns.ai).toEqual(before)
  })
})
