/* SHUT THE BOX — netplay adapter. Maps the pure dice-and-tiles logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Two players each play one round from a
 * fresh box; the lower leftover sum wins. Everything (tiles, dice, scores) is PUBLIC, so
 * no redactFor is needed.
 *
 * Seats: 0 = You, 1 = the Rival/AI — matching the logic's Player union ('you' / 'ai').
 * numSeats reads the real count off the state (the game is always 2 here).
 *
 * A turn has sub-steps: the SAME seat rolls (host RNG) and then shuts tiles repeatedly
 * until it shuts the box (score 0) or gets stuck, at which point the turn hands off to the
 * other seat. Each decision is a JSON intent:
 *   { kind: 'roll', useOne? } — roll two dice, or a single die once 7/8/9 are all shut
 *   { kind: 'shut', tiles }   — flip down the chosen up-tiles (must sum exactly to the roll)
 *
 * The dice roll is RNG on the host (the authority); guests just request a roll. applyIntent
 * validates against the logic and returns the input state unchanged for any illegal /
 * out-of-turn intent. tickKey changes on every action. */

import * as SB from './logic'
import type { ShutBoxState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type ShutTheBoxIntent =
  | { kind: 'roll'; useOne?: boolean }
  | { kind: 'shut'; tiles: number[] }

const SEAT_OF: Record<Player, number> = { you: 0, ai: 1 }
const seatToMove = (s: ShutBoxState): number | null => (s.winner ? null : SEAT_OF[s.turn])

export const shutTheBoxAdapter: GameAdapter<ShutBoxState, ShutTheBoxIntent> = {
  makeGame: () => SB.makeGame(),
  // Two players (You + Rival). Read it off the scores object so the seat count is the
  // truth of the state rather than a hardcoded constant.
  numSeats: s => Object.keys(s.scores).length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (the same seat keeps the table through roll -> shut -> roll
    // until it gets stuck or shuts the box). Never trust the wire: re-validate via the logic.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        // roll() rejects (returns the same ref) if a roll is already on the table / over /
        // stuck; useOne is only honoured when 7,8,9 are all shut (the logic enforces this).
        const out = SB.roll(s, !!i.useOne)
        return out === s ? s : out
      }
      case 'shut': {
        if (!Array.isArray(i.tiles)) return s
        // shut() validates the subset (all up, distinct, sums exactly to the roll) and
        // returns the same ref when the subset is illegal or no roll is on the table.
        const out = SB.shut(s, i.tiles)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's aiStep, which advances the AI seat one sub-step (roll, else shut the
  // greedy subset). It only acts for the 'ai' seat; useGameSession re-arms via tickKey
  // until the AI's turn fully resolves. The AI dice RNG runs here on the host (authority).
  aiStep: (s, seat) => (seatToMove(s) === seat && s.turn === 'ai' ? SB.aiStep(s) : s),
  // Changes on EVERY action: whose turn, the dice signature, whether a roll is awaiting a
  // shut, the up-tile sum (drops on each shut), the recorded scores, and the winner.
  tickKey: s =>
    `${s.turn}-${s.dice[0]},${s.dice[1]}-${s.oneDie ? 1 : 0}-${s.rolled ? 1 : 0}-${s.stuck ? 1 : 0}-${SB.upSum(s.tiles)}-${s.scores.you ?? ''}-${s.scores.ai ?? ''}-${s.winner ?? ''}`,
}
