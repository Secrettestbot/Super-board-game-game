import { describe, it, expect } from 'vitest'
import { twixtAdapter as A, type TwixtIntent } from './net'
import * as TW from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('twixt net adapter', () => {
  it('starts with You (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const cell = TW.legalHoles(s, 0)[0]
    const s2 = A.applyIntent(s, 0, { cell })
    expect(s2).not.toBe(s)
    expect(s2.pegs[cell]).toBe(0)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const cell = TW.legalHoles(s, 1)[0]
    // seat 1 tries to move while it is seat 0's turn
    expect(A.applyIntent(s, 1, { cell })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // corner hole 0 is never placeable
    expect(A.applyIntent(s, 0, { cell: 0 })).toBe(s)
    // a side column is illegal for seat 0
    const sideCol = TW.idx(3, 0)
    expect(A.applyIntent(s, 0, { cell: sideCol })).toBe(s)
  })
})

describe('twixt netplay (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().pegs.length).toBe(TW.N * TW.N)
  })

  it('relays intents both ways and stays in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) drops a peg
    const c0 = TW.legalHoles(host.getFull(), 0)[0]
    host.dispatchLocal({ cell: c0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().pegs[c0]).toBe(0)

    // guest (seat 1) replies; intent travels host-ward and applies
    const c1 = TW.legalHoles(guest.getState(), 1)[0]
    guest.dispatch({ cell: c1 })
    expect(host.getFull().pegs[c1]).toBe(1)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull()
    const cell = TW.legalHoles(before, 1)[0]
    guest.dispatch({ cell } as TwixtIntent) // not the guest's turn yet
    expect(host.getFull()).toBe(before)
  })
})
