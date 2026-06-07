/* TABLUT — netplay adapter. Maps the asymmetric tafl logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 *
 * Seats: 0 = DEFENDERS (King + Swedes — the side the solo human plays), 1 = ATTACKERS (the
 * solo AI side, which MOVES FIRST). The two seats command DIFFERENT armies — a guest joining
 * seat 1 drives the attackers while the host (seat 0) keeps the King and defenders. */

import * as TB from './logic'
import type { TablutState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** seat 0 = defenders, seat 1 = attackers. */
const SIDE: Side[] = ['def', 'att']
export const seatOf = (side: Side): number => (side === 'def' ? 0 : 1)

/** A move reduced to wire essentials: origin + destination squares. The host re-validates
 * against the legal set, so guest-supplied data is never trusted. */
export interface TablutIntent { from: number; to: number }

export const tablutAdapter: GameAdapter<TablutState, TablutIntent> = {
  makeGame: () => TB.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null) return s
    if (seatOf(s.turn) !== seat) return s
    // validate the move against this side's legal set before applying
    const ok = TB.movesFrom(s.board, i.from).includes(i.to) && TB.sideOf(s.board[i.from]) === s.turn
    return ok ? TB.move(s, { from: i.from, to: i.to }, s.turn) : s
  },
  aiStep: s => TB.aiMove(s),
  tickKey: s => `${s.last?.from ?? -1}-${s.last?.to ?? -1}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
