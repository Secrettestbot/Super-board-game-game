/* BLOCKADE — netplay adapter. Maps blockade's pure logic onto the uniform GameAdapter so
   useGameSession can host/join it. Perfect information, so no redactFor is needed.
   Seats: 0 = you (bottom pawns), 1 = ai (top pawns) — matches the Player encoding.

   A blockade turn is move-THEN-wall, but the net layer treats one *turn* as one *intent*:
   the intent carries the pawn move and (when walls remain) the wall to drop, and
   applyIntent performs the whole turn atomically against the game's own legality
   (legalMoves + canPlaceWall, which forbids walls that fully seal a pawn off). */

import * as BL from './logic'
import type { BlockadeState, Wall, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** One whole turn: move pawn `idx` to (r,c); if walls remain, also place `wall`. */
export interface BlockadeIntent {
  idx: number
  r: number
  c: number
  wall?: Wall
}

export const blockadeAdapter: GameAdapter<BlockadeState, BlockadeIntent> = {
  makeGame: () => BL.makeGame(),
  numSeats: () => 2,
  // The turn flag fully identifies the seat to move; the move-then-wall split is hidden
  // because applyIntent resolves a whole turn in one call.
  seatToMove: s => (s.winner != null || s.turn == null ? null : s.turn),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const who = seat as Player
    // 1) MOVE — BL.move validates against legalMoves and returns s unchanged when illegal.
    const moved = BL.move(s, who, i.idx, i.r, i.c)
    if (moved === s) return s // illegal move -> reject the whole turn
    // The move may have won or (no walls left) already passed the turn — turn complete.
    if (moved.winner != null || moved.turn !== who) {
      // A wall was supplied but the move already ended the turn -> the wall is ignored,
      // which is fine (winning / no walls left). The move alone is a legal full turn.
      return moved
    }
    // 2) WALL — we're in the awaiting-wall phase and the mover still has walls.
    if (i.wall == null) return s // a wall is required this turn but none supplied -> reject
    const walled = BL.placeWall(moved, i.wall, who)
    if (walled === moved) return s // illegal wall -> reject the whole turn
    return walled
  },
  aiStep: s => BL.aiTurn(s),
  tickKey: s =>
    `${s.pawns[0][0].r},${s.pawns[0][0].c}|${s.pawns[0][1].r},${s.pawns[0][1].c}|` +
    `${s.pawns[1][0].r},${s.pawns[1][0].c}|${s.pawns[1][1].r},${s.pawns[1][1].c}|` +
    `${s.walls.length}|${s.left[0]},${s.left[1]}|${s.turn ?? ''}|${s.winner ?? ''}`,
}
