/* RAILROAD INK — netplay adapter. Maps the pure roll-and-write logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything is PUBLIC — both 7x7 grids,
 * the shared dice, and every score — so no redactFor is needed. Seats map directly to the
 * player index: seat 0 = you (the original human), seat 1 = the rival. numSeats reads the
 * real player count off the state (the logic is a fixed 2-grid match).
 *
 * The SHARED dice are rolled host-side: makeGame() rolls the first round, and the logic's
 * advance() rolls each subsequent round with Math.random — that only ever runs on the
 * authority (host/local), so guests never roll. Each player draws those same pieces onto
 * their own grid, one die at a time, so every placement is one intent:
 *   { kind: 'place', dieIdx, cell, rot }  — draw the dieIdx-th rolled piece at cell/rotation
 *   { kind: 'skip',  dieIdx }             — give up a piece that has NO legal placement
 *
 * seatToMove stays the active drafter (s.turn): player 0 resolves all 4 dice, then player 1,
 * then the round advances (new shared roll). applyIntent re-validates against the logic and
 * returns the input state unchanged for any illegal / out-of-turn intent. tickKey changes on
 * every action via the monotonic s.step counter. */

import * as RR from './logic'
import type { RRState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type RailroadInkIntent =
  | { kind: 'place'; dieIdx: number; cell: number; rot: number }
  | { kind: 'skip'; dieIdx: number }

const seatToMove = (s: RRState): number | null =>
  s.winner == null && s.phase === 'place' ? s.turn : null

export const railroadInkAdapter: GameAdapter<RRState, RailroadInkIntent> = {
  makeGame: () => RR.makeGame(),
  // The match is a fixed pair of grids; read it off the state so it stays honest.
  numSeats: s => s.grids.length,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (a seat keeps drafting until all 4 of its dice resolve).
    // Never trust the wire: placeTile / skipDie each re-validate turn + legality and
    // return the SAME reference when the action is illegal.
    if (seatToMove(s) !== seat || !i) return s
    switch (i.kind) {
      case 'place': {
        if (typeof i.dieIdx !== 'number' || typeof i.cell !== 'number' || typeof i.rot !== 'number') return s
        return RR.placeTile(s, seat as Player, i.dieIdx, i.cell, i.rot)
      }
      case 'skip': {
        if (typeof i.dieIdx !== 'number') return s
        return RR.skipDie(s, seat as Player, i.dieIdx)
      }
      default:
        return s
    }
  },
  // The game's aiStep resolves ONE die for the seat at s.turn (greedy best placement, or a
  // skip when a piece can't be placed). It only acts for seat 1 (s.turn === 1), and bumps
  // s.step, so tickKey changes and the driver re-arms for the next piece. Round-advance
  // dice RNG runs inside the logic here on the host (the authority).
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? RR.aiStep(s) : s),
  // Changes on EVERY action: s.step is a monotonic counter the logic bumps on each
  // placement, skip, turn hand-off and round advance.
  tickKey: s => `${s.step}-${s.turn}-${s.round}-${s.phase}-${s.winner ?? ''}`,
}
