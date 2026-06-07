/* GOMOKU — netplay adapter. Maps gomoku's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Black (the original human side, moves first), 1 = White (the AI side). */

import * as GK from './logic'
import type { GomokuState, Stone } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** The placed cell index (0..224). */
export type GomokuIntent = number

const SEAT_STONE: Record<number, Stone> = { 0: 'b', 1: 'w' }
const stoneSeat = (st: Stone | null): number | null => (st === 'b' ? 0 : st === 'w' ? 1 : null)

export const gomokuAdapter: GameAdapter<GomokuState, GomokuIntent> = {
  makeGame: () => GK.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : stoneSeat(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Validate: game live, it's this seat's turn, cell exists and is empty.
    if (s.winner || stoneSeat(s.turn) !== seat) return s
    if (i < 0 || i >= s.board.length || s.board[i]) return s
    // place() also re-checks turn/occupancy and returns s unchanged if illegal.
    return GK.place(s, i, SEAT_STONE[seat])
  },
  aiStep: s => GK.aiMove(s),
  tickKey: s => `${s.last ?? -1}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
