/* CHESS — netplay adapter. Maps chess's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = White, 1 = Black (matches Color). */

import * as C from './logic'
import type { ChessState, PieceType } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials; the host reconstructs full flags. */
export interface ChessIntent { from: number; to: number; promo?: PieceType }

export const chessAdapter: GameAdapter<ChessState, ChessIntent> = {
  makeGame: () => C.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.result == null ? s.turn : null),
  isOver: s => s.result != null,
  applyIntent: (s, seat, i) => {
    if (s.result != null || s.turn !== seat) return s
    // Reconstruct the authoritative Move (castle/en-passant flags) from the legal set,
    // so we never trust guest-supplied flags.
    const m = C.legalMoves(s).find(
      mv => mv.from === i.from && mv.to === i.to && (mv.promo ?? null) === (i.promo ?? null),
    )
    return m ? C.applyMove(s, m) : s
  },
  aiStep: s => C.aiMove(s),
  tickKey: s => `${s.fullmove}-${s.turn}-${s.result ?? ''}`,
}
