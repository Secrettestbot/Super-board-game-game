/* JOTTO — netplay tests. Three parts:
 *   1. adapter round-trip: a legal guess advances the turn; illegal / out-of-turn / invalid
 *      intents are no-ops (return the same state object).
 *   2. host + guest stay in sync over an in-memory transport (the headless online proof).
 *   3. leak test: the guest's view never contains the host's secret word. */

import { describe, it, expect } from 'vitest'
import { jottoAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as J from './logic'

// Deterministic secrets so we can assert exact words: seat 0 = 'crane', seat 1 = 'mould'.
const SECRETS: [string, string] = ['crane', 'mould']
function newGame(): J.JottoState {
  return J.makeGame(SECRETS)
}

describe('jotto net adapter', () => {
  it('round-trips a legal guess and rejects illegal / out-of-turn / invalid ones', () => {
    const s = newGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // seat 0 (you) moves first
    expect(A.isOver(s)).toBe(false)

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state object.
    expect(A.applyIntent(s, 1, { kind: 'guess', word: 'house' })).toBe(s)

    // Invalid: not a real playable word -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'guess', word: 'zzzzz' })).toBe(s)
    // Invalid: wrong length -> unchanged (isValidWord rejects).
    expect(A.applyIntent(s, 0, { kind: 'guess', word: 'cat' })).toBe(s)
    // Wrong intent kind -> unchanged.
    expect(A.applyIntent(s, 0, { kind: 'nope', word: 'house' } as unknown as never)).toBe(s)

    // Legal: seat 0 guesses 'house' (a valid word) -> state changes, turn passes, jot recorded.
    const before = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { kind: 'guess', word: 'house' })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(before)            // tickKey changed
    expect(A.seatToMove(s2)).toBe(1)                  // turn passed to the opponent
    expect(s2.history[0].length).toBe(1)              // the guess was recorded
    // 'house' vs secret 'mould': common letters o,u -> 2 jots.
    expect(s2.history[0][0]).toEqual({ word: 'house', jots: 2 })

    // A correct guess of the opponent's word wins.
    const won = A.applyIntent(s, 0, { kind: 'guess', word: 'mould' })
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

    // Host (seat 0) guesses a valid word.
    host.dispatchLocal({ kind: 'guess', word: 'crane' })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)                       // now the guest's turn
    expect(guest.getState().history[0].length).toBe(1)        // host's public guess synced
    expect(guest.getState().history[0][0].word).toBe('crane')

    // Guest (seat 1) replies with a valid word.
    const lenBefore = host.getFull().history[1].length
    guest.dispatch({ kind: 'guess', word: 'house' })
    expect(host.getFull().history[1].length).toBe(lenBefore + 1) // intent applied host-ward
    expect(host.getFull().turn).toBe(0)                          // back to the host
    expect(host.isMyTurn()).toBe(true)
  })

  it('never leaks the host secret word to the guest', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()

    // The guest (seat 1) sees its OWN secret word intact...
    expect(view.secrets[1]).toBe(full.secrets[1])
    // ...but the host's secret word (seat 0) is replaced with a placeholder and is genuinely
    // different from the real one.
    expect(view.secrets[0]).not.toBe(full.secrets[0])

    // Robust leak check: the host's real secret word must not appear ANYWHERE in what crossed
    // the wire (not in secrets, history, or anywhere else in the serialized view).
    expect(JSON.stringify(view)).not.toContain(full.secrets[0])
    // The placeholder must not be a real, deducible playable word.
    expect(J.isValidWord(view.secrets[0])).toBe(false)
  })
})
