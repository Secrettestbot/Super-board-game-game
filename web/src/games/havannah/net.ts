/* HAVANNAH — netplay adapter. Maps havannah's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Ember (player 0, first), 1 = Frost (player 1). The intent is the placed cell key. */

import * as HV from './logic'
import type { State, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: the empty cell key to place on. */
export interface HavannahIntent { cell: string }

export const havannahAdapter: GameAdapter<State, HavannahIntent> = {
  makeGame: () => HV.makeGame(6),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // place() itself validates winner/turn/occupancy and returns s unchanged otherwise,
    // but guard the seat<->turn match explicitly so a wrong-seat intent is a no-op.
    if (s.winner != null || s.turn !== seat) return s
    return HV.place(s, seat as Player, i.cell)
  },
  aiStep: s => HV.aiTurn(s),
  tickKey: s => `${s.cells.length - HV.legalMoves(s).length}-${s.turn}-${s.winner ?? ''}-${s.last ?? ''}`,
}
