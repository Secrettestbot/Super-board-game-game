/* PENTAGO — netplay adapter. Maps pentago's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = White (the original human), 1 = Black (the AI side).
 *
 * A pentago turn is TWO physical steps in logic.ts (place a marble, then rotate a
 * quadrant) but it is ONE turn. The wire intent therefore carries the COMPLETE turn
 * — { cell, quad, dir } — and applyIntent performs both steps atomically, validating
 * the whole thing and returning the input state unchanged if any part is illegal or it
 * is not the seat's turn. This keeps the move atomic across the network. */

import * as PG from './logic'
import type { PentagoState, Dir, Marble } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A full pentago turn reduced to wire essentials: where to place + how to twist. */
export interface PentagoIntent { cell: number; quad: number; dir: Dir }

const SEAT_MARBLE: Marble[] = ['w', 'b'] // seat 0 = White, seat 1 = Black

export const pentagoAdapter: GameAdapter<PentagoState, PentagoIntent> = {
  makeGame: () => PG.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner || s.turn == null ? null : s.turn === 'w' ? 0 : 1),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn, game live, and at the START of a turn (place phase).
    if (s.winner || s.turn == null) return s
    if (s.turn !== SEAT_MARBLE[seat]) return s
    if (s.phase !== 'place') return s
    const who = SEAT_MARBLE[seat]
    // Validate the placement target.
    if (!Number.isInteger(i.cell) || i.cell < 0 || i.cell >= s.board.length) return s
    if (s.board[i.cell] != null) return s
    if (!Number.isInteger(i.quad) || i.quad < 0 || i.quad >= PG.QUADS.length) return s
    if (i.dir !== 'cw' && i.dir !== 'ccw') return s
    // Apply both steps atomically.
    const placed = PG.place(s, i.cell, who)
    if (placed === s || placed.phase !== 'rotate') return s // placement rejected
    const done = PG.rotate(placed, i.quad, i.dir, who)
    if (done === placed) return s // rotation rejected — treat whole turn as no-op
    return done
  },
  aiStep: s => PG.aiMove(s),
  // Changes on every COMPLETED turn: marble counts + whose turn + winner.
  tickKey: s => {
    let filled = 0
    for (const c of s.board) if (c != null) filled++
    return `${filled}-${s.turn ?? '-'}-${s.winner ?? ''}`
  },
}
