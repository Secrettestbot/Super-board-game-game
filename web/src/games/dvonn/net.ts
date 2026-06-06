/* DVONN — netplay adapter. Maps dvonn's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = you (white), 1 = rival (black) — matches Player.
 *
 * One action is an intent, validated against the game's legal moves:
 *   - placement (phase 1): { cell }
 *   - movement  (phase 2): { from, to }
 * applyIntent returns the input state unchanged for an illegal or out-of-turn intent. */

import * as D from './logic'
import type { DvonnState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A placement (cell) or a stack move (from/to), reduced to the wire essentials. */
export interface DvonnIntent { cell?: number; from?: number; to?: number }

export const dvonnAdapter: GameAdapter<DvonnState, DvonnIntent> = {
  makeGame: () => D.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.phase === 'done' || s.winner != null ? null : s.turn),
  isOver: s => s.phase === 'done' || s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.phase === 'done' || s.winner != null || s.turn !== seat) return s
    if (s.phase === 'place') {
      if (i.cell == null) return s
      // legalPlacements is the authority on which cells are empty/placeable.
      if (!D.legalPlacements(s).includes(i.cell)) return s
      return D.placePiece(s, i.cell)
    }
    if (s.phase === 'move') {
      if (i.from == null || i.to == null) return s
      // Validate against the legal move set for this seat; never trust raw coords.
      if (!D.legalMoves(s, seat as Player).some(m => m.from === i.from && m.to === i.to)) return s
      return D.applyMove(s, i.from, i.to)
    }
    return s
  },
  aiStep: s => D.aiTurn(s),
  tickKey: s => `${s.tick}-${s.phase}-${s.turn}-${s.winner ?? ''}`,
}
