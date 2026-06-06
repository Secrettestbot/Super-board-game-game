/* CONNECT FOUR — netplay adapter. Maps connect_four's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no redactFor.
 * Seats: 0 = Red (human side, drops first), 1 = Yellow (AI side). */

import * as C4 from './logic'
import type { C4State, Disc } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A drop reduced to the wire essentials: which column. */
export interface C4Intent { col: number }

const SEAT_DISC: Record<number, Disc> = { 0: 'r', 1: 'y' }
const DISC_SEAT: Record<Disc, number> = { r: 0, y: 1 }

export const connectFourAdapter: GameAdapter<C4State, C4Intent> = {
  makeGame: () => C4.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null && s.turn != null ? DISC_SEAT[s.turn] : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || DISC_SEAT[s.turn] !== seat) return s
    if (!C4.legalCols(s.board).includes(i.col)) return s
    return C4.drop(s, i.col, SEAT_DISC[seat])
  },
  aiStep: s => C4.aiMove(s),
  tickKey: s => `${s.board.filter(Boolean).length}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
