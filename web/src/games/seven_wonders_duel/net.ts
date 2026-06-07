/* SEVEN WONDERS DUEL — netplay adapter. Maps the pure drafting logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to players:
 * seat 0 = you (the original human side, moves first), seat 1 = the rival. numSeats is
 * fixed at 2.
 *
 * HIDDEN INFO: the age PYRAMID contains FACE-DOWN cards (slot.faceUp === false) that are
 * only revealed when they become accessible. Their identity must not cross the wire. The
 * public surface is everything else: face-up / accessible cards, both tableaus, both
 * players' wonders, the military + science tracks, coins, the discard pile and the shared
 * card rulebook (s.cards is the full immutable card catalog — the printed deck list, which
 * both players know). redactFor therefore blanks the `cardId` of every face-down slot
 * before a view crosses the wire, keeping the slot's POSITION, row, coverage and face-down
 * status (so counts/layout are intact) but hiding WHICH card hides there. A structural leak
 * test guards this. seat 1 (the AI side, when a guest takes it) shares the exact same hidden
 * info, so the redaction is seat-independent.
 *
 * A turn is: pick ONE accessible (uncovered) card and either BUILD it (construct), DISCARD
 * it for coins, or feed it to one of YOUR unbuilt WONDERS. Each intent is validated against
 * the live pyramid / affordability so the host never trusts a guest-supplied move. There is
 * no separate wonder-draft phase in this logic build — each side's 4 wonders are dealt at
 * makeGame — so the wonder intent is just { kind:'wonder', cardId, wonderId }.
 */

import * as G from './logic'
import type { SWDState } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials. `wonderId` is required only for the wonder kind. */
export type SWDIntent =
  | { kind: 'take'; cardId: string }
  | { kind: 'discard'; cardId: string }
  | { kind: 'wonder'; cardId: string; wonderId: string }

/** Placeholder hiding a face-down slot's real card id from both players. */
const HIDDEN_CARD = '?'

export const sevenWondersDuelAdapter: GameAdapter<SWDState, SWDIntent> = {
  makeGame: () => G.makeGame(),
  numSeats: () => 2,
  // turn (0/1) maps straight to the seat index; null once the game is decided.
  seatToMove: s => (s.winner == null ? s.turn : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // The card must be one currently draftable (accessible / uncovered) — never trust the wire.
    if (!i.cardId || !G.isAccessible(s, i.cardId)) return s
    if (i.kind === 'take') {
      // BUILD (construct) the card; logic rejects (returns same ref) if unaffordable.
      return G.buildCard(s, i.cardId)
    }
    if (i.kind === 'discard') {
      // DISCARD for coins (always legal for an accessible card).
      return G.discardForCoins(s, i.cardId)
    }
    if (i.kind === 'wonder') {
      // Feed the card to one of THIS seat's own unbuilt, affordable wonders.
      const w = s.players[seat].wonders.find(x => x.id === i.wonderId)
      if (!w || w.built || !G.canAffordWonder(s, seat as 0 | 1, w)) return s
      return G.buildWonder(s, i.cardId, i.wonderId)
    }
    return s
  },
  aiStep: s => G.aiTurn(s),
  // Changes on EVERY transition: step increments on every applied action (and AI pass).
  tickKey: s => `${s.step}-${s.turn}-${s.age}-${s.winner ?? ''}`,
  // Hidden info: blank the card id of every FACE-DOWN pyramid slot. Slot positions, rows,
  // coverage, face-down status and all empty (drafted) slots stay exactly as they are, so
  // counts/layout are preserved; only the identity of un-revealed cards is hidden.
  redactFor: s => ({
    ...s,
    pyramid: s.pyramid.map(sl =>
      !sl.faceUp && sl.cardId != null
        ? { ...sl, cardId: HIDDEN_CARD, covers: sl.covers.slice() }
        : { ...sl, covers: sl.covers.slice() },
    ),
  }),
}
