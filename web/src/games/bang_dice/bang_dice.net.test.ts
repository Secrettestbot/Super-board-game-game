/* BANG! THE DICE GAME — netplay tests. Proves the adapter round-trips legal intents
 * (roll / hold / resolve / end), rejects illegal & out-of-turn ones, that a HostSession +
 * GuestSession stay in sync over an in-memory transport, and — the hidden-info guard — that
 * a guest's view never carries a per-seat secret. This free-for-all variant has no secret
 * roles/hands (all state is public), so the leak test asserts the redaction is a faithful
 * identity and that no unexpected secret field rides along on the wire. */

import { describe, it, expect } from 'vitest'
import { bangDiceAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as BD from './logic'
import type { BangState } from './logic'

/** Deterministic RNG so rolls are reproducible across a test. Returns a restore fn. */
function withRng<T>(seq: number[], fn: () => T): T {
  let i = 0
  const restore = BD.setRng(() => seq[i++ % seq.length])
  try { return fn() } finally { BD.setRng(restore) }
}

describe('bang_dice net adapter', () => {
  it('round-trips a legal roll/resolve/end and rejects illegal / out-of-turn intents', () => {
    const s0 = A.makeGame()
    expect(A.numSeats(s0)).toBe(BD.NUM_PLAYERS)
    expect(A.seatToMove(s0)).toBe(0)
    expect(A.isOver(s0)).toBe(false)

    // out-of-turn: seat 1 cannot act while it is seat 0's turn -> unchanged (===)
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // can't resolve before rolling -> unchanged
    expect(A.applyIntent(s0, 0, { kind: 'resolve' })).toBe(s0)
    // can't end before resolving -> unchanged
    expect(A.applyIntent(s0, 0, { kind: 'end' })).toBe(s0)

    // legal first roll (seat 0) -> state changes, still seat 0's turn (same roller)
    const s1 = withRng([0, 0.2, 0.4, 0.6, 0.8], () => A.applyIntent(s0, 0, { kind: 'roll' }))
    expect(s1).not.toBe(s0)
    expect(s1.rolled).toBe(true)
    expect(A.seatToMove(s1)).toBe(0)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // a hold toggle is a legal, state-changing intent and tickKey reflects it
    const held = A.applyIntent(s1, 0, { kind: 'hold', idx: 0 })
    if (s1.dice[0] !== 'dynamite') {
      expect(held.kept[0]).toBe(true)
      expect(A.tickKey(held)).not.toBe(A.tickKey(s1))
    }
    // out-of-bounds hold idx -> unchanged (logic rejects, same ref)
    expect(A.applyIntent(s1, 0, { kind: 'hold', idx: 99 })).toBe(s1)
    // out-of-turn hold -> unchanged
    expect(A.applyIntent(s1, 2, { kind: 'hold', idx: 0 })).toBe(s1)

    // legal resolve -> phase advances to 'resolved' (or 'over')
    const resolved = A.applyIntent(s1, 0, { kind: 'resolve' })
    expect(resolved).not.toBe(s1)
    expect(resolved.phase === 'resolved' || resolved.phase === 'over').toBe(true)

    // legal end -> turn advances to the next live seat
    if (resolved.phase === 'resolved') {
      const ended = A.applyIntent(resolved, 0, { kind: 'end' })
      expect(ended).not.toBe(resolved)
      expect(ended.turn).not.toBe(0)
      expect(A.seatToMove(ended)).toBe(ended.turn)
    }
  })

  it('seatToMove stays the same seat across roll -> resolve, only advancing on end', () => {
    const s0 = A.makeGame()
    const s1 = withRng([0, 0, 0, 0, 0], () => A.applyIntent(s0, 0, { kind: 'roll' }))
    expect(A.seatToMove(s1)).toBe(0)
    const s2 = A.applyIntent(s1, 0, { kind: 'resolve' })
    if (s2.phase === 'resolved') expect(A.seatToMove(s2)).toBe(0) // still seat 0 until 'end'
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host=0, guest gets the next open seat

    expect(host.isMyTurn()).toBe(true) // seat 0 (host) starts
    expect(guest.isMyTurn()).toBe(false)

    // host rolls + resolves + ends; play passes off seat 0
    host.dispatchLocal({ kind: 'roll' })
    expect(guest.getState().rolled).toBe(true) // view synced to the guest
    host.dispatchLocal({ kind: 'resolve' })
    if (host.getFull().phase === 'resolved') host.dispatchLocal({ kind: 'end' })

    // turn left seat 0; the guest's view tracks the host's authoritative turn/step
    expect(guest.getState().turn).toBe(host.getFull().turn)
    expect(guest.getState().step).toBe(host.getFull().step)

    // The vacated AI seats are driven by the host. If it is now an AI seat's turn, the
    // host can step it; if it lands on the guest (seat 1), the guest can act.
    let guard = 0
    while (host.aiSeat() != null && guard++ < 200) host.stepAI()
    if (A.seatToMove(host.getFull()) === 1) {
      expect(guest.isMyTurn()).toBe(true)
      guest.dispatch({ kind: 'roll' })
      expect(host.getFull().rolled).toBe(true) // guest intent reached the host
    }
    // out-of-turn guest intent is ignored by the authority
    const before = A.tickKey(host.getFull())
    if (A.seatToMove(host.getFull()) !== 1) {
      guest.dispatch({ kind: 'roll' })
      expect(A.tickKey(host.getFull())).toBe(before)
    }
  })

  it('LEAK: a guest view carries no per-seat secret (public state, faithful redaction)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    // Advance through a host roll so the wire carries a live (public) dice state.
    host.dispatchLocal({ kind: 'roll' })

    const full = host.getFull()
    const view = guest.getState()

    // This variant has NO hidden info: redactFor is identity, so the guest's view is the
    // full public state verbatim (every seat's life/arrows + the current roller's dice).
    expect(view).toEqual(full)

    // Guard against a secret field sneaking onto the wire unredacted: assert the only
    // keys present are the known PUBLIC fields of BangState (anything new must be added to
    // redactFor + this list deliberately).
    const PUBLIC_KEYS = new Set([
      'players', 'arrowPile', 'dice', 'kept', 'rerollsLeft', 'rolled',
      'turn', 'phase', 'winner', 'step', 'log',
    ])
    for (const k of Object.keys(view as object)) {
      expect(PUBLIC_KEYS.has(k)).toBe(true)
    }
    // No field name hints at a hidden secret (role / hand / hidden / secret) crossing.
    const blob = JSON.stringify(view)
    for (const word of ['role', 'secret', 'hidden', 'hand']) {
      expect(blob.toLowerCase()).not.toContain(`"${word}`)
    }
  })

  it('redactFor round-trips: applying it leaves the public state unchanged', () => {
    const s = A.makeGame() as BangState
    expect(A.redactFor!(s, 0)).toEqual(s)
    expect(A.redactFor!(s, 2)).toEqual(s)
  })
})
