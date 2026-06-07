/* WINGSPAN (card engine) — netplay tests. Adapter round-trip + a real host/guest
 * integration over an in-memory transport, plus a hidden-info LEAK test proving the guest's
 * view never carries the other seat's private hand cards or the face-down deck order. */

import { describe, it, expect } from 'vitest'
import { wingspanCardAdapter as A, type WingspanCardIntent } from './net'
import * as WS from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game: an explicit deck (top = end). Both players draw 4 from the top,
 * then the tray fills 3 — so we control every hidden card. Lots of cheap birds up front so
 * legal plays exist immediately. */
function game(): WS.State {
  const deck = [
    // deeper deck (drawn later / sits face-down)
    'hawk', 'pheasant', 'turkey', 'swan', 'owl', 'heron',
    // tray (last 3 popped after hands) -> popped in reverse: kingfisher, goose, pelican
    'pelican', 'goose', 'kingfisher',
    // rival hand (popped next, reversed): meadow, killdeer, quail, sparrow
    'sparrow', 'quail', 'killdeer', 'meadow',
    // your hand (popped first, reversed): cardinal, wood, jay, robin
    'robin', 'jay', 'wood', 'cardinal',
  ]
  return WS.makeGame(deck)
}

describe('wingspan_card net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal play action and passes the turn to seat 1', () => {
    const s = game()
    // seat 0 holds cardinal (forest, cost 1) and has 2 food -> playable
    const card = s.players[0].hand.find(id => WS.BIRD[id].cost <= s.players[0].food)!
    const def = WS.BIRD[card]
    const s2 = A.applyIntent(s, 0, { kind: 'play', cardId: card, habitat: def.habitat })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    // the bird is now placed and gone from hand; a cube was spent
    expect(s2.players[0].rows[def.habitat].some(b => b.defId === card)).toBe(true)
    expect(s2.players[0].hand).not.toContain(card)
    expect(s2.players[0].cubesLeft).toBe(s.players[0].cubesLeft - 1)
    // tickKey changed
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('applies the always-available habitat actions', () => {
    const s = game()
    const food = A.applyIntent(s, 0, { kind: 'food' })
    expect(food).not.toBe(s)
    expect(food.players[0].food).toBeGreaterThan(s.players[0].food)
    expect(food.turn).toBe(1)
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'food' })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a card the seat does not hold
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 'turkey', habitat: 'grassland' })).toBe(s)
    // a held card declared into the wrong habitat
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 'robin', habitat: 'wetland' })).toBe(s)
    // a 'play' intent missing its card
    expect(A.applyIntent(s, 0, { kind: 'play' } as WingspanCardIntent)).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('wingspan_card host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().tray.length).toBe(WS.TRAY_SIZE)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) acts first via an always-legal habitat action
    host.dispatchLocal({ kind: 'food' } as WingspanCardIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const beforeCubes = host.getFull().players[1].cubesLeft
    guest.dispatch({ kind: 'eggs' } as WingspanCardIntent)
    expect(host.getFull().players[1].cubesLeft).toBe(beforeCubes - 1)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative tick
    expect(A.tickKey(guest.getState())).toBe(A.tickKey(host.getFull()))
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().players[0].cubesLeft
    // it is the host's (seat 0) turn, but the guest tries to act
    guest.dispatch({ kind: 'food' } as WingspanCardIntent)
    expect(host.getFull().players[0].cubesLeft).toBe(before) // nothing changed
  })
})

describe('wingspan_card hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the other seat's hand cards or the deck order", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.players[1].hand).toEqual(full.players[1].hand)
    // ...but seat 0's hand is blanked to placeholders (count preserved).
    expect(view.players[0].hand.length).toBe(full.players[0].hand.length)
    expect(view.players[0].hand.every(id => id === '__hidden__')).toBe(true)
    // ...and the face-down deck is fully blanked (count preserved).
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(id => id === '__hidden__')).toBe(true)

    // The redacted regions (seat 0's hand + the deck) must carry NO real bird ids — only
    // the neutral placeholder. (A card id that legitimately surfaces face-up in the public
    // tray is shared info, so we scope the leak check to the regions that were redacted.)
    const redactedWire = JSON.stringify(view.players[0].hand) + JSON.stringify(view.deck)
    for (const def of WS.BIRDS) expect(redactedWire).not.toContain(`"${def.id}"`)

    // The public face-up tray and both players' played rows stay intact.
    expect(view.tray).toEqual(full.tray)
    expect(view.players[0].rows).toEqual(full.players[0].rows)
  })
})
