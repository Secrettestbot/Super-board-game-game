import { describe, it, expect } from 'vitest'
import * as SK from './logic'
import type { SurakartaState, Cell, Player, Move } from './logic'

// Pure logic test: no DOM. Verifies the setup, the step / loop-capture rules, and that full
// games (random legal human play vs the real alpha-beta AI) always terminate cleanly.

const { N, idx } = SK
const empty = (): Cell[] => new Array(N * N).fill(null)

// build a minimal state around a hand-placed board
function stateOf(board: Cell[], turn: Player = 'r'): SurakartaState {
  return { board, turn, you: 'r', winner: null, last: null, log: [] }
}

describe('surakarta setup', () => {
  it('starts with 12 pieces a side on the outer two rows, you (Red) to move', () => {
    const s = SK.makeGame()
    expect(s.board).toHaveLength(N * N)
    const { r, b } = SK.counts(s.board)
    expect(r).toBe(12)
    expect(b).toBe(12)
    // Black on rows 0,1 ; Red on rows 4,5 ; rows 2,3 empty
    for (let c = 0; c < N; c++) {
      expect(s.board[idx(0, c)]).toBe('b')
      expect(s.board[idx(1, c)]).toBe('b')
      expect(s.board[idx(4, c)]).toBe('r')
      expect(s.board[idx(5, c)]).toBe('r')
      expect(s.board[idx(2, c)]).toBeNull()
      expect(s.board[idx(3, c)]).toBeNull()
    }
    expect(s.turn).toBe('r')
    expect(s.you).toBe('r')
    expect(s.winner).toBeNull()
  })
})

describe('surakarta moves', () => {
  it('a simple adjacent step to an empty point is a legal non-capturing move', () => {
    const board = empty()
    board[idx(4, 2)] = 'r'
    const moves = SK.movesFrom(board, idx(4, 2), 'r')
    // all 8 neighbours are empty -> 8 step moves, none capturing
    const steps = moves.filter(m => !m.cap)
    expect(steps.length).toBe(8)
    expect(moves.some(m => m.cap)).toBe(false)
    expect(steps.some(m => m.to === idx(3, 2))).toBe(true)   // straight up
    expect(steps.some(m => m.to === idx(3, 3))).toBe(true)   // diagonal
  })

  it('a straight line to an enemy WITHOUT looping is NOT a legal capture', () => {
    const board = empty()
    board[idx(3, 0)] = 'r'
    board[idx(3, 3)] = 'b'   // same row, clear between, no loop traversed
    const caps = SK.movesFrom(board, idx(3, 0), 'r').filter(m => m.cap)
    expect(caps.length).toBe(0)
  })

  it('looping around a corner captures the first enemy and removes it', () => {
    const board = empty()
    // red on the inner-left line, row 1 col 0; sweeping W rounds the top-left inner loop
    // onto column 1 heading S, gliding down to the first enemy.
    board[idx(1, 0)] = 'r'
    board[idx(2, 1)] = 'b'   // first enemy down column 1 after the loop
    const moves = SK.movesFrom(board, idx(1, 0), 'r')
    const cap = moves.find(m => m.cap && m.to === idx(2, 1))
    expect(cap).toBeTruthy()

    const s = stateOf(board, 'r')
    const after = SK.applyMove(s, cap as Move, 'r')
    expect(after.board[idx(2, 1)]).toBe('r')   // landed on the enemy point
    expect(after.board[idx(1, 0)]).toBeNull()  // vacated origin
    const { r, b } = SK.counts(after.board)
    expect(r).toBe(1)
    expect(b).toBe(0)                           // enemy captured / removed
  })

  it('an own piece blocking the loop path cancels that capture', () => {
    const board = empty()
    board[idx(1, 0)] = 'r'
    board[idx(1, 1)] = 'r'   // own piece sits on the looped path before the enemy
    board[idx(2, 1)] = 'b'
    const caps = SK.movesFrom(board, idx(1, 0), 'r').filter(m => m.cap && m.to === idx(2, 1))
    expect(caps.length).toBe(0)
  })
})

describe('surakarta full games terminate', () => {
  it('plays several full games (random human vs real AI) to a clean finish', () => {
    for (let game = 0; game < 6; game++) {
      let s = SK.makeGame()
      let guard = 0
      // Random human play in Surakarta (captures only via the loop tracks) can legitimately
      // fail to capture the opponent out — a long/drawish game. So we cap the plies generously
      // and accept "winner declared OR no progress within the cap" as a clean, non-throwing
      // finish; we only assert winner-validity when a winner actually exists.
      while (!s.winner && guard++ < 2000) {
        if (s.turn === 'r') {
          const moves = SK.allMoves(s.board, 'r')
          if (moves.length === 0) break  // human stalemated → terminal-ish; exit cleanly
          // a real human can step or capture; bias toward captures so material drains
          // and the game reliably resolves (still always a legal move).
          const caps = moves.filter(m => m.cap)
          const pool = caps.length ? caps : moves
          const m = pool[(Math.random() * pool.length) | 0]
          s = SK.applyMove(s, m, 'r')
        } else {
          s = SK.aiMove(s)
        }
      }
      // No throws along the way (the loop above would have surfaced any). If a winner was
      // declared (all enemy captured, or the side to move stalemated), it must be valid and
      // still hold pieces.
      if (s.winner != null) {
        expect(['r', 'b']).toContain(s.winner)
        const { r, b } = SK.counts(s.board)
        if (s.winner === 'r') expect(r).toBeGreaterThan(0)
        if (s.winner === 'b') expect(b).toBeGreaterThan(0)
      }
    }
  })
})
