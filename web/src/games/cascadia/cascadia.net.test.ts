/* CASCADIA — netplay tests. Adapter round-trip (legal intent applies, illegal/out-of-turn
 * returns the input state unchanged) plus a host+guest in-memory sync proving the online
 * path: the host plays seat 0, the guest (seat 1) sees the move and replies. Fully public
 * game, so no leak test is needed. Deterministic bags via makeBags keep it reproducible. */

import { describe, it, expect } from 'vitest'
import { cascadiaAdapter as A, type CascadiaIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as C from './logic'
import type { CascadiaState } from './logic'

/** Build a legal full-turn intent for the player to move in `s`, via the AI chooser. */
function legalIntent(s: CascadiaState): CascadiaIntent {
  const player = s.turn
  const m = C.aiChoose(s, player)!
  return { marketIndex: m.marketIndex, hex: m.hex, rotation: m.rotation, animalCoord: m.animalCoord }
}

describe('cascadia net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame(C.makeBags(7))
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(2)

    // out-of-turn: seat 1 cannot move while it's seat 0's turn -> same state (===)
    const oot = legalIntent(s)
    expect(A.applyIntent(s, 1, oot)).toBe(s)

    // illegal hex (not adjacent to the tableau) -> same state (===)
    const bad: CascadiaIntent = { marketIndex: 0, hex: { q: 99, r: 99 }, rotation: 0, animalCoord: null }
    expect(A.applyIntent(s, 0, bad)).toBe(s)

    // illegal market index -> same state (===)
    const badMarket: CascadiaIntent = { ...legalIntent(s), marketIndex: 42 }
    expect(A.applyIntent(s, 0, badMarket)).toBe(s)

    // legal seat-0 intent -> state changes and turn passes to seat 1
    const next = A.applyIntent(s, 0, legalIntent(s))
    expect(next).not.toBe(s)
    expect(A.seatToMove(next)).toBe(1)
    expect(A.tickKey(next)).not.toBe(A.tickKey(s))
  })

  it('rejects an out-of-spec animal coord but keeps a set-aside intent', () => {
    const s = A.makeGame(C.makeBags(3))
    const base = legalIntent(s)
    // a token coord that is not a legal slot for the paired animal -> rejected (===)
    const badAnim: CascadiaIntent = { ...base, animalCoord: { q: -50, r: 50 } }
    expect(A.applyIntent(s, 0, badAnim)).toBe(s)
    // setting the token aside (null) is always legal once the tile placement is legal
    const aside: CascadiaIntent = { ...base, animalCoord: null }
    expect(A.applyIntent(s, 0, aside)).not.toBe(s)
  })
})

describe('cascadia host + guest sync over an in-memory transport', () => {
  it('host (seat 0) and guest (seat 1) stay in sync', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(guest.ready()).toBe(true)
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host plays seat 0 -> guest sees it and is now to move
    host.dispatchLocal(legalIntent(host.getFull()))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(1)
    expect(guest.getState().step).toBe(host.getFull().step)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().step
    guest.dispatch(legalIntent(guest.getState()))
    expect(host.getFull().step).toBe(before + 1)
    expect(host.getFull().turn).toBe(0)
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().step).toBe(host.getFull().step)
  })

  it('host and guest tableaus reflect each market draft (public state shared)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    // both sides see the same market on connect
    expect(guest.getState().market.length).toBe(host.getFull().market.length)

    host.dispatchLocal(legalIntent(host.getFull()))
    // the host's tableau (seat 0) grew, and the guest sees the full public state
    const hostTiles = Object.keys(host.getFull().tableaus[0]).length
    expect(hostTiles).toBeGreaterThan(1)
    expect(Object.keys(guest.getState().tableaus[0]).length).toBe(hostTiles)
  })
})
