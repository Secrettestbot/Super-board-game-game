/* SNAKES & LADDERS — netplay adapter. Maps the pure dice-race logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything is PUBLIC (positions, the
 * board layout, the die), so no redactFor is needed. Seats map directly to player
 * indices: seat 0 = You, seats 1+ = the rivals. numSeats reads the real player count off
 * the state.
 *
 * A turn is a single decision — ROLL — so there is exactly one intent:
 *   { kind: 'roll' }   — roll one d6 (host RNG) and move; ladders/snakes + win resolve.
 *
 * The roll is RNG on the host (the authority); guests just request a roll. After a roll
 * that neither wins nor earns an extra turn, the turn passes to the next player; a 6 keeps
 * the same seat to roll again (so seatToMove stays put through the bonus roll). applyIntent
 * validates and returns the input state unchanged for any illegal / out-of-turn intent. */

import * as SL from './logic'
import type { SLState } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type SnakesLaddersIntent = { kind: 'roll' }

const seatToMove = (s: SLState): number | null => (s.winner == null ? s.turn : null)

export const snakesLaddersAdapter: GameAdapter<SLState, SnakesLaddersIntent> = {
  makeGame: () => SL.makeGame(),
  // Read the real player count off the state so any seat count reports automatically.
  numSeats: s => s.positions.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn; never trust the wire. A non-'roll' intent is a no-op.
    if (seatToMove(s) !== seat || !i || i.kind !== 'roll') return s
    // Roll + move (host RNG). roll() returns the same ref if the game is already over.
    const rolled = SL.roll(s)
    if (rolled === s) return s
    if (rolled.winner != null) return rolled // game just ended — leave it for the result UI
    // End the turn: a 6/extraTurn keeps the same seat (re-armed to roll again), otherwise
    // it advances to the next player. Either way seatToMove now reflects who acts next.
    return SL.endTurn(rolled)
  },
  // Reuse the game's existing single-shot AI: it plays the seat's whole turn (rolling
  // through any 6 bonus turns) in one call, then hands the table to the next player or
  // ends the game. The AI dice RNG runs here on the host (the authority). It only acts for
  // the seat at s.turn (and never the human seat 0), and afterwards s.turn has advanced or
  // the game is over, so tickKey changes and the AI timer re-arms.
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? SL.aiTurn(s) : s),
  // Changes on EVERY action: step is a monotonic counter bumped on every roll/endTurn, and
  // turn / die / winner all move too.
  tickKey: s => `${s.step}-${s.turn}-${s.die ?? ''}-${s.winner ?? ''}`,
}
