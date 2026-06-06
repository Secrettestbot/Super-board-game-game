/* FOX AND HOUNDS — netplay adapter. Maps the asymmetric fox-vs-hounds logic onto the
 * uniform GameAdapter so useGameSession can host/join it. Perfect information, so no
 * redactFor is needed.
 *
 * Seats: 0 = FOX (the side the solo human plays), 1 = HOUNDS (the solo AI side). The two
 * seats control DIFFERENT pieces — a guest joining seat 1 drives the four hounds while the
 * host (seat 0) keeps the fox. */

import * as FH from './logic'
import type { FHState, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** seat 0 = fox, seat 1 = hounds. */
const SIDE: Side[] = ['fox', 'hound']
export const seatOf = (side: Side): number => (side === 'fox' ? 0 : 1)

/**
 * A move reduced to wire essentials. The fox move is fully described by its destination;
 * a hound move needs which hound (`hi`) plus its destination. The host reconstructs/validates
 * against the legal set, so guest-supplied data is never trusted.
 */
export interface FoxHoundsIntent { to: number; hi?: number }

export const foxHoundsAdapter: GameAdapter<FHState, FoxHoundsIntent> = {
  makeGame: () => FH.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner != null || s.turn == null ? null : seatOf(s.turn)),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn == null) return s
    if (seatOf(s.turn) !== seat) return s
    if (SIDE[seat] === 'fox') {
      // validate the destination against the fox's legal moves
      const legal = FH.legalMoves({ fox: s.fox, hounds: s.hounds }, 'fox')
      return legal.includes(i.to) ? FH.moveFox(s, i.to) : s
    }
    // hounds: must identify which hound, and the destination must be legal for that hound
    if (i.hi == null || i.hi < 0 || i.hi >= s.hounds.length) return s
    const occ = new Set<number>([s.fox, ...s.hounds])
    return FH.houndMoves(s.hounds[i.hi], occ).includes(i.to) ? FH.moveHound(s, i.hi, i.to) : s
  },
  aiStep: s => FH.aiMove(s),
  tickKey: s => `${s.fox}-${s.hounds.join(',')}-${s.turn ?? ''}-${s.winner ?? ''}`,
}
