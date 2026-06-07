/* EVERDELL — netplay adapter. Maps everdell's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = You (the
 * original human side, moves first), seat 1 = the AI/opponent. numSeats reads the real
 * player count off the state's players array so a future 3+ player state would report
 * correctly.
 *
 * HIDDEN INFO: each player holds a private HAND of cards the opponent must not see, and the
 * face-down DECK order is secret. redactFor therefore replaces every OTHER seat's hand cards
 * with a neutral placeholder (KEEPING the count, so the opponent's hand size stays public)
 * and blanks the whole deck the same way (keeping its length). Everything else is public:
 * the face-up Meadow, every player's CITY, placed WORKERS (occ), RESOURCES, season, points
 * and the log. A leak test guards this.
 *
 * A turn is ONE of: place a worker on a forest location, play a card (from hand or meadow),
 * or prepare for the next season. These are modelled as kinded intents and validated against
 * the logic's can* guards so the host never trusts a guest-supplied move; an illegal or
 * out-of-turn intent returns the input state unchanged. */

import * as EV from './logic'
import type { State, LocationId } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn reduced to the wire essentials — one kinded action per move. */
export type EverdellIntent =
  | { kind: 'place'; loc: LocationId }
  | { kind: 'play'; cardId: string; fromMeadow: boolean }
  | { kind: 'prepare' }

/** A neutral placeholder card id used to hide another seat's hand / the deck. */
const HIDDEN = '?'

export const everdellAdapter: GameAdapter<State, EverdellIntent> = {
  makeGame: () => EV.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.players.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn index == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Host is authoritative: out-of-turn / finished / over -> unchanged. The can* guards
    // below double-check the same, and reject anything illegal by returning the input ref.
    if (s.winner != null || s.turn !== seat || s.players[seat]?.done) return s
    switch (i.kind) {
      case 'place':
        return EV.canPlaceWorker(s, seat, i.loc) ? EV.placeWorker(s, seat, i.loc) : s
      case 'play':
        return EV.canPlayCard(s, seat, i.cardId, i.fromMeadow)
          ? EV.playCard(s, seat, i.cardId, i.fromMeadow)
          : s
      case 'prepare':
        return EV.prepareSeason(s, seat)
      default:
        return s
    }
  },
  aiStep: s => EV.aiTurn(s),
  // Changes on EVERY transition: the log grows on every action (place/play/prepare), and
  // turn flips; winner pins the terminal state.
  tickKey: s => `${s.turn}-${s.log.length}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards and the whole face-down deck, keeping
  // counts so hand size / cards-remaining stay public. The viewing seat keeps its own real
  // hand; the face-up meadow and all cities are left untouched.
  redactFor: (s, seat) => ({
    ...s,
    players: s.players.map((p, i) =>
      i === seat ? p : { ...p, hand: p.hand.map(() => HIDDEN) },
    ),
    deck: s.deck.map(() => HIDDEN),
  }),
}
