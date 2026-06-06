/* TRAX — netplay adapter. Maps trax's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so there is no hidden state.
 * Seats: 0 = White (the original human), 1 = Red (the AI side).
 *
 * One wrinkle: trax's State.board is a `Map<Cell, Tile>`, which does NOT survive the
 * JSON round-trip the transport performs. We use `redactFor` purely as a serialization
 * shim — it converts the Map into a plain `[cell, tile][]` entries array so the state
 * crosses the wire intact. It hides nothing (this is a perfect-information game). The
 * component re-hydrates the board into a Map with `boardOf()` before rendering. */

import * as TX from './logic'
import type { State, Cell, Tile } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A placement reduced to wire essentials: the target cell + the chosen tile index
 * into ALL_TILES. The host reconstructs the authoritative Tile from that index, so we
 * never trust a guest-supplied tile object. */
export interface TraxIntent { cell: Cell; ti: number }

/** A JSON-safe stand-in for State: the board Map flattened to entries. The `as State`
 * casts are deliberate — the on-the-wire shape differs from State only in `board`, and
 * the component normalizes it back via `boardOf()`. */
type WireState = Omit<State, 'board'> & { board: [Cell, Tile][] }

/** Read a state's board as a Map, whether it arrived as a live Map (host/local) or as
 * the serialized `[cell, tile][]` entries array (guest, post-JSON). */
export function boardOf(s: State): Map<Cell, Tile> {
  const b = (s as unknown as WireState | State).board
  return b instanceof Map ? b : new Map(b as [Cell, Tile][])
}

export const traxAdapter: GameAdapter<State, TraxIntent> = {
  makeGame: () => TX.makeGame(),
  numSeats: () => 2,
  // turn 0/1 maps directly to seat 0/1; null once someone has won.
  seatToMove: s => (s.winner == null ? s.turn : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // Validate against the game's own legal set: find the legal placement at this cell
    // whose tile matches the requested index, then apply via the pure transition.
    const legal = TX.legalPlacements(s).find(p => p.cell === i.cell && p.ti === i.ti)
    return legal ? TX.place(s, legal.cell, legal.tile) : s
  },
  aiStep: s => TX.aiTurn(s),
  tickKey: s => `${s.moves}-${s.turn}-${s.winner ?? ''}`,
  // serialization shim only (no hidden info): flatten the board Map for the wire.
  redactFor: s => ({ ...s, board: [...boardOf(s).entries()] } as unknown as State),
}
