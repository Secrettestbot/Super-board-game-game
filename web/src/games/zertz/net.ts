/* ZÈRTZ — netplay adapter. Maps zertz's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = the original human (player 0, moves first), 1 = the AI side (player 1).
 *
 * A turn is one of two kinded intents:
 *   - { kind: 'placeRemove', color, place, remove } — place a marble + slide an edge
 *     ring (remove may be null when nothing is removable). Forced-capture and legality
 *     are enforced by reconstructing the move from the game's legalPlaceRemove set.
 *   - { kind: 'capture', from, to } — a single mandatory jump. The host reconstructs
 *     the authoritative Jump from jumpsFrom(from) (so flags/over are never trusted), and
 *     applies ONE jump. If the same marble can keep jumping the turn stays with this seat
 *     (the chain continues, one intent per leap); otherwise finishTurn passes it on. */

import * as Z from './logic'
import type { ZertzState, Color, Player, Key } from './logic'
import type { GameAdapter } from '../../net/protocol'

export interface PlaceRemoveIntent { kind: 'placeRemove'; color: Color; place: Key; remove: Key | null }
export interface CaptureIntent { kind: 'capture'; from: Key; to: Key }
export type ZertzIntent = PlaceRemoveIntent | CaptureIntent

const seatOf = (turn: Player): number => turn // player 0/1 == seat 0/1

export const zertzAdapter: GameAdapter<ZertzState, ZertzIntent> = {
  makeGame: () => Z.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || seatOf(s.turn) !== seat) return s

    if (i.kind === 'capture') {
      // Only legal when a capture is forced; reconstruct the authoritative jump.
      if (!Z.mustCapture(s)) return s
      const j = Z.jumpsFrom(s, i.from).find(x => x.to === i.to)
      if (!j) return s
      const ns = Z.applyCapture(s, [j])
      if (ns === s) return s
      // The chain is mandatory and stays with the same seat: if the moved marble can
      // still jump, keep the turn here (one intent per leap) instead of passing it on,
      // which applyCapture's finishTurn would otherwise do.
      if (ns.winner == null && Z.jumpsFrom(ns, i.to).length > 0) {
        return { ...ns, turn: s.turn }
      }
      return ns
    }

    // place + remove: must NOT be forced to capture, and must be in the legal set.
    if (Z.mustCapture(s)) return s
    const ok = Z.legalPlaceRemove(s).some(
      m => m.color === i.color && m.place === i.place && (m.remove ?? null) === (i.remove ?? null),
    )
    if (!ok) return s
    return Z.applyPlaceRemove(s, i.color, i.place, i.remove)
  },
  // aiTurn resolves the AI's whole turn (incl. any forced chain) in one call.
  aiStep: s => Z.aiTurn(s),
  // Changes on every transition — including each leap of a chain (s.last is the set of
  // spaces touched by the latest action) — so the AI timer re-arms after each action.
  tickKey: s => `${s.turn}-${s.winner ?? ''}-${s.last.join('|')}`,
}
