/* SPADES — netplay tests. Adapter round-trip (bid + play, illegal + out-of-turn),
 * a real host/guest integration over an in-memory transport, plus a hidden-info LEAK
 * test proving a guest's view never carries another seat's private hand cards. */

import { describe, it, expect } from 'vitest'
import { spadesAdapter as A, type SpadesIntent } from './net'
import * as SP from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game: ordered deck + fixed dealer so the deal is reproducible.
 *  dealer = 3 → first to act is seat 0 (left of dealer). */
function game() { return SP.makeGame(SP.orderedDeck(), 3) }

describe('spades net adapter', () => {
  it('starts with seat 0 to move on a 4-seat game in the bidding phase', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(4)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
    expect(s.phase).toBe('bidding')
  })

  it('round-trips a legal bid and passes the turn to seat 1', () => {
    const s = game()
    const s2 = A.applyIntent(s, 0, { kind: 'bid', n: 3 })
    expect(s2).not.toBe(s)
    expect(s2.bids[0]).toBe(3)
    expect(s2.turn).toBe(1)
    expect(A.seatToMove(s2)).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('round-trips a legal play once bidding is complete', () => {
    // Drive all four bids so we reach the playing phase.
    let s = game()
    for (let seat = 0; seat < 4; seat++) s = A.applyIntent(s, seat, { kind: 'bid', n: 3 })
    expect(s.phase).toBe('playing')
    const mover = s.turn
    const legal = SP.legalPlays(s, mover)
    const s2 = A.applyIntent(s, mover, { kind: 'play', cardId: legal[0].id })
    expect(s2).not.toBe(s)
    expect(s2.trick.length).toBe(1)
    expect(A.tickKey(s2)).not.toBe(A.tickKey(s))
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    // seat 1 tries to bid while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'bid', n: 2 })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a bid out of range
    expect(A.applyIntent(s, 0, { kind: 'bid', n: 14 })).toBe(s)
    expect(A.applyIntent(s, 0, { kind: 'bid', n: -1 })).toBe(s)
    // a play intent during the bidding phase is illegal
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: s.hands[0][0].id })).toBe(s)
    // a card the seat does not hold
    let p = game()
    for (let seat = 0; seat < 4; seat++) p = A.applyIntent(p, seat, { kind: 'bid', n: 3 })
    expect(A.applyIntent(p, p.turn, { kind: 'play', cardId: 99999 })).toBe(p)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('spades host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest', 'ai', 'ai'])
    expect(guest.getState().hands.length).toBe(4)
  })

  it('relays the host bid, then a guest bid, staying in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true) // seat 0 bids first
    host.dispatchLocal({ kind: 'bid', n: 4 } as SpadesIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's (guest's) turn

    const beforePly = host.getFull().ply
    guest.dispatch({ kind: 'bid', n: 2 } as SpadesIntent)
    expect(host.getFull().ply).toBe(beforePly + 1)
    expect(host.getFull().bids[1]).toBe(2)
    expect(host.getFull().turn).toBe(2) // moved on to seat 2
    // guest's view reflects the host's authoritative state
    expect(guest.getState().ply).toBe(host.getFull().ply)
    expect(guest.getState().bids[0]).toBe(4) // public bid info synced
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().ply
    // it is the host's (seat 0) turn, but the guest tries to bid
    guest.dispatch({ kind: 'bid', n: 5 } as SpadesIntent)
    expect(host.getFull().ply).toBe(before) // nothing changed
  })
})

describe('spades hidden-info redaction (leak test)', () => {
  it("the guest's view never carries another seat's hand cards (counts kept)", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.hands[1]).toEqual(full.hands[1])
    // ...but every other seat's hand is blanked to placeholders, with the COUNT kept.
    for (const other of [0, 2, 3]) {
      expect(view.hands[other].length).toBe(full.hands[other].length)
      expect(view.hands[other].every(c => c.id === -1 && c.rank === 0)).toBe(true)
    }

    // None of the other seats' secret card ids may appear anywhere in the wire view.
    const wire = JSON.stringify(view)
    for (const other of [0, 2, 3]) {
      for (const c of full.hands[other]) {
        expect(wire).not.toContain(`"id":${c.id}`)
      }
    }
  })
})
