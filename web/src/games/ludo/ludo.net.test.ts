/* LUDO — netplay tests. Adapter round-trip (a legal roll/move advances; illegal /
 * out-of-turn intents return the same state ref) plus a host+guest integration run over an
 * in-memory transport pair, proving the online roll -> move flow stays in sync without a
 * browser or WebRTC. The die is host RNG, so assertions only rely on invariants that hold
 * for any face. */

import { describe, it, expect } from 'vitest'
import { ludoAdapter as A, type LudoIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as L from './logic'
import type { LudoState } from './logic'

/** Roll for seat 0 until a roll lands us in the 'move' phase with a legal move available
 * (i.e. a 6 that released a token), staying on seat 0. Returns null if it never happens. */
function rollUntilMovable(start: LudoState): LudoState | null {
  let s = start
  let guard = 0
  while (s.winner == null && guard++ < 400) {
    if (A.seatToMove(s) !== 0) return null // turn passed away from us before a movable roll
    s = A.applyIntent(s, 0, { kind: 'roll' })
    if (s.phase === 'move' && s.rolled && s.die != null && L.legalMoves(s, 0, s.die).length > 0) {
      return s
    }
    // A roll with no legal move auto-passes the turn; loop will detect seatToMove !== 0.
  }
  return null
}

describe('ludo net adapter', () => {
  it('exposes the real seat count and the active seat to move', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(s.tokens.length) // 4 in the default game
    expect(A.numSeats(s)).toBe(4)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('rejects illegal / out-of-turn intents with the same state ref', () => {
    const s = A.makeGame()
    // out-of-turn: seat 1 cannot act while it's seat 0's turn -> same ref back
    expect(A.applyIntent(s, 1, { kind: 'roll' })).toBe(s)
    // a 'move' before any roll (still in the roll phase) is illegal -> same ref
    expect(A.applyIntent(s, 0, { kind: 'move', token: 0 })).toBe(s)
    // unknown intent kind -> unchanged ref
    expect(A.applyIntent(s, 0, { kind: 'nope' } as unknown as LudoIntent)).toBe(s)
  })

  it('round-trips a legal roll, then a legal move, advancing the game', () => {
    const s0 = A.makeGame()

    // A roll always changes the state and the tickKey (it advances the step counter).
    const rolled = A.applyIntent(s0, 0, { kind: 'roll' })
    expect(rolled).not.toBe(s0)
    expect(A.tickKey(rolled)).not.toBe(A.tickKey(s0))

    // Drive seat 0 to a state where it has rolled a 6 and can release/move a token.
    const movable = rollUntilMovable(s0)
    if (movable) {
      expect(A.seatToMove(movable)).toBe(0)
      const legal = L.legalMoves(movable, 0, movable.die!)
      const token = legal[0]

      // out-of-turn move from seat 1 -> same ref
      expect(A.applyIntent(movable, 1, { kind: 'move', token })).toBe(movable)
      // an illegal token index -> same ref (no token at a yard slot for a non-6 etc.)
      const illegal = [0, 1, 2, 3].find(t => !legal.includes(t))
      if (illegal != null) {
        expect(A.applyIntent(movable, 0, { kind: 'move', token: illegal })).toBe(movable)
      }

      // legal move advances the state and the tickKey.
      const moved = A.applyIntent(movable, 0, { kind: 'move', token })
      expect(moved).not.toBe(movable)
      expect(A.tickKey(moved)).not.toBe(A.tickKey(movable))
      // a 6 keeps seat 0 (extra turn); otherwise the turn passed on.
      const next = A.seatToMove(moved)
      expect(next === 0 || next === 1).toBe(true)
    }
  })

  it('aiStep plays a full AI turn and hands the table back', () => {
    const s = A.makeGame()
    // advance to an AI seat: roll for seat 0 until the turn leaves seat 0.
    let cur = s
    let guard = 0
    while (A.seatToMove(cur) === 0 && cur.winner == null && guard++ < 400) {
      cur = A.applyIntent(cur, 0, { kind: 'roll' })
      // if a 6 dropped us into 'move' with a legal move, make a move to progress the turn.
      if (cur.phase === 'move' && cur.rolled && cur.die != null) {
        const legal = L.legalMoves(cur, 0, cur.die)
        if (legal.length > 0) cur = A.applyIntent(cur, 0, { kind: 'move', token: legal[0] })
      }
    }
    const aiSeat = A.seatToMove(cur)
    expect(aiSeat).not.toBeNull()
    expect(aiSeat!).toBeGreaterThan(0)

    const after = A.aiStep(cur, aiSeat!)
    expect(after).not.toBe(cur)
    // the AI's turn resolved; the table moved off that seat (or the game ended).
    expect(after.turn !== aiSeat || after.winner != null).toBe(true)
  })
})

describe('ludo host + guest stay in sync over an in-memory transport', () => {
  it('relays guest intents and broadcasts the authoritative view back', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0, guest takes the next open seat
    expect(host.isMyTurn()).toBe(true) // seat 0 (host) starts
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) plays full turns (roll, then move if it can) until the turn passes to
    // the guest (seat 1) or someone wins.
    let guard = 0
    while (host.getFull().turn === 0 && host.getFull().winner == null && guard++ < 400) {
      host.dispatchLocal({ kind: 'roll' } as LudoIntent)
      const f = host.getFull()
      if (f.turn === 0 && f.phase === 'move' && f.rolled && f.die != null) {
        const legal = L.legalMoves(f, 0, f.die)
        if (legal.length > 0) host.dispatchLocal({ kind: 'move', token: legal[0] } as LudoIntent)
      }
    }

    if (host.getFull().winner == null) {
      // Turn advanced to seat 1 — the guest. Its synced view agrees.
      expect(host.getFull().turn).toBe(1)
      expect(guest.isMyTurn()).toBe(true)
      expect(guest.getState().turn).toBe(1)
      expect(guest.getState().tokens).toEqual(host.getFull().tokens)
      expect(guest.getState().step).toBe(host.getFull().step)

      // Out-of-turn from the host's seat is ignored once it's the guest's turn.
      const before = host.getFull().step
      host.dispatchLocal({ kind: 'roll' } as LudoIntent)
      expect(host.getFull().step).toBe(before)

      // Guest (seat 1) rolls; the intent travels host-ward and the host applies it.
      guest.dispatch({ kind: 'roll' } as LudoIntent)
      expect(host.getFull().step).toBeGreaterThan(before)
      // Guest's view reflects the host's authoritative state.
      expect(guest.getState().tokens).toEqual(host.getFull().tokens)
      expect(guest.getState().step).toBe(host.getFull().step)
    }
  })
})
