/* AZUL — netplay tests. Proves the adapter round-trips a legal draft and rejects
 * illegal / out-of-turn intents (returning the SAME state ref), then drives a
 * HostSession + GuestSession over an in-memory transport to show they stay in sync.
 * Azul is perfect information, so there is no redactFor / leak test. */

import { describe, it, expect } from 'vitest'
import { azulAdapter as A, type AzulIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as L from './logic'

describe('azul net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // A legal seat-0 draft advances the state (step bumps; ref changes).
    const m = L.legalMoves(s)[0]
    const intent: AzulIntent = { source: m.source, color: m.color, line: m.line }
    const after = A.applyIntent(s, 0, intent)
    expect(after).not.toBe(s)
    expect(after.step).toBe(s.step + 1)
    expect(A.tickKey(after)).not.toBe(A.tickKey(s))

    // Out-of-turn: seat 1 tries to move on seat 0's turn -> unchanged (same ref).
    expect(A.applyIntent(s, 1, intent)).toBe(s)

    // Illegal: a color/source/line combo not in the legal set -> unchanged (same ref).
    const bogus: AzulIntent = { source: 0, color: 999, line: 0 }
    expect(A.applyIntent(s, 0, bogus)).toBe(s)
  })
})

describe('azul host + guest over an in-memory transport', () => {
  it('stays in sync as host (seat 0) and guest (seat 1) alternate drafts', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])

    // Host (seat 0) drafts; the turn passes to the guest and the view syncs.
    expect(host.isMyTurn()).toBe(true)
    const m0 = L.legalMoves(host.getFull())[0]
    host.dispatchLocal({ source: m0.source, color: m0.color, line: m0.line })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().step).toBe(host.getFull().step)

    // Guest (seat 1) replies; the intent travels host-ward and applies.
    const before = host.getFull().step
    const m1 = L.legalMoves(guest.getState())[0]
    guest.dispatch({ source: m1.source, color: m1.color, line: m1.line })
    expect(host.getFull().step).toBe(before + 1)
    expect(guest.getState().step).toBe(host.getFull().step)
  })
})
