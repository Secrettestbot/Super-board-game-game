/* TIC-TAC-TOE — netplay adapter. Maps tic-tac-toe's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor is needed. Seats: 0 = X (moves first), 1 = O. */

import * as TTT from './logic'
import type { TTTState } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move is just the cell index (0-8, row-major). */
export type TTTIntent = number

const SEAT_MARK = ['x', 'o'] as const // seat 0 -> 'x', seat 1 -> 'o'

export const ticTacToeAdapter: GameAdapter<TTTState, TTTIntent> = {
  makeGame: () => TTT.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : s.turn === 'x' ? 0 : 1),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    const mark = SEAT_MARK[seat]
    // Validate: game not over, correct seat to move, cell exists & empty. place()
    // itself returns s unchanged on any illegal move, so this stays a no-op.
    if (s.winner || mark == null || s.turn !== mark) return s
    if (!Number.isInteger(i) || i < 0 || i > 8 || s.board[i]) return s
    return TTT.place(s, i, mark)
  },
  aiStep: s => TTT.aiMove(s),
  tickKey: s => `${s.board.join('')}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
