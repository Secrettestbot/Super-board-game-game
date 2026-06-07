/* RUMMIKUB — netplay adapter. Maps rummikub's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the original
 * human side, moves first), seat 1 = the AI/rival. numSeats reads the real player count off
 * the state's racks array so a future 3+ player state would report correctly.
 *
 * HIDDEN INFO: each player holds a private RACK of tiles the opponents must not see, and the
 * draw BAG is face-down (its order would leak future draws). redactFor therefore blanks every
 * OTHER seat's rack tiles and the whole bag before a view crosses the wire — but keeps the
 * COUNTS intact (rack/bag lengths are public, the actual tiles are not). The table, melded
 * flags, log and step are public and stay untouched. A leak test guards this.
 *
 * A turn is either:
 *   - PLAY: rearrange/extend the public table into a new all-valid set of melds, consuming one
 *     or more tiles from your own rack. The intent carries the resulting table plus the rack
 *     tile ids you spent. play() re-validates EVERYTHING host-side (every meld valid, strict
 *     tile-id conservation old-table ∪ used == new-table, and the initial-30 rule on a first
 *     meld) and returns the input state unchanged for an illegal play, so the host never trusts
 *     a guest-supplied table.
 *   - DRAW: take the top bag tile when you cannot / choose not to play.
 *
 * Tiles carry their own ids, so the intent's `table` is plain JSON-serializable Tile objects;
 * the host validates by id and never imports geometry it can't reconstruct. */

import * as R from './logic'
import type { State, Meld } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A wire move: either commit a new public table (spending rack tiles), or draw. */
export type RummikubIntent =
  | { kind: 'play'; table: Meld[]; used: number[] }
  | { kind: 'draw' }

export const rummikubAdapter: GameAdapter<State, RummikubIntent> = {
  makeGame: () => R.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.racks.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    if (i.kind === 'draw') return R.draw(s, seat as R.Player)
    // PLAY: re-validate the whole table host-side. play() checks meld validity, strict tile-id
    // conservation and the initial-30 rule, returning null for anything illegal.
    const next = R.play(s, seat as R.Player, i.table, i.used)
    return next ?? s
  },
  aiStep: s => R.aiTurn(s),
  // Changes on EVERY transition: step is bumped by play() and draw() on every action (incl. AI).
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's rack tiles and the whole face-down bag, KEEPING counts.
  // The viewing seat keeps its own real rack; table / hasMelded / log / step are public.
  redactFor: (s, seat) => ({
    ...s,
    racks: s.racks.map((r, i) => (i === seat ? r : r.map(hide))) as State['racks'],
    bag: s.bag.map(hide),
  }),
}

/** Replace a tile with a neutral face-down placeholder (keeps it counted, hides its identity). */
function hide(): R.Tile {
  return { id: -1, num: 0, color: 'joker', joker: false }
}
