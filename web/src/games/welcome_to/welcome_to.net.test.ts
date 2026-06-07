/* WELCOME TO… — netplay adapter tests. Proves the online path headlessly:
 *   1. the adapter round-trips a legal pick and rejects illegal / out-of-turn intents
 *   2. a host (seat 0) + guest (seat 1) stay in sync over an in-memory transport, with the
 *      host as the sole authority (it flips the SHARED pairs; both write their own sheet)
 *   3. redactFor strips the face-down deck order so a guest can never read upcoming cards. */

import { describe, it, expect } from 'vitest'
import { welcomeToAdapter as A, type WelcomeToIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as W from './logic'
import type { State } from './logic'

/** A legal pick intent for the seat that is currently to move (or a refusal if stuck). */
function firstLegalIntent(s: State): WelcomeToIntent {
  const seat = s.turn
  const sheet = s.sheets[seat]
  for (let pi = 0; pi < s.flips.length; pi++) {
    const pair = s.flips[pi]
    const pls = W.legalPlacements(sheet, pair.number, pair.effect)
    if (pls.length > 0) {
      const p = pls[0]
      return { kind: 'pick', pairIndex: pi, streetIndex: p.streetIndex, lotIndex: p.lotIndex, number: p.number, fenceSide: 'right' }
    }
  }
  return { kind: 'refuse' }
}

describe('welcome_to net adapter', () => {
  it('exposes a 2-seat surface and reads numSeats off the state', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal pick and rejects illegal / out-of-turn intents', () => {
    const s = A.makeGame()
    const intent = firstLegalIntent(s)
    expect(intent.kind).toBe('pick') // a fresh sheet always has a legal first placement

    // legal seat-0 intent -> state changes (a number is written, step bumps, turn hands off)
    const after = A.applyIntent(s, 0, intent)
    expect(after).not.toBe(s)
    expect(after.step).toBeGreaterThan(s.step)
    expect(after.picked[0]).toBe(true)

    // out-of-turn: seat 1 cannot act while it is seat 0's turn -> SAME reference
    expect(A.applyIntent(s, 1, intent)).toBe(s)

    // illegal placement (lot 0 of street 0 with an impossible right-neighbor break is
    // rejected by the logic): write onto an already-targeted-but-out-of-order slot. Use a
    // pick that legalPlacements never returns -> SAME reference.
    const illegal: WelcomeToIntent = { kind: 'pick', pairIndex: 0, streetIndex: 0, lotIndex: 0, number: 999, fenceSide: 'right' }
    expect(A.applyIntent(s, 0, illegal)).toBe(s)

    // refusing when a legal placement exists is illegal -> SAME reference
    expect(A.applyIntent(s, 0, { kind: 'refuse' })).toBe(s)

    // garbage intent kind -> SAME reference
    expect(A.applyIntent(s, 0, { kind: 'nope' } as unknown as WelcomeToIntent)).toBe(s)
  })

  it('tickKey changes on every action', () => {
    const s = A.makeGame()
    const k0 = A.tickKey(s)
    const after = A.applyIntent(s, 0, firstLegalIntent(s))
    expect(A.tickKey(after)).not.toBe(k0)
  })

  it('host + guest stay in sync over an in-memory transport (host flips the shared pairs)', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])
    // guest sees the same shared pairs the host flipped
    expect(guest.getState().flips).toEqual(host.getFull().flips)

    // it is seat 0's (host's) turn to pick first
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host picks -> turn hands off to the guest (seat 1)
    host.dispatchLocal(firstLegalIntent(host.getFull()))
    expect(host.getFull().turn).toBe(1)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // view synced to the guest
    expect(guest.getState().turn).toBe(1)

    // an out-of-turn host intent is rejected (it is the guest's turn now)
    const stepBefore = host.getFull().step
    host.dispatchLocal(firstLegalIntent(host.getFull()))
    expect(host.getFull().step).toBe(stepBefore)

    // guest picks; the intent travels host-ward and applies authoritatively, and once both
    // have acted the round advances (a fresh shared flip) back to seat 0
    guest.dispatch(firstLegalIntent(guest.getState()))
    expect(host.getFull().turn).toBe(0)
    expect(host.getFull().picked).toEqual([false, false]) // new round flipped
    expect(guest.getState().flips).toEqual(host.getFull().flips)
  })

  it('redactFor strips the face-down deck order without leaking it to the guest', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    expect(full.numberDeck.length).toBeGreaterThan(0)
    expect(full.effectDeck.length).toBeGreaterThan(0)

    const view = guest.getState()
    // the guest receives empty decks (the order is hidden)
    expect(view.numberDeck).toEqual([])
    expect(view.effectDeck).toEqual([])

    // none of the upcoming face-down number/effect cards crossed the wire
    const wire = JSON.stringify(view)
    const redacted = A.redactFor!(full, 1)
    expect(redacted.numberDeck).toEqual([])
    expect(redacted.effectDeck).toEqual([])
    // sanity: the wire never carries the full deck length's worth of buried cards. Compare the
    // serialized view against the host's secret decks: the deck arrays are empty in the view.
    expect(wire).toContain('"numberDeck":[]')
    expect(wire).toContain('"effectDeck":[]')
  })
})
