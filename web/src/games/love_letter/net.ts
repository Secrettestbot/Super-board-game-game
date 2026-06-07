/* LOVE LETTER — netplay adapter. Maps love_letter's pure deduction logic onto the
 * uniform GameAdapter so useGameSession can host/join it. 2 seats: 0 = You (the
 * original human side, player 0 in logic), 1 = the Rival (player 1).
 *
 * HIDDEN INFO. The secrets are:
 *   - each player's HAND cards (1 at rest, 2 on your turn) — only the owner may see them,
 *   - the face-down DRAW DECK (and the one set-aside card, which logic already popped out
 *     of the state, so it never crosses the wire at all).
 * redactFor blanks every OTHER seat's hand cards (keeping the COUNT so the UI can render
 * the right number of card backs) and replaces every deck card with a placeholder value
 * (keeping the deck length, which is public). DISCARDS stay fully public.
 *
 * The Priest `reveal` flag is computed by logic only for player 0's benefit (logic sets
 * `reveal` true when player 0 may peek / on its own turn / at round end). So the rival's
 * face-up card is surfaced only to seat 0 when `reveal` is set, and to BOTH seats at round
 * end (the showdown, where logic forces `reveal` true). A leak test guards all of this.
 *
 * BETWEEN ROUNDS: when a round ends but the game has not, the host (seat 0) advances to
 * the next round via a `next` intent (analogous to hearts' handover). No AI fills this, so
 * it never auto-loops, and guests cannot trigger it (dispatchLocal gates on seat 0).
 */

import * as LL from './logic'
import type { LoveLetterState, CardValue, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Intents: play a card (Guard names a card via `guess`; Prince targets via `target`),
 *  or (host only, between rounds) advance to the next round. */
export type LoveLetterIntent =
  | { kind: 'play'; card: CardValue; target?: Player; guess?: CardValue }
  | { kind: 'next' }

/** Placeholder card value used to mask hidden hand/deck cards on the wire. 0 is not a
 *  real CardValue (real values are 1..8), so it can never collide with a true card. */
const HIDDEN = 0 as unknown as CardValue

export const loveLetterAdapter: GameAdapter<LoveLetterState, LoveLetterIntent> = {
  makeGame: () => LL.makeGame(),
  numSeats: s => s.hands.length, // always 2

  seatToMove: s => {
    if (s.winner !== null) return null
    // Round (not game) over: the host (seat 0) owes the "next round" advance.
    if (s.roundOver) return 0
    return s.turn // Player 0|1 maps directly to seat 0|1
  },

  isOver: s => s.winner !== null,

  applyIntent: (s, seat, intent) => {
    if (s.winner !== null) return s
    if (s.roundOver) {
      // Only the host advances rounds; a guest can't (and AI doesn't fill this).
      if (intent.kind !== 'next' || seat !== 0) return s
      return LL.nextRound(s)
    }
    if (intent.kind !== 'play') return s
    if (s.turn !== seat) return s
    if (!LL.legalPlays(s, seat as Player).includes(intent.card)) return s
    // Reconstruct the authoritative options from the trusted intent fields; logic
    // validates targets/guesses internally and ignores anything spurious.
    const opts: LL.PlayOpts = {}
    if (intent.card === 1 && intent.guess !== undefined) opts.guardGuess = intent.guess
    if (intent.card === 5 && intent.target !== undefined) opts.princeTarget = intent.target
    return LL.play(s, intent.card, opts)
  },

  aiStep: (s, seat) => (seat === 1 ? LL.aiTurn(s) : s),

  // Changes on EVERY transition: turn flips, the discard pile grows on every play, the
  // deck shrinks on draws, and round/game flags flip at round/game end.
  tickKey: s =>
    `${s.turn ?? 'x'}-${s.discards.length}-${s.deck.length}-${s.roundOver ? 1 : 0}-${s.roundWinner ?? ''}-${s.winner ?? ''}`,

  // Hidden info: blank every OTHER seat's hand (keep the count so the UI shows the right
  // number of card backs) and blank the whole draw deck (keep its length — it is public).
  // The rival's real card is left visible only when logic has flagged a reveal that this
  // seat is entitled to (Priest peek for seat 0, or the round-end showdown for everyone).
  redactFor: (s, seat) => {
    const showdown = s.roundOver || s.winner !== null
    const hands = s.hands.map((h, i) => {
      if (i === seat) return h.slice()                       // your own hand: always real
      // The opponent's card is revealed to seat 0 when logic set `reveal` (a Priest peek),
      // and to everyone at the round-end showdown. Otherwise mask it.
      const maySee = showdown || (s.reveal && seat === 0)
      return maySee ? h.slice() : h.map(() => HIDDEN)
    })
    const deck = s.deck.map(() => HIDDEN)                     // face-down draw pile: masked
    return Object.assign({}, s, { hands, deck })
  },
}
