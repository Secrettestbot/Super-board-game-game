/* DOMINOES — netplay adapter. Maps the double-six block-with-draw logic onto the
 * uniform GameAdapter so useGameSession can host/join it. 2 seats: 0 = You/Ivory,
 * 1 = Rival/Ebony (matches logic's Player 'you'/'ai').
 *
 * HIDDEN INFO: each seat's HAND of tiles is private and the BONEYARD (draw pile) is
 * secret. redactFor replaces every OTHER seat's hand tiles, and the entire boneyard,
 * with a hidden placeholder tile — keeping the array lengths so the UI still renders the
 * right number of card backs / boneyard count. A leak test guards this.
 */

import * as DM from './logic'
import type { DomState, Player, Tile, End } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Intents: play a tile (by its logic tileId) onto an end, draw a tile, or pass. */
export type DominoesIntent =
  | { kind: 'play'; tileId: number; end: End }
  | { kind: 'draw' }
  | { kind: 'pass' }

/** seat 0 == 'you', seat 1 == 'ai'. */
const SEAT_TO_PLAYER: Player[] = ['you', 'ai']
const playerToSeat = (p: Player): number => (p === 'you' ? 0 : 1)

/** A placeholder that carries no real pip information (id -1 != any real tileId 0..48). */
const HIDDEN_TILE: Tile = { a: -1, b: -1 }

export const dominoesAdapter: GameAdapter<DomState, DominoesIntent> = {
  makeGame: () => DM.makeGame(),

  // Real player count: this variant always has the two named hands.
  numSeats: s => Object.keys(s.hands).length,

  seatToMove: s => (s.winner || s.turn == null ? null : playerToSeat(s.turn)),

  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner || s.turn == null) return s
    if (playerToSeat(s.turn) !== seat) return s
    const who = SEAT_TO_PLAYER[seat]
    if (who == null) return s

    if (intent.kind === 'draw') {
      return DM.draw(s, who) // logic no-ops if boneyard empty / not your turn
    }
    if (intent.kind === 'pass') {
      return DM.pass(s, who) // logic no-ops if you can still move / must draw first
    }
    if (intent.kind === 'play') {
      // Resolve the tile from the seat's OWN (authoritative) hand by id; never trust a
      // guest-supplied pip pair. play() re-validates the end and ownership and no-ops if
      // the move is illegal, so an unknown id / bad end leaves the state unchanged.
      const tile = s.hands[who].find(t => DM.tileId(t) === intent.tileId)
      if (!tile) return s
      return DM.play(s, who, tile, intent.end)
    }
    return s
  },

  aiStep: s => DM.aiStep(s),

  // Changes on EVERY transition: a play grows the line + flips turn, a draw grows a hand +
  // shrinks the boneyard, a pass flips turn + bumps the pass counter, the end resolves a
  // winner. The log length advances on every one of those, so it is a robust tick.
  tickKey: s =>
    `${s.line.length}-${s.hands.you.length}-${s.hands.ai.length}-${s.boneyard.length}` +
    `-${s.passes}-${s.turn ?? 'x'}-${s.winner ?? ''}-${s.log.length}`,

  // Hidden info: blank every OTHER seat's hand tiles and the ENTIRE boneyard (keep the
  // lengths so the UI renders the right number of backs and the right boneyard count).
  redactFor: (s, seat) => {
    const who = SEAT_TO_PLAYER[seat]
    const hands = {
      you: who === 'you' ? s.hands.you : s.hands.you.map(() => ({ ...HIDDEN_TILE })),
      ai: who === 'ai' ? s.hands.ai : s.hands.ai.map(() => ({ ...HIDDEN_TILE })),
    }
    const boneyard = s.boneyard.map(() => ({ ...HIDDEN_TILE }))
    return Object.assign({}, s, { hands, boneyard }) as DomState
  },
}
