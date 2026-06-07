/* SKULL — netplay adapter. Maps skull's pure bluffing logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to player
 * indices: seat 0 = You, 1..3 = the other players (Rook / Mab / Cull).
 *
 * HIDDEN INFO: each player secretly places discs FACE-DOWN onto a personal stack.
 * Others must only see THAT a disc was placed (the stack height) and whatever the
 * rules have publicly flipped (s.flips during a challenge) — never the identity of a
 * still-face-down disc, and never the rose/skull split of a rival's remaining hand.
 *
 * redactFor therefore, for every OTHER seat:
 *   - replaces each still-face-down stack disc with a HIDDEN placeholder, keeping the
 *     ones that have been publicly flipped this challenge (the bottom `flippedCount`
 *     discs, since flips reveal top-down) as their true value;
 *   - collapses the hand into a count-only form ({roses: handSize, skulls: 0}) so the
 *     total disc count still renders, but the true rose/skull composition is hidden.
 * Your own seat is left fully intact (you know what you placed and hold).
 * A leak test in skull.net.test.ts guards this.
 */

import * as SK from './logic'
import type { SkullState, Disc, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Intents are the four human actions, reduced to JSON-serializable essentials. */
export type SkullIntent =
  | { kind: 'place'; disc: Disc }
  | { kind: 'bid'; n: number }
  | { kind: 'pass' }
  | { kind: 'flip'; target: number }

/** A face-down disc whose identity the viewer is not allowed to know. */
const HIDDEN_DISC = 'rose' as Disc // placeholder value; see redactFor for why it's safe

/** Whether `seat` is allowed to act right now in the given phase (drives seatToMove). */
function turnOf(s: SkullState): number | null {
  if (s.winner != null || s.phase === 'done') return null
  // 'place' / 'bid' / 'challenge' / 'reveal' are all driven by s.turn; in 'reveal' the
  // challenger advances to the next round via aiAct/nextRound.
  return s.turn
}

export const skullAdapter: GameAdapter<SkullState, SkullIntent> = {
  makeGame: () => SK.makeGame(),

  numSeats: s => s.players.length,

  seatToMove: s => turnOf(s),

  isOver: s => s.winner != null || s.phase === 'done',

  applyIntent: (s, seat, intent) => {
    // Out-of-turn or finished → unchanged. Each branch delegates to a pure logic
    // function that re-validates and returns the input state unchanged when illegal.
    if (s.winner != null || s.phase === 'done') return s
    if (s.turn !== seat) return s
    switch (intent.kind) {
      case 'place':
        if (s.phase !== 'place') return s
        return SK.place(s, seat, intent.disc)
      case 'bid':
        // A bid either OPENS the bidding (during 'place') or RAISES it (during 'bid').
        if (s.phase === 'place') return SK.openBid(s, seat, intent.n)
        if (s.phase === 'bid') return SK.bid(s, seat, intent.n)
        return s
      case 'pass':
        if (s.phase !== 'bid') return s
        return SK.pass(s, seat)
      case 'flip':
        if (s.phase === 'challenge') return SK.flip(s, intent.target)
        // 'reveal' has no flip target; advancing the round is the only move there.
        if (s.phase === 'reveal') return SK.nextRound(s)
        return s
      default:
        return s
    }
  },

  aiStep: (s, seat) => SK.aiAct(s, seat),

  // Changes on EVERY transition: s.actions is a monotonic counter bumped by every
  // logic function, plus phase/turn/bid so re-renders and the AI timer always re-arm.
  tickKey: s => `${s.phase}-${s.round}-${s.turn}-${s.bid ?? 'x'}-${s.flips.length}-${s.actions}-${s.winner ?? ''}`,

  // Hidden info: strip what `seat` may not see from every OTHER player.
  redactFor: (s, seat) => {
    const players: Player[] = s.players.map((p, i) => {
      if (i === seat) return p // you see your own discs and hand fully
      // Discs are flipped TOP-down during a challenge: the k-th flip on this stack
      // reveals stack[len-1-k]. So the top `flipped` discs are public, the rest are not.
      const flipped = s.flips.filter(f => f.player === i).length
      const stack: Disc[] = p.stack.map((disc, k) => {
        const fromTop = p.stack.length - 1 - k
        return fromTop < flipped ? disc : HIDDEN_DISC
      })
      // Collapse the hand to count-only: total renders, composition stays hidden. Both a
      // hand with a skull and one without map to the same redacted form, so nothing leaks.
      const hand = { roses: SK.handSize(p), skulls: 0 }
      return { ...p, stack, hand }
    })
    return { ...s, players }
  },
}
