/* SANTORINI — netplay adapter. Maps santorini's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = the original human ('you' side), 1 = the AI ('ai' side).
 *
 * A santorini turn is THREE local steps — select a worker, MOVE it, then BUILD — but it
 * is ONE turn. The wire intent therefore carries the COMPLETE turn — { worker, moveTo,
 * buildAt } — and applyIntent performs the whole thing atomically via logic.applyTurn,
 * which itself validates every part and returns the input state unchanged if any part is
 * illegal or it is not the seat's turn. buildAt is omitted (or -1) when the move steps
 * onto a level-3 roof, which is an immediate win with no build. */

import * as ST from './logic'
import type { SantoriniState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A full santorini turn reduced to wire essentials: which worker, where it climbs, where it builds. */
export interface SantoriniIntent { worker: number; moveTo: number; buildAt?: number }

const SEAT_SIDE: Side[] = ['you', 'ai'] // seat 0 = the human side, seat 1 = the AI side

export const santoriniAdapter: GameAdapter<SantoriniState, SantoriniIntent> = {
  makeGame: () => ST.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner || s.turn == null ? null : s.turn === 'you' ? 0 : 1),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner || s.turn == null) return s
    const side = SEAT_SIDE[seat]
    if (side == null || s.turn !== side) return s
    // The worker must be one of this side's workers (logic.applyTurn re-checks ownership too).
    const w = s.workers[i.worker]
    if (!w || w.side !== side) return s
    // applyTurn validates the move (≤1 climb, empty, no dome) and the build; an illegal
    // worker/move/build leaves the state object identical (===), which we forward unchanged.
    return ST.applyTurn(s, i.worker, i.moveTo, i.buildAt ?? -1, side)
  },
  aiStep: s => ST.aiMove(s),
  // Changes on every COMPLETED turn: whose turn it is, the last cell touched, the winner.
  tickKey: s => `${s.turn ?? '-'}-${s.last ?? -1}-${s.winner ?? ''}`,
}
