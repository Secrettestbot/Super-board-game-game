/* CAN'T STOP — netplay adapter + session sync tests. Proves the online path headlessly:
 * the adapter validates/round-trips intents, and a HostSession + GuestSession wired through
 * an in-memory transport stay in sync as the seat-0 host rolls and the seat-1 guest plays. */

import { describe, it, expect } from 'vitest'
import { cantStopAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('cant_stop net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s0 = A.makeGame()
    expect(A.numSeats(s0)).toBe(2)
    expect(A.seatToMove(s0)).toBe(0) // 'you' moves first
    expect(A.isOver(s0)).toBe(false)

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same ref back.
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // Illegal: 'pick' while in 'preroll' -> same ref back.
    expect(A.applyIntent(s0, 0, { kind: 'pick', pairing: 0 })).toBe(s0)
    // Illegal: 'stop' with no runners -> same ref back.
    expect(A.applyIntent(s0, 0, { kind: 'stop' })).toBe(s0)

    // Legal: seat 0 rolls. roll() always changes state (either to 'choose' or busts/ends).
    const s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    expect(s1).not.toBe(s0)
    expect(s1.step).toBe(s0.step + 1)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // If the roll landed on 'choose', a legal pick advances and keeps the same seat.
    if (s1.phase === 'choose') {
      const idx = s1.pairings.findIndex(p => p.usable)
      expect(idx).toBeGreaterThanOrEqual(0)
      const s2 = A.applyIntent(s1, 0, { kind: 'pick', pairing: idx })
      expect(s2).not.toBe(s1)
      expect(s2.phase).toBe('preroll')
      expect(A.seatToMove(s2)).toBe(0) // still seat 0's turn after a pick
      // Now stop is legal (runners present) and ends the turn -> seat flips to 1.
      const s3 = A.applyIntent(s2, 0, { kind: 'stop' })
      expect(s3).not.toBe(s2)
      expect(A.seatToMove(s3)).toBe(1)
    } else {
      // A dead first roll busts: turn flips to seat 1.
      expect(A.seatToMove(s1)).toBe(1)
    }
  })

  it('drives the AI seat one action per call', () => {
    // Get to seat 1's ('ai') turn by busting/ending seat 0, then step the AI.
    let s = A.makeGame()
    // Force seat 0 to end its turn: roll until it either busts or we can stop.
    while (A.seatToMove(s) === 0) {
      const before = A.tickKey(s)
      if (s.phase === 'preroll' && Object.keys(s.runners).length > 0) {
        s = A.applyIntent(s, 0, { kind: 'stop' })
      } else if (s.phase === 'preroll') {
        s = A.applyIntent(s, 0, { kind: 'roll' })
      } else {
        const idx = s.pairings.findIndex(p => p.usable)
        s = A.applyIntent(s, 0, { kind: 'pick', pairing: idx } as const)
      }
      expect(A.tickKey(s)).not.toBe(before) // every action changes the tick key
    }
    expect(A.seatToMove(s)).toBe(1)
    // aiStep advances the 'ai' seat; one action changes the tick key.
    const before = A.tickKey(s)
    const after = A.aiStep(s, 1)
    expect(after).not.toBe(s)
    expect(A.tickKey(after)).not.toBe(before)
    // aiStep is a no-op when asked for a seat that isn't to move.
    expect(A.aiStep(s, 0)).toBe(s)
  })
})

describe('cant_stop host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the host roll', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host is seat 0, moves first
    expect(guest.isMyTurn()).toBe(false)
    expect(guest.getState().turn).toBe('you')

    // Host (seat 0) rolls -> view broadcasts to the guest.
    host.dispatchLocal({ kind: 'roll' })
    expect(guest.getState().step).toBe(host.getFull().step)

    if (host.getFull().phase === 'choose') {
      // Host picks a usable pairing, then stops -> turn passes to the guest (seat 1).
      const full = host.getFull()
      const idx = full.pairings.findIndex(p => p.usable)
      host.dispatchLocal({ kind: 'pick', pairing: idx })
      host.dispatchLocal({ kind: 'stop' })
    }
    // Either via a stop or a bust, the turn is now seat 1's and the guest sees it.
    expect(host.getFull().turn).toBe('ai')
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().step).toBe(host.getFull().step)

    // Guest (seat 1) rolls; intent travels host-ward, applies, and re-syncs.
    const stepBefore = host.getFull().step
    guest.dispatch({ kind: 'roll' })
    expect(host.getFull().step).toBe(stepBefore + 1)
    expect(guest.getState().step).toBe(host.getFull().step)
  })
})
