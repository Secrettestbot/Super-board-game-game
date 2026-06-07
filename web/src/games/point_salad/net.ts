/* POINT SALAD — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
   useGameSession can host/join it. 3-player card-drafting set-collection.

   Hidden information: collected cards (veg + point cards) and the scoring criteria are
   all PUBLIC. The ONLY secret is the FACE-DOWN order of the point-card piles. Each pile
   is stored top-first at the END of its array; only the top card (criterion side up) is
   visible, plus the count. redactFor scrubs every below-top card to a placeholder while
   preserving pile LENGTHS (so cardsLeft / counts stay correct) and the visible top card.

   Seats map directly to player indices: seat 0 = You (original human), seats 1/2 = the
   other players. numSeats reads the real player count off the state. */

import * as PS from './logic'
import type { PointSaladState, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials.
 *  - takeVeg: two distinct market slot indices.
 *  - takePoint: the pile index whose top point card to take.
 *  - flip: reserved for variants that let you flip a point card to its veg side; this
 *    build's logic has no flip action, so the adapter treats it as a no-op. */
export type PointSaladIntent =
  | { kind: 'takeVeg'; ids: number[] }
  | { kind: 'takePoint'; id: number }
  | { kind: 'flip'; cardId: number }

// A face-down card the viewer is not allowed to see (still a valid Card shape so the
// view stays well-typed; the values are deliberately meaningless placeholders).
const HIDDEN: Card = { veg: PS.VEG[0], crit: '?' }

export const pointSaladAdapter: GameAdapter<PointSaladState, PointSaladIntent> = {
  makeGame: () => PS.makeGame(),
  // Read the real player count off the state rather than hardcoding, so a future
  // variant with a different table size reports its true seat count automatically.
  numSeats: s => s.players.length,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn index == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Out-of-turn or game-over intents return the input state unchanged.
    if (s.winner != null || s.turn !== seat) return s
    if (i.kind === 'takePoint') {
      return PS.canTakePoint(s, i.id) ? PS.takePointCard(s, i.id) : s
    }
    if (i.kind === 'takeVeg') {
      return PS.canTakeVeg(s, i.ids) ? PS.takeVeg(s, i.ids) : s
    }
    // 'flip' (or any unknown): no flip action exists in this logic build -> no-op.
    return s
  },
  aiStep: s => PS.aiTurn(s),
  tickKey: s => {
    // Changes on every transition: turn cycles each action and the visible card count
    // strictly decreases with every legal take. winner flips at game end.
    return `${s.turn ?? 'x'}-${PS.cardsLeft(s)}-${s.winner ?? ''}`
  },
  // Hide the face-down portion of each pile: keep the top card (public, criterion side
  // up) and the pile length, scrub everything below the top to a placeholder.
  redactFor: (s, _seat) => ({
    ...s,
    piles: s.piles.map(pile =>
      pile.map((card, idx) => (idx === pile.length - 1 ? card : HIDDEN)),
    ),
  }),
}
