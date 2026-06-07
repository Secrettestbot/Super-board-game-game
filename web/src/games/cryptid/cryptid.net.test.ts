/* CRYPTID — netplay tests. Three parts:
 *   1. adapter round-trip: a legal question advances the turn; illegal / out-of-turn
 *      intents are no-ops (return the same state object).
 *   2. host + guest stay in sync over an in-memory transport (the headless online proof).
 *   3. leak test: the guest's view never contains the host's secret clue or the cryptid. */

import { describe, it, expect } from 'vitest'
import { cryptidAdapter as A, type CryptidIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as C from './logic'

describe('cryptid net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s = C.makeGame(42)
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // seat 0 (you) moves first
    expect(A.isOver(s)).toBe(false)

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state object.
    expect(A.applyIntent(s, 1, { kind: 'question', target: 0, cell: 0 })).toBe(s)

    // Illegal: asking yourself -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'question', target: 0, cell: 0 })).toBe(s)
    // Illegal: out-of-range cell -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'question', target: 1, cell: 999 })).toBe(s)
    // Illegal: out-of-range target seat -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'question', target: 5, cell: 0 })).toBe(s)

    // Legal: seat 0 asks the rival (seat 1) about hex 0 -> state changes, turn passes.
    const before = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { kind: 'question', target: 1, cell: 0 })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)        // tickKey changed
    expect(A.seatToMove(s2)).toBe(1)              // turn passed to the rival
    expect(s2.markers[1][0]).toBeDefined()        // the rival's answer was placed

    // Now it's seat 1's turn. Re-asking the SAME hex (already answered for seat 1) is a
    // no-op: seat 1 asks seat 0 about a fresh hex, then re-asking it is rejected.
    const s3 = A.applyIntent(s2, 1, { kind: 'question', target: 0, cell: 5 })
    expect(s3).not.toBe(s2)
    expect(s3.markers[0][5]).toBeDefined()
    // Back to seat 0; re-asking seat 1 about hex 0 (already answered) -> unchanged.
    expect(A.applyIntent(s3, 0, { kind: 'question', target: 1, cell: 0 })).toBe(s3)
  })

  it('a correct search wins; the adapter validates search cells', () => {
    const s = C.makeGame(42)
    // Out-of-range search cell -> unchanged.
    const badSearch: CryptidIntent = { kind: 'search', cell: -1 }
    expect(A.applyIntent(s, 0, badSearch)).toBe(s)
    // Searching the true cryptid hex (it fits both clues) -> seat 0 wins.
    const won = A.applyIntent(s, 0, { kind: 'search', cell: s.cryptid })
    expect(won).not.toBe(s)
    expect(A.isOver(won)).toBe(true)
    expect(won.winner).toBe(0)
    expect(A.seatToMove(won)).toBeNull()
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host = seat 0, moves first
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) asks the guest's seat (1) about a hex.
    host.dispatchLocal({ kind: 'question', target: 1, cell: 0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)              // now the guest's turn
    expect(guest.getState().markers[1][0]).toBeDefined() // marker synced to the guest

    // Guest (seat 1) replies: ask the host's seat (0) about a different hex.
    const logBefore = host.getFull().log.length
    guest.dispatch({ kind: 'question', target: 0, cell: 7 })
    expect(host.getFull().log.length).toBeGreaterThan(logBefore) // intent applied host-ward
    expect(host.getFull().turn).toBe(0)             // back to the host
    expect(host.isMyTurn()).toBe(true)
  })

  it('never leaks the host secret clue or the cryptid hex to the guest', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()

    // The guest (seat 1) sees its OWN clue intact...
    expect(view.clues[1]).toEqual(full.clues[1])
    // ...but the host's clue (seat 0) is replaced with a neutral placeholder and is
    // genuinely different from the real one.
    expect(view.clues[0]).not.toEqual(full.clues[0])
    // ...and the true cryptid index is blanked out.
    expect(view.cryptid).toBe(-1)
    expect(view.cryptid).not.toBe(full.cryptid)

    // Robust leak check: the guest must not be able to reconstruct the host's secret clue
    // by enumerating every possible clue and matching the host slot. The placeholder carries
    // bogus terrain markers ('?'), so clueFits never matches it to a real clue's footprint —
    // and crucially the wire view's clues[0] is NOT the real clue object.
    expect(JSON.stringify(view.clues[0])).not.toBe(JSON.stringify(full.clues[0]))
    // The placeholder must not accidentally equal ANY real, deducible clue.
    for (const cl of C.allClues()) expect(view.clues[0]).not.toEqual(cl)
  })
})
