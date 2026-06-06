import { describe, it, expect } from 'vitest'
import { taflAdapter as A, seatOf, type TaflIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as T from './logic'

describe('tafl net adapter', () => {
  it('starts with the attackers (seat 1) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    // Attackers move first, and attackers are seat 1 (defenders/King side are seat 0).
    expect(A.seatToMove(s)).toBe(1)
    expect(A.isOver(s)).toBe(false)
    expect(seatOf('defenders')).toBe(0)
    expect(seatOf('attackers')).toBe(1)
  })

  it('round-trips a legal intent and passes the turn', () => {
    const s = A.makeGame()
    const m = T.legalMoves(s.board, 'attackers')[0]
    const s2 = A.applyIntent(s, 1, { from: m.from, to: m.to })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe('defenders')
    expect(A.seatToMove(s2)).toBe(0)
    // tickKey changes on the transition (re-arms the AI timer)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns same state ref)', () => {
    const s = A.makeGame()
    // It's the attackers' (seat 1) turn; seat 0 (defenders) tries to move one of its pieces.
    const dMove = T.legalMoves(s.board, 'defenders')[0]
    expect(A.applyIntent(s, 0, { from: dMove.from, to: dMove.to })).toBe(s)
  })

  it('ignores an illegal intent (returns same state ref)', () => {
    const s = A.makeGame()
    // seat 1 (attackers) submits a nonsense move (no piece / not reachable).
    expect(A.applyIntent(s, 1, { from: 24, to: 0 })).toBe(s)
  })

  it('aiStep advances by playing the attackers', () => {
    const s = A.makeGame()
    const s2 = A.aiStep(s, 1)
    expect(s2).not.toBe(s)
    // After the attackers' AI move it's the defenders' turn (seat 0).
    expect(A.seatToMove(s2)).toBe(0)
  })
})

describe('tafl host + guest over an in-memory transport', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest the opposite army and stays in sync', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    // Host is seat 0 (defenders); guest takes seat 1 (attackers).
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])

    // Attackers (the guest) move first.
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // Guest (attackers, seat 1) plays a legal move; it travels host-ward and applies.
    const am = T.legalMoves(guest.getState().board, 'attackers')[0]
    guest.dispatch({ from: am.from, to: am.to })
    expect(host.getFull().turn).toBe('defenders')
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)
    // Guest's view reflects the host's authoritative state.
    expect(guest.getState().last).toEqual(host.getFull().last)

    // Host (defenders, seat 0) replies via its own seat.
    const dm = T.legalMoves(host.getFull().board, 'defenders')[0]
    host.dispatchLocal({ from: dm.from, to: dm.to })
    expect(host.getFull().turn).toBe('attackers')
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().last).toEqual(host.getFull().last)
  })

  it('rejects a guest intent submitted out of turn', () => {
    const { host, guest } = connect()
    // Attackers move first, so it's the guest's turn — but the guest first lets it be the
    // defenders' turn, then tries to move again out of turn.
    const am = T.legalMoves(guest.getState().board, 'attackers')[0]
    guest.dispatch({ from: am.from, to: am.to })
    expect(host.getFull().turn).toBe('defenders')
    const before = host.getFull().last
    // Now it's the host's (defenders) turn; the guest (attackers) tries another move.
    const am2 = T.legalMoves(host.getFull().board, 'attackers')[0]
    guest.dispatch({ from: am2.from, to: am2.to } as TaflIntent)
    expect(host.getFull().last).toEqual(before) // rejected, nothing changed
    expect(host.getFull().turn).toBe('defenders')
  })
})
