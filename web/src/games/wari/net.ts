/* WARI / OWARE — netplay adapter. Maps wari's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = 'you' (the original human side, bottom pits 0..5, moves first),
 *        1 = 'ai' (the rival side, top pits 6..11). */

import * as W from './logic'
import type { WariState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** The pit index sown (0..11). The host validates ownership/turn/legality. */
export type WariIntent = number

const SEAT_SIDE: Record<number, Side> = { 0: 'you', 1: 'ai' }
const sideSeat = (side: Side | null): number | null => (side === 'you' ? 0 : side === 'ai' ? 1 : null)

export const wariAdapter: GameAdapter<WariState, WariIntent> = {
  makeGame: () => W.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null ? null : sideSeat(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Validate: game live, this seat's turn. applyMove re-checks the pit is a legal
    // move for the side (ownership, non-empty, feeding rule) and returns s if not.
    if (s.winner != null || sideSeat(s.turn) !== seat) return s
    return W.applyMove(s, i, SEAT_SIDE[seat])
  },
  aiStep: s => W.aiTurn(s),
  // changes on every sow: moveCount increments per move, turn flips, winner set at end.
  tickKey: s => `${s.moveCount}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
