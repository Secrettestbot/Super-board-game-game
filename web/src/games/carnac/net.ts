/* CARNAC — netplay adapter. Maps Carnac's pure Domineering logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information (both players see
 * the whole field), so no redactFor is needed.
 * Seats: 0 = Menhir (vertical, the original human side), 1 = Dolmen (horizontal). */

import * as CK from './logic'
import type { CarnacState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Seat <-> Side mapping. Seat 0 raises menhirs ('m'), seat 1 lays dolmens ('d'). */
const SIDE: Side[] = ['m', 'd']

/** A placement reduced to the wire essentials: the anchor cell index. */
export interface CarnacIntent { i: number }

export const carnacAdapter: GameAdapter<CarnacState, CarnacIntent> = {
  makeGame: () => CK.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner || s.turn == null ? null : SIDE.indexOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner || s.turn == null || s.turn !== SIDE[seat]) return s
    // place() itself re-validates legality and returns s unchanged for illegal anchors.
    return CK.place(s, i.i, SIDE[seat])
  },
  aiStep: s => CK.aiMove(s),
  tickKey: s => `${s.board.filter(v => v).length}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
