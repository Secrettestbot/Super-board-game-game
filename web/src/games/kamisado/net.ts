/* KAMISADO — netplay adapter. Maps kamisado's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor. Seats: 0 = 'you' (the side that moves first, up the board),
 * 1 = 'ai' (moves down the board). The active tower is forced by the required
 * colour, but the intent still carries {from,to} so move() can validate it. */

import * as KM from './logic'
import type { KState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** Seat index -> the logic's player encoding. */
const SEAT: Player[] = ['you', 'ai']
const seatOf = (p: Player): number => (p === 'you' ? 0 : 1)

/** A move reduced to the wire essentials; the host re-validates against legalMoves. */
export interface KamisadoIntent { from: number; to: number }

export const kamisadoAdapter: GameAdapter<KState, KamisadoIntent> = {
  makeGame: () => KM.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null || seatOf(s.turn) !== seat) return s
    const who = SEAT[seat]
    // Only trust the move if it's in the legal set for this player (respects the
    // forced-colour constraint inside legalMoves); never trust guest-supplied data.
    const legal = KM.legalMoves(s, who).some(m => m.from === i.from && m.to === i.to)
    return legal ? KM.move(s, i.from, i.to) : s
  },
  aiStep: s => KM.aiMove(s),
  tickKey: s => `${s.last?.from ?? -1}-${s.last?.to ?? -1}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
