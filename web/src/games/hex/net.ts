/* HEX — netplay adapter. Maps hex's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = You (amber, top/bottom), 1 = aI/Slate (left/right) — matches Stone 'y'/'s'.
 * Hex has no swap rule here, so the intent is just the placed cell index. */

import * as HX from './logic'
import type { HexState } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** seat -> Stone: 0 = 'y' (you/amber), 1 = 's' (slate). */
const SEAT_STONE = ['y', 's'] as const
/** Stone -> seat. */
const stoneSeat = (st: HX.Stone): number => (st === 'y' ? 0 : 1)

/** A move reduced to the wire essentials: the empty cell index to place on. */
export interface HexIntent { cell: number }

export const hexAdapter: GameAdapter<HexState, HexIntent> = {
  makeGame: () => HX.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner || s.turn == null ? null : stoneSeat(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Validate: game live, this seat's turn, target empty. place() also re-checks.
    if (s.winner || s.turn == null || stoneSeat(s.turn) !== seat) return s
    if (i == null || i.cell < 0 || i.cell >= HX.N * HX.N || s.board[i.cell]) return s
    return HX.place(s, i.cell, SEAT_STONE[seat])
  },
  aiStep: s => HX.aiMove(s),
  tickKey: s => `${s.last ?? -1}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
