/* THE CREW — netplay tests. Adapter round-trip (legal / illegal / out-of-turn),
 * host+guest sync over an in-memory transport, and a hidden-info leak test proving a
 * guest never receives a teammate's private hand. */

import { describe, it, expect } from 'vitest'
import { theCrewAdapter as A, type TheCrewIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as CR from './logic'
import type { CrewState } from './logic'

function play(cardId: number): TheCrewIntent { return { kind: 'play', cardId } }

/** A legal card for whichever seat is currently to move. */
function legalCardFor(s: CrewState): number {
  const seat = A.seatToMove(s)!
  return CR.legalCards(s.hands[seat], s.trick)[0].id
}

describe('the_crew net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    const seat = A.seatToMove(s)!            // the commander leads (could be any seat)
    expect(A.isOver(s)).toBe(false)
    expect(A.numSeats(s)).toBe(3)

    // out-of-turn: a different seat's play returns the SAME state object
    const other = (seat + 1) % 3
    const otherCard = s.hands[other][0].id
    expect(A.applyIntent(s, other, play(otherCard))).toBe(s)

    // illegal: a card not in the moving seat's hand returns the SAME state object
    expect(A.applyIntent(s, seat, play(-999))).toBe(s)

    // legal: a real follow-suit card advances the state and removes the card from hand
    const id = legalCardFor(s)
    const s2 = A.applyIntent(s, seat, play(id))
    expect(s2).not.toBe(s)
    expect(s2.hands[seat].some(c => c.id === id)).toBe(false)
    expect(s2.trick.length).toBe(1)
    expect(A.seatToMove(s2)).toBe((seat + 1) % 3)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))

    // communicate token is accepted as a no-op (returns input state unchanged)
    const seat2 = A.seatToMove(s2)!
    expect(A.applyIntent(s2, seat2, { kind: 'communicate', cardId: s2.hands[seat2][0].id })).toBe(s2)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)               // host=0, guest gets the lowest open seat
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest', 'ai'])

    // Drive the authority until it is the guest's (seat 1) turn, letting host(0)+AI(2)
    // act through the session APIs so both sides stay synced via redacted views.
    let guard = 0
    while (host.aiSeat() != null || host.isMyTurn()) {
      if (host.isMyTurn()) host.dispatchLocal(play(legalCardFor(host.getFull())))
      else host.stepAI()
      if (A.isOver(host.getFull())) break
      if (++guard > 200) throw new Error('no guest turn reached')
    }
    expect(A.isOver(host.getFull())).toBe(false)
    expect(host.getFull().turn).toBe(1)
    expect(guest.isMyTurn()).toBe(true)

    // Guest plays a legal card from ITS OWN view; intent travels host-ward and applies.
    const gState = guest.getState()
    const gCard = CR.legalCards(gState.hands[1], gState.trick)[0].id
    const beforeTick = A.tickKey(host.getFull())
    guest.dispatch(play(gCard))
    expect(A.tickKey(host.getFull())).not.toBe(beforeTick)            // host advanced
    expect(host.getFull().hands[1].some(c => c.id === gCard)).toBe(false)
  })

  it('redactFor hides teammates\' hands (count preserved) and never leaks over the wire', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()                 // what crossed the wire to seat 1

    // Seat 1 sees its own real hand…
    expect(view.hands[1]).toEqual(full.hands[1])
    // …but teammates' hands are blanked to placeholders, COUNT preserved.
    for (const p of [0, 2]) {
      expect(view.hands[p].length).toBe(full.hands[p].length)
      expect(view.hands[p].every(c => c.id === -1 && c.val === -1)).toBe(true)
    }

    // Public co-op info is intact (tasks + log not redacted).
    expect(view.tasks).toEqual(full.tasks)
    expect(view.log).toEqual(full.log)

    // No secret card id from a teammate's hand appears anywhere in the wire view.
    const wire = JSON.stringify(view)
    for (const p of [0, 2]) for (const c of full.hands[p]) {
      expect(wire).not.toContain(`"id":${c.id}`)
    }
  })
})
