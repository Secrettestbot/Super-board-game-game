/* UR — netplay tests. Adapter round-trip (legal roll/move advances; out-of-turn & illegal
 * return the same ref) plus a host+guest in-memory sync proving the online path headlessly.
 * Everything in ur is public info, so there is no leak test. */

import { describe, it, expect } from 'vitest'
import { urAdapter as A, type UrIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as UR from './logic'

describe('ur net adapter', () => {
  it('round-trips a legal roll + move and rejects illegal / out-of-turn intents', () => {
    const s0 = A.makeGame()
    expect(A.seatToMove(s0)).toBe(0)
    expect(A.isOver(s0)).toBe(false)

    // out-of-turn: seat 1 tries to roll on seat 0's turn -> same ref
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // illegal: seat 0 tries to move before rolling -> same ref
    expect(A.applyIntent(s0, 0, { kind: 'move', piece: 0 })).toBe(s0)

    // A legal roll advances the state. doRoll uses RNG, so retry until we get a roll that
    // leaves the mover with a move to make (roll > 0 with legal moves keeps the turn and sets
    // rolled). At the start, any non-zero roll has legal moves (enter a new piece).
    let s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    let guard = 0
    while (!s1.rolled && guard < 200) { s1 = A.applyIntent(A.makeGame(), 0, { kind: 'roll' }); guard += 1 }
    expect(guard).toBeLessThan(200)
    expect(s1).not.toBe(s0)
    expect(s1.rolled).toBe(true)
    expect(A.seatToMove(s1)).toBe(0)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // double-rolling in the move phase is illegal -> same ref
    expect(A.applyIntent(s1, 0, { kind: 'roll' })).toBe(s1)
    // illegal move (no such legal piece) returns the same ref
    const legal = UR.legalMoves(s1, 'you', s1.roll!)
    const illegalPiece = [0, 1, 2, 3, 4, 5, 6].find(p => !legal.includes(p))!
    expect(A.applyIntent(s1, 0, { kind: 'move', piece: illegalPiece })).toBe(s1)
    // a legal move advances
    const s2 = A.applyIntent(s1, 0, { kind: 'move', piece: legal[0] })
    expect(s2).not.toBe(s1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true) // seat 0 (host) to move first
    expect(guest.isMyTurn()).toBe(false)

    // Drive the host (seat 0) through its whole turn until control passes to seat 1 (the guest)
    // or the game ends — handles rosette extra rolls and turn-passing dead rolls.
    let guard = 0
    while (host.isMyTurn() && guard < 500) {
      const s = host.getFull()
      if (!s.rolled) {
        host.dispatchLocal({ kind: 'roll' })
      } else {
        const legal = UR.legalMoves(s, 'you', s.roll!)
        host.dispatchLocal({ kind: 'move', piece: legal[0] })
      }
      guard += 1
    }
    expect(guard).toBeLessThan(500)
    expect(host.getFull().winner).toBe(null)

    // Now it is the guest's (seat 1) turn and the view is synced.
    expect(guest.isMyTurn()).toBe(true)
    const gv = guest.getState()
    expect(gv.turn).toBe('foe')
    expect(gv.rolled).toBe(false)
    expect(gv.log.length).toBe(host.getFull().log.length)

    // Guest replies with a roll; the intent travels host-ward and the host advances.
    const tickBefore = A.tickKey(host.getFull())
    guest.dispatch({ kind: 'roll' } as UrIntent)
    expect(A.tickKey(host.getFull())).not.toBe(tickBefore)

    // Guest's view reflects the host's authoritative state.
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
  })
})
