/* CAN'T STOP — netplay adapter. Maps the pure push-your-luck logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything (dice, runners, markers,
 * claims) is PUBLIC, so no redactFor is needed.
 *
 * Seats map to the logic's two players: seat 0 = 'you', seat 1 = 'ai'. numSeats reads
 * the real player count (always 2 for this game) off the state. The SAME seat keeps
 * the move through roll -> pick -> roll … until it stops or busts, so seatToMove only
 * changes when the turn flips. The dice roll is RNG on the host (the authority); guests
 * just request a roll.
 *
 * Intents (JSON-serializable):
 *   { kind: 'roll' }            — roll the four dice (host RNG); a dead roll auto-busts
 *   { kind: 'pick', pairing }   — apply one of the three pairings (index 0..2)
 *   { kind: 'stop' }            — bank the runners, claim any topped columns, end turn
 *
 * applyIntent validates against the logic and returns the input state unchanged for any
 * illegal / out-of-turn intent (never throws). tickKey changes on EVERY action (it folds
 * in s.step, which the logic bumps on every roll/pick/stop/bust). */

import * as CS from './logic'
import type { CantStopState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type CantStopIntent =
  | { kind: 'roll' }
  | { kind: 'pick'; pairing: number }
  | { kind: 'stop' }

/** seat 0 = 'you', seat 1 = 'ai'. */
const SEAT_TO_PLAYER: Player[] = ['you', 'ai']
const playerToSeat = (p: Player): number => (p === 'you' ? 0 : 1)

const seatToMove = (s: CantStopState): number | null =>
  s.winner ? null : playerToSeat(s.turn)

export const cantStopAdapter: GameAdapter<CantStopState, CantStopIntent> = {
  makeGame: () => CS.makeGame(),
  // Two players ('you' + 'ai'); read it off the state so it stays honest if that changes.
  numSeats: s => Object.keys(s.perm).length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat across roll -> pick -> roll until
    // a stop/bust flips it). Never trust the wire: re-run the logic, which self-validates.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        // Legal only in 'preroll'. roll() returns the same ref if it can't run, and may
        // auto-bust (ending the turn) on a dead roll — both fine.
        if (s.phase !== 'preroll') return s
        const out = CS.roll(s)
        return out === s ? s : out
      }
      case 'pick': {
        // Legal only in 'choose', and only a usable pairing index advances; choose()
        // returns the same ref otherwise.
        if (s.phase !== 'choose' || typeof i.pairing !== 'number') return s
        const out = CS.choose(s, i.pairing)
        return out === s ? s : out
      }
      case 'stop': {
        // Legal only in 'preroll' with at least one runner banked; stop() guards this.
        const out = CS.stop(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single-action AI step. It only acts when s.turn === 'ai'
  // (seat 1) and the game is live, taking exactly ONE action per call (roll, pick, or
  // stop) — so the same AI seat is re-driven each tick until it stops or busts. The AI
  // dice RNG runs here on the host (the authority).
  aiStep: (s, seat) =>
    s.winner == null && SEAT_TO_PLAYER[seat] === s.turn ? CS.aiStep(s) : s,
  // Changes on EVERY action: the logic bumps s.step on every roll/pick/stop/bust, even
  // for back-to-back actions by the same seat. Fold in turn/phase/winner for clarity.
  tickKey: s => `${s.turn}-${s.phase}-${s.step}-${s.winner ?? ''}`,
}
