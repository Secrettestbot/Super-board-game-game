/* RUMMIKUB — netplay tests. Adapter round-trip (a legal play / draw advances; out-of-turn and
 * illegal intents return the SAME state ref) + a host/guest sync run over an in-memory transport
 * + a leak test proving the guest's redacted view never carries the other seat's rack tiles or
 * the face-down bag (counts stay public, identities do not). */

import { describe, it, expect } from 'vitest'
import { rummikubAdapter as A, type RummikubIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as R from './logic'
import type { Tile } from './logic'

/** A deck where seat 0's first 3 tiles are an 11-group (33 pts, legal first meld), and seat 1's
 *  rack contains a distinctive low run (1-2-3 black) we can grep for in the leak test. The rest
 *  of each rack and the bag are filled from the remaining full deck so 106 tiles are conserved. */
function fixedDeck(): Tile[] {
  const full = R.fullDeck()
  const byKey = new Map<string, Tile[]>()
  for (const t of full) {
    const k = t.joker ? 'J' : `${t.color}-${t.num}`
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(t)
  }
  const used = new Set<number>()
  const take = (color: string, num: number): Tile => {
    const t = byKey.get(`${color}-${num}`)!.find(x => !used.has(x.id))!
    used.add(t.id)
    return t
  }
  // seat 0 opening group of 11s (red/blue/black = 33)
  const rack0Head = [take('red', 11), take('blue', 11), take('black', 11)]
  // seat 1 distinctive run 1-2-3 black
  const rack1Head = [take('black', 1), take('black', 2), take('black', 3)]
  const rest = full.filter(t => !used.has(t.id))
  // Layout: rack0 = head + 11 filler; rack1 = head + 11 filler; bag = the rest.
  const rack0 = [...rack0Head, ...rest.slice(0, 11)]
  const rack1 = [...rack1Head, ...rest.slice(11, 22)]
  const bag = rest.slice(22)
  return [...rack0, ...rack1, ...bag]
}

/** Seat 0's legal opening play: the 11-group, scoring 33. */
function openingPlay(s: R.State): RummikubIntent {
  const r = s.racks[0]
  const eleven = r.filter(t => t.num === 11).slice(0, 3)
  return { kind: 'play', table: [eleven], used: eleven.map(t => t.id) }
}

describe('rummikub net adapter', () => {
  it('round-trips a legal intent and rejects illegal/out-of-turn', () => {
    const s = R.makeGame(fixedDeck()) // controlled deck: seat 0 holds a legal 33-pt opening
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(2)

    // legal seat-0 opening play -> state changes, turn passes to seat 1, tickKey changes
    const move = openingPlay(s)
    const s1 = A.applyIntent(s, 0, move)
    expect(s1).not.toBe(s)
    expect(A.seatToMove(s1)).toBe(1)
    expect(s1.table.length).toBe(1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s))

    // out-of-turn intent (seat 1 while it's seat 0's turn) -> SAME ref
    expect(A.applyIntent(s, 1, move)).toBe(s)

    // illegal play (first meld under 30: a 1-2-3 black run would be 6, but seat 0 lacks it;
    // use a bogus used-id that isn't on the rack) -> SAME ref
    expect(A.applyIntent(s, 0, { kind: 'play', table: [], used: [99999] })).toBe(s)

    // a DRAW is a legal alternative -> advances and bumps tickKey
    const drawn = A.applyIntent(s, 0, { kind: 'draw' })
    expect(drawn).not.toBe(s)
    expect(A.seatToMove(drawn)).toBe(1)
    expect(drawn.racks[0].length).toBe(s.racks[0].length + 1)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // host (seat 0) draws (always legal, deck-independent) -> turn passes to seat 1
    expect(host.isMyTurn()).toBe(true)
    const r0 = host.getFull().racks[0].length
    host.dispatchLocal({ kind: 'draw' })
    expect(host.isMyTurn()).toBe(false)
    expect(host.getFull().racks[0].length).toBe(r0 + 1)

    // guest now to move; its view reflects the host's authoritative state (step synced)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().step).toBe(host.getFull().step)

    // guest replies with a DRAW from its own seat; host advances and turn returns to seat 0
    const before = host.getFull().step
    guest.dispatch({ kind: 'draw' } as RummikubIntent)
    expect(host.getFull().step).toBe(before + 1)
    expect(host.getFull().turn).toBe(0)
  })

  it('the guest never receives the other seat\'s rack tiles or the bag', () => {
    // The host builds its own authoritative game (deterministic default deck); the guest only
    // ever sees the redacted view, so we grep that view for any of seat 0's real tile ids.
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()   // un-redacted authority state (host-only)
    const view = guest.getState() // seat 1's redacted view as it crossed the wire

    // guest keeps its OWN real rack (seat 1) ...
    expect(view.racks[1]).toEqual(full.racks[1])
    // ... but seat 0's rack is blanked to the face-down sentinel, COUNT preserved.
    expect(view.racks[0].length).toBe(full.racks[0].length)
    for (const t of view.racks[0]) expect(t).toEqual({ id: -1, num: 0, color: 'joker', joker: false })
    // the whole bag is blanked (order would leak future draws), COUNT preserved.
    expect(view.bag.length).toBe(full.bag.length)
    for (const t of view.bag) expect(t).toEqual({ id: -1, num: 0, color: 'joker', joker: false })

    // No real tile id from seat 0's hidden rack should appear anywhere in the wire view.
    // (id is followed by "," in the JSON, so the trailing comma avoids substring collisions
    //  like "id":2 matching inside "id":21.)
    const wire = JSON.stringify(view)
    for (const t of full.racks[0]) expect(wire).not.toContain(`"id":${t.id},`)
    // Nor any bag tile id.
    for (const t of full.bag) expect(wire).not.toContain(`"id":${t.id},`)
  })
})
