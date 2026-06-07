/* ALQUERQUE — netplay adapter. Maps alquerque's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = White (you / Bone), 1 = Black (Obsidian).
 *
 * Captures are mandatory and multi-jumps chain with the SAME piece (turn stays put while
 * `chain` is set). tickKey therefore folds in `chain` and `last` so it changes on EVERY
 * step of a chain — re-arming the AI timer between jumps. */

import * as AQ from './logic'
import type { AlquerqueState, Move, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A move reduced to the wire essentials; the host re-validates against the legal set. */
export interface AlquerqueIntent { from: number; to: number; cap: number | null }

const SIDE: Side[] = ['w', 'b'] // seat 0 -> White, seat 1 -> Black

export const alquerqueAdapter: GameAdapter<AlquerqueState, AlquerqueIntent> = {
  makeGame: () => AQ.makeGame(),
  numSeats: () => 2,
  seatToMove: s => {
    if (s.winner || s.turn === null) return null
    return s.turn === 'w' ? 0 : 1
  },
  isOver: s => s.winner !== null,
  applyIntent: (s, seat, i) => {
    if (s.winner || s.turn === null) return s
    const who = SIDE[seat]
    if (s.turn !== who) return s
    // Re-derive the authoritative Move from the legal set so we never trust guest input
    // (this also enforces mandatory-capture / chain restrictions via legalMoves).
    const legal = AQ.legalMoves(s.board, who, s.chain)
    const m: Move | undefined = legal.find(
      x => x.from === i.from && x.to === i.to && x.cap === (i.cap ?? null),
    )
    return m ? AQ.makeMove(s, m, who) : s
  },
  aiStep: s => AQ.aiMove(s),
  // chain + last change between chained jumps even though `turn` is unchanged, so the
  // AI timer re-arms for each leap of a multi-capture.
  tickKey: s =>
    `${s.turn ?? '_'}-${s.chain ?? '_'}-${s.last ? `${s.last.from}>${s.last.to}` : '_'}-${s.winner ?? ''}`,
}
