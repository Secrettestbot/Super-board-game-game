/* TWIXT — netplay adapter. Maps TwixT's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = You (Coral, top↕bottom), 1 = Rival (Teal, left↔right) — matches Owner.
 *
 * Links are managed automatically by `place` (it auto-adds every non-crossing knight
 * link), so a move is fully described by the placed hole index. */

import * as TW from './logic'
import type { State } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: the hole the seat drops a peg into. */
export interface TwixtIntent { cell: number }

export const twixtAdapter: GameAdapter<State, TwixtIntent> = {
  makeGame: () => TW.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // `place` re-validates (legal hole, correct turn) and returns s unchanged if illegal.
    return TW.place(s, seat as TW.Owner, i.cell)
  },
  aiStep: s => TW.aiTurn(s),
  tickKey: s => `${s.last ?? -1}-${s.turn ?? 'x'}-${s.winner ?? ''}-${s.links.length}`,
}
