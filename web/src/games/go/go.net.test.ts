import { describe, it, expect } from 'vitest'
import { goAdapter as A, type GoIntent } from './net'
import * as GO from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('go net adapter', () => {
  it('starts with Black (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal play and passes the turn', () => {
    const s = A.makeGame()
    const p = GO.legalMoves(s)[0]
    const s2 = A.applyIntent(s, 0, { kind: 'play', point: p })
    expect(s2).not.toBe(s)
    expect(s2.board[p]).toBe(0)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const p = GO.legalMoves(s)[0]
    expect(A.applyIntent(s, 1, { kind: 'play', point: p })).toBe(s)
  })

  it('ignores an illegal/occupied intent (returns same ref)', () => {
    let s = A.makeGame()
    const p = GO.legalMoves(s)[0]
    s = A.applyIntent(s, 0, { kind: 'play', point: p }) // black plays, now white to move
    // white tries to play on the occupied point -> illegal, same ref
    expect(A.applyIntent(s, 1, { kind: 'play', point: p })).toBe(s)
  })

  it('a pass advances the turn and bumps consecutivePasses; tickKey changes', () => {
    const s = A.makeGame()
    const before = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { kind: 'pass' })
    expect(s2).not.toBe(s)
    expect(s2.consecutivePasses).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(before)
  })
})

describe('go netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().board.length).toBe(81)
  })

  it('relays moves both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Black, seat 0) plays first
    const p0 = GO.legalMoves(host.getFull())[0]
    host.dispatchLocal({ kind: 'play', point: p0 } as GoIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now White's (guest's) turn, view synced
    expect(guest.getState().board[p0]).toBe(0)

    // guest (White, seat 1) replies; intent travels host-ward and applies
    const p1 = GO.legalMoves(guest.getState())[0]
    guest.dispatch({ kind: 'play', point: p1 } as GoIntent)
    expect(host.getFull().turn).toBe(0) // back to Black
    expect(host.isMyTurn()).toBe(true)
    expect(host.getFull().board[p1]).toBe(1)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })
})
