/* TSURO — netplay adapter. Maps tsuro's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map to players: seat 0 = 'you' (the original
 * human side, moves first), seat 1 = 'foe' (the rival). numSeats reads the real player
 * count off the live stones so a future 3+ player state would report correctly.
 *
 * HIDDEN INFO: each player holds a private HAND of up to 3 path tiles the opponent must
 * not see, and the face-down DECK is secret. The board (placed tiles), the stones, and
 * the public log are all open. redactFor therefore blanks every OTHER seat's hand tiles
 * and replaces the whole deck with neutral placeholders — preserving the counts so the
 * UI can still show "N tiles left" without revealing identities. A leak test guards this.
 *
 * A turn places one of your hand tiles (with a chosen rotation) on the empty cell directly
 * in front of your stone; all stones then slide along the paths (collisions/edges
 * eliminate). The intent is { kind:'place', tileId, rotation } where tileId is the hand
 * index. We validate the index + turn against the live hand so the host never trusts a
 * guest-supplied move. */

import * as TS from './logic'
import type { TsuroState, Tile, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which private hand tile, and its rotation. */
export interface TsuroIntent { kind: 'place'; tileId: number; rotation: number }

/** seat 0 = you, seat 1 = foe. */
const SEAT_PLAYER: Player[] = ['you', 'foe']
const playerToSeat = (p: Player): number => (p === 'you' ? 0 : 1)

/** A neutral placeholder tile (a valid straight-through matching) used to hide a tile's
 * real wiring from other seats. Its identity carries no real info. */
const HIDDEN: Tile = [4, 5, 6, 7, 0, 1, 2, 3]

export const tsuroAdapter: GameAdapter<TsuroState, TsuroIntent> = {
  makeGame: () => TS.makeGame(),
  // Real player count off the live stones (min 2) so a 3+ player state would report it.
  numSeats: s => Math.max(2, s.stones.length),
  seatToMove: s => (s.winner != null || s.turn == null ? null : playerToSeat(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null) return s
    if (playerToSeat(s.turn) !== seat) return s
    if (i == null || i.kind !== 'place') return s
    const who = s.turn
    const hand = s.hands[who]
    if (!Number.isInteger(i.tileId) || i.tileId < 0 || i.tileId >= hand.length) return s
    if (!Number.isInteger(i.rotation)) return s
    const next = TS.place(s, i.tileId, i.rotation)
    // place() returns the same object reference for a no-op; surface that as unchanged.
    return next === s ? s : next
  },
  aiStep: s => TS.aiMove(s),
  // Changes on EVERY transition: last cell changes per placement, turn flips, winner set.
  tickKey: s => `${s.last ?? 'x'}-${s.turn ?? 'end'}-${s.winner ?? ''}-${s.deck.length}`,
  // Hidden info: blank every OTHER seat's hand tiles and the whole face-down deck. The
  // viewing seat keeps its own real hand; the board, stones, and log stay untouched. Tile
  // COUNTS are preserved so the UI can still render hand size / "tiles left".
  redactFor: (s, seat) => {
    const hands: Record<Player, Tile[]> = { you: s.hands.you, foe: s.hands.foe }
    for (const p of SEAT_PLAYER) {
      if (playerToSeat(p) !== seat) hands[p] = s.hands[p].map(() => HIDDEN.slice())
    }
    return { ...s, hands, deck: s.deck.map(() => HIDDEN.slice()) }
  },
}
