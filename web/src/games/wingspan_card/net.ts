/* WINGSPAN (card engine) — netplay adapter. Maps wingspan's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Seats map directly to players: seat 0 =
 * you (the original human side, moves first), seat 1 = the rival. numSeats reads the real
 * player count off the state's players array so a future 3+ player state would report it.
 *
 * HIDDEN INFO: each player's HAND of bird cards is private, and the draw DECK order is a
 * face-down secret. redactFor therefore replaces every OTHER seat's hand cards with a
 * neutral placeholder id (preserving the COUNT so the UI can show "N cards") and blanks
 * the whole deck the same way. The face-up TRAY and everyone's PLAYED birds (in rows) are
 * public and stay intact. A leak test guards this.
 *
 * On your turn you take ONE of four kinded actions (spending one action cube):
 *   { kind: 'play', cardId, habitat }  play a bird from hand into its habitat
 *   { kind: 'food' }                   GAIN FOOD (forest)
 *   { kind: 'eggs' }                   LAY EGGS (grassland)
 *   { kind: 'draw' }                   DRAW CARDS (wetland)
 * applyIntent validates each against legalActions / the live hand so the host never trusts
 * a guest-supplied move, and returns the input state unchanged for illegal / out-of-turn. */

import * as WS from './logic'
import type { State, Habitat, ActionKind } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn action reduced to wire essentials. `cardId`/`habitat` only used by 'play'. */
export interface WingspanCardIntent {
  kind: ActionKind
  cardId?: string
  habitat?: Habitat
}

/** A neutral placeholder card id used to hide a private card's identity from other seats
 *  while preserving the hand/deck count. Not a real bird id, so it never appears in BIRD. */
const HIDDEN = '__hidden__'

export const wingspanCardAdapter: GameAdapter<State, WingspanCardIntent> = {
  makeGame: () => WS.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.players.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // Validate against the legal action set for this seat; never trust the raw intent.
    const legal = WS.legalActions(s, seat).some(
      a =>
        a.kind === i.kind &&
        (i.kind !== 'play' || (a.cardId === i.cardId && a.habitat === i.habitat)),
    )
    if (!legal) return s
    if (i.kind === 'play') {
      if (i.cardId == null || i.habitat == null) return s
      return WS.playBird(s, seat, i.cardId, i.habitat)
    }
    if (i.kind === 'food') return WS.gainFood(s, seat)
    if (i.kind === 'eggs') return WS.layEggs(s, seat)
    return WS.drawCards(s, seat)
  },
  aiStep: s => WS.aiTurn(s),
  // Changes on EVERY transition: every action spends a cube, so the joined cubesLeft of
  // both players shifts each move; turn + log length + winner round it out.
  tickKey: s =>
    `${s.turn}-${s.players.map(p => p.cubesLeft).join('.')}-${s.log.length}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's hand cards and the whole face-down deck to a
  // neutral placeholder (count preserved). The viewing seat keeps its own real hand; the
  // public face-up tray and all played birds (rows) are left untouched.
  redactFor: (s, seat) => ({
    ...s,
    players: s.players.map(p =>
      p.id === seat ? p : { ...p, hand: p.hand.map(() => HIDDEN) },
    ),
    deck: s.deck.map(() => HIDDEN),
  }),
}
