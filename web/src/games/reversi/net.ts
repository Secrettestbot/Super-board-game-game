/* REVERSI — netplay adapter. Maps reversi's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Black (moves first), 1 = White (the AI side).
 *
 * Note on passes: a player with no legal move is skipped *inside* logic.place — the turn
 * passes back to the mover. seatToMove therefore just reflects whatever s.turn the state
 * already encodes, and applyIntent validates against legalMoves for the moving disc only. */

import * as RV from './logic'
import type { ReversiState, Disc } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: the cell index (0..63) to place a disc on. */
export interface ReversiIntent { cell: number }

const SEAT: Record<Disc, number> = { b: 0, w: 1 }
const DISC: Disc[] = ['b', 'w'] // seat -> disc

export const reversiAdapter: GameAdapter<ReversiState, ReversiIntent> = {
  makeGame: () => RV.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : SEAT[s.turn]),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || SEAT[s.turn] !== seat) return s
    const who = DISC[seat]
    if (!RV.legalMoves(s.board, who).includes(i.cell)) return s
    return RV.place(s, i.cell, who)
  },
  aiStep: s => RV.aiMove(s),
  tickKey: s => `${RV.counts(s.board).b}-${RV.counts(s.board).w}-${s.turn ?? ''}-${s.last ?? ''}-${s.winner ?? ''}`,
}
