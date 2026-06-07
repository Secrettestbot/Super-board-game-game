/* XIANGQI — netplay adapter. Maps xiangqi's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Red (moves first), 1 = Black (matches Side 'r'/'b'). */

import * as XQ from './logic'
import type { XiangqiState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials; the host reconstructs the authoritative move. */
export interface XiangqiIntent { from: number; to: number }

const SIDE: Side[] = ['r', 'b'] // seat -> Side
const seatOf = (s: Side): number => (s === 'r' ? 0 : 1)

export const xiangqiAdapter: GameAdapter<XiangqiState, XiangqiIntent> = {
  makeGame: () => XQ.makeInitial(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null && s.turn != null ? seatOf(s.turn) : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || seatOf(s.turn) !== seat) return s
    // Reconstruct the authoritative move from the legal set; never trust guest input.
    const m = XQ.legalMoves(s.board, s.turn).find(mv => mv.from === i.from && mv.to === i.to)
    return m ? XQ.applyMove(s, m.from, m.to) : s
  },
  aiStep: s => XQ.aiMove(s), // aiMove only acts for Black (seat 1), which is the only AI seat
  tickKey: s => `${s.moveNo}-${s.turn ?? ''}-${s.winner ?? ''}`,
}

export { SIDE }
