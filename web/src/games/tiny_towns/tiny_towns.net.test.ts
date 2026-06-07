/* TINY TOWNS — netplay tests. This build is the solitaire Tiny Towns (one 4x4 town,
 * no AI, no opponent), so the netplay surface is a single seat. The tests prove:
 *   - the adapter round-trips a legal placement and rejects illegal / out-of-turn /
 *     unbuildable intents by returning the input state unchanged (===),
 *   - over an in-memory transport the host plays authoritatively while a guest of the
 *     1-seat table is correctly rejected ("table full"), with the host's state intact. */

import { describe, it, expect } from 'vitest'
import { tinyTownsAdapter as A, type TinyTownsIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as TN from './logic'

function firstEmpty(s: TN.TinyState): number {
  return s.grid.findIndex(c => c === null)
}

describe('tiny_towns net adapter', () => {
  it('round-trips a legal placement and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(1)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
    expect(s.resource).not.toBeNull() // a resource is dealt at the start

    const cell = firstEmpty(s)
    expect(cell).toBeGreaterThanOrEqual(0)

    // legal seat-0 placement -> a new state with that cell filled and a fresh resource
    const placed = A.applyIntent(s, 0, { kind: 'place', cell })
    expect(placed).not.toBe(s)
    expect(placed.grid[cell]).toEqual({ t: 'r', r: s.resource })
    expect(placed.turn).toBe(s.turn + 1)
    expect(A.tickKey(placed)).not.toBe(A.tickKey(s))

    // out-of-turn (seat 1 does not exist) -> input state unchanged (===)
    expect(A.applyIntent(s, 1, { kind: 'place', cell })).toBe(s)

    // illegal: placing onto the just-filled cell -> unchanged (===)
    expect(A.applyIntent(placed, 0, { kind: 'place', cell })).toBe(placed)

    // illegal: out-of-range cell -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'place', cell: 99 })).toBe(s)

    // illegal build: nothing is buildable on a near-empty grid -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'build', key: 'cottage', cell })).toBe(s)
  })

  it('ends and scores the town via an end intent', () => {
    const s = A.makeGame()
    const ended = A.applyIntent(s, 0, { kind: 'end' })
    expect(ended).not.toBe(s)
    expect(A.isOver(ended)).toBe(true)
    expect(A.seatToMove(ended)).toBeNull()
    expect(ended.score).not.toBeNull()
    // intents after the game is over are inert (===)
    expect(A.applyIntent(ended, 0, { kind: 'place', cell: 0 })).toBe(ended)
  })

  it('host plays authoritatively; a guest of the single-seat table is rejected', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a) // 1-seat table -> guest gets no seat ("table full")
    const guest = new GuestSession(A, b)

    // host is the only (host) seat and is on the move
    expect(host.getSeats().map(s => s.kind)).toEqual(['host'])
    expect(host.guestCount()).toBe(0)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.ready()).toBe(false) // never welcomed onto a full table

    // host plays a legal placement locally; authoritative state advances
    const full = host.getFull()
    const cell = firstEmpty(full)
    const intent: TinyTownsIntent = { kind: 'place', cell }
    host.dispatchLocal(intent)
    expect(host.getFull().grid[cell]).toEqual({ t: 'r', r: full.resource })
    expect(host.getFull().turn).toBe(full.turn + 1)
    expect(host.isMyTurn()).toBe(true) // still seat 0's turn (solitaire)
  })
})
