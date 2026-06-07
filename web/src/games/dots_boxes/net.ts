/* DOTS & BOXES — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = 'you' (moves first), 1 = 'ai'.
 *
 * EDGE CASE: completing a box grants the SAME player another turn, so seatToMove can
 * stay the same across consecutive moves. tickKey therefore keys off s.moves (which
 * increments on EVERY edge drawn) so the AI timer re-arms for back-to-back AI moves,
 * and applyIntent only checks seat === seatToMove (no strict alternation). */

import * as DB from './logic'
import type { DotsState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which un-drawn edge is claimed. */
export interface DotsBoxesIntent { edge: string }

const SEAT_TO_PLAYER: Player[] = ['you', 'ai']
const VALID_EDGES = new Set(DB.allEdges())
const seatToMove = (s: DotsState): number | null =>
  s.winner != null || s.turn == null ? null : SEAT_TO_PLAYER.indexOf(s.turn)

export const dotsBoxesAdapter: GameAdapter<DotsState, DotsBoxesIntent> = {
  makeGame: () => DB.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Only validate that it's this seat's turn — NOT strict alternation, since a box
    // completion lets the same seat move again.
    if (seatToMove(s) !== seat) return s
    const who = SEAT_TO_PLAYER[seat]
    if (!i || typeof i.edge !== 'string' || !VALID_EDGES.has(i.edge) || s.edges[i.edge]) return s // illegal / already drawn
    const next = DB.drawEdge(s, i.edge, who)
    return next === s ? s : next // drawEdge returns same ref if it rejected the move
  },
  aiStep: s => DB.aiMove(s),
  // s.moves changes on EVERY edge drawn (including consecutive moves by the same seat),
  // so the AI timer re-arms even when seatToMove stays constant.
  tickKey: s => `${s.moves}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
