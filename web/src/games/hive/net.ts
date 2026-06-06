/* HIVE — netplay adapter. Maps hive's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information (both swarms + hand counts are
 * public on the open field), so no redactFor is needed.
 * Seats: 0 = You (human), 1 = AI/opponent (matches Player). */

import * as H from './logic'
import type { HiveState, PieceType, Hex } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn is either placing a new bug from the hand or moving a placed bug. */
export type HiveIntent =
  | { kind: 'place'; bug: PieceType; to: Hex }
  | { kind: 'move'; from: Hex; to: Hex }

export const hiveAdapter: GameAdapter<HiveState, HiveIntent> = {
  makeGame: () => H.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn 0/1 == seat
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // Validate against the game's own legal-move generator; never trust the wire.
    if (i.kind === 'place') {
      if (!H.placeableTypes(s, seat as H.Player).includes(i.bug)) return s
      if (!H.legalPlacements(s, seat as H.Player).includes(i.to)) return s
      return H.applyMove(s, { kind: 'place', type: i.bug, to: i.to })
    }
    const top = H.topPiece(s, i.from)
    if (!top || top.owner !== seat) return s
    if (!H.legalMoves(s, i.from).includes(i.to)) return s
    return H.applyMove(s, { kind: 'move', type: top.type, from: i.from, to: i.to })
  },
  aiStep: s => H.aiTurn(s),
  tickKey: s => `${s.turnNo[0]}-${s.turnNo[1]}-${s.turn}-${s.winner ?? ''}`,
}
