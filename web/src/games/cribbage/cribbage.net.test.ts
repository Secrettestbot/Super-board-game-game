/* CRIBBAGE — netplay tests. Adapter round-trip (legal/illegal/out-of-turn discards and
 * pegging), a real host/guest integration over an in-memory transport, and a hidden-info
 * LEAK test proving a guest's view never carries the opponent's hand, the face-down crib or
 * the undealt deck. Deals are deterministic (a fixed deck) so every assertion is reproducible. */

import { describe, it, expect } from 'vitest'
import { cribbageAdapter as A, cardId, type CribbageIntent } from './net'
import * as C from './logic'
import type { Card } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

const card = (r: number, s: Card['s']): Card => ({ r, s })

/** A deterministic deal: you = first 6 of the deck, ai = next 6, starter = card[12].
 *  dealer 'ai' means the non-dealer ('you' = seat 0) leads the play, matching seatToMove. */
function game() { return A.makeGame() }

describe('cribbage net adapter', () => {
  it('starts in discard with seat 0 owed the first action', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal toCrib discard for seat 0, then owes seat 1', () => {
    const s = game()
    const ids = [cardId(s.hands.you[0]), cardId(s.hands.you[1])]
    const s2 = A.applyIntent(s, 0, { kind: 'toCrib', cardIds: ids })
    expect(s2).not.toBe(s)
    expect(s2.full.you.length).toBe(4)
    expect(s2.crib.length).toBe(2)
    expect(A.seatToMove(s2)).toBe(1) // ai still owes its discard
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('reaches the play phase and round-trips a legal peg', () => {
    let s = game()
    s = A.applyIntent(s, 0, { kind: 'toCrib', cardIds: [cardId(s.hands.you[0]), cardId(s.hands.you[1])] })
    s = A.applyIntent(s, 1, { kind: 'toCrib', cardIds: [cardId(s.hands.ai[0]), cardId(s.hands.ai[1])] })
    expect(s.phase).toBe('play')
    const leader = A.seatToMove(s)! // non-dealer leads
    const leadSide = leader === 0 ? 'you' : 'ai'
    const c = s.hands[leadSide].find(c => s.count + C.pipValue(c.r) <= 31)!
    const before = s.played.length
    const s2 = A.applyIntent(s, leader, { kind: 'peg', cardId: cardId(c) })
    expect(s2).not.toBe(s)
    expect(s2.played.length).toBe(before + 1)
  })

  it('rejects out-of-turn and illegal intents (returns the same ref)', () => {
    const s = game()
    const goodIds = [cardId(s.hands.you[0]), cardId(s.hands.you[1])]
    // out of turn: seat 1 tries to discard while seat 0 is owed
    expect(A.applyIntent(s, 1, { kind: 'toCrib', cardIds: [cardId(s.hands.ai[0]), cardId(s.hands.ai[1])] })).toBe(s)
    // illegal: a card id that seat 0 does not hold
    expect(A.applyIntent(s, 0, { kind: 'toCrib', cardIds: [9999, goodIds[1]] })).toBe(s)
    // illegal: two of the same id
    expect(A.applyIntent(s, 0, { kind: 'toCrib', cardIds: [goodIds[0], goodIds[0]] })).toBe(s)
    // wrong-phase: pegging during the discard phase
    expect(A.applyIntent(s, 0, { kind: 'peg', cardId: goodIds[0] })).toBe(s)
    // wrong-phase: advancing the show during discard
    expect(A.applyIntent(s, 0, { kind: 'next' })).toBe(s)
  })

  it('aiStep drives a seat: it discards when owed', () => {
    let s = game()
    s = A.applyIntent(s, 0, { kind: 'toCrib', cardIds: [cardId(s.hands.you[0]), cardId(s.hands.you[1])] })
    expect(A.seatToMove(s)).toBe(1)
    const s2 = A.aiStep(s, 1)
    expect(s2.full.ai.length).toBe(4)
    expect(s2.phase).toBe('play') // both discarded -> starter cut, play begins
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('cribbage host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().phase).toBe('discard')
  })

  it('relays both discards and keeps host + guest in sync through the cut', () => {
    const { host, guest } = connect()
    // host (seat 0) discards first
    const full0 = host.getFull()
    host.dispatchLocal({ kind: 'toCrib', cardIds: [cardId(full0.hands.you[0]), cardId(full0.hands.you[1])] })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) discards via its own (real) hand in the redacted view
    const gview = guest.getState()
    guest.dispatch({ kind: 'toCrib', cardIds: [cardId(gview.hands.ai[0]), cardId(gview.hands.ai[1])] } as CribbageIntent)

    // both discards landed -> the play has started on the host, and the guest view matches
    const hf = host.getFull()
    expect(hf.phase).toBe('play')
    expect(hf.crib.length).toBe(4)
    expect(guest.getState().phase).toBe('play')
    expect(guest.getState().ply).toBe(hf.ply)
  })

  it('rejects an out-of-turn guest discard (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().ply
    const gview = guest.getState()
    // it is the host's (seat 0) turn to discard, but the guest tries first
    guest.dispatch({ kind: 'toCrib', cardIds: [cardId(gview.hands.ai[0]), cardId(gview.hands.ai[1])] } as CribbageIntent)
    expect(host.getFull().ply).toBe(before) // nothing changed
  })
})

describe('cribbage hidden-info redaction (leak test)', () => {
  it("a guest's view hides the opponent's hand, the crib and the deck", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1 ('ai')

    // The guest sees its OWN real hand intact...
    expect(view.hands.ai).toEqual(full.hands.ai)
    // ...but the opponent's (seat 0 / 'you') hand is blanked to placeholders.
    expect(view.hands.you).toEqual(full.hands.you.map(() => ({ r: 0, s: 'S' })))
    // ...and the undealt deck is fully blanked.
    expect(view.deck.every(c => c.r === 0)).toBe(true)
    expect(view.deck.length).toBe(full.deck.length)

    // None of seat 0's real card values survive in the wire view's hand region.
    const leaked = JSON.stringify(full.hands.you)
    expect(JSON.stringify(view.hands.you)).not.toBe(leaked)
    for (const c of full.hands.you) {
      // a unique-enough fingerprint per card (rank+suit) must not appear in the wire hand
      expect(JSON.stringify(view.hands.you)).not.toContain(`"r":${c.r},"s":"${c.s}"`)
    }
  })

  it('hides the crib until the show, then reveals it', () => {
    // Deterministic deck so we can drive a whole hand to the show.
    const deck = C.freshDeck()
    let s = C.makeGame(deck, 'ai') // 'you' (seat 0) is non-dealer -> leads
    // Both discard their last two cards (indices 4,5) via the adapter.
    s = A.applyIntent(s, 0, { kind: 'toCrib', cardIds: [cardId(s.hands.you[4]), cardId(s.hands.you[5])] })
    s = A.applyIntent(s, 1, { kind: 'toCrib', cardIds: [cardId(s.hands.ai[4]), cardId(s.hands.ai[5])] })
    expect(s.phase).toBe('play')
    expect(s.crib.length).toBe(4)

    // During the play, the crib is hidden from seat 0's view (it belongs to the dealer, seat 1).
    const playView = A.redactFor!(s, 0)
    expect(playView.crib.every(c => c.r === 0)).toBe(true)

    // Drive the play to completion (both hands of 4 cards) via aiStep / pegs.
    let guard = 0
    while (s.phase === 'play' && guard++ < 100) {
      const seat = A.seatToMove(s)
      if (seat == null) break
      const side = seat === 0 ? 'you' : 'ai'
      if (!C.canPlay(s, side)) { s = A.applyIntent(s, seat, { kind: 'go' }); continue }
      const c = s.hands[side].find(c => s.count + C.pipValue(c.r) <= 31)!
      s = A.applyIntent(s, seat, { kind: 'peg', cardId: cardId(c) })
    }
    expect(s.phase === 'show' || s.winner != null).toBe(true)

    // Now the crib is revealed in every seat's view.
    const showView = A.redactFor!(s, 0)
    expect(showView.crib).toEqual(s.crib)
    expect(showView.crib.some(c => c.r !== 0)).toBe(true)
  })
})
