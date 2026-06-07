/* SPADES — netplay adapter. Maps spades's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. 4 players in 2 partnerships; seats 0..3 around the
 * table map directly to the game's seat indices (turn == seat). numSeats reads the real
 * count off the state's hands array.
 *
 * HIDDEN INFO: each seat's HAND of cards is private — only that seat may see its own
 * cards. redactFor therefore blanks every OTHER seat's hand cards (keeping the COUNT so
 * the UI can still draw card backs) before a view crosses the wire. Everything else —
 * the played trick, bids, tricks won, scores, bags, the last completed trick, the hand
 * log — is public table information and stays intact. A leak test guards this.
 *
 * Two intent kinds: { kind:'bid', n } during bidding and { kind:'play', cardId } during
 * the trick phase. applyIntent validates each against the game's legal bids / legalPlays
 * for that seat (never trusting a guest), returning the input state unchanged for any
 * illegal or out-of-turn intent. */

import * as SP from './logic'
import type { SpadesState, Card, Seat } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: a bid count, or the id of a card to play. */
export type SpadesIntent =
  | { kind: 'bid'; n: number }
  | { kind: 'play'; cardId: number }

/** A neutral placeholder hiding a card's real suit/rank from other seats (count kept). */
const HIDDEN: Card = { id: -1, suit: 'C', rank: 0 }

export const spadesAdapter: GameAdapter<SpadesState, SpadesIntent> = {
  makeGame: () => SP.makeGame(),
  // Real seat count off the state (min 2) so the seat table is correct.
  numSeats: s => Math.max(2, s.hands.length),
  // turn index == seat index; null once the game is over.
  seatToMove: s => (s.winner == null && s.phase !== 'done' ? s.turn : null),
  isOver: s => s.winner != null || s.phase === 'done',
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.phase === 'done' || s.turn !== seat) return s
    if (i.kind === 'bid') {
      if (s.phase !== 'bidding') return s
      // placeBid itself re-validates the range / already-bid / turn — but we gate the
      // phase here so an out-of-phase bid is a clean no-op.
      return SP.placeBid(s, seat as Seat, i.n)
    }
    if (i.kind === 'play') {
      if (s.phase !== 'playing') return s
      // Resolve the card id against this seat's OWN hand, then validate it is a legal
      // play — never trust a guest-supplied card object.
      const card = s.hands[seat]?.find(c => c.id === i.cardId)
      if (card == null || !SP.isLegal(s, seat as Seat, card)) return s
      return SP.playCard(s, seat as Seat, card)
    }
    return s
  },
  aiStep: s => SP.aiStep(s), // logic.aiStep acts for s.turn (bid or play)
  // Changes on EVERY transition: ply increments on every bid, play, and hand resolution.
  tickKey: s => `${s.ply}-${s.phase}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards (keep the count so card backs render).
  // The viewing seat keeps its own real hand; all public table info is left untouched.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))),
  }),
}
