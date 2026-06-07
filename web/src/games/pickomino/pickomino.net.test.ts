/* PICKOMINO / HECKMECK — netplay adapter + session sync tests. Proves the online path
 * headlessly: the adapter validates / round-trips intents, and a HostSession +
 * GuestSession wired through an in-memory transport stay in sync as the seat-0 host rolls
 * and a remote seat plays. Dice are host RNG (state.seed), so the host is the authority and
 * tickKey must change on every action (it folds in s.log.length). */

import { describe, it, expect } from 'vitest'
import { pickominoAdapter as A } from './net'
import * as P from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import type { PickominoState } from './logic'

describe('pickomino net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s0 = A.makeGame()
    expect(A.numSeats(s0)).toBe(3) // You + Hen + Magpie
    expect(A.seatToMove(s0)).toBe(0)
    expect(A.isOver(s0)).toBe(false)

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same ref back.
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // Illegal: 'keep' before any roll -> nothing showing -> same ref back.
    expect(A.applyIntent(s0, 0, { kind: 'keep', face: 1 })).toBe(s0)

    // Legal: seat 0 rolls. rollDice always changes state (new roll or auto-bust).
    const s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    expect(s1).not.toBe(s0)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // Reject a second roll while a live roll is pending (must keep a value first).
    if (s1.hasRolled) {
      expect(A.applyIntent(s1, 0, { kind: 'roll' })).toBe(s1)
      // Reject stop/claim mid-roll (a live roll is pending).
      expect(A.applyIntent(s1, 0, { kind: 'stop' })).toBe(s1)
      expect(A.applyIntent(s1, 0, { kind: 'claim' })).toBe(s1)

      // Legal: keep an available value -> state advances, same seat keeps the move.
      const avail = P.availableValues(s1)
      expect(avail.length).toBeGreaterThan(0)
      const s2 = A.applyIntent(s1, 0, { kind: 'keep', face: avail[0] })
      expect(s2).not.toBe(s1)
      expect(s2.hasRolled).toBe(false)
      expect(A.seatToMove(s2)).toBe(0) // still seat 0's turn after a keep
      expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))

      // Reject keeping a value already taken this turn -> same ref back.
      expect(A.applyIntent(s2, 0, { kind: 'keep', face: avail[0] })).toBe(s2)
    } else {
      // A dead first roll busts: turn flips off seat 0.
      expect(A.seatToMove(s1)).not.toBe(0)
    }
  })

  it('drives an AI seat one action per call and is a no-op off-turn', () => {
    // Advance to seat 1's (AI) turn by playing out seat 0 deterministically.
    let s: PickominoState = P.makeGame(12345)
    let guard = 0
    while (A.seatToMove(s) === 0 && guard++ < 200) {
      const before = A.tickKey(s)
      if (s.hasRolled) {
        const avail = P.availableValues(s)
        s = A.applyIntent(s, 0, { kind: 'keep', face: avail[0] })
      } else if (P.canStop(s)) {
        s = A.applyIntent(s, 0, { kind: 'stop' })
      } else {
        s = A.applyIntent(s, 0, { kind: 'roll' })
      }
      expect(A.tickKey(s)).not.toBe(before) // every action changes the tick key
    }
    expect(A.seatToMove(s)).not.toBe(0)

    // aiStep advances the seat to move (an AI seat); one action changes the tick key.
    const seat = A.seatToMove(s)!
    const before = A.tickKey(s)
    const after = A.aiStep(s, seat)
    expect(after).not.toBe(s)
    expect(A.tickKey(after)).not.toBe(before)
    // aiStep is a no-op when asked for a seat that isn't to move (e.g. the human seat 0).
    expect(A.aiStep(s, 0)).toBe(s)
  })
})

describe('pickomino host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the host actions', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host is seat 0, moves first
    expect(guest.isMyTurn()).toBe(false)
    expect(guest.getState().turn).toBe(0)

    // Host (seat 0) rolls -> the public view (tiles + everyone's stacks + dice) broadcasts.
    const logBefore = host.getFull().log.length
    host.dispatchLocal({ kind: 'roll' })
    expect(host.getFull().log.length).toBe(logBefore + 1)
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
    expect(guest.getState().roll).toEqual(host.getFull().roll)

    // Play seat 0 out (keep/roll/stop) until the turn leaves seat 0; the guest stays synced.
    // A roll can bust with no keepable face — drive seat 0 with the game's own AI policy so
    // every situation (including a bust) advances correctly to the turn's end.
    let guard = 0
    while (host.getFull().turn === 0 && host.getFull().phase !== 'over' && guard++ < 200) {
      const before = host.getFull().log.length
      const full = host.getFull()
      if (full.hasRolled) {
        const avail = P.availableValues(full)
        if (avail.length) host.dispatchLocal({ kind: 'keep', face: avail[0] })
        else host.dispatchLocal({ kind: 'stop' }) // bust / no keepable -> end the turn
      } else if (P.canStop(full)) {
        host.dispatchLocal({ kind: 'stop' })
      } else {
        host.dispatchLocal({ kind: 'roll' })
      }
      // Guest's view tracks the host's authoritative log/turn after every action.
      expect(guest.getState().log.length).toBe(host.getFull().log.length)
      expect(guest.getState().turn).toBe(host.getFull().turn)
      if (host.getFull().log.length === before) break // nothing advanced (stuck) -> stop driving
    }

    // The host stayed authoritative and the guest mirrored it throughout (asserted in-loop).
    // If seat 0's turn finished and it's now the guest's turn, the guest can act and the
    // intent travels host-ward and applies.
    if (host.getFull().turn === 1) {
      expect(guest.isMyTurn()).toBe(true)
      const logBefore2 = host.getFull().log.length
      guest.dispatch({ kind: 'roll' })
      expect(host.getFull().log.length).toBe(logBefore2 + 1)
      expect(guest.getState().log.length).toBe(host.getFull().log.length)
    }
  })
})
