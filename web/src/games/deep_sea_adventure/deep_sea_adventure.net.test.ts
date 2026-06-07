/* DEEP SEA ADVENTURE — netplay tests. Adapter round-trip + a host/guest integration run
 * over an in-memory transport, plus a STRUCTURAL LEAK TEST proving a guest never receives
 * the point VALUES of another seat's carried (face-down) treasures — only the count. */

import { describe, it, expect } from 'vitest'
import { deepSeaAdventureAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as D from './logic'
import type { DeepSeaState } from './logic'

describe('deep sea adventure net adapter', () => {
  it('exposes seat 0 to move on a fresh game and the right seat count', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal dive (roll) intent and changes the tickKey', () => {
    const s = A.makeGame()
    expect(s.phase).toBe('choose')
    expect(s.chose).toBe(false)
    const before = A.tickKey(s)
    // "Dive deeper": a roll from a fresh choose commits DOWN and moves in one intent.
    const next = A.applyIntent(s, 0, { kind: 'roll' })
    expect(next).not.toBe(s) // state advanced
    expect(next.divers[0].direction).toBe('down')
    expect(next.divers[0].pos).toBeGreaterThan(0) // moved down the path
    expect(next.phase).toBe('rolled')
    expect(A.tickKey(next)).not.toBe(before) // tick changed -> AI re-arms
    expect(A.seatToMove(next)).toBe(0) // still seat 0's turn (now it must grab/drop/pass)
  })

  it('turnAround commits UP (one-way) and blocks diving back down', () => {
    // Build a state where seat 0 is already a few tiles down, mid-'choose'.
    const base = D.makeGame()
    let s: DeepSeaState = {
      ...base,
      divers: base.divers.map(d => (d.seat === 0 ? { ...d, pos: 4 } : d)),
    }
    s = A.applyIntent(s, 0, { kind: 'turnAround' })
    expect(s.divers[0].direction).toBe('up')
    expect(s.divers[0].turned).toBe(true)
    expect(s.chose).toBe(true)
    expect(s.phase).toBe('choose')
    expect(A.seatToMove(s)).toBe(0) // still seat 0 (it has not surfaced yet)
    const moved = A.applyIntent(s, 0, { kind: 'roll' })
    expect(moved.phase === 'rolled' || moved.phase === 'choose').toBe(true)
    expect(moved.divers[0].direction).toBe('up')
  })

  it('grab picks up the landing treasure (after a roll)', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'roll' }) // dive + move into 'rolled'
    if (s.phase === 'rolled' && s.divers[0].pos > 0 && !D.isBlank(s.path[s.divers[0].pos])) {
      const tileVal = s.path[s.divers[0].pos].value
      const after = A.applyIntent(s, 0, { kind: 'grab' })
      expect(after.divers[0].carrying).toContain(tileVal)
    }
  })

  it('returns the SAME state for an out-of-turn intent', () => {
    const s = A.makeGame()
    // seat 1 tries to act while it's seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'roll' })).toBe(s)
    expect(A.applyIntent(s, 2, { kind: 'turnAround' })).toBe(s)
  })

  it('returns the SAME state for an illegal intent for the current phase', () => {
    const s = A.makeGame() // phase 'choose'
    // can't grab/drop/pass before rolling
    expect(A.applyIntent(s, 0, { kind: 'grab' })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'drop', idx: 0 })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'pass' })).toBe(s)
    // after rolling, can't dive/turn again
    const rolled = A.applyIntent(s, 0, { kind: 'roll' })
    expect(rolled.phase).toBe('rolled')
    expect(A.applyIntent(rolled, 0, { kind: 'turnAround' })).toBe(rolled)
    expect(A.applyIntent(rolled, 0, { kind: 'roll' })).toBe(rolled)
    // drop with nothing carried onto the landing tile is illegal
    if (rolled.divers[0].carrying.length === 0) {
      expect(A.applyIntent(rolled, 0, { kind: 'drop', idx: 0 })).toBe(rolled)
    }
  })
})

describe('deep sea adventure host + guest over an in-memory transport', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('seats the guest at 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai'])
    expect(guest.getState().divers.length).toBe(3)
  })

  it('relays host actions and the guest sees the synced state advance', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    const before = A.tickKey(host.getFull())
    host.dispatchLocal({ kind: 'roll' }) // host (seat 0) dives + moves
    expect(host.getFull().phase).toBe('rolled')
    // guest's view reflects the host's authoritative state
    expect(A.tickKey(guest.getState())).not.toBe(before)
    expect(guest.getState().phase).toBe('rolled')
    expect(guest.getState().divers[0].pos).toBe(host.getFull().divers[0].pos)
  })
})

describe('deep sea adventure leak test — carried treasure VALUES stay face-down', () => {
  it('masks OTHER seats\' carried values while preserving the count and own values', () => {
    // Build a host state by hand: seat 0 carries [9, 3], seat 1 carries [12], seat 2 empty.
    const base = D.makeGame()
    const s: DeepSeaState = {
      ...base,
      divers: base.divers.map(d =>
        d.seat === 0 ? { ...d, carrying: [9, 3] }
          : d.seat === 1 ? { ...d, carrying: [12] }
            : d,
      ),
    }

    // The guest is seat 1. Build the exact view that crosses the wire.
    const view = A.redactFor!(s, 1)

    // Seat 1 sees its OWN carried values untouched.
    expect(view.divers[1].carrying).toEqual([12])

    // Seat 0's carried VALUES are masked, but the COUNT is preserved (drives the air burn).
    expect(view.divers[0].carrying.length).toBe(2)
    expect(view.divers[0].carrying).not.toContain(9)
    expect(view.divers[0].carrying).not.toContain(3)
    // every masked slot is the hidden sentinel, not a real treasure value
    for (const v of view.divers[0].carrying) expect(v).toBeLessThan(0)

    // Public info is intact for the guest: shared air, depths, directions, banked scores,
    // and the tiles laid on the path are all unchanged.
    expect(view.air).toBe(s.air)
    expect(view.divers.map(d => d.pos)).toEqual(s.divers.map(d => d.pos))
    expect(view.divers.map(d => d.banked)).toEqual(s.divers.map(d => d.banked))
    expect(view.path).toEqual(s.path)
  })

  it('redaction is symmetric: each seat keeps only its OWN carried values', () => {
    // redactFor hides EVERY other seat's carried values, including from seat 0 — every
    // player's chips are face-down to everyone but themselves.
    const base = D.makeGame()
    const s: DeepSeaState = {
      ...base,
      divers: base.divers.map(d =>
        d.seat === 0 ? { ...d, carrying: [9, 3] } : d.seat === 1 ? { ...d, carrying: [12] } : d,
      ),
    }
    // Seat 0's view: its own [9,3] visible, seat 1's [12] masked.
    const v0 = A.redactFor!(s, 0)
    expect(v0.divers[0].carrying).toEqual([9, 3])
    expect(v0.divers[1].carrying).not.toContain(12)
    expect(v0.divers[1].carrying.length).toBe(1)
    // The host's authoritative full state (pre-redaction) still holds every real value.
    expect(s.divers[0].carrying).toEqual([9, 3])
    expect(s.divers[1].carrying).toEqual([12])
  })
})
