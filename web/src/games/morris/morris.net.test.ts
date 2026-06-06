/* Browser-free integration test of morris online play: the adapter round-trip (phase-keyed
   intents, illegal/out-of-turn rejection, the same-seat mill removal) and a HostSession +
   GuestSession wired through an in-memory transport pair playing real morris. */

import { describe, it, expect } from 'vitest'
import { morrisAdapter as A } from './net'
import type { MorrisIntent } from './net'
import * as MM from './logic'
import type { MorrisState } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// Drive white (seat 0) and black (seat 1) to a position where placing the next white man
// closes a mill, leaving white in the 'remove' phase (same seat still to move).
function setupMillForWhite(): MorrisState {
  let s = A.makeGame()
  // White builds toward mill [0,1,2]; Black plays elsewhere harmlessly.
  s = A.applyIntent(s, 0, { kind: 'place', cell: 0 }) // w
  s = A.applyIntent(s, 1, { kind: 'place', cell: 9 }) // b
  s = A.applyIntent(s, 0, { kind: 'place', cell: 1 }) // w
  s = A.applyIntent(s, 1, { kind: 'place', cell: 13 }) // b
  // now white placing at 2 completes mill [0,1,2]
  return s
}

describe('morris net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal place and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { kind: 'place', cell: 4 })
    expect(s2).not.toBe(s)
    expect(s2.board[4]).toBe('w')
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('returns the SAME state for an out-of-turn intent', () => {
    const s = A.makeGame()
    // seat 1 tries to act on White's turn
    expect(A.applyIntent(s, 1, { kind: 'place', cell: 4 })).toBe(s)
  })

  it('returns the SAME state for illegal / wrong-phase intents', () => {
    const s = A.makeGame()
    // occupied is fine to test once we place; first, a move intent during the place phase
    expect(A.applyIntent(s, 0, { kind: 'move', from: 0, to: 1 })).toBe(s)
    // a remove intent during the place phase
    expect(A.applyIntent(s, 0, { kind: 'remove', cell: 0 })).toBe(s)
    const s2 = A.applyIntent(s, 0, { kind: 'place', cell: 4 })
    // placing onto an occupied point
    expect(A.applyIntent(s2, 1, { kind: 'place', cell: 4 })).toBe(s2)
  })

  it('keeps the same seat to move during its own mill removal, then hands over', () => {
    const pre = setupMillForWhite()
    expect(A.seatToMove(pre)).toBe(0)
    const milled = A.applyIntent(pre, 0, { kind: 'place', cell: 2 }) // closes mill [0,1,2]
    expect(milled).not.toBe(pre)
    expect(milled.phase).toBe('remove')
    expect(A.seatToMove(milled)).toBe(0) // STILL white's turn for the removal
    // out-of-turn during removal: seat 1 can't act
    expect(A.applyIntent(milled, 1, { kind: 'remove', cell: 9 })).toBe(milled)
    // tickKey changed across the mill action so the AI would re-arm
    expect(A.tickKey(milled)).not.toBe(A.tickKey(pre))
    // white removes a black man -> turn passes to seat 1
    const removable = MM.removable(milled.board, 'b')
    const after = A.applyIntent(milled, 0, { kind: 'remove', cell: removable[0] })
    expect(after).not.toBe(milled)
    expect(after.board[removable[0]]).toBeNull()
    expect(A.seatToMove(after)).toBe(1)
    expect(A.tickKey(after)).not.toBe(A.tickKey(milled))
  })

  it('aiStep advances for an AI seat and alternates colours', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'place', cell: 4 }) // white done, seat 1 to move
    expect(A.seatToMove(s)).toBe(1)
    const t0 = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(t0)
    // the AI completed its whole turn (no dangling AI removal phase)
    expect(A.seatToMove(s)).toBe(0)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession<MorrisState, MorrisIntent>(A, b)
  return { host, guest }
}

describe('morris netplay session (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(24)
    expect(guest.isMyTurn()).toBe(false) // White (host) moves first
  })

  it('relays intents both directions and stays in sync', () => {
    const { host, guest } = connect()
    // host (White, seat 0) places first
    host.dispatchLocal({ kind: 'place', cell: 4 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[4]).toBe('w')

    // guest (Black, seat 1) replies
    guest.dispatch({ kind: 'place', cell: 9 })
    expect(host.getFull().board[9]).toBe('b')
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().board[9]).toBe('b')
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    // it's White's (host) turn, guest tries to place
    guest.dispatch({ kind: 'place', cell: 4 } as MorrisIntent)
    expect(host.getFull().board[4]).toBeNull()
  })
})
