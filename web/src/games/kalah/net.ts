/* KALAH — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = 'you' (sows first), 1 = 'ai'.
 *
 * EDGE CASE: landing the last seed in your own store grants the SAME player another
 * turn, so seatToMove can stay the same across consecutive moves. tickKey therefore
 * keys off s.moveCount (which increments on EVERY sow) so the AI timer re-arms for
 * back-to-back AI moves, and applyIntent only checks seat === seatToMove (no strict
 * alternation). Intent = the pit index to sow. */

import * as K from './logic'
import type { State, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which pit to sow. */
export interface KalahIntent { pit: number }

const SEAT_TO_SIDE: Side[] = ['you', 'ai']
const seatToMove = (s: State): number | null =>
  s.winner != null || s.turn == null ? null : SEAT_TO_SIDE.indexOf(s.turn)

export const kalahAdapter: GameAdapter<State, KalahIntent> = {
  makeGame: () => K.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Only validate that it's this seat's turn — NOT strict alternation, since an
    // extra-turn (last seed in your store) lets the same seat sow again.
    if (seatToMove(s) !== seat) return s
    const side = SEAT_TO_SIDE[seat]
    if (!i || typeof i.pit !== 'number' || !K.legalMoves(s, side).includes(i.pit)) return s
    const next = K.applyMove(s, i.pit, side)
    return next === s ? s : next // applyMove returns same ref if it rejected the move
  },
  aiStep: s => K.aiTurn(s),
  // moveCount changes on EVERY sow (including consecutive extra-turn sows by the same
  // seat), so the AI timer re-arms even when seatToMove stays constant.
  tickKey: s => `${s.moveCount}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
