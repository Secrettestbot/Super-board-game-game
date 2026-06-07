/* PATCHWORK — netplay adapter. Maps patchwork's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = the human side (player 0), 1 = the AI side (player 1).
 *
 * Patchwork's turn order is NOT alternating: a shared time track decides who moves —
 * whoever is FURTHER BACK goes next, so the SAME seat may move twice in a row. The single
 * source of truth is logic's toMove(s); we expose it as seatToMove. Each discrete action
 * is one intent:
 *   { kind: 'buy', patchId, cell, orientation } — buy a next-3 patch and place it at cell
 *   { kind: 'advance' }                         — advance past the opponent for buttons
 *
 * applyIntent validates the action against the game's own legality (toMove / canBuy /
 * canPlace inside buyPlace/advance) and returns the input state unchanged for an illegal
 * or out-of-turn intent. tickKey changes on EVERY action — including two consecutive moves
 * by the same seat — so the AI timer re-arms each time. */

import * as P from './logic'
import type { State, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type PatchworkIntent =
  | { kind: 'buy'; patchId: number; cell: number; orientation: number }
  | { kind: 'advance' }

const seatPlayer = (seat: number): Player | null => (seat === 0 ? 0 : seat === 1 ? 1 : null)

export const patchworkAdapter: GameAdapter<State, PatchworkIntent> = {
  makeGame: () => P.makeGame(),
  numSeats: () => 2,
  // toMove is logic's single source of truth; null only when both tokens have finished.
  seatToMove: s => (s.winner !== null ? null : P.toMove(s)),
  isOver: s => s.winner !== null,
  applyIntent: (s, seat, i) => {
    if (s.winner !== null) return s
    const who = seatPlayer(seat)
    if (who == null || P.toMove(s) !== who) return s
    if (i.kind === 'advance') return P.advance(s, who)
    if (i.kind === 'buy') {
      // The wire intent carries a flat cell index; buyPlace wants an (r0,c0) anchor.
      // buyPlace re-validates next-3 membership, affordability, orientation and placement,
      // returning the input state unchanged when anything is illegal.
      const r0 = Math.floor(i.cell / P.QN)
      const c0 = i.cell % P.QN
      return P.buyPlace(s, who, i.patchId, r0, c0, i.orientation)
    }
    return s
  },
  // aiTurn plays one full AI action (buy+place or advance) for player 1, leaving a fresh
  // tickKey so the timer re-arms even when player 1 is owed another turn.
  aiStep: (s, seat) => (seat === 1 ? P.aiTurn(s) : s),
  // Changes on EVERY action: clock is a monotonic counter bumped by advance and buyPlace,
  // so it differs after each move even when the same seat moves twice in a row.
  tickKey: s =>
    `${s.clock}-${s.players[0].pos}-${s.players[1].pos}-${s.neutral}-${s.winner ?? ''}`,
}
