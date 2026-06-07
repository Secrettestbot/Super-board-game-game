/* INGENIOUS — netplay adapter. Maps ingenious's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the original
 * human side, moves first), seat 1 = the rival. numSeats reads the real player count off the
 * state's racks array so a future 3+ player state would report correctly.
 *
 * HIDDEN INFO: each player holds a private RACK of up to 6 domino tiles the opponent must not
 * see, and the draw BAG is face-down (its order leaks future draws). redactFor therefore blanks
 * every OTHER seat's rack tiles and the whole bag before a view crosses the wire; the board,
 * score tracks and log are public and stay intact. A leak test guards this.
 *
 * A turn is: place one of your rack tiles onto two empty adjacent hexes; the rack then refills
 * from the bag (that draw is fixed by the logic). So the intent is just { tileIndex, cellA, cellB }.
 * We validate the placement against the game's legality checks (and the live rack) so the host
 * never trusts a guest-supplied move — placeTile itself re-validates and returns the input state
 * unchanged for illegal/out-of-turn moves. */

import * as ING from './logic'
import type { IngState, Tile, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which private rack tile, onto which two adjacent hexes. */
export interface IngeniousIntent { tileIndex: number; cellA: number; cellB: number }

/** A neutral placeholder used to hide a tile's real colours from other seats. */
const HIDDEN: Tile = { a: -1, b: -1 }

export const ingeniousAdapter: GameAdapter<IngState, IngeniousIntent> = {
  makeGame: () => ING.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.racks.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const rack = s.racks[seat]
    if (rack == null || i.tileIndex < 0 || i.tileIndex >= rack.length) return s
    // placeTile re-validates adjacency / emptiness / bounds and returns s unchanged if illegal.
    return ING.placeTile(s, seat as Player, i.tileIndex, i.cellA, i.cellB)
  },
  aiStep: s => ING.aiTurn(s),
  // Changes on EVERY transition: moves increments on every placement (incl. AI / extra turns).
  tickKey: s => `${s.moves}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's rack tiles and the whole face-down bag. The viewing
  // seat keeps its own real rack; board / tracks / log are public and left untouched.
  redactFor: (s, seat) => ({
    ...s,
    racks: s.racks.map((r, i) => (i === seat ? r : r.map(() => ({ ...HIDDEN })))) as IngState['racks'],
    bag: s.bag.map(() => ({ ...HIDDEN })),
  }),
}
