import { describe, it, expect } from 'vitest'
import { onitamaAdapter as A, type OnitamaIntent } from './net'
import * as ON from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('onitama net adapter', () => {
  it('starts with the bottom side (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal card move and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const m = ON.legalMoves(s, 'you')[0]
    const s2 = A.applyIntent(s, 0, { card: m.card, from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe('ai')
    expect(A.seatToMove(s2)).toBe(1)
    // the used card swapped into the middle
    expect(s2.middle).toBe(m.card)
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = A.makeGame()
    const m = ON.legalMoves(s, 'you')[0]
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { card: m.card, from: m.from, to: m.to })).toBe(s)
  })

  it('ignores an illegal intent (returns the same ref)', () => {
    const s = A.makeGame()
    // a card the player does not hold, to a nonsense square
    const bogus: OnitamaIntent = { card: 'NotACard', from: 0, to: 24 }
    expect(A.applyIntent(s, 0, bogus)).toBe(s)
    // a real held card but an impossible destination
    const held = s.hands.you[0]
    expect(A.applyIntent(s, 0, { card: held, from: 22, to: 22 })).toBe(s)
  })

  it('rejects a pass when legal moves exist (returns the same ref)', () => {
    const s = A.makeGame()
    expect(A.applyIntent(s, 0, { pass: true })).toBe(s)
  })

  it('tickKey changes after a move', () => {
    const s = A.makeGame()
    const m = ON.legalMoves(s, 'you')[0]
    const s2 = A.applyIntent(s, 0, { card: m.card, from: m.from, to: m.to })
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('aiStep advances the AI seat', () => {
    const s = A.makeGame()
    const m = ON.legalMoves(s, 'you')[0]
    const s2 = A.applyIntent(s, 0, { card: m.card, from: m.from, to: m.to }) // now seat 1 (ai)
    expect(A.seatToMove(s2)).toBe(1)
    const s3 = A.aiStep(s2, 1)
    expect(s3).not.toBe(s2)
    // back to seat 0 (or game over)
    expect([0, null]).toContain(A.seatToMove(s3))
  })
})

describe('onitama host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and keeps both sides in sync through a full exchange', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host is seat 0 and moves first
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0 / 'you') plays a legal move
    const m0 = ON.legalMoves(host.getFull(), 'you')[0]
    host.dispatchLocal({ card: m0.card, from: m0.from, to: m0.to })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)               // now seat 1's turn, view synced
    expect(guest.getState().middle).toBe(m0.card)     // guest sees the swapped card

    // guest (seat 1 / 'ai') replies; intent travels host-ward and applies
    const m1 = ON.legalMoves(guest.getState(), 'ai')[0]
    guest.dispatch({ card: m1.card, from: m1.from, to: m1.to })
    expect(host.getFull().turn).toBe('you')           // back to the host
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().middle).toBe(host.getFull().middle) // views agree
  })

  it('ignores an out-of-turn guest intent (host stays authoritative)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const before = host.getFull().middle
    // it is the host's turn, but the guest tries to move its own piece
    const m = ON.legalMoves(host.getFull(), 'ai')[0]
    guest.dispatch({ card: m.card, from: m.from, to: m.to })
    expect(host.getFull().middle).toBe(before)        // rejected, nothing changed
  })
})
