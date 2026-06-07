/* NO THANKS! — netplay adapter. Maps the pure push-your-luck logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Two seats: 0 = You ('you'), 1 = the
 * other player ('ai'). The logic encodes the turn as a Who string, so we map seat<->Who.
 *
 * HIDDEN INFO — two things a seat must never learn:
 *
 *  1. Each player's CHIP count is secret. The taken cards are public, the current face-up
 *     card and its pot are public, and the deck's REMAINING COUNT is public — but how many
 *     chips a rival is sitting on is private (it drives bluff/run decisions). redactFor
 *     blanks the OTHER seat's chip count to a sentinel and leaves the viewer's own intact.
 *
 *  2. The face-down DECK contents/order. Players know how many cards remain (deck.length),
 *     but not which numbers are still coming nor which nine were removed unseen. redactFor
 *     replaces every face-down card with a sentinel, preserving only the length.
 *
 * The free-text `log` only ever names cards once they are face-up or taken (all public),
 * and never prints a chip COUNT, so it can ride through unredacted. The leak test guards
 * that the rival's chip count and the deck's true numbers never cross the wire.
 */

import * as NT from './logic'
import type { NoThanksState, Who } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn action: take the face-up card (+ its pot) or pay a chip to pass. */
export type NoThanksIntent = { kind: 'take' } | { kind: 'pass' }

/** Sentinels for redacted secrets (kept distinct from any real value: chips/cards >= 0). */
const HIDDEN_CHIPS = -1
const HIDDEN_CARD = -1

/** seat 0 -> 'you', seat 1 -> 'ai'. */
const seatToWho = (seat: number): Who => (seat === 0 ? 'you' : 'ai')

export const noThanksAdapter: GameAdapter<NoThanksState, NoThanksIntent> = {
  makeGame: () => NT.makeGame(),

  // Two players always (logic is fixed 2-player), but read the real count off the state
  // (every game carries a chips record keyed by the active Who values).
  numSeats: s => Object.keys(s.chips).length,

  // Map the logic's Who turn onto a seat index; null when the game is over.
  seatToMove: s => (s.winner || s.turn == null ? null : s.turn === 'you' ? 0 : 1),

  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner != null) return s
    const who = seatToWho(seat)
    if (s.turn !== who || s.card == null) return s // not this seat's turn / nothing to act on
    if (intent.kind === 'take') return NT.take(s, who)
    if (intent.kind === 'pass') {
      if (s.chips[who] <= 0) return s // can't pass with no chips -> illegal, unchanged
      return NT.pass(s, who)
    }
    return s
  },

  // Reuse the existing heuristic AI. The logic's aiStep guards turn === 'ai', and the
  // session only calls this for an unfilled AI seat (seat 1).
  aiStep: s => NT.aiStep(s),

  // Changes on EVERY transition: the face-up card, the pot, whose turn, and the deck size
  // all move when something happens; combined they form a unique key per action.
  tickKey: s => `${s.card ?? 'x'}-${s.pot}-${s.turn ?? 'end'}-${s.deck.length}-${s.winner ?? ''}`,

  // Strip what `seat` may not see: the OTHER seat's chip count and the face-down deck.
  redactFor: (s, seat) => {
    const me = seatToWho(seat)
    const chips: Record<Who, number> = { ...s.chips }
    for (const w of Object.keys(chips) as Who[]) {
      if (w !== me) chips[w] = HIDDEN_CHIPS // rival's stack is secret
    }
    // Hide deck contents/order; keep only the count (length).
    const deck = s.deck.map(() => HIDDEN_CARD)
    return Object.assign({}, s, { chips, deck })
  },
}
