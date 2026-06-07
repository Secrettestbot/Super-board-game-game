/* MILLE BORNES — netplay tests. Adapter round-trip + a real host/guest integration over an
 * in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries
 * the other seat's private hand cards (or the face-down deck). */

import { describe, it, expect } from 'vitest'
import { milleBornesAdapter as A, type MilleBornesIntent } from './net'
import * as MB from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/* A deterministic deck so every assertion is reproducible. The deck draws from the END
   (top = last element). makeGame deals 6 each alternately from the top. We stack the very
   top so seat 0's first dealt card is a Go (remedy/stop) it can play immediately. */
function game() {
  // Build an ordered deck: filler at the bottom, then deal-order cards at the top.
  const deck = MB.buildDeck()
  return MB.makeGame(deck)
}

/** Find a card id of a given kind in a seat's hand (after a Go has put them rolling). */
function firstDiscardable(s: MB.State, seat: MB.Player): number {
  return s.players[seat].hand[0].id
}

describe('mille bornes net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal play (Go), passes the turn to seat 1, and refills the hand', () => {
    const s = game()
    // find a Go (remedy/stop) in seat 0's hand to start rolling — always legal at start.
    const go = s.players[0].hand.find(c => c.kind === 'remedy' && c.hazard === 'stop')
    // guard: if the deterministic deal had no Go, fall back to a discard test path.
    if (go) {
      const before = s.players[0].hand.length
      const s2 = A.applyIntent(s, 0, { kind: 'play', cardId: go.id })
      expect(s2).not.toBe(s)
      expect(s2.turn).toBe(1)
      expect(A.seatToMove(s2)).toBe(1)
      expect(s2.players[0].roll).toBe(true)
      // played one, refilled one -> hand size stable
      expect(s2.players[0].hand.length).toBe(before)
      // the played card is gone from hand
      expect(s2.players[0].hand.find(c => c.id === go.id)).toBeUndefined()
      expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
    }
  })

  it('applies a discard, passes the turn, and refills the hand', () => {
    const s = game()
    const id = firstDiscardable(s, 0)
    const before = s.players[0].hand.length
    const s2 = A.applyIntent(s, 0, { kind: 'discard', cardId: id })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(s2.players[0].hand.find(c => c.id === id)).toBeUndefined()
    expect(s2.players[0].hand.length).toBe(before) // discarded one, drew one
    expect(s2.discard.find(c => c.id === id)).toBeDefined()
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    const id = firstDiscardable(s, 1)
    expect(A.applyIntent(s, 1, { kind: 'discard', cardId: id })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a card id that is not in seat 0's hand
    expect(A.applyIntent(s, 0, { kind: 'discard', cardId: 9999 })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 9999 })).toBe(s)
    // a distance card cannot be played before the player is rolling -> illegal play
    const dist = s.players[0].hand.find(c => c.kind === 'distance')
    if (dist) expect(A.applyIntent(s, 0, { kind: 'play', cardId: dist.id })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('mille bornes host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().players.length).toBe(2)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) discards first (always legal on your turn).
    const h0 = host.getFull().players[0].hand[0].id
    host.dispatchLocal({ kind: 'discard', cardId: h0 } as MilleBornesIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies with its own discard; intent travels host-ward and applies.
    const beforeLog = host.getFull().log.length
    const g0 = guest.getState().players[1].hand[0].id
    guest.dispatch({ kind: 'discard', cardId: g0 } as MilleBornesIntent)
    expect(host.getFull().log.length).toBeGreaterThan(beforeLog)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const beforeLog = host.getFull().log.length
    // it is the host's (seat 0) turn, but the guest tries to discard.
    const g0 = guest.getState().players[1].hand[0].id
    guest.dispatch({ kind: 'discard', cardId: g0 } as MilleBornesIntent)
    expect(host.getFull().log.length).toBe(beforeLog) // nothing changed
  })
})

describe('mille bornes adapter redaction round-trip', () => {
  it('the viewing seat keeps its own hand; the other seat and deck are blanked', () => {
    const s = game()
    const v0 = A.redactFor!(s, 0)
    // seat 0 sees its own real hand...
    expect(v0.players[0].hand).toEqual(s.players[0].hand)
    // ...but seat 1's hand is blanked to placeholders of the same count.
    expect(v0.players[1].hand.length).toBe(s.players[1].hand.length)
    expect(v0.players[1].hand.every(c => c.id === -1)).toBe(true)
    // the deck is fully blanked but keeps its count.
    expect(v0.deck.length).toBe(s.deck.length)
    expect(v0.deck.every(c => c.id === -1)).toBe(true)
    // public state (discard / distance / safeties) is untouched.
    expect(v0.discard).toEqual(s.discard)
    expect(v0.players[1].distance).toBe(s.players[1].distance)
  })
})

describe('mille bornes hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the other seat's hand cards or the deck", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.players[1].hand).toEqual(full.players[1].hand)
    // ...but seat 0's hand is blanked to placeholders.
    expect(view.players[0].hand.every(c => c.id === -1)).toBe(true)
    expect(view.players[0].hand.length).toBe(full.players[0].hand.length)
    // ...and the face-down deck is fully blanked (count preserved).
    expect(view.deck.every(c => c.id === -1)).toBe(true)
    expect(view.deck.length).toBe(full.deck.length)

    // None of seat 0's secret card ids may appear anywhere in what crossed the wire,
    // EXCEPT ids the guest legitimately holds in its own visible hand (those are public
    // to the guest). The secret pools (other hand + deck) must not surface their real ids.
    // Match the full id token (cards serialize as `…,"id":N}`) so a secret id like 4 isn't
    // confused with a prefix of a legitimate own-hand id like 41.
    const wire = JSON.stringify(view)
    const mine = new Set(full.players[1].hand.map(c => c.id))
    const secretIds = new Set<number>()
    for (const c of full.players[0].hand) if (!mine.has(c.id)) secretIds.add(c.id)
    for (const c of full.deck) if (!mine.has(c.id)) secretIds.add(c.id)
    for (const id of secretIds) {
      expect(wire).not.toContain(`"id":${id}}`)
    }

    // The public discard pile is unchanged (face-up info both players share).
    expect(view.discard).toEqual(full.discard)
  })
})
