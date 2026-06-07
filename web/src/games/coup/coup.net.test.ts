/* COUP — netplay tests. Proves the adapter round-trips a legal action, rejects illegal /
 * out-of-turn intents, that a HostSession + GuestSession stay in sync over an in-memory
 * transport, and — the crucial guard for a hidden-info game — that a guest's view never
 * contains any OTHER seat's un-revealed influence characters or the secret court deck. */

import { describe, it, expect } from 'vitest'
import { coupAdapter as A } from './net'
import type { CoupIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as C from './logic'
import type { Character, CoupState } from './logic'

/* A fully-known 15-card deck. makeGame deals the first 6 to seats 0,1,2 (two each) and keeps the
 * rest. We arrange the dealt cards so each seat holds DISTINCT characters from the others, so a
 * leak check can assert specific characters never appear in a guest's view. The unused middle of
 * CHARACTERS (3 copies each) makes up the legal multiset; we just order it deliberately. */
function knownDeck(): Character[] {
  // seat0: Duke,Duke | seat1: Captain,Captain | seat2: Ambassador,Ambassador | rest -> deck
  return [
    'Duke', 'Duke',           // -> seat 0
    'Captain', 'Captain',     // -> seat 1
    'Ambassador', 'Ambassador', // -> seat 2
    // remaining 9 (1 Duke, 1 Captain, 1 Ambassador, 3 Assassin, 3 Contessa) form the deck
    'Assassin', 'Assassin', 'Assassin',
    'Contessa', 'Contessa', 'Contessa',
    'Duke', 'Captain', 'Ambassador',
  ]
}

function game(): CoupState {
  return C.makeGame(knownDeck())
}

describe('coup net adapter', () => {
  it('round-trips a legal action and rejects illegal / out-of-turn intents', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0) // seat 0 acts first, no pending

    // out-of-turn: seat 1 tries to act while it's seat 0's turn -> unchanged (===)
    expect(A.applyIntent(s, 1, { kind: 'action', type: 'income' })).toBe(s)
    // illegal: coup with only 2 coins -> not in legalActions -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'action', type: 'coup', target: 1 })).toBe(s)
    // illegal: targeted action with a bad target -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'action', type: 'steal', target: 99 })).toBe(s)
    // wrong intent kind for a fresh action turn -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'challenge' })).toBe(s)

    // legal: Income (unblockable, unchallengeable) resolves immediately and passes the turn
    const s1 = A.applyIntent(s, 0, { kind: 'action', type: 'income' })
    expect(s1).not.toBe(s)
    expect(s1.players[0].coins).toBe(C.START_COINS + 1)
    expect(A.seatToMove(s1)).toBe(1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))
  })

  it('opens a reaction window and routes the active decider through seatToMove', () => {
    const s = game()
    // Seat 0 claims the Duke and levies Tax -> opens an action-challenge window for the others.
    const s1 = A.applyIntent(s, 0, { kind: 'action', type: 'tax' })
    expect(s1.pending).not.toBeNull()
    expect(s1.pending!.kind).toBe('action_challenge')
    const decider = A.seatToMove(s1)
    expect(decider).toBe(s1.pending!.decider)
    expect(decider).not.toBe(0) // an opponent must react, not the actor

    // The actor cannot self-react; a non-decider opponent cannot react out of turn.
    expect(A.applyIntent(s1, 0, { kind: 'allow' })).toBe(s1)
    const notDecider = [1, 2].find(i => i !== decider)!
    expect(A.applyIntent(s1, notDecider, { kind: 'allow' })).toBe(s1)

    // The active decider allows -> the window advances (state changes, tick changes).
    const s2 = A.applyIntent(s1, decider!, { kind: 'allow' })
    expect(s2).not.toBe(s1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    // The host's authority state uses logic's default random deck; that's fine here — we only
    // assert structural sync, not specific cards.
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host=0, guest gets the next open seat
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest', 'ai'])

    // Host (seat 0) takes Income; the guest's view advances and seat 1 may now act/react.
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal({ kind: 'action', type: 'income' })
    const gv = guest.getState()
    expect(gv.players[0].coins).toBe(host.getFull().players[0].coins)
    expect(A.seatToMove(gv)).toBe(A.seatToMove(host.getFull()))

    // Drive the table forward via the host's AI loop; it must terminate at a decision the guest
    // owns or at game over (the forced coup guarantees progress).
    let guard = 0
    while (host.aiSeat() != null && guard++ < 5000) host.stepAI()
    // Either the game ended, or it is waiting on the guest (seat 1) for a decision.
    if (!A.isOver(host.getFull())) {
      expect(A.seatToMove(host.getFull())).toBe(1)
      expect(guest.isMyTurn()).toBe(true)
    }
    // The guest's view always tracks the host's authoritative turn/winner.
    expect(A.seatToMove(guest.getState())).toBe(A.seatToMove(host.getFull()))
    expect(guest.getState().winner).toBe(host.getFull().winner)
  })

  it('LEAK: a guest never sees other seats\' face-down influence or the court deck', () => {
    // Seed the host with the known deck via a custom adapter wrapper so we can assert on chars.
    const seeded = { ...A, makeGame: () => game() }
    const host = new HostSession(seeded)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(seeded, b)
    const mySeat = guest.mySeat() // 1

    const view = guest.getState()
    const blob = JSON.stringify(view)

    // The guest sees its OWN real influence (seat 1 holds two Captains).
    expect(view.players[mySeat].cards.map(c => c.char)).toEqual(['Captain', 'Captain'])

    // Every OTHER seat's un-revealed cards are placeholders: slot + revealed flag kept, char hidden.
    for (let seat = 0; seat < A.numSeats(view); seat++) {
      if (seat === mySeat) continue
      expect(view.players[seat].cards.length).toBe(2) // count preserved
      for (const c of view.players[seat].cards) {
        expect(c.revealed).toBe(false)
        expect(C.CHARACTERS).not.toContain(c.char) // never a real character
      }
    }

    // Seat 0 holds Dukes, seat 2 holds Ambassadors — neither must appear in the guest's view.
    // (The guest holds no Duke/Ambassador, so any occurrence would be a genuine leak.)
    expect(blob).not.toContain('Duke')
    expect(blob).not.toContain('Ambassador')

    // The secret court deck is fully blanked (no real character ids leak).
    const authDeck = host.getFull().deck
    expect(view.deck.length).toBe(authDeck.length) // length preserved
    for (const ch of view.deck) expect(C.CHARACTERS).not.toContain(ch)
    // Assassin/Contessa live only in the deck here -> they must not cross the wire at all.
    expect(blob).not.toContain('Assassin')
    expect(blob).not.toContain('Contessa')
  })
})

// Type-only: ensure the intent union stays JSON-serializable plain objects.
const _sample: CoupIntent[] = [
  { kind: 'action', type: 'tax' },
  { kind: 'challenge' },
  { kind: 'allow' },
  { kind: 'block', as: 'Duke' },
  { kind: 'reveal', card: 0 },
  { kind: 'exchange', keep: ['Duke'] },
]
void _sample
