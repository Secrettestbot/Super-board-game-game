/* MANCALA — netplay adapter. Maps the pure Kalah logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = 'you' (the original human, moves first), 1 = 'ai'.
 *
 * EXTRA TURNS: landing your last seed in your own store grants ANOTHER turn, so
 * seatToMove can stay the SAME seat across consecutive moves. tickKey therefore keys
 * off s.moveCount (which increments on EVERY sow, including back-to-back moves by the
 * same seat) so the AI timer re-arms for consecutive AI sows; and applyIntent only
 * checks seat === seatToMove (no strict alternation). */

import * as MC from './logic'
import type { MancalaState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which pit index is sown. */
export interface MancalaIntent { pit: number }

const SEAT_TO_SIDE: Side[] = ['you', 'ai']
const seatToMove = (s: MancalaState): number | null =>
  s.winner != null || s.turn == null ? null : SEAT_TO_SIDE.indexOf(s.turn)

export const mancalaAdapter: GameAdapter<MancalaState, MancalaIntent> = {
  makeGame: () => MC.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Only validate that it's this seat's turn — NOT strict alternation, since landing
    // in your own store lets the same seat sow again.
    if (seatToMove(s) !== seat) return s
    const side = SEAT_TO_SIDE[seat]
    if (!i || typeof i.pit !== 'number') return s
    if (!MC.legalMoves(s.pits, side).includes(i.pit)) return s // illegal: not your pit / empty
    const next = MC.move(s, i.pit, side)
    return next === s ? s : next // move() returns same ref if it rejected the move
  },
  aiStep: s => MC.aiMove(s),
  // moveCount changes on EVERY sow (including consecutive sows by the same seat),
  // so the AI timer re-arms even when seatToMove stays constant.
  tickKey: s => `${s.moveCount}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
