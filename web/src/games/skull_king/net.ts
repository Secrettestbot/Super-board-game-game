/* SKULL KING — netplay adapter. Maps the pure trick-taking logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to the logic's two
 * players: seat 0 = 'you' (the original human side, bids/leads first), seat 1 = 'ai' (the
 * rival). numSeats is 2.
 *
 * HIDDEN INFO: each player's HAND is private, and bids are sealed until BOTH are in.
 * redactFor therefore blanks every OTHER seat's hand cards (keeping the COUNT so the back
 * row still renders) and hides any bid that has not yet been revealed. A leak test guards
 * this.
 *
 * Two kinds of player decision, each a JSON intent:
 *   { kind: 'bid',  n }        — seal your wager for the round (bid phase)
 *   { kind: 'play', cardId }   — play a card for the current trick (play phase)
 *
 * MECHANICAL PHASES COLLAPSED: logic.ts exposes two NON-player transitions — collectTrick
 * (after a trick completes) and nextRound (after a round is scored). The solo UI drove
 * those with timers/buttons; over the wire there is no extra "seat" to drive them, so this
 * adapter folds them into the acting player's intent: after a play that completes a trick
 * we immediately collect it, score the round, and deal the next one. The networked phase a
 * player ever sees is thus only 'bid', 'play', or 'gameOver'. The trick-reveal pause is a
 * purely local animation in the component, derived from s.lastTrick.
 *
 * BIDDING NOTE: logic.submitBid is single-call — it records seat 0's bid AND auto-bids the
 * AI for seat 1 in the same step (logic.ts is immutable, so we cannot split it). seat 1's
 * bid is therefore always the AI's; only seat 0 holds the move during the bid phase. Once
 * both bids exist (phase flips to 'play') redactFor reveals them. */

import * as SK from './logic'
import type { SkullKingState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type SkullKingIntent =
  | { kind: 'bid'; n: number }
  | { kind: 'play'; cardId: number }

const PLAYER: Record<number, Player> = { 0: 'you', 1: 'ai' }

/** Resolve any pending mechanical phases (trickEnd -> collect, roundEnd -> deal next) so the
 * returned state is always a playable 'bid' / 'play' / 'gameOver'. Pure: chains immutable
 * logic transitions, never edits logic.ts. */
function settle(s: SkullKingState): SkullKingState {
  let cur = s
  // Bounded loop: each branch strictly advances the phase (trickEnd -> play|round end,
  // roundEnd -> next round's bid), so this terminates well within the iteration cap.
  for (let i = 0; i < 64; i++) {
    if (cur.phase === 'trickEnd') { cur = SK.collectTrick(cur); continue }
    if (cur.phase === 'roundEnd') { cur = SK.nextRound(cur); continue }
    break
  }
  return cur
}

/** Seat that must act, or null when the game is over. Only 'bid' and 'play' are ever live
 * (mechanical phases are collapsed by settle); during 'bid' only seat 0 acts. */
function seatToMove(s: SkullKingState): number | null {
  if (s.winner != null || s.phase === 'gameOver') return null
  if (s.phase === 'bid') return 0
  if (s.phase === 'play') return s.turn === 'you' ? 0 : 1
  return null
}

export const skullKingAdapter: GameAdapter<SkullKingState, SkullKingIntent> = {
  makeGame: () => SK.makeInitial('you'),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null || s.phase === 'gameOver',
  applyIntent: (s, seat, i) => {
    if (seatToMove(s) !== seat || !i) return s
    if (i.kind === 'bid') {
      if (s.phase !== 'bid' || seat !== 0 || typeof i.n !== 'number') return s
      if (i.n < 0 || i.n > s.round) return s
      const out = SK.submitBid(s, i.n) // records seat 0's bid + auto-bids the AI seat
      return out === s ? s : settle(out)
    }
    // play
    if (s.phase !== 'play' || typeof i.cardId !== 'number') return s
    const player = PLAYER[seat]
    // Re-validate against the live hand / legal set; never trust the wire.
    const out = SK.playCard(s, player, i.cardId)
    return out === s ? s : settle(out)
  },
  // Reuse the game's existing AI. It only acts during 'play' for the 'ai' seat; after its
  // card we settle any completed trick / scored round so the next state is playable.
  aiStep: (s, seat) => {
    if (seatToMove(s) !== seat) return s
    const out = SK.aiStep(s) // no-op unless phase==='play' && turn==='ai'
    return out === s ? s : settle(out)
  },
  // Changes on EVERY transition: round, phase, both bids, both trick counts, both scores,
  // the trick size, and the last-trick signature all move across a bid / play / collect /
  // round deal. winner can be 'tie'/'you'/'ai', so it is stringified directly.
  tickKey: s => {
    const lt = s.lastTrick ? `${s.lastTrick.winnerPlayer}.${s.lastTrick.cards.length}.${s.lastTrick.bonus}` : ''
    return [
      s.round, s.phase, s.bids.you ?? '', s.bids.ai ?? '',
      s.tricksWon.you, s.tricksWon.ai, s.scores.you, s.scores.ai,
      s.trick.length, lt, s.winner ?? '',
    ].join('-')
  },
  // Hidden info: blank every OTHER seat's hand cards (keep the count so the card-back row
  // renders) and hide a bid that is not yet revealed. A bid is revealed once BOTH bids are
  // in — i.e. once the bid phase is over. The viewing seat always sees its own hand + bid.
  redactFor: (s, seat) => {
    const me = PLAYER[seat]
    const bidsIn = s.bids.you != null && s.bids.ai != null
    const hideHand = (h: SkullKingState['hands']['you']) => h.map(() => HIDDEN_CARD())
    return {
      ...s,
      hands: {
        you: me === 'you' ? s.hands.you : hideHand(s.hands.you),
        ai: me === 'ai' ? s.hands.ai : hideHand(s.hands.ai),
      },
      // Reveal a bid only when both are sealed (phase left 'bid'); otherwise show only your own.
      bids: {
        you: bidsIn || me === 'you' ? s.bids.you : null,
        ai: bidsIn || me === 'ai' ? s.bids.ai : null,
      },
    }
  },
}

/** A neutral face-down placeholder hiding a card's real kind/suit/rank from other seats.
 * id stays a sentinel (-1) so no real card id ever crosses the wire to an opponent. */
function HIDDEN_CARD(): SkullKingState['hands']['you'][number] {
  return { id: -1, kind: 'escape' }
}
