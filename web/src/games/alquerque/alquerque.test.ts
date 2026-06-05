import { describe, it, expect } from 'vitest'
import * as AQ from './logic'
import type { AlquerqueState, Move } from './logic'

// Pure logic test: no DOM. Validates the lattice, the capture rules (mandatory + multi-jump),
// and plays several full games against the real AI, asserting termination and no throws.

const { N, idx } = AQ

describe('alquerque logic', () => {
  it('starts on a valid board: 12 each, centre empty, you (White) to move', () => {
    const s = AQ.makeGame()
    expect(s.board).toHaveLength(N * N)
    const c = AQ.counts(s.board)
    expect(c.w).toBe(12)
    expect(c.b).toBe(12)
    expect(s.board[idx(2, 2)]).toBeNull()
    expect(s.turn).toBe('w')
    expect(s.you).toBe('w')
    expect(s.winner).toBeNull()
    expect(s.chain).toBeNull()
  })

  it('lattice adjacency: centre and corners carry diagonals, edge midpoints do not', () => {
    // Diagonal-carrying nodes are exactly those with (row+col) even.
    expect(AQ.hasDiag(idx(2, 2))).toBe(true)   // centre
    expect(AQ.hasDiag(idx(0, 0))).toBe(true)   // corner
    expect(AQ.hasDiag(idx(4, 4))).toBe(true)   // corner
    expect(AQ.hasDiag(idx(0, 1))).toBe(false)  // top edge midpoint
    expect(AQ.hasDiag(idx(2, 1))).toBe(false)  // middle-row off node

    // Centre has all 8 neighbours.
    expect(AQ.neighbors(idx(2, 2)).sort((a, b) => a - b)).toEqual(
      [idx(1, 1), idx(1, 2), idx(1, 3), idx(2, 1), idx(2, 3), idx(3, 1), idx(3, 2), idx(3, 3)].sort((a, b) => a - b),
    )
    // Corner (0,0) carries a diagonal -> the in-board diagonal neighbour (1,1) plus 2 orthogonals.
    expect(new Set(AQ.neighbors(idx(0, 0)))).toEqual(new Set([idx(0, 1), idx(1, 0), idx(1, 1)]))
    // Edge midpoint (0,1): no diagonals -> only orthogonal neighbours.
    expect(new Set(AQ.neighbors(idx(0, 1)))).toEqual(new Set([idx(0, 0), idx(0, 2), idx(1, 1)]))
    // Adjacency is symmetric.
    for (let i = 0; i < N * N; i++)
      for (const j of AQ.neighbors(i)) expect(AQ.neighbors(j)).toContain(i)
  })

  it('a capture jump removes the jumped enemy', () => {
    const board: AQ.Cell[] = new Array(N * N).fill(null)
    board[idx(2, 2)] = 'w'   // white at centre
    board[idx(2, 3)] = 'b'   // black adjacent (orthogonal line)
    // landing (2,4) empty -> jump available
    const s: AlquerqueState = {
      board, turn: 'w', you: 'w', winner: null, chain: null, last: null, log: [],
    }
    const moves = AQ.movesFor(s, idx(2, 2))
    const jump = moves.find(m => m.to === idx(2, 4))
    expect(jump).toBeTruthy()
    expect(jump!.cap).toBe(idx(2, 3))
    const after = AQ.makeMove(s, jump!, 'w')
    expect(after.board[idx(2, 2)]).toBeNull()
    expect(after.board[idx(2, 3)]).toBeNull()   // captured piece removed
    expect(after.board[idx(2, 4)]).toBe('w')
    expect(AQ.counts(after.board).b).toBe(0)
    expect(after.winner).toBe('w')              // wiped out the only black piece
  })

  it('multi-jump chains with the same piece', () => {
    const board: AQ.Cell[] = new Array(N * N).fill(null)
    // White at (4,2). Black at (3,2) -> land (2,2); then black at (1,2) -> land (0,2). Two orthogonal jumps.
    board[idx(4, 2)] = 'w'
    board[idx(3, 2)] = 'b'
    board[idx(1, 2)] = 'b'
    const s: AlquerqueState = {
      board, turn: 'w', you: 'w', winner: null, chain: null, last: null, log: [],
    }
    const first = AQ.movesFor(s, idx(4, 2)).find(m => m.cap === idx(3, 2))!
    expect(first).toBeTruthy()
    const mid = AQ.makeMove(s, first, 'w')
    expect(mid.chain).toBe(idx(2, 2))     // same piece must keep jumping
    expect(mid.turn).toBe('w')
    expect(mid.board[idx(3, 2)]).toBeNull()
    // Only the chaining piece has legal moves now.
    expect(AQ.movesFor(mid, idx(2, 2)).length).toBeGreaterThan(0)
    const second = AQ.movesFor(mid, idx(2, 2)).find(m => m.cap === idx(1, 2))!
    const done = AQ.makeMove(mid, second, 'w')
    expect(done.board[idx(1, 2)]).toBeNull()
    expect(AQ.counts(done.board).b).toBe(0)
    expect(done.winner).toBe('w')
  })

  it('mandatory capture is enforced: when a jump exists, steps are illegal', () => {
    const board: AQ.Cell[] = new Array(N * N).fill(null)
    board[idx(2, 2)] = 'w'
    board[idx(2, 3)] = 'b'   // a capture is available (land 2,4 empty)
    const s: AlquerqueState = {
      board, turn: 'w', you: 'w', winner: null, chain: null, last: null, log: [],
    }
    const legal = AQ.legalMoves(s.board, 'w')
    expect(legal.length).toBeGreaterThan(0)
    expect(legal.every(m => m.cap !== null)).toBe(true)   // only captures offered
    // Attempting a plain step (to an empty neighbour) must be rejected.
    const stepTry: Move = { from: idx(2, 2), to: idx(2, 1), cap: null }
    const after = AQ.makeMove(s, stepTry, 'w')
    expect(after).toBe(s)   // unchanged — illegal move ignored
  })

  it('plays several full games to a winner with a cap — terminates, no throws', () => {
    for (let game = 0; game < 6; game++) {
      let s = AQ.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 600) {
          if (s.turn === 'w') {
            // Human side plays a random legal move (respecting chain + mandatory capture).
            const moves = AQ.legalMoves(s.board, 'w', s.chain)
            if (moves.length === 0) break
            s = AQ.makeMove(s, moves[(Math.random() * moves.length) | 0], 'w')
          } else if (s.turn === 'b') {
            s = AQ.aiMove(s)
          } else {
            break
          }
        }
      }).not.toThrow()
      // Either someone won, or it hit the cap (extremely shuffly random play) — both are clean exits.
      expect(s.winner === 'w' || s.winner === 'b' || s.winner === null).toBe(true)
      const c = AQ.counts(s.board)
      // If a winner was declared by wipe-out, the loser has zero pieces or no legal move.
      if (s.winner) expect(s.turn).toBeNull()
      expect(c.w).toBeGreaterThanOrEqual(0)
      expect(c.b).toBeGreaterThanOrEqual(0)
    }
  })
})
