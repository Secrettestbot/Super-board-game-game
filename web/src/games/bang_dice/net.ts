/* BANG! THE DICE GAME — netplay adapter. Maps the pure dice-shootout logic onto the
 * uniform GameAdapter so useGameSession can host/join it. Seats map directly to player
 * indices: seat 0 = You, seats 1..3 = the other gunslingers. numSeats reads the real
 * player count off the state.
 *
 * A turn has sub-steps, so each player decision is a JSON intent:
 *   { kind: 'roll' }        — roll / reroll the 5 dice (host RNG); 3 rolls per turn, a
 *                             dynamite die can't be rerolled, a 3rd dynamite ends rolling.
 *   { kind: 'hold', idx }   — toggle whether die `idx` is kept between rolls.
 *   { kind: 'resolve' }     — resolve the kept dice (shots / arrows / beer / gatling).
 *   { kind: 'end' }         — end the turn and pass to the next live player.
 *
 * The dice roll is RNG on the host (the authority); guests just request a roll. seatToMove
 * stays the SAME seat through their whole roll -> reroll -> resolve -> end sequence
 * (s.turn does not change until endTurn). applyIntent validates and returns the input
 * state unchanged for any illegal / out-of-turn intent (never throws). tickKey changes on
 * every action via the logic's monotonic `step` counter (plus the dice/kept signature so a
 * pure 'hold' toggle — which does not bump step — still re-renders/re-arms).
 *
 * HIDDEN INFO: this build of BANG! Dice is a free-for-all "last gunslinger standing"
 * variant — there are no secret roles, hidden hands, or face-down cards. Every field of
 * the state (life, arrows, the central pile, and the current roller's dice) is PUBLIC to
 * all seats, exactly as in the solo UI. redactFor is therefore an honest identity: there
 * is genuinely nothing a guest may not see. It is still implemented per-seat (rather than
 * omitted) so the contract is explicit, and a leak test guards that no per-seat secret is
 * ever introduced without also redacting it.
 */

import * as BD from './logic'
import type { BangState } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type BangDiceIntent =
  | { kind: 'roll' }
  | { kind: 'hold'; idx: number }
  | { kind: 'resolve' }
  | { kind: 'end' }

/** Same seat acts through roll -> reroll -> resolve -> end; only endTurn advances turn. */
const seatToMove = (s: BangState): number | null => (s.winner == null ? s.turn : null)

export const bangDiceAdapter: GameAdapter<BangState, BangDiceIntent> = {
  makeGame: () => BD.makeGame(),
  // Read the real player count off the state so the seat count is always accurate.
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll -> resolve -> end).
    // Never trust the wire: re-validate against the pure logic, which returns the same
    // ref when it rejects an action — so an illegal intent yields the input state (===).
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll':
        return BD.rollDice(s)
      case 'hold':
        return typeof i.idx === 'number' ? BD.toggleKeep(s, i.idx) : s
      case 'resolve':
        return BD.resolveDice(s)
      case 'end':
        return BD.endTurn(s)
      default:
        return s
    }
  },
  // Reuse the game's existing aiStep, which performs exactly one sub-action for the seat
  // at s.turn (roll / keep+reroll / resolve / end) and bails on seat 0. The AI dice RNG
  // runs here on the host (the authority).
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? BD.aiStep(s) : s),
  // Changes on EVERY action. The logic bumps `step` on every state-advancing call
  // (roll/resolve/end); a 'hold' toggle does NOT bump step, so we also fold in the
  // dice + kept signature so a keep change still re-renders and re-arms the AI timer.
  tickKey: s =>
    `${s.turn}-${s.phase}-${s.step}-${s.rerollsLeft}-${s.rolled ? 1 : 0}-${s.dice.join(',')}-${s.kept.map(k => (k ? 1 : 0)).join('')}-${s.winner ?? ''}`,
  // No per-seat secrets in this free-for-all variant: every field is public to all seats.
  // Identity is the correct, honest redaction here (see file header). Implemented as a
  // function so the contract is explicit and the leak test has something concrete to guard.
  redactFor: s => s,
}
