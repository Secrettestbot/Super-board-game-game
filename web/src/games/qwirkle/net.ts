/* QWIRKLE — netplay adapter. Maps qwirkle's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Seats map directly to players: seat 0 = you (the original
 * human side, moves first), seat 1 = the rival. numSeats reads the real player count off the
 * state's hands array so a future 3+ player state would report correctly.
 *
 * HIDDEN INFO: each player holds a private RACK of up to 6 tiles the opponent must not see, and
 * the draw BAG is face-down (its order would leak every future draw). redactFor therefore blanks
 * every OTHER seat's rack tiles and the whole bag (replacing each Tile with a HIDDEN sentinel)
 * before a view crosses the wire — counts are preserved so the UI can still show "tiles in bag"
 * and the opponent's rack size. The board, scores and log are public and stay intact. A leak test
 * guards this.
 *
 * SERIALIZATION: QState.board is a Map, which does NOT survive JSON.stringify (it becomes {}).
 * The board is PUBLIC, so redactFor mirrors its entries into a plain `_board` array that rides the
 * wire intact; the component rebuilds the Map from `_board` for a guest view. Solo / host-local
 * play never crosses the wire, so the real Map is untouched there.
 *
 * A turn either PLACES one or more rack tiles in a single straight line, or SWAPS rack tiles back
 * into the bag. applyIntent validates against the game's own legality (isLegalPlacement / swap /
 * applyPlacement all re-check and no-op on failure) so the host never trusts a guest-supplied move,
 * and returns the input state unchanged for illegal / out-of-turn intents. */

import * as Q from './logic'
import type { QState, Tile, Placement } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A turn is either a line placement or a tile swap. JSON-serializable plain object. */
export type QwirkleIntent =
  | { kind: 'place'; placements: Placement[] }
  | { kind: 'swap'; tileIds: number[] }

/** A neutral placeholder that hides a tile's real colour/shape/id from other seats. */
const HIDDEN: Tile = { color: 'r', shape: 'circle', id: -1 }
const hide = (): Tile => ({ ...HIDDEN })

/** Carries the public board across the wire as a plain array (the Map itself can't be JSON'd). */
type WireQState = QState & { _board?: [string, Tile][] }

/** Rebuild a QState's board Map from a redacted wire view's `_board` array (no-op if already a Map
 *  with entries — i.e. solo / host-local where redactFor never ran). */
export function hydrate(s: QState): QState {
  const w = s as WireQState
  if (s.board instanceof Map && s.board.size > 0) return s
  if (!w._board) return s
  const board: Q.Board = new Map(w._board)
  const { _board: _drop, ...rest } = w
  void _drop
  return { ...rest, board } as QState
}

export const qwirkleAdapter: GameAdapter<QState, QwirkleIntent> = {
  makeGame: () => Q.makeGame(),
  // Real player count off the state (min 2) so a 3+ player state would report correctly.
  numSeats: s => Math.max(2, s.hands.length),
  seatToMove: s => (s.winner == null ? s.turn : null), // turn (0/1) == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    if (i.kind === 'place') {
      if (!Array.isArray(i.placements) || i.placements.length === 0) return s
      // applyPlacement re-validates legality (line, contiguity, ownership) and returns s unchanged
      // if illegal, so a guest-supplied placement is never trusted.
      return Q.applyPlacement(s, i.placements)
    }
    if (i.kind === 'swap') {
      if (!Array.isArray(i.tileIds) || i.tileIds.length === 0) return s
      // swap re-validates ownership and bag size and returns s unchanged if illegal.
      return Q.swap(s, i.tileIds)
    }
    return s
  },
  aiStep: s => Q.aiTurn(s),
  // Changes on EVERY transition: log grows on every placement / swap / pass, turn flips, winner set.
  tickKey: s => `${s.log.length}-${s.turn}-${s.bag.length}-${s.winner ?? ''}`,
  // Hidden info: blank every OTHER seat's rack and the whole bag (counts kept), and mirror the
  // PUBLIC board into a JSON-safe array so it survives the wire (the Map would not).
  redactFor: (s, seat) => ({
    ...s,
    hands: s.hands.map((h, i) => (i === seat ? h : h.map(hide))) as QState['hands'],
    bag: s.bag.map(hide),
    _board: [...s.board.entries()],
  } as WireQState),
}
