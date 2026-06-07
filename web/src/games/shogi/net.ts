/* MINISHOGI (5x5) — netplay adapter. Maps shogi's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor is needed. Seats: 0 = Sente (you, bottom), 1 = Gote (top), matching
 * the logic's `turn` encoding.
 *
 * A move intent distinguishes a board move {from,to,promote?} from a drop
 * {drop,to}. applyIntent reconstructs the authoritative Move from the legal set
 * (board moves AND drops) so we never trust guest-supplied flags, and returns the
 * input state unchanged for an illegal or out-of-turn intent. */

import * as SH from './logic'
import type { State, PieceType } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A board move (from>=0, to, optional promote) OR a drop (drop=type, to). */
export interface ShogiIntent {
  from?: number
  to: number
  promote?: boolean
  drop?: PieceType
}

export const shogiAdapter: GameAdapter<State, ShogiIntent> = {
  makeGame: () => SH.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // Reconstruct the authoritative Move from the legal set (board moves + drops).
    const m = SH.legalMoves(s).find(mv =>
      i.drop != null
        ? mv.drop === i.drop && mv.to === i.to
        : mv.drop == null && mv.from === i.from && mv.to === i.to && !!mv.promote === !!i.promote,
    )
    return m ? SH.applyMove(s, m) : s
  },
  aiStep: s => SH.aiMove(s),
  tickKey: s => `${s.turn}-${s.winner ?? ''}-${s.last ? `${s.last.from}:${s.last.to}:${s.last.drop ?? ''}:${s.last.promote ? 'P' : ''}` : 'start'}`,
}
