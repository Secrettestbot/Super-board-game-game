import { describe, it, expect } from 'vitest'
import { mancalaAdapter as A, type MancalaIntent } from './net'
import * as MC from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('mancala net adapter', () => {
  it('starts with seat 0 (you) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn to the opponent', () => {
    const s = A.makeGame()
    // Pit 0 (4 seeds) lands at 1,2,3,4 — a plain sow, ending on the opponent's turn.
    const s2 = A.applyIntent(s, 0, { pit: 0 })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('an extra-turn sow keeps the SAME seat to move', () => {
    const s = A.makeGame()
    // Pit 2 holds 4 seeds: sowing reaches 3,4,5,6 — index 6 is YOUR store -> extra turn.
    const s2 = A.applyIntent(s, 0, { pit: 2 })
    expect(s2).not.toBe(s)
    expect(s2.pits[MC.YOUR_STORE]).toBe(1) // banked exactly one seed
    expect(A.seatToMove(s2)).toBe(0) // still seat 0's turn
    // tickKey must have changed so the AI/timer re-arms for the back-to-back move
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 1, { pit: 7 })).toBe(s)
  })

  it('ignores an illegal intent — opponent pit / empty pit (returns same state)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { pit: 7 })).toBe(s) // not your pit
    // empty your pit: sow pit 2 (extra turn) which empties index 2, then try to sow it
    const s2 = A.applyIntent(s, 0, { pit: 2 })
    expect(A.applyIntent(s2, 0, { pit: 2 })).toBe(s2) // pit 2 now empty
  })

  it('aiStep advances the game', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { pit: 0 }) // hand turn to AI (seat 1)
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before)
  })
})

describe('mancala netplay session (host + guest over in-memory transport)', () => {
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
    expect(guest.getState().pits.length).toBe(14)
  })

  it('relays a host move to the guest, and a guest reply back to the host', () => {
    const { host, guest } = connect()
    // host (seat 0 = you) sows pit 0 — a plain sow that hands the turn to the guest
    host.dispatchLocal({ pit: 0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().moveCount).toBe(host.getFull().moveCount)

    // guest (seat 1 = ai side) replies with a legal sow of one of its pits
    const aiPit = MC.legalMoves(guest.getState().pits, 'ai')[0]
    const before = host.getFull().moveCount
    guest.dispatch({ pit: aiPit } as MancalaIntent)
    expect(host.getFull().moveCount).toBeGreaterThan(before)
    expect(guest.getState().moveCount).toBe(host.getFull().moveCount)
  })

  it('ignores an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().moveCount
    // it's seat 0's (host) turn; guest tries to move anyway
    guest.dispatch({ pit: 7 } as MancalaIntent)
    expect(host.getFull().moveCount).toBe(before)
  })
})
