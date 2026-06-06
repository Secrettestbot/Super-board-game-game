/* NIM — netplay adapter. Maps nim's pure logic onto the uniform GameAdapter so
 * useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = the human side ('you'), 1 = the AI side ('ai'). */

import * as NM from './logic'
import type { NimState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A removal reduced to the wire essentials. */
export interface NimIntent { heap: number; count: number }

const SEAT_TO_PLAYER: Record<number, Player> = { 0: 'you', 1: 'ai' }
const playerToSeat = (p: Player | null): number | null => (p === 'you' ? 0 : p === 'ai' ? 1 : null)

export const nimAdapter: GameAdapter<NimState, NimIntent> = {
  makeGame: () => NM.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner ? null : playerToSeat(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    const who = SEAT_TO_PLAYER[seat]
    if (s.winner || who == null || s.turn !== who) return s
    // NM.take validates heap bounds, turn, and count; returns the same state if illegal.
    return NM.take(s, i.heap, i.count, who)
  },
  aiStep: s => NM.aiMove(s),
  tickKey: s => `${s.heaps.join(',')}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
