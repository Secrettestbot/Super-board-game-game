/* WATERGATE — netplay adapter. Maps the asymmetric Post-vs-Nixon tug-of-war logic onto
 * the uniform GameAdapter so useGameSession can host/join it.
 *
 * Seats: 0 = EDITOR (the Post — the side the solo human plays), 1 = NIXON (the solo AI
 * side). The two seats drive DIFFERENT pieces of the game: the Editor pulls evidence /
 * informants toward the front page, Nixon shoves momentum / evidence toward his wall. A
 * guest joining seat 1 plays Nixon; an empty seat 1 is driven by the existing aiTurn.
 *
 * HIDDEN INFO: each player holds a private HAND of cards the opponent must not see, and
 * each player's draw DECK is face-down (secret order). redactFor therefore blanks every
 * OTHER seat's hand cards and BOTH face-down decks before a view crosses the wire — while
 * preserving COUNTS (hand size, deck size) so the UI can still show "opponent: N cards".
 * The tug track, tokens, discards and log are all public and stay intact. A leak test
 * guards this.
 *
 * Cards are DUAL-USE: a card is played EITHER for its VALUE (move chosen tokens toward
 * your side) OR for its EVENT (a special effect). The intent therefore carries `useFor`
 * plus, for a value play, the optional token distribution. We validate the card is in the
 * acting seat's live hand and the move against the logic so the host never trusts a guest. */

import * as W from './logic'
import type { WatergateState, Card, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/**
 * A play reduced to wire essentials. `useFor` chooses the dual-use mode; for a VALUE play
 * `tokens` optionally distributes the card's power across movable tokens (omitted = the
 * logic's default target). For an EVENT play `tokens` is ignored. The host re-validates
 * everything against the live state, so guest-supplied data is never trusted.
 */
export interface WatergateIntent {
  kind: 'play'
  cardId: number
  useFor: 'value' | 'event'
  tokens?: { id: string; amount: number }[]
}

/** A neutral placeholder hiding a card's real value/event from other seats. */
const HIDDEN: Card = { id: -1, value: 0, event: 'surge' }

/** seatToMove maps the logic's turn (a Player 0/1) straight onto a seat index. */
export const watergateAdapter: GameAdapter<WatergateState, WatergateIntent> = {
  makeGame: () => W.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : (s.turn as number)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    if (i == null || i.kind !== 'play') return s
    const player = seat as Player
    // the card must be in this seat's own live hand
    if (!s.hands[player].some(c => c.id === i.cardId)) return s
    if (i.useFor === 'event') return W.playEvent(s, player, i.cardId)
    // value play: playValue itself validates the token distribution (movable set, amounts,
    // total <= card power) and returns s unchanged if anything is illegal.
    return W.playValue(s, player, i.cardId, i.tokens)
  },
  aiStep: s => W.aiTurn(s),
  // Changes on EVERY transition: round + whose turn + a hand-size fingerprint (which shrinks
  // each play and refills between rounds) + winner.
  tickKey: s =>
    `${s.round}-${s.turn ?? ''}-${s.hands[W.EDITOR].length}-${s.hands[W.NIXON].length}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards and BOTH face-down decks, preserving
  // counts. The viewing seat keeps its own real hand. Public tug board / discards / log stay.
  redactFor: (s, seat) => ({
    ...s,
    hands: {
      0: seat === W.EDITOR ? s.hands[W.EDITOR] : s.hands[W.EDITOR].map(() => ({ ...HIDDEN })),
      1: seat === W.NIXON ? s.hands[W.NIXON] : s.hands[W.NIXON].map(() => ({ ...HIDDEN })),
    },
    decks: {
      0: s.decks[W.EDITOR].map(() => ({ ...HIDDEN })),
      1: s.decks[W.NIXON].map(() => ({ ...HIDDEN })),
    },
  }),
}
