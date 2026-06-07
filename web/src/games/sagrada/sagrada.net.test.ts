/* SAGRADA — netplay tests. Four parts:
 *   1. adapter round-trip: a legal draft+place advances; illegal / out-of-turn intents are no-ops.
 *   2. host + guest stay in sync over an in-memory transport (the headless online proof).
 *   3. leak test: the guest's view never contains the host's secret private-objective colour.
 *   4. redactFor reveals both secrets once the game is over (final scoreboard). */

import { describe, it, expect } from 'vitest'
import { sagradaAdapter as A, type SagradaIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as S from './logic'

/** Build a deterministic game so the tests are stable, with distinct secret colours so
 * the leak test is meaningful (seat 0 = red, seat 1 = blue). */
function game(): S.SagradaState {
  return S.makeGame({ seed: 4242, secret: ['red', 'blue'] })
}

/** Find a legal (draftIndex, cellIndex) for `player` in state `s`, or null. */
function legalMove(s: S.SagradaState, player: S.Player): { draftIndex: number; cellIndex: number } | null {
  for (let di = 0; di < s.pool.length; di++) {
    const cells = S.legalPlacements(s.windows[player], s.pool[di])
    if (cells.length) return { draftIndex: di, cellIndex: cells[0] }
  }
  return null
}

describe('sagrada net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s = game()
    expect(A.seatToMove(s)).toBe(0) // snake order opens with seat 0
    expect(A.isOver(s)).toBe(false)

    const mv = legalMove(s, 0)!
    expect(mv).not.toBeNull()

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state object.
    expect(A.applyIntent(s, 1, { kind: 'place', ...mv })).toBe(s)

    // Illegal placement (same cell can't host nothing-adjacent garbage): an out-of-range
    // draft index is rejected by the logic -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'place', draftIndex: 99, cellIndex: mv.cellIndex })).toBe(s)

    // A pass is illegal while a legal move exists -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'pass' })).toBe(s)

    // Legal: seat 0 drafts + places -> state changes, tickKey changes, pool shrinks.
    const before = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { kind: 'place', ...mv })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)
    expect(s2.pool.length).toBe(s.pool.length - 1)
    expect(S.placedCount(s2.windows[0])).toBe(1)
    expect(A.seatToMove(s2)).toBe(1) // snake order: seat 1 next
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host = seat 0, opens
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) drafts + places a legal die.
    const mv0 = legalMove(host.getFull(), 0)!
    host.dispatchLocal({ kind: 'place', ...mv0 })

    // It is now the guest's turn and the guest's view reflects the authoritative state.
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(S.placedCount(guest.getState().windows[0])).toBe(1)
    expect(guest.getState().turn).toBe(1)

    // Guest (seat 1) replies: draft + place. Intent travels host-ward and applies.
    const stepBefore = host.getFull().step
    const mv1 = legalMove(guest.getState(), 1)!
    guest.dispatch({ kind: 'place', ...mv1 })

    expect(host.getFull().step).toBeGreaterThan(stepBefore)
    expect(S.placedCount(host.getFull().windows[1])).toBe(1)
  })

  it('never leaks the opponent secret private objective to the guest', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()

    // The guest (seat 1) sees its OWN secret colour...
    expect(view.secret[1]).toBe(full.secret[1])
    expect(S.COLORS).toContain(view.secret[1]) // it's a real colour
    // ...but the host's (seat 0) secret colour is blanked, not its real value, and is
    // not even a valid colour string.
    expect(view.secret[0]).not.toBe(full.secret[0])
    expect(S.COLORS).not.toContain(view.secret[0])

    // Structural leak check: the only secret colour the wire view may expose IS the
    // guest's own (slot 1). Window cell `reqColor`s are PUBLIC printed restrictions, so a
    // colour name appearing there is fine; the secret objective leaks only if the host's
    // colour shows up in a `"secret"` position the guest shouldn't see. Verify the secret
    // array itself carries no real colour for seat 0.
    expect(view.secret).toEqual([view.secret[0], full.secret[1]])
    expect(view.secret[0]).toBe(A.redactFor!(full, 1).secret[0]) // the blanked sentinel
    // And the host's seat-0 secret, when it differs from the guest's, must not be the
    // value sitting in the guest's visible secret array.
    if (full.secret[0] !== full.secret[1]) {
      expect(view.secret).not.toContain(full.secret[0])
    }
  })

  it('reveals both secrets to the guest once the game is over', () => {
    // Drive a full game to completion through the adapter (both seats greedily place /
    // pass) so scores resolve, then check redactFor stops hiding.
    let s = game()
    let guard = 0
    while (!A.isOver(s) && guard++ < 2000) {
      const seat = A.seatToMove(s)
      if (seat == null) break
      const mv = legalMove(s, seat as S.Player)
      s = mv ? A.applyIntent(s, seat, { kind: 'place', ...mv }) : A.applyIntent(s, seat, { kind: 'pass' })
    }
    expect(A.isOver(s)).toBe(true)
    // Over -> redactFor is identity, both secrets visible for the final scoreboard.
    const view = A.redactFor!(s, 1)
    expect(view.secret[0]).toBe(s.secret[0])
    expect(view.secret[1]).toBe(s.secret[1])
  })
})

// Keep the SagradaIntent import meaningful for type-checking.
export type _I = SagradaIntent
