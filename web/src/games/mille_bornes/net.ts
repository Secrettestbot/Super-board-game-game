/* MILLE BORNES — netplay adapter. Maps mille_bornes's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to players:
 * seat 0 = you (the original human side, moves first), seat 1 = the rival. numSeats
 * reads the real player count off the state's players array.
 *
 * HIDDEN INFO: each player holds a private HAND of cards the opponent must not see,
 * and the draw DECK is face-down. The played tableau (distance / hazard / speed limit /
 * safeties) and the discard pile are public. redactFor therefore blanks every OTHER
 * seat's hand cards and the whole face-down deck (keeping counts so the UI can show how
 * many cards remain) before a view crosses the wire. A leak test guards this.
 *
 * A turn is: DRAW one card, then PLAY one (distance/hazard/remedy/safety) or DISCARD one.
 * The adapter folds the draw into the intent so one intent == one full turn (matching the
 * AI's aiTurn, which also draws then acts). The intent is just the chosen card + kind, and
 * we validate the play/discard against the live hand so the host never trusts a guest. */

import * as MB from './logic'
import type { State, Card, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: play a card (optionally at a target seat) or discard it. */
export type MilleBornesIntent =
  | { kind: 'play'; cardId: number; target?: number }
  | { kind: 'discard'; cardId: number }

/** A neutral placeholder used to hide a card's identity from other seats (counts kept). */
const HIDDEN: Card = { id: -1, kind: 'distance', name: '' }

export const milleBornesAdapter: GameAdapter<State, MilleBornesIntent> = {
  makeGame: () => MB.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.players.length),
  seatToMove: s => (s.winner === null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner !== null,
  applyIntent: (s, seat, i) => {
    if (s.winner !== null || s.turn !== seat) return s
    const p = seat as Player
    // The chosen card must be in this seat's own visible hand.
    if (s.players[p].hand.find(c => c.id === i.cardId) == null) return s

    // A turn is: play/discard the chosen card, THEN draw a replacement. The action ends
    // the turn (logic.ts flips `turn`), so we record who acted and refill their hand from
    // the deck after the turn passes — keeping the per-turn hand size stable.
    let acted: State
    if (i.kind === 'discard') {
      acted = MB.discard(s, p, i.cardId)
    } else {
      // validate against the live legal set so a guest can't force an illegal play.
      if (!MB.legalPlays(s, p).includes(i.cardId)) return s
      acted = MB.play(s, p, i.cardId, i.target as Player | undefined)
    }
    if (acted === s) return s // illegal / no-op -> input state unchanged

    // Refill: draw one card for the seat that just acted (free of turn order, so we use a
    // small clone-and-pop rather than drawCard which is gated on whose turn it is). A safety
    // played in-turn does not end the turn in logic.ts, but it does remove a card, so we
    // still top the hand back up only when the deck has cards.
    if (acted.winner !== null || acted.deck.length === 0) return acted
    const refilled: State = {
      ...acted,
      deck: acted.deck.slice(),
      players: acted.players.map((ps, idx) =>
        idx === p ? { ...ps, hand: ps.hand.slice() } : ps,
      ) as State['players'],
    }
    const card = refilled.deck.pop()
    if (card) refilled.players[p].hand.push(card)
    return refilled
  },
  aiStep: s => MB.aiTurn(s),
  // Changes on EVERY transition: turn flips each completed turn, and the log grows on every
  // draw/play/discard, so length advances even when the same seat keeps a free move.
  tickKey: s => `${s.turn}-${s.drewThisTurn ? 1 : 0}-${s.winner ?? ''}-${s.log.length}`,
  // Hidden info: blank every OTHER seat's hand cards and the whole face-down deck. The
  // viewing seat keeps its own real hand; the public discard/tableau are left untouched.
  redactFor: (s, seat) => ({
    ...s,
    players: s.players.map((ps, i) =>
      i === seat ? ps : { ...ps, hand: ps.hand.map(() => ({ ...HIDDEN })) },
    ) as State['players'],
    deck: s.deck.map(() => ({ ...HIDDEN })),
  }),
}
