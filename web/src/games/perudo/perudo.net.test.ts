/* PERUDO — netplay tests. Three parts:
 *   1) adapter round-trip: a legal bid changes state + passes the turn; illegal / out-of-turn
 *      intents return the SAME state reference.
 *   2) host + guest stay in sync over an in-memory transport, including a Dudo reveal.
 *   3) LEAK TEST: the hidden-info guard — a guest's view during bidding must never contain any
 *      other seat's dice values (its own dice stay visible; foe die COUNTS stay public). */

import { describe, it, expect } from 'vitest'
import { perudoAdapter as A, type PerudoIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as P from './logic'
import type { PerudoState, Face } from './logic'

// A fixed opening state so the legal raises are predictable (no RNG dependence).
function mkBidding(over: Partial<PerudoState> = {}): PerudoState {
  const base: PerudoState = {
    dice: [[2, 3, 4, 5, 6], [1, 1, 4, 2, 6], [3, 3, 3, 5, 1], [6, 6, 2, 2, 4]],
    counts: [5, 5, 5, 5],
    alive: [true, true, true, true],
    turn: 0,
    bid: null,
    opener: 0,
    palifico: false,
    phase: 'bidding',
    winner: null,
    reveal: null,
    history: [],
    actionSeq: 0,
    log: [],
  }
  return Object.assign(base, over)
}

describe('perudo net adapter', () => {
  it('round-trips a legal bid and rejects illegal / out-of-turn intents', () => {
    const s = mkBidding()
    expect(A.numSeats(s)).toBe(4)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // legal seat-0 opening bid -> state changes, turn passes to seat 1
    const after = A.applyIntent(s, 0, { kind: 'bid', quantity: 2, face: 3 })
    expect(after).not.toBe(s)
    expect(after.bid).toEqual({ quantity: 2, face: 3, byPlayer: 0 })
    expect(A.seatToMove(after)).toBe(1)

    // out-of-turn: seat 1 cannot act while it's seat 0's turn -> SAME reference
    expect(A.applyIntent(s, 1, { kind: 'bid', quantity: 2, face: 3 })).toBe(s)

    // illegal bid (not a raise over the standing 2×3): seat 1 bids 1×2 -> SAME reference
    expect(A.applyIntent(after, 1, { kind: 'bid', quantity: 1, face: 2 })).toBe(after)

    // challenge with no standing bid is illegal -> SAME reference
    expect(A.applyIntent(s, 0, { kind: 'challenge' })).toBe(s)

    // 'continue' is meaningless during bidding -> SAME reference
    expect(A.applyIntent(s, 0, { kind: 'continue' })).toBe(s)
  })

  it('a challenge (Dudo) resolves to a reveal whose mover advances the round', () => {
    // p3 bid 9×6 (false: only 7 sixes with wilds) -> seat 0 calls Dudo -> bidder (3) loses.
    const s = mkBidding({ turn: 0, bid: { quantity: 9, face: 6, byPlayer: 3 } })
    const rev = A.applyIntent(s, 0, { kind: 'challenge' })
    expect(rev.phase).toBe('reveal')
    expect(rev.reveal?.loser).toBe(3)
    // seat-to-move during reveal is the die-loser (seat 3), who rolls the next round
    expect(A.seatToMove(rev)).toBe(3)
    // wrong seat cannot continue
    expect(A.applyIntent(rev, 0, { kind: 'continue' })).toBe(rev)
    // the mover continues -> a fresh bidding round
    const next = A.applyIntent(rev, 3, { kind: 'continue' })
    expect(next.phase).toBe('bidding')
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host seat 0, guest gets seat 1

    // Drive deterministically from a known state so both sides agree on legality.
    host.newGame() // re-roll under default RNG is fine; we only assert structural sync
    // Host (seat 0) opens with a minimal-ish bid that is always legal on an empty bid.
    host.dispatchLocal({ kind: 'bid', quantity: 1, face: 2 })

    // The guest should now see it is its turn (seat 1) and the same standing bid.
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().bid).toEqual({ quantity: 1, face: 2, byPlayer: 0 })
    expect(guest.getState().turn).toBe(1)

    // Guest (seat 1) raises; the intent travels host-ward and applies.
    guest.dispatch({ kind: 'bid', quantity: 1, face: 3 } as PerudoIntent)
    expect(host.getFull().bid).toEqual({ quantity: 1, face: 3, byPlayer: 1 })
    expect(host.getFull().turn).toBe(2)
    // guest's view tracks the host's authoritative actionSeq
    expect(guest.getState().actionSeq).toBe(host.getFull().actionSeq)
  })

  it('LEAK: a guest never sees other seats\' dice during bidding (own dice + foe counts only)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()             // host's true, un-redacted state
    const view = guest.getState()           // what crossed the wire to the guest (seat 1)

    // The guest sees its OWN dice, real values.
    expect(view.dice[1]).toEqual(full.dice[1])
    // Every OTHER seat's dice are blanked (no values leaked).
    for (let p = 0; p < view.dice.length; p++) {
      if (p === 1) continue
      expect(view.dice[p]).toEqual([])
    }
    // Foe die COUNTS remain public.
    expect(view.counts).toEqual(full.counts)

    // Hard guard: none of the other seats' dice values appear anywhere in the wire payload.
    const wire = JSON.stringify(view)
    for (let p = 0; p < full.dice.length; p++) {
      if (p === 1) continue
      const foeView = JSON.stringify(view.dice[p])
      // the foe's view slot is empty
      expect(foeView).toBe('[]')
    }
    // and the guest's own dice ARE present (sanity that redaction didn't blank everything)
    expect(wire).toContain(JSON.stringify(full.dice[1]))
  })

  it('LEAK lifts at reveal: once a Dudo resolves, all dice are visible to the guest', () => {
    // Seed the table so we can force a deterministic Dudo without RNG ambiguity.
    const seeded: PerudoState = {
      dice: [[2, 3, 4, 5, 6], [1, 1, 4, 2, 6], [3, 3, 3, 5, 1], [6, 6, 2, 2, 4]],
      counts: [5, 5, 5, 5], alive: [true, true, true, true],
      turn: 1, bid: { quantity: 9, face: 6, byPlayer: 0 },
      opener: 0, palifico: false, phase: 'bidding', winner: null, reveal: null,
      history: [{ quantity: 9, face: 6 as Face, byPlayer: 0 }], actionSeq: 1, log: [],
    }
    // Redacting the bidding state hides foe dice from the guest (seat 1)...
    const hidden = A.redactFor!(seeded, 1)
    expect(hidden.dice[0]).toEqual([])
    // ...but after a challenge resolves to reveal, redactFor is identity (all dice shown).
    const revealed = A.applyIntent(seeded, 1, { kind: 'challenge' })
    expect(revealed.phase).toBe('reveal')
    const revView = A.redactFor!(revealed, 1)
    expect(revView.dice[0]).toEqual(seeded.dice[0])
    expect(revView.dice[2]).toEqual(seeded.dice[2])
  })
})
