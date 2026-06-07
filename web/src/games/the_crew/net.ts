/* THE CREW — netplay adapter. Maps the cooperative trick-taking logic onto the
 * uniform GameAdapter so useGameSession can host/join it. Seats map directly to
 * crew indices: seat 0 = You (the host), seats 1.. = the other crewmates. numSeats
 * reads the real crew count off the hands array (always 3 for the current mission).
 *
 * CO-OP: everyone works toward the same shared goal, so the public TASK cards, the
 * mission log, the current/last trick and the limited communication are all PUBLIC
 * and stay intact.
 *
 * HIDDEN INFO: each crew member's HAND is private — you must not see your teammates'
 * cards (silent teamwork is the whole point). redactFor therefore blanks every OTHER
 * seat's hand to neutral placeholders while preserving the COUNT (so the UI can still
 * show how many cards each teammate holds). A leak test guards this.
 *
 * A turn is: play one card from your hand that follows suit when possible. The intent
 * is just { kind:'play', cardId }; we validate against legalCards + the live hand so
 * the host never trusts a guest-supplied move. A {kind:'communicate', cardId} intent is
 * reserved for the limited-communication token (revealing one card to teammates); the
 * current logic has no communication state, so it is accepted as a no-op (returns the
 * input state unchanged) and never mutates hidden info. */

import * as CR from './logic'
import type { Card, CrewState } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. `play` lays a card; `communicate` is the
 * (currently no-op) limited-communication token. */
export type TheCrewIntent =
  | { kind: 'play'; cardId: number }
  | { kind: 'communicate'; cardId: number }

/** A neutral placeholder hiding a teammate's real card id/suit/value. */
const HIDDEN: Card = { id: -1, suit: 'rocket', val: -1 }

/* Mission seed for the NEXT fresh game the adapter mints. makeGame() is the only seam
 * the host session uses to start a new state, so solo mission progression sets this
 * before remounting the session (online play just stays on the seeded mission). */
let _seedMission = 1
export function seedMission(n: number): void { _seedMission = Math.max(1, n) }

export const theCrewAdapter: GameAdapter<CrewState, TheCrewIntent> = {
  // Fresh game = the seeded mission (mission number is host/UI state).
  makeGame: () => CR.makeMission(_seedMission),
  // Real crew count off the state (min 2) so a different mission size reports correctly.
  numSeats: s => Math.max(2, s.hands.length),
  // turn (0/1/2) == seat index; null when the mission has ended or nobody is to move.
  seatToMove: s => (s.result == null ? s.turn : null),
  isOver: s => s.result != null,
  applyIntent: (s, seat, i) => {
    if (s.result != null || s.turn !== seat) return s
    // Limited-communication token: no communication state in the logic, so accept it as
    // a no-op rather than mutating anything (never leaks/changes hidden info).
    if (i.kind === 'communicate') return s
    const hand = s.hands[seat]
    if (hand == null) return s
    // Must be a card actually in this seat's hand AND a legal follow-suit play; never
    // trust a guest-supplied id. playCard re-validates too, but we gate up front.
    if (!hand.some(c => c.id === i.cardId)) return s
    if (!CR.legalCards(hand, s.trick).some(c => c.id === i.cardId)) return s
    return CR.playCard(s, seat, i.cardId)
  },
  // Reuse the existing co-op AI for non-local seats. aiStep plays for s.turn; the host
  // only calls this when it is an AI seat's turn (seat === s.turn), so this is safe.
  aiStep: (s, seat) => (s.turn === seat ? CR.aiStep(s) : s),
  // Changes on EVERY transition: turn advances each play, trickNo bumps per resolved
  // trick, and result flips at game end.
  tickKey: s => `${s.trickNo}-${s.turn ?? 'x'}-${s.result ?? ''}`,
  // Hidden info: blank every OTHER seat's hand to placeholders, preserving the count.
  // The viewing seat keeps its own real hand. Public tasks/trick/log are untouched.
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))),
  }),
}
