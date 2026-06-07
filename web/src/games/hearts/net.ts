/* HEARTS — netplay adapter. Maps hearts' pure trick-taking logic onto the uniform
 * GameAdapter so useGameSession can host/join it. 4 seats: 0 = You/South, 1 = West,
 * 2 = North, 3 = East (matches logic's seat indices).
 *
 * HIDDEN INFO: each seat's HAND is private. redactFor replaces every OTHER seat's hand
 * cards with a hidden placeholder (keeping the count so the UI renders the right number
 * of card backs) and, during passing, hides other seats' already-selected pass cards.
 * A leak test guards this.
 *
 * PASSING is concurrent in the real game (all four pick 3 at once, then logic's
 * applyPass resolves them together). The net layer is strictly turn-based, so the
 * adapter tracks each seat's submitted pass in an adapter-private `_passes` field on the
 * state (analogous to the fake secret game in net/session.test.ts). seatToMove walks the
 * seats that still owe a pass; once all four are in we call the real applyPass. The field
 * is part of the serialized state, so guests see it — which is exactly why redactFor must
 * blank the OTHER seats' entries.
 */

import * as H from './logic'
import type { State } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Intents: pick 3 cards to pass, play one card, or (host only) deal the next hand. */
export type HeartsIntent =
  | { kind: 'pass'; cardIds: number[] }
  | { kind: 'play'; cardId: number }
  | { kind: 'next' }

/** Adapter-private pass bookkeeping carried on the state during the passing phase. */
type Passes = (number[] | null)[]
export interface HeartsNetState extends State {
  _passes?: Passes
}

const HIDDEN_CARD = { id: -1, suit: 'C' as const, rank: 0 }

function passesOf(s: HeartsNetState): Passes {
  return s._passes ?? [null, null, null, null]
}

/** Lowest seat (0..3) that still owes a pass this hand, or null if all are in. */
function nextPasser(s: HeartsNetState): number | null {
  const p = passesOf(s)
  for (let seat = 0; seat < 4; seat++) if (p[seat] == null) return seat
  return null
}

/** Record `seat`'s pass; when all four are in, resolve via the real applyPass. */
function recordPass(s: HeartsNetState, seat: number, cardIds: number[]): HeartsNetState {
  const p = passesOf(s).slice()
  p[seat] = cardIds.slice()
  if (p.some(x => x == null)) {
    // still waiting on others — keep collecting
    return Object.assign({}, s, { _passes: p }) as HeartsNetState
  }
  // all four submitted: resolve the swap and drop the bookkeeping field
  const resolved = H.applyPass(s, p as number[][]) as HeartsNetState
  const out = Object.assign({}, resolved) as HeartsNetState
  delete out._passes
  return out
}

/** A seat's chosen 3-card pass is legal iff it is 3 distinct cards from that seat's hand. */
function legalPass(s: State, seat: number, cardIds: number[]): boolean {
  if (!Array.isArray(cardIds) || cardIds.length !== 3) return false
  const uniq = new Set(cardIds)
  if (uniq.size !== 3) return false
  const owned = new Set(s.hands[seat].map(c => c.id))
  for (const id of cardIds) if (!owned.has(id)) return false
  return true
}

export const heartsAdapter: GameAdapter<HeartsNetState, HeartsIntent> = {
  makeGame: () => H.makeGame() as HeartsNetState,
  numSeats: s => s.hands.length, // always 4

  seatToMove: s => {
    if (s.winner != null || s.phase === 'gameover') return null
    // Between hands the host (seat 0) advances to the next deal; no AI fills this so it
    // never auto-loops, and guests can't trigger it (dispatchLocal gates on seat 0).
    if (s.phase === 'handover') return 0
    if (s.phase === 'passing') return nextPasser(s)
    if (s.phase === 'playing') return s.turn
    return null
  },

  isOver: s => s.winner != null || s.phase === 'gameover',

  applyIntent: (s, seat, intent) => {
    if (s.winner != null) return s
    if (s.phase === 'handover') {
      if (intent.kind !== 'next' || seat !== 0) return s
      return H.nextHand(s) as HeartsNetState
    }
    if (s.phase === 'passing') {
      if (intent.kind !== 'pass') return s
      if (nextPasser(s) !== seat) return s // not this seat's turn to pass (or already passed)
      if (!legalPass(s, seat, intent.cardIds)) return s
      return recordPass(s, seat, intent.cardIds)
    }
    if (s.phase === 'playing') {
      if (intent.kind !== 'play') return s
      if (s.turn !== seat) return s
      if (!H.legalPlays(s, seat).some(c => c.id === intent.cardId)) return s
      // playCard preserves any (now-empty) _passes ref via Object.assign; fine to leave.
      return H.playCard(s, seat, intent.cardId) as HeartsNetState
    }
    return s
  },

  aiStep: (s, seat) => {
    if (s.phase === 'passing') {
      if (nextPasser(s) !== seat) return s
      return recordPass(s, seat, H.aiPass(s, seat))
    }
    if (s.phase === 'playing') return H.aiPlay(s, seat) as HeartsNetState
    return s
  },

  // Changes on EVERY transition: a pass adds a submitted entry; a play advances either
  // the trick length or the completed-trick counter (with a new leader/turn).
  tickKey: s => {
    const passed = passesOf(s).filter(x => x != null).length
    return `${s.handNo}-${s.phase}-${passed}-${s.played}-${s.trick.length}-${s.turn ?? 'x'}-${s.winner ?? ''}`
  },

  // Hidden info: replace every OTHER seat's hand with placeholders (keep the count so the
  // UI can render card backs), and during passing blank every OTHER seat's submitted pass
  // selection (keep null vs "done" distinguishable so the UI can show who is ready).
  redactFor: (s, seat) => {
    const hands = s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN_CARD }))))
    const out = Object.assign({}, s, { hands }) as HeartsNetState
    if (s._passes) {
      out._passes = s._passes.map((p, i) =>
        p == null ? null : i === seat ? p.slice() : p.map(() => -1),
      )
    }
    return out
  },
}
