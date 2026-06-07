/* SUSHI GO! — netplay adapter. Maps the simultaneous card-drafting logic onto the
 * uniform GameAdapter so useGameSession can host/join it. Seats map directly to player
 * indices: seat 0 = You (the original human side), seats 1..2 = the others. numSeats
 * reads the real player count off the state's hands array.
 *
 * SIMULTANEITY: every player simultaneously keeps one card from their PRIVATE hand, all
 * reveal together, then hands pass to the left. The session is strictly one-seat-at-a-time,
 * so we SERIALIZE that window: seatToMove walks the lowest-indexed seat that still owes a
 * pick this turn (pending[seat] == null). Each seat submits one JSON intent:
 *   { kind: 'pick'; cardId; extraId? }   — keep a card (extraId = chopsticks double-pick)
 * applyIntent records the pick via the logic's setPick, and once EVERY seat has picked it
 * resolves the reveal (cards collected, hands rotate left, round scored if empty). aiStep
 * does the same for an AI seat. Because reveal is folded into the move that completes the
 * turn, seatToMove never returns null mid-draft.
 *
 * HIDDEN INFO: each player's HAND is private, and a not-yet-revealed pick must also stay
 * secret. redactFor therefore blanks every OTHER seat's hand cards AND every other seat's
 * pending/pendingExtra ids before a view crosses the wire. It ALSO strips the stashed
 * `_deck` (which makeGame hides on the state for redeals) — that field carries the entire
 * future card order and must never reach a guest; only the host redeals, so guests never
 * need it. Collected cards, scores, puddings and the log are all public. A leak test guards
 * this. winner is a string (never a seat int) so all guards are falsy-zero safe. */

import * as SG from './logic'
import type { SushiState, Card } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which hand card to keep (+ optional chopsticks 2nd). */
export interface SushiGoIntent { kind: 'pick'; cardId: number; extraId?: number }

/** A neutral placeholder hiding a card's real kind/value from other seats. */
const HIDDEN: Card = { id: -1, kind: 'tempura' }

/** Lowest seat that still owes a pick this draft turn, or null when nobody can move. */
function seatToMove(s: SushiState): number | null {
  if (s.phase !== 'draft') return null // roundEnd/gameEnd are resolved inside the move
  for (let seat = 0; seat < SG.NPLAYERS; seat++) if (s.pending[seat] == null) return seat
  return null
}

/** Resolve the reveal once every seat has registered a pick (folds round/game scoring in). */
function maybeReveal(s: SushiState): SushiState {
  return s.phase === 'draft' && SG.allPicked(s) ? SG.reveal(s) : s
}

export const sushiGoAdapter: GameAdapter<SushiState, SushiGoIntent> = {
  makeGame: () => SG.makeGame(),
  // Real player count off the state (min 2) so a future 3+ player state reports correctly.
  numSeats: s => Math.max(2, s.hands.length),
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Validate: must be this seat's turn, a well-formed pick, and the seat hasn't already
    // picked. setPick re-checks the card is in the seat's hand and returns s unchanged if not.
    if (seatToMove(s) !== seat) return s
    if (!i || i.kind !== 'pick' || typeof i.cardId !== 'number') return s
    if (s.pending[seat] != null) return s
    const picked = SG.setPick(s, seat, i.cardId, i.extraId)
    if (picked === s) return s // illegal card id -> unchanged
    return maybeReveal(picked)
  },
  // Reuse the existing AI: pick the seat's best card, then reveal if that completed the turn.
  aiStep: (s, seat) => {
    if (s.phase !== 'draft' || s.pending[seat] != null) return s
    const { cardId, extraId } = SG.aiPick(s, seat)
    const picked = SG.setPick(s, seat, cardId, extraId)
    if (picked === s) return s
    return maybeReveal(picked)
  },
  // Changes on EVERY action: setPick bumps step, reveal bumps step, scoring bumps step.
  tickKey: s => `${s.step}-${s.round}-${s.phase}-${s.pending.map(p => (p == null ? '_' : 'x')).join('')}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards and their not-yet-revealed pick ids,
  // and drop the stashed full deck so the future card order never crosses the wire.
  redactFor: (s, seat) => {
    const { _deck, ...rest } = s as SushiState & { _deck?: Card[] }
    void _deck
    return {
      ...rest,
      hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => ({ ...HIDDEN })))),
      pending: s.pending.map((p, i) => (i === seat ? p : p == null ? null : -1)),
      pendingExtra: s.pendingExtra.map((p, i) => (i === seat ? p : p == null ? null : -1)),
    } as SushiState
  },
}
