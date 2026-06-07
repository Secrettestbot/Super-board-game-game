import { describe, it, expect } from 'vitest'
import { shobuAdapter as A, type ShobuIntent } from './net'
import * as SH from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// A complete legal turn for the seat to move, drawn from the game's own legal set.
function firstTurn(s: SH.ShobuState): ShobuIntent {
  const cm = SH.legalCombinedMoves(s, s.turn as SH.Player)[0]
  return { passive: cm.passive, aggressive: cm.aggressive }
}

describe('shobu net adapter', () => {
  it('starts with you (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a complete legal turn and passes the turn', () => {
    const s = A.makeGame()
    const turn = firstTurn(s)
    const s2 = A.applyIntent(s, 0, turn)
    expect(s2).not.toBe(s)
    expect(s2.phase).toBe('passive')         // landed back in passive for the next mover
    expect(A.seatToMove(s2)).toBe(1)         // turn passed to seat 1
  })

  it('ignores an out-of-turn intent (returns same ref)', () => {
    const s = A.makeGame()
    const turn = firstTurn(s)
    expect(A.applyIntent(s, 1, turn)).toBe(s) // seat 1 may not move while it is seat 0's turn
  })

  it('ignores an illegal intent (returns same ref)', () => {
    const s = A.makeGame()
    const turn = firstTurn(s)
    // Corrupt the aggressive half so the pair is not in the legal set.
    const bad: ShobuIntent = { passive: turn.passive, aggressive: { ...turn.aggressive, to: 99 } }
    expect(A.applyIntent(s, 0, bad)).toBe(s)
    // A malformed/empty intent is also rejected without throwing.
    expect(A.applyIntent(s, 0, {} as unknown as ShobuIntent)).toBe(s)
  })

  it('aiStep advances and alternates seats', () => {
    let s = A.makeGame()
    let last = A.seatToMove(s)
    for (let i = 0; i < 6 && !A.isOver(s); i++) {
      const seat = A.seatToMove(s)!
      s = A.aiStep(s, seat)
      const now = A.seatToMove(s)
      if (now != null) { expect(now).not.toBe(last); last = now }
    }
    expect(A.tickKey(s)).toBeTypeOf('string')
  })
})

describe('shobu netplay session (host + guest over in-memory transport)', () => {
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
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().boards.length).toBe(4)
  })

  it('relays host + guest turns and stays in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) plays first; it then becomes the guest's turn
    host.dispatchLocal(firstTurn(host.getFull()))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(A.seatToMove(host.getFull())).toBe(1)

    // guest (seat 1) replies with a legal full turn; intent travels host-ward and applies
    guest.dispatch(firstTurn(guest.getState()))
    expect(A.seatToMove(host.getFull())).toBe(0)
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().off).toEqual(host.getFull().off)
  })

  it('ignores an out-of-turn guest intent (host authoritative)', () => {
    const { host, guest } = connect()
    const before = JSON.stringify(host.getFull().boards)
    // it is seat 0's (host) turn, but the guest tries to move
    guest.dispatch(firstTurn(host.getFull()))
    expect(JSON.stringify(host.getFull().boards)).toBe(before)
  })
})
