/* CATAN DICE — netplay tests. Adapter round-trip (legal intent advances; illegal /
 * out-of-turn returns the SAME ref) plus a host+guest in-memory sync proving the online
 * path works headlessly. Catan Dice is perfect information, so no leak test is needed. */

import { describe, it, expect } from 'vitest'
import { catanDiceAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('catan_dice net adapter', () => {
  it('reports 2 seats and seat 0 to move at the start', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()

    // out-of-turn: seat 1 cannot act on seat 0's turn -> same ref
    expect(A.applyIntent(s, 1, { kind: 'roll' })).toBe(s)

    // illegal for the current phase: cannot build before rolling -> same ref
    expect(A.applyIntent(s, 0, { kind: 'build', type: 'road' })).toBe(s)
    // cannot end the turn while still in the roll phase -> same ref
    expect(A.applyIntent(s, 0, { kind: 'end' })).toBe(s)
    // a malformed hold index is a no-op -> same ref
    expect(A.applyIntent(s, 0, { kind: 'hold', i: 99 })).toBe(s)

    // legal: seat 0 rolls -> state changes, dice appear, rolls decremented, still seat 0
    const s1 = A.applyIntent(s, 0, { kind: 'roll' })
    expect(s1).not.toBe(s)
    expect(s1.dice.length).toBe(6)
    expect(s1.rollsLeft).toBe(s.rollsLeft - 1)
    expect(A.seatToMove(s1)).toBe(0) // same seat keeps acting through the turn

    // hold toggles a die for the active seat
    const s2 = A.applyIntent(s1, 0, { kind: 'hold', i: 0 })
    expect(s2.kept[0]).toBe(true)

    // tickKey changes on a transition
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host = seat 0 to move
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) plays its whole turn: roll until build phase, then end the turn.
    host.dispatchLocal({ kind: 'roll' })
    while (host.getFull().phase === 'roll' && host.getFull().rollsLeft > 0) {
      host.dispatchLocal({ kind: 'roll' })
    }
    if (host.getFull().phase === 'roll') host.dispatchLocal({ kind: 'stop' })
    expect(host.getFull().phase).toBe('build')
    host.dispatchLocal({ kind: 'end' })

    // Now it is seat 1's (the guest's) turn, and the guest's view reflects it.
    expect(host.getFull().turn).toBe(1)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(1)

    // Guest replies: it rolls via the wire and the host's authoritative state advances.
    const stepBefore = host.getFull().step
    guest.dispatch({ kind: 'roll' })
    expect(host.getFull().step).toBeGreaterThan(stepBefore)
    expect(host.getFull().dice.length).toBe(6)
    expect(guest.getState().dice.length).toBe(6)
  })
})
