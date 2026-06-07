/* COCKROACH POKER — netplay test. Browser-free proof of the online path:
 *  (1) the adapter round-trips a legal intent and rejects illegal / out-of-turn ones,
 *  (2) a HostSession + GuestSession stay in sync over an in-memory transport,
 *  (3) the leak test — a guest's view never contains another seat's hand composition
 *      nor the hidden passed card's true value (the core hidden-info guarantee). */

import { describe, it, expect } from 'vitest'
import { cockroachPokerAdapter as A } from './net'
import type { CockroachIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as CP from './logic'
import { freshDeck } from './logic'

describe('cockroach poker net adapter', () => {
  it('round-trips a legal pass and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(CP.NUM_PLAYERS)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // A card seat 0 actually holds.
    const card = CP.VERMIN.find(v => s.hands[0][v] > 0)!
    const before = A.tickKey(s)

    // Out-of-turn: seat 1 tries to pass while it's seat 0's turn -> unchanged (===).
    expect(A.applyIntent(s, 1, { kind: 'pass', cardId: card, claim: card, target: 0 })).toBe(s)

    // Illegal: pass a card not in hand -> unchanged (===).
    const missing = CP.VERMIN.find(v => s.hands[0][v] === 0)
    if (missing) expect(A.applyIntent(s, 0, { kind: 'pass', cardId: missing, claim: missing, target: 1 })).toBe(s)

    // Illegal: target is self -> unchanged (===).
    expect(A.applyIntent(s, 0, { kind: 'pass', cardId: card, claim: card, target: 0 })).toBe(s)

    // Illegal: wrong intent kind while no pass is pending -> unchanged (===).
    expect(A.applyIntent(s, 0, { kind: 'guess', truth: true })).toBe(s)

    // Legal: seat 0 passes the card to seat 1.
    const passed = A.applyIntent(s, 0, { kind: 'pass', cardId: card, claim: card, target: 1 })
    expect(passed).not.toBe(s)
    expect(A.tickKey(passed)).not.toBe(before)
    expect(passed.pending).not.toBeNull()
    expect(passed.pending!.target).toBe(1)
    expect(A.seatToMove(passed)).toBe(1) // now seat 1 must decide

    // Legal: seat 1 calls TRUE (the claim was honest) -> passer keeps the card.
    const resolved = A.applyIntent(passed, 1, { kind: 'guess', truth: true })
    expect(resolved).not.toBe(passed)
    expect(resolved.pending).toBeNull()
    expect(resolved.piles[0][card]).toBe(1)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)
    // Seat 2 is unfilled, so it reverts to an AI seat.
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai'])

    // Host (seat 0) passes a real card to the guest (seat 1).
    const full = host.getFull()
    const card = CP.VERMIN.find(v => full.hands[0][v] > 0)!
    host.dispatchLocal({ kind: 'pass', cardId: card, claim: card, target: 1 })

    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // it's now the guest's decision
    expect(guest.getState().pending).not.toBeNull()
    expect(guest.getState().pending!.target).toBe(1)

    // Guest replies with a guess; the host's authoritative state advances.
    const stepBefore = host.getFull().step
    guest.dispatch({ kind: 'guess', truth: false })
    expect(host.getFull().step).toBeGreaterThan(stepBefore)
    expect(host.getFull().pending).toBeNull()
  })

  it('round-trips a pass-on (peek + relay) intent', () => {
    // Deterministic round-robin deal so seat 0 holds a cockroach.
    const s = CP.makeGame(freshDeck())
    const passed = A.applyIntent(s, 0, { kind: 'pass', cardId: 'cockroach', claim: 'cockroach', target: 1 })
    expect(passed.pending!.target).toBe(1)
    // Seat 1 peeks and passes on to seat 2 (the only eligible onward target).
    const relayed = A.applyIntent(passed, 1, { kind: 'passOn', claim: 'rat', target: 2 })
    expect(relayed).not.toBe(passed)
    expect(relayed.pending!.target).toBe(2)
    expect(relayed.pending!.seenBy.slice().sort()).toEqual([0, 1])
    // An illegal pass-on (target already saw it) is a no-op.
    expect(A.applyIntent(relayed, 2, { kind: 'passOn', claim: 'fly', target: 0 })).toBe(relayed)
  })

  it('leak test — a guest never sees rivals\' hands nor the hidden passed card', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b) // seat 1
    const [c, d] = memoryPair(); host.addGuest(c)
    const guest2 = new GuestSession(A, d) // seat 2
    void c; void d

    // Host (seat 0) passes a card to seat 2, claiming a (possibly false) type, so seat 1 is a
    // pure bystander who has NOT seen the card. The true card must be hidden from seat 1.
    const full = host.getFull()
    const card = CP.VERMIN.find(v => full.hands[0][v] > 0)!
    // Pick a claim different from the true card so claim text can't accidentally reveal it.
    const claim = CP.VERMIN.find(v => v !== card)!
    host.dispatchLocal({ kind: 'pass', cardId: card, claim, target: 2 })

    // ---- guest1 (seat 1) is a bystander: must not see the true card ----
    const view1 = guest.getState()
    expect(view1.pending).not.toBeNull()
    expect(view1.pending!.seenBy).not.toContain(1) // confirm it really hasn't seen it
    expect(view1.pending!.card).not.toBe(card)     // true identity masked
    // Its own hand is intact; rivals' hand compositions are zeroed (only counts survive).
    expect(CP.handSize(view1.hands[1])).toBeGreaterThan(0)
    expect(CP.handSize(view1.hands[0])).toBe(0)
    expect(CP.handSize(view1.hands[2])).toBe(0)

    // The wire view must not contain the host's secret hand composition. Encode the host's true
    // per-type hand as a fingerprint and assert none of its non-trivial structure leaked.
    const wire1 = JSON.stringify(view1)
    // The true passed card's type must not appear via the hidden `pending.card`.
    // (It may legitimately appear as the count key in seat 1's own hand, so we check `pending`.)
    expect(JSON.stringify(view1.pending)).not.toContain(`"${card}"`)
    // Rival hand objects must be all-zero (no surviving counts to reconstruct a hand).
    for (const seat of [0, 2]) {
      for (const v of CP.VERMIN) expect(view1.hands[seat][v]).toBe(0)
    }
    // The private size hints expose only TOTALS, never composition.
    const hints = (view1 as { _handSizes?: number[] })._handSizes
    expect(hints).toBeDefined()
    // Totals match the authoritative state (seat 0 shed one card to make the pass).
    expect(hints![0]).toBe(CP.handSize(host.getFull().hands[0]))
    void wire1

    // ---- guest2 (seat 2) is the fresh receiver: it has NOT peeked yet, so the true card is
    // still hidden from it too (it must call blind, or peek by choosing to pass it on). ----
    const view2 = guest2.getState()
    expect(view2.pending!.target).toBe(2)
    expect(view2.pending!.seenBy).not.toContain(2)
    expect(view2.pending!.card).not.toBe(card) // not a legitimate seer yet -> masked
    expect(CP.handSize(view2.hands[2])).toBeGreaterThan(0)
    expect(CP.handSize(view2.hands[0])).toBe(0)
  })

  it('a relayer (peeker) legitimately sees the true card after passing it on', () => {
    const s = CP.makeGame(freshDeck())
    const passed = A.applyIntent(s, 0, { kind: 'pass', cardId: 'cockroach', claim: 'rat', target: 1 })
    // Seat 1 peeks + relays to seat 2; now seat 1 is in seenBy and may see the truth.
    const relayed = A.applyIntent(passed, 1, { kind: 'passOn', claim: 'rat', target: 2 })
    const view1 = A.redactFor!(relayed, 1)
    expect(view1.pending!.seenBy).toContain(1)
    expect(view1.pending!.card).toBe('cockroach') // seer keeps the true value
    // A bystander seat (none here besides target 2) still wouldn't; the fresh target 2 doesn't.
    const view2 = A.redactFor!(relayed, 2)
    expect(view2.pending!.card).not.toBe('cockroach')
  })
})

// keep the named intent type referenced so unused-import lint stays quiet
export type _CockroachIntent = CockroachIntent
