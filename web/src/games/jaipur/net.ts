/* JAIPUR — netplay adapter. Maps jaipur's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. The logic encodes sides as 'you'/'foe' rather than
 * seat indices, so the adapter translates: seat 0 = 'you' (the original human side, moves
 * first), seat 1 = 'foe' (the rival). numSeats is always 2.
 *
 * HIDDEN INFO: each player's HAND of goods cards is private and the draw DECK is a
 * face-down secret-order pile; only counts are public. The camel HERD is public (kept on
 * the table) and the MARKET is face-up. redactFor therefore blanks the OTHER seat's hand
 * cards and the entire deck before a view crosses the wire, while preserving lengths so the
 * UI can still show "N goods" / "deck N". A leak test guards this.
 *
 * A turn is exactly one action — match the logic's transitions:
 *   take       : grab a single market goods card (intent carries the market index)
 *   takeCamels : sweep all camels from the market into your herd
 *   sell       : sell every copy of one good for the top tokens (+ size bonus)
 * We validate each against the live state so the host never trusts a guest-supplied move. */

import * as JP from './logic'
import type { JaipurState, Good, Side, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. JSON-serializable plain object. */
export type JaipurIntent =
  | { kind: 'take'; i: number }
  | { kind: 'takeCamels' }
  | { kind: 'sell'; good: Good; n: number }

/** Seat 0 <-> 'you', seat 1 <-> 'foe'. */
const SIDE: Side[] = ['you', 'foe']
const seatToSide = (seat: number): Side | null => SIDE[seat] ?? null

/** A neutral placeholder that hides a card's real identity from other seats. */
const HIDDEN = 'camel' as Card

export const jaipurAdapter: GameAdapter<JaipurState, JaipurIntent> = {
  makeGame: () => JP.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : s.turn === 'foe' ? 1 : 0),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, intent) => {
    const side = seatToSide(seat)
    if (s.winner != null || side == null || s.turn !== side) return s
    switch (intent.kind) {
      case 'take':
        return JP.takeGood(s, side, intent.i)
      case 'takeCamels':
        return JP.takeCamels(s, side)
      case 'sell':
        // sell discards every copy of `good`; validate against the live hand (n is advisory).
        return JP.canSell(s, side, intent.good) ? JP.sell(s, side, intent.good) : s
      default:
        return s
    }
  },
  // The AI only plays 'foe'; the host fills any empty non-host seat with it.
  aiStep: s => JP.aiTurn(s),
  // Changes on EVERY transition: log grows on every action, plus turn/winner for safety.
  tickKey: s => `${s.log.length}-${s.turn ?? ''}-${s.winner ?? ''}`,
  // Hidden info: blank the OTHER seat's private hand cards and the whole face-down deck.
  // Counts are preserved (placeholder cards / same-length deck) so the UI keeps its tallies.
  redactFor: (s, seat) => {
    const me = seatToSide(seat)
    return {
      ...s,
      hand: {
        you: me === 'you' ? s.hand.you : s.hand.you.map(() => HIDDEN as Good),
        foe: me === 'foe' ? s.hand.foe : s.hand.foe.map(() => HIDDEN as Good),
      },
      deck: s.deck.map(() => HIDDEN),
    }
  },
}
