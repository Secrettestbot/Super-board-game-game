/* ZÈRTZ — netplay adapter + session integration tests. Proves the online path works
 * headlessly: adapter round-trips legal intents and rejects illegal/out-of-turn ones,
 * and a HostSession + GuestSession stay in sync over an in-memory transport. */

import { describe, it, expect } from 'vitest'
import { zertzAdapter as A } from './net'
import type { ZertzIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as Z from './logic'
import type { ZertzState } from './logic'

/** First legal place+remove intent for the side to move. */
function firstPlaceRemove(s: ZertzState): ZertzIntent {
  const m = Z.legalPlaceRemove(s)[0]
  return { kind: 'placeRemove', color: m.color, place: m.place, remove: m.remove }
}

/* A blank board with one forced single jump available to player 0. */
function forcedJump(): ZertzState {
  const s = Z.makeGame()
  const board: Record<string, Z.Color | null> = {}
  for (const k in s.board) board[k] = null
  board[Z.key(0, 0)] = 'w'
  board[Z.key(1, 0)] = 'k'
  return { ...s, board, captured: [Z.zeroCounts(), Z.zeroCounts()], turn: 0 }
}

describe('zertz net adapter', () => {
  it('starts with player 0 (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal place+remove intent and passes the turn', () => {
    const s = A.makeGame()
    const intent = firstPlaceRemove(s)
    const s2 = A.applyIntent(s, 0, intent)
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const intent = firstPlaceRemove(s)
    expect(A.applyIntent(s, 1, intent)).toBe(s) // seat 1 not to move
  })

  it('ignores an illegal place intent (returns same ref)', () => {
    const s = A.makeGame()
    // a removed/off-board placement is not in the legal set
    expect(A.applyIntent(s, 0, { kind: 'placeRemove', color: 'w', place: '99,99', remove: null })).toBe(s)
  })

  it('rejects a place when a capture is forced (returns same ref)', () => {
    const s = forcedJump()
    expect(Z.mustCapture(s)).toBe(true)
    const empty = Z.emptyCells(s)[0]
    expect(A.applyIntent(s, 0, { kind: 'placeRemove', color: 'g', place: empty, remove: null })).toBe(s)
  })

  it('applies a forced capture intent and rejects an illegal jump', () => {
    const s = forcedJump()
    const ok = A.applyIntent(s, 0, { kind: 'capture', from: Z.key(0, 0), to: Z.key(2, 0) })
    expect(ok).not.toBe(s)
    expect(ok.captured[0].k).toBe(1)            // jumped black marble captured by player 0
    expect(ok.board[Z.key(2, 0)]).toBe('w')     // mover landed beyond
    // an illegal jump (no marble to leap) returns the same ref
    expect(A.applyIntent(s, 0, { kind: 'capture', from: Z.key(0, 0), to: Z.key(0, 2) })).toBe(s)
  })

  it('aiStep advances the AI seat and resolves its turn', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, firstPlaceRemove(s)) // seat 0 moves -> seat 1 (AI) to move
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before)
    if (!A.isOver(s)) expect(A.seatToMove(s)).toBe(0) // back to the human
  })
})

describe('zertz net session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])
    expect(Z.liveCells(guest.getState()).length).toBe(Z.liveCells(host.getFull()).length)
  })

  it('relays host + guest intents and stays in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) plays first
    expect(host.isMyTurn()).toBe(true)
    host.dispatchLocal(firstPlaceRemove(host.getFull()))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's turn, view synced

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull()
    guest.dispatch(firstPlaceRemove(guest.getState()))
    expect(host.getFull()).not.toBe(before)
    expect(host.isMyTurn()).toBe(true)             // back to the host
    // guest's view reflects the host's authoritative state
    expect(Z.liveCells(guest.getState()).length).toBe(Z.liveCells(host.getFull()).length)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = Z.liveCells(host.getFull()).length
    // it's seat 0's (host) turn, but the guest tries to move
    guest.dispatch(firstPlaceRemove(host.getFull()))
    expect(Z.liveCells(host.getFull()).length).toBe(before) // rejected, nothing changed
  })
})
