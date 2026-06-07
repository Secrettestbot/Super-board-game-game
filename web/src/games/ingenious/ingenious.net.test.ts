/* INGENIOUS — netplay tests. Adapter round-trip (a legal placement advances; out-of-turn and
 * illegal intents return the SAME state ref) + a host/guest sync run over an in-memory transport
 * + a leak test proving the guest's redacted view never carries the other seat's rack tiles or
 * the face-down bag order. */

import { describe, it, expect } from 'vitest'
import { ingeniousAdapter as A, type IngeniousIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as ING from './logic'
import type { Tile } from './logic'

// A controlled bag so the first rack tile and a legal placement are predictable.
function fixedBag(): Tile[] {
  const bag: Tile[] = []
  for (let k = 0; k < 16; k++) bag.push({ a: 0, b: 1 })
  return bag
}

// A legal seat-0 opening placement: tile 0 onto the centre and its dir-0 neighbour.
function openingIntent(): IngeniousIntent {
  const a = ING.coordToIndex(0, 0)!
  const b = ING.step(a, 0)!
  return { tileIndex: 0, cellA: a, cellB: b }
}

describe('ingenious net adapter', () => {
  it('round-trips a legal intent and rejects illegal/out-of-turn', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(2)

    // legal seat-0 placement -> state changes and turn passes to seat 1
    const move = openingIntent()
    const s1 = A.applyIntent(s, 0, move)
    expect(s1).not.toBe(s)
    expect(A.seatToMove(s1)).toBe(1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))

    // out-of-turn intent (seat 1 while it's seat 0's turn) -> SAME ref
    expect(A.applyIntent(s, 1, move)).toBe(s)

    // illegal intent (non-adjacent cells) -> SAME ref
    const far = ING.coordToIndex(3, 0)!
    expect(A.applyIntent(s, 0, { tileIndex: 0, cellA: openingIntent().cellA, cellB: far })).toBe(s)
    // illegal intent (out-of-range tile index) -> SAME ref
    expect(A.applyIntent(s, 0, { ...move, tileIndex: 99 })).toBe(s)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // host (seat 0) plays a legal opening move
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal(openingIntent())
    expect(host.isMyTurn()).toBe(false)

    // guest now to move; its view reflects the host's authoritative state
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().moves).toBe(host.getFull().moves)

    // guest replies with a legal placement from its own (real) rack
    const gs = guest.getState()
    const places = ING.legalPlacements(gs.board)
    const pl = places[0]
    const before = host.getFull().moves
    guest.dispatch({ tileIndex: 0, cellA: pl.cellA, cellB: pl.cellB } as IngeniousIntent)
    expect(host.getFull().moves).toBe(before + 1) // host advanced from the guest's intent
  })

  it('the guest never receives the other seat\'s rack tiles or the bag order', () => {
    // Make a real game, then sanity-pick a distinctive secret value to look for.
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull() // un-redacted authority state (host-only)
    const view = guest.getState() // seat 1's redacted view as it crossed the wire

    // guest keeps its OWN real rack (seat 1) ...
    expect(view.racks[1]).toEqual(full.racks[1])
    // ... but seat 0's rack is fully blanked to the HIDDEN sentinel.
    expect(view.racks[0].length).toBe(full.racks[0].length)
    for (const t of view.racks[0]) expect(t).toEqual({ a: -1, b: -1 })
    // and the whole face-down bag is blanked (its order must not leak future draws).
    expect(view.bag.length).toBe(full.bag.length)
    for (const t of view.bag) expect(t).toEqual({ a: -1, b: -1 })

    // No secret colour pair from seat 0's hidden rack should appear anywhere in the wire view.
    const wire = JSON.stringify(view)
    const secretRack0 = JSON.stringify(full.racks[0])
    if (secretRack0 !== '[]') expect(wire).not.toContain(secretRack0)
  })
})
