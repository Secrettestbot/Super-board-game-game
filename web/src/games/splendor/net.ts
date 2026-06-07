/* SPLENDOR — netplay adapter. Maps splendor's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the original
 * human side, moves first), seat 1 = the AI. numSeats reads the real player count off the
 * state's players array so a future 3+ player state would report correctly.
 *
 * MOSTLY PUBLIC: gem tokens, face-up cards, nobles, and everyone's purchased cards/bonuses
 * are open information and stay intact. The ONE hidden element is a card you RESERVE blindly
 * from the top of a face-down deck — opponents see that you hold a reserved card (and its
 * count) but not WHICH card — and the order of the remaining face-down decks. redactFor
 * therefore blanks every OTHER seat's reserved cards to a placeholder (preserving the count)
 * and empties the visible deck order to opaque length-only stubs. A leak test guards this.
 *
 * A turn is one of: take gems, reserve a card, buy a card. Intents are JSON plain objects and
 * are revalidated against the pure logic so the host never trusts a guest-supplied move:
 *   { kind: 'take',    gems:  Gem[] }            // 1-3 distinct (take3) or exactly 2 same (take2)
 *   { kind: 'reserve', cardId: string }          // a face-up card by id, OR
 *   { kind: 'reserve', deckLevel: 1|2|3 }        // a blind top-deck draw
 *   { kind: 'buy',     cardId: string }          // a face-up OR own-reserved card by id
 */

import * as SP from './logic'
import type { SplendorState, Gem, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type SplendorIntent =
  | { kind: 'take'; gems: Gem[] }
  | { kind: 'reserve'; cardId: string }
  | { kind: 'reserve'; deckLevel: 1 | 2 | 3 }
  | { kind: 'buy'; cardId: string }

/** A neutral placeholder hiding a reserved card's identity from other seats (count kept). */
const HIDDEN_CARD: Card = { id: '?', tier: 1, cost: {}, bonus: 'emerald', points: 0 }

export const splendorAdapter: GameAdapter<SplendorState, SplendorIntent> = {
  makeGame: () => SP.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.players.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    if (i.kind === 'take') {
      // take2 when exactly two of the same color are requested; otherwise take3 (1-3 distinct).
      if (i.gems.length === 2 && i.gems[0] === i.gems[1]) {
        return SP.canTake2(s, i.gems[0]) ? SP.take2(s, i.gems[0]) : s
      }
      return SP.canTake3(s, i.gems) ? SP.take3(s, i.gems) : s
    }
    if (i.kind === 'reserve') {
      if ('cardId' in i) return SP.reserve(s, { id: i.cardId })
      return SP.reserve(s, { tier: i.deckLevel })
    }
    if (i.kind === 'buy') return SP.buy(s, i.cardId)
    return s
  },
  aiStep: s => SP.aiTurn(s),
  // Changes on EVERY transition: step increments on every applied action (and the AI pass).
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's reserved cards (keep the count so opponents still
  // see how many are held) and strip the face-down deck order to opaque length-only stubs.
  // The viewing seat keeps its own real reserved cards; everything else is public.
  redactFor: (s, seat) => ({
    ...s,
    decks: s.decks.map(d => d.map(() => ({ ...HIDDEN_CARD }))) as SplendorState['decks'],
    players: s.players.map((p, i) =>
      i === seat ? p : { ...p, reserved: p.reserved.map(() => ({ ...HIDDEN_CARD })) },
    ) as SplendorState['players'],
  }),
}
