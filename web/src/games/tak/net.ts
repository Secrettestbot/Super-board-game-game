/* TAK — netplay adapter. Maps Tak's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = human (player 0), 1 = AI/opponent (player 1) — matches Owner. */

import * as T from './logic'
import type { TakState, Move } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move on the wire is just Tak's own Move union (JSON-serializable plain object). */
export type TakIntent = Move

/** True when two intents describe the same move (used to match against the legal set). */
function sameMove(a: Move, b: Move): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'place' && b.kind === 'place') return a.at === b.at && a.piece === b.piece
  if (a.kind === 'move' && b.kind === 'move') {
    return (
      a.from === b.from &&
      a.dir === b.dir &&
      a.drops.length === b.drops.length &&
      a.drops.every((d, k) => d === b.drops[k])
    )
  }
  return false
}

export const takAdapter: GameAdapter<TakState, TakIntent> = {
  makeGame: () => T.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn 0/1 == seat
  isOver: s => s.winner != null,
  applyIntent: (s, seat, intent) => {
    if (s.winner != null || s.turn !== seat) return s
    // Reconstruct the authoritative Move from the legal set so we never trust a
    // guest-supplied illegal move. Returns input state unchanged if not found.
    const m = T.legalMoves(s).find(mv => sameMove(mv, intent))
    return m ? T.applyMove(s, m) : s
  },
  aiStep: s => T.aiTurn(s),
  tickKey: s => `${s.moveCount}-${s.turn}-${s.winner ?? ''}`,
}
