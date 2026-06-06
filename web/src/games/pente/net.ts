/* PENTE — netplay adapter. Maps pente's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Black (moves first), 1 = White. */

import * as PT from './logic'
import type { PenteState, Stone } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move is just the placed intersection index (0..168). */
export interface PenteIntent { cell: number }

const SEAT_STONE: Stone[] = ['b', 'w'] // seat 0 = Black, seat 1 = White
const stoneSeat = (st: Stone): number => (st === 'b' ? 0 : 1)

export const penteAdapter: GameAdapter<PenteState, PenteIntent> = {
  makeGame: () => PT.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : stoneSeat(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null) return s
    if (stoneSeat(s.turn) !== seat) return s
    // place() itself validates empty/turn/over and returns s unchanged otherwise.
    return PT.place(s, i.cell, SEAT_STONE[seat])
  },
  aiStep: s => PT.aiMove(s),
  tickKey: s => `${s.last ?? -1}-${s.turn ?? 'x'}-${s.pairs.b}-${s.pairs.w}-${s.winner ?? ''}`,
}
