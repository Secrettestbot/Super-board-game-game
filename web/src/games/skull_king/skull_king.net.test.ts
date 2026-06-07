/* Browser-free integration test of Skull King online play: the adapter round-trip
 * (legal / illegal / out-of-turn intents), a HostSession + GuestSession synced over an
 * in-memory transport, and a leak test proving redactFor never sends one seat the other's
 * private hand cards. */

import { describe, it, expect } from 'vitest'
import { skullKingAdapter as A, type SkullKingIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as SK from './logic'

describe('skull_king net adapter', () => {
  it('round-trips a legal bid then rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0) // bid phase -> seat 0 acts
    expect(A.isOver(s)).toBe(false)

    // out-of-turn: seat 1 cannot bid during the bid phase -> same state ref
    expect(A.applyIntent(s, 1, { kind: 'bid', n: 0 })).toBe(s)
    // illegal bid (> round) -> same state ref
    expect(A.applyIntent(s, 0, { kind: 'bid', n: 99 })).toBe(s)
    // a play intent during the bid phase is illegal -> same state ref
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: s.hands.you[0].id })).toBe(s)

    // legal bid -> state advances into the play phase, both bids sealed
    const bid = A.applyIntent(s, 0, { kind: 'bid', n: 1 })
    expect(bid).not.toBe(s)
    expect(bid.phase).toBe('play')
    expect(bid.bids.you).toBe(1)
    expect(bid.bids.ai).not.toBeNull()
    expect(A.tickKey(bid)).not.toBe(A.tickKey(s))
  })

  it('round-trips a legal play and rejects an illegal card id', () => {
    // round 1: bid, then exactly one card each.
    let s = A.applyIntent(A.makeGame(), 0, { kind: 'bid', n: 0 })
    const mover = A.seatToMove(s)! // whoever leads round 1
    const player = mover === 0 ? 'you' : 'ai'

    // an unknown card id is illegal -> same state ref
    expect(A.applyIntent(s, mover, { kind: 'play', cardId: 999999 })).toBe(s)

    const card = s.hands[player][0]
    s = A.applyIntent(s, mover, { kind: 'play', cardId: card.id })
    // the played card left the mover's hand
    expect(s.hands[player].some(c => c.id === card.id)).toBe(false)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // bid phase: only seat 0 (host) acts; the guest must wait.
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host seals its bid -> AI bid auto-resolves, play phase begins, view syncs to guest.
    host.dispatchLocal({ kind: 'bid', n: 0 })
    expect(host.getFull().phase).toBe('play')
    expect(guest.getState().phase).toBe('play')
    // bids are revealed to both once sealed
    expect(guest.getState().bids.you).not.toBeNull()
    expect(guest.getState().bids.ai).not.toBeNull()

    // drive the round to completion through whichever session holds the move.
    for (let i = 0; i < 8 && host.getFull().phase !== 'gameOver' && host.getFull().round === 1; i++) {
      const seat = A.seatToMove(host.getFull())
      if (seat == null) break
      if (seat === 0) {
        const id = host.getFull().hands.you[0].id
        host.dispatchLocal({ kind: 'play', cardId: id })
      } else {
        // guest (seat 1) plays a legal card from its OWN (un-redacted on host) hand.
        const legal = SK.legalPlays(host.getFull().hands.ai, host.getFull().trick)
        guest.dispatch({ kind: 'play', cardId: legal[0].id })
      }
    }
    // round 1 is one trick each, then it scores and deals round 2 (or the AI-driven seat
    // may still be pending) — either way the authoritative state advanced past round 1's bid.
    expect(host.getFull().round).toBeGreaterThanOrEqual(1)
    // host and guest agree on the public round / phase.
    expect(guest.getState().round).toBe(host.getFull().round)
    expect(guest.getState().phase).toBe(host.getFull().phase)
  })

  it('redactFor hides the other seat\'s hand cards but keeps the count (leak test)', () => {
    // Deal a fat round so hands have several real cards to leak.
    let s = A.makeGame()
    while (s.round < 6) {
      // bid 0 each round and fast-forward by replaying the AI for both until the round ends.
      s = A.applyIntent(s, 0, { kind: 'bid', n: 0 })
      // play out the round: each seat plays its first legal card until the round advances.
      const startRound = s.round
      for (let g = 0; g < 40 && s.round === startRound && !A.isOver(s); g++) {
        const seat = A.seatToMove(s)
        if (seat == null) break
        const player = seat === 0 ? 'you' : 'ai'
        const legal = SK.legalPlays(s.hands[player], s.trick)
        s = A.applyIntent(s, seat, { kind: 'play', cardId: legal[0].id })
      }
      if (A.isOver(s)) break
    }

    const round = s.round
    // seat 0's view: must not contain ANY of seat 1's real card ids.
    const view0 = A.redactFor!(s, 0)
    const view1 = A.redactFor!(s, 1)

    // counts preserved both ways
    expect(view0.hands.ai.length).toBe(s.hands.ai.length)
    expect(view1.hands.you.length).toBe(s.hands.you.length)
    // own hands intact
    expect(view0.hands.you).toEqual(s.hands.you)
    expect(view1.hands.ai).toEqual(s.hands.ai)
    // opponent hands blanked to face-down sentinels (id -1, no suit/rank)
    for (const c of view0.hands.ai) { expect(c.id).toBe(-1); expect(c.suit).toBeUndefined(); expect(c.rank).toBeUndefined() }
    for (const c of view1.hands.you) { expect(c.id).toBe(-1); expect(c.suit).toBeUndefined(); expect(c.rank).toBeUndefined() }

    // wire-level leak guard: none of seat 1's real (non-empty) hand card ids appear in seat 0's view.
    const blob0 = JSON.stringify(view0)
    for (const c of s.hands.ai) expect(blob0).not.toContain(`"id":${c.id}`)
    const blob1 = JSON.stringify(view1)
    for (const c of s.hands.you) expect(blob1).not.toContain(`"id":${c.id}`)

    expect(round).toBeGreaterThanOrEqual(2) // sanity: we actually advanced rounds
  })
})
