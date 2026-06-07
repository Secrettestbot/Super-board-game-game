/* COLORETTO — netplay tests. Adapter round-trip (legal flip/take applied, illegal &
   out-of-turn rejected as the same state), a host+guest in-memory sync run, and a
   redaction leak test proving the face-down deck contents never cross the wire to a
   guest (only its length and the public board do). */

import { describe, it, expect } from 'vitest'
import { colorettoAdapter as A, type ColorettoIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as CL from './logic'
import type { ColorettoState } from './logic'

// A state with a known top-of-deck card and one open row, so a flip is deterministic.
function withTopCard(): ColorettoState {
  const s = CL.makeGame()
  // top of deck = end of array; force a plain red so the placed card is known.
  return { ...s, deck: s.deck.concat([{ kind: 'color', color: 'red' }]) }
}

describe('coloretto net adapter', () => {
  it('round-trips a legal flip and rejects illegal / out-of-turn intents', () => {
    const s = withTopCard()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // 'you' to move

    // legal flip by seat 0 onto open row 0 -> red lands on row 0, turn passes to seat 1
    const after = A.applyIntent(s, 0, { kind: 'flip', column: 0 })
    expect(after).not.toBe(s)
    expect(after.rows[0]).toHaveLength(1)
    expect(after.rows[0][0]).toEqual({ kind: 'color', color: 'red' })
    expect(A.seatToMove(after)).toBe(1)

    // out-of-turn: seat 1 acts while it's seat 0's turn -> unchanged (===)
    expect(A.applyIntent(s, 1, { kind: 'flip', column: 0 })).toBe(s)

    // illegal flip onto a full/taken row, and illegal take of an empty row -> unchanged
    const full = { ...s, rows: [[{ kind: 'color', color: 'blue' }, { kind: 'plus2' }, { kind: 'last' }], [], []] as ColorettoState['rows'] }
    expect(A.applyIntent(full, 0, { kind: 'flip', column: 0 })).toBe(full)
    expect(A.applyIntent(s, 0, { kind: 'take', column: 0 })).toBe(s) // row 0 empty -> not takeable

    // a legal take of a non-empty row collects it
    const board = { ...s, rows: [[{ kind: 'color', color: 'green' }], [], []] as ColorettoState['rows'] }
    const took = A.applyIntent(board, 0, { kind: 'take', column: 0 })
    expect(took).not.toBe(board)
    expect(took.tableau.you.colors.green).toBe(1)
    expect(took.taken[0]).toBe(true)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // host (seat 0 = 'you') flips onto an open row
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal({ kind: 'flip', column: 0 })
    expect(host.getFull().rows[0]).toHaveLength(1)

    // turn passed to the guest (seat 1 = 'ai'), and its view reflects the host's board
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().rows[0]).toHaveLength(1)

    // guest replies with a legal flip; the host's authoritative state advances
    const before = host.getFull().deck.length
    guest.dispatch({ kind: 'flip', column: 1 })
    expect(host.getFull().rows[1].length + host.getFull().rows[0].length).toBeGreaterThanOrEqual(2)
    expect(host.getFull().deck.length).toBeLessThanOrEqual(before)
  })
})

describe('coloretto redaction (hidden deck)', () => {
  it('hides the face-down deck contents from the guest but keeps its length', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()
    // length preserved so the deck counter still works
    expect(view.deck.length).toBe(full.deck.length)

    // The real deck has a mix of colours, +2s and exactly one 'last' marker; the guest's
    // view must reveal none of that order/distribution — every entry is a face-down stand-in.
    const realKinds = full.deck.map(c => c.kind).join(',')
    const viewKinds = view.deck.map(c => c.kind).join(',')
    expect(realKinds).not.toBe(viewKinds) // distribution scrubbed
    expect(view.deck.every(c => c.kind === 'last')).toBe(true) // uniform placeholder

    // No colour card from the deck leaks through the wire view.
    expect(view.deck.some(c => c.kind === 'color')).toBe(false)
  })
})
