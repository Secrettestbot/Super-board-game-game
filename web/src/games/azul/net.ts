/* AZUL — netplay adapter. Maps the pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Azul is perfect information — factories, the
 * center, and both players' boards are all public — so no redactFor is needed.
 * Seats map directly to player indices: seat 0 = the first player, seat 1 = the
 * second. numSeats reads the real board count off the state (always 2 today, but
 * derived rather than hardcoded). */

import * as A from './logic'
import type { State, Move, Color } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A draft reduced to the wire essentials: where to take, which color, where it lands. */
export interface AzulIntent { source: number | 'center'; color: Color; line: number | 'floor' }

export const azulAdapter: GameAdapter<State, AzulIntent> = {
  makeGame: () => A.makeGame(),
  // Read the real player count off the state (boards is a 2-tuple today).
  numSeats: s => s.boards.length,
  seatToMove: s => (s.winner == null ? s.turn : null), // turn index == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // Validate the guest-supplied draft against the legal set for this seat; never
    // trust the raw intent. Return the input state unchanged when illegal.
    const legal = A.legalMoves(s).find(
      m => m.source === i.source && m.color === i.color && m.line === i.line,
    )
    return legal ? A.applyMove(s, legal) : s
  },
  aiStep: s => A.aiTurn(s),
  // Changes on every applied move and every round refill: step is monotonic.
  tickKey: s => `${s.step}-${s.turn}-${s.round}-${s.winner ?? ''}`,
}
