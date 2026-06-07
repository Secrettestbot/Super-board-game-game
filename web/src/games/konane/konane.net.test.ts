import { describe, it, expect } from 'vitest'
import { konaneAdapter as A } from './net'
import type { KonaneIntent } from './net'
import * as KO from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('konane net adapter', () => {
  it('starts with Black (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal opening removal and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const rem = KO.openingRemovals(s, 'b')[0]
    const s2 = A.applyIntent(s, 0, { from: rem, path: [] })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    expect(s2.phase).toBe('open2')
  })

  it('round-trips a legal capturing jump in the play phase', () => {
    // advance both openings via the adapter, then make a seat-0 jump
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { from: KO.openingRemovals(s, 'b')[0], path: [] })
    s = A.applyIntent(s, 1, { from: KO.openingRemovals(s, 'w')[0], path: [] })
    expect(s.phase).toBe('play')
    expect(A.seatToMove(s)).toBe(0)
    const jump = KO.legalMoves(s.board, 'b')[0]
    const before = s
    const s2 = A.applyIntent(s, 0, { from: jump.from, path: jump.path })
    expect(s2).not.toBe(before)
    expect(A.seatToMove(s2)).toBe(1) // turn passed (game not over)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const rem = KO.openingRemovals(s, 'b')[0]
    // seat 1 has no business moving on turn 0
    expect(A.applyIntent(s, 1, { from: rem, path: [] })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // a non-removal opening square / nonsense path
    expect(A.applyIntent(s, 0, { from: 0, path: [42, 7] })).toBe(s)
    // an off-board / non-enumerated jump still rejected
    expect(A.applyIntent(s, 0, { from: 999, path: [] } as KonaneIntent)).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      // adapter aiStep plays for white; drive seat-0 manually when it's our turn
      s = seat === 1 ? A.aiStep(s, seat) : A.applyIntent(s, 0, firstIntent(s))
      const now = A.seatToMove(s)
      if (now != null) { expect(now).not.toBe(last); last = now }
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

function firstIntent(s: KO.KonaneState): KonaneIntent {
  if (s.phase === 'open1' || s.phase === 'open2') {
    return { from: KO.openingRemovals(s, 'b')[0], path: [] }
  }
  const m = KO.legalMoves(s.board, 'b')[0]
  return { from: m.from, path: m.path }
}

describe('konane net session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().board.length).toBe(64)
  })

  it('relays intents both directions and stays in sync', () => {
    const { host, guest } = connect()
    // host (Black, seat 0) opens
    host.dispatchLocal({ from: KO.openingRemovals(host.getFull(), 'b')[0], path: [] })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().phase).toBe('open2')

    // guest (White, seat 1) opens; intent travels host-ward and applies
    const wRem = KO.openingRemovals(guest.getState(), 'w')[0]
    guest.dispatch({ from: wRem, path: [] })
    expect(host.getFull().phase).toBe('play')
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().phase).toBe('play')
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().phase
    // it is seat 0's (host) turn, but the guest tries to remove
    guest.dispatch({ from: KO.openingRemovals(host.getFull(), 'b')[0], path: [] })
    expect(host.getFull().phase).toBe(before)
  })
})
