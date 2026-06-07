/* CODENAMES DUET — netplay tests. Adapter round-trip (legal / illegal / out-of-turn),
 * host+guest sync over an in-memory transport, and a hidden-info leak test proving a seat
 * never sees the OTHER seat's still-hidden key card. */

import { describe, it, expect } from 'vitest'
import { codenamesDuetAdapter as A, type CodenamesDuetIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as G from './logic'
import type { State, Role } from './logic'

const ROLES: Role[] = ['agent', 'bystander', 'assassin']

/** A legal clue for the current clue-giver: covers at least one of the partner's agents. */
function legalClue(s: State): CodenamesDuetIntent {
  const giver = A.seatToMove(s)! as 0 | 1
  const sg = G.clueSuggestions(s, giver)[0]
  return { kind: 'clue', word: sg.word, count: sg.number }
}

describe('codenames_duet net adapter', () => {
  it('round-trips a legal clue + guess and rejects illegal / out-of-turn', () => {
    const s = A.makeGame(7)
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)
    // Clue-giver acts first (no active clue) — that is seat 0.
    expect(A.seatToMove(s)).toBe(0)

    // out-of-turn: seat 1 tries to give a clue -> SAME state object back.
    expect(A.applyIntent(s, 1, legalClue(s))).toBe(s)
    // illegal: an empty clue word -> SAME state object back.
    expect(A.applyIntent(s, 0, { kind: 'clue', word: '   ', count: 2 })).toBe(s)
    // guess intent during the clue phase (no active clue) -> SAME state object back.
    expect(A.applyIntent(s, 0, { kind: 'guess', cell: 0 })).toBe(s)

    // legal clue from seat 0 -> state changes, a clue becomes active, and now the GUESSER
    // (seat 1) is to move.
    const s1 = A.applyIntent(s, 0, legalClue(s))
    expect(s1).not.toBe(s)
    expect(s1.clue).not.toBeNull()
    expect(A.seatToMove(s1)).toBe(1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))

    // out-of-turn during guess phase: seat 0 (clue-giver) cannot guess -> SAME state.
    expect(A.applyIntent(s1, 0, { kind: 'guess', cell: 0 })).toBe(s1)
    // illegal guess: out-of-range cell -> SAME state.
    expect(A.applyIntent(s1, 1, { kind: 'guess', cell: 999 })).toBe(s1)

    // legal guess from seat 1: tap one of seat-1's own agents the clue covered.
    const cover = s1.clue!.word
    const linked = G.ASSOCIATIONS[cover] ?? []
    const target = s1.cards.findIndex(c => linked.includes(c.word) && c.roles[1] === 'agent' && !c.contacted)
    expect(target).toBeGreaterThanOrEqual(0)
    const s2 = A.applyIntent(s1, 1, { kind: 'guess', cell: target })
    expect(s2).not.toBe(s1)
    expect(s2.cards[target].contacted).toBe(true)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))
  })

  it('pass ends the guesser turn (swaps the clue-giver)', () => {
    let s = A.makeGame(11)
    s = A.applyIntent(s, 0, legalClue(s)) // seat 0 gives a clue -> seat 1 guesses
    expect(A.seatToMove(s)).toBe(1)
    const giverBefore = s.clueGiver
    const s2 = A.applyIntent(s, 1, { kind: 'pass' })
    expect(s2).not.toBe(s)
    expect(s2.clue).toBeNull()
    expect(s2.clueGiver).not.toBe(giverBefore) // turn passed to the other clue-giver
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host = seat 0, guest gets the open seat 1
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])

    // Host (seat 0) gives a clue; now it's the guest's (seat 1) turn to guess.
    host.dispatchLocal(legalClue(host.getFull()))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // Guest guesses one of its own agents (resolved from its OWN view) — intent travels
    // host-ward and applies authoritatively.
    const gv = guest.getState()
    const cover = gv.clue!.word
    const linked = G.ASSOCIATIONS[cover] ?? []
    const target = gv.cards.findIndex(c => linked.includes(c.word) && c.roles[1] === 'agent' && !c.contacted)
    expect(target).toBeGreaterThanOrEqual(0)
    const beforeTick = A.tickKey(host.getFull())
    guest.dispatch({ kind: 'guess', cell: target })
    expect(A.tickKey(host.getFull())).not.toBe(beforeTick) // host advanced
    expect(host.getFull().cards[target].contacted).toBe(true)
  })

  it('redactFor hides the OTHER seat\'s still-hidden key and never leaks it over the wire', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b) // seat 1

    const full = host.getFull()
    const view = guest.getState() // what crossed the wire to seat 1

    let hiddenChecked = 0
    for (let i = 0; i < full.cards.length; i++) {
      const real = full.cards[i]
      const seen = view.cards[i]
      // The viewing seat (1) keeps its OWN real key entry.
      expect(seen.roles[1]).toBe(real.roles[1])
      if (!real.contacted && !real.revealed) {
        // The other seat's (0) role must NOT be a real role — it is the placeholder.
        expect(ROLES).not.toContain(seen.roles[0])
        expect(seen.roles[0]).not.toBe(real.roles[0])
        hiddenChecked++
      } else {
        // Resolved cards are public, so the true role is allowed through.
        expect(seen.roles[0]).toBe(real.roles[0])
      }
    }
    expect(hiddenChecked).toBeGreaterThan(0)

    // The host's view (seat 0) must likewise NOT expose seat 1's still-hidden key.
    const hostView = host.getState()
    for (let i = 0; i < full.cards.length; i++) {
      const real = full.cards[i]
      if (!real.contacted && !real.revealed) {
        expect(ROLES).not.toContain(hostView.cards[i].roles[1])
      }
    }

    // Sanity: public board words + shared counters survive redaction intact.
    expect(view.cards.map(c => c.word)).toEqual(full.cards.map(c => c.word))
    expect(view.turnsLeft).toBe(full.turnsLeft)
    expect(view.status).toBe(full.status)
  })
})
