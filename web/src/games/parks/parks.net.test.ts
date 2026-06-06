/* PARKS — netplay adapter tests: adapter round-trip (legal / illegal / out-of-turn) and a
 * host+guest integration over an in-memory transport. Parks is perfect-information, so there
 * is no redactFor and no leak test — the guest legitimately sees the whole board. */

import { describe, it, expect } from 'vitest'
import { parksAdapter as A, type ParksIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as P from './logic'
import type { ParksState, Player } from './logic'

// Drive both players' hikers to END THROUGH THE ADAPTER so its season-closing window
// bookkeeping (forcing turn -> seat 0 when both finish) applies.
function reachClosing(s0: ParksState): ParksState {
  let g = s0
  const move = (seat: Player, hiker: 0 | 1): void => {
    g = A.applyIntent(g, seat, { kind: 'move', hiker, site: P.END })
  }
  move(0, 0)
  move(1, 0)
  move(0, 1)
  move(1, 1)
  return g
}

describe('parks net adapter', () => {
  it('round-trips a legal move and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // legal seat-0 move -> state changes, turn passes to seat 1
    const legal = P.legalMoves(s, 0).find(m => m.site !== P.END)!
    const s1 = A.applyIntent(s, 0, { kind: 'move', hiker: legal.hiker, site: legal.site })
    expect(s1).not.toBe(s)
    expect(A.seatToMove(s1)).toBe(1)
    expect(s1.players[0].hikers[legal.hiker]).toBe(legal.site)

    // out-of-turn: seat 1 tries to move while it is now seat 1's turn? It IS seat 1's turn now,
    // so test out-of-turn the other way: on the fresh state seat 1 cannot act.
    const outOfTurn = A.applyIntent(s, 1, { kind: 'move', hiker: 0, site: legal.site })
    expect(outOfTurn).toBe(s) // unchanged, same reference

    // illegal move: a backward / occupied target returns the SAME state reference
    const illegal = A.applyIntent(s1, 1, { kind: 'move', hiker: 0, site: legal.site })
    expect(illegal).toBe(s1) // site occupied by seat 0's hiker -> rejected unchanged

    // a buy intent during normal play is illegal -> unchanged
    const buyEarly = A.applyIntent(s, 0, { kind: 'buy', parkId: s.market[0].id })
    expect(buyEarly).toBe(s)
  })

  it('drives the season-closing buy window and advances the season', () => {
    const closing = reachClosing(P.makeGame({ seed: 7 }))
    expect(P.bothFinished(closing)).toBe(true)
    // window opened at seat 0 (the adapter forces it there when both finish)
    const buyer = A.seatToMove(closing)
    expect(buyer).toBe(0)
    expect(A.isOver(closing)).toBe(false)

    // a move is illegal once both have finished
    const tryMove = A.applyIntent(closing, buyer as number, { kind: 'move', hiker: 0, site: P.END })
    expect(tryMove).toBe(closing)

    // both seats pass their window -> season advances (or game finishes)
    let g = closing
    const before = g.season
    g = A.applyIntent(g, A.seatToMove(g) as number, { kind: 'endTurn' })
    g = A.applyIntent(g, A.seatToMove(g) as number, { kind: 'endTurn' })
    expect(g.season).toBe(before + 1) // season 1 -> 2 (not the last season)
    expect(P.bothFinished(g)).toBe(false) // fresh trail, hikers reset
    expect(A.seatToMove(g)).toBe(0)
  })

  it('tickKey changes on every transition', () => {
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const m = P.legalMoves(s, 0).find(mv => mv.site !== P.END)!
    const s1 = A.applyIntent(s, 0, { kind: 'move', hiker: m.hiker, site: m.site })
    expect(A.tickKey(s1)).not.toBe(k0)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host is seat 0, moves first
    expect(guest.isMyTurn()).toBe(false)
    // guest sees the same trail (perfect information)
    expect(guest.getState().trail.length).toBe(P.TRAIL_LEN)

    // host (seat 0) makes a legal move
    const hm = P.legalMoves(host.getFull(), 0).find(m => m.site !== P.END)!
    host.dispatchLocal({ kind: 'move', hiker: hm.hiker, site: hm.site })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's (guest's) turn, view synced
    expect(guest.getState().players[0].hikers[hm.hiker]).toBe(hm.site)

    // guest (seat 1) replies; intent travels host-ward and applies
    const gm = P.legalMoves(guest.getState(), 1).find(m => m.site !== P.END && m.site !== hm.site)!
    guest.dispatch({ kind: 'move', hiker: gm.hiker, site: gm.site })
    expect(host.getFull().players[1].hikers[gm.hiker]).toBe(gm.site)
    expect(host.isMyTurn()).toBe(true) // back to host
    // guest's view reflects the host's authoritative state
    expect(guest.getState().step).toBe(host.getFull().step)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const before = host.getFull().step
    // it's seat 0's (host) turn, but the guest tries to move
    const m = P.legalMoves(host.getFull(), 0).find(mv => mv.site !== P.END)!
    guest.dispatch({ kind: 'move', hiker: m.hiker, site: m.site } as ParksIntent)
    expect(host.getFull().step).toBe(before) // rejected, nothing changed
  })

  it('a full match self-plays to a valid winner via the adapter (AI fills both seats)', () => {
    let s = P.makeGame({ seed: 21 })
    let guard = 0
    while (!A.isOver(s) && guard++ < 5000) {
      const seat = A.seatToMove(s)
      if (seat == null) break
      s = A.aiStep(s, seat as Player)
    }
    expect(guard).toBeLessThan(5000)
    expect(A.isOver(s)).toBe(true)
    expect(s.winner === 0 || s.winner === 1 || s.winner === 'tie').toBe(true)
    expect(s.season).toBe(P.SEASONS)
  })
})
