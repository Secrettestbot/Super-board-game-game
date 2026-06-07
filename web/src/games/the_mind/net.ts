/* THE MIND — netplay adapter. Maps the cooperative, no-talking ascending-pile logic
 * onto the uniform GameAdapter so useGameSession can host/join it. Seats map directly
 * to player ids: seat 0 = you (the host), seats 1.. = your partners. numSeats reads the
 * real player count off the hands array (the logic always deals 3 hands).
 *
 * CO-OP: the team shares one goal, so the LEVEL, LIVES, SHURIKEN, the shared PILE, the
 * mistake/discard reveals and the log are all PUBLIC and stay intact.
 *
 * HIDDEN INFO: each player's HAND is private — the whole game is wordless timing, so you
 * must not see your partners' numbers. redactFor blanks every OTHER seat's hand to a
 * neutral placeholder (0) while preserving the COUNT, so the UI can still show how many
 * cards each partner holds. A leak test guards this.
 *
 * TIMING / "turns": The Mind has no real turns — the team must play every card in
 * ascending order, so the seat that should act next is whoever holds the single lowest
 * outstanding card. We surface that as seatToMove: a human there can play their lowest
 * (which is correct by construction); an AI there is driven by the host's existing co-op
 * timing AI (tick) until its threshold fires. This serializes the simultaneous game onto
 * the host-authoritative turn surface while keeping the AI's timing tension intact.
 *
 * INTENTS: { kind:'play' } plays your single lowest card; { kind:'star' } spends a
 * shuriken (everyone discards their lowest face up); { kind:'advance' } deals the next
 * level once the current one is cleared (host-only breather, mirrors the solo auto-step).
 * applyIntent validates against the live state and returns the input state UNCHANGED for
 * any illegal / out-of-turn move. */

import * as M from './logic'
import type { MindState, PlayerId } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. `play` lays your lowest; `star` spends a shuriken. */
export type TheMindIntent =
  | { kind: 'play' }
  | { kind: 'star' }
  | { kind: 'advance' }

/** The seat that should act next: the player holding the single lowest outstanding card. */
function lowestHolder(s: MindState): number | null {
  const lo = M.lowestOutstanding(s)
  return lo ? lo.player : null
}

export const theMindAdapter: GameAdapter<MindState, TheMindIntent> = {
  makeGame: () => M.makeGame(1),
  // Real player count off the state (min 2) — the logic deals 3 hands.
  numSeats: s => Math.max(2, s.hands.length),
  // Next to act = holder of the global lowest card. While a level is cleared but the game
  // continues (the inter-level breather), hand the turn to the host (seat 0) so it can deal
  // the next level. null only when the game is truly over.
  seatToMove: s => {
    if (s.phase !== 'playing') return null
    const holder = lowestHolder(s)
    if (holder != null) return holder
    return M.levelComplete(s) ? 0 : null
  },
  isOver: s => s.phase !== 'playing',
  applyIntent: (s, seat, i) => {
    if (s.phase !== 'playing') return s
    // Level breather: the host (seat 0) deals the next level once the current one cleared.
    if (i.kind === 'advance') {
      if (seat !== 0 || !M.levelComplete(s)) return s
      const next = M.advanceLevel(s)
      return next === s ? s : next
    }
    // A shuriken is a shared, any-holder action: allow it from the seat that is currently
    // "to move" (the lowest holder) so it round-trips through the turn surface; validate
    // there is a shuriken and someone holds a card (useShuriken no-ops otherwise).
    if (i.kind === 'star') {
      if (seat !== lowestHolder(s)) return s
      if (s.shuriken <= 0) return s
      const next = M.useShuriken(s)
      return next === s ? s : next
    }
    // play: only the seat holding the global lowest may play (its lowest IS the lowest
    // outstanding, so this is always a correct ascending play — never trust other seats).
    if (seat !== lowestHolder(s)) return s
    if (s.hands[seat] == null || s.hands[seat].length === 0) return s
    return M.playLowest(s, seat as PlayerId)
  },
  // Reuse the existing co-op timing AI. aiStep advances the simulation one tick; the host
  // only calls this when the seat to move is an AI seat, so the clock keeps running until
  // that partner's threshold fires and it plays its lowest.
  aiStep: s => M.aiStep(s),
  // Changes on EVERY transition: the clock ticks each aiStep, the pile top advances on
  // each play, level/lives/shuriken move on progress, and phase flips at game end.
  tickKey: s => `${s.clock}-${s.pileTop}-${s.level}-${s.lives}-${s.shuriken}-${s.phase}`,
  // Hidden info: blank every OTHER seat's hand to a neutral placeholder, preserving the
  // COUNT. The viewing seat keeps its own real hand. Public co-op info is untouched.
  //
  // The catch unique to The Mind: seatToMove is derived from the (hidden) hands — "who
  // holds the global lowest card". A guest computes its own isMyTurn from this view, so
  // the placeholders must reproduce the SAME seatToMove the host computed on the real
  // state — WITHOUT revealing any real card value. We do that with two constant sentinels:
  //   - the one seat that is genuinely to move gets a LOW sentinel (0), so the guest's
  //     seatToMove resolves to that seat (a fact the guest is allowed to know);
  //   - every other hidden seat gets a HIGH sentinel (never the minimum).
  // 0 only ever marks "this seat is to move" (public), never a real number; the HIGH
  // sentinel is a constant. Counts are preserved. Thresholds are host-only AI timing
  // internals derived from the AIs' lowest cards, so we blank them too.
  redactFor: (s, seat) => {
    const HIDDEN_HIGH = M.DECK_SIZE + 1   // above any real card (1..100): never the lowest
    const toMove = s.phase === 'playing' ? lowestHolder(s) : null
    return {
      ...s,
      hands: s.hands.map((h, i) =>
        i === seat ? h : h.map(() => (i === toMove ? 0 : HIDDEN_HIGH)),
      ),
      thresholds: s.thresholds.map(() => null),
    }
  },
}
