import { describe, it, expect } from 'vitest'
import { dotsBoxesAdapter as A, type DotsBoxesIntent } from './net'
import * as DB from './logic'
import type { DotsState } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('dots_boxes net adapter', () => {
  it('starts with seat 0 (you) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn (non-completing edge)', () => {
    const s = A.makeGame()
    const s2 = A.applyIntent(s, 0, { edge: 'h-0-0' })
    expect(s2).not.toBe(s)
    expect(s2.edges['h-0-0']).toBe('you')
    expect(A.seatToMove(s2)).toBe(1) // turn passed to seat 1
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s)) // tick advanced
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    // seat 1 tries to move while it's seat 0's turn
    expect(A.applyIntent(s, 1, { edge: 'h-0-0' })).toBe(s)
  })

  it('ignores an illegal intent: already-drawn and unknown edge (returns same ref)', () => {
    const s1 = A.applyIntent(A.makeGame(), 0, { edge: 'h-0-0' }) // seat 1 to move now
    expect(A.applyIntent(s1, 1, { edge: 'h-0-0' })).toBe(s1) // already drawn
    expect(A.applyIntent(s1, 1, { edge: 'not-an-edge' })).toBe(s1) // not an edge
    expect(A.applyIntent(s1, 1, {} as DotsBoxesIntent)).toBe(s1) // malformed
  })

  it('completing a box keeps the SAME seat to move (no forced alternation)', () => {
    // Hand-build a state where box (0,0) has 3 sides drawn and it is seat 0's turn.
    // Box (0,0) edges: h-0-0, h-1-0, v-0-0, v-0-1. We pre-draw three of them.
    const base = A.makeGame()
    const s: DotsState = {
      ...base,
      edges: { 'h-0-0': 'you', 'h-1-0': 'ai', 'v-0-0': 'you' },
      turn: 'you',
      moves: 3,
    }
    expect(DB.counts(s.owners)).toEqual({ you: 0, ai: 0 })
    expect(A.seatToMove(s)).toBe(0)

    // Seat 0 draws the 4th side -> claims box (0,0) -> goes again.
    const after = A.applyIntent(s, 0, { edge: 'v-0-1' })
    expect(after).not.toBe(s)
    expect(after.owners[0]).toBe('you')          // box claimed by seat 0
    expect(A.seatToMove(after)).toBe(0)          // STILL seat 0's turn
    expect(A.tickKey(after)).not.toBe(A.tickKey(s)) // but the tick changed (re-arm AI)

    // And seat 0 can immediately move again while it stays its turn.
    const again = A.applyIntent(after, 0, { edge: 'h-0-1' })
    expect(again).not.toBe(after)
    expect(A.seatToMove(again)).toBe(1) // ordinary edge -> now passes to seat 1
  })

  it('aiStep advances play for the AI seat', () => {
    let s = A.applyIntent(A.makeGame(), 0, { edge: 'h-0-0' }) // seat 1 to move
    expect(A.seatToMove(s)).toBe(1)
    const before = A.tickKey(s)
    s = A.aiStep(s, 1)
    expect(A.tickKey(s)).not.toBe(before)
  })
})

describe('dots_boxes host + guest sync over an in-memory transport', () => {
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
    expect(guest.getState().owners.length).toBe(DB.SIZE * DB.SIZE)
  })

  it('relays a host move to the guest and a guest reply back to the host', () => {
    const { host, guest } = connect()
    // host (seat 0) draws a non-completing edge
    host.dispatchLocal({ edge: 'h-0-0' })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().edges['h-0-0']).toBe('you')

    // guest (seat 1) replies; intent travels host-ward and applies
    guest.dispatch({ edge: 'v-0-0' })
    expect(host.getFull().edges['v-0-0']).toBe('ai')
    expect(host.isMyTurn()).toBe(true) // back to seat 0
    expect(guest.getState().moves).toBe(host.getFull().moves)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().moves
    // it is seat 0's (host) turn, but the guest tries to move
    guest.dispatch({ edge: 'h-0-0' })
    expect(host.getFull().moves).toBe(before)
  })
})
