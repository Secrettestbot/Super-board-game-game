import { describe, it, expect } from 'vitest'
import * as BT from './logic'
import type { BreakthroughState, Move } from './logic'

// Pure logic test: no DOM. Plays full games against the real AI and asserts invariants.
// `npm test` runs this alongside every other game's test.

const N = BT.N

describe('breakthrough logic', () => {
  it('starts on a valid initial board, White to move', () => {
    const s = BT.makeGame()
    expect(s.board).toHaveLength(N * N)
    const { w, b } = BT.counts(s.board)
    expect(w).toBe(16)
    expect(b).toBe(16)
    // White fills rows 6 & 7, Black fills rows 0 & 1
    for (let c = 0; c < N; c++) {
      expect(s.board[6 * N + c]).toBe('w')
      expect(s.board[7 * N + c]).toBe('w')
      expect(s.board[0 * N + c]).toBe('b')
      expect(s.board[1 * N + c]).toBe('b')
    }
    expect(s.turn).toBe('w')
    expect(s.winner).toBeNull()
  })

  it('captures diagonally but never straight ahead, and reaching the far row wins', () => {
    // Construct a position: a white pawn at row 1 with a black pawn straight ahead (row 0)
    // and another black pawn diagonally ahead.
    const board: BT.Cell[] = new Array(N * N).fill(null)
    board[1 * N + 3] = 'w'   // white pawn, moves up toward row 0
    board[0 * N + 3] = 'b'   // straight ahead — must NOT be capturable
    board[0 * N + 4] = 'b'   // diagonal ahead — capturable
    const s: BreakthroughState = { board, turn: 'w', you: 'w', winner: null, last: null, log: [] }

    const moves = BT.legalMoves(board, 'w')
    // straight-forward onto an enemy is illegal
    expect(moves.some(m => m.to === 0 * N + 3)).toBe(false)
    // diagonal capture is legal and flagged
    const capMove = moves.find(m => m.to === 0 * N + 4)
    expect(capMove).toBeDefined()
    expect((capMove as Move).cap).toBe(true)
    // a diagonal step onto an EMPTY square (forward-left, col 2) is a non-capture move
    const stepMove = moves.find(m => m.to === 0 * N + 2)
    expect(stepMove).toBeDefined()
    expect((stepMove as Move).cap).toBe(false)

    // playing the capture removes the enemy AND reaches row 0 => instant win
    const after = BT.move(s, capMove as Move, 'w')
    expect(after.board[0 * N + 4]).toBe('w')
    expect(after.board[1 * N + 3]).toBeNull()
    expect(after.winner).toBe('w')
    const cnt = BT.counts(after.board)
    expect(cnt.b).toBe(1) // one black pawn captured (the diagonal one), the straight one remains
  })

  it('plays several full games to a winner without throwing', () => {
    for (let game = 0; game < 4; game++) {
      let s = BT.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 400) {
        if (s.turn === 'w') {
          const moves = BT.legalMoves(s.board, 'w')
          expect(moves.length).toBeGreaterThan(0)
          const m = moves[(Math.random() * moves.length) | 0]
          s = BT.move(s, m, 'w')
        } else {
          s = BT.aiMove(s)
        }
      }
      expect(s.winner).not.toBeNull()           // always terminates
      expect(['w', 'b']).toContain(s.winner)    // someone broke through
      expect(s.turn).toBeNull()                 // game closed out
    }
  }, 20000)
})
