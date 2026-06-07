/* STAR REALMS — netplay tests. Adapter round-trip + a real host/guest integration over an
   in-memory transport, plus a hidden-info LEAK test proving the guest's view never carries the
   opponent's private hand cards or either player's face-down draw deck (only counts cross). */

import { describe, it, expect } from 'vitest'
import { starRealmsAdapter as A, type StarRealmsIntent } from './net'
import * as SR from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

/** A deterministic game so every assertion is reproducible. */
function game() { return SR.makeGame(7) }

describe('star_realms net adapter', () => {
  it('starts with seat 0 to move on a 2-seat game', () => {
    const s = game()
    expect(A.numSeats(s)).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('applies a legal play, then end turn passes the turn to seat 1', () => {
    const s = game()
    const cardId = s.players[0].hand[0].id
    const beforeTick = A.tickKey(s)
    // NOTE: star_realms' logic mutates in place and returns the same ref, so we assert the
    // *effects* of a legal intent rather than reference inequality.
    const s2 = A.applyIntent(s, 0, { kind: 'play', cardId })
    expect(s2.players[0].hand.some(c => c.id === cardId)).toBe(false) // left the hand
    expect(A.seatToMove(s2)).toBe(0) // still seat 0's turn (multi-action turn)
    expect(A.tickKey(s2)).not.toBe(beforeTick) // every action bumps the tick

    const beforeEndTick = A.tickKey(s2)
    const s3 = A.applyIntent(s2, 0, { kind: 'endTurn' })
    expect(A.seatToMove(s3)).toBe(1)
    expect(A.tickKey(s3)).not.toBe(beforeEndTick)
  })

  it('ignores an out-of-turn intent (returns the same ref)', () => {
    const s = game()
    const cardId = s.players[1].hand[0]?.id ?? 0
    // seat 1 tries to act while it is seat 0's turn
    expect(A.applyIntent(s, 1, { kind: 'play', cardId })).toBe(s)
    expect(A.applyIntent(s, 1, { kind: 'endTurn' })).toBe(s)
  })

  it('ignores illegal intents (returns the same ref)', () => {
    const s = game()
    // a card id that is not in this seat's hand
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 999999 })).toBe(s)
    // buying a card id that is not face-up in the trade row
    expect(A.applyIntent(s, 0, { kind: 'buy', cardId: 999999 })).toBe(s)
    // attacking face with zero combat in pool (turn just started)
    expect(s.combat).toBe(0)
    expect(A.applyIntent(s, 0, { kind: 'attack', target: 'face' })).toBe(s)
    // attacking a base that does not exist
    expect(A.applyIntent(s, 0, { kind: 'attack', target: 424242 })).toBe(s)
  })

  it('rejects a buy the seat cannot afford (returns the same ref)', () => {
    const s = game()
    // no trade pooled yet, so any real trade-row card is unaffordable
    const c = s.tradeRow.find(x => x != null)!
    expect(s.trade).toBe(0)
    expect(A.applyIntent(s, 0, { kind: 'buy', cardId: c.id })).toBe(s)
    // explorer (cost 2) is also unaffordable with 0 trade
    expect(A.applyIntent(s, 0, { kind: 'buy', cardId: 'explorer' })).toBe(s)
  })
})

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

describe('star_realms host + guest over an in-memory transport', () => {
  it('assigns the guest seat 1 and syncs the initial view', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])
    expect(guest.getState().tradeRow.length).toBe(SR.TRADE_ROW_SIZE)
  })

  it('relays the host turn, then a guest reply, staying in sync', () => {
    const { host, guest } = connect()
    expect(host.isMyTurn()).toBe(true)
    expect(guest.isMyTurn()).toBe(false)

    // host (seat 0) plays its whole hand, then ends the turn
    host.dispatchLocal({ kind: 'playAll' } as StarRealmsIntent)
    host.dispatchLocal({ kind: 'endTurn' } as StarRealmsIntent)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's turn, view synced
    expect(guest.getState().turn).toBe(1)

    // guest (seat 1) replies; intents travel host-ward and apply
    guest.dispatch({ kind: 'playAll' } as StarRealmsIntent)
    guest.dispatch({ kind: 'endTurn' } as StarRealmsIntent)
    expect(host.getFull().turn).toBe(0) // back to the host
    expect(host.isMyTurn()).toBe(true)
    // guest's view reflects the host's authoritative state
    expect(guest.getState().turn).toBe(host.getFull().turn)
  })

  it('rejects an out-of-turn guest intent (host stays authoritative)', () => {
    const { host, guest } = connect()
    const before = host.getFull().actions
    // it is the host's (seat 0) turn, but the guest tries to act
    guest.dispatch({ kind: 'playAll' } as StarRealmsIntent)
    expect(host.getFull().actions).toBe(before) // nothing changed
  })
})

describe('star_realms hidden-info redaction (leak test)', () => {
  it("the guest's view never carries the opponent's hand or either draw deck", () => {
    const { host, guest } = connect()
    const full = host.getFull()
    const view = guest.getState() // guest is seat 1

    // The guest sees its OWN real hand intact...
    expect(view.players[1].hand).toEqual(full.players[1].hand)
    // ...but the host's (seat 0) hand is blanked to placeholders, count preserved.
    expect(view.players[0].hand.length).toBe(full.players[0].hand.length)
    expect(view.players[0].hand.every(c => c.key === 'hidden' && c.id === -1)).toBe(true)

    // BOTH players' face-down draw decks are blanked, counts preserved.
    for (const seat of [0, 1] as const) {
      expect(view.players[seat].deck.length).toBe(full.players[seat].deck.length)
      expect(view.players[seat].deck.every(c => c.key === 'hidden' && c.id === -1)).toBe(true)
    }
    // The shared face-down trade deck is blanked too, count preserved.
    expect(view.tradeDeck.length).toBe(full.tradeDeck.length)
    expect(view.tradeDeck.every(c => c.key === 'hidden' && c.id === -1)).toBe(true)

    // Public info is untouched: trade row, discards, bases, authority, explorer count.
    expect(view.tradeRow).toEqual(full.tradeRow)
    expect(view.players[0].discard).toEqual(full.players[0].discard)
    expect(view.explorerCount).toBe(full.explorerCount)

    // Nothing in the wire view leaks an opponent hand/deck card's real id. We test against
    // the set of ids actually present in the wire (delimiter-safe, no substring false hits
    // like "id":4 matching "id":42), since the public discard/trade row legitimately carry ids.
    const wire = JSON.stringify(view)
    const presentIds = new Set([...wire.matchAll(/"id":(-?\d+)/g)].map(m => Number(m[1])))
    for (const c of [...full.players[0].hand, ...full.players[0].deck]) {
      expect(presentIds.has(c.id)).toBe(false)
    }
  })
})
