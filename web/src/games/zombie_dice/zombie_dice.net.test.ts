/* ZOMBIE DICE — netplay adapter + session sync tests. Proves the online path headlessly:
 * the adapter validates/round-trips intents, and a HostSession + GuestSession wired through
 * an in-memory transport stay in sync as the seat-0 host rolls and the seat-1 guest plays. */

import { describe, it, expect } from 'vitest'
import { zombieDiceAdapter as A } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('zombie_dice net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn ones', () => {
    const s0 = A.makeGame()
    expect(A.numSeats(s0)).toBe(2)
    expect(A.seatToMove(s0)).toBe(0) // 'you' moves first
    expect(A.isOver(s0)).toBe(false)

    // Out-of-turn: seat 1 cannot act while it's seat 0's turn -> same ref back.
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // Illegal: 'stop' before rolling (s.rolling false) -> same ref back.
    expect(A.applyIntent(s0, 0, { kind: 'stop' })).toBe(s0)

    // Legal: seat 0 rolls. roll() always changes state (rolling becomes true, or it busts).
    const s1 = A.applyIntent(s0, 0, { kind: 'roll' })
    expect(s1).not.toBe(s0)
    expect(A.tickKey(s1)).not.toBe(A.tickKey(s0))

    // After a roll that didn't bust, it's still seat 0's turn and stop is now legal.
    if (s1.rolling && !s1.winner && A.seatToMove(s1) === 0) {
      expect(s1.rolling).toBe(true)
      const s2 = A.applyIntent(s1, 0, { kind: 'stop' })
      expect(s2).not.toBe(s1)
      expect(A.tickKey(s2)).not.toBe(A.tickKey(s1))
      // Stopping (without winning) passes the cup to seat 1.
      if (!s2.winner) expect(A.seatToMove(s2)).toBe(1)
    } else {
      // A first roll that took three shotguns busts: turn flips to seat 1.
      expect(A.seatToMove(s1)).toBe(1)
    }
  })

  it('drives the AI seat one action per call', () => {
    // Get to seat 1's ('ai') turn by ending seat 0's turn (roll once, then stop).
    let s = A.makeGame()
    while (A.seatToMove(s) === 0) {
      const before = A.tickKey(s)
      if (s.rolling) s = A.applyIntent(s, 0, { kind: 'stop' })
      else s = A.applyIntent(s, 0, { kind: 'roll' })
      expect(A.tickKey(s)).not.toBe(before) // every action changes the tick key
      if (s.winner) break
    }
    if (s.winner) return // rare: seat 0 won outright before yielding
    expect(A.seatToMove(s)).toBe(1)
    // aiStep advances the 'ai' seat; one action changes the tick key.
    const before = A.tickKey(s)
    const after = A.aiStep(s, 1)
    expect(after).not.toBe(s)
    expect(A.tickKey(after)).not.toBe(before)
    // aiStep is a no-op when asked for a seat that isn't to move.
    expect(A.aiStep(s, 0)).toBe(s)
  })
})

describe('zombie_dice host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs host + guest rolls', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host is seat 0, moves first
    expect(guest.isMyTurn()).toBe(false)
    expect(guest.getState().turn).toBe('you')

    // Host (seat 0) rolls -> view broadcasts to the guest.
    host.dispatchLocal({ kind: 'roll' })
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
    expect(guest.getState().turn).toBe(host.getFull().turn)

    // End the host's turn so the move passes to the guest (seat 1). If the roll already
    // busted, the turn has flipped; otherwise stop to bank and pass.
    if (host.getFull().turn === 'you' && !host.getFull().winner) {
      host.dispatchLocal({ kind: 'stop' })
    }
    if (host.getFull().winner) return // host won outright (rare); nothing more to sync
    expect(host.getFull().turn).toBe('ai')
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)
    expect(guest.getState().log.length).toBe(host.getFull().log.length)

    // Guest (seat 1) rolls; intent travels host-ward, applies, and re-syncs. A roll always
    // appends at least one log entry (two if it busts on a third shotgun).
    const lenBefore = host.getFull().log.length
    guest.dispatch({ kind: 'roll' })
    expect(host.getFull().log.length).toBeGreaterThan(lenBefore)
    expect(guest.getState().log.length).toBe(host.getFull().log.length)
  })
})
