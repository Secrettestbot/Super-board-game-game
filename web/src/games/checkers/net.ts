/* CHECKERS — netplay adapter. Maps checkers' pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Red (the original human, moves first), 1 = Black (the AI side). */

import * as CK from './logic'
import type { CheckersState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

const SIDE: Side[] = ['r', 'b'] // seat -> side
const seatOf = (turn: Side | null): number | null => (turn === 'r' ? 0 : turn === 'b' ? 1 : null)

/** A move reduced to the wire essentials; the host reconstructs the full Move (caps/path)
 * from its own legalMoves so we never trust guest-supplied capture chains. */
export interface CheckersIntent { from: number; to: number }

export const checkersAdapter: GameAdapter<CheckersState, CheckersIntent> = {
  makeGame: () => CK.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || seatOf(s.turn) !== seat) return s
    const who = SIDE[seat]
    // Reconstruct the authoritative Move (capture chain, path) from the legal set; this
    // also enforces forced-capture rules, which live in legalMoves.
    const m = CK.legalMoves(s.board, who).find(mv => mv.from === i.from && mv.to === i.to)
    return m ? CK.move(s, m, who) : s
  },
  // The AI plays Black only (aiMove is hardwired to 'b'), which is always seat 1.
  aiStep: s => CK.aiMove(s),
  tickKey: s => `${s.turn ?? ''}-${s.winner ?? ''}-${s.last ? s.last.from + ':' + s.last.to : ''}`,
}
