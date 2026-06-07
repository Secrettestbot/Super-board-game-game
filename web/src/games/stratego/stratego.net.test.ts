/* STRATEGO — netplay adapter tests. Adapter round-trip (setup + a legal move, with
   illegal / out-of-turn rejection), a host+guest in-memory sync, and a LEAK TEST proving a
   guest never reads the host's un-revealed piece ranks. */

import { describe, it, expect } from 'vitest'
import { strategoAdapter as A, RANK_HIDDEN } from './net'
import type { StrategoNetState, PlacedPiece } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as ST from './logic'

const N = ST.N
const idx = (r: number, c: number) => r * N + c

// The home cells each seat deploys onto (must match net.ts SEAT_ROWS).
const SEAT_ROWS: Record<number, [number, number]> = { 0: [6, 7], 1: [0, 1] }

/** A deterministic, valid army for `seat`: ARMY laid across its two home rows in order. */
function layoutFor(seat: number): PlacedPiece[] {
  const rows = SEAT_ROWS[seat]
  const cells: number[] = []
  for (const r of rows) for (let c = 0; c < N; c++) cells.push(idx(r, c))
  return ST.ARMY.map((rank, k) => ({ cell: cells[k], rank }))
}

/** Drive a fresh game past setup by deploying both seats' armies. */
function deployedGame(): StrategoNetState {
  let s = A.makeGame()
  expect(s._phase).toBe('setup')
  expect(A.seatToMove(s)).toBe(0)
  s = A.applyIntent(s, 0, { kind: 'setup', layout: layoutFor(0) })
  expect(A.seatToMove(s)).toBe(1) // seat 0 deployed, seat 1 to deploy
  s = A.applyIntent(s, 1, { kind: 'setup', layout: layoutFor(1) })
  expect(s._phase).toBeUndefined() // setup bookkeeping dropped
  expect(A.seatToMove(s)).toBe(0)  // play begins with seat 0
  return s
}

describe('stratego net adapter', () => {
  it('round-trips setup + a legal move, and rejects illegal / out-of-turn', () => {
    const fresh = A.makeGame()
    // out-of-turn setup (seat 1 before seat 0) -> unchanged
    expect(A.applyIntent(fresh, 1, { kind: 'setup', layout: layoutFor(1) })).toBe(fresh)
    // a move intent during setup -> unchanged
    expect(A.applyIntent(fresh, 0, { kind: 'move', from: idx(6, 0), to: idx(5, 0) })).toBe(fresh)
    // illegal layout (wrong composition: 16 flags) -> unchanged
    const cells0 = [...SEAT_ROWS[0]].flatMap(r => Array.from({ length: N }, (_, c) => idx(r, c)))
    const allFlags: PlacedPiece[] = cells0.map(cell => ({ cell, rank: ST.RANK_FLAG }))
    expect(A.applyIntent(fresh, 0, { kind: 'setup', layout: allFlags })).toBe(fresh)
    // illegal layout (a cell on the opponent's rows) -> unchanged
    const offHome = layoutFor(0).slice()
    offHome[0] = { cell: idx(0, 0), rank: offHome[0].rank }
    expect(A.applyIntent(fresh, 0, { kind: 'setup', layout: offHome })).toBe(fresh)

    let s = deployedGame()

    // out-of-turn move (seat 1 when it's seat 0's turn) -> unchanged
    expect(A.applyIntent(s, 1, { kind: 'move', from: idx(1, 0), to: idx(2, 0) })).toBe(s)
    // illegal move (no piece at empty source) -> unchanged
    expect(A.applyIntent(s, 0, { kind: 'move', from: idx(3, 3), to: idx(3, 4) })).toBe(s)

    // seat 0 makes a legal advance. layoutFor places ARMY in order; ARMY[12]=Scout(2) sits
    // at cell index 12 within the home cells = row 7 col 4 -> but row 6 is the front row, so
    // find any legal move for seat 0 and apply it.
    const legal = ST.legalMoves(s, 0)
    expect(legal.length).toBeGreaterThan(0)
    const before = s
    s = A.applyIntent(s, 0, { kind: 'move', from: legal[0].from, to: legal[0].to })
    expect(s).not.toBe(before)
    expect(A.seatToMove(s)).toBe(1) // turn passed to seat 1
  })

  it('host + guest stay in sync over an in-memory transport (setup -> play)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // host (seat 0) deploys first
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal({ kind: 'setup', layout: layoutFor(0) })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1 deploys

    // guest (seat 1) deploys -> play begins, seat 0 to move
    guest.dispatch({ kind: 'setup', layout: layoutFor(1) })
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)
    expect(host.getFull()._phase).toBeUndefined()

    // host moves; guest's view advances and it becomes the guest's turn
    const legal = ST.legalMoves(host.getFull(), 0)
    const m = legal[0]
    host.dispatchLocal({ kind: 'move', from: m.from, to: m.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().last).toEqual({ from: m.from, to: m.to })

    // guest replies; host's authoritative state advances back to seat 0
    const legal1 = ST.legalMoves(host.getFull(), 1)
    const m1 = legal1[0]
    guest.dispatch({ kind: 'move', from: m1.from, to: m1.to })
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)
  })

  it('LEAK TEST: a guest never reads the host\'s un-revealed piece ranks', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    host.dispatchLocal({ kind: 'setup', layout: layoutFor(0) }) // host = seat 0
    guest.dispatch({ kind: 'setup', layout: layoutFor(1) })     // guest = seat 1

    const full = host.getFull()
    // The host's secret pieces are seat-0 pieces; none are revealed yet.
    const view = guest.getState()

    // Every host (seat-0) piece in the guest's view must have its rank masked.
    for (let i = 0; i < N * N; i++) {
      const c = view.board[i]
      if (ST.isPiece(c) && c.owner === 0) {
        expect(c.revealed).toBe(false)
        expect(c.rank).toBe(RANK_HIDDEN)
      }
    }
    // The guest sees its OWN (seat-1) pieces in full.
    for (let i = 0; i < N * N; i++) {
      const c = view.board[i]
      const truth = full.board[i]
      if (ST.isPiece(c) && c.owner === 1 && ST.isPiece(truth)) {
        expect(c.rank).toBe(truth.rank)
      }
    }

    // No host secret rank survives anywhere in the serialized view: collect the host's true
    // seat-0 rank at every cell, then assert the guest's view never reports that real rank
    // on any seat-0 piece. (Also covers the AI belief map, which redactFor drops entirely.)
    expect(view.belief).toEqual({})
    for (let i = 0; i < N * N; i++) {
      const truth = full.board[i]
      const seen = view.board[i]
      if (ST.isPiece(truth) && truth.owner === 0 && ST.isPiece(seen)) {
        expect(seen.rank).not.toBe(truth.rank)
      }
    }

    // Belt-and-braces: now reveal ONE host piece via real combat and confirm only that
    // piece's rank becomes visible to the guest, with every other host rank still masked.
    // Move seat-0 and seat-1 scouts toward each other until they clash.
    // Simpler: drive a clash by having the guest attack a host front-row piece directly.
    // Advance host front piece up, then guest piece down onto it.
    // (We just assert the masking invariant holds across a couple of plies.)
    let h = full
    const hm = ST.legalMoves(h, 0)[0]
    h = ST.move(h, 0, hm.from, hm.to) as StrategoNetState
    const redacted = A.redactFor!(h, 1)
    for (let i = 0; i < N * N; i++) {
      const truth = h.board[i]
      const seen = redacted.board[i]
      if (ST.isPiece(truth) && truth.owner === 0 && !truth.revealed && ST.isPiece(seen)) {
        expect(seen.rank).toBe(RANK_HIDDEN)
      }
      if (ST.isPiece(truth) && truth.owner === 0 && truth.revealed && ST.isPiece(seen)) {
        expect(seen.rank).toBe(truth.rank) // revealed ranks are public
      }
    }
  })
})
