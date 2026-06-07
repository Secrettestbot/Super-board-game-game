/* LUDO — netplay adapter. Maps the pure dice-race logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Everything is PUBLIC (token positions, the board, the
 * die), so no redactFor is needed. Seats map directly to player indices: seat 0 = You,
 * seats 1..3 = the rivals. numSeats reads the real player count off the state.
 *
 * A turn has two sub-steps, so each player decision is a JSON intent:
 *   { kind: 'roll' }          — roll one d6 (host RNG); a roll with no legal move auto-passes
 *   { kind: 'move', token }   — move one of your tokens by the rolled die
 *
 * The die is RNG on the host (the authority); guests just request a roll. seatToMove stays
 * the SAME seat through their roll -> move, AND through a 6's extra turn (s.turn does not
 * change). applyIntent validates against the logic and returns the input state unchanged for
 * any illegal / out-of-turn intent. tickKey changes on every action (s.step is bumped on
 * every roll / move / endTurn). */

import * as L from './logic'
import type { LudoState } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type LudoIntent = { kind: 'roll' } | { kind: 'move'; token: number }

const seatToMove = (s: LudoState): number | null => (s.winner == null ? s.turn : null)

export const ludoAdapter: GameAdapter<LudoState, LudoIntent> = {
  makeGame: () => L.makeGame(),
  // Read the real player count off the state so any seat count reports automatically.
  numSeats: s => s.tokens.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll -> move and through any
    // 6 extra turn). Never trust the wire: re-validate against the logic.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'roll': {
        // Only legal in the roll phase before a roll. roll() returns the same ref otherwise,
        // auto-passes the turn when there is no legal move, and may move on into 'move'.
        if (s.phase !== 'roll' || s.rolled) return s
        return L.roll(s)
      }
      case 'move': {
        // Only legal in the move phase, after a roll. moveToken validates the token index
        // (illegal -> same ref), applies capture/finish/extra-turn, and ends the turn.
        if (s.phase !== 'move' || !s.rolled || typeof i.token !== 'number') return s
        return L.moveToken(s, seat, i.token)
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single-shot AI: aiTurn plays the seat's whole turn (roll ->
  // best move, looping through any 6 extra turns) in one call. It only acts for the seat at
  // s.turn (and bails on human seat 0), and afterwards s.turn has advanced to the next
  // player or the game is over, so tickKey changes and the AI timer re-arms. The AI die RNG
  // runs here on the host (the authority).
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? L.aiTurn(s) : s),
  // Changes on EVERY action: step is a monotonic counter bumped on every roll / move /
  // endTurn, and turn / phase / die / winner all move too.
  tickKey: s => `${s.step}-${s.turn}-${s.phase}-${s.die ?? ''}-${s.winner ?? ''}`,
}
