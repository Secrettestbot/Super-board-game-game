/* THE MIND — netplay tests. Adapter round-trip (legal / illegal / out-of-turn), a
 * host+guest sync over an in-memory transport, and a hidden-info leak test proving a
 * guest never receives a teammate's private hand (only counts). */

import { describe, it, expect } from 'vitest'
import { theMindAdapter as A, type TheMindIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as M from './logic'
import type { MindState } from './logic'

const PLAY: TheMindIntent = { kind: 'play' }

/** A deterministic deal via the logic's deck seam (round-robin: p0=deck[0], p1=deck[1], …). */
function deal(deck: number[], level = 1): MindState {
  return M.makeGame(level, deck)
}

describe('the_mind net adapter', () => {
  it('round-trips a legal play and rejects illegal / out-of-turn', () => {
    // p0=[1], p1=[50], p2=[90] -> global lowest (1) is seat 0's, so seat 0 is to move.
    const s = deal([1, 50, 90], 1)
    expect(A.isOver(s)).toBe(false)
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0)

    // out-of-turn: a seat that is NOT the lowest holder returns the SAME state object
    expect(A.applyIntent(s, 1, PLAY)).toBe(s)
    expect(A.applyIntent(s, 2, PLAY)).toBe(s)

    // illegal: a seat with an empty hand returns the SAME state object
    const empty: MindState = { ...s, hands: [[], [50], [90]] }
    expect(A.seatToMove(empty)).toBe(1)            // lowest now p1
    expect(A.applyIntent(empty, 0, PLAY)).toBe(empty)

    // legal: seat 0 plays its lowest (1) -> state advances, card leaves the hand,
    // pile top becomes 1, and the turn passes to the next lowest holder (p1).
    const s2 = A.applyIntent(s, 0, PLAY)
    expect(s2).not.toBe(s)
    expect(s2.hands[0]).toEqual([])
    expect(s2.pileTop).toBe(1)
    expect(s2.lives).toBe(M.START_LIVES)            // correct play, no life lost
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('a shuriken round-trips from the seat to move and a no-op shuriken is unchanged', () => {
    const s = deal([1, 50, 90], 1)
    expect(A.seatToMove(s)).toBe(0)
    // star from the wrong seat returns the SAME state
    expect(A.applyIntent(s, 1, { kind: 'star' })).toBe(s)
    // star from the seat to move spends a shuriken & discards each lowest
    const s2 = A.applyIntent(s, 0, { kind: 'star' })
    expect(s2).not.toBe(s)
    expect(s2.shuriken).toBe(s.shuriken - 1)
    // with no shuriken left, a further star is a no-op (same object)
    expect(A.applyIntent(s2, A.seatToMove(s2)!, { kind: 'star' })).toBe(s2)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)                  // host=0, guest gets the lowest open seat
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest', 'ai'])

    // Drive the authority until it is the guest's (seat 1) turn — i.e. seat 1 holds the
    // global lowest. Let host(0) and the AI(2) act through the session APIs so both sides
    // stay synced via redacted views. (Random deal, so loop until seat 1 is to move.)
    let guard = 0
    while (!A.isOver(host.getFull()) && host.getFull().phase === 'playing') {
      const seat = A.seatToMove(host.getFull())
      if (seat === 1) break
      if (seat === 0) host.dispatchLocal(M.levelComplete(host.getFull()) ? { kind: 'advance' } : PLAY)
      else if (host.aiSeat() != null) host.stepAI()
      if (++guard > 5000) throw new Error('seat 1 never reached the lead')
    }
    expect(host.getFull().phase).toBe('playing')
    expect(A.seatToMove(host.getFull())).toBe(1)
    expect(guest.isMyTurn()).toBe(true)

    // Guest plays its lowest; the intent travels host-ward and applies authoritatively.
    const beforeTick = A.tickKey(host.getFull())
    const guestLowBefore = guest.getState().hands[1][0]
    guest.dispatch(PLAY)
    expect(A.tickKey(host.getFull())).not.toBe(beforeTick)         // host advanced
    expect(host.getFull().pileTop).toBe(guestLowBefore)           // guest's lowest is on the pile
  })

  it('redactFor hides teammates\' hands (count preserved) and never leaks over the wire', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()                   // what crossed the wire to seat 1

    // Seat 1 sees its own real hand…
    expect(view.hands[1]).toEqual(full.hands[1])
    // …but teammates' hands are blanked to constant sentinels (0 = to-move marker, else a
    // HIGH placeholder above any real card), COUNT preserved, no real card values.
    for (const p of [0, 2]) {
      expect(view.hands[p].length).toBe(full.hands[p].length)
      expect(view.hands[p].every(v => v === 0 || v === M.DECK_SIZE + 1)).toBe(true)
    }

    // Public co-op info is intact (pile / level / lives / shuriken / log not redacted).
    expect(view.pile).toEqual(full.pile)
    expect(view.level).toBe(full.level)
    expect(view.lives).toBe(full.lives)
    expect(view.shuriken).toBe(full.shuriken)
    expect(view.log).toEqual(full.log)

    // No teammate's secret card value survives into the redacted hands: every slot in a
    // teammate's wire hand is a constant sentinel, never one of their real card values.
    const secrets = new Set<number>([...full.hands[0], ...full.hands[2]])
    for (const p of [0, 2]) for (const v of view.hands[p]) {
      expect(secrets.has(v)).toBe(false)
    }
  })
})
