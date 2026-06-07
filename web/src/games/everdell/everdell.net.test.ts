/* EVERDELL — netplay tests. Adapter round-trip + a real host/guest integration over an
 * in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries
 * the other seat's private hand cards (or the face-down deck order). */

import { describe, it, expect } from 'vitest'
import { everdellAdapter as A, type EverdellIntent } from './net'
import * as EV from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game so every assertion is reproducible. */
function game() { return EV.makeGame(42) }

describe('everdell net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal place-worker intent and passes the turn to seat 1', () => {
    const s = game()
    const s2 = A.applyIntent(s, 0, { kind: 'place', loc: 'twigs' })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    // the worker landed and twigs were gained (Twig Grove = +3 twig)
    expect(s2.occ.twigs).toContain(0)
    expect(s2.players[0].res.twig).toBe(s.players[0].res.twig + 3)
    expect(s2.players[0].workersUsed).toBe(s.players[0].workersUsed + 1)
    // tickKey changed (log grew, turn flipped)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('applies a legal play-card intent from hand', () => {
    const s = game()
    // find an affordable hand card for seat 0
    const cardId = s.players[0].hand.find(id => EV.canPlayCard(s, 0, id, false))
    expect(cardId).toBeDefined()
    const s2 = A.applyIntent(s, 0, { kind: 'play', cardId: cardId!, fromMeadow: false })
    expect(s2).not.toBe(s)
    expect(s2.players[0].city).toContain(cardId)
    expect(s2.turn).toBe(1)
  })

  it('applies a prepare intent (advances the season)', () => {
    const s = game()
    const s2 = A.applyIntent(s, 0, { kind: 'prepare' })
    expect(s2).not.toBe(s)
    expect(s2.players[0].season).toBe('spring')
    expect(s2.turn).toBe(1)
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'place', loc: 'twigs' })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a card not in seat 0's hand cannot be played from hand
    const notInHand = EV.CARDS.map(c => c.id).find(id => !s.players[0].hand.includes(id))
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: notInHand!, fromMeadow: false })).toBe(s)
    // a card not in the meadow cannot be played from the meadow
    const notInMeadow = EV.CARDS.map(c => c.id).find(id => !s.meadow.includes(id))
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: notInMeadow!, fromMeadow: true })).toBe(s)
    // a full single-slot location rejects a second worker
    const s1 = A.applyIntent(s, 0, { kind: 'place', loc: 'pebble' }) // seat 0 fills the 1 slot
    const s2 = A.applyIntent(s1, 1, { kind: 'place', loc: 'pebble' }) // seat 1 can't
    expect(s2).toBe(s1)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('everdell host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().meadow.length).toBe(host.getFull().meadow.length)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) places first
    host.dispatchLocal({ kind: 'place', loc: 'twigs' } as EverdellIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const beforeLog = host.getFull().log.length
    guest.dispatch({ kind: 'place', loc: 'resins' } as EverdellIntent)
    expect(host.getFull().log.length).toBe(beforeLog + 1)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    expect(host.getFull().occ.resins).toContain(1)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().log.length
    // it is the host's (seat 0) turn, but the guest tries to place
    guest.dispatch({ kind: 'place', loc: 'twigs' } as EverdellIntent)
    expect(host.getFull().log.length).toBe(before) // nothing changed
  })
})

describe('everdell hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the other seat's hand cards or the deck order", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.players[1].hand).toEqual(full.players[1].hand)
    // ...but seat 0's hand is blanked to placeholders, count preserved.
    expect(view.players[0].hand.length).toBe(full.players[0].hand.length)
    expect(view.players[0].hand.every(c => c === '?')).toBe(true)
    // ...and the face-down deck is fully blanked, length preserved.
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(c => c === '?')).toBe(true)

    // The blanked hand must not echo any of seat 0's real card ids positionally.
    const hostHand = full.players[0].hand
    for (const id of hostHand) expect(view.players[0].hand).not.toContain(id)
    expect(JSON.stringify(view.players[0].hand)).not.toBe(JSON.stringify(hostHand))

    // The public meadow and both cities are unchanged (face-up info both players share).
    expect(view.meadow).toEqual(full.meadow)
    expect(view.players[0].city).toEqual(full.players[0].city)
    expect(view.players[1].city).toEqual(full.players[1].city)
    // Resources / workers / seasons are public too.
    expect(view.players[0].res).toEqual(full.players[0].res)
  })
})
