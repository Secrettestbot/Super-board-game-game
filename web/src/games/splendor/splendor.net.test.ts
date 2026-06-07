/* SPLENDOR — netplay tests. Adapter round-trip (take / reserve / buy + illegal/out-of-turn),
 * a real host/guest integration over an in-memory transport, plus a hidden-info LEAK test
 * proving the guest's view never carries the other seat's face-down reserved cards or the
 * face-down deck order (everything else in splendor is public and stays intact). */

import { describe, it, expect } from 'vitest'
import { splendorAdapter as A, type SplendorIntent } from './net'
import * as SP from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game so every assertion is reproducible (no shuffle). */
function game() { return SP.makeGame({ noShuffle: true }) }

describe('splendor net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal take and passes the turn to seat 1', () => {
    const s = game()
    const s2 = A.applyIntent(s, 0, { kind: 'take', gems: ['emerald', 'sapphire', 'ruby'] })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    expect(s2.players[0].tokens.emerald).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s)) // step advanced
  })

  it('applies a take-2 (same color twice) when the pile allows it', () => {
    const s = game()
    const s2 = A.applyIntent(s, 0, { kind: 'take', gems: ['emerald', 'emerald'] })
    expect(s2).not.toBe(s)
    expect(s2.players[0].tokens.emerald).toBe(2)
    expect(s2.turn).toBe(1)
  })

  it('applies a blind deck reserve (grants a gold) and a face-up reserve by id', () => {
    const s = game()
    const r1 = A.applyIntent(s, 0, { kind: 'reserve', deckLevel: 1 })
    expect(r1).not.toBe(s)
    expect(r1.players[0].reserved.length).toBe(1)
    expect(r1.players[0].tokens.gold).toBe(1)

    const faceUp = s.visible[0][0]!
    const r2 = A.applyIntent(s, 0, { kind: 'reserve', cardId: faceUp.id })
    expect(r2.players[0].reserved.some(c => c.id === faceUp.id)).toBe(true)
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'take', gems: ['emerald'] })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // take-2 of a color whose pile has < 4 — set a depleted bank
    const depleted = { ...s, bank: { ...s.bank, emerald: 3 } }
    expect(A.applyIntent(depleted, 0, { kind: 'take', gems: ['emerald', 'emerald'] })).toBe(depleted)
    // take-3 with a duplicate color (only legal as a take-2 pair) — illegal as distinct take3
    expect(A.applyIntent(s, 0, { kind: 'take', gems: ['emerald', 'emerald', 'emerald'] })).toBe(s)
    // buy a card you cannot possibly afford yet (no tokens)
    expect(A.applyIntent(s, 0, { kind: 'buy', cardId: s.visible[2][0]!.id })).toBe(s)
    // buy a non-existent card id
    expect(A.applyIntent(s, 0, { kind: 'buy', cardId: 'no-such-card' })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('splendor host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().nobles.length).toBe(3)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) takes gems first
    host.dispatchLocal({ kind: 'take', gems: ['emerald', 'sapphire', 'ruby'] } as SplendorIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().step
    guest.dispatch({ kind: 'take', gems: ['diamond', 'onyx'] } as SplendorIntent)
    expect(host.getFull().step).toBe(before + 1)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().step).toBe(host.getFull().step)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().step
    // it is the host's (seat 0) turn, but the guest tries to take
    guest.dispatch({ kind: 'take', gems: ['emerald'] } as SplendorIntent)
    expect(host.getFull().step).toBe(before) // nothing changed
  })
})

describe('splendor hidden-info redaction (leak test)', () => {
  it("the guest never sees the other seat's face-down reserved cards or the deck order", () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    // Host (seat 0) reserves a BLIND top-deck card — its identity is secret to seat 1.
    host.dispatchLocal({ kind: 'reserve', deckLevel: 3 } as SplendorIntent)
    const full = host.getFull()
    const secretCard = full.players[0].reserved[0]
    expect(secretCard).toBeDefined()

    const view = guest.getState() // guest is seat 1

    // The opponent's (seat 0) reserved COUNT is preserved...
    expect(view.players[0].reserved.length).toBe(full.players[0].reserved.length)
    // ...but the actual reserved card identity is blanked to a placeholder.
    expect(view.players[0].reserved[0].id).toBe('?')
    expect(view.players[0].reserved[0].id).not.toBe(secretCard.id)

    // The face-down deck order is stripped to opaque stubs (count kept, identities hidden).
    for (let t = 0; t < 3; t++) {
      expect(view.decks[t].length).toBe(full.decks[t].length)
      for (const c of view.decks[t]) expect(c.id).toBe('?')
    }

    // The secret reserved card id must not appear ANYWHERE in what crossed the wire.
    expect(JSON.stringify(view)).not.toContain(secretCard.id)
    // Nor may any face-down deck card id leak (sample the real top-of-deck ids).
    for (let t = 0; t < 3; t++) {
      for (const c of full.decks[t]) expect(JSON.stringify(view)).not.toContain(c.id)
    }

    // Public info is intact: face-up cards, nobles, bank, and the guest's OWN reserved.
    expect(view.visible).toEqual(full.visible)
    expect(view.nobles).toEqual(full.nobles)
    expect(view.bank).toEqual(full.bank)
    expect(view.players[1].reserved).toEqual(full.players[1].reserved)
  })
})
