/* AIR, LAND & SEA — netplay adapter. Maps air_land_sea's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. 2 seats: 0 = You (the original lower
 * side, moves first in the opening battle), 1 = the Enemy.
 *
 * HIDDEN INFO. The secrets are:
 *   - each player's HAND of cards — only the owner may see their own hand,
 *   - the face-down DECK (the cards left over after the deal) — secret to both, but its
 *     COUNT is public.
 * Everything ON the board is public: a face-DOWN card on the field is a known strength-2
 * placement whose printed face is hidden from BOTH players (logic stores the real card but
 * the UI only ever shows strength 2), so the field crosses the wire intact for both seats.
 * redactFor therefore blanks every OTHER seat's hand cards and the whole face-down deck,
 * keeping their counts so the UI still renders the right number of card backs. A leak test
 * guards this STRUCTURALLY (card ids are NOT globally unique — the same id appears in the
 * deck used for each battle — so we never substring-scan the serialized view for an id).
 *
 * INTENTS are kinded:
 *   { kind: 'deploy'; cardId; theater; faceDown }  — play a card into a theater,
 *   { kind: 'withdraw' }                           — concede the battle,
 *   { kind: 'next' }                               — (host only, between battles) deal next.
 * applyIntent validates every field against the live hand / legalPlays so the host never
 * trusts a guest-supplied move, and returns the input state UNCHANGED for any illegal or
 * out-of-turn intent (never throws).
 *
 * BETWEEN BATTLES: when a battle ends but the war has not, the host (seat 0) advances to
 * the next battle via a `next` intent (no AI fills this seat, so it never auto-loops, and a
 * guest cannot trigger it — seatToMove reports seat 0 and dispatchLocal gates on seat 0).
 */

import * as ALS from './logic'
import type { State, Card, Seat } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. */
export type AirLandSeaIntent =
  | { kind: 'deploy'; cardId: number; theater: number; faceDown: boolean }
  | { kind: 'withdraw' }
  | { kind: 'next' }

/** A neutral placeholder hiding a card's real face (id/value/ability/theater) from other
 * seats. id -1 is not a real card id (real ids are 0..17), so it can never collide. */
const HIDDEN: Card = { id: -1, theater: 'air', value: -1, ability: 'none', name: '' }

export const airLandSeaAdapter: GameAdapter<State, AirLandSeaIntent> = {
  makeGame: () => ALS.makeGame(),
  numSeats: () => 2,

  seatToMove: s => {
    if (s.winner != null) return null
    // Battle (not war) over: the host (seat 0) owes the "next battle" advance.
    if (s.phase === 'battleOver') return 0
    return s.turn // Seat 0|1 maps directly to turn 0|1
  },

  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner != null) return s
    const seatT = seat as Seat
    if (s.phase === 'battleOver') {
      // Only the host advances battles; a guest can't (and AI doesn't fill this).
      if (intent.kind !== 'next' || seat !== 0) return s
      return ALS.nextBattle(s)
    }
    if (s.phase !== 'battle') return s
    if (s.turn !== seat) return s
    if (intent.kind === 'withdraw') {
      return ALS.withdraw(s, seatT) // re-validates phase/turn internally
    }
    if (intent.kind === 'deploy') {
      const card = s.hands[seatT].find(c => c.id === intent.cardId)
      if (!card) return s
      // The (card, theater, faceDown) triple must be a legal play for this seat.
      const legal = ALS.legalPlays(s, seatT).some(
        o => o.card.id === intent.cardId && o.theater === intent.theater && o.faceDown === intent.faceDown,
      )
      if (!legal) return s
      // play re-validates; returns the input state unchanged if illegal.
      return ALS.play(s, seatT, card, intent.theater, intent.faceDown)
    }
    return s
  },

  aiStep: (s, seat) => (seat === 1 ? ALS.aiTurn(s) : s),

  // Changes on EVERY transition: tick increments on every play, withdrawal, battle end and
  // fresh deal; turn/phase/winner cover the in-between states.
  tickKey: s => `${s.tick}-${s.turn ?? 'x'}-${s.phase}-${s.winner ?? ''}`,

  // Hidden info: blank every OTHER seat's hand cards and the whole face-down deck (counts
  // preserved so the UI shows the right number of card backs). The viewing seat keeps its
  // own real hand; the field (including face-down placements, already strength-2 to both)
  // and the VP/log are public and untouched.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))) as State['hands'],
    deck: s.deck.map(() => ({ ...HIDDEN })),
  }),
}
