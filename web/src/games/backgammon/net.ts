/* BACKGAMMON — netplay adapter. Maps the pure checker-race logic onto the uniform
 * GameAdapter so useGameSession can host/join it. The board, the bar, the bear-off trays
 * and the dice are ALL public information, so no redactFor is needed.
 *
 * Seats map to sides: seat 0 = White ('w', the original human side), seat 1 = Black ('b',
 * the AI / remote opponent). numSeats is always 2.
 *
 * A turn has sub-steps, so each decision is a JSON intent:
 *   { kind: 'roll' }            — roll the two dice (host RNG via logic.roll); on doubles
 *                                 the logic expands them to four moves. If the roll leaves
 *                                 no legal move, the logic forfeits the turn automatically.
 *   { kind: 'move', from, die } — play one checker by one die value (`from` may be the bar
 *                                 sentinel BAR_FROM); bearing off is just a move whose die
 *                                 runs the checker off the edge. The logic ends the turn on
 *                                 its own once the dice are spent or no move remains.
 *
 * The dice RNG runs on the host (the authority) inside logic.roll — guests only request a
 * roll. seatToMove stays the SAME seat through that side's roll -> each sub-move, and only
 * advances when the logic flips s.turn (turn spent / forfeited / win). applyIntent always
 * re-validates against the logic and returns the input state unchanged for any illegal or
 * out-of-turn intent. tickKey changes on every action. */

import * as BG from './logic'
import type { BackgammonState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type BackgammonIntent =
  | { kind: 'roll' }
  | { kind: 'move'; from: number; die: number }

const SIDE: Side[] = ['w', 'b'] // seat 0 -> White, seat 1 -> Black

const seatToMove = (s: BackgammonState): number | null =>
  s.winner != null || s.turn == null ? null : SIDE.indexOf(s.turn)

export const backgammonAdapter: GameAdapter<BackgammonState, BackgammonIntent> = {
  makeGame: () => BG.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll -> every sub-move).
    // Never trust the wire: re-validate against the logic, which returns the same ref when
    // it rejects an action.
    if (seatToMove(s) !== seat || !i) return s
    const side = SIDE[seat]
    switch (i.kind) {
      case 'roll': {
        if (s.rolled) return s // already rolled this turn
        const out = BG.roll(s, side)
        return out === s ? s : out
      }
      case 'move': {
        if (!s.rolled || typeof i.from !== 'number' || typeof i.die !== 'number') return s
        const out = BG.move(s, side, i.from, i.die)
        return out === s ? s : out // move() returns the same ref for an illegal play
      }
      default:
        return s
    }
  },
  // Reuse the game's existing aiStep, which performs ONE sub-action per call (roll if not
  // yet rolled, otherwise the single best next checker move toward its planned turn). It
  // only acts when it is Black's (seat 1's) turn. One action per call keeps the checkers
  // animating one at a time and re-arms the AI timer via tickKey on every step.
  aiStep: (s, seat) => (s.winner == null && s.turn === SIDE[seat] ? BG.aiStep(s) : s),
  // Changes on EVERY action: the side to move, whether it has rolled, the exact remaining
  // dice, both bars, both off counts, and the running log length (which grows on every roll
  // and move, including back-to-back same-seat sub-moves).
  tickKey: s =>
    `${s.turn ?? ''}-${s.rolled ? 1 : 0}-${s.remaining.join(',')}-${s.barW},${s.barB}-${s.offW},${s.offB}-${s.log.length}-${s.winner ?? ''}`,
}
