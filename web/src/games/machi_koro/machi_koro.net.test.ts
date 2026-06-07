/* MACHI KORO — netplay tests. Adapter round-trip (legal vs illegal/out-of-turn intents)
 * plus a host+guest integration run over an in-memory transport pair, proving the online
 * roll -> income -> build -> pass flow stays in sync without a browser or WebRTC. */

import { describe, it, expect } from 'vitest'
import { machiKoroAdapter as A, type MachiKoroIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('machi koro net adapter', () => {
  it('exposes the real seat count and the active seat to move', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(s.players.length) // 3 in the default game
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll, then rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()

    // out-of-turn: seat 1 cannot act while it's seat 0's turn -> same state ref back
    expect(A.applyIntent(s, 1, { kind: 'roll', n: 1 })).toBe(s)
    // illegal in the roll phase: cannot pass before rolling -> unchanged ref
    expect(A.applyIntent(s, 0, { kind: 'pass' })).toBe(s)
    // illegal in the roll phase: cannot buy before rolling -> unchanged ref
    expect(A.applyIntent(s, 0, { kind: 'buy', card: 'wheat' })).toBe(s)

    // legal: seat 0 rolls. The default player has no Radio Tower, so income auto-applies
    // and we land in the build phase, still seat 0's turn.
    const rolled = A.applyIntent(s, 0, { kind: 'roll', n: 1 })
    expect(rolled).not.toBe(s)
    expect(rolled.phase).toBe('build')
    expect(rolled.incomeDone).toBe(true)
    expect(A.seatToMove(rolled)).toBe(0) // same seat through roll -> build
    expect(A.tickKey(rolled)).not.toBe(A.tickKey(s)) // tickKey changed on the action

    // illegal in build: cannot roll again -> unchanged ref
    expect(A.applyIntent(rolled, 0, { kind: 'roll', n: 1 })).toBe(rolled)
    // illegal buy (no such card / unaffordable handled by logic) -> unchanged ref
    expect(A.applyIntent(rolled, 0, { kind: 'buy', card: 'not-a-card' })).toBe(rolled)

    // legal: pass ends the turn and advances to seat 1
    const passed = A.applyIntent(rolled, 0, { kind: 'pass' })
    expect(passed).not.toBe(rolled)
    expect(A.seatToMove(passed)).toBe(1)
    expect(A.tickKey(passed)).not.toBe(A.tickKey(rolled))
  })

  it('aiStep plays a full AI turn and hands the table back', () => {
    let s = A.makeGame()
    s = A.applyIntent(s, 0, { kind: 'roll', n: 1 })
    s = A.applyIntent(s, 0, { kind: 'pass' }) // now seat 1 (an AI) to move
    expect(A.seatToMove(s)).toBe(1)
    const after = A.aiStep(s, 1)
    expect(after).not.toBe(s)
    // the AI's turn resolved; the table moved on to another seat (or the game ended)
    expect(after.turn !== 1 || after.winner != null).toBe(true)
  })
})

describe('machi koro host + guest stay in sync over an in-memory transport', () => {
  it('relays guest intents and broadcasts the authoritative view back', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0, guest takes the next open seat
    expect(host.isMyTurn()).toBe(true) // seat 0 (host) starts
    expect(guest.isMyTurn()).toBe(false)

    // Host (seat 0) rolls then passes; both moves broadcast to the guest.
    host.dispatchLocal({ kind: 'roll', n: 1 } as MachiKoroIntent)
    expect(host.getFull().phase).toBe('build')
    host.dispatchLocal({ kind: 'pass' } as MachiKoroIntent)

    // Turn is now seat 1 — the guest. Its synced view agrees.
    expect(host.getFull().turn).toBe(1)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(1)
    expect(guest.getState().log.length).toBe(host.getFull().log.length)

    // Out-of-turn from the host's seat is ignored once it's the guest's turn.
    const before = host.getFull().log.length
    host.dispatchLocal({ kind: 'roll', n: 1 } as MachiKoroIntent)
    expect(host.getFull().log.length).toBe(before)

    // Guest (seat 1) rolls; the intent travels host-ward and the host applies it.
    guest.dispatch({ kind: 'roll', n: 1 } as MachiKoroIntent)
    expect(host.getFull().phase).toBe('build')
    expect(host.getFull().turn).toBe(1)
    // Guest's view reflects the host's authoritative state.
    expect(guest.getState().phase).toBe('build')
    expect(guest.getState().incomeDone).toBe(host.getFull().incomeDone)

    // Guest passes; host advances the turn (to seat 2, an AI seat on the host).
    guest.dispatch({ kind: 'pass' } as MachiKoroIntent)
    expect(host.getFull().turn).not.toBe(1)
  })
})
