/* PARKS — netplay adapter. Maps the pure trail-walking logic onto the uniform
 * GameAdapter so useGameSession can host/join it.
 *
 * Seats map directly to players: seat 0 = player 0, seat 1 = player 1. numSeats reads
 * the real player count off the state (2 today, but future-proofed). All information in
 * parks is public — pools, parks, photos and the trail are visible to both players, and
 * the "canteen" merely grants a wild resource at resolve time (no hidden hand) — so this
 * is a perfect-information game and no redactFor is needed.
 *
 * Two action kinds exist: walking a hiker (moveHiker) and, once BOTH players have finished
 * the season, claiming park cards (buyPark) before the season advances (endSeason). The
 * solo game let the AI's aiTurn quietly buy + end the season; to make that work for ANY
 * seat (human or AI, host or guest) we drive the season-closing window through the adapter:
 * when both finish, seat 0 gets a buy window, then seat 1, then the season advances.
 */

import * as P from './logic'
import type { ParksState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. Discriminated by `kind`. */
export type ParksIntent =
  | { kind: 'move'; hiker: 0 | 1; site: number } // walk a hiker forward to a trail site or END
  | { kind: 'buy'; parkId: number }              // claim a park during the season-closing window
  | { kind: 'endTurn' }                          // finish your season-closing buying window

export const parksAdapter: GameAdapter<ParksState, ParksIntent> = {
  makeGame: () => P.makeGame(),

  // Real player count off the state (currently 2), future-proofed like chinese checkers.
  numSeats: s => s.players.length,

  // Whose turn it is. While the game is live there is always a seat to act: during normal
  // play it's s.turn; during the season-closing window s.turn designates the buyer.
  seatToMove: s => (s.winner == null ? s.turn : null),

  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner != null || s.turn !== seat) return s
    const closing = P.bothFinished(s)

    if (closing) {
      // Season-closing window: claim parks, then pass to advance.
      if (intent.kind === 'buy') {
        return P.canBuyPark(s, seat as Player, intent.parkId)
          ? P.buyPark(s, seat as Player, intent.parkId)
          : s
      }
      if (intent.kind === 'endTurn') {
        return advanceWindow(s, seat as Player)
      }
      return s // moves are illegal once both have finished
    }

    // Normal play: only a hiker move is legal.
    if (intent.kind !== 'move') return s
    const legal = P.legalMoves(s, seat as Player).some(
      m => m.hiker === intent.hiker && m.site === intent.site,
    )
    if (!legal) return s
    const ns = P.moveHiker(s, seat as Player, intent.hiker, intent.site)
    // If that move finished the season for both, open the buy window at seat 0 so every
    // seat gets a fair claim chance before the season advances.
    return P.bothFinished(ns) ? withTurn(ns, 0) : ns
  },

  // Reuse the existing AI. During normal play aiTurn picks + walks (and opportunistically
  // buys when it finishes). During the closing window we mirror the human flow per seat:
  // the AI claims its best affordable park, then passes the window onward.
  aiStep: (s, seat) => {
    if (s.winner != null) return s
    if (P.bothFinished(s)) {
      const bought = P.aiBuy(s, seat as Player)
      return advanceWindow(bought, seat as Player)
    }
    if (seat === 1) {
      // logic's AI is authored for player 1. If its move closes the season, force the buy
      // window to open at seat 0 so seat 0 gets a fair claim chance.
      const ns = P.aiTurn(s)
      return P.bothFinished(ns) && ns.winner == null ? withTurn(ns, 0) : ns
    }
    // Generic greedy fallback for any other AI seat: take the first real legal move.
    const moves = P.legalMoves(s, seat as Player)
    const m = moves.find(mv => mv.site !== P.END) ?? moves[0]
    if (!m) return s
    const ns = P.moveHiker(s, seat as Player, m.hiker, m.site)
    return P.bothFinished(ns) ? withTurn(ns, 0) : ns
  },

  // Changes on EVERY transition: step bumps on every state-changing action, and turn flips.
  tickKey: s => `${s.season}-${s.step}-${s.turn}-${s.winner ?? ''}`,
}

// ---- local helpers (no logic.ts edits) ------------------------------------------

// Return a state with a forced turn owner and a bumped step (so tickKey re-arms). Used to
// hand off the season-closing window without mutating logic's transition functions.
function withTurn(s: ParksState, turn: Player): ParksState {
  return { ...s, turn, step: s.step + 1 }
}

// Advance the season-closing buying window. Seat 0's window passes to seat 1; seat 1's
// window closes the season via endSeason (which reseeds / finishes and resets turn to 0).
function advanceWindow(s: ParksState, seat: Player): ParksState {
  if (!P.bothFinished(s)) return s
  if (seat === 0) return withTurn(s, 1)
  return P.endSeason(s)
}
