/* GO — netplay adapter. Maps Go's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Black (the original human side), 1 = White (the AI side). */

import * as GO from './logic'
import type { GoState } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn is either placing a stone at `point` or passing. JSON-serializable. */
export type GoIntent = { kind: 'play'; point: number } | { kind: 'pass' }

export const goAdapter: GameAdapter<GoState, GoIntent> = {
  makeGame: () => GO.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn 0/1 == seat; null when over
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    if (i.kind === 'pass') return GO.pass(s)
    // GO.place validates (occupied / suicide / ko / out-of-turn) and returns s unchanged if illegal.
    return GO.place(s, seat as GO.Player, i.point)
  },
  aiStep: s => GO.aiMove(s),
  // Changes on EVERY transition: captures bump on captures, last/koPoint/passes on plays & passes,
  // turn flips each move, winner on game end. Together they re-arm the AI timer for any move.
  tickKey: s =>
    `${s.captures[0]}-${s.captures[1]}-${s.last ?? 'x'}-${s.koPoint ?? 'x'}-${s.consecutivePasses}-${s.turn}-${s.winner ?? ''}`,
}
