/* PIG — netplay adapter + session integration test. Browser-free proof of the online
 * path: the adapter round-trips legal intents and rejects illegal/out-of-turn ones, and a
 * HostSession + GuestSession stay in sync over an in-memory transport. Pig dice are host
 * RNG, so we drive rolls until a non-bust lands to reach a deterministic checkpoint. */

import { describe, it, expect } from 'vitest'
import { pigAdapter as A, type PigIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import type { PigState } from './logic'

// Roll (host RNG) until the side to move holds a positive turn total without busting, so the
// next checkpoint is deterministic regardless of the dice. Returns the resulting state.
function rollToTurnTotal(s: PigState, seat: number): PigState {
  let cur = s
  for (let i = 0; i < 200; i++) {
    if (cur.turnTotal > 0) return cur
    cur = A.applyIntent(cur, seat, { kind: 'roll' })
    // A bust passes the turn — bail; caller decides what to do.
    if (A.seatToMove(cur) !== seat) return cur
  }
  return cur
}

describe('pig net adapter', () => {
  it('round-trips a legal intent and rejects illegal/out-of-turn', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
    expect(A.numSeats(s)).toBe(2)

    // A legal seat-0 roll advances the state (rollCount grows -> tickKey changes).
    const k0 = A.tickKey(s)
    const rolled = A.applyIntent(s, 0, { kind: 'roll' })
    expect(rolled).not.toBe(s)
    expect(A.tickKey(rolled)).not.toBe(k0)
    expect(rolled.rollCount).toBe(1)

    // Out-of-turn: seat 1 acts on seat 0's turn -> same ref back.
    const fresh = A.makeGame()
    expect(A.applyIntent(fresh, 1, { kind: 'roll' })).toBe(fresh)
    expect(A.applyIntent(fresh, 1, { kind: 'hold' })).toBe(fresh)

    // Illegal: holding with a zero turn total no-ops to the same ref.
    expect(A.applyIntent(fresh, 0, { kind: 'hold' })).toBe(fresh)
    // Illegal: an unknown intent kind is ignored.
    expect(A.applyIntent(fresh, 0, { kind: 'nope' } as unknown as PigIntent)).toBe(fresh)

    // A legal HOLD (after building a turn total) banks and passes the turn to seat 1.
    const built = rollToTurnTotal(fresh, 0)
    if (A.seatToMove(built) === 0 && built.turnTotal > 0) {
      const held = A.applyIntent(built, 0, { kind: 'hold' })
      expect(held).not.toBe(built)
      expect(held.scores.you).toBe(built.turnTotal)
      expect(A.seatToMove(held)).toBe(1)
    }
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // seat 0 (host) to move first
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) rolls until it can hold, then banks — turn passes to the guest (seat 1).
    for (let i = 0; i < 200 && host.isMyTurn() && host.getFull().turnTotal === 0; i++) {
      host.dispatchLocal({ kind: 'roll' })
    }
    if (host.isMyTurn() && host.getFull().turnTotal > 0) {
      host.dispatchLocal({ kind: 'hold' })
    }
    // Whether the host busted or held, the turn is now the guest's and views are synced.
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe('ai')
    expect(guest.getState().scores).toEqual(host.getFull().scores)

    // Guest (seat 1) replies with a roll; the intent travels host-ward and applies.
    const beforeKey = A.tickKey(host.getFull())
    guest.dispatch({ kind: 'roll' })
    expect(A.tickKey(host.getFull())).not.toBe(beforeKey) // host advanced
    expect(host.getFull().rollCount).toBeGreaterThanOrEqual(1)
    // Guest's view reflects the host's authoritative state.
    expect(guest.getState().rollCount).toBe(host.getFull().rollCount)
  })
})
