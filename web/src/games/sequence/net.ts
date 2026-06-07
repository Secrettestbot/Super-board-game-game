/* SEQUENCE — netplay adapter. Maps sequence's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. 2 seats: 0 = the original human side, 1 = the rival
 * (matches logic's Player 0/1).
 *
 * HIDDEN INFO: each seat's HAND of cards is private, and the face-down draw DECK is secret.
 * The board layout, placed chips, locked cells and completed sequences are all PUBLIC.
 * redactFor replaces every OTHER seat's hand cards with a hidden placeholder and blanks the
 * whole deck (both keep their counts so the UI can render the right number of card backs / a
 * deck size). A leak test guards this — a guest must never receive the opponent's hand cards
 * nor any deck card.
 *
 * INTENT: { kind:'play', cardId, cell } — play the hand card identified by cardId (its
 * rank+suit key, e.g. "10H" / "JC") to place/remove a chip on `cell`; the logic then draws.
 * Two-eyed jacks are wild (place on any empty cell), one-eyed jacks remove an opponent chip.
 * applyIntent validates against legalCellsForCard and returns the input state unchanged for
 * any illegal / out-of-turn intent (never throws).
 */

import * as S from './logic'
import type { SeqState, Card, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Intent: play the hand card whose rank+suit key is `cardId` onto board `cell`. */
export interface SequenceIntent { kind: 'play'; cardId: string; cell: number }

/** A placeholder card standing in for a hidden card (opponent hand / deck). */
const HIDDEN_CARD: Card = { rank: '2', suit: 'C' }

export const sequenceAdapter: GameAdapter<SeqState, SequenceIntent> = {
  makeGame: () => S.makeGame(),
  // Read the real player count off the hands array (always 2 here) rather than hardcoding.
  numSeats: s => s.hands.length,
  seatToMove: s => (s.winner == null && !s.draw ? s.turn : null), // turn 0/1 == seat
  isOver: s => s.winner != null || s.draw,

  applyIntent: (s, seat, intent) => {
    if (s.winner != null || s.draw) return s
    if (s.turn !== seat) return s
    if (intent == null || intent.kind !== 'play') return s
    // Resolve the card from the acting seat's OWN hand by its rank+suit key. Never trust a
    // guest-supplied card object; only a card actually in hand can be played.
    const card = s.hands[seat as Player].find(c => S.cardKey(c) === intent.cardId)
    if (!card) return s
    // Validate the target cell against the legal set for this card+seat.
    const legal = S.legalCellsForCard(s, card, seat as Player)
    if (!legal.includes(intent.cell)) return s
    // One-eyed jacks remove; everything else places. Both draw + end the turn in logic.
    return S.isOneEyedJack(card)
      ? S.removeChip(s, seat as Player, card, intent.cell)
      : S.play(s, seat as Player, card, intent.cell)
  },

  aiStep: s => S.aiTurn(s),

  // Changes on EVERY transition: `step` is bumped by every placement/removal/swap, `turn`
  // flips each turn, and last/winner/draw cover terminal transitions.
  tickKey: s => `${s.step}-${s.turn}-${s.last ?? 'x'}-${s.winner ?? ''}-${s.draw}`,

  // Hidden info: blank every OTHER seat's hand to placeholders (keep counts so the UI can
  // render card backs), and blank the entire face-down deck to placeholders (keep its count
  // so the UI can still show the deck size). The board, chips, locks and sequences stay.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN_CARD })))) as [Card[], Card[]],
    deck: s.deck.map(() => ({ ...HIDDEN_CARD })),
  }),
}
