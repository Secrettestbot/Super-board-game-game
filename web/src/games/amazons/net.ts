/* AMAZONS — netplay adapter. Maps amazons's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = White (the original human), 1 = Black (the AI side).
 *
 * An amazons turn is TWO physical steps — glide an amazon, then shoot a burning arrow.
 * It is ONE turn, so the wire intent carries the COMPLETE turn — { from, to, arrow } —
 * and applyIntent performs it atomically via playTurn, which validates the move AND the
 * shot and returns the input state unchanged if any part is illegal or it is not the
 * seat's turn. The place-then-shoot interaction stays local UI state; only the finished
 * move is dispatched. */

import * as AZ from './logic'
import type { AmazonsState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A full amazons turn reduced to wire essentials: glide from→to, then burn `arrow`. */
export interface AmazonsIntent { from: number; to: number; arrow: number }

const SEAT_SIDE: Side[] = ['w', 'b'] // seat 0 = White, seat 1 = Black

export const amazonsAdapter: GameAdapter<AmazonsState, AmazonsIntent> = {
  makeGame: () => AZ.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner || s.turn == null ? null : s.turn === 'w' ? 0 : 1),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // playTurn validates the whole turn (seat's turn, legal queen move, legal arrow) and
    // returns the input state unchanged on any failure — never throws.
    if (s.winner || s.turn == null) return s
    const side = SEAT_SIDE[seat]
    if (side == null || s.turn !== side) return s
    return AZ.playTurn(s, i.from, i.to, i.arrow, side)
  },
  aiStep: s => AZ.aiMove(s),
  // Changes on every COMPLETED turn: whose turn + the last completed move/shot + winner.
  tickKey: s => `${s.turn ?? '-'}-${s.lastMoveFrom ?? ''}-${s.lastMoveTo ?? ''}-${s.lastShot ?? ''}-${s.winner ?? ''}`,
}
