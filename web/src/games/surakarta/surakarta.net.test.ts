import { describe, it, expect } from 'vitest'
import { surakartaAdapter as A } from './net'
import type { SurakartaIntent } from './net'
import * as SK from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('surakarta net adapter', () => {
  it('starts with Red (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = SK.allMoves(s.board, 'r')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    const m = SK.allMoves(s.board, 'b')[0] // a black move, but it is Red's turn
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // from an empty middle point to another empty point: not a legal move
    expect(A.applyIntent(s, 0, { from: SK.idx(2, 2), to: SK.idx(3, 3) })).toBe(s)
    // a red piece, but a non-reachable target
    const red = s.board.findIndex(v => v === 'r')
    expect(A.applyIntent(s, 0, { from: red, to: red })).toBe(s)
  })
})

describe('surakarta host + guest over an in-memory transport', () => {
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
    expect(guest.getState().board.length).toBe(36)
  })

  it('relays moves both directions and stays in sync', () => {
    const { host, guest } = connect()
    // host (Red, seat 0) moves first
    const m0 = SK.allMoves(host.getFull().board, 'r')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe('b')

    // guest (Black, seat 1) replies; intent travels host-ward and applies
    const m1 = SK.allMoves(guest.getState().board, 'b')[0]
    guest.dispatch({ from: m1.from, to: m1.to } as SurakartaIntent)
    expect(host.getFull().turn).toBe('r')
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = A.tickKey(host.getFull())
    // it is Red's (host) turn, but the guest tries to move a black piece
    const m = SK.allMoves(host.getFull().board, 'b')[0]
    guest.dispatch({ from: m.from, to: m.to } as SurakartaIntent)
    expect(A.tickKey(host.getFull())).toBe(before)
  })
})
