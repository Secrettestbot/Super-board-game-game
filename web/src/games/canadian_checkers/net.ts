/* CANADIAN / INTERNATIONAL CHECKERS — netplay adapter. Maps the 12x12 draughts logic onto
 * the uniform GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor is needed. Seats: 0 = the original human (Ivory, moves first), 1 = the AI side. */

import * as CC from './logic'
import type { State, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

const seatOf = (turn: Player | null): number | null => (turn === 0 ? 0 : turn === 1 ? 1 : null)

/** A move reduced to the wire essentials; the host reconstructs the full Move (caps/path)
 * from its own legalMoves so we never trust guest-supplied capture chains. Forced max-capture
 * is enforced because legalMoves only returns the longest jumps. */
export interface CanadianCheckersIntent { from: number; to: number }

export const canadianCheckersAdapter: GameAdapter<State, CanadianCheckersIntent> = {
  makeGame: () => CC.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || seatOf(s.turn) !== seat) return s
    // Reconstruct the authoritative Move (capture chain, path) from the legal set; this also
    // enforces forced max-capture, which lives in legalMoves.
    const m = CC.legalMoves(s).find(mv => mv.from === i.from && mv.to === i.to)
    return m ? CC.applyMove(s, m) : s
  },
  // aiTurn plays for s.turn, so it correctly drives whichever seat is the AI.
  aiStep: s => CC.aiTurn(s),
  tickKey: s => `${s.turn ?? ''}-${s.winner ?? ''}-${s.last ? s.last.from + ':' + s.last.to : ''}`,
}
