/* RAPTOR — netplay adapter. Maps raptor's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Asymmetric two-player: seat 0 = RAPTORS (mother + babies,
 * the side the solo human plays), seat 1 = SCIENTISTS (the solo AI side). A guest joining
 * seat 1 drives the scientists against the host's raptors.
 *
 * HIDDEN INFO: each side holds a PRIVATE hand of action cards 1..9 the opponent must not see,
 * and the round is a SIMULTANEOUS reveal — neither side may learn the other's chosen card
 * before committing its own. The seat-relative net layer is turn-based (one seat acts at a
 * time), so we model the simultaneous reveal as two sequential `play` intents WITHOUT ever
 * exposing the first card to the second player:
 *   - seat 0 plays a card  -> we PARK it in revealed[0] (phase stays 'reveal'); turn passes to 1.
 *   - seat 1 plays a card  -> we run revealCards(parked, card) then resolveRound() in one shot,
 *     so the transient 'resolve' phase never becomes a seat-to-move and the round fully settles.
 * Either seat may be the "first" mover depending on which seat is to move; the resolution math
 * (lower acts first, higher takes the main action) lives entirely in logic.ts and is unchanged.
 *
 * redactFor blanks the OTHER seat's hand (keeps the count) and, while a card is still parked
 * pre-resolution, blanks the opponent's parked card so seat 1 can't peek at seat 0's choice.
 * A leak test guards this. */

import * as R from './logic'
import type { State, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which action card this seat plays. */
export interface RaptorIntent { kind: 'play'; cardId: number }

/** Placeholder that hides a card's real value while preserving the count. */
const HIDDEN_CARD = 0

/**
 * Seat to move during the (possibly partial) reveal phase:
 *   - game over            -> null
 *   - reveal, no card parked yet (revealed[0] == null) -> seat 0 chooses first
 *   - reveal, seat 0 parked (revealed[0] != null, revealed[1] == null) -> seat 1 chooses
 *   - resolve              -> null (transient; collapsed inside applyIntent, never observed)
 */
function seatToMove(s: State): number | null {
  if (s.winner != null || s.phase === 'gameover') return null
  if (s.phase === 'reveal') return s.revealed[0] == null ? 0 : 1
  return null
}

export const raptorAdapter: GameAdapter<State, RaptorIntent> = {
  makeGame: () => R.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.phase !== 'reveal') return s
    if (i == null || i.kind !== 'play') return s
    if (seatToMove(s) !== seat) return s
    const card = i.cardId
    if (!s.hands[seat].includes(card)) return s

    if (seat === 0) {
      // Park seat 0's card; do NOT remove it from the hand yet (revealCards re-validates the
      // hand). Bump turn so the AI timer / tickKey re-arms and seat 1 becomes to-move.
      return { ...s, revealed: [card, null], turn: s.turn + 1 }
    }
    // seat 1: the parked seat-0 card completes the simultaneous reveal, then resolve in one shot.
    const p0 = s.revealed[0]
    if (p0 == null) return s
    const revealed = R.revealCards(s, p0, card)
    if (revealed === s) return s // reveal was rejected (shouldn't happen post-validation)
    return R.resolveRound(revealed)
  },
  // The AI (scientists) reuses the existing heuristics. It may be acting as the FIRST mover
  // (seat 1 to choose with nothing parked is impossible — seat 0 parks first; but when seat 1
  // is the AI it is always the second mover) — so it picks its card and completes the round.
  aiStep: (s, seat) => {
    if (s.winner != null || s.phase !== 'reveal') return s
    if (seat === 0) {
      // AI driving the raptors (e.g. guest took the scientists): park a heuristic card.
      const card = R.raptorChooseCard(s)
      return { ...s, revealed: [card, null], turn: s.turn + 1 }
    }
    // seat 1 (scientists AI): choose, reveal against the parked seat-0 card, resolve.
    const p0 = s.revealed[0]
    if (p0 == null) return s
    const card = R.aiChooseCard(s)
    const revealed = R.revealCards(s, p0, card)
    if (revealed === s) return s
    return R.resolveRound(revealed)
  },
  // Changes on EVERY action: turn bumps on each park, reveal and resolve.
  tickKey: s => `${s.turn}-${s.phase}-${s.revealed[0] ?? ''}-${s.revealed[1] ?? ''}-${s.winner ?? ''}`,
  // Hidden info: blank the OTHER seat's hand (keep its count). While a card is parked
  // pre-resolution (phase 'reveal'), also blank the opponent's parked card so the second
  // mover can't peek at the first mover's choice. Own hand + own parked card stay visible.
  redactFor: (s, seat) => {
    const other = (1 - seat) as Player
    const hands = s.hands.map((h, i) => (i === seat ? h : h.map(() => HIDDEN_CARD))) as State['hands']
    // Only redact the opponent's revealed entry while still in the reveal (pre-resolve) phase.
    const revealed = [...s.revealed] as State['revealed']
    if (s.phase === 'reveal' && revealed[other] != null) revealed[other] = HIDDEN_CARD
    return { ...s, hands, revealed }
  },
}
