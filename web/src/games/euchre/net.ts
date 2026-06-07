/* EUCHRE — netplay adapter. Maps euchre's pure partnership logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Four seats (0&2 vs 1&3); seat index
 * maps directly to the logic's seat/turn encoding. Seat 0 is the original human side.
 *
 * HIDDEN INFO: each seat holds a private 5-card HAND, and after dealing 20 cards the
 * remaining 3 cards of the deck are face-down (only the single upcard is public until it
 * is picked up or turned down). redactFor therefore blanks every OTHER seat's hand cards
 * (keeping the count so the table still shows "N cards left") and never lets a viewer see
 * any card that is not in their own hand, the current/last trick, or the public upcard.
 * The undealt cards are not stored in EuchreState, so there is nothing extra to strip —
 * but we still guard with a leak test that other seats' card ids/labels never cross.
 *
 * Intents cover the calling decisions and the card play:
 *   { kind: 'orderUp', alone? }      — round 1: order up the upcard's suit
 *   { kind: 'callSuit', suit, alone? } — round 2: name a suit (not the turned-down one)
 *   { kind: 'pass' }                 — round 1 or 2: pass
 *   { kind: 'play', cardId }         — playing: play a card from your hand
 * applyIntent validates against the game's own legality (legalPlays / phase / turn) and
 * returns the input state unchanged for an illegal or out-of-turn intent (never throws). */

import * as E from './logic'
import type { EuchreState, Suit, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type EuchreIntent =
  | { kind: 'orderUp'; alone?: boolean }
  | { kind: 'callSuit'; suit: Suit; alone?: boolean }
  | { kind: 'pass' }
  | { kind: 'play'; cardId: number }
  | { kind: 'nextHand' }

/** A neutral placeholder hiding a card's real suit/rank/id from other seats. */
const HIDDEN: Card = { id: -1, suit: 'spades', rank: 9 }

export const euchreAdapter: GameAdapter<EuchreState, EuchreIntent> = {
  makeGame: () => E.makeGame(),
  numSeats: () => 4,
  // turn already skips the seat sitting out when a maker goes alone. During handover
  // (a hand finished, game not yet won) nobody is mid-play, but a player must deal the
  // next hand: we hand that to seat 0, who is always the host (host.mySeat === 0) and
  // always controlled, so no AI fires and the host drives the next deal via a 'nextHand'
  // intent — mirroring "host controls new games". null only once the game is won.
  seatToMove: s => {
    if (s.winner != null) return null
    if (s.phase === 'handover') return 0
    return s.turn
  },
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null) return s
    switch (i.kind) {
      case 'orderUp':
        // orderUp validates phase===round1, turn===seat, upcard present.
        return E.orderUp(s, seat, i.alone ?? false)
      case 'callSuit':
        // callSuit validates phase===round2, turn===seat, suit !== turned-down suit.
        return E.callSuit(s, seat, i.suit, i.alone ?? false)
      case 'pass':
        // pass validates phase is a calling round and turn===seat.
        return E.pass(s, seat)
      case 'play':
        // playCard validates phase===playing, turn===seat, card in hand, follow-suit.
        return E.playCard(s, seat, i.cardId)
      case 'nextHand':
        // Only valid during handover and only from seat 0 (the host). nextHand itself
        // returns s unchanged once the game is won.
        if (s.phase !== 'handover' || seat !== 0) return s
        return E.nextHand(s)
      default:
        return s
    }
  },
  aiStep: s => E.aiStep(s),
  // Changes on EVERY transition: ply is a monotonic action counter the logic bumps on
  // each legal calling/play action; include phase + turn so the AI timer always re-arms.
  tickKey: s => `${s.phase}-${s.ply}-${s.turn ?? ''}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards (keeping length so the count shows),
  // so a guest's view never carries an opponent's or partner's real cards. The viewer's
  // own hand, the live/last trick, and the public upcard are left intact.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))),
  }),
}
