/* KONANE — netplay adapter. Maps konane's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = Black (basalt, the original human side, moves first), 1 = White (coral). */

import * as KO from './logic'
import type { KonaneState, Stone, Move } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: the origin square plus the ordered landing
 * squares (one per hop). For the two opening removals, `path` is empty. */
export interface KonaneIntent { from: number; path: number[] }

const SEAT_STONE: Stone[] = ['b', 'w'] // seat 0 -> black, seat 1 -> white
const seatOf = (turn: Stone | null): number | null =>
  turn === 'b' ? 0 : turn === 'w' ? 1 : null

export const konaneAdapter: GameAdapter<KonaneState, KonaneIntent> = {
  makeGame: () => KO.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null) return s
    const who = SEAT_STONE[seat]
    if (s.turn !== who) return s
    // Reconstruct the authoritative Move from the game's legal set so we never trust
    // guest-supplied paths. Opening phases are single removals (path === []); the play
    // phase is a capturing-jump line that must match a fully-enumerated legal turn.
    let m: Move | undefined
    if (s.phase === 'open1' || s.phase === 'open2') {
      if (i.path.length === 0 && KO.openingRemovals(s, who).includes(i.from)) {
        m = { from: i.from, path: [] }
      }
    } else {
      m = KO.legalMoves(s.board, who).find(
        L => L.from === i.from && L.path.length === i.path.length && L.path.every((p, k) => p === i.path[k]),
      )
    }
    return m ? KO.move(s, who, m) : s
  },
  aiStep: s => KO.aiMove(s),
  tickKey: s => `${s.phase}-${s.turn ?? ''}-${s.last.join(',')}-${s.winner ?? ''}`,
}
