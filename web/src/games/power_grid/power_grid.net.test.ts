/* POWER GRID — netplay tests. Adapter round-trip (a legal seat-0 plant buy applied,
   illegal & out-of-turn intents rejected as the SAME state), a host+guest in-memory sync
   run, and a redaction leak test proving each other seat's MONEY (and the face-down deck
   order) never crosses the wire to a guest — only the viewer's own cash and the public
   board do. */

import { describe, it, expect } from 'vitest'
import { powerGridAdapter as A, type PowerGridIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

describe('power_grid net adapter', () => {
  it('round-trips a legal plant buy and rejects illegal & out-of-turn intents', () => {
    const s = A.makeGame() // unseeded: ordered deck, market = cheapest 4 (ids 1..4)
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0) // seat 0 ('You') acts first in the auction
    expect(A.isOver(s)).toBe(false)

    const cheap = s.market[0] // cost 3, the cheapest face-up plant

    // out-of-turn: seat 1 tries to buy while seat 0 is to move -> unchanged (===)
    expect(A.applyIntent(s, 1, { kind: 'buyPlant', plantId: cheap.id })).toBe(s)
    // wrong-phase intents during the auction -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'endResources' })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'buildCity', cityId: 'AME' })).toBe(s)
    // illegal plant id (not in the market) -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'buyPlant', plantId: 9999 })).toBe(s)

    // legal buy by seat 0: gains the plant, money drops by its cost, market refills/shrinks
    const before = s.players[0].money
    const bought = A.applyIntent(s, 0, { kind: 'buyPlant', plantId: cheap.id })
    expect(bought).not.toBe(s)
    expect(bought.players[0].plants.some(p => p.id === cheap.id)).toBe(true)
    expect(bought.players[0].money).toBe(before - cheap.cost)
    // a player buys at most one plant per auction -> seat 0 done, turn passes to seat 1
    expect(A.seatToMove(bought)).toBe(1)

    // passing is legal for the seat to move (seat 1) -> auction advances
    const passed = A.applyIntent(bought, 1, { kind: 'passAuction' })
    expect(passed).not.toBe(bought)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1) // host = seat 0, guest = next open seat

    expect(host.isMyTurn()).toBe(true)  // seat 0 opens the auction
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) buys the cheapest plant; the guest's view reflects it
    const cheap = host.getFull().market[0]
    host.dispatchLocal({ kind: 'buyPlant', plantId: cheap.id })
    const full = host.getFull()
    expect(full.players[0].plants.some(p => p.id === cheap.id)).toBe(true)
    expect(guest.getState().players[0].plants.some(p => p.id === cheap.id)).toBe(true)
    // turn passed to the guest's seat, mirrored on both sides
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) passes the auction; the intent travels host-ward and applies.
    // Both seats are now done with the auction, so the round advances to the resources phase.
    expect(host.getFull().phase).toBe('auction')
    guest.dispatch({ kind: 'passAuction' })
    expect(host.getFull().phase).toBe('resources')
    // the guest's view mirrors the host's authoritative phase
    expect(guest.getState().phase).toBe('resources')
  })
})

describe('power_grid redaction (hidden money + face-down deck)', () => {
  it('the guest sees its own cash but never another seat\'s money or the deck order', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession(A, b)

    const full = host.getFull()   // real state: both players start with 50 Elektro
    const view = guest.getState() // what crossed the wire to the guest (seat 1)

    // the guest sees its OWN money intact...
    expect(view.players[1].money).toBe(full.players[1].money)
    expect(view.players[1].money).toBeGreaterThan(0)
    // ...but the host's (seat 0) money is blanked to -1
    expect(view.players[0].money).toBe(-1)
    expect(full.players[0].money).toBeGreaterThan(0)
    expect(view.players[0].money).not.toBe(full.players[0].money)

    // the face-down deck is anonymized: same length, no real ids/costs/fuel survive
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.length).toBeGreaterThan(0)
    expect(view.deck.every(p => p.id === -1)).toBe(true)
    const realIds = new Set(full.deck.map(p => p.id))
    expect(view.deck.some(p => realIds.has(p.id))).toBe(false)

    // public info is preserved so the UI still works
    expect(view.market.map(p => p.id)).toEqual(full.market.map(p => p.id))
    expect(view.supply).toEqual(full.supply)

    // none of the other seat's secret state leaks: the host's money never appears on its
    // redacted player record (only -1), even after a few transitions advance the game.
    host.dispatchLocal({ kind: 'passAuction' })
    expect(guest.getState().players[0].money).toBe(-1)
  })
})

// reference the intent type so unused-import lint stays clean
const _exampleIntent: PowerGridIntent = { kind: 'passAuction' }
void _exampleIntent
