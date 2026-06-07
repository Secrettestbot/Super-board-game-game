/* MIJNLIEFF — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information (both hands are public counts and
 * placed pieces are visible), so no redactFor is needed.
 * Seats: 0 = the human side (moves first), 1 = the AI side (matches Player). */

import * as M from './logic'
import type { State, PieceType } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A placement reduced to the wire essentials: which type from your hand, and where. */
export interface MijnlieffIntent { pieceType: PieceType; cell: number }

export const mijnlieffAdapter: GameAdapter<State, MijnlieffIntent> = {
  makeGame: () => M.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn 0/1 == seat; null when over
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // place() itself rejects illegal cells / missing piece type by returning s unchanged.
    return M.place(s, i.cell, i.pieceType)
  },
  aiStep: s => M.aiTurn(s),
  // changes on every transition (board fill count + whose turn + result re-arms the AI timer)
  tickKey: s => `${s.board.filter(Boolean).length}-${s.turn ?? 'x'}-${s.winner ?? ''}`,
}
