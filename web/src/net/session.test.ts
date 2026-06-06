/* Browser-free integration test of the netplay core: a HostSession and GuestSession
 * wired through an in-memory transport pair, playing real chess. This is the robust
 * substitute for a live WebRTC end-to-end run (which a headless sandbox can't do). */

import { describe, it, expect } from 'vitest'
import { HostSession, GuestSession } from './session'
import { memoryPair } from './transport'
import { chessAdapter, type ChessIntent } from '../games/chess/net'
import * as C from '../games/chess/logic'
import type { GameAdapter } from './protocol'

function connect() {
  const host = new HostSession(chessAdapter)
  const [a, b] = memoryPair()
  host.addGuest(a) // host serves transport a
  const guest = new GuestSession(chessAdapter, b) // guest on transport b
  return { host, guest }
}

describe('netplay session (host + guest over in-memory transport)', () => {
  it('assigns the guest the open seat and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0, guest gets seat 1
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    // guest sees the same starting position
    expect(guest.getState().board.length).toBe(64)
  })

  it('relays guest intents to the host and broadcasts the new view back', () => {
    const { host, guest } = connect()
    // host (White, seat 0) moves first
    const m0 = C.legalMoves(host.getFull())[0]
    host.dispatchLocal({ from: m0.from, to: m0.to, promo: m0.promo })
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now Black's (guest's) turn, view synced

    // guest (Black, seat 1) replies; intent travels host-ward and applies
    const m1 = C.legalMoves(guest.getState())[0]
    guest.dispatch({ from: m1.from, to: m1.to, promo: m1.promo })
    expect(host.getFull().turn).toBe(C.WHITE) // back to White
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().fullmove).toBe(host.getFull().fullmove)
  })

  it('ignores an out-of-turn guest intent (host is authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().fullmove
    // it's White's (host) turn, but the guest tries to move
    const m = C.legalMoves(host.getFull())[0]
    guest.dispatch({ from: m.from, to: m.to } as ChessIntent)
    expect(host.getFull().fullmove).toBe(before) // rejected, nothing changed
  })

  it('a vacated seat reverts to AI when a guest drops', () => {
    const { host, guest } = connect()
    expect(host.aiSeat()).toBe(null) // seat 1 is the guest -> no AI while host (0) to move
    // White moves; now seat 1 to move and is controlled by the guest -> still no AI
    const m0 = C.legalMoves(host.getFull())[0]
    host.dispatchLocal({ from: m0.from, to: m0.to, promo: m0.promo })
    expect(host.aiSeat()).toBe(null)
    guest.close() // guest drops
    expect(host.guestCount()).toBe(0)
    expect(host.aiSeat()).toBe(1) // seat 1 now an AI seat, and it's seat 1's turn
  })
})

// Redaction guard: a fake hidden-info game proves redactFor reaches guests and the
// leak-test pattern works (real per-game leak tests live beside each hidden-info game).
interface SecretState { turn: number; hands: number[][]; over: boolean }
const secretAdapter: GameAdapter<SecretState, { play: number }> = {
  makeGame: () => ({ turn: 0, hands: [[10, 11], [20, 21]], over: false }),
  numSeats: () => 2,
  seatToMove: s => (s.over ? null : s.turn),
  isOver: s => s.over,
  applyIntent: (s, seat, i) => (s.turn !== seat ? s : { ...s, turn: 1 - s.turn, hands: s.hands, over: false, _x: i.play } as SecretState),
  aiStep: s => ({ ...s, turn: 1 - s.turn }),
  tickKey: s => `${s.turn}`,
  redactFor: (s, seat) => ({ ...s, hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => -1))) }),
}

describe('hidden-info redaction reaches the guest', () => {
  it('the guest never receives the host\'s secret hand', () => {
    const host = new HostSession(secretAdapter)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(secretAdapter, b)
    const view = guest.getState()
    // guest is seat 1: sees its own hand [20,21], host's hand redacted to [-1,-1]
    expect(view.hands[1]).toEqual([20, 21])
    expect(view.hands[0]).toEqual([-1, -1])
    // the secret values must not appear anywhere in what crossed the wire
    expect(JSON.stringify(view)).not.toContain('10')
    expect(JSON.stringify(view)).not.toContain('11')
  })
})
