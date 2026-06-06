/* PHOTOSYNTHESIS — netplay adapter. Maps the pure logic onto the uniform GameAdapter
   so useGameSession can host/join it. Largely perfect information (board + sun are
   public), so no redactFor is needed. Seats map directly to player indices: seat 0 =
   you (the original human side), seat 1 = the rival.

   A round is each player taking a sequence of actions (plant / grow / collect) then an
   explicit end-of-turn, after which — when both have ended — the sun rotates and light
   is collected. Every player action (including end-turn) is modelled as one intent, so
   a guest sitting in seat 1 drives that seat exactly as the local human drives seat 0. */

import * as P from './logic'
import type { State, Action } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** An intent is just one of the game's plain Action objects (already JSON-serializable). */
export type PhotosynthesisIntent = Action

export const photosynthesisAdapter: GameAdapter<State, PhotosynthesisIntent> = {
  makeGame: () => P.makeGame(),
  // Read the real player count off the state rather than hardcoding it.
  numSeats: s => s.players.length,
  // The active player is the seat to move; null once the game is over.
  seatToMove: s => (s.phase === 'over' ? null : s.turn),
  isOver: s => s.phase === 'over',
  applyIntent: (s, seat, intent) => {
    // Out of turn or finished -> unchanged input state (same ref).
    if (s.phase === 'over' || s.turn !== seat) return s
    // End-turn is always a legal "action"; other actions must validate against the
    // game's own legality so we never trust a guest-supplied move.
    if (intent.type !== 'end' && !P.isLegal(s, seat as P.Player, intent)) return s
    return P.applyAction(s, intent)
  },
  // Reuse the existing greedy AI. aiTurn plays for s.turn (and is a no-op unless it's
  // that seat's turn / the game is live), taking one action per call so the driver can
  // pace multi-action AI turns by re-arming on tickKey.
  aiStep: s => P.aiTurn(s),
  // Changes on EVERY transition: step increments on each action AND each end-turn, and
  // round/turn/phase capture the round rollover the sun-rotation triggers.
  tickKey: s => `${s.step}-${s.round}-${s.turn}-${s.phase}`,
}
