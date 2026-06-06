import { describe, it, expect } from 'vitest'
import { connectFourAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('connect_four net adapter', () => {
  it('starts with Red (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { col: 3 })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 1, { col: 3 })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { col: 99 })).toBe(s)
  })

  it('aiStep advances and tickKey changes every move', () => {
    let s = A.makeGame()
    const k0 = A.tickKey(s)
    s = A.applyIntent(s, 0, { col: 0 })
    expect(A.tickKey(s)).not.toBe(k0)
    const k1 = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(k1)
  })
})

describe('connect_four netplay (host + guest over in-memory transport)', () => {
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
  })

  it('relays a host move to the guest and a guest reply back to the host', () => {
    const { host, guest } = connect()
    // host (Red, seat 0) drops first
    host.dispatchLocal({ col: 3 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[5 * 7 + 3]).toBe('r') // synced: lowest slot of col 3

    // guest (Yellow, seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().board.filter(Boolean).length
    guest.dispatch({ col: 4 })
    expect(host.getFull().board.filter(Boolean).length).toBe(before + 1)
    expect(host.getFull().turn).toBe('r') // back to Red (host)
    expect(host.isMyTurn()).toBe(true)
  })
})
