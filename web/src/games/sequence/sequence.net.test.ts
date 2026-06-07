/* SEQUENCE — netplay tests. Three parts:
 *  1) adapter round-trip: a legal seat-0 play advances the state; out-of-turn and illegal
 *     intents return the input state unchanged (===).
 *  2) host + guest sync over an in-memory transport: host plays, the guest sees its turn and
 *     the advanced view; the guest replies and the host's authoritative state advances.
 *  3) leak test: the guest (seat 1) never receives the host's hand cards nor any deck card —
 *     only its own hand, the public board/chips, and counts. */

import { describe, it, expect } from 'vitest'
import { sequenceAdapter as A, type SequenceIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'
import * as S from './logic'
import type { Card, SeqState } from './logic'

/** A fully-ordered 104-card draw pile with two known, distinctive hands up top, so tests are
 *  deterministic and we know exactly which secret cards must NOT leak to the guest. makeGame
 *  deals 7 cards each, alternating: hand0 gets indices 0,2,4,…; hand1 gets 1,3,5,…. */
function riggedDeck(): { deck: Card[]; hand0: Card[]; hand1: Card[] } {
  // Pick 14 distinct, non-jack cards (so each maps to two empty board cells = always legal).
  const picks: Card[] = [
    { rank: '2', suit: 'D' }, { rank: '3', suit: 'D' }, // -> deal[0]=h0, deal[1]=h1
    { rank: '4', suit: 'D' }, { rank: '5', suit: 'D' },
    { rank: '6', suit: 'D' }, { rank: '7', suit: 'D' },
    { rank: '8', suit: 'D' }, { rank: '9', suit: 'D' },
    { rank: '10', suit: 'D' }, { rank: 'Q', suit: 'D' },
    { rank: 'K', suit: 'D' }, { rank: 'A', suit: 'D' },
    { rank: '2', suit: 'H' }, { rank: '3', suit: 'H' },
  ]
  const hand0: Card[] = []
  const hand1: Card[] = []
  for (let k = 0; k < 7; k++) { hand0.push(picks[2 * k]); hand1.push(picks[2 * k + 1]) }
  // Remaining deck (after the 14 dealt) holds further distinctive secret cards.
  const tail: Card[] = [
    { rank: '4', suit: 'H' }, { rank: '5', suit: 'H' }, { rank: '6', suit: 'H' },
    { rank: '7', suit: 'S' }, { rank: '8', suit: 'S' }, { rank: '9', suit: 'S' },
  ]
  return { deck: picks.concat(tail), hand0, hand1 }
}

function freshGame(): SeqState {
  return S.makeGame(riggedDeck().deck)
}

/** The first legal {card, cell} for the seat to move, as a play intent. */
function firstLegalIntent(s: SeqState, seat: 0 | 1): SequenceIntent {
  for (const card of s.hands[seat]) {
    const cells = S.legalCellsForCard(s, card, seat)
    if (cells.length > 0) return { kind: 'play', cardId: S.cardKey(card), cell: cells[0] }
  }
  throw new Error('no legal move for seat ' + seat)
}

describe('sequence net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = freshGame()
    expect(A.seatToMove(s)).toBe(0)
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)

    // legal seat-0 play -> state changes, a chip lands, turn passes to seat 1
    const intent = firstLegalIntent(s, 0)
    const s2 = A.applyIntent(s, 0, intent)
    expect(s2).not.toBe(s)
    expect(s2.chips[intent.cell]).toBe(0)
    expect(A.seatToMove(s2)).toBe(1)

    // out-of-turn: seat 1 tries to act while it's seat 0's turn -> unchanged (===)
    const oot = firstLegalIntent(s, 1)
    expect(A.applyIntent(s, 1, oot)).toBe(s)

    // illegal card: a card not in seat 0's hand -> unchanged (===)
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: 'KS', cell: 12 })).toBe(s)

    // illegal cell: a real hand card aimed at a non-matching / occupied cell -> unchanged
    const myCard = s.hands[0][0]
    const badCell = S.legalCellsForCard(s, myCard, 0)[0] === 0 ? 99 : 0
    expect(A.applyIntent(s, 0, { kind: 'play', cardId: S.cardKey(myCard), cell: badCell })).toBe(s)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    // Rig the host's deck so moves are deterministic.
    const host = new HostSession<SeqState, SequenceIntent>({ ...A, makeGame: () => freshGame() })
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession<SeqState, SequenceIntent>({ ...A, makeGame: () => freshGame() }, b)

    expect(guest.mySeat()).toBe(1)
    expect(host.getSeats().map(x => x.kind)).toEqual(['host', 'guest'])

    // host (seat 0) plays a legal move
    const i0 = firstLegalIntent(host.getFull(), 0)
    host.dispatchLocal(i0)
    expect(host.getFull().chips[i0.cell]).toBe(0)
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true) // now seat 1's (guest's) turn, view synced

    // guest (seat 1) replies; the intent travels host-ward and applies
    const i1 = firstLegalIntent(guest.getState(), 1)
    guest.dispatch(i1)
    expect(host.getFull().chips[i1.cell]).toBe(1)
    expect(host.getFull().turn).toBe(0) // back to seat 0
    expect(host.isMyTurn()).toBe(true)
    expect(guest.getState().turn).toBe(0)
  })

  it('round-trips the adapter view (redactFor) without altering public data', () => {
    const s = freshGame()
    const view = A.redactFor!(s, 1)
    // public board data is untouched
    expect(view.chips).toEqual(s.chips)
    expect(view.layout).toEqual(s.layout)
    expect(view.sequences).toEqual(s.sequences)
    // counts preserved
    expect(view.hands[0].length).toBe(s.hands[0].length)
    expect(view.hands[1].length).toBe(s.hands[1].length)
    expect(view.deck.length).toBe(s.deck.length)
    // seat 1 keeps its own real hand
    expect(view.hands[1]).toEqual(s.hands[1])
  })

  it('leak test: the guest never sees the host hand or the deck', () => {
    const rig = riggedDeck()
    const host = new HostSession<SeqState, SequenceIntent>({ ...A, makeGame: () => freshGame() })
    const [a, b] = memoryPair(); host.addGuest(a)
    const guest = new GuestSession<SeqState, SequenceIntent>({ ...A, makeGame: () => freshGame() }, b)

    const view = guest.getState()
    // The board LAYOUT is public and shows every card value, so we must scope the leak
    // check to the PRIVATE regions only: the opponent's hand and the face-down deck. Those
    // are exactly what a malicious guest could mine, and they must carry no real card.
    const secretRegions = JSON.stringify({ oppHand: view.hands[0], deck: view.deck })

    // The host's (seat 0) secret hand cards must NOT appear in the private regions.
    for (const c of rig.hand0) {
      // none of our rigged host cards are the placeholder ('2C'), so each is a genuine
      // secret that must be gone from the redacted hand/deck.
      expect(secretRegions).not.toContain(`"rank":"${c.rank}","suit":"${c.suit}"`)
    }
    // The deck's remaining secret cards must NOT appear either.
    for (const c of rig.deck.slice(14)) {
      expect(secretRegions).not.toContain(`"rank":"${c.rank}","suit":"${c.suit}"`)
    }
    // Every card in the redacted opponent hand / deck is the hidden placeholder, nothing real.
    for (const c of [...view.hands[0], ...view.deck]) {
      expect(c).toEqual({ rank: '2', suit: 'C' })
    }
    // Sanity: the guest DOES still hold its own (seat 1) real hand.
    expect(view.hands[1]).toEqual(rig.hand1)
    // Counts are still intact so the UI can render backs / deck size.
    expect(view.hands[0].length).toBe(7)
    expect(view.deck.length).toBe(rig.deck.length - 14)
  })
})
