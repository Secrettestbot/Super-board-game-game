/* HANABI — netplay tests. Adapter round-trip (legal / illegal / out-of-turn), host+guest
 * sync over an in-memory transport, and the INVERSE hidden-info leak test: a viewer's OWN
 * hand is masked while every teammate's hand stays visible (Hanabi's whole gimmick). */

import { describe, it, expect } from 'vitest'
import { hanabiAdapter as A, type HanabiIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import type { HanabiState } from './logic'

/** A clue that legally matches >=1 of the target seat's cards. */
function legalHintFor(s: HanabiState, to: number): HanabiIntent {
  const card = s.hands[to][0].card
  return { kind: 'hint', toSeat: to, hint: { kind: 'color', color: card.color } }
}

describe('hanabi net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.isOver(s)).toBe(false)
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0)

    // out-of-turn: a seat-1 play returns the SAME state object
    expect(A.applyIntent(s, 1, { kind: 'play', cardIdx: 0 })).toBe(s)

    // illegal hint to self returns the SAME state object
    expect(A.applyIntent(s, 0, { kind: 'hint', toSeat: 0, hint: { kind: 'value', value: 1 } })).toBe(s)
    // illegal: a card slot that does not exist returns the SAME state object
    expect(A.applyIntent(s, 0, { kind: 'play', cardIdx: 99 })).toBe(s)

    // legal hint: spends a clue token, advances the turn, bumps the tick key
    const s2 = A.applyIntent(s, 0, legalHintFor(s, 1))
    expect(s2).not.toBe(s)
    expect(s2.clueTokens).toBe(s.clueTokens - 1)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))

    // legal play from seat 0 also advances and changes the tick key
    const s3 = A.applyIntent(s, 0, { kind: 'play', cardIdx: 0 })
    expect(s3).not.toBe(s)
    expect(A.tickKey(s3)).not.toBe(A.tickKey(s))
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)                 // host=0, guest gets the lowest open seat
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest', 'ai'])

    // Host (seat 0) gives a legal clue to the guest; intent applies and turn passes to 1.
    host.dispatchLocal(legalHintFor(host.getFull(), 1))
    expect(host.getFull().turn).toBe(1)
    expect(guest.isMyTurn()).toBe(true)

    // Guest (seat 1) plays a card from ITS OWN view; intent travels host-ward and applies.
    const beforeTick = A.tickKey(host.getFull())
    guest.dispatch({ kind: 'play', cardIdx: 0 })
    expect(A.tickKey(host.getFull())).not.toBe(beforeTick)   // host advanced
    expect(host.getFull().turn).toBe(2)
  })

  it('INVERSE redaction: a viewer\'s OWN hand is masked while teammates stay visible', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)         // seat 1

    const full = host.getFull()
    const view = guest.getState()               // what crossed the wire to seat 1

    // Seat 1's OWN hand is blanked to placeholders — count preserved, clue `known` kept,
    // but the true colors/values gone (the inverse of an ordinary hand game).
    expect(view.hands[1].length).toBe(full.hands[1].length)
    for (let i = 0; i < view.hands[1].length; i++) {
      expect(view.hands[1][i].card).toEqual({ id: -1, color: 'red', value: 1 })
      expect(view.hands[1][i].known).toEqual(full.hands[1][i].known)
    }

    // Every TEAMMATE's hand is fully visible (you CAN see others' cards).
    for (const p of [0, 2]) {
      expect(view.hands[p]).toEqual(full.hands[p])
    }

    // The face-down draw deck order is hidden but its count survives.
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(c => c.id === -1)).toBe(true)

    // Public co-op info is intact (fireworks, tokens, log not redacted).
    expect(view.fireworks).toEqual(full.fireworks)
    expect(view.clueTokens).toBe(full.clueTokens)
    expect(view.log).toEqual(full.log)

    // Seat 1's OWN cards + the deck are fully masked to the -1 placeholder, so none of
    // their true identities survive into the wire view. (Teammate ids ARE legitimately
    // visible — that is Hanabi's gimmick — so a blanket substring scan would false-flag
    // a teammate id that contains an own id as a digit-substring; we assert masking
    // directly instead, which is the actual hidden-info guarantee.)
    for (const hc of view.hands[1]) expect(hc.card).toEqual({ id: -1, color: 'red', value: 1 })
    expect(view.deck.every(c => c.id === -1 && c.color === 'red' && c.value === 1)).toBe(true)
  })
})
