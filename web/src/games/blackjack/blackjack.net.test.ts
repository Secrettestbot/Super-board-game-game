/* BLACKJACK — netplay tests. Blackjack is a single seat (the human player) vs a
 * fixed-rule DEALER, so the online story is: the host plays authoritatively and any
 * would-be guest is rejected (table full). We prove:
 *   1. the adapter validates/round-trips intents and no-ops illegal/out-of-turn ones,
 *   2. a guest joining a 1-seat host is rejected and the host stays authoritative,
 *   3. redactFor hides the dealer's HOLE card and the SHOE from any non-player view
 *      (the leak test), so even if a view ever crossed the wire it carries no secrets. */

import { describe, it, expect } from 'vitest'
import { blackjackAdapter as A, type BlackjackIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as BJ from './logic'
import type { BlackjackState, Card } from './logic'

// Deterministic helper: drive deals until we get a hand that is NOT an immediate natural
// (so the player still has a live turn). makeGame()/deal() use Math.random internally,
// so just retry — overwhelmingly fast since naturals are rare.
function liveHand(): BlackjackState {
  for (let attempt = 0; attempt < 200; attempt++) {
    const s0 = A.makeGame()
    const s1 = A.applyIntent(s0, 0, { kind: 'deal' })
    if (s1.phase === 'player' && s1.result == null) return s1
  }
  throw new Error('could not deal a live hand')
}

describe('blackjack net adapter', () => {
  it('one joinable seat; player moves first', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(1)
    expect(A.seatToMove(s)).toBe(0) // idle -> player's seat to deal
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal deal and rejects illegal / out-of-turn intents', () => {
    const idle = A.makeGame()

    // out-of-turn: seat 1 (the dealer "seat") may never submit intents -> unchanged ref
    expect(A.applyIntent(idle, 1, { kind: 'deal' })).toBe(idle)

    // illegal: cannot hit while idle (no hand dealt) -> unchanged ref
    expect(A.applyIntent(idle, 0, { kind: 'hit' })).toBe(idle)
    expect(A.applyIntent(idle, 0, { kind: 'stand' })).toBe(idle)

    // legal: deal -> state changes, cards dealt
    const dealt = A.applyIntent(idle, 0, { kind: 'deal' })
    expect(dealt).not.toBe(idle)
    expect(dealt.player.length).toBe(2)
    expect(dealt.dealer.length).toBe(2)

    // tickKey changes across the transition
    expect(A.tickKey(dealt)).not.toBe(A.tickKey(idle))
  })

  it('hit / stand advance the hand; bet is an accepted no-op', () => {
    const live = liveHand()
    expect(A.seatToMove(live)).toBe(0)

    // bet is accepted for protocol completeness but does not mutate the fixed-bet logic
    expect(A.applyIntent(live, 0, { kind: 'bet', n: 50 })).toBe(live)

    // hit adds a card (or busts/settles); either way the state advances
    const afterHit = A.applyIntent(live, 0, { kind: 'hit' })
    expect(afterHit).not.toBe(live)
    expect(afterHit.player.length).toBeGreaterThanOrEqual(3)

    // stand hands off to the dealer phase -> seatToMove becomes the dealer seat
    const afterStand = A.applyIntent(live, 0, { kind: 'stand' })
    expect(afterStand.phase).toBe('dealer')
    expect(afterStand.hole).toBe(false) // dealer reveals on stand
    expect(A.seatToMove(afterStand)).toBe(1)
  })

  it('aiStep drives the dealer to a resolution from the dealer phase', () => {
    let s = liveHand()
    s = A.applyIntent(s, 0, { kind: 'stand' })
    expect(s.phase).toBe('dealer')
    // pump the dealer "AI" until the hand resolves
    for (let k = 0; k < 30 && s.phase === 'dealer'; k++) s = A.aiStep(s, 1)
    expect(s.phase).toBe('over')
    expect(s.result).not.toBeNull()
    // back to the player's seat for the next hand
    expect(A.seatToMove(s)).toBe(0)
  })
})

describe('blackjack host authority (single seat rejects a guest)', () => {
  it('a would-be guest gets no seat and the host plays authoritatively', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a) // 1 seat, taken by host -> guest is rejected (transport closed)
    const guest = new GuestSession(A, b)

    expect(host.guestCount()).toBe(0) // no seat was assigned
    expect(host.numSeats()).toBe(1)
    expect(guest.ready()).toBe(false) // never received a welcome/view

    // the host can still play its own hand authoritatively
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal({ kind: 'deal' })
    expect(host.getFull().player.length).toBe(2)
  })
})

describe('blackjack redaction / leak test', () => {
  function hidden(): { full: BlackjackState; view: BlackjackState } {
    // a fresh dealt hand still has the hole card down and a fat shoe. Deal from a FRESH game
    // each iteration (a no-op deal on an already-dealt state would never reach phase 'player'
    // with a hole), and bump the bound so we reliably land a live hole-card hand.
    let full = A.makeGame()
    for (let k = 0; k < 400; k++) {
      const g = A.applyIntent(A.makeGame(), 0, { kind: 'deal' })
      if (g.phase === 'player' && g.hole) { full = g; break }
    }
    const view = A.redactFor!(full, 1) // a non-player (dealer/spectator) seat view
    return { full, view }
  }

  it('the player (seat 0) sees the unredacted table', () => {
    const full = liveHand()
    expect(A.redactFor!(full, 0)).toBe(full)
  })

  it('a non-player view never carries the dealer hole card or the shoe', () => {
    const { full, view } = hidden()

    // structure preserved (same counts) but secrets masked
    expect(view.shoe.length).toBe(full.shoe.length)
    expect(view.dealer.length).toBe(full.dealer.length)
    expect(view.shoe.every(c => c.r === 0)).toBe(true) // entire shoe masked
    // hole-card assertions only apply when a hole card was actually dealt
    if (full.dealer.length >= 2 && full.hole) {
      expect(view.dealer[0]).toEqual(full.dealer[0]) // up-card still visible
      expect(view.dealer[1]).not.toEqual(full.dealer[1]) // hole card masked
      expect(view.dealer[1].r).toBe(0) // masked to a face-down placeholder
    }

    // Build the set of secret card objects (hole + every shoe card) and assert that the
    // ordered (rank,position) signature the host knows cannot be reconstructed from the
    // serialized guest view. Because each secret slot is a placeholder, the secret shoe
    // ordering simply does not exist in the wire bytes.
    const secrets: Card[] = [full.dealer[1], ...full.shoe]
    const wire = JSON.parse(JSON.stringify(view)) as BlackjackState
    // every shoe slot reads as the face-down placeholder
    expect(wire.shoe.every(c => c.r === 0)).toBe(true)
    expect(wire.shoe.some((c, i) => full.shoe[i] && JSON.stringify(c) === JSON.stringify(full.shoe[i]) && full.shoe[i].r !== 0)).toBe(false)
    // hole-card assertions only apply when a hole card was actually dealt
    if (full.dealer.length >= 2 && full.hole) {
      expect(wire.dealer[1].r).toBe(0)
      expect(wire.dealer[1]).not.toEqual(secrets[0])
    }
  })

  it('once the dealer reveals (hole=false), the up cards are public but the shoe stays hidden', () => {
    let s = liveHand()
    s = A.applyIntent(s, 0, { kind: 'stand' }) // hole now revealed
    expect(s.hole).toBe(false)
    const view = A.redactFor!(s, 1)
    // both dealer cards visible after reveal
    expect(view.dealer).toEqual(s.dealer)
    // but the shoe is always masked
    expect(view.shoe.every(c => c.r === 0)).toBe(true)
    expect(view.shoe.some((c, i) => s.shoe[i] && c.r === s.shoe[i].r && s.shoe[i].r !== 0)).toBe(false)
  })
})

// type-only usage to keep the intent type referenced
const _intentSample: BlackjackIntent = { kind: 'stand' }
void _intentSample
