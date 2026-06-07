/* RADLANDS — netplay adapter. Maps radlands' pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the
 * original human side, moves first), seat 1 = the opponent (AI when no guest). numSeats
 * is always 2.
 *
 * HIDDEN INFO: each player's HAND is private and both draw decks are face-down/secret. The
 * camps and people in play, the events queue, water and discards are all public. redactFor
 * therefore blanks the OTHER seat's hand cards and BOTH players' decks (the viewer must not
 * learn the order/contents of even their own deck) before a view crosses the wire, while
 * keeping the COUNTS intact (length is preserved). A leak test guards this.
 *
 * Intents are kinded plain objects covering every legal turn action: deploy a person, queue
 * an event, use a card/camp ability (including drawing-with-water economy abilities), and
 * ending the turn. applyIntent validates each against the live state via the logic's own
 * functions (which themselves re-check legality + turn ownership) and returns the input
 * state unchanged for anything illegal or out-of-turn — never throwing. The logic mutates in
 * place, so we clone first to keep applyIntent pure for the session/React. */

import * as R from './logic'
import type { RadlandsState, Player, AbilitySource, AbilityTarget } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn action reduced to JSON-serializable wire essentials. */
export type RadlandsIntent =
  | { t: 'play'; cardId: string; column: number; slot: number }
  | { t: 'event'; cardId: string }
  | { t: 'ability'; source: AbilitySource; target: AbilityTarget | null }
  | { t: 'end' }

/** A neutral placeholder hiding a hidden card's real key from a seat. */
const HIDDEN = '?'

export const radlandsAdapter: GameAdapter<RadlandsState, RadlandsIntent> = {
  makeGame: () => R.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const pl = seat as Player
    // Clone so the in-place logic mutations don't leak back into the input state; only
    // return the clone if the action actually succeeded (logic returns false otherwise).
    const n = structuredClone(s)
    let ok = false
    if (i.t === 'play') ok = R.playPerson(n, pl, i.cardId, i.column, i.slot)
    else if (i.t === 'event') ok = R.playEvent(n, pl, i.cardId)
    else if (i.t === 'ability') {
      // never trust a guest-supplied source seat — pin it to the acting seat
      if (i.source.player !== pl) return s
      ok = R.useAbility(n, pl, i.source, i.target)
    } else if (i.t === 'end') {
      R.endTurn(n)
      ok = true
    }
    return ok ? n : s
  },
  aiStep: s => {
    const n = structuredClone(s)
    R.aiTurn(n) // run the AI's whole turn for its seat
    return n
  },
  // Changes on EVERY transition: actions increments on every play/ability and on endTurn.
  tickKey: s => `${s.actions}-${s.turn}-${s.round}-${s.winner ?? ''}`,
  // Hidden info: blank the OTHER seat's hand and BOTH decks (keep counts). Everything else
  // (board, camps, people, events, water, discards) is public and left intact.
  redactFor: (s, seat) => ({
    ...s,
    players: s.players.map((p, i) => ({
      ...p,
      hand: i === seat ? p.hand : p.hand.map(() => HIDDEN),
      deck: p.deck.map(() => HIDDEN),
    })) as RadlandsState['players'],
  }),
}
