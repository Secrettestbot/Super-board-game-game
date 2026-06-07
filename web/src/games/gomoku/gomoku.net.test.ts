import { describe, it, expect } from 'vitest'
import { gomokuAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('gomoku net adapter', () => {
  it('starts with Black (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, 7 * 15 + 7) // centre point
    expect(s2).not.toBe(s)
    expect(s2.board[7 * 15 + 7]).toBe('b')
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    // seat 1 (White) cannot move first — Black is to move
    expect(A.applyIntent(s, 1, 7 * 15 + 7)).toBe(s)
  })

  it('ignores an illegal intent on an occupied cell (returns same state)', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, 7 * 15 + 7)
    // now seat 1's turn; playing the same occupied cell is illegal
    expect(A.applyIntent(s2, 1, 7 * 15 + 7)).toBe(s2)
  })

  it('ignores an out-of-bounds intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, -1)).toBe(s)
    expect(A.applyIntent(s, 0, 225)).toBe(s)
  })

  it('aiStep plays the White (seat 1) side', () => {
    // gomoku's aiMove plays only for White, so the AI fills seat 1. Black (seat 0) plays
    // a human/host move first, then aiStep advances White and passes the turn back.
    let s = A.makeGame()
    s = A.applyIntent(s, 0, 7 * 15 + 7) // Black plays
    expect(A.seatToMove(s)).toBe(1)     // White (AI seat) to move
    const before = s
    s = A.aiStep(s, 1)
    expect(s).not.toBe(before)
    expect(A.seatToMove(s)).toBe(0)     // back to Black
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('gomoku netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.mySeat()).toBe(1) // host is seat 0 (Black), guest gets seat 1 (White)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(225)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Black, seat 0) plays first
    host.dispatchLocal(7 * 15 + 7)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now White's (guest's) turn, view synced
    expect(guest.getState().board[7 * 15 + 7]).toBe('b')

    // guest (White, seat 1) replies; intent travels host-ward and applies
    guest.dispatch(7 * 15 + 8)
    expect(host.getFull().board[7 * 15 + 8]).toBe('w')
    expect(host.isMyTurn()).toBe(true) // back to Black
    expect(guest.getState().last).toBe(host.getFull().last)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().last
    // it's Black's (host) turn, but the guest tries to move
    guest.dispatch(0)
    expect(host.getFull().last).toBe(before) // rejected, nothing changed
  })
})
