/* SURAKARTA — netplay adapter. Maps Surakarta's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Red (moves first), 1 = Black (the AI side). */

import * as SK from './logic'
import type { SurakartaState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials; the host reconstructs the authoritative
 *  move (step vs loop-capture path) from its own legalMoves. */
export interface SurakartaIntent { from: number; to: number }

const SEAT_TO_PLAYER: Player[] = ['r', 'b'] // seat 0 = Red, seat 1 = Black

export const surakartaAdapter: GameAdapter<SurakartaState, SurakartaIntent> = {
  makeGame: () => SK.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : (s.turn === 'r' ? 0 : 1)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    const who = SEAT_TO_PLAYER[seat]
    if (s.winner != null || s.turn !== who) return s
    // Reconstruct the authoritative Move (step vs loop-capture, with its path) from the
    // legal set so we never trust a guest-supplied move kind.
    const m = SK.movesFrom(s.board, i.from, who).find(mv => mv.to === i.to)
    return m ? SK.applyMove(s, m, who) : s
  },
  aiStep: s => SK.aiMove(s),
  tickKey: s => `${SK.counts(s.board).r}-${SK.counts(s.board).b}-${s.turn ?? ''}-${s.last?.from ?? -1}-${s.last?.to ?? -1}-${s.winner ?? ''}`,
}
