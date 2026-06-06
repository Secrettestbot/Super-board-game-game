/* Browser-free integration test of dara online play: the adapter round-trip (phase-keyed
   intents, illegal/out-of-turn rejection, the same-seat dara capture sub-action) and a
   HostSession + GuestSession wired through an in-memory transport pair playing real dara. */

import { describe, it, expect } from 'vitest'
import { daraAdapter as A } from './net'
import type { DaraIntent } from './net'
import * as DA from './logic'
import type { DaraState } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// A handcrafted MOVE-phase position (hands empty) where sliding sand A2->A3 completes the
// vertical run A3,A4,A5 — an exactly-three "dara" — leaving sand still to move for the
// capture. Built from a fresh game so it matches the real DaraState shape; logic.ts is
// never edited, only its public state is composed.
//   col A = index 0,6,12,18,24 (rows 1..5). Sand at A4(18),A5(24); a sand stone at A2(6)
//   slides down to A3(12). Slate has spare stones to capture.
function moveStateDaraReady(): DaraState {
  const base = DA.makeGame()
  const board = new Array(DA.CELLS).fill(null) as DaraState['board']
  board[6] = 's'   // A2 — the slider
  board[12] = null // A3 — empty target
  board[18] = 's'  // A4
  board[24] = 's'  // A5
  board[1] = 'a'   // B1 — slate, capturable
  board[7] = 'a'   // B2 — slate
  board[13] = 'a'  // B3 — slate (keeps slate >= 3 after one capture)
  board[19] = 'a'  // B4 — slate
  return { ...base, board, phase: 'move', turn: 's', hand: { s: 0, a: 0 }, last: null }
}

describe('dara net adapter', () => {
  it('starts with Sand (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal drop and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const cell = DA.dropCells(s.board, 's')[0]
    const s2 = A.applyIntent(s, 0, { kind: 'place', cell })
    expect(s2).not.toBe(s)
    expect(s2.board[cell]).toBe('s')
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('returns the SAME state for an out-of-turn intent', () => {
    const s = A.makeGame()
    const cell = DA.dropCells(s.board, 's')[0]
    // seat 1 tries to act on Sand's turn
    expect(A.applyIntent(s, 1, { kind: 'place', cell })).toBe(s)
  })

  it('returns the SAME state for illegal / wrong-phase intents', () => {
    const s = A.makeGame()
    // move intent during the drop phase
    expect(A.applyIntent(s, 0, { kind: 'move', from: 0, to: 1 })).toBe(s)
    // remove intent with no pending capture
    expect(A.applyIntent(s, 0, { kind: 'remove', cell: 1 })).toBe(s)
    const s2 = A.applyIntent(s, 0, { kind: 'place', cell: DA.dropCells(s.board, 's')[0] })
    // dropping onto an occupied cell
    const occupied = s2.board.findIndex(v => v === 's')
    expect(A.applyIntent(s2, 1, { kind: 'place', cell: occupied })).toBe(s2)
  })

  it('legal move advances the state and passes the turn', () => {
    const s = A.makeGame()
    // drive a tiny opening so move-phase isn't needed: just verify a drop advances seats.
    const c0 = DA.dropCells(s.board, 's')[0]
    const s1 = A.applyIntent(s, 0, { kind: 'place', cell: c0 })
    expect(A.seatToMove(s1)).toBe(1)
    const c1 = DA.dropCells(s1.board, 'a')[0]
    const s2 = A.applyIntent(s1, 1, { kind: 'place', cell: c1 })
    expect(s2.board[c1]).toBe('a')
    expect(A.seatToMove(s2)).toBe(0)
  })

  it('keeps the same seat to move during its own dara capture, then hands over', () => {
    const pre = moveStateDaraReady()
    expect(A.seatToMove(pre)).toBe(0)
    const milled = A.applyIntent(pre, 0, { kind: 'move', from: 6, to: 12 }) // forms A3,A4,A5
    expect(milled).not.toBe(pre)
    expect(milled.pendingCapture).toBe('a') // sand must capture a slate stone
    expect(A.seatToMove(milled)).toBe(0)    // STILL sand's turn for the capture
    // out-of-turn during the capture: seat 1 can't act
    expect(A.applyIntent(milled, 1, { kind: 'remove', cell: 1 })).toBe(milled)
    // tickKey changed across the dara action so the AI would re-arm
    expect(A.tickKey(milled)).not.toBe(A.tickKey(pre))
    // sand captures a slate stone -> turn passes to seat 1
    const target = DA.captureTargets(milled.board, 's')[0]
    const after = A.applyIntent(milled, 0, { kind: 'remove', cell: target })
    expect(after).not.toBe(milled)
    expect(after.board[target]).toBeNull()
    expect(after.pendingCapture).toBeNull()
    expect(A.seatToMove(after)).toBe(1)
    expect(A.tickKey(after)).not.toBe(A.tickKey(milled))
  })

  it('aiStep advances for an AI seat and hands the turn back to seat 0', () => {
    const s = A.applyIntent(A.makeGame(), 0, { kind: 'place', cell: DA.dropCells(A.makeGame().board, 's')[0] })
    expect(A.seatToMove(s)).toBe(1)
    const t0 = A.tickKey(s)
    const s2 = A.aiStep(s, 1)
    expect(A.tickKey(s2)).not.toBe(t0)
    // the AI completed its whole turn (no dangling AI capture phase)
    expect(A.seatToMove(s2)).toBe(0)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession<DaraState, DaraIntent>(A, b)
  return { host, guest }
}

describe('dara netplay session (host + guest over in-memory transport)', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(DA.CELLS)
    expect(guest.isMyTurn()).toBe(false) // Sand (host) moves first
  })

  it('relays intents both directions and stays in sync', () => {
    const { host, guest } = connect()
    // host (Sand, seat 0) drops first
    const c0 = DA.dropCells(host.getFull().board, 's')[0]
    host.dispatchLocal({ kind: 'place', cell: c0 })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().board[c0]).toBe('s')

    // guest (Slate, seat 1) replies
    const c1 = DA.dropCells(guest.getState().board, 'a')[0]
    guest.dispatch({ kind: 'place', cell: c1 })
    expect(host.getFull().board[c1]).toBe('a')
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().board[c1]).toBe('a')
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    // it's Sand's (host) turn, guest tries to drop
    const c = DA.dropCells(host.getFull().board, 'a')[0]
    guest.dispatch({ kind: 'place', cell: c } as DaraIntent)
    expect(host.getFull().board[c]).toBeNull()
  })
})
