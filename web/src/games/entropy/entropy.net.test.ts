import { describe, it, expect } from 'vitest'
import { entropyAdapter as A, type EntropyIntent } from './net'
import * as EN from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('entropy net adapter', () => {
  it('starts with Chaos (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('a legal Chaos placement advances to Order (seat 1)', () => {
    const s = A.makeGame()
    const cell = EN.emptyCells(s.board)[0]
    const s2 = A.applyIntent(s, 0, { kind: 'place', cell })
    expect(s2).not.toBe(s)
    expect(s2.board[cell]).toBe(s.drawn)
    expect(A.seatToMove(s2)).toBe(1)
  })

  it('a legal Order slide advances back to Chaos (seat 0)', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'place', cell: EN.emptyCells(s.board)[0] })
    expect(A.seatToMove(s)).toBe(1)
    const mv = EN.allRookMoves(s.board)[0]
    const s2 = A.applyIntent(s, 1, { kind: 'move', from: mv.from, to: mv.to })
    expect(s2).not.toBe(s)
    expect(s2.board[mv.to]).toBeTruthy()
    expect(s2.board[mv.from]).toBeNull()
    expect(A.seatToMove(s2)).toBe(0)
  })

  it('an Order pass advances back to Chaos', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'place', cell: EN.emptyCells(s.board)[0] })
    const s2 = A.applyIntent(s, 1, { kind: 'pass' })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(0)
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    // it is Chaos's (seat 0) turn; an Order (seat 1) intent must be a no-op
    expect(A.applyIntent(s, 1, { kind: 'move', from: 0, to: 1 })).toBe(s)
  })

  it('ignores an illegal Chaos placement on a filled cell (returns same state)', () => {
    let s = A.makeGame()
    const cell = EN.emptyCells(s.board)[0]
    s = A.applyIntent(s, 0, { kind: 'place', cell })
    s = A.applyIntent(s, 1, { kind: 'pass' }) // back to Chaos
    // the previously filled cell is no longer placeable
    expect(A.applyIntent(s, 0, { kind: 'place', cell })).toBe(s)
  })

  it('ignores an illegal Order slide (returns same state)', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'place', cell: EN.emptyCells(s.board)[0] })
    // from a square with no tile, or a non-rook destination -> no-op
    const empty = EN.emptyCells(s.board)[0]
    expect(A.applyIntent(s, 1, { kind: 'move', from: empty, to: empty + 1 })).toBe(s)
  })

  it('aiStep advances and tickKey is a string', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'place', cell: EN.emptyCells(s.board)[0] })
    const seat = A.seatToMove(s)!
    expect(seat).toBe(1)
    const s2 = A.aiStep(s, seat)
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(0) // Order resolved -> back to Chaos
    expect(A.tickKey(s2)).toBeTypeOf('string')
  })
})

describe('entropy netplay session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 (Order) and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(EN.N * EN.N)
  })

  it('relays a Chaos placement then a guest Order slide, staying in sync', () => {
    const { host, guest } = connect()
    // host (Chaos, seat 0) places first
    const cell = EN.emptyCells(host.getFull().board)[0]
    host.dispatchLocal({ kind: 'place', cell })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Order's (guest's) turn, view synced
    expect(guest.getState().board[cell]).toBeTruthy()

    // guest (Order, seat 1) replies with a legal rook slide
    const mv = EN.allRookMoves(guest.getState().board)[0]
    guest.dispatch({ kind: 'move', from: mv.from, to: mv.to } as EntropyIntent)
    expect(host.getFull().phase).toBe('chaos') // back to Chaos
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().placed).toBe(host.getFull().placed)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().placed
    // it's Chaos's (host) turn, but the guest (Order) tries to move
    guest.dispatch({ kind: 'pass' } as EntropyIntent)
    expect(host.getFull().placed).toBe(before)
    expect(host.getFull().phase).toBe('chaos')
  })
})
