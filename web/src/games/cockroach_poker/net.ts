/* COCKROACH POKER — netplay adapter. Maps the pure bluffing logic onto the uniform
 * GameAdapter so useGameSession can host/join it. 3 seats: 0 = You, 1, 2. Seats map
 * directly to the logic's player indices.
 *
 * HIDDEN INFO — two secrets must never reach a seat that hasn't legitimately seen them:
 *
 *  1. Each player's HAND. Hands are per-type counts (Record<Vermin, number>), so the
 *     secret is *which types* a rival holds. redactFor zeroes every OTHER seat's per-type
 *     counts and stashes their TOTAL hand size in a private `_handSizes` field, so the UI
 *     can still show "N in hand" without revealing the composition.
 *
 *  2. The face-down PASSED CARD's true identity (`pending.card`). Only legitimate seers may
 *     know it: the passer and anyone who peeked while relaying — i.e. exactly `pending.seenBy`.
 *     For a seat NOT in seenBy, redactFor masks `pending.card` to a hidden sentinel (keeping
 *     `claim`, `from`, `target`, `seenBy` public — those are visible at the table anyway).
 *
 * The state also carries a free-text `log`, which logic.ts writes the true card into when a
 * call resolves (after which it IS public). While a pass is still pending we must not leak the
 * hidden card through the log; logic only logs the card on RESOLUTION or on a peek-and-pass by
 * the acting seat, so the live `pending.card` never appears in the log for a non-seer. The leak
 * test guards all of this.
 */

import * as CP from './logic'
import type { CockroachState, Vermin } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Intents a seat can submit. card/claim/target are JSON-safe primitives. */
export type CockroachIntent =
  | { kind: 'pass'; cardId: Vermin; claim: Vermin; target: number }
  | { kind: 'guess'; truth: boolean }
  | { kind: 'passOn'; claim: Vermin; target: number }

/** Sentinel for a vermin type the viewing seat is not allowed to identify. */
const HIDDEN_VERMIN = '?' as unknown as Vermin

/** Redacted state carries hidden seats' hand TOTALS so the UI can render counts. */
export interface CockroachNetState extends CockroachState {
  _handSizes?: number[]
}

function zeroCounts(): Record<Vermin, number> {
  const o = {} as Record<Vermin, number>
  for (const v of CP.VERMIN) o[v] = 0
  return o
}

export const cockroachPokerAdapter: GameAdapter<CockroachNetState, CockroachIntent> = {
  makeGame: () => CP.makeGame() as CockroachNetState,

  // Read the real seat count off the state (3) rather than hardcoding.
  numSeats: s => s.hands.length,

  // Whoever must act now: the pending pass's target, or the seat starting a pass. null at game end.
  seatToMove: s => CP.decider(s),

  isOver: s => s.loser != null,

  applyIntent: (s, seat, intent) => {
    if (s.loser != null) return s
    const who = CP.decider(s)
    if (who !== seat) return s // not this seat's turn to act

    if (s.pending == null) {
      // This seat must START a pass.
      if (intent.kind !== 'pass') return s
      const { cardId, claim, target } = intent
      // Validate the move against the rules; pass() itself returns s unchanged if illegal,
      // but guard the inputs first so a malformed intent can never matter.
      if (!CP.VERMIN.includes(cardId) || !CP.VERMIN.includes(claim)) return s
      if (typeof target !== 'number' || target === seat || target < 0 || target >= s.hands.length) return s
      if (s.hands[seat][cardId] <= 0) return s
      return CP.pass(s, cardId, target, claim) as CockroachNetState
    }

    // A pass is pending on this seat: GUESS (call) or PASS IT ON (peek + relay).
    if (intent.kind === 'guess') {
      if (typeof intent.truth !== 'boolean') return s
      return CP.respondCall(s, intent.truth) as CockroachNetState
    }
    if (intent.kind === 'passOn') {
      const { claim, target } = intent
      if (!CP.VERMIN.includes(claim)) return s
      if (typeof target !== 'number') return s
      // respondPassOn validates eligibility (target hasn't seen it, isn't the passer) and
      // returns s unchanged when illegal.
      return CP.respondPassOn(s, target, claim) as CockroachNetState
    }
    return s
  },

  // Reuse the existing heuristic AI; aiStep only acts for non-human seats internally, but the
  // session calls it for whichever seat is an unfilled AI seat. The logic's aiStep guards
  // who===0, so drive the chosen seat by temporarily presenting it as the decider's logic.
  aiStep: s => CP.aiStep(s) as CockroachNetState,

  // Changes on EVERY transition: step is bumped by every mutating logic call.
  tickKey: s => `${s.step}-${s.loser ?? ''}`,

  // Strip what `seat` may not see: other seats' hand compositions and the hidden card.
  redactFor: (s, seat) => {
    const handSizes = s.hands.map(h => CP.handSize(h))
    const hands = s.hands.map((h, i) => (i === seat ? h : zeroCounts()))
    const out = Object.assign({}, s, { hands, _handSizes: handSizes }) as CockroachNetState

    if (s.pending != null) {
      // Reveal the true card only to legitimate seers (passer + prior peekers), or at game end.
      const maySee = s.loser != null || s.pending.seenBy.includes(seat)
      out.pending = maySee
        ? { ...s.pending }
        : { ...s.pending, card: HIDDEN_VERMIN }
    }
    return out
  },
}
