/* THE ROYAL GAME OF UR — netplay adapter. Maps ur's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Everything is PUBLIC (board, dice,
 * the roll), so no redactFor is needed. Seats map directly to players: seat 0 = You
 * (the light stones), seat 1 = the rival (dark).
 *
 * A turn has two sub-steps, each a JSON intent:
 *   { kind: 'roll'           } — cast the four binary dice (host RNG). May land in a movable
 *                                state, or, on a 0 / dead roll, pass the turn straight back to
 *                                the foe (doRoll auto-resolves both).
 *   { kind: 'move', piece    } — advance piece #`piece` along its owner's track by the roll.
 *
 * The dice roll is RNG on the host (the authority); guests just request a roll. seatToMove
 * STAYS the same seat across a roll -> move that lands on a ROSETTE — the logic keeps `turn`
 * on the mover and clears `rolled` so they roll again. applyIntent validates against the real
 * logic and returns the input state unchanged for any illegal / out-of-turn intent.
 * tickKey changes on every action. */

import * as UR from './logic'
import type { UrState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type UrIntent =
  | { kind: 'roll' }
  | { kind: 'move'; piece: number }

const SEAT_PLAYER: Record<number, Player> = { 0: 'you', 1: 'foe' }
const PLAYER_SEAT: Record<Player, number> = { you: 0, foe: 1 }

const seatToMove = (s: UrState): number | null => (s.winner == null ? PLAYER_SEAT[s.turn] : null)

export const urAdapter: GameAdapter<UrState, UrIntent> = {
  makeGame: () => UR.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through roll -> move and through any
    // rosette extra turn). Never trust the wire: re-validate against the logic.
    if (seatToMove(s) !== seat || !i) return s
    const mover = SEAT_PLAYER[seat]
    switch (i.kind) {
      case 'roll': {
        if (s.rolled) return s // already rolled this turn; must move first
        const out = UR.doRoll(s)
        return out === s ? s : out // doRoll rejects (won / already rolled) by returning the same ref
      }
      case 'move': {
        if (!s.rolled || s.roll == null || typeof i.piece !== 'number') return s
        // Only a piece with a legal destination may move; move() re-checks but guard here too.
        if (!UR.legalMoves(s, mover, s.roll).includes(i.piece)) return s
        const out = UR.move(s, mover, i.piece)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single-sub-step AI: when it hasn't rolled it casts the dice
  // (auto-passing on 0 / dead rolls), otherwise it plays its best legal piece. It only acts
  // for seat 1 ('foe') and returns the same ref otherwise. One action per call so the timer
  // re-arms on each sub-step (including rosette extra rolls). The AI dice RNG runs here on the
  // host (the authority).
  aiStep: (s, seat) => (s.winner == null && PLAYER_SEAT[s.turn] === seat ? UR.aiStep(s) : s),
  // Changes on EVERY action: turn, the rolled flag + roll value, the dice signature, both
  // home counts, every piece's position (capture / advance / bear-off), and the log length
  // (grows on every mutation, covering back-to-back rosette extra rolls and turn-passing
  // dead rolls).
  tickKey: s =>
    `${s.turn}-${s.rolled ? 1 : 0}-${s.roll ?? ''}-${s.dice.join('')}-${UR.home(s, 'you')}.${UR.home(s, 'foe')}-${s.pieces.you.join(',')}-${s.pieces.foe.join(',')}-${s.log.length}-${s.winner ?? ''}`,
}
