/* ONITAMA — netplay adapter. Maps onitama's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Board and cards are fully public (perfect info), so no
 * redactFor is needed. Seats: 0 = 'you' (bottom / Blue), 1 = 'ai' (top / Red).
 *
 * A move is a full {card, from, to}: pick a card from your hand, move a piece, and the used
 * card swaps into the shared middle. We encode the whole move as one intent and validate it
 * against legalMoves so the host never trusts guest-supplied capture flags. */

import * as ON from './logic'
import type { OnitamaState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

const SIDE: Side[] = ['you', 'ai'] // seat 0 -> bottom, seat 1 -> top
const seatOf = (side: Side | null): number | null => (side == null ? null : side === 'you' ? 0 : 1)

/** A move reduced to wire essentials, or a card-exchange pass (no legal move available).
 * The host reconstructs the authoritative Move and only honours a pass when truly stuck. */
export interface OnitamaIntent { card?: string; from?: number; to?: number; pass?: boolean }

export const onitamaAdapter: GameAdapter<OnitamaState, OnitamaIntent> = {
  makeGame: () => ON.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? seatOf(s.turn) : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null) return s
    const side = SIDE[seat]
    if (s.turn !== side) return s
    const legal = ON.legalMoves(s, side)
    // A pass is only lawful when the side genuinely has no move; never trust it otherwise.
    if (i.pass) return legal.length === 0 ? ON.passTurn(s, side) : s
    // Reconstruct the authoritative Move (capture flag) from the legal set.
    const m = legal.find(mv => mv.card === i.card && mv.from === i.from && mv.to === i.to)
    return m ? ON.applyMove(s, side, m) : s
  },
  aiStep: s => ON.aiMove(s),
  tickKey: s => `${s.last?.from ?? -1}-${s.last?.to ?? -1}-${s.middle}-${s.turn ?? 'over'}-${s.winner ?? ''}`,
}
