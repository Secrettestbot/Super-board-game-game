/* QWIXX — netplay adapter tests. Adapter round-trip (a legal action advances; out-of-turn
 * & illegal intents return the SAME state ref) plus a host+guest sync over an in-memory
 * transport. All info is public, so there is no leak test. Winner can be 0, so guards use
 * `!= null`. */

import { describe, it, expect } from 'vitest'
import { qwixxAdapter as A } from './net'
import type { QwixxIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('qwixx net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s0 = A.makeGame()
    expect(A.numSeats(s0)).toBe(2)
    expect(A.seatToMove(s0)).toBe(0) // active player (seat 0) must roll first
    expect(A.isOver(s0)).toBe(false)

    // out-of-turn: seat 1 cannot act while seat 0 is to move -> same ref
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // illegal: seat 0 cannot mark before rolling (phase is 'roll') -> same ref
    expect(A.applyIntent(s0, 0, { kind: 'mark', color: 'red', index: 0 })).toBe(s0)

    // legal: seat 0 rolls -> state advances (new ref), phase becomes 'act', dice present,
    // and tickKey changes.
    const s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    expect(s1).not.toBe(s0)
    expect(s1.phase).toBe('act')
    expect(s1.dice).not.toBeNull()
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // after a roll the PASSIVE player (seat 1) reacts first (empty sheet always has a legal
    // white-sum), so seat 1 is now to move.
    expect(A.seatToMove(s1)).toBe(1)
    // out-of-turn now: seat 0 cannot mark while seat 1 holds the white-reaction -> same ref
    expect(A.applyIntent(s1, 0, { kind: 'pass' })).toBe(s1)

    // legal: passive seat 1 skips its white-sum -> advances, move passes to active seat 0
    const s2 = A.applyIntent(s1, 1, { kind: 'pass' })
    expect(s2).not.toBe(s1)
    expect(A.seatToMove(s2)).toBe(0)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))

    // illegal mark for seat 0 (a cell with no legal option) returns same ref
    const noOpt = A.applyIntent(s2, 0, { kind: 'mark', color: 'red', index: 10 })
    expect(noOpt).toBe(s2)

    // active seat 0 passes -> ends the turn, advances to the other player's roll
    const s3 = A.applyIntent(s2, 0, { kind: 'pass' })
    expect(s3).not.toBe(s2)
    expect(s3.phase).toBe('roll')
    expect(s3.active).toBe(1)
    expect(A.seatToMove(s3)).toBe(1)
  })

  it('a legal mark advances the state', () => {
    const s0 = A.makeGame()
    const s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    // seat 1 is passive and to move; take whatever its first legal white option is.
    expect(A.seatToMove(s1)).toBe(1)
    // find a legal white option for seat 1 from the live state (dice are random)
    const before = s1.whiteTakenBy[1]
    const s2 = A.applyIntent(s1, 1, { kind: 'pass' }) // declining is always legal here
    expect(s2).not.toBe(s1)
    expect(before).toBe(false)
    expect(s2.whiteTakenBy[1]).toBe(true)
  })

  it('aiStep advances one action at a time and changes tickKey', () => {
    let s = A.makeGame()
    const seat = A.seatToMove(s)
    expect(seat).toBe(0)
    const before = A.tickKey(s)
    s = A.aiStep(s, 0) // AI rolls for the active seat
    expect(A.tickKey(s)).not.toBe(before)
    expect(s.phase).toBe('act')
  })
})

describe('qwixx host + guest stay in sync over an in-memory transport', () => {
  it('relays intents both ways and stays authoritative', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true) // host (seat 0) rolls first
    expect(guest.isMyTurn()).toBe(false)

    // host rolls -> view syncs, passive guest (seat 1) becomes to-move
    host.dispatchLocal({ kind: 'roll' })
    expect(host.getFull().phase).toBe('act')
    expect(guest.getState().phase).toBe('act')
    expect(guest.isMyTurn()).toBe(true)
    expect(host.isMyTurn()).toBe(false)

    // guest replies (skips its white-sum); intent travels host-ward and applies
    guest.dispatch({ kind: 'pass' } as QwixxIntent)
    expect(host.getFull().whiteTakenBy[1]).toBe(true)
    expect(host.isMyTurn()).toBe(true) // back to the active host seat
    // guest's view reflects the host's authoritative state
    expect(guest.getState().whiteTakenBy[1]).toBe(true)
    expect(A.tickKey(guest.getState())).toBe(A.tickKey(host.getFull()))

    // host ends its turn -> next player's roll; both views agree
    host.dispatchLocal({ kind: 'pass' })
    expect(host.getFull().phase).toBe('roll')
    expect(host.getFull().active).toBe(1)
    expect(guest.getState().active).toBe(1)
    expect(guest.isMyTurn()).toBe(true) // guest (seat 1) now rolls
  })
})
