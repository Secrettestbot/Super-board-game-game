/* YINSH — netplay adapter. Maps yinsh's multi-phase pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor is needed. Seats: 0 = White ('w'), 1 = Black ('b').
 *
 * Yinsh has several discrete sub-actions per "turn": placing rings, then for each
 * play turn dropping a marker + sliding the ring (which can flip markers and open a
 * completed row), then — for whoever completed a row — claiming the run and removing
 * one of their own rings. We model each as a kinded, JSON-serializable intent and let
 * applyIntent validate it against the current phase + the seat whose action it is.
 *
 * The acting seat is NOT always s.turn: during a row claim/removal it is
 * pendingRows.who / removingRing (and that seat keeps acting through its own removal).
 * seatToMove encodes that priority so the session routes intents to the right seat.
 */

import * as YI from './logic'
import type { Side, YinshState } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** One discrete yinsh action. Exactly one kind applies per call. */
export type YinshIntent =
  | { kind: 'placeRing'; cell: string }
  | { kind: 'dropMarker'; cell: string }
  | { kind: 'moveRing'; to: string }
  | { kind: 'cancelDrop' }
  | { kind: 'removeRow'; run: string[] }
  | { kind: 'removeRing'; cell: string }

const SIDE: Side[] = ['w', 'b'] // seat -> side
const seatOf = (side: Side): number => (side === 'w' ? 0 : 1)

/** True if `cell` is an on-board "c,r" intersection. */
function onBoard(cell: string): boolean {
  const [c, r] = cell.split(',').map(Number)
  return Number.isInteger(c) && Number.isInteger(r) && YI.has(c, r)
}

/** Which seat must act right now, or null when the game is over. */
function actorSeat(s: YinshState): number | null {
  if (s.winner || s.phase === 'over') return null
  if (s.removingRing) return seatOf(s.removingRing) // remove one of your rings
  if (s.pendingRows) return seatOf(s.pendingRows.who) // claim a completed run
  if (s.turn) return seatOf(s.turn) // place / drop+move
  return null
}

export const yinshAdapter: GameAdapter<YinshState, YinshIntent> = {
  makeGame: () => YI.makeGame(),
  numSeats: () => 2,
  seatToMove: (s: YinshState) => actorSeat(s),
  isOver: (s: YinshState) => s.winner != null || s.phase === 'over',
  applyIntent: (s: YinshState, seat: number, intent: YinshIntent): YinshState => {
    if (actorSeat(s) !== seat) return s
    const side = SIDE[seat]
    switch (intent.kind) {
      case 'placeRing':
        // only legal while placing and it's a plain placement (no run/removal pending)
        if (s.phase !== 'place' || s.pendingRows || s.removingRing) return s
        if (!onBoard(intent.cell)) return s
        return YI.placeRing(s, intent.cell)
      case 'dropMarker':
        if (s.phase !== 'play' || s.pendingRing || s.pendingRows || s.removingRing) return s
        if (s.rings[intent.cell] !== side) return s
        return YI.dropMarker(s, intent.cell)
      case 'moveRing':
        if (!s.pendingRing) return s
        return YI.moveRing(s, intent.to)
      case 'cancelDrop':
        if (!s.pendingRing) return s
        return YI.cancelDrop(s)
      case 'removeRow':
        if (!s.pendingRows || s.pendingRows.who !== side) return s
        // only accept a run the logic actually offered
        if (!s.pendingRows.runs.some(r => r.length === intent.run.length && r.every((c, i) => c === intent.run[i]))) return s
        return YI.removeRun(s, intent.run)
      case 'removeRing':
        if (s.removingRing !== side) return s
        if (s.rings[intent.cell] !== side) return s
        return YI.removeRing(s, intent.cell)
      default:
        return s
    }
  },
  // The existing AI plays Black ('b') = seat 1, advancing exactly one sub-action.
  aiStep: (s: YinshState) => YI.aiTurn(s),
  // Changes on EVERY transition: turn, all pending flags, scores, placements, winner.
  tickKey: (s: YinshState) =>
    `${s.phase}|${s.turn ?? ''}|${s.pendingRing ?? ''}|${s.pendingRows ? s.pendingRows.who : ''}|${s.removingRing ?? ''}|${s.placed.w}-${s.placed.b}|${s.score.w}-${s.score.b}|${s.winner ?? ''}`,
}
