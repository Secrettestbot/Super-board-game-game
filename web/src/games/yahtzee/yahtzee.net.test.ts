/* YAHTZEE — netplay adapter + session integration tests. Proves the online path works
 * headlessly: legal roll/score advance the game, illegal/out-of-turn intents return the
 * input state unchanged (===), and a host + guest stay in sync over an in-memory transport.
 * Everything is public, so there is no redaction leak test. */

import { describe, it, expect } from 'vitest'
import { yahtzeeAdapter as A } from './net'
import type { YahtzeeIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('yahtzee net adapter', () => {
  it('reports seats and the active player', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // 'you' to move
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll, then a legal score advances the turn', () => {
    const s0 = A.makeGame()

    // Legal roll by seat 0 -> state changes, dice are now "rolled", still seat 0's turn.
    const s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    expect(s1).not.toBe(s0)
    expect(s1.rolled).toBe(true)
    expect(s1.rollsLeft).toBe(2)
    expect(A.seatToMove(s1)).toBe(0) // same seat keeps acting

    // Legal score by seat 0 -> a category fills and the turn passes to seat 1.
    const s2 = A.applyIntent(s1, 0, { kind: 'score', cat: 'chance' })
    expect(s2).not.toBe(s1)
    expect(s2.cards.you.chance).not.toBeNull()
    expect(A.seatToMove(s2)).toBe(1) // now the rival ('ai')
  })

  it('toggles hold for the active seat after a roll', () => {
    const s0 = A.applyIntent(A.makeGame(), 0, { kind: 'roll' })
    const s1 = A.applyIntent(s0, 0, { kind: 'hold', i: 2 })
    expect(s1).not.toBe(s0)
    expect(s1.held[2]).toBe(true)
  })

  it('rejects out-of-turn intents (returns the same ref)', () => {
    const s0 = A.makeGame() // seat 0 to move
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    expect(A.applyIntent(s0, 1, { kind: 'score', cat: 'chance' })).toBe(s0)
  })

  it('rejects illegal intents (returns the same ref)', () => {
    const s0 = A.makeGame() // not rolled yet
    // Can't score or hold before rolling.
    expect(A.applyIntent(s0, 0, { kind: 'score', cat: 'chance' })).toBe(s0)
    expect(A.applyIntent(s0, 0, { kind: 'hold', i: 0 })).toBe(s0)

    const rolled = A.applyIntent(s0, 0, { kind: 'roll' })
    // Unknown category, out-of-range hold, and an unknown intent kind are all rejected.
    expect(A.applyIntent(rolled, 0, { kind: 'score', cat: 'nope' })).toBe(rolled)
    expect(A.applyIntent(rolled, 0, { kind: 'hold', i: 99 })).toBe(rolled)
    expect(A.applyIntent(rolled, 0, { kind: 'bogus' } as unknown as YahtzeeIntent)).toBe(rolled)

    // Scoring an already-filled category is rejected.
    const scored = A.applyIntent(rolled, 0, { kind: 'score', cat: 'chance' })
    // back to seat 0 for a fresh turn so we can probe the filled category legally
    // (advance the rival via aiStep so it becomes seat 0's turn again).
    let st = A.aiStep(scored, 1)
    // st is now seat 0's turn; roll then try to re-score the filled 'chance'.
    st = A.applyIntent(st, 0, { kind: 'roll' })
    expect(A.applyIntent(st, 0, { kind: 'score', cat: 'chance' })).toBe(st)
  })
})

describe('yahtzee host + guest over an in-memory transport', () => {
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
    expect(host.isMyTurn()).toBe(true) // host is seat 0, moves first
    expect(guest.isMyTurn()).toBe(false)
  })

  it('relays host + guest intents and keeps both in sync', () => {
    const { host, guest } = connect()

    // Host (seat 0) rolls then scores -> turn passes to the guest (seat 1).
    host.dispatchLocal({ kind: 'roll' } as YahtzeeIntent)
    expect(host.isMyTurn()).toBe(true) // still rolling/holding sub-actions
    host.dispatchLocal({ kind: 'score', cat: 'chance' } as YahtzeeIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // guest's turn now, view synced
    expect(guest.getState().cards.you.chance).not.toBeNull()

    // Guest (seat 1) rolls then scores -> the host's authoritative state advances.
    guest.dispatch({ kind: 'roll' } as YahtzeeIntent)
    guest.dispatch({ kind: 'score', cat: 'chance' } as YahtzeeIntent)
    expect(host.getFull().cards.ai.chance).not.toBeNull()
    expect(host.getFull().round).toBe(2) // a full you+ai round completed
    expect(host.isMyTurn()).toBe(true) // back to the host
  })

  it('ignores an out-of-turn guest intent', () => {
    const { host, guest } = connect()
    const before = host.getFull()
    guest.dispatch({ kind: 'roll' } as YahtzeeIntent) // not the guest's turn
    expect(host.getFull()).toBe(before) // nothing changed
  })
})
