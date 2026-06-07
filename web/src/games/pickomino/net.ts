/* PICKOMINO / HECKMECK — netplay adapter. Maps the pure push-your-luck dice logic onto
 * the uniform GameAdapter so useGameSession can host/join it. The tile row and EVERY
 * player's captured stack are PUBLIC, so no redactFor is needed.
 *
 * Seats map directly to player indices: seat 0 = You, seat 1/2 = the rivals. numSeats
 * reads the real player count off the state. The SAME seat rolls/keeps repeatedly until
 * it claims a tile (stop) or busts, so seatToMove only changes when the turn flips — but
 * the dice RNG runs on the host (the authority), so the key MUST change on every action.
 *
 * Intents (JSON-serializable):
 *   { kind: 'roll' }          — roll all dice not yet set aside (host RNG); a dead roll busts
 *   { kind: 'keep', face }    — set aside every die showing `face` (a value not taken this turn)
 *   { kind: 'claim', tile }   — stop and bank a tile (sum >= 21 with a worm); resolves take/steal
 *   { kind: 'stop' }          — same as claim: stop the turn and resolve a take/steal (or bust)
 *
 * applyIntent validates against the logic and returns the input state unchanged for any
 * illegal / out-of-turn intent (never throws). tickKey folds in s.log.length, which the
 * logic grows on EVERY action (roll/keep/stop/bust all push a log line) — so back-to-back
 * actions by the same seat still re-arm the AI timer. */

import * as P from './logic'
import type { PickominoState, Face } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type PickominoIntent =
  | { kind: 'roll' }
  | { kind: 'keep'; face: Face }
  | { kind: 'claim'; tile?: number }
  | { kind: 'stop' }

const seatToMove = (s: PickominoState): number | null =>
  s.phase === 'over' ? null : s.turn

export const pickominoAdapter: GameAdapter<PickominoState, PickominoIntent> = {
  makeGame: () => P.makeGame(),
  // Read the real player count off the state (You + the AIs) so it stays honest.
  numSeats: s => s.players.length,
  seatToMove,
  isOver: s => s.phase === 'over',
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat across roll -> keep -> roll … until
    // a stop/bust flips it). Never trust the wire: re-run the logic, which self-validates.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        // Legal only when no live roll is pending and dice remain in hand. rollDice may
        // auto-bust (ending the turn) on a dead roll — both fine.
        if (s.hasRolled || s.aside.length >= P.N_DICE) return s
        const out = P.rollDice(s)
        return out === s ? s : out
      }
      case 'keep': {
        // Set aside a value present in the current roll and not already taken this turn;
        // setAside returns the same ref otherwise.
        const out = P.setAside(s, i.face)
        return out === s ? s : out
      }
      case 'claim':
      case 'stop': {
        // Stop the turn and resolve the take/steal (the "claim"). The logic's stop()
        // requires a live, non-rolling state; reject mid-roll so a stale roll isn't
        // discarded — the player must keep a value first.
        if (s.hasRolled) return s
        const out = P.stop(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single-action AI step. It only acts when it's an AI seat's
  // turn (seat !== 0) and the game is live, taking exactly ONE action per call (roll, keep,
  // or stop) — so the same AI seat is re-driven each tick until it claims or busts. The AI
  // dice RNG runs here on the host (the authority).
  aiStep: (s, seat) =>
    s.phase !== 'over' && s.turn === seat && seat !== 0 ? P.aiStep(s) : s,
  // Changes on EVERY action: the log grows on every roll/keep/stop/bust (even back-to-back
  // same-seat actions). Fold in turn/phase/aside count/winner for clarity.
  tickKey: s =>
    `${s.turn}-${s.phase}-${s.hasRolled ? 1 : 0}-${s.aside.length}-${s.log.length}-${s.winner ?? ''}`,
}
