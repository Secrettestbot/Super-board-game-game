/* LIAR'S DICE — netplay tests. Three parts:
 *   1. adapter round-trip: a legal bid advances; illegal / out-of-turn intents are no-ops.
 *   2. host + guest stay in sync over an in-memory transport (the headless online proof).
 *   3. leak test: while bidding, the guest never sees the host's secret dice values. */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { liarsDiceAdapter as A, type LiarsIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as LD from './logic'
import type { Face } from './logic'

afterEach(() => vi.restoreAllMocks())

/** Force every die roll to `face` so the secret dice are deterministic. die() does
 * `((random()*6)|0)+1`, so random = (face-1)/6 yields exactly `face`. */
function rollAll(face: Face) {
  vi.spyOn(Math, 'random').mockReturnValue((face - 1) / 6)
}

describe('liars_dice net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0) // 'you' opens
    expect(A.isOver(s)).toBe(false)

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state object.
    expect(A.applyIntent(s, 1, { kind: 'bid', quantity: 1, face: 2 })).toBe(s)

    // Illegal: a 'continue' is meaningless during bidding -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'continue' })).toBe(s)

    // Illegal: challenging an open round (no standing bid) -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'challenge' })).toBe(s)

    // Illegal bid: face below 2 (1 is wild, never biddable) -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'bid', quantity: 1, face: 1 as Face })).toBe(s)

    // Legal opening bid -> state changes, turn passes to seat 1, tickKey changes.
    const before = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { kind: 'bid', quantity: 2, face: 3 })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)
    expect(A.seatToMove(s2)).toBe(1)
    expect(s2.bid).toEqual({ qty: 2, face: 3 })

    // Illegal raise: not strictly higher (same qty, lower/equal face) -> unchanged.
    expect(A.applyIntent(s2, 1, { kind: 'bid', quantity: 2, face: 2 })).toBe(s2)
    expect(A.applyIntent(s2, 1, { kind: 'bid', quantity: 1, face: 6 })).toBe(s2)

    // Legal raise by seat 1 (same qty, higher face).
    const s3 = A.applyIntent(s2, 1, { kind: 'bid', quantity: 2, face: 4 })
    expect(s3).not.toBe(s2)
    expect(A.seatToMove(s3)).toBe(0)

    // Seat 0 challenges -> reveal phase, seat 0 controls the next-round roll.
    const s4 = A.applyIntent(s3, 0, { kind: 'challenge' })
    expect(s4).not.toBe(s3)
    expect(s4.phase).toBe('reveal')
    expect(s4.reveal).not.toBeNull()
    expect(A.seatToMove(s4)).toBe(0)

    // During reveal a guest cannot roll the next round; only seat 0's continue does.
    expect(A.applyIntent(s4, 1, { kind: 'continue' })).toBe(s4)
    const s5 = A.applyIntent(s4, 0, { kind: 'continue' })
    expect(s5).not.toBe(s4)
    expect(s5.phase === 'bidding' || s5.phase === 'over').toBe(true)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host = seat 0, opens
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) opens with a bid; the intent commits and the guest's view updates.
    host.dispatchLocal({ kind: 'bid', quantity: 1, face: 2 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().bid).toEqual({ qty: 1, face: 2 })
    expect(guest.getState().turn).toBe('foe')

    // Guest (seat 1 = 'foe') raises; the intent travels host-ward and applies.
    guest.dispatch({ kind: 'bid', quantity: 1, face: 3 })
    expect(host.getFull().bid).toEqual({ qty: 1, face: 3 })
    expect(host.getFull().turn).toBe('you')
    expect(host.isMyTurn()).toBe(true)

    // Host challenges -> both sides land in the reveal phase.
    host.dispatchLocal({ kind: 'challenge' })
    expect(host.getFull().phase).toBe('reveal')
    expect(guest.getState().phase).toBe('reveal')
  })

  it('never leaks the host\'s secret dice to the guest while bidding', () => {
    rollAll(6) // every die is a 6 so the secret is recognizable and != the placeholder
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()
    expect(full.phase).toBe('bidding')

    // The guest is seat 1 = 'foe': it sees its OWN real dice (all 6s)...
    expect(view.foeDice).toEqual(full.foeDice)
    expect(view.foeDice.every(d => d === 6)).toBe(true)

    // ...but the host's dice ('you') are blanked to the placeholder (count preserved).
    expect(view.youDice.length).toBe(full.youDice.length)
    expect(full.youDice.every(d => d === 6)).toBe(true) // host truly holds 6s
    expect(view.youDice.every(d => d === 6)).toBe(false) // guest must NOT see them
    expect(view.youDice).not.toEqual(full.youDice)

    // The host opens with a 6's bid (a real 6 now appears publicly in the standing bid),
    // so we can no longer rely on a blanket "no 6 anywhere" scan. Before any bid, though,
    // the only 6s in the full state are the dice — assert none of the host's leak across
    // the wire view (counts are 5, faces in an empty round are none).
    expect(view.bid).toBeNull()
    expect(view.history).toEqual([])
    // Count the host's secret dice that crossed the wire: there must be none.
    const leaked = view.youDice.filter(d => d === 6).length
    expect(leaked).toBe(0)
  })
})

// Keep the LiarsIntent import meaningful for type-checking.
export type _I = LiarsIntent
