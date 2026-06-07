/* DARA — netplay adapter. Maps dara's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor.
 * Seats: 0 = Sand ('s', the original human side, s.you), 1 = Slate ('a').
 *
 * Dara has two phases (drop / move) and a sub-action: when a move forms a line of
 * EXACTLY three (a "dara"), the SAME mover removes one opponent stone before the
 * turn passes. So a single "turn" can contain a capture sub-action by the same seat.
 * We model each discrete action as a kinded intent:
 *   { kind: 'place',  cell }      — drop a stone (drop phase)
 *   { kind: 'move',   from, to }  — slide a stone (move phase)
 *   { kind: 'remove', cell }      — capture a rival stone (after forming a dara)
 *
 * seatToMove returns whoever the state says must act next — which STAYS the same seat
 * during its own capture (logic keeps s.turn unchanged while pendingCapture is set).
 * applyIntent validates the action against the current phase + that seat's turn and
 * returns the input state unchanged if illegal / out-of-turn (each reducer re-validates).
 * tickKey changes on EVERY action (incl. the capture) so the AI re-arms for it. */

import * as DA from './logic'
import type { DaraState, Stone } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type DaraIntent =
  | { kind: 'place'; cell: number }
  | { kind: 'move'; from: number; to: number }
  | { kind: 'remove'; cell: number }

// seat 0 = sand ('s', s.you), seat 1 = slate ('a').
const STONE: Stone[] = ['s', 'a']
const seatStone = (seat: number): Stone | null => (seat === 0 ? 's' : seat === 1 ? 'a' : null)

export const daraAdapter: GameAdapter<DaraState, DaraIntent> = {
  makeGame: () => DA.makeGame(),
  numSeats: () => 2,
  // s.turn is the stone to act; it stays the same stone during that side's capture.
  seatToMove: s => (s.winner != null || s.turn == null ? null : STONE.indexOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null) return s
    const who = seatStone(seat)
    if (who == null || s.turn !== who) return s
    // Each reducer (drop/move/capture) re-validates phase + turn + legality and returns
    // the input state unchanged when the action is illegal, so out-of-phase intents are safe.
    switch (i.kind) {
      case 'place': return DA.drop(s, i.cell, who)
      case 'move': return DA.move(s, i.from, i.to, who)
      case 'remove': return DA.capture(s, i.cell, who)
      default: return s
    }
  },
  // aiMove plays the AI's whole turn (drop, or move + any forced capture) in one call,
  // resolving a pending capture first if state is parked there. One aiStep == one
  // advanced state with a fresh tickKey.
  aiStep: (s, seat) => {
    const who = seatStone(seat)
    if (who == null || s.turn !== who || s.winner != null) return s
    return DA.aiMove(s)
  },
  // Changes on EVERY action: phase + turn + hands + pendingCapture + last cell all move.
  tickKey: s =>
    `${s.phase}-${s.turn ?? ''}-${s.hand.s},${s.hand.a}-${s.pendingCapture ?? ''}-${s.last ?? ''}-${s.winner ?? ''}`,
}
