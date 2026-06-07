/* ALHAMBRA — netplay tests. Adapter round-trip (legal take/buy + illegal/out-of-turn
 * rejection), a real host/guest integration over an in-memory transport, and a STRUCTURAL
 * hidden-info LEAK test: the guest's view must carry only its OWN money hand, with every
 * other seat's hand and both face-down decks reduced to neutral placeholders. Money/tile
 * ids in this game are NOT globally unique (m0…, t0…), so we assert on the redacted regions
 * structurally rather than substring-scanning the whole serialized view. */

import { describe, it, expect } from 'vitest'
import { alhambraAdapter as A, type AlhambraIntent } from './net'
import * as L from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game so every assertion is reproducible (no shuffle). */
function game() { return L.makeGame({ noShuffle: true }) }

describe('alhambra net adapter', () => {
  it('starts with seat 0 to move on a 3-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal money take and passes the turn to seat 1', () => {
    const s = game()
    // Take the single money-market card at index 0 (always legal: one card).
    const intent: AlhambraIntent = { kind: 'take', indices: [0] }
    const s2 = A.applyIntent(s, 0, intent)
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    // seat 0's hand grew by one card; tickKey advanced (step bumped).
    expect(s2.players[0].hand.length).toBe(s.players[0].hand.length + 1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('applies a legal buy when seat 0 can afford a market tile', () => {
    const s = game()
    // Find a tile seat 0 can pay for with cards already in hand.
    const me = s.players[0]
    let found = -1
    let payment: string[] | null = null
    s.buildingMarket.forEach((tile, idx) => {
      if (found < 0 && tile && L.canAfford(me, tile)) {
        const p = L.choosePayment(me, tile)
        if (p) { found = idx; payment = p }
      }
    })
    if (found >= 0 && payment) {
      const before = s.players[0].alhambra.length
      const s2 = A.applyIntent(s, 0, { kind: 'buy', marketIndex: found, payment })
      expect(s2).not.toBe(s)
      expect(s2.players[0].alhambra.length).toBe(before + 1)
    } else {
      // No affordable tile in the deterministic deal — that's still a valid game; skip.
      expect(found).toBe(-1)
    }
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // seat 1 tries to take while it is seat 0's turn.
    expect(A.applyIntent(s, 1, { kind: 'take', indices: [0] })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // An empty take is illegal.
    expect(A.applyIntent(s, 0, { kind: 'take', indices: [] })).toBe(s)
    // A buy with bogus payment ids is illegal.
    expect(A.applyIntent(s, 0, { kind: 'buy', marketIndex: 0, payment: ['nope', 'nope2'] })).toBe(s)
    // Redesign with no reserved tile is illegal.
    expect(A.applyIntent(s, 0, { kind: 'redesign' })).toBe(s)
    // An out-of-range take index is illegal.
    expect(A.applyIntent(s, 0, { kind: 'take', indices: [99] })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('alhambra host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai'])
    expect(guest.getState().moneyMarket.length).toBe(host.getFull().moneyMarket.length)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) takes a single money card first.
    host.dispatchLocal({ kind: 'take', indices: [0] } as AlhambraIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies with its own take; intent travels host-ward and applies.
    const before = host.getFull().step
    guest.dispatch({ kind: 'take', indices: [0] } as AlhambraIntent)
    expect(host.getFull().step).toBe(before + 1)
    expect(host.getFull().turn).toBe(2) // turn advanced past the guest to seat 2 (AI)
    // guest's view reflects the host's authoritative state.
    expect(guest.getState().step).toBe(host.getFull().step)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().step
    // it is the host's (seat 0) turn, but the guest tries to act.
    guest.dispatch({ kind: 'take', indices: [0] } as AlhambraIntent)
    expect(host.getFull().step).toBe(before) // nothing changed
  })
})

describe('alhambra hidden-info redaction (structural leak test)', () => {
  it("the guest's view carries only its own money hand; others + decks are placeholders", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact.
    expect(view.players[1].hand).toEqual(full.players[1].hand)

    // Every OTHER seat's hand is reduced to neutral placeholders (count preserved, no real
    // currency/value carried). We assert structurally: same length, all placeholder cards.
    for (const i of [0, 2]) {
      expect(view.players[i].hand.length).toBe(full.players[i].hand.length)
      for (const c of view.players[i].hand) {
        expect(c.id).toBe('?')
        expect(c.value).toBe(0)
      }
      // And the real hand (when it had any non-zero values) is genuinely hidden.
      if (full.players[i].hand.some(c => c.value !== 0)) {
        expect(view.players[i].hand).not.toEqual(full.players[i].hand)
      }
    }

    // Both face-down decks are blanked to same-length placeholder arrays.
    expect(view.moneyDeck.length).toBe(full.moneyDeck.length)
    expect(view.moneyDeck.every(c => c.id === '?' && c.value === 0)).toBe(true)
    expect(view.buildingDeck.length).toBe(full.buildingDeck.length)
    expect(view.buildingDeck.every(t => t.id === '?' && t.cost === 0)).toBe(true)

    // Public regions are untouched (face-up info both players share).
    expect(view.moneyMarket).toEqual(full.moneyMarket)
    expect(view.buildingMarket).toEqual(full.buildingMarket)
    expect(view.players[0].alhambra).toEqual(full.players[0].alhambra)
    expect(view.players[0].score).toBe(full.players[0].score)
  })

  it('the adapter round-trips a redacted view without mutating the source', () => {
    const s = game()
    const v = A.redactFor!(s, 0)
    // seat 0 keeps its hand; seats 1 & 2 are blanked.
    expect(v.players[0].hand).toEqual(s.players[0].hand)
    expect(v.players[1].hand.every(c => c.id === '?')).toBe(true)
    // Source untouched.
    expect(s.players[1].hand.some(c => c.id !== '?')).toBe(true)
  })
})
