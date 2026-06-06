/* HNEFATAFL (Brandubh, 7x7) — netplay adapter. Maps the asymmetric tafl logic onto the
 * uniform GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor is needed.
 *
 * Seats: 0 = DEFENDERS (the King + guard — the side the solo human plays), 1 = ATTACKERS
 * (the solo AI side, which moves first). The two seats control DIFFERENT armies — a guest
 * joining seat 1 drives the eight attackers while the host (seat 0) keeps the King's side.
 *
 * Note the game's own AI (aiTurn) only plays the attackers, so it is exactly the engine the
 * host runs to fill an empty seat 1 — matching the solo experience. */

import * as T from './logic'
import type { State, Side, Move } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** seat 0 = defenders (King side), seat 1 = attackers. */
const SIDE: Side[] = ['defenders', 'attackers']
export const seatOf = (side: Side): number => (side === 'defenders' ? 0 : 1)

/**
 * A move reduced to wire essentials: origin + destination square indices. The host
 * reconstructs/validates against the legal set, so guest-supplied data is never trusted.
 */
export interface TaflIntent { from: number; to: number }

export const taflAdapter: GameAdapter<State, TaflIntent> = {
  makeGame: () => T.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null) return s
    if (seatOf(s.turn) !== seat) return s
    // Validate the move against this side's legal rook moves; applyMove re-checks too, but we
    // gate here so an illegal intent provably returns the input state unchanged.
    const legal = T.legalMoves(s.board, s.turn)
    const ok = legal.some((m: Move) => m.from === i.from && m.to === i.to)
    return ok ? T.applyMove(s, i.from, i.to, s.turn) : s
  },
  aiStep: s => T.aiTurn(s),
  tickKey: s => `${s.last?.from ?? -1}-${s.last?.to ?? -1}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
