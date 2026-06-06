/* QUORIDOR — netplay adapter. Maps quoridor's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = the bottom pawn ('you'), 1 = the top pawn ('ai'). */

import * as QD from './logic'
import type { QuoridorState, Wall, Who, Orient } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn is either a pawn move to a cell, or a wall placement. JSON-serializable. */
export type QuoridorIntent =
  | { kind: 'move'; r: number; c: number }
  | { kind: 'wall'; r: number; c: number; o: Orient }

/** Seat index <-> the game's Who encoding. */
const SEAT_WHO: Who[] = ['you', 'ai']
const WHO_SEAT: Record<Who, number> = { you: 0, ai: 1 }

export const quoridorAdapter: GameAdapter<QuoridorState, QuoridorIntent> = {
  makeGame: () => QD.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : WHO_SEAT[s.turn]),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || WHO_SEAT[s.turn] !== seat) return s
    const who = SEAT_WHO[seat]
    if (i.kind === 'move') {
      // QD.move validates against legalMoves and returns s unchanged when illegal.
      return QD.move(s, i.r, i.c, who)
    }
    // QD.placeWall validates geometry + non-overlap + both-pawns-reachable, returns s if illegal.
    const w: Wall = { r: i.r, c: i.c, o: i.o }
    return QD.placeWall(s, w, who)
  },
  aiStep: s => QD.aiMove(s),
  tickKey: s => `${s.pawns.you.r},${s.pawns.you.c}|${s.pawns.ai.r},${s.pawns.ai.c}|${s.walls.length}|${s.turn ?? ''}|${s.winner ?? ''}`,
}
