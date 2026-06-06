/* TINY TOWNS — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it.
 *
 * The ported logic.ts (faithfully) implements the SOLITAIRE Tiny Towns: a single 4x4
 * town with one player. There is no AI opponent and no second player in the state, so:
 *   - numSeats reads the real player count off the state — which is exactly 1 here (one
 *     grid / one town). A would-be guest of a 1-seat table is rejected by the session as
 *     "table full", the truthful outcome for a single-player build.
 *   - the only seat (0) is the active player for the whole game; seatToMove is 0 while
 *     playing and null once the town is scored.
 *   - aiStep is a no-op: with one human-controlled seat the session never asks for AI.
 *
 * Perfect information (resource named + the whole grid are public), so no redactFor.
 *
 * Randomness note: the next resource is drawn with Math.random() inside the logic. That
 * is fine for online play because only the authority (host) ever runs the logic; guests
 * render the broadcast view and never re-derive state, so there is no desync.
 *
 * Intent = a placement (place the named resource on a cell) or a build (raise a building
 * on a target cell). applyIntent validates against the logic and returns the input state
 * unchanged for any illegal / out-of-turn intent. */

import * as TN from './logic'
import type { TinyState, BuildingKey } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn reduced to wire essentials: place the dealt resource, build, or end & score. */
export type TinyTownsIntent =
  | { kind: 'place'; cell: number }
  | { kind: 'build'; key: BuildingKey; cell: number }
  | { kind: 'end' }

export const tinyTownsAdapter: GameAdapter<TinyState, TinyTownsIntent> = {
  makeGame: () => TN.makeGame(),
  // One grid == one town == one player. Read off the state (a future multi-town state
  // would report its real seat count here); the ported solitaire state is always 1.
  numSeats: () => 1,
  // Seat 0 is the active player for the entire game; null once the town is over.
  seatToMove: s => (s.status === 'playing' ? 0 : null),
  isOver: s => s.status !== 'playing',
  applyIntent: (s, seat, i) => {
    if (s.status !== 'playing' || seat !== 0) return s
    if (i.kind === 'place') {
      // Only a legal placement: a resource is dealt and the target cell is empty.
      if (!s.resource || i.cell < 0 || i.cell >= s.grid.length || s.grid[i.cell] !== null) return s
      const next = TN.place(s, i.cell)
      return next === s ? s : next
    }
    if (i.kind === 'build') {
      // Validate the building is actually buildable on a matching group covering the cell.
      if (!TN.buildableKeys(s.grid).includes(i.key)) return s
      const groups = TN.matches(s.grid, i.key)
      if (!groups.some(cells => cells.includes(i.cell))) return s
      const next = TN.build(s, i.key, i.cell)
      return next === s ? s : next
    }
    if (i.kind === 'end') {
      // Voluntarily finish the town and score it.
      const next = TN.endTown(s)
      return next === s ? s : next
    }
    return s
  },
  // No AI seat exists for solitaire; the session never calls this. No-op for safety.
  aiStep: s => s,
  // Changes on every transition: turn advances on a placement; the grid signature and
  // status capture builds (which don't bump turn) and the game ending.
  tickKey: s => {
    let gsig = ''
    for (const c of s.grid) gsig += c == null ? '.' : c.t === 'r' ? c.r[0] : c.b[0].toUpperCase()
    return `${s.turn}-${s.status}-${s.resource ?? ''}-${gsig}`
  },
}
