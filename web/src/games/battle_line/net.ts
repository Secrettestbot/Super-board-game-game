/* BATTLE LINE — netplay adapter. Maps battle_line's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to players:
 * seat 0 = you (the original lower side, moves first), seat 1 = the opponent.
 *
 * HIDDEN INFO: each player's HAND of troop cards is private, and the face-down troop
 * DECK is secret (only its count is public). The formations played to each flag and the
 * claimed flags are public. redactFor therefore blanks every OTHER seat's hand cards and
 * the whole draw deck (keeping counts so the UI can still show "N in deck") before a view
 * crosses the wire. A leak test guards this.
 *
 * A turn is two steps: PLAY one of your hand cards onto a flag's side, then DRAW from the
 * deck. (This build has a single troop deck — no separate tactics deck — so the draw
 * intent's `deck` is informational; there is one pile to draw from.) Each step is its own
 * intent so the UI animates them separately:
 *   { kind: 'play', cardId, flag }   then   { kind: 'draw', deck }
 * A flag may also be CLAIMED whenever it's decided (a separate { kind: 'claim', flag }
 * intent), exactly as in solo play, so solo behaviour is unchanged.
 *
 * We validate every intent against the live state / legalPlays and the seat's own hand so
 * the host never trusts a guest-supplied move; illegal or out-of-turn intents return the
 * input state unchanged (never throw). */

import * as BL from './logic'
import type { BattleLineState, Card, Seat } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. */
export type BattleLineIntent =
  | { kind: 'play'; cardId: number; flag: number }
  | { kind: 'draw'; deck: 'troop' }
  | { kind: 'claim'; flag: number }

/** A neutral placeholder hiding a card's real id/colour/value from other seats. */
const HIDDEN: Card = { id: -1, colour: 'R', value: -1 }

export const battleLineAdapter: GameAdapter<BattleLineState, BattleLineIntent> = {
  makeGame: () => BL.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null) return s
    const seatT = seat as Seat
    // A claim can happen on either phase of the seat's own turn (claimFlag re-checks).
    if (i.kind === 'claim') {
      if (s.turn !== seat) return s
      if (!BL.canClaim(s, i.flag, seatT)) return s
      return BL.claimFlag(s, i.flag, seatT)
    }
    if (s.turn !== seat) return s
    if (i.kind === 'play') {
      if (s.phase !== 'play') return s
      const card = s.hands[seatT].find(c => c.id === i.cardId)
      if (!card) return s
      if (!BL.legalPlays(s, seatT).includes(i.flag)) return s
      // playCard re-validates; returns the input state unchanged if illegal.
      return BL.playCard(s, seatT, card, i.flag)
    }
    if (i.kind === 'draw') {
      // drawCard guards the phase itself (only draws in the draw phase, or forfeits a
      // deadlocked play phase) and passes the turn; returns unchanged if illegal.
      return BL.drawCard(s, seatT)
    }
    return s
  },
  aiStep: s => BL.aiTurn(s),
  // Changes on EVERY transition: tick increments on every play, draw and AI action.
  tickKey: s => `${s.tick}-${s.turn ?? ''}-${s.phase}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards and the whole face-down deck (counts
  // preserved). The viewing seat keeps its own real hand; flags/claims are public.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))) as BattleLineState['hands'],
    deck: s.deck.map(() => ({ ...HIDDEN })),
  }),
}
