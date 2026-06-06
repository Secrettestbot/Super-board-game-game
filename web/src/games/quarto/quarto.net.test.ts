/* QUARTO — netplay tests. Fast (no deep self-play): adapter round-trip for the
 * place→give phases, plus a host+guest sync over an in-memory transport. */

import { describe, it, expect } from 'vitest'
import { quartoAdapter as A, type QuartoIntent } from './net'
import * as Q from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('quarto net adapter', () => {
  it('starts with seat 0 to move (place phase) on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
    expect(s.hand).not.toBeNull() // a piece has been handed to seat 0 to place
  })

  it('place then give: seat 0 places, stays to move to give, give passes to seat 1', () => {
    const s0 = A.makeGame()
    const cell = Q.emptyCells(s0.board)[0]

    // place phase
    const s1 = A.applyIntent(s0, 0, { kind: 'place', cell })
    expect(s1).not.toBe(s0)
    expect(s1.board[cell]).toBe(s0.hand)
    expect(s1.hand).toBeNull()           // now must give
    expect(A.seatToMove(s1)).toBe(0)     // SAME seat hands a piece
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // give phase
    const give = Q.poolPieces(s1.pool)[0]
    const s2 = A.applyIntent(s1, 0, { kind: 'give', piece: give })
    expect(s2).not.toBe(s1)
    expect(s2.hand).toBe(give)
    expect(A.seatToMove(s2)).toBe(1)     // turn now passes to seat 1
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))
  })

  it('rejects out-of-turn and illegal intents (returns same ref)', () => {
    const s = A.makeGame() // seat 0, place phase
    const cell = Q.emptyCells(s.board)[0]

    // out of turn: seat 1 tries to place
    expect(A.applyIntent(s, 1, { kind: 'place', cell })).toBe(s)
    // wrong phase: a give while a piece is in hand
    expect(A.applyIntent(s, 0, { kind: 'give', piece: Q.poolPieces(s.pool)[0] })).toBe(s)
    // illegal place: occupied / out-of-range cell
    expect(A.applyIntent(s, 0, { kind: 'place', cell: -1 })).toBe(s)

    // advance to give phase, then test illegal/out-of-turn gives
    const s1 = A.applyIntent(s, 0, { kind: 'place', cell })
    expect(A.seatToMove(s1)).toBe(0)
    // wrong phase: a place while no piece is in hand
    expect(A.applyIntent(s1, 0, { kind: 'place', cell: Q.emptyCells(s1.board)[0] })).toBe(s1)
    // illegal give: the just-placed piece is no longer in the pool (and was never)
    const placed = s.hand as number
    expect(s1.pool[placed]).toBe(false)
    expect(A.applyIntent(s1, 0, { kind: 'give', piece: placed })).toBe(s1)
    // out of turn: seat 1 tries to give
    expect(A.applyIntent(s1, 1, { kind: 'give', piece: Q.poolPieces(s1.pool)[0] })).toBe(s1)
  })
})

describe('quarto host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs an initial full view', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    // perfect information: guest sees the same hand the host does
    expect(guest.getState().hand).toBe(host.getFull().hand)
  })

  it('relays the host place+give, then the guest place+give, staying in sync', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) places then gives
    const hCell = Q.emptyCells(host.getFull().board)[0]
    host.dispatchLocal({ kind: 'place', cell: hCell })
    expect(host.isMyTurn()).toBe(true)           // same seat must give
    const hGive = Q.poolPieces(host.getFull().pool)[0]
    host.dispatchLocal({ kind: 'give', piece: hGive })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)          // turn passed to guest, view synced
    expect(guest.getState().hand).toBe(hGive)

    // guest (seat 1) replies: place then give; intents travel host-ward and apply
    const gCell = Q.emptyCells(guest.getState().board)[0]
    guest.dispatch({ kind: 'place', cell: gCell } as QuartoIntent)
    expect(host.getFull().board[gCell]).toBe(hGive)
    expect(guest.isMyTurn()).toBe(true)          // guest still gives
    const gGive = Q.poolPieces(guest.getState().pool)[0]
    guest.dispatch({ kind: 'give', piece: gGive } as QuartoIntent)
    expect(host.getFull().hand).toBe(gGive)
    expect(host.isMyTurn()).toBe(true)           // back to the host
    expect(guest.getState().last).toBe(host.getFull().last)
  })

  it('host ignores an out-of-turn guest intent', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    const before = A.tickKey(host.getFull())
    // it's the host's (seat 0) turn, but the guest tries to place
    guest.dispatch({ kind: 'place', cell: Q.emptyCells(host.getFull().board)[0] } as QuartoIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
