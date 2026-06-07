/* CATHEDRAL — netplay adapter. Maps cathedral's pure logic onto the uniform GameAdapter
 * so useGameSession can host/join it. Perfect information, so no redactFor is needed.
 * Seats: 0 = human (you), 1 = AI/rival (matches Player). A turn places one piece. */

import * as C from './logic'
import type { CathedralState, Player } from './logic'
import type { GameAdapter } from '../../net/protocol'

/** A placement reduced to the wire essentials: which piece, where (anchor cell), and which
 * rotation. The host reconstructs the authoritative absolute cells from the legal set. */
export interface CathedralIntent { piece: string; cell: number; orientation: number }

const N = C.N

/** Absolute board cells for a piece's orientation anchored at `cell`, or null if off-board. */
function cellsAt(piece: string, orientation: number, cell: number): number[] | null {
  const oris = C.orientations(piece)
  if (oris.length === 0) return null
  const shape = oris[orientation % oris.length]
  const ar = Math.floor(cell / N)
  const ac = cell % N
  const cells: number[] = []
  for (const [dr, dc] of shape) {
    const r = ar + dr
    const c = ac + dc
    if (!C.inBounds(r, c)) return null
    cells.push(C.idx(r, c))
  }
  return cells
}

export const cathedralAdapter: GameAdapter<CathedralState, CathedralIntent> = {
  makeGame: () => C.makeGame(),
  numSeats: () => 2,
  seatToMove: s => (s.winner == null ? s.turn : null),
  isOver: s => s.winner != null,
  applyIntent: (s, seat, i) => {
    if (s.winner != null || s.turn !== seat) return s
    const cells = cellsAt(i.piece, i.orientation, i.cell)
    if (!cells) return s
    // Validate against the legal placement set, then apply via the pure transition.
    const sorted = [...cells].sort((a, b) => a - b)
    const legal = C.placementsForPiece(s, seat as Player, i.piece).some(
      pl =>
        pl.cells.length === sorted.length &&
        [...pl.cells].sort((a, b) => a - b).every((v, k) => v === sorted[k]),
    )
    if (!legal) return s
    return C.place(s, seat as Player, i.piece, cells)
  },
  aiStep: s => C.aiTurn(s),
  tickKey: s => `${s.step}-${s.turn}-${s.winner ?? ''}`,
}
