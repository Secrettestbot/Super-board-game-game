/* SHOBU — netplay adapter. Maps shobu's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = you (Blue, bottom home boards), 1 = the rival (Coral, top home boards).
 *
 * A shobu turn is TWO linked moves — a PASSIVE move on a home board, then a matching
 * (same direction + distance) AGGRESSIVE move on a board of the opposite shade. It is ONE
 * turn, so the wire intent carries the COMPLETE turn — { passive, aggressive } — and
 * applyIntent performs it atomically: it confirms the pair appears in the game's
 * legalCombinedMoves for the seat, then applies passive-then-aggressive. If any part is
 * illegal, or it is not the seat's turn, it returns the input state UNCHANGED (never throws).
 * The local pick-passive-then-aggressive interaction stays local UI state; only the finished
 * two-move turn is dispatched. */

import * as SH from './logic'
import type { ShobuState, PassiveMove, AggressiveMove, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A complete shobu turn reduced to wire essentials: the passive slide + its matching push. */
export interface ShobuIntent {
  passive: PassiveMove
  aggressive: AggressiveMove
}

const samePassive = (a: PassiveMove, b: PassiveMove): boolean =>
  a.board === b.board && a.from === b.from && a.dir === b.dir && a.dist === b.dist && a.to === b.to

const sameAggressive = (a: AggressiveMove, b: AggressiveMove): boolean =>
  a.board === b.board && a.from === b.from && a.dir === b.dir && a.dist === b.dist && a.to === b.to

export const shobuAdapter: GameAdapter<ShobuState, ShobuIntent> = {
  makeGame: () => SH.makeGame(0),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : (s.turn as number)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null) return s
    const p = seat as Player
    if (s.turn !== p || s.phase !== 'passive') return s
    if (i == null || i.passive == null || i.aggressive == null) return s
    // Confirm the full turn is in the seat's legal set — never trust guest-supplied flags.
    const ok = SH.legalCombinedMoves(s, p).some(
      cm => samePassive(cm.passive, i.passive) && sameAggressive(cm.aggressive, i.aggressive),
    )
    if (!ok) return s
    // Apply atomically: passive (-> aggressive phase), then the matching aggressive.
    const afterP = SH.applyPassive(s, i.passive)
    if (afterP === s || afterP.phase !== 'aggressive') return s
    const after = SH.applyAggressive(afterP, i.aggressive)
    if (after === afterP) return s // aggressive rejected -> treat the whole turn as illegal
    return after
  },
  aiStep: s => SH.aiTurn(s),
  // Changes on every COMPLETED turn: whose turn + the last full move + winner.
  tickKey: s =>
    `${s.turn ?? '-'}-${s.phase}-${s.last?.board ?? ''}-${(s.last?.cells ?? []).join(',')}-${s.off[0]}-${s.off[1]}-${s.winner ?? ''}`,
}
