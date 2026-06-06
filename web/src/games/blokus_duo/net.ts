/* BLOKUS DUO — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information (both trays are public), so no
 * redactFor is needed. Seats: 0 = the human side, 1 = the AI side (matches Player). */

import * as B from './logic'
import type { State } from './logic'
import type { GameAdapter } from '../../net/protocol'

/**
 * A placement reduced to wire essentials: which piece, which orientation index, and the
 * anchor cell. The host reconstructs the concrete cells from ORIENTS and re-validates,
 * so we never trust guest-supplied cell lists. A null pieceId means "pass".
 */
export interface BlokusDuoIntent {
  pieceId: number | null
  orient?: number
  r?: number
  c?: number
}

export const blokusDuoAdapter: GameAdapter<State, BlokusDuoIntent> = {
  makeGame: () => B.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const player = seat as B.Player
    // Pass intent: only valid when this player genuinely has no legal move.
    if (i.pieceId == null) {
      if (B.canPlaceAny(s, player)) return s
      return B.pass(s, player)
    }
    // Reconstruct + validate the placement from the trusted orientation table.
    const orients = B.ORIENTS[i.pieceId]
    if (!orients) return s
    const shape = orients[i.orient ?? -1]
    if (!shape || i.r == null || i.c == null) return s
    const cells = B.placedCells(shape, i.r, i.c)
    if (!cells || !B.isLegal(s, player, cells)) return s
    return B.place(s, player, i.pieceId, cells)
  },
  aiStep: s => B.aiTurn(s),
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
}
