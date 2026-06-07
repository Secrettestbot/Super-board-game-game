/* RAILROAD INK — netplay adapter tests. Proves the online path headlessly:
 *   1. the adapter round-trips a legal placement and rejects illegal / out-of-turn intents
 *   2. a host (seat 0) + guest (seat 1) stay in sync over an in-memory transport, with the
 *      host as the sole authority (it rolls the SHARED dice; both draft the same pieces).
 * Railroad Ink is perfect information, so there is no redactFor / leak test. */

import { describe, it, expect } from 'vitest'
import { railroadInkAdapter as A, type RailroadInkIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as RR from './logic'

/** A legal placement intent for the seat that is currently to move. */
function firstLegalIntent(s: RR.RRState): RailroadInkIntent {
  const seat = s.turn
  const k = s.dice.findIndex((_, i) => !s.resolved[seat][i])
  const pls = RR.legalPlacements(s.grids[seat], s.exits, s.dice[k])
  if (pls.length === 0) return { kind: 'skip', dieIdx: k }
  return { kind: 'place', dieIdx: k, cell: pls[0].cell, rot: pls[0].rot }
}

describe('railroad_ink net adapter', () => {
  it('exposes a 2-seat perfect-info surface', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
    expect(A.redactFor).toBeUndefined()
  })

  it('round-trips a legal placement and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    const intent = firstLegalIntent(s)
    expect(intent.kind).toBe('place') // a fresh grid always has a legal first piece

    // legal seat-0 intent -> state changes (a tile lands, step bumps)
    const after = A.applyIntent(s, 0, intent)
    expect(after).not.toBe(s)
    expect(after.step).toBeGreaterThan(s.step)

    // out-of-turn: seat 1 cannot act while it is seat 0's turn -> SAME reference
    expect(A.applyIntent(s, 1, intent)).toBe(s)

    // illegal: place onto an off-board / non-connecting cell -> SAME reference
    const illegal: RailroadInkIntent = { kind: 'place', dieIdx: intent.kind === 'place' ? intent.dieIdx : 0, cell: RR.cellIdx(3, 3), rot: 0 }
    // (dead center on a blank grid can't connect to anything)
    expect(A.applyIntent(s, 0, illegal)).toBe(s)

    // skipping a die that HAS a legal placement is illegal -> SAME reference
    expect(A.applyIntent(s, 0, { kind: 'skip', dieIdx: 0 })).toBe(s)

    // garbage intent kind -> SAME reference
    expect(A.applyIntent(s, 0, { kind: 'nope' } as unknown as RailroadInkIntent)).toBe(s)
  })

  it('tickKey changes on every action', () => {
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const after = A.applyIntent(s, 0, firstLegalIntent(s))
    expect(A.tickKey(after)).not.toBe(k0)
  })

  it('host + guest stay in sync over an in-memory transport (host rolls the shared dice)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])
    // guest sees the same shared dice the host rolled
    expect(guest.getState().dice).toEqual(host.getFull().dice)

    // it is seat 0's (host's) turn to draft first
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host drafts all four of its pieces -> turn hands off to the guest (seat 1)
    let guard = 0
    while (host.getFull().turn === 0 && host.getFull().winner == null && guard++ < 20) {
      host.dispatchLocal(firstLegalIntent(host.getFull()))
    }
    expect(host.getFull().turn).toBe(1)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // view synced to the guest
    expect(guest.getState().turn).toBe(1)

    // an out-of-turn host intent is rejected (it is the guest's turn now). The host's seat
    // is 0 and dispatchLocal only acts for seat 0, but seatToMove is seat 1 -> no change.
    const stepBefore = host.getFull().step
    host.dispatchLocal({ kind: 'place', dieIdx: 0, cell: RR.cellIdx(0, 3), rot: 0 })
    expect(host.getFull().step).toBe(stepBefore)

    // guest drafts its four pieces; intents travel host-ward and apply authoritatively
    guard = 0
    while (guest.getState().turn === 1 && guest.getState().winner == null && guard++ < 20) {
      guest.dispatch(firstLegalIntent(guest.getState()))
    }
    // round advanced on the host (new shared roll), back to seat 0, and the guest sees it
    expect(host.getFull().round).toBe(2)
    expect(host.getFull().turn).toBe(0)
    expect(guest.getState().round).toBe(2)
    expect(guest.getState().dice).toEqual(host.getFull().dice)
  })

  it('a vacated seat reverts to AI when the guest drops', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(host.aiSeat()).toBe(null) // seat 0 (host) to move, seat 1 is the guest
    guest.close()
    expect(host.guestCount()).toBe(0)
    // host still to move (seat 0); once it finishes, seat 1 becomes an AI seat
    let guard = 0
    while (host.getFull().turn === 0 && guard++ < 20) host.dispatchLocal(firstLegalIntent(host.getFull()))
    expect(host.aiSeat()).toBe(1)
  })
})
