import { describe, it, expect } from 'vitest'
import { shogiAdapter as A, type ShogiIntent } from './net'
import * as SH from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

function intentOf(m: SH.Move): ShogiIntent {
  return m.drop != null
    ? { drop: m.drop, to: m.to }
    : { from: m.from, to: m.to, promote: m.promote }
}

describe('shogi net adapter', () => {
  it('starts with Sente (seat 0) to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal intent and rejects illegal/out-of-turn', () => {
    const s = A.makeGame()
    const m = SH.legalMoves(s)[0]
    // legal seat-0 intent -> state changes, turn passes
    const s2 = A.applyIntent(s, 0, intentOf(m))
    expect(s2).not.toBe(s)
    expect(A.seatToMove(s2)).toBe(1)
    // out-of-turn intent (seat 1) -> same ref
    expect(A.applyIntent(s, 1, intentOf(m))).toBe(s)
    // illegal intent -> same ref
    expect(A.applyIntent(s, 0, { from: 0, to: 24 })).toBe(s)
    expect(A.applyIntent(s, 0, { drop: 'R', to: 12 })).toBe(s) // empty hand
  })

  it('round-trips a legal drop intent', () => {
    // Build a state where Sente holds a pawn in hand and can drop it.
    let s = SH.makeGame()
    // Force a capture sequence by walking legal moves until Sente captures something,
    // or just inject a hand pawn directly via a fresh state.
    s = { ...s, hands: [{ ...s.hands[0], P: 1 }, { ...s.hands[1] }] }
    const drops = SH.legalMoves(s).filter(m => m.drop === 'P')
    expect(drops.length).toBeGreaterThan(0)
    const d = drops[0]
    const s2 = A.applyIntent(s, 0, { drop: 'P', to: d.to })
    expect(s2).not.toBe(s)
    expect(s2.board[d.to]?.type).toBe('P')
    expect(s2.hands[0].P).toBe(0)
    expect(A.seatToMove(s2)).toBe(1)
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

describe('shogi netplay session (host + guest over in-memory transport)', () => {
  function connect() {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    return { host, guest }
  }

  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.mySeat()).toBe(1)
    expect(guest.getState().board.length).toBe(SH.SIZE)
  })

  it('relays intents both ways and stays in sync', () => {
    const { host, guest } = connect()
    // host (Sente, seat 0) moves first
    const m0 = SH.legalMoves(host.getFull())[0]
    host.dispatchLocal(intentOf(m0))
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (Gote, seat 1) replies; intent travels host-ward and applies
    const m1 = SH.legalMoves(guest.getState())[0]
    guest.dispatch(intentOf(m1))
    expect(host.getFull().turn).toBe(0) // back to Sente
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('ignores an out-of-turn guest intent (host authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().last
    const m = SH.legalMoves(host.getFull())[0]
    guest.dispatch(intentOf(m)) // it's Sente's (host) turn
    expect(host.getFull().last).toBe(before)
  })
})
