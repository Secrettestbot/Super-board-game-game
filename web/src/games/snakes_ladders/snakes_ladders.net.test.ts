/* SNAKES & LADDERS — netplay tests. Adapter round-trip (a legal roll advances + passes;
 * illegal / out-of-turn intents return the same state ref) plus a host+guest integration
 * run over an in-memory transport pair, proving the online roll flow stays in sync without
 * a browser or WebRTC. The die is host RNG, so assertions only rely on invariants that
 * hold for any face. */

import { describe, it, expect } from 'vitest'
import { snakesLaddersAdapter as A, type SnakesLaddersIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('snakes & ladders net adapter', () => {
  it('exposes the real seat count and the active seat to move', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(s.positions.length) // 4 in the default game
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll, then rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()

    // out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state ref back
    expect(A.applyIntent(s, 1, { kind: 'roll' })).toBe(s)
    // unknown intent kind -> unchanged ref
    expect(A.applyIntent(s, 0, { kind: 'nope' } as unknown as SnakesLaddersIntent)).toBe(s)

    // legal: seat 0 rolls and moves. State changes and seat 0 advances from the start.
    const rolled = A.applyIntent(s, 0, { kind: 'roll' })
    expect(rolled).not.toBe(s)
    expect(rolled.positions[0]).toBeGreaterThan(0) // a roll always moves off square 0
    expect(A.tickKey(rolled)).not.toBe(A.tickKey(s)) // tickKey changed on the action

    // After a roll the active seat is either 0 again (rolled a 6 -> bonus roll) or seat 1.
    const next = A.seatToMove(rolled)
    expect(next === 0 || next === 1).toBe(true)
    expect(next === 0).toBe(rolled.die === 6) // a 6 keeps the turn; anything else passes

    // out-of-turn for whoever is NOT next -> unchanged ref
    const notNext = next === 0 ? 1 : 0
    expect(A.applyIntent(rolled, notNext, { kind: 'roll' })).toBe(rolled)
  })

  it('aiStep plays a full AI turn and hands the table back', () => {
    const s = A.makeGame()
    // advance to an AI seat: roll for seat 0 until the turn leaves seat 0.
    let cur = s
    let guard = 0
    while (A.seatToMove(cur) === 0 && guard++ < 50) cur = A.applyIntent(cur, 0, { kind: 'roll' })
    const aiSeat = A.seatToMove(cur)!
    expect(aiSeat).toBeGreaterThan(0)

    const after = A.aiStep(cur, aiSeat)
    expect(after).not.toBe(cur)
    // the AI's turn resolved; the table moved off that seat (or the game ended).
    expect(after.turn !== aiSeat || after.winner != null).toBe(true)
  })
})

describe('snakes & ladders host + guest stay in sync over an in-memory transport', () => {
  it('relays guest intents and broadcasts the authoritative view back', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0, guest takes the next open seat
    expect(host.isMyTurn()).toBe(true) // seat 0 (host) starts
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) keeps rolling until its turn passes to the guest (seat 1).
    let guard = 0
    while (host.getFull().turn === 0 && host.getFull().winner == null && guard++ < 50) {
      host.dispatchLocal({ kind: 'roll' } as SnakesLaddersIntent)
    }

    if (host.getFull().winner == null) {
      // Turn advanced to seat 1 — the guest. Its synced view agrees.
      expect(host.getFull().turn).toBe(1)
      expect(guest.isMyTurn()).toBe(true)
      expect(guest.getState().turn).toBe(1)
      expect(guest.getState().positions).toEqual(host.getFull().positions)
      expect(guest.getState().step).toBe(host.getFull().step)

      // Out-of-turn from the host's seat is ignored once it's the guest's turn.
      const before = host.getFull().step
      host.dispatchLocal({ kind: 'roll' } as SnakesLaddersIntent)
      expect(host.getFull().step).toBe(before)

      // Guest (seat 1) rolls; the intent travels host-ward and the host applies it.
      guest.dispatch({ kind: 'roll' } as SnakesLaddersIntent)
      expect(host.getFull().step).toBeGreaterThan(before)
      expect(host.getFull().positions[1]).toBeGreaterThan(0) // the guest's token moved
      // Guest's view reflects the host's authoritative state.
      expect(guest.getState().positions).toEqual(host.getFull().positions)
      expect(guest.getState().step).toBe(host.getFull().step)
    }
  })
})
