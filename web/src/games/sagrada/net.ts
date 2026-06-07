/* SAGRADA — netplay adapter. Maps the dice-drafting stained-glass logic onto the
 * uniform GameAdapter so useGameSession can host/join it. Seats map directly to
 * player indices: seat 0 = You (the original human side), seat 1 = the rival.
 *
 * PUBLIC: the round's draft pool, BOTH players' windows, and the three public
 * objectives — all freely visible. HIDDEN: each player's PRIVATE objective (the
 * secret colour in s.secret). The dice are rolled fresh into the pool each round
 * from the host's RNG; there is no persistent dice "bag" in the state, so nothing
 * bag-shaped to redact (the pool is already public). redactFor therefore only
 * blanks the OTHER seat's secret colour, until the game is over (scores != null),
 * when both secrets are revealed for the final scoring display (matching the solo
 * UI). A leak test guards this so the opponent's secret colour never crosses the
 * wire mid-game.
 *
 * A turn is a single draft+place: pick a die from the pool and lead it into a cell
 * of your own window. seatToMove follows the snake order (s.turn). applyIntent
 * re-validates every placement against the live rules (canPlaceAt) and returns the
 * input state unchanged for any illegal / out-of-turn intent, so the host never
 * trusts a guest-supplied move. tickKey changes on every action (s.step bumps on
 * every place / skip / round roll / finish). aiStep reuses the existing greedy AI. */

import * as S from './logic'
import type { SagradaState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Wire intent: draft die `draftIndex` from the pool and place it at `cellIndex`, or
 * pass (skip the pick when no pooled die is legally placeable). */
export type SagradaIntent =
  | { kind: 'place'; draftIndex: number; cellIndex: number }
  | { kind: 'pass' }

/** A blanked-out private objective colour used to hide the other seat's secret. */
const HIDDEN_SECRET = '?' as unknown as S.Color

export const sagradaAdapter: GameAdapter<SagradaState, SagradaIntent> = {
  makeGame: () => S.makeGame(),
  // The state is fixed at two players (windows / secret are 2-tuples), but read it off
  // the windows array so the real player count drives the seat count.
  numSeats: s => s.windows.length,
  seatToMove: s => (s.winner == null && s.scores == null ? s.turn : null), // turn == seat
  isOver: s => s.winner != null || s.scores != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn and the game still live. Never trust the wire: re-validate.
    if (s.winner != null || s.scores != null) return s
    if (s.turn !== seat || !i) return s
    switch (i.kind) {
      case 'place': {
        if (typeof i.draftIndex !== 'number' || typeof i.cellIndex !== 'number') return s
        // placeDie itself rejects bad draft index / illegal placement (returns the
        // same ref), so this is fully validated by the logic.
        const out = S.placeDie(s, seat as Player, i.draftIndex, i.cellIndex)
        return out === s ? s : out
      }
      case 'pass': {
        // Only a legitimate pass when the seat truly cannot place any pooled die.
        if (S.hasLegalMove(s, seat as Player)) return s
        const out = S.skipPick(s, seat as Player)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the existing greedy AI, which drafts+places (or skips) for its own seat.
  aiStep: (s, seat) => (s.winner == null && s.scores == null && s.turn === seat ? S.aiTurn(s) : s),
  // Changes on EVERY action: step bumps on every place / skip / finish, turn flips with
  // the snake order, round advances on a fresh pool, and pool length shrinks each pick.
  tickKey: s => `${s.step}-${s.round}-${s.turn}-${s.picksThisRound}-${s.pool.length}-${s.winner ?? ''}`,
  // Hidden info: blank the OTHER seat's secret private-objective colour while the game
  // is live. Once it's over, reveal both for the final scoreboard (matches solo).
  redactFor: (s, seat) => {
    if (s.winner != null || s.scores != null) return s
    const secret = s.secret.map((c, i) => (i === seat ? c : HIDDEN_SECRET)) as [S.Color, S.Color]
    return { ...s, secret }
  },
}
