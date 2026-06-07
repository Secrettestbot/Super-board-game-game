/* BATTLESHIP — netplay adapter tests. Adapter round-trip (placement + firing, with
   illegal/out-of-turn rejection), a host+guest in-memory sync, and a LEAK TEST proving a
   guest never receives the host's un-hit ship cells. */

import { describe, it, expect } from 'vitest'
import { battleshipAdapter as A } from './net'
import type { BattleshipNetState, PlacedShip } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as BS from './logic'

const N = BS.N
const idx = (r: number, c: number) => r * N + c

/** A deterministic, valid fleet laid out in rows across the top of the board. */
function layoutFromRow(startRow: number): PlacedShip[] {
  return BS.FLEET.map((spec, k) => ({
    key: spec.key,
    cells: Array.from({ length: spec.len }, (_, j) => idx(startRow + k, j)),
  }))
}

/** Drive a fresh game past placement by confirming both seats' fleets. */
function placedGame(l0: PlacedShip[], l1: PlacedShip[]): BattleshipNetState {
  let s = A.makeGame()
  expect(s._phase).toBe('placement')
  expect(A.seatToMove(s)).toBe(0)
  s = A.applyIntent(s, 0, { kind: 'place', ships: l0 })
  expect(A.seatToMove(s)).toBe(1) // seat 0 done, seat 1 to place
  s = A.applyIntent(s, 1, { kind: 'place', ships: l1 })
  expect(s._phase).toBeUndefined() // placement bookkeeping dropped
  expect(A.seatToMove(s)).toBe(0)  // firing begins with seat 0
  return s
}

describe('battleship net adapter', () => {
  it('round-trips placement + a legal fire, and rejects illegal / out-of-turn', () => {
    const fresh = A.makeGame()
    // out-of-turn placement (seat 1 before seat 0) -> unchanged
    expect(A.applyIntent(fresh, 1, { kind: 'place', ships: layoutFromRow(0) })).toBe(fresh)
    // illegal layout (overlapping ships) -> unchanged
    const overlap = BS.FLEET.map(spec => ({ key: spec.key, cells: Array.from({ length: spec.len }, (_, j) => idx(0, j)) }))
    expect(A.applyIntent(fresh, 0, { kind: 'place', ships: overlap })).toBe(fresh)
    // a fire intent during placement -> unchanged
    expect(A.applyIntent(fresh, 0, { kind: 'fire', cell: 0 })).toBe(fresh)

    let s = placedGame(layoutFromRow(0), layoutFromRow(0))

    // out-of-turn fire (seat 1 when it's seat 0's turn) -> unchanged
    expect(A.applyIntent(s, 1, { kind: 'fire', cell: 50 })).toBe(s)
    // seat 0 fires at seat 1's grid (the 'enemy' grid). Carrier sits on row 0 -> a HIT.
    const before = s
    s = A.applyIntent(s, 0, { kind: 'fire', cell: idx(0, 0) })
    expect(s).not.toBe(before)
    expect(s.enemy.fired[idx(0, 0)]).toBe(true)
    expect(s.enemy.hit[idx(0, 0)]).toBe(true) // seat 1's Carrier occupies (0,0)
    expect(A.seatToMove(s)).toBe(1) // turn passed to seat 1
    // re-firing the same cell while not seat 0's turn -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'fire', cell: idx(0, 0) })).toBe(s)

    // seat 1 fires at seat 0's grid (the 'you' grid). Carrier sits on row 0 -> HIT.
    s = A.applyIntent(s, 1, { kind: 'fire', cell: idx(0, 0) })
    expect(s.you.fired[idx(0, 0)]).toBe(true)
    expect(s.you.hit[idx(0, 0)]).toBe(true)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.tickKey(s)).toContain('2') // two shots fired
  })

  it('host + guest stay in sync over an in-memory transport (placement -> firing)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // host (seat 0) places first
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal({ kind: 'place', ships: layoutFromRow(0) })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1 places

    // guest (seat 1) places -> firing begins, seat 0 to move
    guest.dispatch({ kind: 'place', ships: layoutFromRow(0) })
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)
    expect(host.getFull()._phase).toBeUndefined()

    // host fires; guest's view advances and it becomes the guest's turn
    host.dispatchLocal({ kind: 'fire', cell: idx(0, 0) })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().enemy.fired[idx(0, 0)]).toBe(true)

    // guest replies; host's authoritative state advances
    const shotsBefore = host.getFull().shotsFired
    guest.dispatch({ kind: 'fire', cell: idx(5, 5) })
    expect(host.getFull().shotsFired).toBe(shotsBefore + 1)
    expect(host.isMyTurn()).toBe(true)
  })

  it('LEAK TEST: a guest never sees the host\'s un-hit ship cells', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    // Place both fleets at known, non-overlapping positions.
    host.dispatchLocal({ kind: 'place', ships: layoutFromRow(0) }) // seat 0 'you' grid: rows 0-4
    guest.dispatch({ kind: 'place', ships: layoutFromRow(0) })     // seat 1 'enemy' grid: rows 0-4

    // The host's secret fleet is seat 0's grid ('you'). Its un-hit cells must NOT appear
    // anywhere in the guest's view. The guest is seat 1, so redactFor masks the 'you' grid.
    const full = host.getFull()
    const hostShipCells: number[] = []
    for (const sh of full.you.ships) for (const c of sh.cells) hostShipCells.push(c)
    expect(hostShipCells.length).toBe(17)

    const view = guest.getState()
    // the guest's view of the host's grid exposes NO ship cells (nothing hit yet)
    const exposed = view.you.ships.flatMap(sh => sh.cells)
    expect(exposed).toEqual([])

    // belt-and-braces: none of the host's secret ship cells leak through the wire JSON
    // in a way the guest could reconstruct as a ship position. Fire one shot so a single
    // cell becomes legitimately public, then prove ONLY that cell is revealed.
    host.dispatchLocal({ kind: 'fire', cell: idx(0, 0) }) // seat 0 fires at enemy (no-op for 'you')
    // it's seat 1's turn; seat 1 fires at the host's grid, hitting one Carrier cell
    guest.dispatch({ kind: 'fire', cell: idx(0, 0) })
    const v2 = guest.getState()
    const exposed2 = v2.you.ships.flatMap(sh => sh.cells)
    expect(exposed2).toEqual([idx(0, 0)]) // exactly the one hit cell, nothing more

    // The OTHER 16 secret cells still must not be present in the guest's view JSON within
    // any ship.cells array.
    for (const c of hostShipCells) {
      if (c === idx(0, 0)) continue
      const inSomeShip = v2.you.ships.some(sh => sh.cells.includes(c))
      expect(inSomeShip).toBe(false)
    }
  })
})
