/* BACKGAMMON — netplay tests. Adapter round-trip (a legal roll/move advances the state and
 * changes tickKey; out-of-turn and illegal intents return the SAME state ref) plus a
 * host+guest integration run over an in-memory transport pair, proving the online
 * roll -> move -> hand-off flow stays in sync without a browser or WebRTC. */

import { describe, it, expect } from 'vitest'
import { backgammonAdapter as A, type BackgammonIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as BG from './logic'
import type { BackgammonState, Side } from './logic'

// Play out the whole turn for whichever side is to move, applying legal moves through the
// adapter, until the turn passes (s.turn flips) or the game ends. Returns the final state.
// Used to drive a deterministic-after-roll integration run despite the RNG dice.
function playOutTurn(s: BackgammonState): BackgammonState {
  const startSeat = A.seatToMove(s)
  if (startSeat == null) return s
  const side: Side = startSeat === 0 ? 'w' : 'b'
  if (!s.rolled) s = A.applyIntent(s, startSeat, { kind: 'roll' })
  // A roll with no legal move auto-forfeits the turn inside the logic.
  let guard = 0
  while (A.seatToMove(s) === startSeat && s.winner == null && guard++ < 50) {
    const moves = BG.usableMoves(s, side)
    if (!moves.length) break
    const m = moves[0]
    s = A.applyIntent(s, startSeat, { kind: 'move', from: m.from, die: m.die })
  }
  return s
}

describe('backgammon net adapter', () => {
  it('reports two seats and White (seat 0) to move first', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll then a legal move; rejects illegal / out-of-turn', () => {
    const s = A.makeGame()

    // out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state ref back
    expect(A.applyIntent(s, 1, { kind: 'roll' })).toBe(s)
    // illegal: cannot move before rolling -> unchanged ref
    expect(A.applyIntent(s, 0, { kind: 'move', from: 23, die: 5 })).toBe(s)

    // legal: seat 0 rolls (host RNG inside logic.roll). State advances; tickKey changes.
    const rolled = A.applyIntent(s, 0, { kind: 'roll' })
    expect(rolled).not.toBe(s)
    expect(A.tickKey(rolled)).not.toBe(A.tickKey(s))

    // If the roll didn't auto-forfeit (no legal move) we should still be seat 0's turn and
    // able to play one legal checker move.
    if (A.seatToMove(rolled) === 0) {
      // illegal: cannot roll again this turn -> unchanged ref
      expect(A.applyIntent(rolled, 0, { kind: 'roll' })).toBe(rolled)
      // illegal: a from-point with no legal play for the rolled dice -> unchanged ref
      const bogus = A.applyIntent(rolled, 0, { kind: 'move', from: 1, die: 6 })
      expect(bogus).toBe(rolled)

      // legal: play the first usable move; state advances and tickKey changes
      const m = BG.usableMoves(rolled, 'w')[0]
      expect(m).toBeTruthy()
      const moved = A.applyIntent(rolled, 0, { kind: 'move', from: m.from, die: m.die })
      expect(moved).not.toBe(rolled)
      expect(A.tickKey(moved)).not.toBe(A.tickKey(rolled))
    } else {
      // rare: the opening roll left no legal move and the turn forfeited to seat 1
      expect(A.seatToMove(rolled)).toBe(1)
    }
  })

  it('aiStep only acts for its own seat and advances the state', () => {
    const s = A.makeGame()
    // seat 1 (Black/AI) is not to move yet -> aiStep returns the same ref
    expect(A.aiStep(s, 1)).toBe(s)
    // hand the turn to seat 1, then aiStep should advance (roll, as a first sub-step)
    const handed = playOutTurn(s)
    if (handed.winner == null && A.seatToMove(handed) === 1) {
      const after = A.aiStep(handed, 1)
      expect(after).not.toBe(handed)
    }
  })
})

describe('backgammon host + guest stay in sync over an in-memory transport', () => {
  it('relays guest intents and broadcasts the authoritative view back', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0 (White), guest takes seat 1 (Black)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) rolls, then plays its whole turn through dispatchLocal until the table
    // passes to seat 1 (or, rarely, the roll forfeited and it's already seat 1's turn).
    host.dispatchLocal({ kind: 'roll' } as BackgammonIntent)
    let guard = 0
    while (A.seatToMove(host.getFull()) === 0 && host.getFull().winner == null && guard++ < 50) {
      const m = BG.usableMoves(host.getFull(), 'w')[0]
      if (!m) break
      host.dispatchLocal({ kind: 'move', from: m.from, die: m.die } as BackgammonIntent)
    }

    // Turn is now seat 1 — the guest. Its synced view agrees.
    expect(A.seatToMove(host.getFull())).toBe(1)
    expect(guest.isMyTurn()).toBe(true)
    // The guest's view mirrors the host's authoritative board (public info, identity view).
    expect(guest.getState().points).toEqual(host.getFull().points)
    expect(guest.getState().turn).toBe('b')

    // Guest (seat 1) replies: roll travels host-ward and applies on the authority.
    const beforeTick = A.tickKey(host.getFull())
    guest.dispatch({ kind: 'roll' } as BackgammonIntent)
    expect(A.tickKey(host.getFull())).not.toBe(beforeTick)
    expect(host.getFull().rolled).toBe(true)
    // guest's view reflects the host's authoritative state after its own action
    expect(guest.getState().rolled).toBe(true)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const before = A.tickKey(host.getFull())
    // it's White's (host) turn, but the guest tries to roll
    guest.dispatch({ kind: 'roll' } as BackgammonIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
