/* PIG — netplay adapter. Maps the pure push-your-luck dice logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything is PUBLIC (scores, turn
 * total, the die), so no redactFor is needed. Seats map to the two players:
 *   seat 0 = 'you', seat 1 = 'ai' (the remote opponent when online).
 *
 * The same seat acts many times before the turn passes: it ROLLs repeatedly to build a
 * turn total, then HOLDs to bank — or busts on a 1 (which passes the turn). So seatToMove
 * stays the same seat across a run of rolls. The die RNG is host-authoritative: a guest
 * just requests a roll and the host calls PG.roll (Math.random) to resolve it. applyIntent
 * validates and returns the input state unchanged for any illegal / out-of-turn intent.
 * tickKey changes on EVERY action (rollCount grows each roll), re-arming the AI timer so
 * the AI's dice land one at a time. */

import * as PG from './logic'
import type { PigState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type PigIntent = { kind: 'roll' } | { kind: 'hold' }

const SEAT: Record<number, Player> = { 0: 'you', 1: 'ai' }

const seatToMove = (s: PigState): number | null =>
  s.winner ? null : s.turn === 'you' ? 0 : 1

export const pigAdapter: GameAdapter<PigState, PigIntent> = {
  makeGame: () => PG.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through a run of rolls). Never trust
    // the wire: re-validate against the logic, which also guards turn/winner internally.
    if (seatToMove(s) !== seat || !i) return s
    const who = SEAT[seat]
    if (who == null) return s
    switch (i.kind) {
      // Host RNG: PG.roll draws the die here on the authority.
      case 'roll': return PG.roll(s, who)
      // hold returns the same ref when the turn total is 0, so illegal holds no-op.
      case 'hold': return PG.hold(s, who)
      default: return s
    }
  },
  // Reuse the game's existing aiStep: ONE action per call (roll until policy target, then
  // hold). It only acts for the 'ai' seat and bails otherwise, so guard on seat too.
  aiStep: (s, seat) => (SEAT[seat] === 'ai' ? PG.aiStep(s) : s),
  // Changes on EVERY action: rollCount grows on each roll, turnTotal/die change with it,
  // turn flips on hold/bust, busted toggles, scores grow on a bank, winner ends it.
  tickKey: s =>
    `${s.turn}-${s.turnTotal}-${s.rollCount}-${s.die ?? ''}-${s.busted ? 1 : 0}-${s.scores.you}-${s.scores.ai}-${s.winner ?? ''}`,
}
