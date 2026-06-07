/* YOTE — netplay adapter. Maps yote's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = dark (the original human), 1 = light (the AI).
 *
 * Yote has two interaction phases inside a single seat's turn:
 *   - the normal phase: DROP a seed, MOVE one step, or MOVE-as-a-jump (capture).
 *   - the capture-removal phase: right after a jump that left removable enemies, the
 *     SAME seat must REMOVE one bonus enemy from anywhere.
 *
 * logic.ts performs a capture (jump + bonus removal) in one atomic `capture()` call,
 * but the wire protocol models them as two intents. So the adapter wraps YoteState
 * with a `pending` jump: a MOVE that is a legal jump records the jump (and shows a
 * preview board with the jumped pieces gone) without ending the turn; the following
 * REMOVE replays the authoritative `YT.capture()` on the pre-jump state to commit.
 * This keeps every win/turn rule inside logic.ts untouched.
 */

import * as YT from './logic'
import type { YoteState, Seed, Capture, Cell } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Map seat index <-> seed. Seat 0 = dark, seat 1 = light. */
const SEED: Record<number, Seed> = { 0: 'd', 1: 'l' }
export const seatOf = (seed: Seed): number => (seed === 'd' ? 0 : 1)

/** A jump awaiting its bonus-removal pick, plus the state it was launched from. */
export interface PendingCapture {
  cap: Capture
  who: Seed
  /** The YoteState the jump was launched from (pre-jump), for an authoritative replay. */
  pre: YoteState
}

/** The adapter's wrapped state: the game state, an optional pending jump, and a tick. */
export interface YoteNetState {
  game: YoteState
  pending: PendingCapture | null
  /** Monotonic counter bumped on EVERY action so the AI timer re-arms each step. */
  step: number
}

export type YoteIntent =
  | { kind: 'drop'; cell: number }
  | { kind: 'move'; from: number; to: number }
  | { kind: 'remove'; cell: number }

/** Apply just the jump (no bonus removal) to a board, for the preview view. */
function previewJump(board: Cell[], cap: Capture, who: Seed): Cell[] {
  const b = board.slice()
  b[cap.to] = who
  b[cap.from] = null
  b[cap.mid] = null
  return b
}

export const yoteAdapter: GameAdapter<YoteNetState, YoteIntent> = {
  makeGame: () => ({ game: YT.makeGame(), pending: null, step: 0 }),
  numSeats: () => 2,
  // Whoever must act next: during a pending removal it is still that capturer's seat.
  seatToMove: s => {
    if (s.pending) return seatOf(s.pending.who)
    return s.game.winner || s.game.turn === null ? null : seatOf(s.game.turn)
  },
  isOver: s => s.game.winner !== null || s.game.turn === null,

  applyIntent: (s, seat, i) => {
    if (yoteAdapter.seatToMove(s) !== seat) return s
    const who = SEED[seat]

    // ---- capture-removal phase: only a REMOVE of a removable enemy is legal ----
    if (s.pending) {
      if (i.kind !== 'remove') return s
      const after = previewJump(s.pending.pre.board, s.pending.cap, who)
      if (!YT.removableEnemies(after, who).includes(i.cell)) return s
      const game = YT.capture(s.pending.pre, s.pending.cap, i.cell, who)
      return { game, pending: null, step: s.step + 1 }
    }

    // ---- normal phase ----------------------------------------------------------
    if (i.kind === 'remove') return s
    if (i.kind === 'drop') {
      const game = YT.drop(s.game, i.cell, who)
      if (game === s.game) return s // illegal -> unchanged ref
      return { game, pending: null, step: s.step + 1 }
    }
    // kind === 'move': a one-step slide OR a jump (capture)
    const cap = YT.capturesFrom(s.game.board, i.from, who).find(c => c.to === i.to)
    if (cap) {
      const after = previewJump(s.game.board, cap, who)
      const rem = YT.removableEnemies(after, who)
      if (rem.length) {
        // enter the removal phase; same seat acts again with a REMOVE
        return { game: s.game, pending: { cap, who, pre: s.game }, step: s.step + 1 }
      }
      // no bonus enemy to take -> commit the single-piece capture immediately
      const game = YT.capture(s.game, cap, null, who)
      if (game === s.game) return s
      return { game, pending: null, step: s.step + 1 }
    }
    const game = YT.move(s.game, i.from, i.to, who)
    if (game === s.game) return s // illegal -> unchanged ref
    return { game, pending: null, step: s.step + 1 }
  },

  // Reuse the existing alpha-beta AI, performing ONE action per call. aiMove already
  // resolves a whole capture (jump + bonus) atomically, so a single step suffices and
  // we never produce a pending state for an AI seat.
  aiStep: (s, seat) => {
    if (yoteAdapter.seatToMove(s) !== seat) return s
    if (s.pending) {
      // Should not happen for an AI seat, but resolve defensively via the pure path.
      const game = YT.capture(s.pending.pre, s.pending.cap, null, s.pending.who)
      return { game, pending: null, step: s.step + 1 }
    }
    const game = YT.aiMove(s.game)
    if (game === s.game) return s
    return { game, pending: null, step: s.step + 1 }
  },

  tickKey: s => `${s.step}-${s.game.turn ?? ''}-${s.game.winner ?? ''}-${s.pending ? 'p' : ''}`,
}
