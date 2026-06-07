/* ABALONE — netplay adapter. Maps abalone's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Black ('b', the original human / first mover), 1 = White ('w', the AI). */

import * as AB from './logic'
import type { AbaloneState, Key, Marble } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: the selected in-line group + a direction index. */
export interface AbaloneIntent { cells: Key[]; dir: number }

const SEAT: Marble[] = ['b', 'w'] // seat index -> marble
const seatOf = (m: Marble | null): number | null => (m === 'b' ? 0 : m === 'w' ? 1 : null)

export const abaloneAdapter: GameAdapter<AbaloneState, AbaloneIntent> = {
  makeGame: () => AB.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner || seatOf(s.turn) !== seat) return s
    const who = SEAT[seat]
    // Validate against the game's own legality check; reject anything illegal.
    if (!Array.isArray(i.cells) || !AB.tryMove(s.board, i.cells, i.dir, who)) return s
    return AB.applyMove(s, i.cells, i.dir, who)
  },
  aiStep: s => AB.aiMove(s, 2),
  tickKey: s => `${s.off.b}-${s.off.w}-${s.turn ?? ''}-${s.last.join('|')}-${s.winner ?? ''}`,
}
