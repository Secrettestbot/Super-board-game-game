/* PONG HAU K'I — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Red (the original human, moves first), 1 = Blue (the AI side). */

import * as PHK from './logic'
import type { PHKState, Disc } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A slide reduced to the wire essentials: which piece, which empty point. */
export interface PHKIntent { from: number; to: number }

const SEAT_TO_DISC: Disc[] = ['r', 'b'] // seat 0 -> Red, seat 1 -> Blue

function seatOf(turn: Disc | null): number | null {
  return turn === 'r' ? 0 : turn === 'b' ? 1 : null
}

export const pongHauKiAdapter: GameAdapter<PHKState, PHKIntent> = {
  makeGame: () => PHK.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner || seatOf(s.turn) !== seat) return s
    // move() re-validates legality (own piece, empty dest, adjacency) and returns the
    // same ref if the slide is illegal — so we never trust guest-supplied moves.
    return PHK.move(s, { from: i.from, to: i.to }, SEAT_TO_DISC[seat])
  },
  aiStep: s => PHK.aiMove(s),
  tickKey: s => `${s.board.map(c => c ?? '.').join('')}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
