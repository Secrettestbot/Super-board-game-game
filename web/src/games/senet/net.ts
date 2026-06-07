/* SENET — netplay adapter. Maps senet's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Everything is PUBLIC (board, sticks, the roll), so no
 * redactFor is needed. Seats map directly to players: seat 0 = You (the obsidian pawns),
 * seat 1 = the rival (alabaster).
 *
 * A turn has two sub-steps, each a JSON intent:
 *   { kind: 'throw'        } — cast the four sticks (host RNG). May land in 'move', or, on a
 *                              dead roll, pass the turn straight back to 'throw' for the foe.
 *   { kind: 'move', pawn   } — advance the pawn at path index `pawn` by the current roll.
 *
 * The stick cast is RNG on the host (the authority); guests just request a throw. seatToMove
 * STAYS the same seat across a throw -> move that earned an extra throw (1/4/5) — the logic
 * keeps `turn` on the mover and returns to the 'throw' phase. applyIntent validates against the
 * real logic and returns the input state unchanged for any illegal / out-of-turn intent.
 * tickKey changes on every action. */

import * as SN from './logic'
import type { SenetState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

export type SenetIntent =
  | { kind: 'throw' }
  | { kind: 'move'; pawn: number }

const seatToMove = (s: SenetState): number | null => (s.winner == null ? s.turn : null)

export const senetAdapter: GameAdapter<SenetState, SenetIntent> = {
  makeGame: () => SN.makeGame(),
  numSeats: () => 2,
  seatToMove,
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    // Must be this seat's turn (it stays the same seat through throw -> move and through any
    // extra-throw). Never trust the wire: re-validate against the logic.
    if (seatToMove(s) !== seat || !i) return s
    const mover = seat as Player
    switch (i.kind) {
      case 'throw': {
        if (s.phase !== 'throw') return s
        const out = SN.throwSticks(s)
        return out === s ? s : out // throwSticks rejects (wrong phase / over) by returning the same ref
      }
      case 'move': {
        if (s.phase !== 'move' || s.roll == null || typeof i.pawn !== 'number') return s
        // Only a pawn with a legal destination may move; movePawn re-checks but guard here too.
        if (!SN.legalMoves(s, mover, s.roll).includes(i.pawn)) return s
        const out = SN.movePawn(s, mover, i.pawn)
        return out === s ? s : out
      }
      default:
        return s
    }
  },
  // Reuse the game's existing single-sub-step AI: in 'throw' it casts, in 'move' it plays the
  // best legal pawn. It only acts for seat 1 (s.turn === 1) and returns the same ref otherwise.
  // One action per call so the timer re-arms on each sub-step (including extra throws). The AI
  // stick RNG runs here on the host (the authority).
  aiStep: (s, seat) => (s.winner == null && s.turn === seat ? SN.aiStep(s) : s),
  // Changes on EVERY action: turn, phase, the roll + stick signature, both off counts, the
  // board signature (pawn positions move on every play), and the log length (grows on every
  // mutation, covering back-to-back same-seat extra throws and turn-passing dead rolls).
  tickKey: s =>
    `${s.turn}-${s.phase}-${s.roll ?? ''}-${s.sticks.join('')}-${s.off[0]}.${s.off[1]}-${s.board.map(b => (b == null ? '.' : b)).join('')}-${s.log.length}-${s.winner ?? ''}`,
}
