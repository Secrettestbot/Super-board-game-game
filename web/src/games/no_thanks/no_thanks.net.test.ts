/* NO THANKS! — netplay test. Browser-free proof of the online path:
 *  (1) the adapter round-trips a legal intent and rejects illegal / out-of-turn ones,
 *  (2) a HostSession + GuestSession stay in sync over an in-memory transport,
 *  (3) the leak test — a guest's view never contains the rival's secret chip count nor
 *      the face-down deck's true contents (the core hidden-info guarantee). */

import { describe, it, expect } from 'vitest'
import { noThanksAdapter as A } from './net'
import type { NoThanksIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as NT from './logic'
import type { Who } from './logic'

const whoOf = (seat: number): Who => (seat === 0 ? 'you' : 'ai')

describe('no thanks net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)

    const mover = A.seatToMove(s)!
    expect(mover === 0 || mover === 1).toBe(true)
    const other = 1 - mover
    const before = A.tickKey(s)

    // Out-of-turn: the seat NOT to move tries to take -> unchanged (===).
    expect(A.applyIntent(s, other, { kind: 'take' })).toBe(s)

    // Legal: the seat to move passes (fresh game has full chips, so passing is legal).
    const passed = A.applyIntent(s, mover, { kind: 'pass' })
    expect(passed).not.toBe(s)
    expect(A.tickKey(passed)).not.toBe(before)
    expect(passed.pot).toBe(s.pot + 1)
    expect(passed.chips[whoOf(mover)]).toBe(s.chips[whoOf(mover)] - 1)
    expect(A.seatToMove(passed)).toBe(other) // turn handed over

    // Legal: a take changes the state and advances the deck / flips a new card.
    const taken = A.applyIntent(passed, other, { kind: 'take' })
    expect(taken).not.toBe(passed)
    expect(taken.taken[whoOf(other)].length).toBe(1)
    expect(A.tickKey(taken)).not.toBe(A.tickKey(passed))

    // Illegal: passing with 0 chips must be a no-op (===).
    const broke = Object.assign({}, taken, { chips: { ...taken.chips, [whoOf(A.seatToMove(taken)!)]: 0 } })
    const mover2 = A.seatToMove(broke)!
    expect(A.applyIntent(broke, mover2, { kind: 'pass' })).toBe(broke)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])

    // The first player is random; branch on whichever seat moves first so the test is
    // deterministic either way (host = seat 0, guest = seat 1).
    if (A.seatToMove(host.getFull()) === 0) {
      host.dispatchLocal({ kind: 'pass' })
      expect(host.isMyTurn()).toBe(false)
      expect(guest.isMyTurn()).toBe(true)
      // Guest's synced view reflects the new pot.
      expect(guest.getState().pot).toBe(host.getFull().pot)
      // Guest replies; the host's authoritative state advances.
      const tickBefore = A.tickKey(host.getFull())
      guest.dispatch({ kind: 'take' })
      expect(A.tickKey(host.getFull())).not.toBe(tickBefore)
    } else {
      // Fresh game has the guest (seat 1) to move; guest acts first.
      expect(guest.isMyTurn()).toBe(true)
      const tickBefore = A.tickKey(host.getFull())
      guest.dispatch({ kind: 'pass' })
      expect(A.tickKey(host.getFull())).not.toBe(tickBefore)
      expect(host.isMyTurn()).toBe(true)
      expect(guest.getState().pot).toBe(host.getFull().pot)
    }
  })

  it('leak test — a guest never sees the rival chip count nor the deck contents', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b) // seat 1 -> 'ai'

    const full = host.getFull()
    const view = guest.getState()

    // The guest sees its OWN chip count (seat 1 = 'ai'), but the rival's ('you') is masked.
    expect(view.chips.ai).toBe(full.chips.ai)
    expect(view.chips.you).toBe(-1)
    expect(view.chips.you).not.toBe(full.chips.you)

    // The deck LENGTH survives (public), but every face-down card is masked.
    expect(view.deck.length).toBe(full.deck.length)
    for (const c of view.deck) expect(c).toBe(-1)

    // The host holds real (>=0) chip counts and a real deck; the guest must not have seen
    // those values cross the wire. Build a fingerprint and assert none of the deck's true
    // numbers nor the rival's chip count appear in the serialized guest view.
    const wire = JSON.stringify(view)
    // The rival ('you') chip count must not appear as a chip value. (We can't grep a raw
    // number globally — it may legitimately match a public card — so assert the field.)
    expect(wire).not.toContain(`"you":${full.chips.you}`)

    // None of the deck's true card numbers should be reconstructable from the guest view's
    // deck array; it is entirely sentinels.
    expect(view.deck.every(c => c === -1)).toBe(true)

    // Direct adapter redaction round-trip also hides the deck and rival chips for seat 1.
    const red = A.redactFor!(full, 1)
    expect(red.chips.you).toBe(-1)
    expect(red.chips.ai).toBe(full.chips.ai)
    expect(red.deck.length).toBe(full.deck.length)
    expect(red.deck.every(c => c === -1)).toBe(true)
    // The public face-up card and pot survive redaction.
    expect(red.card).toBe(full.card)
    expect(red.pot).toBe(full.pot)
  })
})

// keep the named intent type referenced so unused-import lint stays quiet
export type _NoThanksIntent = NoThanksIntent
