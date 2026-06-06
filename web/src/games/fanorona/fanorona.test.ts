import { describe, it, expect } from 'vitest'
import * as FN from './logic'
import type { FanoronaState, Move, Cell } from './logic'

// Pure logic test (no DOM). Verifies setup, the approach/withdrawal capture mechanics, the
// mandatory-capture rule, and plays several full games to termination against the real AI.

const { N, idx, makeGame, counts, legalMoves, applyMove, captureMoves, capturedBy } = FN

/** Build a state with an explicit board and side to move (no chain in progress). */
function fromBoard(board: Cell[], turn: 'w' | 'b'): FanoronaState {
  return { board, turn, you: 'w', winner: null, chainAt: null, chainVisited: [], chainDirs: [], last: null, log: [] }
}
const empty = (): Cell[] => new Array(N).fill(null)

describe('fanorona setup', () => {
  it('starts with 22 White, 22 Black, an empty centre, and White to move', () => {
    const s = makeGame()
    expect(s.board).toHaveLength(45)
    const { w, b } = counts(s.board)
    expect(w).toBe(22)
    expect(b).toBe(22)
    expect(s.board[idx(2, 4)]).toBeNull()            // centre empty
    expect(s.turn).toBe('w')
    expect(s.you).toBe('w')
    expect(s.winner).toBeNull()
    // 45 points, 22 + 22 + 1 empty
    expect(s.board.filter(c => c === null)).toHaveLength(1)
  })

  it('strong points (row+col even) connect 8 ways; weak points only 4 (interior check)', () => {
    // interior strong point (2,4): 8 neighbours; interior weak point (2,3): 4 neighbours
    expect(FN.neighbours(idx(2, 4))).toHaveLength(8)
    expect(FN.neighbours(idx(2, 3))).toHaveLength(4)
  })
})

describe('capture mechanics', () => {
  it('approach capture removes the whole contiguous enemy line ahead', () => {
    // Row 2 (all strong/weak mix irrelevant here — pure orthogonal move along the row):
    // place White at (2,0); empty (2,1); Black at (2,2),(2,3),(2,4); then a White stopper-gap.
    const board = empty()
    board[idx(2, 0)] = 'w'
    board[idx(2, 2)] = 'b'; board[idx(2, 3)] = 'b'; board[idx(2, 4)] = 'b'
    const s = fromBoard(board, 'w')
    const moves = legalMoves(s)
    // mandatory capture: the only legal move is the approach from (2,0)->(2,1)
    const m = moves.find(x => x.from === idx(2, 0) && x.to === idx(2, 1) && x.kind === 'approach')
    expect(m).toBeTruthy()
    const taken = capturedBy(s.board, m as Move, 'w')
    expect(taken.sort((a, c) => a - c)).toEqual([idx(2, 2), idx(2, 3), idx(2, 4)])
    const ns = applyMove(s, m as Move)
    expect(ns.board[idx(2, 1)]).toBe('w')
    expect(ns.board[idx(2, 2)]).toBeNull()
    expect(ns.board[idx(2, 3)]).toBeNull()
    expect(ns.board[idx(2, 4)]).toBeNull()
    expect(counts(ns.board).b).toBe(0)
  })

  it('withdrawal capture removes the contiguous enemy line behind the origin', () => {
    // White at (2,4) with Black at (2,5),(2,6) behind it (to the right); White steps LEFT to (2,3),
    // withdrawing from the file to its right -> captures (2,5),(2,6).
    const board = empty()
    board[idx(2, 4)] = 'w'
    board[idx(2, 5)] = 'b'; board[idx(2, 6)] = 'b'
    const s = fromBoard(board, 'w')
    const moves = legalMoves(s)
    const m = moves.find(x => x.from === idx(2, 4) && x.to === idx(2, 3) && x.kind === 'withdrawal')
    expect(m).toBeTruthy()
    const taken = capturedBy(s.board, m as Move, 'w')
    expect(taken.sort((a, c) => a - c)).toEqual([idx(2, 5), idx(2, 6)])
    const ns = applyMove(s, m as Move)
    expect(ns.board[idx(2, 3)]).toBe('w')
    expect(ns.board[idx(2, 5)]).toBeNull()
    expect(ns.board[idx(2, 6)]).toBeNull()
  })

  it('enforces mandatory capture — when a capture exists, no non-capturing move is legal', () => {
    const board = empty()
    board[idx(2, 0)] = 'w'
    board[idx(2, 2)] = 'b'                            // approach target ahead of (2,0)->(2,1)
    board[idx(4, 8)] = 'w'                            // a far White that could otherwise paika-step
    const s = fromBoard(board, 'w')
    const moves = legalMoves(s)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.kind !== null)).toBe(true)   // every legal move captures
    // the idle far piece has no capture, so it must not appear
    expect(moves.some(m => m.from === idx(4, 8))).toBe(false)
  })

  it('lets the player choose when both approach and withdrawal are available', () => {
    // White at (2,4). Black ahead at (2,2),(2,1) for a withdrawal when moving RIGHT? Construct so a
    // single destination yields BOTH kinds: move (2,4)->(2,3) (leftward dir = (0,-1)).
    //   approach: point beyond (2,3) in dir (0,-1) is (2,2) -> Black
    //   withdrawal: point behind origin (2,4) opposite dir = (2,5) -> Black
    const board = empty()
    board[idx(2, 4)] = 'w'
    board[idx(2, 2)] = 'b'                            // approach line ahead of destination
    board[idx(2, 5)] = 'b'                            // withdrawal line behind origin
    const s = fromBoard(board, 'w')
    const dest = idx(2, 3)
    const opts = captureMoves(s.board, idx(2, 4), 'w').filter(m => m.to === dest)
    const kinds = new Set(opts.map(o => o.kind))
    expect(kinds.has('approach')).toBe(true)
    expect(kinds.has('withdrawal')).toBe(true)
  })
})

describe('full games to a winner', () => {
  function randomHumanMove(s: FanoronaState): FanoronaState {
    const moves = legalMoves(s)
    if (!moves.length) return s
    // sometimes voluntarily end a chain instead of continuing
    if (s.chainAt !== null && Math.random() < 0.35) return FN.stopChain(s)
    const m = moves[(Math.random() * moves.length) | 0]
    return applyMove(s, m)
  }

  it('plays several complete games to termination with no throws and no colour over 22', () => {
    for (let game = 0; game < 6; game++) {
      let s = makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 4000) {
          const { w, b } = counts(s.board)
          expect(w).toBeLessThanOrEqual(22)
          expect(b).toBeLessThanOrEqual(22)
          if (s.turn === 'w') s = randomHumanMove(s)
          else s = FN.aiMove(s)
          // guard against a stuck side with no legal move (declare loss to terminate cleanly)
          if (!s.winner && s.turn && legalMoves(s).length === 0) {
            s = { ...s, winner: FN.other(s.turn), turn: null }
          }
        }
      }).not.toThrow()
      expect(s.winner).not.toBeNull()                // always terminates
      const { w, b } = counts(s.board)
      // the winner captured everything (or the loser was stuck); never exceed 22
      expect(w).toBeLessThanOrEqual(22)
      expect(b).toBeLessThanOrEqual(22)
      if (s.winner === 'w') expect(b === 0 || legalMoves({ ...s, turn: 'b', winner: null }).length === 0).toBe(true)
      if (s.winner === 'b') expect(w === 0 || legalMoves({ ...s, turn: 'w', winner: null }).length === 0).toBe(true)
    }
  })
})
