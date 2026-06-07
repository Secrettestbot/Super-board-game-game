/* THE FOX IN THE FOREST — netplay adapter. Maps the game's pure trick-taking logic onto
 * the uniform GameAdapter so useGameSession can host/join it. Two seats: 0 = 'you' (the
 * original human side, the first dealer's leader), 1 = 'ai' (the fox). The logic encodes
 * players as the string union 'you'|'ai', so the adapter translates seat<->player.
 *
 * HIDDEN INFO: each player's HAND is private, and the face-down DRAW pile (which the 5
 * "Treasure" power feeds from) is secret order. redactFor therefore blanks every OTHER
 * seat's hand cards (keeping the count so the table renders the right number of card
 * backs) and the entire draw pile. The decree, the cards already played to the current
 * trick, the captured piles, and the scores are all public and stay intact. A leak test
 * guards this.
 *
 * INTERMEDIATE (non-play) STEPS the net layer must drive, since the solo UI drove them
 * with local timers/buttons that no longer exist online:
 *   - SWAN (1) swap: after a player LEADS a 1 they may swap the decree (changing trump)
 *     before the follower acts. seatToMove returns the LEADER's seat during this window
 *     (until they resolve it), and the player decides via { kind:'swapDecree' } /
 *     { kind:'keepDecree' }. A '_swanDone' marker on the state records the decision so the
 *     window closes; it is adapter-private bookkeeping carried on the serialized state.
 *   - COLLECT: a completed trick parks in `pending` so both cards can be revealed.
 *     seatToMove returns the trick WINNER's seat; that side sends { kind:'collect' } (the
 *     component does so after a short reveal pause; aiStep does so when the winner is AI).
 *   - NEXT HAND: at 'handEnd' (a hand scored, game not yet won) seatToMove returns seat 0
 *     (always the host) so the host drives the next deal via { kind:'nextHand' }, mirroring
 *     "host controls new games".
 *
 * applyIntent validates every intent against the game's own legality (legalPlays / turn /
 * phase / canSwapDecree) and returns the input state unchanged for an illegal or
 * out-of-turn intent (never throws). aiStep reuses the game's existing aiStep, plus the
 * fox's natural choices for the intermediate steps (it never swaps the decree).
 */

import * as FX from './logic'
import type { FoxState, Player, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Move intents on the wire — all JSON-serializable plain objects. */
export type FoxIntent =
  | { kind: 'play'; cardId: number }       // play a card to the current trick
  | { kind: 'swapDecree'; cardId: number } // Swan (1): swap a hand card for the decree
  | { kind: 'keepDecree' }                 // Swan (1): decline the swap, keep trump
  | { kind: 'collect' }                    // collect a completed (revealed) trick
  | { kind: 'nextHand' }                   // deal the next hand at hand-end

/** Adapter-private state extension: records that a Swan swap window has been resolved. */
export interface FoxNetState extends FoxState {
  _swanDone?: boolean
}

/** A neutral placeholder hiding a card's real suit/rank/id from other seats. */
const HIDDEN: Card = { id: -1, suit: 'bells', rank: 0 }

const SEAT_TO_PLAYER: Record<number, Player> = { 0: 'you', 1: 'ai' }
const playerOf = (seat: number): Player | null => SEAT_TO_PLAYER[seat] ?? null
const seatOf = (p: Player): number => (p === 'you' ? 0 : 1)

/** True when `who` has just led a 1 and still owes a Swan swap/keep decision. */
function swanPending(s: FoxNetState, who: Player): boolean {
  return !s._swanDone && FX.canSwapDecree(s, who)
}

/** The leader who currently owes a Swan decision, or null. */
function swanLeader(s: FoxNetState): Player | null {
  if (s._swanDone || s.trick.length !== 1) return null
  const lead = s.trick[0]
  if (lead.card.rank !== 1) return null
  return swanPending(s, lead.player) ? lead.player : null
}

/** Strip the adapter-private marker so it never lingers past its window. */
function clearSwan(s: FoxNetState): FoxNetState {
  if (s._swanDone == null) return s
  const out = Object.assign({}, s) as FoxNetState
  delete out._swanDone
  return out
}

export const foxInForestAdapter: GameAdapter<FoxNetState, FoxIntent> = {
  makeGame: () => FX.makeGame(),
  numSeats: () => 2,

  seatToMove: s => {
    if (s.winner) return null
    if (s.phase === 'gameOver') return null
    // A scored (non-final) hand: the host deals the next one.
    if (s.phase === 'handEnd') return 0
    // A completed trick awaiting collection: its winner clears it.
    if (s.pending) return seatOf(s.pending.winner)
    // A leader owes a Swan decision before the follower may act.
    const swan = swanLeader(s)
    if (swan) return seatOf(swan)
    // Normal play.
    return seatOf(s.turn)
  },

  isOver: s => s.winner != null || s.phase === 'gameOver',

  applyIntent: (s, seat, intent) => {
    if (s.winner) return s
    const who = playerOf(seat)
    if (who == null) return s

    switch (intent.kind) {
      case 'nextHand':
        // Only the host (seat 0) deals, and only at a settled (non-final) hand.
        if (s.phase !== 'handEnd' || seat !== 0) return s
        return clearSwan(FX.nextHand(s))

      case 'collect':
        // Only the trick winner may collect, and only while a trick is pending.
        if (!s.pending || s.pending.winner !== who) return s
        return clearSwan(FX.collectTrick(s))

      case 'swapDecree': {
        // Only the leader who just led a 1 may swap, before the follower acts.
        if (swanLeader(s) !== who) return s
        const swapped = FX.swapDecree(s, who, intent.cardId)
        if (swapped === s) return s // illegal card id -> unchanged
        return Object.assign({}, swapped, { _swanDone: true }) as FoxNetState
      }

      case 'keepDecree':
        // Decline the Swan swap; close the window so the follower may act.
        if (swanLeader(s) !== who) return s
        return Object.assign({}, s, { _swanDone: true }) as FoxNetState

      case 'play': {
        // Can't play while a trick is pending, a hand is over, or a Swan decision is owed.
        if (s.pending || s.phase !== 'play') return s
        if (swanLeader(s) != null) return s
        if (s.turn !== who) return s
        const led = s.trick.length ? s.trick[0].card : null
        if (!FX.legalPlays(s.hands[who], led, s.trump).some(c => c.id === intent.cardId)) return s
        return clearSwan(FX.playCard(s, who, intent.cardId))
      }

      default:
        return s
    }
  },

  aiStep: (s, seat) => {
    if (s.winner) return s
    const who = playerOf(seat)
    if (who == null) return s
    // Host drives the next deal at hand-end (seat 0); never reached for the AI seat, but
    // handle defensively so the machine never stalls.
    if (s.phase === 'handEnd') return clearSwan(FX.nextHand(s))
    if (s.pending && s.pending.winner === who) return clearSwan(FX.collectTrick(s))
    // The fox never swaps the decree — it simply declines and plays on.
    if (swanLeader(s) === who) return Object.assign({}, s, { _swanDone: true }) as FoxNetState
    if (s.phase === 'play' && s.turn === who) return clearSwan(FX.aiStep(s))
    return s
  },

  // Changes on EVERY transition: hand number, phase, both hand sizes, trick length, the
  // pending flag, the Swan-decision marker, the turn, and the winner together move on each
  // legal action (play / swap / keep / collect / next-hand), re-arming the AI timer.
  tickKey: s =>
    `${s.hand}-${s.phase}-${s.hands.you.length}-${s.hands.ai.length}-${s.trick.length}-` +
    `${s.pending ? 1 : 0}-${s._swanDone ? 1 : 0}-${s.turn}-${s.winner ?? ''}`,

  // Hidden info: blank every OTHER seat's hand cards (keep the count for card backs) and
  // the entire face-down draw pile. The viewer's own hand, the decree, the live trick, the
  // captured piles, and the scores stay intact.
  redactFor: (s, seat) => {
    const me = playerOf(seat)
    return Object.assign({}, s, {
      hands: {
        you: me === 'you' ? s.hands.you : s.hands.you.map(() => ({ ...HIDDEN })),
        ai: me === 'ai' ? s.hands.ai : s.hands.ai.map(() => ({ ...HIDDEN })),
      },
      draw: s.draw.map(() => ({ ...HIDDEN })),
    }) as FoxNetState
  },
}
