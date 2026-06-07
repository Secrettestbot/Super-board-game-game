/* ZOMBIE DICE — netplay adapter. Maps the pure push-your-luck logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything (cup, hand, brains, shots,
 * scores) is PUBLIC, so no redactFor is needed.
 *
 * Seats map to the logic's two players: seat 0 = 'you', seat 1 = 'ai'/opponent. numSeats
 * reads the real player count off the state. The SAME seat keeps the move through
 * roll -> roll -> … until it stops or busts (three shotguns), so seatToMove only changes
 * when the turn flips. The dice draw + roll is RNG on the host (the authority); guests
 * just request a roll.
 *
 * Intents (JSON-serializable):
 *   { kind: 'roll' }   — draw up to 3 dice (host RNG) and roll; a third shotgun auto-busts
 *   { kind: 'stop' }   — bank this turn's brains, check the win, else pass the cup
 *
 * applyIntent validates against the logic and returns the input state unchanged for any
 * illegal / out-of-turn intent (never throws). tickKey changes on EVERY action: every
 * roll/stop/bust appends to s.log, and a bust/stop also flips s.turn — so the key (which
 * folds in s.log.length) is distinct for back-to-back same-seat rolls too. */

import * as ZD from './logic'
import type { ZombieState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type ZombieDiceIntent = { kind: 'roll' } | { kind: 'stop' }

/** seat 0 = 'you', seat 1 = 'ai'/opponent. */
const SEAT_TO_PLAYER: Player[] = ['you', 'ai']
const playerToSeat = (p: Player): number => (p === 'you' ? 0 : 1)

const seatToMove = (s: ZombieState): number | null =>
  s.winner || !s.turn ? null : playerToSeat(s.turn)

export const zombieDiceAdapter: GameAdapter<ZombieState, ZombieDiceIntent> = {
  makeGame: () => ZD.makeGame(),
  // Two players ('you' + 'ai'); read it off the state so it stays honest if that changes.
  numSeats: s => Object.keys(s.scores).length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat across roll -> roll until a
    // stop/bust flips it). Never trust the wire: re-run the logic, which self-validates.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        // roll() returns the same ref if it can't run, and may auto-bust (ending the
        // turn) on a third shotgun — both fine.
        const out = ZD.roll(s)
        return out === s ? s : out
      }
      case 'stop': {
        // stop() guards: legal only mid-turn (s.rolling) with the game live.
        const out = ZD.stop(s)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single-action AI step. It only acts when s.turn === 'ai'
  // (seat 1) and the game is live, taking exactly ONE action per call (roll or stop) — so
  // the same AI seat is re-driven each tick until it stops or busts. The AI dice RNG runs
  // here on the host (the authority).
  aiStep: (s, seat) =>
    s.winner == null && SEAT_TO_PLAYER[seat] === s.turn ? ZD.aiStep(s) : s,
  // Changes on EVERY action: every roll/stop/bust appends to s.log (a bust appends two),
  // so log.length advances even for back-to-back rolls by the same seat. Fold in the turn,
  // tallies and winner for clarity.
  tickKey: s =>
    `${s.turn ?? ''}-${s.brains}-${s.shots}-${s.rolling ? 1 : 0}-${s.log.length}-${s.winner ?? ''}`,
}
