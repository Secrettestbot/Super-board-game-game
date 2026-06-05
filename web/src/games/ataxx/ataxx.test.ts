import { describe, it, expect } from 'vitest'
import * as AX from './logic'
import type { AtaxxState, Move } from './logic'

// Pure logic test, no DOM. Validates the opening, the clone/jump/convert rules on
// constructed boards, and plays several complete games (random legal human vs the real
// alpha-beta AI, handling passes) to assert clean termination.

const { N, idx } = AX

function emptyState(you: AX.Side = 'y'): AtaxxState {
  return {
    board: new Array(N * N).fill(null),
    turn: 'y', you, winner: null, last: null, log: [],
  }
}

describe('ataxx logic', () => {
  it('opens with two cells each in opposite corners, you to move', () => {
    const s = AX.makeGame()
    expect(s.board).toHaveLength(49)
    expect(s.turn).toBe('y')
    expect(s.winner).toBeNull()
    const { y, f, empty } = AX.counts(s.board)
    expect(y).toBe(2)
    expect(f).toBe(2)
    expect(empty).toBe(45)
    // you: top-left + bottom-right ; foe: top-right + bottom-left
    expect(s.board[idx(0, 0)]).toBe('y')
    expect(s.board[idx(N - 1, N - 1)]).toBe('y')
    expect(s.board[idx(0, N - 1)]).toBe('f')
    expect(s.board[idx(N - 1, 0)]).toBe('f')
    expect(AX.legalMoves(s.board, 'y').length).toBeGreaterThan(0)
  })

  it('a clone move adds a piece and converts adjacent enemies', () => {
    const s = emptyState()
    // you at (3,3); two foe cells adjacent to the clone target (3,4)
    s.board[idx(3, 3)] = 'y'
    s.board[idx(2, 4)] = 'f'    // diagonally adjacent to (3,4)
    s.board[idx(4, 4)] = 'f'    // diagonally adjacent to (3,4)
    const before = AX.counts(s.board)
    const m: Move = { from: idx(3, 3), to: idx(3, 4), clone: true }
    expect(AX.isLegal(s.board, m, 'y')).toBe(true)
    const ns = AX.play(s, m, 'y')
    const after = AX.counts(ns.board)
    // source stays + new clone => +1 my cell from the move, +2 from conversions
    expect(ns.board[idx(3, 3)]).toBe('y')   // source preserved
    expect(ns.board[idx(3, 4)]).toBe('y')   // clone landed
    expect(ns.board[idx(2, 4)]).toBe('y')   // converted
    expect(ns.board[idx(4, 4)]).toBe('y')   // converted
    expect(after.y).toBe(before.y + 3)      // 1 clone + 2 conversions
    expect(after.f).toBe(0)
  })

  it('a jump move relocates the piece without adding one', () => {
    const s = emptyState()
    s.board[idx(3, 3)] = 'y'
    s.board[idx(1, 2)] = 'f'    // adjacent to the jump target (1,3)? no — set up below
    // jump from (3,3) to (1,3): distance 2 (rows differ by 2)
    const m: Move = { from: idx(3, 3), to: idx(1, 3), clone: false }
    expect(AX.isLegal(s.board, m, 'y')).toBe(true)
    const before = AX.counts(s.board)
    const ns = AX.play(s, m, 'y')
    expect(ns.board[idx(3, 3)]).toBeNull()  // vacated
    expect(ns.board[idx(1, 3)]).toBe('y')   // landed
    const after = AX.counts(ns.board)
    // (1,2) is adjacent to (1,3) so it gets converted; my net count: jump +0, convert +1
    expect(ns.board[idx(1, 2)]).toBe('y')
    expect(after.y).toBe(before.y + 1)      // only the conversion, jump adds nothing
  })

  it('plays several full games (random human vs real AI) to completion with no throws', () => {
    for (let game = 0; game < 2; game++) {
      let s = AX.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 400) {
        if (s.turn === 'y') {
          const moves = AX.legalMoves(s.board, 'y')
          if (!moves.length) {
            // human cannot move; this should never persist as the turn — sanity guard
            // (logic only hands us the turn when we have a move), so break defensively
            break
          }
          const m = moves[(Math.random() * moves.length) | 0]
          s = AX.play(s, m, 'y')
        } else if (s.turn === 'f') {
          s = AX.aiMove(s)
        } else {
          break
        }
      }
      expect(s.winner).not.toBeNull()                      // terminates
      expect(['y', 'f', 'draw']).toContain(s.winner)       // valid result
      const { y, f, empty } = AX.counts(s.board)
      expect(y + f + empty).toBe(49)
      expect(y + f).toBeLessThanOrEqual(49)                // total pieces <= 49
      // winner matches the count
      if (s.winner === 'y') expect(y).toBeGreaterThan(f)
      else if (s.winner === 'f') expect(f).toBeGreaterThan(y)
      else expect(y).toBe(f)
    }
  })
})
