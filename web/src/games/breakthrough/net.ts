/* BREAKTHROUGH — netplay adapter. Maps breakthrough's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no redactFor.
 * Seats: 0 = White ('w', the human side) moving up, 1 = Black ('b', the AI side). */

import * as BT from './logic'
import type { BreakthroughState, Pawn } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials; the host reconstructs the cap flag. */
export interface BreakthroughIntent { from: number; to: number }

const SIDE: Pawn[] = ['w', 'b'] // seat index -> turn encoding
const seatOf = (p: Pawn): number => (p === 'w' ? 0 : 1)

export const breakthroughAdapter: GameAdapter<BreakthroughState, BreakthroughIntent> = {
  makeGame: () => BT.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null && s.turn != null ? seatOf(s.turn) : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || seatOf(s.turn) !== seat) return s
    // Reconstruct the authoritative Move (cap flag) from the legal set, so we never
    // trust a guest-supplied flag.
    const m = BT.legalMoves(s.board, s.turn).find(mv => mv.from === i.from && mv.to === i.to)
    return m ? BT.move(s, m, s.turn) : s
  },
  aiStep: s => BT.aiMove(s),
  tickKey: s => `${s.board.join('')}-${s.turn ?? ''}-${s.winner ?? ''}`,
}

export { SIDE }
