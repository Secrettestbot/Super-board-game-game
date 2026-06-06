import { describe, it, expect } from 'vitest'
import { tablutAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as TB from './logic'

describe('tablut net adapter', () => {
  it('starts with attackers (seat 1) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(1) // attackers move first
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = TB.legalMoves(s.board, 'att')[0]
    const s2 = A.applyIntent(s, 1, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(0) // now defenders to move
  })

  it('ignores an out-of-turn intent (returns same state)', () => {
    const s = A.makeGame()
    // seat 0 (defenders) tries to move while it's the attackers' turn
    const defMove = TB.legalMoves(s.board, 'def')[0]
    expect(A.applyIntent(s, 0, { from: defMove.from, to: defMove.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same state)', () => {
    const s = A.makeGame()
    // an attacker "move" from an empty square / to a blocked square
    expect(A.applyIntent(s, 1, { from: 40, to: 0 })).toBe(s) // 40 = throne (King), not seat 1's
    const att = TB.legalMoves(s.board, 'att')[0]
    expect(A.applyIntent(s, 1, { from: att.from, to: att.from })).toBe(s) // no-op square
  })

  it('aiStep advances the attacker seat and re-arms the tick', () => {
    // The AI only ever plays the attackers (seat 1); defenders are stepped by a human.
    let s = A.makeGame()
    expect(A.seatToMove(s)).toBe(1)
    for (let i = 0; i < 3 && !A.isOver(s); i++) {
      const before = A.tickKey(s)
      // attackers (seat 1): AI plays and the turn passes to the defenders
      s = A.aiStep(s, 1)
      expect(A.tickKey(s)).not.toBe(before)
      if (A.isOver(s)) break
      expect(A.seatToMove(s)).toBe(0)
      // defenders (seat 0): apply a legal human move to hand the turn back
      const dm = TB.legalMoves(s.board, 'def')[0]
      const t2 = A.tickKey(s)
      s = A.applyIntent(s, 0, { from: dm.from, to: dm.to })
      expect(A.tickKey(s)).not.toBe(t2)
      if (!A.isOver(s)) expect(A.seatToMove(s)).toBe(1)
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('tablut netplay session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 (attackers) and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0 (defenders), guest gets seat 1 (attackers)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().board.length).toBe(81)
  })

  it('guest (attackers) moves first, then host (defenders) replies — staying in sync', () => {
    const { host, guest } = connect()
    // attackers move first, so it is the GUEST's turn, not the host's
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (attackers, seat 1) plays a legal move; intent travels host-ward and applies
    const am = TB.legalMoves(guest.getState().board, 'att')[0]
    guest.dispatch({ from: am.from, to: am.to })
    expect(host.getFull().turn).toBe('def') // now defenders to move
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)
    expect(guest.getState().last).toEqual({ from: am.from, to: am.to })

    // host (defenders, seat 0) replies via dispatchLocal
    const dm = TB.legalMoves(host.getFull().board, 'def')[0]
    host.dispatchLocal({ from: dm.from, to: dm.to })
    expect(host.getFull().turn).toBe('att') // back to attackers
    expect(host.isMyTurn()).toBe(false)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().last).toEqual({ from: dm.from, to: dm.to })
    expect(guest.isMyTurn()).toBe(true)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    // attackers (guest) move first to make it the host's turn
    const am = TB.legalMoves(guest.getState().board, 'att')[0]
    guest.dispatch({ from: am.from, to: am.to })
    expect(host.getFull().turn).toBe('def')
    const before = host.getFull().last

    // now it's the host's (defenders) turn, but the guest (attackers) tries to move again
    const am2 = TB.legalMoves(host.getFull().board, 'att')[0]
    guest.dispatch({ from: am2.from, to: am2.to })
    expect(host.getFull().last).toEqual(before) // rejected, nothing changed
    expect(host.getFull().turn).toBe('def')
  })
})
