/* FANORONA — netplay adapter. Maps Fanorona's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = White (the original human, moves first), 1 = Black.
 *
 * Captures are mandatory and a capture can CHAIN: after a capture the same piece may
 * keep capturing, so the side to move stays the same mid-chain. We model the chosen
 * single step as an intent; the host validates it against legalMoves and applies one
 * step at a time, so seatToMove stays on the chaining seat until the chain resolves.
 * tickKey changes on every step (it folds in the chain cursor + last move) so the AI
 * timer re-arms for each step of its chain. An explicit 'stop' intent ends a chain. */

import * as FN from './logic'
import type { FanoronaState, CapKind, Piece } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** seat 0 = White, seat 1 = Black */
const SEAT_PIECE: Piece[] = ['w', 'b']
const seatOf = (p: Piece): number => (p === 'w' ? 0 : 1)

/** A move reduced to wire essentials, or a request to end the current capture chain. */
export type FanoronaIntent =
  | { kind: 'move'; from: number; to: number; cap: CapKind | null }
  | { kind: 'stop' }

export const fanoronaAdapter: GameAdapter<FanoronaState, FanoronaIntent> = {
  makeGame: () => FN.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null && s.turn != null ? seatOf(s.turn) : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || seatOf(s.turn) !== seat) return s
    if (i.kind === 'stop') {
      // Only meaningful while a chain is in progress; stopChain returns s unchanged otherwise.
      return s.chainAt !== null ? FN.stopChain(s) : s
    }
    // Reconstruct the authoritative Move from the legal set so we never trust the wire.
    const m = FN.legalMoves(s).find(
      mv => mv.from === i.from && mv.to === i.to && (mv.kind ?? null) === (i.cap ?? null),
    )
    return m ? FN.applyMove(s, m) : s
  },
  aiStep: s => FN.aiMove(s),
  // Changes on every transition: piece counts + chain cursor + last move + turn/winner.
  tickKey: s => {
    const { w, b } = FN.counts(s.board)
    const last = s.last ? `${s.last.from}>${s.last.to}` : '-'
    return `${w}-${b}-${s.chainAt ?? -1}-${last}-${s.turn ?? ''}-${s.winner ?? ''}`
  },
}

export { SEAT_PIECE, seatOf }
