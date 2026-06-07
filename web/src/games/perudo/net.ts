/* PERUDO / DUDO — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. HIDDEN INFORMATION: each player's dice (under their cup)
 * are secret until a Dudo reveal tallies them. redactFor strips every OTHER seat's dice
 * values (keeping its die COUNT, which is public via s.counts) during the bidding phase, and
 * reveals everyone's dice only once the round resolves (phase 'reveal' or 'over').
 *
 * Seats map directly to player indices: seat 0 = the human side in solo, seats 1..n-1 the AI.
 * numSeats is read off state (s.counts.length) rather than hardcoded.
 *
 * The 'reveal' phase (after a Dudo) is an explicit step that must be advanced to deal the next
 * round. We make the die-loser (or, if eliminated, the next alive seat) the seat-to-move for
 * that step, so it flows through the same intent / AI machinery: that seat sends {kind:'continue'}
 * (or the AI advances it via aiStep -> nextRound). The new-round dice reroll happens inside
 * nextRound, which runs ONLY on the host (authority) -> host RNG. */

import * as P from './logic'
import type { PerudoState, Face } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** JSON-serializable move intents. 'challenge' is Dudo; 'continue' advances a reveal. */
export type PerudoIntent =
  | { kind: 'bid'; quantity: number; face: Face }
  | { kind: 'challenge' }
  | { kind: 'continue' }

/** Next alive seat strictly after `from` (wraps); falls back to `from`. */
function nextAlive(s: PerudoState, from: number): number {
  const n = s.counts.length
  for (let i = 1; i <= n; i++) {
    const p = (from + i) % n
    if (s.alive[p]) return p
  }
  return from
}

/** Who advances a reveal: the die-loser, or the next alive seat if they were eliminated. */
function revealMover(s: PerudoState): number {
  const loser = s.reveal ? s.reveal.loser : s.turn
  return s.alive[loser] ? loser : nextAlive(s, loser)
}

export const perudoAdapter: GameAdapter<PerudoState, PerudoIntent> = {
  makeGame: () => P.makeGame(),
  numSeats: s => s.counts.length,
  seatToMove: s => {
    if (s.phase === 'over' || s.winner != null) return null
    if (s.phase === 'reveal') return revealMover(s)
    return s.turn // bidding
  },
  isOver: s => s.phase === 'over' || s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.phase === 'over' || s.winner != null) return s
    if (s.phase === 'reveal') {
      // only the designated mover may roll the next round
      if (i.kind !== 'continue' || seat !== revealMover(s)) return s
      return P.nextRound(s)
    }
    // bidding phase
    if (s.turn !== seat) return s
    if (i.kind === 'challenge') {
      if (!s.bid) return s // nothing to call
      return P.callDudo(s, seat)
    }
    if (i.kind === 'bid') {
      // validate the raise before applying; bid() also no-ops on illegal, but be explicit.
      if (!P.isRaise(s.bid, { quantity: i.quantity, face: i.face }, s.palifico)) return s
      return P.bid(s, seat, i.quantity, i.face)
    }
    return s // 'continue' is meaningless during bidding
  },
  aiStep: s => {
    // During a reveal the AI mover just rolls on; during bidding it bids/calls Dudo.
    if (s.phase === 'reveal') return P.nextRound(s)
    return P.aiTurn(s)
  },
  // actionSeq bumps on EVERY transition (bid / dudo / nextRound), so it alone re-arms the timer.
  tickKey: s => `${s.actionSeq}-${s.phase}-${s.turn}-${s.winner ?? ''}`,
  redactFor: (s, seat) => {
    // Reveal everyone once the round resolves; otherwise hide every OTHER seat's dice values
    // (die COUNTS stay public via s.counts). We blank foe dice to [] so no value crosses the wire.
    if (s.phase === 'reveal' || s.phase === 'over') return s
    return Object.assign({}, s, {
      dice: s.dice.map((d, p) => (p === seat ? d : [])),
    })
  },
}
