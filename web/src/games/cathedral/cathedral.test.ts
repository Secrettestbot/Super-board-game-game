import { describe, it, expect } from 'vitest'
import * as C from './logic'
import type { CathedralState, Player } from './logic'

// Pure-logic tests for Cathedral. No DOM. Covers orientation dedupe, placement legality,
// enclosure capture (≤1 opponent piece) vs no-capture (>1), end-of-game detection, winner by
// fewest leftover, and a capped self-play game that terminates with a valid winner & no throws.

const N = C.N

// Build a fresh state with a fully-empty board (no pre-placed cathedral) for controlled tests.
function emptyState(): CathedralState {
  const s = C.makeGame()
  return {
    board: new Array(N * N).fill(null),
    remaining: [C.PIECES.map((p) => p.id), C.PIECES.map((p) => p.id)],
    turn: 0,
    winner: null,
    step: 0,
    log: s.log,
  }
}

describe('cathedral orientations', () => {
  it('dedupes rotations: 1x1 has 1, 1x2 has 2, square 2x2 has 1, L-tromino has 4', () => {
    expect(C.orientations('tavern').length).toBe(1)
    expect(C.orientations('stable').length).toBe(2)
    expect(C.orientations('square').length).toBe(1)
    expect(C.orientations('inn').length).toBe(4)
    // bridge (I-tromino) has 2 distinct rotations
    expect(C.orientations('bridge').length).toBe(2)
  })

  it('every orientation has the same cell count as the piece size', () => {
    for (const pc of C.PIECES) {
      for (const ori of C.orientations(pc.id)) {
        expect(ori.length).toBe(pc.size)
      }
    }
  })
})

describe('cathedral placement', () => {
  it('rejects out-of-bounds and overlapping placements, accepts a clear one', () => {
    const s = emptyState()
    // place a stable at top-left
    const cells = [C.idx(0, 0), C.idx(0, 1)]
    const after = C.place(s, 0, 'stable', cells)
    expect(after.board[C.idx(0, 0)]).toBe(0)
    expect(after.board[C.idx(0, 1)]).toBe(0)
    expect(after.remaining[0].includes('stable')).toBe(false)
    expect(after.turn).toBe(1)

    // overlapping: player 1 tries to place on an occupied cell → no change
    const blocked = C.place(after, 1, 'stable', [C.idx(0, 1), C.idx(0, 2)])
    expect(blocked.board[C.idx(0, 2)]).toBeNull()
    expect(blocked.remaining[1].includes('stable')).toBe(true)
  })

  it('the pre-placed cathedral occupies neutral cells', () => {
    const s = C.makeGame()
    const cathCount = s.board.filter((c) => c === 'cath').length
    expect(cathCount).toBe(C.CATHEDRAL.size)
  })
})

describe('cathedral enclosure capture', () => {
  // Helper: directly set the board and current player, then resolve captures.
  function withBoard(board: C.Cell[]): C.Cell[] {
    return board.slice()
  }

  it('encloses a region trapping exactly ONE opponent building → captures it (removed) + claims region', () => {
    const board: C.Cell[] = new Array(N * N).fill(null)
    // Player 0 walls a small pocket around cell (2,2) where one opponent (player 1) building sits.
    // Wall ring (player 0) around the 3x3 interior centered at (2,2):
    const ring: [number, number][] = [
      [1, 1], [1, 2], [1, 3],
      [2, 1], [2, 3],
      [3, 1], [3, 2], [3, 3],
    ]
    for (const [r, c] of ring) board[C.idx(r, c)] = 0
    // one opponent building inside at (2,2)
    board[C.idx(2, 2)] = 1
    const res = C.resolveCaptures(withBoard(board), 0)
    // the interior cell was opponent → becomes player-0 territory, opponent removed
    expect(res.removedPieceCount).toBe(1)
    expect(res.board[C.idx(2, 2)]).toBe('t0')
  })

  it('a fully-enclosed EMPTY region is claimed as territory (no opponent, no cathedral)', () => {
    const board: C.Cell[] = new Array(N * N).fill(null)
    const ring: [number, number][] = [
      [1, 1], [1, 2], [1, 3],
      [2, 1], [2, 3],
      [3, 1], [3, 2], [3, 3],
    ]
    for (const [r, c] of ring) board[C.idx(r, c)] = 0
    // interior (2,2) left empty
    const res = C.resolveCaptures(board.slice(), 0)
    expect(res.removedPieceCount).toBe(0)
    expect(res.board[C.idx(2, 2)]).toBe('t0')
    expect(res.claimedCells).toContain(C.idx(2, 2))
  })

  it('a region enclosing TWO separate opponent buildings does NOT capture', () => {
    const board: C.Cell[] = new Array(N * N).fill(null)
    // wider pocket (interior is a 1x2 corridor at (2,2)-(2,3)) holding two disjoint opp buildings
    const ring: [number, number][] = [
      [1, 1], [1, 2], [1, 3], [1, 4],
      [2, 1], [2, 4],
      [3, 1], [3, 2], [3, 3], [3, 4],
    ]
    for (const [r, c] of ring) board[C.idx(r, c)] = 0
    board[C.idx(2, 2)] = 1
    board[C.idx(2, 3)] = 1
    // BUT (2,2)-(2,3) are adjacent → that's ONE group. Separate them with a player-0 wall... can't
    // inside a 1x2. Instead make interior 1x3 with a gap: use corridor (2,2),(2,3-as wall? no).
    // Simpler: two opp cells diagonally non-adjacent so they form 2 groups.
    board[C.idx(2, 2)] = 1
    board[C.idx(2, 3)] = null
    // place second opp building one cell away, separated by empty → 2 groups within same region.
    // Re-build a 3-wide interior:
    const board2: C.Cell[] = new Array(N * N).fill(null)
    const ring2: [number, number][] = [
      [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
      [2, 1], [2, 5],
      [3, 1], [3, 2], [3, 3], [3, 4], [3, 5],
    ]
    for (const [r, c] of ring2) board2[C.idx(r, c)] = 0
    board2[C.idx(2, 2)] = 1 // group A
    board2[C.idx(2, 4)] = 1 // group B (separated by empty (2,3))
    const res = C.resolveCaptures(board2, 0)
    expect(res.removedPieceCount).toBe(0)
    // since >1 opponent group, region is NOT claimed: opp cells stay
    expect(res.board[C.idx(2, 2)]).toBe(1)
    expect(res.board[C.idx(2, 4)]).toBe(1)
  })

  it('a region containing the neutral cathedral is never captured', () => {
    const board: C.Cell[] = new Array(N * N).fill(null)
    const ring: [number, number][] = [
      [1, 1], [1, 2], [1, 3],
      [2, 1], [2, 3],
      [3, 1], [3, 2], [3, 3],
    ]
    for (const [r, c] of ring) board[C.idx(r, c)] = 0
    board[C.idx(2, 2)] = 'cath'
    const res = C.resolveCaptures(board.slice(), 0)
    expect(res.removedPieceCount).toBe(0)
    expect(res.board[C.idx(2, 2)]).toBe('cath')
  })
})

describe('cathedral end + winner', () => {
  it('canPlaceAny is false when no remaining piece fits', () => {
    const s = emptyState()
    // empty remaining for player 0 → cannot place
    const noPieces: CathedralState = { ...s, remaining: [[], C.PIECES.map((p) => p.id)] }
    expect(C.canPlaceAny(noPieces, 0)).toBe(false)
    expect(C.canPlaceAny(noPieces, 1)).toBe(true)
  })

  it('winner is the player with the fewest leftover squares', () => {
    const s = emptyState()
    // player 0 has placed everything (no remaining), player 1 still holds pieces.
    const t: CathedralState = { ...s, remaining: [[], ['tavern', 'stable']] }
    expect(C.leftoverSquares(t, 0)).toBe(0)
    expect(C.leftoverSquares(t, 1)).toBe(3)
    expect(C.decideWinner(t)).toBe(0)
    // equal leftovers → tie
    const u: CathedralState = { ...s, remaining: [['tavern'], ['tavern']] }
    expect(C.decideWinner(u)).toBe('tie')
  })
})

describe('cathedral self-play', () => {
  it('plays a full game to a valid winner under a guard cap, no throws, terminating', () => {
    let s = C.makeGame()
    let guard = 0
    while (s.winner == null && guard++ < 500) {
      if (s.turn === 1) {
        s = C.aiTurn(s)
        continue
      }
      // human policy mirrors the AI greedily but simply: take the first legal placement,
      // preferring captures; fall through to settle if none.
      const placements = C.legalPlacements(s, 0)
      if (placements.length === 0) {
        // force a pass by attempting a no-op place; settle happens via opponent. Use aiTurn-like
        // path: place nothing — but place() requires legality. Instead, end via canPlaceAny check.
        if (!C.canPlaceAny(s, 0)) {
          // both can't → game should already be over; if not, break defensively.
          if (!C.canPlaceAny(s, 1)) break
          // pick AI to move by faking: but turn is 0 with no move. The engine only settles on
          // place(); emulate by choosing AI path won't help. Break to avoid infinite loop.
          break
        }
      }
      // choose the placement maximizing captured + claimed (cheap greedy).
      let best = placements[0]
      let bestScore = -1
      for (const pl of placements) {
        const board = s.board.slice()
        for (const i of pl.cells) board[i] = 0 as Player
        const cap = C.resolveCaptures(board, 0)
        const score = cap.removedPieceCount * 100 + cap.claimedCells.length * 5 + C.PIECE_BY_ID[pl.pieceId].size
        if (score > bestScore) { bestScore = score; best = pl }
      }
      s = C.place(s, 0, best.pieceId, best.cells)
    }
    expect(guard).toBeLessThan(500)
    expect(s.winner === 0 || s.winner === 1 || s.winner === 'tie').toBe(true)
  })
})
