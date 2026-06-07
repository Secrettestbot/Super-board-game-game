import { describe, it, expect } from 'vitest'
import { abaloneAdapter as A, type AbaloneIntent } from './net'
import * as AB from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('abalone net adapter', () => {
  it('starts with Black (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal push and advances the turn', () => {
    const s = A.makeGame()
    const m = AB.legalMoves(s.board, 'b')[0]
    const s2 = A.applyIntent(s, 0, { cells: m.cells, dir: m.dir })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1) // now White's turn
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const m = AB.legalMoves(s.board, 'w')[0]
    expect(A.applyIntent(s, 1, { cells: m.cells, dir: m.dir })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // a Black group can't push off its own edge / into its own marbles in every dir;
    // pick a clearly illegal move: empty cell list.
    expect(A.applyIntent(s, 0, { cells: [], dir: 0 })).toBe(s)
    // also a marble that isn't the seat's own
    const white = Object.keys(s.board).find(k => s.board[k] === 'w')!
    expect(A.applyIntent(s, 0, { cells: [white], dir: 0 })).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      s = A.aiStep(s, seat) // aiMove only acts for White; black turns will no-op
      if (seat === 1) {
        const now = A.seatToMove(s)
        if (now != null) { expect(now).not.toBe(last); last = now }
      } else {
        // advance black manually so the AI gets a turn
        const mv = AB.legalMoves(s.board, 'b')[0]
        s = A.applyIntent(s, 0, { cells: mv.cells, dir: mv.dir })
        last = A.seatToMove(s)
      }
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('abalone netplay session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(Object.keys(guest.getState().board).length).toBe(Object.keys(host.getFull().board).length)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Black, seat 0) moves first
    const m0 = AB.legalMoves(host.getFull().board, 'b')[0]
    host.dispatchLocal({ cells: m0.cells, dir: m0.dir })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now White's (guest's) turn

    // guest (White, seat 1) replies; intent travels host-ward and applies
    const m1 = AB.legalMoves(guest.getState().board, 'w')[0]
    guest.dispatch({ cells: m1.cells, dir: m1.dir } as AbaloneIntent)
    expect(host.getFull().turn).toBe('b') // back to Black
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().turn
    const m = AB.legalMoves(host.getFull().board, 'w')[0]
    guest.dispatch({ cells: m.cells, dir: m.dir } as AbaloneIntent)
    expect(host.getFull().turn).toBe(before) // rejected, nothing changed
  })
})
