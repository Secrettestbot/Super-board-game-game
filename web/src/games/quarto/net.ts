/* QUARTO — netplay adapter. Maps quarto's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information (all pieces visible), so no
 * redactFor is needed.
 *
 * Seats: 0 = 'you' (human side), 1 = 'ai' (the other side).
 *
 * THE TWIST: a turn is two sub-actions by the SAME seat — first PLACE the handed piece
 * (hand !== null), then GIVE one unused piece to the opponent (hand === null). The seat
 * to move stays the same across both phases; the turn only passes after the give. We
 * model the two sub-actions as kinded intents so each is validated against the phase. */

import * as Q from './logic'
import type { QuartoState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Two sub-actions by the current placer, distinguished by `kind` + game phase. */
export type QuartoIntent =
  | { kind: 'place'; cell: number }
  | { kind: 'give'; piece: number }

const SEAT_OF: Record<Player, number> = { you: 0, ai: 1 }

export const quartoAdapter: GameAdapter<QuartoState, QuartoIntent> = {
  makeGame: () => Q.makeGame(),
  numSeats: () => 2,
  // The placer/giver is the current seat; both phases belong to s.turn until the give passes it.
  seatToMove: s => (s.winner || s.turn === null ? null : SEAT_OF[s.turn]),
  isOver: s => s.winner !== null,
  applyIntent: (s, seat, i) => {
    // Reject if game over, nobody to move, or it isn't this seat's turn.
    if (s.winner || s.turn === null || SEAT_OF[s.turn] !== seat) return s
    if (i.kind === 'place') {
      // Place phase only: a piece must be in hand and the cell must be empty.
      if (s.hand === null) return s
      if (i.cell < 0 || i.cell >= Q.NCELL || s.board[i.cell] !== null) return s
      return Q.place(s, i.cell)
    }
    // Give phase only: no piece in hand and the chosen piece must still be in the pool.
    if (s.hand !== null) return s
    if (i.piece < 0 || i.piece >= Q.NPIECE || !s.pool[i.piece]) return s
    return Q.hand(s, i.piece)
  },
  aiStep: s => Q.aiMove(s),
  // Changes on every transition: place flips hand→null + sets last; give flips hand back + passes turn.
  tickKey: s => `${s.last ?? -1}-${s.hand ?? -1}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
