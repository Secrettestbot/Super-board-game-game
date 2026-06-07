/* RAPTOR — netplay tests. Proves the adapter round-trips a legal hidden play, rejects
 * illegal / out-of-turn intents, that a host (raptors, seat 0) and a guest (scientists, seat 1)
 * stay in sync over an in-memory transport while completing a simultaneous-reveal round, and
 * — critically for a hidden-info game — that the guest NEVER receives the host's private hand
 * or the host's parked card before it has committed its own. */

import { describe, it, expect } from 'vitest'
import { raptorAdapter as A, type RaptorIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as R from './logic'

const play = (cardId: number): RaptorIntent => ({ kind: 'play', cardId })

describe('raptor net adapter', () => {
  it('round-trips a legal play and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame(1)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // out-of-turn: seat 1 cannot act before seat 0 has parked a card -> unchanged (===)
    expect(A.applyIntent(s, 1, play(s.hands[1][0]))).toBe(s)
    // illegal: a card not in seat 0's hand -> unchanged (===)
    const notInHand = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(n => !s.hands[0].includes(n)) ?? 0
    expect(A.applyIntent(s, 0, play(notInHand))).toBe(s)
    // malformed intent -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'nope' } as unknown as RaptorIntent)).toBe(s)

    // legal seat-0 play: card parks, turn passes to seat 1, no card removed from hands yet
    const card0 = s.hands[0][0]
    const s1 = A.applyIntent(s, 0, play(card0))
    expect(s1).not.toBe(s)
    expect(s1.revealed[0]).toBe(card0)
    expect(A.seatToMove(s1)).toBe(1)
    expect(s1.hands[0]).toEqual(s.hands[0]) // not removed until revealCards runs

    // seat 0 cannot act again now; only seat 1 may
    expect(A.applyIntent(s1, 0, play(s1.hands[0][1]))).toBe(s1)

    // seat 1 completes the round: reveal + resolve happen in one shot
    const card1 = s1.hands[1][0]
    const s2 = A.applyIntent(s1, 1, play(card1))
    expect(s2).not.toBe(s1)
    // round fully settled: back to a fresh reveal (or game over), never left in 'resolve'
    expect(s2.phase === 'reveal' || s2.phase === 'gameover').toBe(true)
    if (s2.phase === 'reveal') {
      expect(A.seatToMove(s2)).toBe(0)
      expect(s2.revealed).toEqual([null, null])
      expect(s2.discards[0]).toContain(card0)
      expect(s2.discards[1]).toContain(card1)
    }
    // tickKey changed across each action
    expect(A.tickKey(s)).not.toBe(A.tickKey(s1))
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s2))
  })

  it('redactFor is a faithful round-trip for the viewing seat and hides the opponent hand', () => {
    const s = A.makeGame(2)
    const v0 = A.redactFor!(s, 0)
    const v1 = A.redactFor!(s, 1)
    // each seat sees its OWN real hand
    expect(v0.hands[0]).toEqual(s.hands[0])
    expect(v1.hands[1]).toEqual(s.hands[1])
    // and a count-preserving but value-blanked opponent hand
    expect(v0.hands[1]).toHaveLength(s.hands[1].length)
    expect(v0.hands[1].every(c => c === 0)).toBe(true)
    expect(v1.hands[0]).toHaveLength(s.hands[0].length)
    expect(v1.hands[0].every(c => c === 0)).toBe(true)
    // public board state is untouched
    expect(v0.pieces).toEqual(s.pieces)
    expect(v0.babiesEscaped).toBe(s.babiesEscaped)
  })

  it('host (raptors) + guest (scientists) stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // seat 0 (host) chooses first
    expect(guest.isMyTurn()).toBe(false)

    // host parks a card -> now it's the guest's turn, view synced
    const c0 = host.getFull().hands[0][0]
    host.dispatchLocal(play(c0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest replies -> the round resolves on the host, advancing the authoritative state
    const beforeTurn = host.getFull().turn
    const c1 = guest.getState().hands[1][0]
    guest.dispatch(play(c1))
    expect(host.getFull().turn).toBeGreaterThan(beforeTurn)
    // back to the host (seat 0) to start the next round (unless the game ended)
    if (host.getFull().winner == null) {
      expect(host.isMyTurn()).toBe(true)
      expect(guest.isMyTurn()).toBe(false)
    }
    // guest's view tracks the host's round counter
    expect(guest.getState().round).toBe(host.getFull().round)
  })

  it('LEAK TEST: the guest never sees the host hand or the host parked card', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    // Snapshot the host's true private hand (seat 0) BEFORE anything is played.
    const secretHand = host.getFull().hands[0].slice()

    // Initial view: none of seat 0's real card values may appear in the guest's hand slot.
    let view = guest.getState()
    expect(view.hands[0].every(c => c === 0)).toBe(true)

    // Host parks a card. The guest must NOT learn which card (simultaneous reveal).
    const parked = secretHand[0]
    host.dispatchLocal(play(parked))
    view = guest.getState()
    expect(guest.isMyTurn()).toBe(true)           // guest knows it's their turn...
    expect(view.revealed[0]).not.toBe(parked)     // ...but cannot see the host's actual card
    expect(view.revealed[0]).toBe(0)              // it is redacted to the hidden placeholder

    // The host's whole private hand must still be hidden in the parked state.
    expect(view.hands[0].every(c => c === 0)).toBe(true)

    // Belt-and-braces: scan the guest's serialized host-hand slot — it must carry only the
    // hidden placeholder, never any real card value. (The guest's OWN hand is allowed to
    // contain real values, so we scan the redacted slot specifically.)
    expect(JSON.stringify(view.hands[0])).toBe(JSON.stringify(secretHand.map(() => 0)))
  })
})
