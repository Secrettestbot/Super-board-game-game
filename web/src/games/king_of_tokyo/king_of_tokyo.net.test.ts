/* KING OF TOKYO — netplay tests. Proves the adapter round-trips legal intents and
 * rejects illegal / out-of-turn ones, and that a HostSession + GuestSession stay in sync
 * over an in-memory transport. Everything is public, so there's no redactFor and hence no
 * leak test. A deterministic RNG is injected so rolls are reproducible across the wire. */

import { describe, it, expect, afterEach } from 'vitest'
import { kingOfTokyoAdapter as A, type KingOfTokyoIntent } from './net'
import { setRng } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// Deterministic RNG: always the lowest value so every die rolls face index 0 (== a "1").
const restore: Array<() => void> = []
function fixRng(seq: number[] = [0]) {
  let i = 0
  const prev = setRng(() => seq[i++ % seq.length])
  restore.push(() => setRng(prev))
}
afterEach(() => { while (restore.length) restore.pop()!() })

describe('king of tokyo net adapter', () => {
  it('reports real seat count and the active seat to move', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(s.monsters.length) // 3 monsters -> 3 seats
    expect(A.seatToMove(s)).toBe(0)               // seat 0 starts
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll intent and changes the tick key', () => {
    fixRng()
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const s1 = A.applyIntent(s, 0, { kind: 'roll' })
    expect(s1).not.toBe(s)          // a fresh state
    expect(s1.rolled).toBe(true)
    expect(s1.rerollsLeft).toBe(2)
    expect(A.tickKey(s1)).not.toBe(k0)
  })

  it('returns the input state unchanged for an out-of-turn intent', () => {
    const s = A.makeGame()
    // seat 1 tries to act on seat 0's turn -> ignored, same ref back
    expect(A.applyIntent(s, 1, { kind: 'roll' })).toBe(s)
  })

  it('returns the input state unchanged for an illegal intent', () => {
    const s = A.makeGame()
    // can't resolve before rolling -> logic rejects -> same ref back
    expect(A.applyIntent(s, 0, { kind: 'resolve' })).toBe(s)
    // can't toggle-keep before a roll -> same ref back
    expect(A.applyIntent(s, 0, { kind: 'hold', i: 0 })).toBe(s)
    // bogus intent shape -> same ref back
    expect(A.applyIntent(s, 0, { kind: 'bogus' } as unknown as KingOfTokyoIntent)).toBe(s)
  })

  it('drives a full turn (roll -> resolve -> end) and passes to the next seat', () => {
    fixRng()
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'roll' })
    s = A.applyIntent(s, 0, { kind: 'resolve' })
    expect(s.phase).toBe('resolved')
    s = A.applyIntent(s, 0, { kind: 'end' })
    expect(A.seatToMove(s)).toBe(1) // advanced to the next monster
    expect(s.phase).toBe('roll')
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    fixRng()
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)               // host is seat 0, guest takes seat 1
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest', 'ai'])
    expect(guest.getState().monsters.length).toBe(3) // sees the full public state

    // Host (seat 0) plays its whole turn locally.
    host.dispatchLocal({ kind: 'roll' })
    expect(guest.getState().rolled).toBe(true)   // view synced to the guest
    host.dispatchLocal({ kind: 'resolve' })
    host.dispatchLocal({ kind: 'end' })

    // Now it's seat 1 (the guest) to move, on the host's authoritative state.
    expect(host.getFull().turn).toBe(1)
    expect(guest.isMyTurn()).toBe(true)

    // Guest replies; the intent travels host-ward and applies.
    const before = host.getFull().step
    guest.dispatch({ kind: 'roll' })
    expect(host.getFull().step).toBeGreaterThan(before) // host advanced from the guest move
    expect(host.getFull().rolled).toBe(true)
  })
})
