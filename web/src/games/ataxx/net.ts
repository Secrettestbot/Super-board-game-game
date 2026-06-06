/* ATAXX — netplay adapter. Maps ataxx's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = you (cyan, 'y'), 1 = foe (magenta, 'f'). A side can pass when it has no
 * move, so seatToMove follows the state's actual `turn` rather than the move count. */

import * as AX from './logic'
import type { AtaxxState, Move, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: from/to squares and the clone flag. */
export interface AtaxxIntent { from: number; to: number; clone: boolean }

const SIDE: Side[] = ['y', 'f']                 // seat index -> side
const seatOf = (side: Side): number => (side === 'y' ? 0 : 1)

export const ataxxAdapter: GameAdapter<AtaxxState, AtaxxIntent> = {
  makeGame: () => AX.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null) return s
    if (seatOf(s.turn) !== seat) return s
    const who = SIDE[seat]
    // Reconstruct the authoritative Move from the legal set so guest-supplied flags
    // are never trusted; an unmatched (illegal) intent leaves the state untouched.
    const m: Move | undefined = AX.legalMoves(s.board, who).find(
      mv => mv.from === i.from && mv.to === i.to && mv.clone === i.clone,
    )
    return m ? AX.play(s, m, who) : s
  },
  // The AI plays whichever side is to move; aiMove drives 'f', bestMove fills 'y' if
  // a 'y' seat is ever AI-controlled (host always owns seat 0, so this is a safety net).
  aiStep: s => {
    if (s.winner != null || s.turn == null) return s
    if (s.turn === 'f') return AX.aiMove(s)
    const m = AX.bestMove(s.board, 'y', 2)
    return m ? AX.play(s, m, 'y') : s
  },
  tickKey: s => `${s.turn ?? '-'}-${s.last ? `${s.last.from}.${s.last.to}.${s.last.clone ? 'c' : 'j'}` : '-'}-${s.winner ?? ''}`,
}
