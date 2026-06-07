/* JAIPUR — netplay tests. Adapter round-trip + a real host/guest integration over an
 * in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries
 * the other seat's private hand cards (or the face-down deck order). */

import { describe, it, expect } from 'vitest'
import { jaipurAdapter as A, type JaipurIntent } from './net'
import * as JP from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** The market always starts with at least one goods card (makeGame draws 2 goods). */
function firstGoodIndex(s: JP.JaipurState): number {
  return s.market.findIndex(c => c !== 'camel')
}

describe('jaipur net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal take and passes the turn to seat 1', () => {
    const s = A.makeGame()
    const i = firstGoodIndex(s)
    expect(i).toBeGreaterThanOrEqual(0)
    const s2 = A.applyIntent(s, 0, { kind: 'take', i })
    expect(s2).not.toBe(s)
    expect(s2.turn).toBe('foe')
    expect(A.seatToMove(s2)).toBe(1)
    expect(JP.handCount(s2, 'you')).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s)) // tickKey changed (log grew)
  })

  it('round-trips takeCamels (market starts with 3 camels)', () => {
    const s = A.makeGame()
    expect(JP.marketCamels(s)).toBeGreaterThan(0)
    const s2 = A.applyIntent(s, 0, { kind: 'takeCamels' })
    expect(s2).not.toBe(s)
    expect(s2.herd.you).toBe(JP.marketCamels(s))
    expect(s2.turn).toBe('foe')
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = A.makeGame()
    const i = firstGoodIndex(s)
    // seat 1 ('foe') tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'take', i })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = A.makeGame()
    // taking a camel slot via 'take' is illegal (camels need takeCamels)
    const camelIdx = s.market.findIndex(c => c === 'camel')
    expect(camelIdx).toBeGreaterThanOrEqual(0)
    expect(A.applyIntent(s, 0, { kind: 'take', i: camelIdx })).toBe(s)
    // out-of-range market index
    expect(A.applyIntent(s, 0, { kind: 'take', i: 99 })).toBe(s)
    // selling a good not held
    expect(A.applyIntent(s, 0, { kind: 'sell', good: 'diamond', n: 2 })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('jaipur host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().market.length).toBe(JP.MARKET_SIZE)
  })

  it('relays the host move, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    // host (seat 0) takes all camels first
    host.dispatchLocal({ kind: 'takeCamels' } as JaipurIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest (seat 1) replies; intent travels host-ward and applies
    const before = host.getFull().log.length
    const gi = guest.getState().market.findIndex(c => c !== 'camel')
    expect(gi).toBeGreaterThanOrEqual(0)
    guest.dispatch({ kind: 'take', i: gi } as JaipurIntent)
    expect(host.getFull().log.length).toBe(before + 1)
    expect(host.getFull().turn).toBe('you') // back to the host
    expect(host.isMyTurn()).toBe(true)
    expect(JP.handCount(host.getFull(), 'foe')).toBe(1) // the guest's take landed
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().log.length
    // it is the host's (seat 0) turn, but the guest tries to take
    const gi = guest.getState().market.findIndex(c => c !== 'camel')
    guest.dispatch({ kind: 'take', i: gi } as JaipurIntent)
    expect(host.getFull().log.length).toBe(before) // nothing changed
  })
})

describe('jaipur hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the other seat's hand cards or the deck order", () => {
    // Build up some private hands first: host takes a good, guest takes a good.
    const { host, guest } = connect()
    const hi = host.getFull().market.findIndex(c => c !== 'camel')
    host.dispatchLocal({ kind: 'take', i: hi } as JaipurIntent)
    const gi = guest.getState().market.findIndex(c => c !== 'camel')
    guest.dispatch({ kind: 'take', i: gi } as JaipurIntent)

    const full = host.getFull()
    const view = guest.getState() // guest is seat 1 ('foe')

    // The guest sees its OWN real hand intact...
    expect(view.hand.foe).toEqual(full.hand.foe)
    // ...but seat 0's ('you') hand is blanked to placeholders of the same length.
    expect(view.hand.you.length).toBe(full.hand.you.length)
    expect(view.hand.you.every(c => c === 'camel')).toBe(true)
    // ...and the face-down deck is fully blanked (length preserved, order gone).
    expect(view.deck.length).toBe(full.deck.length)
    expect(view.deck.every(c => c === 'camel')).toBe(true)

    // None of seat 0's real goods cards may appear in the wire view's hand[you] region.
    const realGood = full.hand.you.find(c => c !== 'camel')
    if (realGood) expect(view.hand.you).not.toContain(realGood)

    // Public info stays intact: market, herds, tokens, scores.
    expect(view.market).toEqual(full.market)
    expect(view.herd).toEqual(full.herd)
    expect(view.tokens).toEqual(full.tokens)
  })
})
