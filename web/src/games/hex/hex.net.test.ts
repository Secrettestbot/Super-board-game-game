import { describe, it, expect } from 'vitest'
import { hexAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as HX from './logic'

describe('hex net adapter', () => {
  it('starts with You (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const cell = HX.idx(5, 5)
    const s2 = A.applyIntent(s, 0, { cell })
    expect(s2).not.toBe(s)
    expect(s2.board[cell]).toBe('y')
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 1, { cell: HX.idx(5, 5) })).toBe(s)
  })

  it('ignores an illegal (occupied) intent (returns same state)', () => {
    const s = A.makeGame()
    const cell = HX.idx(5, 5)
    const s2 = A.applyIntent(s, 0, { cell }) // seat 0 plays
    const s3 = A.aiStep(s2, 1)               // seat 1 (AI) replies -> seat 0 again
    // seat 0 tries to play on its own occupied cell -> rejected, same ref
    expect(A.applyIntent(s3, 0, { cell })).toBe(s3)
    // out-of-range cell -> rejected
    expect(A.applyIntent(s3, 0, { cell: -1 })).toBe(s3)
    expect(A.applyIntent(s3, 0, { cell: HX.N * HX.N })).toBe(s3)
  })

  it('aiStep advances the AI (slate) seat and changes tickKey', () => {
    // hex's aiMove only plays slate ('s', seat 1) — the only seat the session ever
    // hands to the AI in solo play. Seat 0 makes a move first, then the AI replies.
    let s = A.applyIntent(A.makeGame(), 0, { cell: HX.idx(5, 5) })
    expect(A.seatToMove(s)).toBe(1)
    const k0 = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.seatToMove(s)).toBe(0)        // AI played, turn back to seat 0
    expect(A.tickKey(s)).not.toBe(k0)      // tickKey changed -> re-arms the timer
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('hex netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().board.length).toBe(HX.N * HX.N)
  })

  it('relays a host move then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (You, seat 0) places first
    const c0 = HX.idx(5, 5)
    host.dispatchLocal({ cell: c0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Slate's (guest's) turn, view synced
    expect(guest.getState().board[c0]).toBe('y')

    // guest (Slate, seat 1) replies; intent travels host-ward and applies
    const c1 = HX.idx(2, 2)
    guest.dispatch({ cell: c1 })
    expect(host.getFull().board[c1]).toBe('s')
    expect(host.getFull().turn).toBe('y') // back to You
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().last).toBe(host.getFull().last)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().board.filter(Boolean).length
    // it's You's (host) turn, but the guest tries to move
    guest.dispatch({ cell: HX.idx(4, 4) })
    expect(host.getFull().board.filter(Boolean).length).toBe(before) // rejected
  })
})
