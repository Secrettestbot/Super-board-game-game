/* TSURO — netplay tests. Browser-free proof of the online path: adapter round-trip,
 * a HostSession + GuestSession synced over an in-memory transport, and a leak test
 * proving the guest never receives the host's private hand tiles or the face-down deck. */

import { describe, it, expect } from 'vitest'
import { tsuroAdapter as A } from './net'
import type { TsuroIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// Find a legal (tileId, rotation) for the seat to move that actually changes the state.
function legalIntent(s: ReturnType<typeof A.makeGame>, seat: number): TsuroIntent {
  for (let tileId = 0; tileId < 3; tileId++) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const i: TsuroIntent = { kind: 'place', tileId, rotation }
      if (A.applyIntent(s, seat, i) !== s) return i
    }
  }
  throw new Error('no legal intent found')
}

describe('tsuro net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)

    // a legal seat-0 intent advances the game (new state object, turn moves on)
    const good = legalIntent(s, 0)
    const after = A.applyIntent(s, 0, good)
    expect(after).not.toBe(s)
    expect(A.seatToMove(after)).not.toBe(0) // foe (or game over) now
    expect(A.tickKey(after)).not.toBe(A.tickKey(s))

    // out-of-turn: seat 1 tries to move on seat 0's turn -> unchanged (===)
    expect(A.applyIntent(s, 1, { kind: 'place', tileId: 0, rotation: 0 })).toBe(s)

    // illegal: a hand index that does not exist -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'place', tileId: 99, rotation: 0 })).toBe(s)
    // illegal: wrong kind -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'nope' as 'place', tileId: 0, rotation: 0 })).toBe(s)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.isMyTurn()).toBe(true)   // host is seat 0 ('you'), moves first
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays a legal move
    const hostMove = legalIntent(host.getFull(), 0)
    host.dispatchLocal(hostMove)

    // if the game didn't end on that move, it's now the guest's turn and synced
    if (!A.isOver(host.getFull())) {
      expect(A.seatToMove(host.getFull())).toBe(1)
      expect(guest.isMyTurn()).toBe(true)
      expect(A.tickKey(guest.getState())).toBe(A.tickKey(host.getFull()))

      // guest (seat 1) replies; intent travels host-ward and applies
      const guestMove = legalIntent(guest.getState(), 1)
      const tickBefore = A.tickKey(host.getFull())
      guest.dispatch(guestMove)
      expect(A.tickKey(host.getFull())).not.toBe(tickBefore) // host advanced
    }
  })

  it('leak test: the guest never sees the host hand tiles or the face-down deck', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()
    const view = guest.getState()

    // guest (seat 1 = 'foe') keeps its own real hand
    expect(view.hands.foe).toEqual(full.hands.foe)
    // the host's ('you') hand is blanked, count preserved
    expect(view.hands.you).toHaveLength(full.hands.you.length)
    expect(view.hands.you).not.toEqual(full.hands.you)
    // the deck is blanked, count preserved
    expect(view.deck).toHaveLength(full.deck.length)

    // none of the host's secret tile wirings cross the wire
    const wire = JSON.stringify(view)
    for (const tile of full.hands.you) {
      expect(wire).not.toContain(JSON.stringify(tile))
    }
    // the public board / stones still made it through
    expect(view.stones).toEqual(full.stones)
    expect(view.placed).toEqual(full.placed)
  })
})
