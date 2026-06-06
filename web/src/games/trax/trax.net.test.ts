import { describe, it, expect } from 'vitest'
import { traxAdapter as A, boardOf } from './net'
import * as TX from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('trax net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal placement (advances) and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    const pl = TX.legalPlacements(s)[0]

    // a legal seat-0 intent advances the game and passes the turn to seat 1
    const s2 = A.applyIntent(s, 0, { cell: pl.cell, ti: pl.ti })
    expect(s2).not.toBe(s)
    expect(boardOf(s2).size).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)

    // out-of-turn: seat 1 cannot move while it is seat 0's turn -> same ref
    expect(A.applyIntent(s, 1, { cell: pl.cell, ti: pl.ti })).toBe(s)

    // illegal: a cell with no fitting placement at that index -> same ref
    expect(A.applyIntent(s, 0, { cell: TX.key(9, 9), ti: pl.ti })).toBe(s)
  })

  it('tickKey changes on every transition', () => {
    const s = A.makeGame()
    const pl = TX.legalPlacements(s)[0]
    const s2 = A.applyIntent(s, 0, { cell: pl.cell, ti: pl.ti })
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })
})

describe('trax netplay session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the board through the JSON wire', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    // the board survived JSON serialization (Map -> entries -> Map)
    expect(boardOf(guest.getState()).size).toBe(0)
  })

  it('relays host & guest placements and stays in sync', () => {
    const { host, guest } = connect()

    // host (White, seat 0) plays first
    const m0 = TX.legalPlacements(host.getFull())[0]
    host.dispatchLocal({ cell: m0.cell, ti: m0.ti })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(boardOf(guest.getState()).size).toBe(boardOf(host.getFull()).size)

    // guest (Red, seat 1) replies; intent travels host-ward and applies.
    // The guest's view arrives with a flattened board, so hydrate it (as the UI does)
    // before asking the pure logic for legal placements.
    const before = host.getFull().moves
    const gView = { ...guest.getState(), board: boardOf(guest.getState()) }
    const m1 = TX.legalPlacements(gView)[0]
    guest.dispatch({ cell: m1.cell, ti: m1.ti })
    expect(host.getFull().moves).toBeGreaterThan(before)
    expect(host.getFull().turn).toBe(0) // back to White (seat 0)
    expect(host.isMyTurn()).toBe(true)
    expect(boardOf(guest.getState()).size).toBe(boardOf(host.getFull()).size)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().moves
    // it is White's (host) turn, but the guest tries to move
    const m = TX.legalPlacements(host.getFull())[0]
    guest.dispatch({ cell: m.cell, ti: m.ti })
    expect(host.getFull().moves).toBe(before) // rejected, nothing changed
  })
})
