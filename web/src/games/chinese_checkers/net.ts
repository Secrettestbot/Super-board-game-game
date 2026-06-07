/* CHINESE CHECKERS — netplay adapter. Maps the pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor. Seats map directly to player indices: seat 0 = South (player 0),
 * seat 1 = North (player 1). The current makeGame is 2-player, but numSeats reads
 * the real player count off the board so 3+ would work if a future state has it. */

import * as CC from './logic'
import type { State, Move } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials: the full path of hole ids. */
export interface ChineseCheckersIntent { path: Move }

function pathsEqual(a: Move, b: Move): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export const chineseCheckersAdapter: GameAdapter<State, ChineseCheckersIntent> = {
  makeGame: () => CC.makeGame(),
  // Read the actual number of distinct players present on the board (min 2), so a
  // 3+ player state would report its real seat count automatically.
  numSeats: s => {
    let max = -1
    for (const occ of s.board) if (occ != null && occ > max) max = occ
    return Math.max(2, max + 1)
  },
  seatToMove: s => (s.winner == null ? s.turn : null), // turn index == seat index
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    // Validate the guest-supplied path against the legal set for this seat; never
    // trust the raw path. Return the input state unchanged when illegal.
    const legal = CC.legalMoves(s, seat as 0 | 1).find(m => pathsEqual(m, i.path))
    return legal ? CC.applyMove(s, legal) : s
  },
  aiStep: (s, seat) => CC.aiTurn(s, seat as 0 | 1),
  tickKey: s => {
    // Changes on every transition: turn flips each move, and last carries the path.
    const last = s.last ? s.last.join('.') : ''
    return `${s.turn}-${s.winner ?? ''}-${last}`
  },
}
