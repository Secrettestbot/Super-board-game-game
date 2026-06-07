/* LOVE LETTER — netplay tests. Proves the adapter round-trips a legal play, rejects
 * illegal / out-of-turn / wrong-phase intents, that a HostSession + GuestSession stay in
 * sync over an in-memory transport, and — the crucial guard for a hidden-info game — that
 * a guest's view never contains the OTHER seat's hand cards or the face-down draw deck. */

import { describe, it, expect } from 'vitest'
import { loveLetterAdapter as A } from './net'
import type { LoveLetterIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as LL from './logic'
import type { LoveLetterState, CardValue } from './logic'

/** Build a legal `play` intent for a card the seat-to-move actually holds, supplying a
 *  Guard guess / Prince target where the card requires one. */
function playIntent(s: LoveLetterState, seat: number, card: CardValue): LoveLetterIntent {
  if (card === 1) return { kind: 'play', card: 1, guess: 5 }
  if (card === 5) return { kind: 'play', card: 5, target: (1 - seat) as 0 | 1 }
  return { kind: 'play', card }
}

describe('love_letter net adapter', () => {
  it('round-trips a legal play and rejects illegal / out-of-turn / wrong-phase intents', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)   // seat 0 starts, holding 2 cards
    expect(A.isOver(s)).toBe(false)
    expect(s.hands[0].length).toBe(2)

    const legal = LL.legalPlays(s, 0)
    expect(legal.length).toBeGreaterThan(0)
    const card = legal[0]

    // out-of-turn: seat 1 tries to play -> unchanged (===)
    expect(A.applyIntent(s, 1, playIntent(s, 1, card))).toBe(s)
    // illegal: a card seat 0 does not (legally) hold -> unchanged
    const notHeld = ([1, 2, 3, 4, 5, 6, 7, 8] as CardValue[]).find(v => !legal.includes(v))!
    expect(A.applyIntent(s, 0, playIntent(s, 0, notHeld))).toBe(s)
    // wrong intent kind during a live turn ('next' is only valid between rounds) -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'next' })).toBe(s)

    // legal: seat 0 plays -> state changes and the turn leaves seat 0
    const s1 = A.applyIntent(s, 0, playIntent(s, 0, card))
    expect(s1).not.toBe(s)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))
    // the round either passed to seat 1 or ended (seat 0 owes the next-round advance)
    expect(A.seatToMove(s1) === 1 || (s1.roundOver && A.seatToMove(s1) === 0)).toBe(true)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host=0, guest gets the next open seat

    expect(host.isMyTurn()).toBe(true) // seat 0 leads
    const full = host.getFull()
    const card = LL.legalPlays(full, 0)[0]
    host.dispatchLocal(playIntent(full, 0, card))

    // After seat 0's play the turn is either the guest's (round continues) or the round
    // ended; in the common case it is now seat 1 to move and the guest's view reflects it.
    if (host.getFull().turn === 1 && !host.getFull().roundOver) {
      expect(guest.isMyTurn()).toBe(true)
      const gv = guest.getState()
      const gcard = LL.legalPlays(gv, 1)[0]
      guest.dispatch(playIntent(gv, 1, gcard))
    }
    // guest's view tracks the host's authoritative public counters
    expect(guest.getState().discards.length).toBe(host.getFull().discards.length)
    expect(guest.getState().deck.length).toBe(host.getFull().deck.length)
    expect(guest.getState().tokens).toEqual(host.getFull().tokens)
  })

  it('LEAK: a guest never sees the other seat\'s hand or the face-down draw deck', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    const mySeat = guest.mySeat() // 1
    const otherSeat = 0

    // Sanity: we are mid-round (live play), so nothing should be revealed to the guest.
    const authFull = host.getFull()
    expect(authFull.roundOver).toBe(false)
    expect(authFull.winner).toBeNull()

    const view = guest.getState()
    const blob = JSON.stringify(view)

    // The guest sees its OWN real hand (all real card values 1..8)...
    expect(view.hands[mySeat].length).toBe(authFull.hands[mySeat].length)
    expect(view.hands[mySeat].every(v => (v as number) >= 1 && (v as number) <= 8)).toBe(true)
    expect(view.hands[mySeat]).toEqual(authFull.hands[mySeat])

    // ...but the OTHER seat's hand is masked to the placeholder (count kept, values hidden).
    expect(view.hands[otherSeat].length).toBe(authFull.hands[otherSeat].length) // count preserved
    expect(view.hands[otherSeat].every(v => (v as number) === 0)).toBe(true)     // values stripped

    // The face-down draw DECK is fully masked (its public length is preserved).
    expect(view.deck.length).toBe(authFull.deck.length)
    expect(view.deck.every(v => (v as number) === 0)).toBe(true)

    // The other seat's real card value never appears as a hand entry on the wire, and the
    // real deck contents never cross either: the only place a real value would leak is the
    // opponent hand / deck arrays, both proven masked above. Belt-and-suspenders: the
    // masked arrays serialize without any of the secret structure.
    const secretHand = JSON.stringify(authFull.hands[otherSeat])
    if (secretHand !== JSON.stringify(view.hands[otherSeat])) {
      expect(blob).not.toContain(secretHand)
    }
    const secretDeck = JSON.stringify(authFull.deck)
    expect(blob).not.toContain(secretDeck)
  })
})
