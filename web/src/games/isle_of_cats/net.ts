/* THE ISLE OF CATS — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the original
 * human side, drafts first), seat 1 = the rival. numSeats reads the real player count off the
 * state's boats array so a future 3+ player state would report correctly.
 *
 * HIDDEN INFO: drafting is from a shared, FACE-UP market (public to both players) and a
 * FACE-DOWN draw BAG that feeds it. The bag is the only secret — neither player may peek at
 * the order or identities of the undrawn cat tiles. redactFor therefore blanks every bag tile
 * to a neutral placeholder while preserving the bag's COUNT (so the UI can still show how many
 * tiles remain). Boats, the market, scores and the log are public and stay intact. A leak test
 * guards this.
 *
 * A turn is draft-and-place in one action: take a tile from the market and lay its polyomino on
 * empty, non-basket cells of your own boat. The intent is { tileId, cells }; we validate the
 * placement via placeCat (which checks the tile is in the market, the cells are an orientation
 * of its shape, and they are free) so the host never trusts a guest-supplied move. */

import * as G from './logic'
import type { State, Player, CatTile } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: which market tile, onto which flat boat cells. */
export interface IsleOfCatsIntent { tileId: number; cells: number[] }

/** A neutral placeholder used to hide a face-down bag tile's real id/color/shape. */
const HIDDEN: CatTile = { id: -1, color: -1, shape: [] }

export const isleOfCatsAdapter: GameAdapter<State, IsleOfCatsIntent> = {
  makeGame: () => G.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.boats.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // placeCat fully validates (tile in market, cells are a legal orientation, cells free)
    // and returns the SAME state object unchanged on any illegal request.
    return G.placeCat(s, seat as Player, i.tileId, i.cells)
  },
  aiStep: s => G.aiTurn(s),
  // Changes on EVERY transition: a placement removes a market tile and appends a log line;
  // turn flips (or finalizes). Combining these covers consecutive same-player turns too.
  tickKey: s => `${s.market.length}-${s.bag.length}-${s.log.length}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: blank the whole face-down bag (keeping its length so counts stay accurate).
  // The market is face-up and boats/scores/log are public, so they pass through unchanged.
  redactFor: (s, _seat) => ({
    ...s,
    bag: s.bag.map(() => ({ ...HIDDEN, shape: [] })),
  }),
}
