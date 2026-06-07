/* CRIBBAGE — netplay adapter. Maps cribbage's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Two seats: 0 = you (the original human side), 1 = ai.
 *
 * HIDDEN INFO: each player's HAND is private; the CRIB is face-down until the show; the
 * STARTER is the cut card (public once cut) and the undealt DECK is face-down. redactFor
 * therefore blanks the OTHER seat's hand (both the live `hands` and the kept `full`), blanks
 * the crib until the show/done phase reveals it, and blanks the undealt deck. The play pile,
 * scores, starter and log are public. A leak test guards this.
 *
 * A hand has three action shapes, all routed through one intent union:
 *   - discard: { kind:'toCrib', cardIds:[id,id] } — two of your six cards go to the crib.
 *   - the play (pegging): { kind:'peg', cardId } to play a card, or { kind:'go' } when you
 *     hold no legal card and must pass.
 *   - the show: { kind:'next' } advances to the next hand (the count-advance).
 * Cards are identified by a stable id (`r*10+suitIndex`) rather than a hand index, so a
 * redacted view (where the opponent's indices are meaningless) can never be exploited and the
 * host always re-resolves the id against the seat's live hand before trusting it. */

import * as C from './logic'
import type { Card, CribbageState, Side, Suit } from './logic'
import type { GameAdapter } from '../../net/protocol'

const SIDES: Side[] = ['you', 'ai']
const SUITS: Suit[] = ['S', 'H', 'D', 'C']

/** seat 0 -> 'you', seat 1 -> 'ai'. */
const sideOf = (seat: number): Side => SIDES[seat] ?? 'you'

/** A stable, position-independent id for a card (rank 1..13, suit 0..3). */
export const cardId = (c: Card): number => c.r * 10 + SUITS.indexOf(c.s)

/** Discard two cards (by id) to the crib. */
export interface ToCribIntent { kind: 'toCrib'; cardIds: number[] }
/** Play a single card (by id) onto the pegging pile. */
export interface PegIntent { kind: 'peg'; cardId: number }
/** Declare "go" — you hold no legal card this count. */
export interface GoIntent { kind: 'go' }
/** Advance the show to the next hand. */
export interface NextIntent { kind: 'next' }
export type CribbageIntent = ToCribIntent | PegIntent | GoIntent | NextIntent

/** A face-down placeholder card hidden from a seat that may not see it. */
const HIDDEN: Card = { r: 0, s: 'S' }
const hide = (cards: Card[]): Card[] => cards.map(() => ({ ...HIDDEN }))

/** Seat whose action is owed right now, or null when the game is over. */
function seatToMove(s: CribbageState): number | null {
  if (s.winner != null || s.phase === 'done') return null
  if (s.phase === 'discard') {
    if (s.full.you.length === 0) return 0
    if (s.full.ai.length === 0) return 1
    return null
  }
  if (s.phase === 'play') return s.turn === 'you' ? 0 : 1
  // show: the human side (seat 0) advances to the next hand, matching solo play.
  if (s.phase === 'show') return 0
  return null
}

export const cribbageAdapter: GameAdapter<CribbageState, CribbageIntent> = {
  makeGame: () => C.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner != null) return s
    if (seatToMove(s) !== seat) return s
    const side = sideOf(seat)

    if (intent.kind === 'toCrib') {
      if (s.phase !== 'discard' || s.full[side].length > 0) return s
      const ids = intent.cardIds
      if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) return s
      const hand = s.hands[side]
      const a = hand.findIndex(c => cardId(c) === ids[0])
      const b = hand.findIndex(c => cardId(c) === ids[1])
      if (a < 0 || b < 0 || a === b) return s
      return C.discardToCrib(s, side, [a, b])
    }

    if (intent.kind === 'peg') {
      if (s.phase !== 'play' || s.turn !== side) return s
      const idx = s.hands[side].findIndex(c => cardId(c) === intent.cardId)
      if (idx < 0) return s
      const card = s.hands[side][idx]
      if (s.count + C.pipValue(card.r) > 31) return s // would bust 31
      return C.playCard(s, side, idx)
    }

    if (intent.kind === 'go') {
      if (s.phase !== 'play' || s.turn !== side) return s
      if (C.canPlay(s, side)) return s // a legal card exists -> not a real "go"
      return C.passGo(s, side)
    }

    if (intent.kind === 'next') {
      if (s.phase !== 'show') return s
      return C.nextHand(s)
    }

    return s
  },

  // Drive whichever AI seat is owed an action: discard, a pegging card or forced go, or
  // (only if an AI ever holds seat 0) advance the show.
  aiStep: (s, seat) => {
    if (s.winner != null) return s
    const side = sideOf(seat)
    if (s.phase === 'discard') {
      if (s.full[side].length > 0) return s
      return C.discardToCrib(s, side, C.aiDiscard(s, side))
    }
    if (s.phase === 'play' && s.turn === side) {
      const idx = C.aiPlay(s, side)
      return idx < 0 ? C.passGo(s, side) : C.playCard(s, side, idx)
    }
    if (s.phase === 'show') return C.nextHand(s)
    return s
  },

  // ply increments on every engine action, so this changes on EVERY transition.
  tickKey: s => `${s.ply}-${s.phase}-${s.turn}-${s.winner ?? ''}`,

  // Hidden info: blank the OTHER seat's hand (live + kept), the crib until the show reveals
  // it, and the undealt deck. Starter, play pile, scores and log are public.
  redactFor: (s, seat) => {
    const me = sideOf(seat)
    const opp = C.other(me)
    const cribRevealed = s.phase === 'show' || s.phase === 'done' || s.winner != null
    return Object.assign({}, s, {
      hands: Object.assign({}, s.hands, { [opp]: hide(s.hands[opp]) }),
      full: Object.assign({}, s.full, { [opp]: hide(s.full[opp]) }),
      crib: cribRevealed ? s.crib : hide(s.crib),
      deck: hide(s.deck),
    })
  },
}
