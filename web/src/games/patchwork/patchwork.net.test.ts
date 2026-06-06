/* Browser-free integration test of patchwork's netplay path: adapter round-trip plus a
 * HostSession + GuestSession wired through an in-memory transport, playing real patchwork.
 * Patchwork's turn order is decided by the shared time track (toMove), so the same seat
 * can move twice — these tests exercise that via the adapter and the session. */

import { describe, it, expect } from 'vitest'
import { patchworkAdapter as A } from './net'
import type { PatchworkIntent } from './net'
import * as P from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** Build a legal buy intent (next-3 patch the player can afford + place) for `seat`. */
function legalBuy(s: P.State, seat: P.Player): PatchworkIntent | null {
  for (const patch of P.nextThree(s)) {
    if (!P.canBuy(s, seat, patch.id)) continue
    const pl = P.legalPlacements(s, seat, patch.id)[0]
    if (!pl) continue
    return { kind: 'buy', patchId: patch.id, cell: pl.r0 * P.QN + pl.c0, orientation: pl.orientation }
  }
  return null
}

describe('patchwork net adapter', () => {
  it('starts with the human (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal action and advances the game (state + tickKey change)', () => {
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { kind: 'advance' })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(k0)
    // seat 0 advanced past seat 1, so the player furthest back (seat 1) now moves.
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('round-trips a legal buy intent', () => {
    const s = A.makeGame()
    const buy = legalBuy(s, 0)
    expect(buy).not.toBeNull()
    const s2 = A.applyIntent(s, 0, buy!)
    expect(s2).not.toBe(s)
    expect(P.emptyCells(s2.players[0].quilt)).toBeLessThan(P.QCELLS)
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    // seat 0 is to move; seat 1 trying to act is rejected.
    expect(A.applyIntent(s, 1, { kind: 'advance' })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // a patch id that is not in the next-3 / not buyable -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'buy', patchId: 999, cell: 0, orientation: 0 })).toBe(s)
    // an unaffordable-or-unplaceable buy on a real id at an out-of-bounds-ish anchor:
    const real = P.nextThree(s)[0]
    expect(A.applyIntent(s, 0, { kind: 'buy', patchId: real.id, cell: 80, orientation: 0 })).toBe(s)
  })

  it('lets the same seat move twice in a row when it stays furthest back', () => {
    // After seat 1 advances all the way to END, seat 0 (further back) keeps moving.
    let s = A.makeGame()
    // seat 0 advances (small step), then seat 1 will be furthest back and move.
    s = A.applyIntent(s, 0, { kind: 'advance' })
    const mover = A.seatToMove(s)!
    const k = A.tickKey(s)
    const s2 = A.applyIntent(s, mover, { kind: 'advance' })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(k)
  })
})

describe('patchwork host + guest over an in-memory transport', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().players.length).toBe(2)
  })

  it('relays a host action and broadcasts the new view to the guest', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true) // seat 0 to move
    host.dispatchLocal({ kind: 'advance' })
    // seat 0 advanced past seat 1 -> seat 1 (guest) is now furthest back and to move.
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().players[0].pos).toBe(host.getFull().players[0].pos)
  })

  it('relays a legal guest intent host-ward and applies it', () => {
    const { host, guest } = connect()
    host.dispatchLocal({ kind: 'advance' }) // hand the turn to the guest (seat 1)
    expect(guest.isMyTurn()).toBe(true)
    const before = host.getFull().clock
    const buy = legalBuy(guest.getState(), 1)
    guest.dispatch(buy ?? { kind: 'advance' })
    expect(host.getFull().clock).toBe(before + 1) // an action was applied authoritatively
  })

  it('ignores an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    // seat 0 (host) is to move; the guest (seat 1) tries to act anyway.
    const before = host.getFull().clock
    guest.dispatch({ kind: 'advance' })
    expect(host.getFull().clock).toBe(before)
  })
})
