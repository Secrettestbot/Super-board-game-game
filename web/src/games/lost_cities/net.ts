/* LOST CITIES — netplay adapter. Maps lost_cities' pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Seats map to players: seat 0 = 'you' (the original
 * human side, moves first), seat 1 = 'ai' (the rival).
 *
 * HIDDEN INFO: each player's HAND is private and the draw DECK's face-down order is secret.
 * The discard piles and the played expedition columns are public. redactFor therefore blanks
 * every OTHER seat's hand cards and every deck card (keeping the counts so the UI can still
 * show "N in deck" and the right number of opponent cards). A leak test guards this.
 *
 * A turn is two intents driven by the state's `phase`:
 *   1. { kind:'play', cardId } | { kind:'discard', cardId }   (phase 'play')
 *   2. { kind:'draw', source:'deck' } | { kind:'draw', source:{discard:colour} } (phase 'draw')
 * applyIntent validates against the live hand / legality and the current phase, returning the
 * input state unchanged for any illegal or out-of-turn intent (never trusts a guest move). */

import * as LC from './logic'
import type { LostCitiesState, Colour, Card, Player } from './logic'

/** seat 0 = 'you', seat 1 = 'ai'. */
const SEAT_PLAYER: Player[] = ['you', 'ai']
const playerForSeat = (seat: number): Player | null => SEAT_PLAYER[seat] ?? null
const seatForPlayer = (p: Player | null): number | null => (p == null ? null : p === 'you' ? 0 : 1)

/** A turn's two halves, as JSON-serializable intents. */
export type LostCitiesIntent =
  | { kind: 'play'; cardId: number }
  | { kind: 'discard'; cardId: number }
  | { kind: 'draw'; source: 'deck' | { discard: Colour } }

/** A neutral placeholder hiding a card's real id / colour / value from other seats. */
const HIDDEN: Card = { id: -1, colour: 'Y', value: -1 }
const hide = (cards: Card[]): Card[] => cards.map(() => ({ ...HIDDEN }))

export const lostCitiesAdapter = {
  makeGame: (): LostCitiesState => LC.makeGame(),
  numSeats: (): number => 2,
  seatToMove: (s: LostCitiesState): number | null => (s.winner ? null : seatForPlayer(s.turn)),
  isOver: (s: LostCitiesState): boolean => s.winner != null,

  applyIntent: (s: LostCitiesState, seat: number, intent: LostCitiesIntent): LostCitiesState => {
    if (s.winner) return s
    const p = playerForSeat(seat)
    if (p == null || s.turn !== p) return s

    switch (intent.kind) {
      case 'play':
        if (s.phase !== 'play') return s
        return LC.playCard(s, p, intent.cardId)
      case 'discard':
        if (s.phase !== 'play') return s
        return LC.discardCard(s, p, intent.cardId)
      case 'draw': {
        if (s.phase !== 'draw') return s
        if (intent.source === 'deck') return LC.drawDeck(s, p)
        return LC.drawDiscard(s, p, intent.source.discard)
      }
      default:
        return s
    }
  },

  aiStep: (s: LostCitiesState): LostCitiesState => LC.aiTurn(s),

  // Changes on EVERY transition: phase flips play<->draw on each action, turn flips per turn,
  // and hand sizes shift, so the AI timer re-arms after each half-move.
  tickKey: (s: LostCitiesState): string =>
    `${s.turn ?? '-'}-${s.phase}-${s.deck.length}-${s.hands.you.length}-${s.hands.ai.length}-${s.winner ?? ''}`,

  // Hidden info: blank every OTHER seat's hand and the whole face-down deck (keep counts). The
  // viewing seat keeps its own real hand; discards and expeditions are public and untouched.
  redactFor: (s: LostCitiesState, seat: number): LostCitiesState => {
    const me = playerForSeat(seat)
    return {
      ...s,
      deck: hide(s.deck),
      hands: {
        you: me === 'you' ? s.hands.you : hide(s.hands.you),
        ai: me === 'ai' ? s.hands.ai : hide(s.hands.ai),
      },
    }
  },
}
