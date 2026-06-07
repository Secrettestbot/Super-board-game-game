/* SHUT THE BOX — netplay tests. Proves the adapter validates/round-trips intents and that a
 * HostSession + GuestSession stay in sync over an in-memory transport (the headless stand-in
 * for a live WebRTC run). Two players: host = seat 0 (You), guest = seat 1 (Rival). */

import { describe, it, expect } from 'vitest'
import { shutTheBoxAdapter as A, type ShutTheBoxIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as SB from './logic'
import type { ShutBoxState } from './logic'

// Drive the seat at the table one sub-step (roll, else shut the greedy subset) via the
// adapter, exactly as a real client would. Returns the next state.
function step(s: ShutBoxState): ShutBoxState {
  const seat = A.seatToMove(s)!
  if (!s.rolled) return A.applyIntent(s, seat, { kind: 'roll' })
  const total = s.dice[0] + s.dice[1]
  const pick = SB.bestSubset(SB.upNumbers(s.tiles), total)
  return pick ? A.applyIntent(s, seat, { kind: 'shut', tiles: pick }) : s
}

// Play whichever seat is at the table until that seat's round hands off (turn changes) or
// the game ends — with a hard cap so a pathological RNG run can't hang the test.
function playRound(s0: ShutBoxState): ShutBoxState {
  const seat = A.seatToMove(s0)
  let s = s0
  for (let i = 0; i < 2000 && A.seatToMove(s) === seat; i++) s = step(s)
  return s
}

describe('shut_the_box net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)

    // out-of-turn: seat 1 cannot act on seat 0's fresh box -> same ref back
    expect(A.applyIntent(s, 1, { kind: 'roll' })).toBe(s)
    // illegal: shutting before any roll is on the table -> same ref back
    expect(A.applyIntent(s, 0, { kind: 'shut', tiles: [1] })).toBe(s)

    // legal: seat 0 rolls -> the state actually advances (either a roll is on the table,
    // or a dead roll ended the round and handed off).
    const rolled = A.applyIntent(s, 0, { kind: 'roll' })
    expect(rolled).not.toBe(s)
    expect(rolled.rolled || A.seatToMove(rolled) !== 0).toBe(true)

    // a second roll while one is already on the table is illegal -> same ref back
    if (rolled.rolled) expect(A.applyIntent(rolled, 0, { kind: 'roll' })).toBe(rolled)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(host.isMyTurn()).toBe(true)   // seat 0 (host) starts
    expect(guest.isMyTurn()).toBe(false)

    // Host plays out seat 0's whole round via the wire intents until it hands off to seat 1.
    for (let i = 0; i < 4000 && A.seatToMove(host.getFull()) === 0 && !host.getFull().winner; i++) {
      const s = host.getFull()
      if (!s.rolled) host.dispatchLocal({ kind: 'roll' })
      else {
        const total = s.dice[0] + s.dice[1]
        const pick = SB.bestSubset(SB.upNumbers(s.tiles), total)
        host.dispatchLocal(pick ? { kind: 'shut', tiles: pick } : { kind: 'roll' })
      }
    }

    // After seat 0's round, the box belongs to seat 1 (the guest) and the guest's broadcast
    // view reflects the authoritative state.
    expect(host.getFull().scores.you).not.toBeNull()
    expect(guest.mySeat()).toBe(1)
    expect(guest.isMyTurn()).toBe(true)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.getState().turn).toBe('ai')
    expect(guest.getState().scores.you).toBe(host.getFull().scores.you)

    // Guest replies through the wire; the host's authoritative state advances.
    const before = host.getFull()
    const gs = guest.getState()
    const intent: ShutTheBoxIntent = gs.rolled
      ? { kind: 'shut', tiles: SB.bestSubset(SB.upNumbers(gs.tiles), gs.dice[0] + gs.dice[1]) ?? [] }
      : { kind: 'roll' }
    guest.dispatch(intent)
    // either the dice/roll state moved or the round/game resolved
    expect(A.tickKey(host.getFull())).not.toBe(A.tickKey(before))
  })

  it('a full two-round game reaches a decisive or drawn winner', () => {
    let s = A.makeGame()
    s = playRound(s)              // seat 0's round
    if (!A.isOver(s)) s = playRound(s)  // seat 1's round
    expect(A.isOver(s)).toBe(true)
    expect(['you', 'ai', 'draw']).toContain(s.winner)
    expect(A.seatToMove(s)).toBeNull()
  })
})
