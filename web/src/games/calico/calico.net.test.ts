/* CALICO — netplay tests. Adapter round-trip + a real host/guest integration over an
 * in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries
 * the other seat's private hand tiles (or the face-down bag). */

import { describe, it, expect } from 'vitest'
import { calicoAdapter as A, type CalicoIntent } from './net'
import * as C from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game so every assertion is reproducible. */
function game() { return C.makeGame(C.makeBag(42)) }

describe('calico net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal placement and passes the turn to seat 1', () => {
    const s = game()
    const hex = C.legalPlacements(s.boards[0])[0]
    const s2 = A.applyIntent(s, 0, { handIndex: 0, hex })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    // the hex now holds a patch, and the hand refilled back to 2 from the market
    expect(s2.boards[0][C.hexKey(hex.q, hex.r)].patch).not.toBeNull()
    expect(s2.hands[0].length).toBe(2)
    // tickKey changed (step advanced)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    const hex = C.legalPlacements(s.boards[1])[0]
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { handIndex: 0, hex })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // hand slot that does not exist
    expect(A.applyIntent(s, 0, { handIndex: 9, hex: { q: 1, r: 0 } })).toBe(s)
    // a goal hex is not a legal placement (GOAL_HEXES[0] = {1,1})
    expect(A.applyIntent(s, 0, { handIndex: 0, hex: { q: 1, r: 1 } })).toBe(s)
    // a fixed pre-printed corner (0,0) is not placeable
    expect(A.applyIntent(s, 0, { handIndex: 0, hex: { q: 0, r: 0 } })).toBe(s)
    // out of bounds
    expect(A.applyIntent(s, 0, { handIndex: 0, hex: { q: 9, r: 9 } })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('calico host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().market.length).toBe(3)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) places first
    const h0 = C.legalPlacements(host.getFull().boards[0])[0]
    host.dispatchLocal({ handIndex: 0, hex: h0 } as CalicoIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().step
    const g0 = C.legalPlacements(guest.getState().boards[1])[0]
    guest.dispatch({ handIndex: 0, hex: g0 } as CalicoIntent)
    expect(host.getFull().step).toBe(before + 1)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().step).toBe(host.getFull().step)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().step
    // it is the host's (seat 0) turn, but the guest tries to place
    const g0 = C.legalPlacements(guest.getState().boards[1])[0]
    guest.dispatch({ handIndex: 0, hex: g0 } as CalicoIntent)
    expect(host.getFull().step).toBe(before) // nothing changed
  })
})

describe('calico hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the other seat's hand tiles or the bag", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.hands[1]).toEqual(full.hands[1])
    // ...but seat 0's hand is blanked to placeholders.
    expect(view.hands[0]).toEqual(full.hands[0].map(() => ({ color: -1, pattern: -1 })))
    // ...and the face-down bag is fully blanked.
    expect(view.bag.every(t => t.color === -1 && t.pattern === -1)).toBe(true)

    // None of seat 0's secret color/pattern indices may appear anywhere in the wire view's
    // hand[0] region. Verify by reconstructing what a leak would look like.
    const leaked = JSON.stringify(full.hands[0])
    expect(JSON.stringify(view.hands[0])).not.toBe(leaked)

    // The public market is unchanged (face-up info both players share).
    expect(view.market).toEqual(full.market)
  })
})
