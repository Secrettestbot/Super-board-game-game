/* PARADE — netplay adapter. Maps parade's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to player indices: seat 0 = the
 * original human (acts first), seats 1 & 2 = the other players. numSeats reads the real
 * hand count off the state so it always reports the true table size.
 *
 * HIDDEN INFO: each player's HAND is private (the opponents must not see your cards), and
 * the face-down draw DECK's order/contents are secret. The PARADE line and every player's
 * COLLECTED pile are face-up / public. redactFor therefore blanks every OTHER seat's hand
 * cards and the whole deck (keeping their COUNTS so the UI can still show "N cards" / deck
 * size) before a view crosses the wire. A leak test guards this.
 *
 * A turn is: play one card from your hand to the end of the parade (resolving captures),
 * then auto-draw to refill — the draw is fixed by the logic, so the intent is just the
 * card id. We validate that the id is actually in the acting seat's live hand so the host
 * never trusts a guest-supplied card. */

import * as P from './logic'
import type { State, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which card (by stable id) to play. */
export interface ParadeIntent { kind: 'play'; cardId: number }

/** A neutral placeholder that hides a card's real id/color/value from other seats. */
const HIDDEN: Card = { id: -1, color: P.COLORS[0], value: -1 }

export const paradeAdapter: GameAdapter<State, ParadeIntent> = {
  makeGame: () => P.makeGame(),
  // Real player count off the state (min 2) so the true table size is always reported.
  numSeats: s => Math.max(2, s.hands.length),
  seatToMove: s => (s.winner == null && s.phase !== 'over' ? s.turn : null),
  isOver: s => s.winner != null || s.phase === 'over',
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.phase === 'over' || s.turn !== seat) return s
    if (i == null || i.kind !== 'play') return s
    // The card must be in THIS seat's live hand — never trust a guest-supplied card.
    const handIndex = s.hands[seat]?.findIndex(c => c.id === i.cardId) ?? -1
    if (handIndex < 0) return s
    return P.playCard(s, seat, handIndex)
  },
  aiStep: s => P.aiStep(s),
  // Changes on EVERY transition: every play appends to the log; turn + phase + remaining
  // round it out (finishGame nulls turn and flips phase to 'over').
  tickKey: s => `${s.log.length}-${s.turn ?? 'x'}-${s.phase}-${s.finalRemaining}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards and the whole face-down deck (keeping
  // counts). The viewing seat keeps its own real hand; the parade line and all collected
  // piles are public and untouched.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))),
    deck: s.deck.map(() => ({ ...HIDDEN })),
  }),
}
