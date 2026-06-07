/* SENET — netplay tests. Adapter round-trip (legal throw/move advances; out-of-turn &
 * illegal return the same ref) plus a host+guest in-memory sync proving the online path
 * headlessly. Everything in senet is public info, so there is no leak test. */

import { describe, it, expect } from 'vitest'
import { senetAdapter as A, type SenetIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as SN from './logic'

describe('senet net adapter', () => {
  it('round-trips a legal throw + move and rejects illegal / out-of-turn intents', () => {
    const s0 = A.makeGame()
    expect(A.seatToMove(s0)).toBe(0)
    expect(A.isOver(s0)).toBe(false)

    // out-of-turn: seat 1 tries to act on seat 0's turn -> same ref
    expect(A.applyIntent(s0, 1, { kind: 'throw' })).toBe(s0)
    // illegal: seat 0 tries to move before throwing -> same ref
    expect(A.applyIntent(s0, 0, { kind: 'move', pawn: 0 })).toBe(s0)

    // a legal throw advances the state (either into 'move', or passes turn on a dead roll)
    const s1 = A.applyIntent(s0, 0, { kind: 'throw' })
    expect(s1).not.toBe(s0)
    expect(s1.roll).not.toBeNull()

    if (s1.phase === 'move') {
      expect(A.seatToMove(s1)).toBe(0)
      // illegal move (no such legal pawn) returns the same ref
      const legal = SN.legalMoves(s1, 0, s1.roll!)
      const illegalPawn = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find(p => !legal.includes(p))!
      expect(A.applyIntent(s1, 0, { kind: 'move', pawn: illegalPawn })).toBe(s1)
      // double-throwing in the move phase is illegal -> same ref
      expect(A.applyIntent(s1, 0, { kind: 'throw' })).toBe(s1)
      // a legal move advances
      const s2 = A.applyIntent(s1, 0, { kind: 'move', pawn: legal[0] })
      expect(s2).not.toBe(s1)
    } else {
      // dead roll passed the turn to seat 1
      expect(A.seatToMove(s1)).toBe(1)
    }
  })

  it('tickKey changes on every action', () => {
    const s0 = A.makeGame()
    const s1 = A.applyIntent(s0, 0, { kind: 'throw' })
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))
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
    // or the game ends — handles extra throws and dead rolls.
    let guard = 0
    while (host.isMyTurn() && guard < 200) {
      const s = host.getFull()
      if (s.phase === 'throw') {
        host.dispatchLocal({ kind: 'throw' })
      } else {
        const legal = SN.legalMoves(s, 0, s.roll!)
        host.dispatchLocal({ kind: 'move', pawn: legal[0] })
      }
      guard += 1
    }
    expect(guard).toBeLessThan(200)
    expect(host.getFull().winner).toBe(null)

    // Now it is the guest's (seat 1) turn and the view is synced.
    expect(guest.isMyTurn()).toBe(true)
    const gv = guest.getState()
    expect(gv.turn).toBe(1)
    expect(gv.phase).toBe('throw')

    // Guest replies with a throw; the intent travels host-ward and the host advances.
    const tickBefore = A.tickKey(host.getFull())
    guest.dispatch({ kind: 'throw' } as SenetIntent)
    expect(A.tickKey(host.getFull())).not.toBe(tickBefore)

    // Guest's view reflects the host's authoritative state.
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
  })
})
