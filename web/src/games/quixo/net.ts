/* QUIXO — netplay adapter. Maps quixo's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = X ('you', moves first), 1 = O ('ai'). */

import * as Q from './logic'
import type { State, Player, Dir } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A slide reduced to the wire essentials: which border cube, and the end it slides in from. */
export interface QuixoIntent { cell: number; dir: Dir }

const SEAT_TO_PLAYER: Player[] = ['you', 'ai'] // seat 0 = you (X), seat 1 = ai (O)
const seatOf = (p: Player | null): number | null => (p === 'you' ? 0 : p === 'ai' ? 1 : null)

export const quixoAdapter: GameAdapter<State, QuixoIntent> = {
  makeGame: () => Q.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? seatOf(s.turn) : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || seatOf(s.turn) !== seat) return s
    // Validate against the game's legal-move set; reject anything not legal for this seat.
    const ok = Q.legalMoves(s).some(m => m.cell === i.cell && m.dir === i.dir)
    return ok ? Q.applyMove(s, { cell: i.cell, dir: i.dir }) : s
  },
  aiStep: s => Q.aiTurn(s),
  tickKey: s => `${s.log.length}-${SEAT_TO_PLAYER.indexOf(s.turn as Player)}-${s.winner ?? ''}`,
}
