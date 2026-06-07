/* STONE AGE — netplay tests. Proves the adapter round-trips legal intents and rejects
 * illegal / out-of-turn ones, and that a HostSession + GuestSession stay in sync over an
 * in-memory transport (the headless substitute for a live WebRTC run). Stone Age is fully
 * public information, so there is no redactFor / leak test. */

import { describe, it, expect } from 'vitest'
import { stoneAgeAdapter as A, type StoneAgeIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('stone_age net adapter', () => {
  it('round-trips a legal placement and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)

    // legal seat-0 placement -> state changes, a worker leaves seat 0's pool
    const before = s.toPlace[0]
    const after = A.applyIntent(s, 0, { kind: 'place', space: 'hunting', count: 1 })
    expect(after).not.toBe(s)
    expect(after.toPlace[0]).toBe(before - 1)
    expect(after.occ['hunting']).toContain(0)

    // out-of-turn: seat 1 cannot act while it is seat 0's turn -> same ref
    expect(A.applyIntent(s, 1, { kind: 'place', space: 'forest', count: 1 })).toBe(s)

    // illegal: the hut needs exactly 2 workers, placing 1 is rejected -> same ref
    expect(A.applyIntent(s, 0, { kind: 'place', space: 'hut', count: 1 })).toBe(s)

    // illegal: wrong phase (resolve during the place phase) -> same ref
    expect(A.applyIntent(s, 0, { kind: 'resolve' })).toBe(s)

    // tickKey changes across the transition
    expect(A.tickKey(after)).not.toBe(A.tickKey(s))
  })

  it('reaches the resolve phase and the resolve intent gathers (host RNG)', () => {
    // Drive both seats through placement until the resolve phase begins.
    let s = A.makeGame()
    let guard = 0
    while (s.phase === 'place' && guard++ < 100) {
      const seat = s.turn
      // place everything remaining onto hunting (always open, accepts any count)
      const n = s.toPlace[seat]
      const next = A.applyIntent(s, seat, { kind: 'place', space: 'hunting', count: n })
      s = next === s ? A.applyIntent(s, seat, { kind: 'place', space: 'hunting', count: 1 }) : next
    }
    expect(s.phase).toBe('resolve')
    // resolving seat 0 (who hunted) yields food and advances the resolver
    const resolved = A.applyIntent(s, s.turn, { kind: 'resolve' })
    expect(resolved).not.toBe(s)
    expect(resolved.lastDice.length).toBeGreaterThan(0)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])

    // host (seat 0) places a worker; the view propagates to the guest
    host.dispatchLocal({ kind: 'place', space: 'forest', count: 1 } as StoneAgeIntent)
    expect(host.getFull().occ['forest']).toContain(0)
    // it is now seat 1's (guest's) turn to place
    expect(host.getFull().turn).toBe(1)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().occ['forest']).toContain(0)

    // guest (seat 1) replies with its own placement; the intent travels host-ward
    guest.dispatch({ kind: 'place', space: 'claypit', count: 1 } as StoneAgeIntent)
    expect(host.getFull().occ['claypit']).toContain(1)
    expect(host.getFull().turn).toBe(0) // back to the host
    // guest's view reflects the host's authoritative state
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    // it is the host's (seat 0) turn, but the guest tries to place
    const before = host.getFull().toPlace.join('.')
    guest.dispatch({ kind: 'place', space: 'forest', count: 1 } as StoneAgeIntent)
    expect(host.getFull().toPlace.join('.')).toBe(before) // nothing changed
  })
})
