/* LINES OF ACTION — netplay adapter. Maps the pure logic onto the uniform
   GameAdapter so useGameSession can host/join it. Perfect information, so no
   redactFor. Seats: 0 = Black (the original human, moves first), 1 = White. */

import * as LOA from './logic'
import type { LoaState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A chosen move reduced to from/to; the host reconstructs the authoritative Move. */
export interface LoaIntent { from: number; to: number }

const SIDE: Side[] = ['b', 'w'] // seat -> side
const seatOf = (d: Side): number => (d === 'b' ? 0 : 1)

export const linesOfActionAdapter: GameAdapter<LoaState, LoaIntent> = {
  makeGame: () => LOA.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || seatOf(s.turn) !== seat) return s
    const who = SIDE[seat]
    // Reconstruct the authoritative Move (capture flag) from the legal set,
    // so we never trust a guest-supplied flag.
    const m = LOA.movesFrom(s.board, i.from, who).find(mv => mv.to === i.to)
    return m ? LOA.play(s, m, who) : s
  },
  aiStep: s => LOA.aiMove(s),
  tickKey: s => `${s.log.length}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
