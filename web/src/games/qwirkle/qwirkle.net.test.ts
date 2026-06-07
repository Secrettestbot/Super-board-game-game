/* QWIRKLE — netplay tests. Adapter round-trip (a legal place/swap advances; out-of-turn and
 * illegal intents return the SAME state ref) + a host/guest sync run over an in-memory transport
 * + a leak test proving the guest's redacted view never carries the other seat's rack tiles or
 * the face-down bag (only public board / scores / counts survive the wire). */

import { describe, it, expect } from 'vitest'
import { qwirkleAdapter as A, hydrate, type QwirkleIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as Q from './logic'
import type { Tile } from './logic'

// A controlled bag so both racks and the first legal moves are predictable. Dealing is alternating
// (bag[0]->hand0, bag[1]->hand1, ...), six each. We give seat 0 red tiles of distinct shapes and
// seat 1 a red-circle so it can extend seat 0's red line legally. Remaining tiles pad the bag.
function fixedBag(): Tile[] {
  let id = 0
  const t = (color: Q.Color, shape: Q.Shape): Tile => ({ color, shape, id: id++ })
  const bag: Tile[] = []
  // 12 dealt tiles, alternating seat0 / seat1.
  const dealt: [Tile, Tile][] = [
    [t('r', 'square'), t('r', 'circle')],   // seat0 r-square, seat1 r-circle
    [t('r', 'diamond'), t('b', 'circle')],
    [t('r', 'star'), t('g', 'square')],
    [t('r', 'clover'), t('y', 'star')],
    [t('r', 'cross'), t('p', 'clover')],
    [t('o', 'circle'), t('o', 'square')],
  ]
  for (const [a, b] of dealt) { bag.push(a); bag.push(b) }
  // pad the rest of the bag with arbitrary distinct tiles so swaps / draws have material.
  for (let k = 0; k < 24; k++) bag.push(t('b', 'diamond'))
  return bag
}

describe('qwirkle net adapter', () => {
  it('round-trips a legal place / swap and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(2)

    // legal seat-0 placement: any single hand tile at the origin on an empty board.
    const tile = s.hands[0][0]
    const place: QwirkleIntent = { kind: 'place', placements: [{ r: 0, c: 0, tile }] }
    const s1 = A.applyIntent(s, 0, place)
    expect(s1).not.toBe(s)
    expect(A.seatToMove(s1)).toBe(1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))

    // out-of-turn (seat 1 while it's seat 0's turn) -> SAME ref
    expect(A.applyIntent(s, 1, place)).toBe(s)

    // illegal placement (empty placements) -> SAME ref
    expect(A.applyIntent(s, 0, { kind: 'place', placements: [] })).toBe(s)
    // illegal placement (tile not in hand) -> SAME ref
    const ghost: Tile = { color: 'r', shape: 'circle', id: 9999 }
    expect(A.applyIntent(s, 0, { kind: 'place', placements: [{ r: 0, c: 0, tile: ghost }] })).toBe(s)

    // legal seat-0 swap of one owned tile -> state changes, turn passes
    const s2 = A.applyIntent(s, 0, { kind: 'swap', tileIds: [s.hands[0][0].id] })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    // illegal swap (empty ids) -> SAME ref
    expect(A.applyIntent(s, 0, { kind: 'swap', tileIds: [] })).toBe(s)
    // illegal swap (tile not owned) -> SAME ref
    expect(A.applyIntent(s, 0, { kind: 'swap', tileIds: [9999] })).toBe(s)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession({ ...A, makeGame: () => Q.makeGame(fixedBag()) })
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession({ ...A, makeGame: () => Q.makeGame(fixedBag()) }, b)
    expect(guest.mySeat()).toBe(1)

    // host (seat 0) plays a legal opening: r-square at the origin.
    expect(host.isMyTurn()).toBe(true)
    const h0 = host.getFull().hands[0][0] // r-square
    host.dispatchLocal({ kind: 'place', placements: [{ r: 0, c: 0, tile: h0 }] })
    expect(host.isMyTurn()).toBe(false)

    // guest now to move; its hydrated view reflects the host's authoritative board.
    expect(guest.isMyTurn()).toBe(true)
    const gv = hydrate(guest.getState())
    expect(gv.board.get(Q.key(0, 0))).toEqual(h0) // public board crossed the wire intact

    // guest (seat 1) replies with a legal placement from its OWN real rack: r-circle at (0,1)
    // extends the red line. (seat 1's rack is real in its own view.)
    const rCircle = gv.hands[1].find(t => t.color === 'r' && t.shape === 'circle')!
    const before = host.getFull().log.length
    guest.dispatch({ kind: 'place', placements: [{ r: 0, c: 1, tile: rCircle }] } as QwirkleIntent)
    expect(host.getFull().log.length).toBe(before + 1) // host advanced from the guest's intent
    expect(host.getFull().board.get(Q.key(0, 1))).toEqual(rCircle)
    expect(host.isMyTurn()).toBe(true) // back to the host
  })

  it('the guest never receives the other seat\'s rack tiles or the bag', () => {
    const host = new HostSession({ ...A, makeGame: () => Q.makeGame(fixedBag()) })
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession({ ...A, makeGame: () => Q.makeGame(fixedBag()) }, b)

    const full = host.getFull()      // un-redacted authority state (host only)
    const view = guest.getState()    // seat 1's redacted view as it crossed the wire

    // guest keeps its OWN real rack (seat 1) ...
    expect(view.hands[1]).toEqual(full.hands[1])
    // ... but seat 0's rack is blanked to the HIDDEN sentinel (count preserved).
    expect(view.hands[0].length).toBe(full.hands[0].length)
    for (const t of view.hands[0]) expect(t).toEqual({ color: 'r', shape: 'circle', id: -1 })
    // and the whole face-down bag is blanked (counts kept, order must not leak future draws).
    expect(view.bag.length).toBe(full.bag.length)
    for (const t of view.bag) expect(t).toEqual({ color: 'r', shape: 'circle', id: -1 })

    // No secret tile id from seat 0's hidden rack should appear anywhere in the wire view.
    const wire = JSON.stringify(view)
    for (const t of full.hands[0]) expect(wire).not.toContain(`"id":${t.id}`)
    // No secret bag tile id should appear either.
    for (const t of full.bag) expect(wire).not.toContain(`"id":${t.id}`)
  })

  it('adapter round-trips through JSON without losing the public board', () => {
    // Simulate exactly what the wire does: redact -> JSON.stringify -> parse -> hydrate.
    const s0 = Q.makeGame(fixedBag())
    const placed = Q.applyPlacement(s0, [{ r: 0, c: 0, tile: s0.hands[0][0] }])
    const redacted = A.redactFor!(placed, 1)
    const wire = JSON.parse(JSON.stringify(redacted))
    expect(wire.board).toEqual({}) // the Map itself does NOT survive JSON...
    const back = hydrate(wire)
    expect(back.board.size).toBe(1) // ...but hydrate rebuilds it from the wire-safe array.
    expect(back.board.get(Q.key(0, 0))).toEqual(placed.board.get(Q.key(0, 0)))
  })
})
