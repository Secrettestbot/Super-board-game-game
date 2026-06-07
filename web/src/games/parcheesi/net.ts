/* PARCHEESI — netplay adapter. Maps the pure cross-and-circle race onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything is PUBLIC (pawn positions,
 * the dice, bonuses), so no redactFor is needed. Seats map directly to player indices:
 * seat 0 = You, seats 1..3 = the rivals. numSeats reads the real player count off state.
 *
 * A turn has sub-steps, so each player decision is a JSON intent:
 *   { kind: 'roll' }                  — roll the TWO dice (host RNG); 3-doubles penalty and
 *                                       a no-legal-move pass resolve inside logic.roll().
 *   { kind: 'move', token, die }      — move pawn #token using a specific die value. `die`
 *                                       selects which face / bonus pool to consume; a value
 *                                       of 5 with both dice unused & summing to 5 falls back
 *                                       to the combined sum-to-5 release.
 *
 * The dice roll is RNG on the host (the authority); guests just request a roll. seatToMove
 * stays the SAME seat across the whole turn — through each separate die, capture/home bonus
 * moves, AND a doubles extra-turn re-roll (s.turn does not change until endTurn). The move
 * phase auto-finishes (and passes / hands the extra turn) inside logic once the dice + bonus
 * are spent, so there is no explicit 'pass' intent. applyIntent validates against the pure
 * logic and returns the input state unchanged for any illegal / out-of-turn intent. */

import * as P from './logic'
import type { ParState } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type ParcheesiIntent =
  | { kind: 'roll' }
  | { kind: 'move'; token: number; die: number }

const seatToMove = (s: ParState): number | null => (s.winner == null ? s.turn : null)

export const parcheesiAdapter: GameAdapter<ParState, ParcheesiIntent> = {
  makeGame: () => P.makeGame(),
  // Read the real player count off the state so any seat count reports automatically.
  numSeats: s => s.pawns.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll -> each die / bonus
    // move and any doubles extra turn). Never trust the wire: re-validate via the logic.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        if (s.phase !== 'roll' || s.rolled) return s
        const out = P.roll(s)
        return out === s ? s : out // roll() returns the same ref if it can't roll
      }
      case 'move': {
        if (s.phase !== 'move' || !s.rolled) return s
        if (typeof i.token !== 'number' || typeof i.die !== 'number') return s
        // Plain die / bonus move first; movePawn returns the same ref when illegal. It
        // auto-finishes the phase (doubles re-roll / turn pass) once dice + bonus are spent.
        let out = P.movePawn(s, seat, i.token, i.die)
        // Fall back to the combined sum-to-5 release (both dice unused, summing to 5).
        if (out === s && i.die === 5 && P.canReleaseWithSum(s, seat, i.token)) {
          out = P.releaseWithSum(s, seat, i.token)
        }
        if (out === s) return s // nothing applied — illegal move
        // A die may remain unused yet UNPLAYABLE (no legal pawn for it). movePawn only ends
        // the phase when both dice are spent, so close out a stuck phase here — keeps the
        // contract to roll/move (no explicit 'pass'): finishMovePhase drops the dead die and
        // hands the doubles extra-turn / next player. It no-ops while moves remain.
        return out.phase === 'move' ? P.finishMovePhase(out) : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single AI sub-step: it rolls if it hasn't, else plays its one
  // best legal (die / bonus / sum-release) move, auto-finishing the phase when spent. It only
  // acts for the seat at s.turn (and never the human seat 0). One action per call: tickKey
  // changes after each, so the AI timer re-arms until the seat hands off or the game ends.
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? P.aiStep(s) : s),
  // `step` is a monotonic counter bumped on EVERY action (roll, each die move, bonus move,
  // phase finish, turn pass), so it changes on every transition; turn / phase / winner ride
  // along for good measure.
  tickKey: s => `${s.step}-${s.turn}-${s.phase}-${s.winner ?? ''}`,
}
