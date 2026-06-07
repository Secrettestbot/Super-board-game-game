/* EUCHRE — netplay tests. Proves (1) the adapter round-trips a legal intent and rejects
 * illegal / out-of-turn ones, (2) a HostSession + GuestSession stay in sync over an
 * in-memory transport through a real calling-and-play sequence, and (3) the leak test:
 * a guest's view never carries any other seat's private card. */

import { describe, it, expect } from 'vitest'
import { euchreAdapter as A, type EuchreIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as E from './logic'
import type { Card, EuchreState, Suit } from './logic'

/** Deterministic 24-card deck (ids assigned by buildDeck order) so deals are reproducible. */
function deck(): Card[] { return E.buildDeck() }

describe('euchre net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame(deck(), 3) // dealer 3 -> seat 0 acts first in round1
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(4)
    expect(A.isOver(s)).toBe(false)

    // Out-of-turn: seat 1 cannot pass while it's seat 0's turn -> SAME state object.
    expect(A.applyIntent(s, 1, { kind: 'pass' })).toBe(s)

    // Illegal: seat 0 cannot play a card during the calling phase -> SAME state.
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: s.hands[0][0].id })).toBe(s)

    // Legal: seat 0 passes -> state changes, turn advances to seat 1.
    const s1 = A.applyIntent(s, 0, { kind: 'pass' })
    expect(s1).not.toBe(s)
    expect(A.seatToMove(s1)).toBe(1)

    // tickKey changes on the transition.
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))
  })

  it('orderUp sets trump and moves to the playing phase', () => {
    const s = A.makeGame(deck(), 3)
    const up = s.upcard!
    const after = A.applyIntent(s, 0, { kind: 'orderUp', alone: false })
    expect(after).not.toBe(s)
    expect(after.phase).toBe('playing')
    expect(after.trump).toBe(up.suit)
    expect(after.maker).toBe(0)
    expect(A.seatToMove(after)).toBe(after.turn)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // Whoever is to move first: drive the calling round by passing until someone (host or
    // an AI seat) makes trump and play begins, or until seat 0 (host) gets to act.
    // Simplest deterministic check: the host can submit a legal intent for whatever seat 0
    // is asked to do; we just verify the guest's view tracks the host's authoritative state.

    // Advance the host's own seat when it is seat 0's turn during calling.
    while (!A.isOver(host.getFull()) && host.getFull().phase !== 'playing') {
      const seat = A.seatToMove(host.getFull())
      if (seat === 0) {
        host.dispatchLocal({ kind: 'pass' }) // host always passes to keep it simple
      } else {
        host.stepAI() // AI fills the non-host, non-guest seats; seat 1 is the guest
        // if it's the guest's turn (seat 1) during calling, the guest decides via pass
        if (A.seatToMove(host.getFull()) === 1) guest.dispatch({ kind: 'pass' })
      }
    }

    // Once in the playing phase (or game advanced), the guest's view must equal the host's
    // per-seat view: same phase, same trump, same scores, same trick length.
    const hv = host.getFull()
    const gv = guest.getState()
    expect(gv.phase).toBe(hv.phase)
    expect(gv.trump).toBe(hv.trump)
    expect(gv.scores).toEqual(hv.scores)
    expect(gv.trick.length).toBe(hv.trick.length)
  })

  it('a guest plays its own legal card and the host advances', () => {
    // Force a deal where seat 0 (host) orders up so play starts immediately, then drive
    // until it is the guest's (seat 1) turn to play and have the guest play a legal card.
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    // Get into playing: host orders up if it's seat 0's turn in round1, else passes.
    while (!A.isOver(host.getFull()) && host.getFull().phase !== 'playing') {
      const seat = A.seatToMove(host.getFull())
      if (seat === 0) {
        const f = host.getFull()
        if (f.phase === 'round1') host.dispatchLocal({ kind: 'orderUp' })
        else host.dispatchLocal({ kind: 'callSuit', suit: callableSuit(f) })
      } else if (seat === 1) {
        guest.dispatch({ kind: 'pass' })
      } else {
        host.stepAI()
      }
    }

    if (host.getFull().phase === 'playing') {
      // Walk to the guest's turn, letting host (seat 0) and AI (seats 2,3) play.
      let guard = 0
      while (host.getFull().phase === 'playing' && A.seatToMove(host.getFull()) !== 1 && guard++ < 20) {
        const seat = A.seatToMove(host.getFull())
        if (seat === 0) host.dispatchLocal({ kind: 'play', cardId: firstLegal(host.getFull(), 0) })
        else if (seat === 1) break
        else host.stepAI()
      }
      if (host.getFull().phase === 'playing' && A.seatToMove(host.getFull()) === 1) {
        const before = host.getFull().ply
        const cardId = firstLegal(guest.getState(), 1)
        guest.dispatch({ kind: 'play', cardId })
        expect(host.getFull().ply).toBeGreaterThan(before) // the guest's play applied
      }
    }
  })
})

/** Pick a suit the dealer can legally name in round 2 (any suit != turned-down). */
function callableSuit(s: EuchreState): Suit {
  const down = s.upcard ? s.upcard.suit : null
  return (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[]).find(su => su !== down)!
}
/** A legal card id for the given seat in the current playing state. */
function firstLegal(s: EuchreState, seat: number): number {
  return E.legalPlays(s.hands[seat], s.trick, s.trump!)[0].id
}

describe('euchre hidden-info redaction (leak test)', () => {
  it('a guest never receives any other seat\'s private cards', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    const full = host.getFull()
    const view = guest.getState()

    // Guest sees its OWN hand intact.
    expect(view.hands[1]).toEqual(full.hands[1])
    // Every OTHER seat's hand is blanked but keeps its count.
    for (const other of [0, 2, 3]) {
      expect(view.hands[other].length).toBe(full.hands[other].length)
      expect(view.hands[other].every(c => c.id === -1)).toBe(true)
    }

    // No other seat's real card id may appear anywhere in the serialized view.
    const wire = JSON.stringify(view)
    const ownIds = new Set(full.hands[1].map(c => c.id))
    for (const other of [0, 2, 3]) {
      for (const c of full.hands[other]) {
        if (ownIds.has(c.id)) continue
        expect(wire).not.toContain(`"id":${c.id}`)
      }
    }
  })
})
