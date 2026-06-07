/* PORT ROYAL — netplay tests. Adapter round-trip (legal flip/stop/hire applied,
   illegal & out-of-turn rejected as the SAME state), a host+guest in-memory sync run,
   and a redaction leak test proving the face-down deck order/contents never cross the
   wire to a guest (only its length and the public board/harbor do). */

import { describe, it, expect } from 'vitest'
import { portRoyalAdapter as A, type PortRoyalIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as PR from './logic'
import type { Card, PortState } from './logic'

// A deck whose TOP (last element) is a cheap person, so a flip can never bust and the
// flipped card is known. A couple of fillers underneath keep the deck non-empty.
function withTopPerson(): PortState {
  const filler: Card = { id: 900, kind: 'ship', color: 'red', coins: 2, swords: 0, name: 'red ship' }
  const top: Card = { id: 901, kind: 'person', sym: 'sailor', cost: 2, influence: 1, name: 'Sailor' }
  // optionalDeck => no shuffle; deck.pop() draws `top` first.
  return PR.makeGame([filler, top])
}

describe('port_royal net adapter', () => {
  it('round-trips a legal flip / stop / hire and rejects illegal & out-of-turn intents', () => {
    const s = withTopPerson()
    expect(A.numSeats(s)).toBe(3)
    expect(A.seatToMove(s)).toBe(0) // 'you' (discoverer) to move
    expect(A.isOver(s)).toBe(false)

    // out-of-turn: seat 1 tries to flip while seat 0 is discoverer -> unchanged (===)
    expect(A.applyIntent(s, 1, { kind: 'flip' })).toBe(s)
    // wrong-phase intent: hire/pass are illegal during discover -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'pass' })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'hire', cardId: 901 })).toBe(s)

    // legal flip by seat 0: the sailor lands in the harbor, deck shrinks by one
    const flipped = A.applyIntent(s, 0, { kind: 'flip' })
    expect(flipped).not.toBe(s)
    expect(flipped.harbor.map(c => c.id)).toEqual([901])
    expect(flipped.deck.length).toBe(s.deck.length - 1)
    expect(A.seatToMove(flipped)).toBe(0) // still discoverer's sub-turn

    // legal stop -> trade phase, discoverer (seat 0) takes first
    const stopped = A.applyIntent(flipped, 0, { kind: 'stop' })
    expect(stopped).not.toBe(flipped)
    expect(stopped.phase).toBe('trade')
    expect(A.seatToMove(stopped)).toBe(0)

    // illegal hire: a card id not in the harbor -> unchanged (===)
    expect(A.applyIntent(stopped, 0, { kind: 'hire', cardId: 12345 })).toBe(stopped)

    // legal hire of the sailor by id -> seat 0 gains the person + influence
    const hired = A.applyIntent(stopped, 0, { kind: 'hire', cardId: 901 })
    expect(hired).not.toBe(stopped)
    expect(hired.players[0].persons.map(c => c.id)).toContain(901)
    expect(hired.players[0].influence).toBe(1)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host = seat 0, guest = next open seat

    // host (seat 0) is the opening discoverer
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host flips a card into the harbor; the guest's view reflects it
    const beforeDeck = host.getFull().deck.length
    host.dispatchLocal({ kind: 'flip' })
    const full = host.getFull()
    // a flip either added a harbor card (deck shrank) or busted (turn handed off) — in
    // every case the guest's redacted view mirrors the host's harbor + deck count.
    expect(guest.getState().harbor.length).toBe(full.harbor.length)
    expect(guest.getState().deck.length).toBe(full.deck.length)
    expect(full.deck.length).toBeLessThanOrEqual(beforeDeck)
  })
})

describe('port_royal redaction (hidden face-down deck)', () => {
  it('the guest never sees the deck order/contents, only its length', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()       // real shuffled deck of distinct cards
    const view = guest.getState()     // what crossed the wire to the guest

    // length preserved so the "deck" counter still works
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.length).toBeGreaterThan(0)

    // every deck entry is an anonymous face-down stand-in (no real ids/colors/values)
    expect(view.deck.every(c => c.id === -1)).toBe(true)
    const realIds = full.deck.map(c => c.id).join(',')
    const viewIds = view.deck.map(c => c.id).join(',')
    expect(realIds).not.toBe(viewIds) // order/identity scrubbed

    // discard pile (also face-down) is likewise anonymized
    expect(view.discard.every(c => c.id === -1)).toBe(true)

    // the scrubbed deck carries no identifying fields (color / coins / cost / swords /
    // influence / sym / needs) — only the uniform placeholder shape.
    for (const c of view.deck) {
      expect(c.color).toBeUndefined()
      expect(c.coins).toBeUndefined()
      expect(c.cost).toBeUndefined()
      expect(c.swords).toBeUndefined()
      expect(c.influence).toBeUndefined()
      expect(c.sym).toBeUndefined()
      expect(c.needs).toBeUndefined()
    }

    // none of the real deck card ids survive in the deck portion of the wire view
    const realIdSet = new Set(full.deck.map(c => c.id))
    expect(view.deck.some(c => realIdSet.has(c.id))).toBe(false)
  })
})

// reference the intent type so unused-import lint stays clean
const _exampleIntent: PortRoyalIntent = { kind: 'flip' }
void _exampleIntent
