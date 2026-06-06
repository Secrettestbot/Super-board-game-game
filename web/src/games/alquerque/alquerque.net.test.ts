import { describe, it, expect } from 'vitest'
import { alquerqueAdapter as A, type AlquerqueIntent } from './net'
import * as AQ from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('alquerque net adapter', () => {
  it('starts with White (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = AQ.legalMoves(s.board, 'w')[0]
    const s2 = A.applyIntent(s, 0, { from: m.from, to: m.to, cap: m.cap })
    expect(s2).not.toBe(s)
    // Opening position has no captures, so a plain step passes the turn to Black (seat 1).
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    const m = AQ.legalMoves(s.board, 'w')[0]
    expect(A.applyIntent(s, 1, { from: m.from, to: m.to, cap: m.cap })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // from a White piece to a non-adjacent / occupied square -> not in legal set.
    expect(A.applyIntent(s, 0, { from: 0, to: 24, cap: null })).toBe(s)
    // a piece that is not yours -> rejected.
    const black = s.board.findIndex(v => v === 'b')
    expect(A.applyIntent(s, 0, { from: black, to: black + 1, cap: null })).toBe(s)
  })

  it('keeps the same seat to move and changes tickKey during a multi-jump chain', () => {
    // Hand-built position with a real two-jump chain for a single White piece:
    //   White at 0 (carries diagonals) jumps Black at 6 -> lands 12 (carries diagonals),
    //   then from 12 jumps Black at 13 -> lands 14.
    const board: AQ.Cell[] = new Array(25).fill(null)
    board[0] = 'w'            // idx(0,0)
    board[6] = 'b'            // idx(1,1) — diagonal jump from 0, lands on 12
    board[13] = 'b'           // idx(2,3) — orthogonal jump from 12, lands on 14
    // Keep a spare Black so the first jump does NOT end the game (lets the chain continue).
    board[24] = 'b'           // idx(4,4) — far corner, untouched
    const s: AQ.AlquerqueState = {
      board, turn: 'w', you: 'w', winner: null, chain: null, last: null, log: [],
    }
    // First jump is mandatory.
    const cap1 = AQ.legalMoves(board, 'w')[0]
    expect(cap1).toMatchObject({ from: 0, to: 12, cap: 6 })

    const k0 = A.tickKey(s)
    const s2 = A.applyIntent(s, 0, { from: cap1.from, to: cap1.to, cap: cap1.cap })
    expect(s2).not.toBe(s)
    expect(A.tickKey(s2)).not.toBe(k0)
    // Mid-chain: SAME seat (White / seat 0) still to move, chain locked to the landing point.
    expect(A.isOver(s2)).toBe(false)
    expect(A.seatToMove(s2)).toBe(0)
    expect(s2.chain).toBe(12)

    // Second jump completes the chain; tickKey changes again even though the seat is unchanged.
    const cap2 = AQ.legalMoves(s2.board, 'w', s2.chain)[0]
    expect(cap2).toMatchObject({ from: 12, to: 14, cap: 13 })
    const s3 = A.applyIntent(s2, 0, { from: cap2.from, to: cap2.to, cap: cap2.cap })
    expect(s3).not.toBe(s2)
    expect(A.tickKey(s3)).not.toBe(A.tickKey(s2))
    // No more captures from 14, so the turn finally passes to Black (seat 1).
    expect(s3.chain).toBe(null)
    expect(A.seatToMove(s3)).toBe(1)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])

    // Host (White, seat 0) plays a legal opening step.
    const m0 = AQ.legalMoves(host.getFull().board, 'w')[0]
    host.dispatchLocal({ from: m0.from, to: m0.to, cap: m0.cap })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Black's (guest's) turn, view synced
    expect(guest.getState().turn).toBe('b')

    // Guest (Black, seat 1) replies; intent travels host-ward and applies.
    const m1 = AQ.legalMoves(guest.getState().board, 'b')[0]
    guest.dispatch({ from: m1.from, to: m1.to, cap: m1.cap })
    expect(host.getFull().turn).toBe('w') // back to White
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe('w')
  })

  it('host ignores an out-of-turn guest intent', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const before = A.tickKey(host.getFull())
    // It is White's (host) turn, but the guest tries to move a Black piece.
    const m = AQ.legalMoves(host.getFull().board, 'b')[0]
    guest.dispatch({ from: m.from, to: m.to, cap: m.cap } as AlquerqueIntent)
    expect(A.tickKey(host.getFull())).toBe(before) // rejected, nothing changed
  })
})
