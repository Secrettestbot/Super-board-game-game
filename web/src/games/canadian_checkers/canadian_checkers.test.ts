import { describe, it, expect } from 'vitest'
import {
  N, makeGame, counts, legalMoves, applyMove, aiTurn, movesFrom,
  ownerOf, isKing,
} from './logic'
import type { State, Cell, Move } from './logic'

const idx = (r: number, c: number) => r * N + c

// Build an empty 12x12 board state with the given turn.
function emptyState(turn: 0 | 1 = 0): State {
  return {
    board: new Array(N * N).fill(null) as Cell[],
    turn,
    you: 0,
    winner: null,
    last: null,
    noCap: 0,
    log: [],
  }
}

describe('setup', () => {
  it('places 30 men each on a 12x12 board, all on dark squares', () => {
    const s = makeGame()
    expect(s.board.length).toBe(144)
    const c = counts(s.board)
    expect(c.p0).toBe(30)
    expect(c.p1).toBe(30)
    expect(c.k0).toBe(0)
    expect(c.k1).toBe(0)
    // every occupied square is dark
    for (let i = 0; i < s.board.length; i++) {
      if (s.board[i] != null) {
        const r = Math.floor(i / N), col = i % N
        expect((r + col) % 2).toBe(1)
      }
    }
    expect(s.turn).toBe(0)
    expect(s.winner).toBeNull()
  })
})

describe('man moves', () => {
  it('a man steps one diagonal forward to an empty dark square', () => {
    const s = emptyState(0)
    const start = idx(7, 3)
    s.board[start] = 0
    const moves = movesFrom(s, start)
    // player 0 moves up (row -1): can reach (6,2) and (6,4)
    const tos = moves.map(m => m.to).sort((a, b) => a - b)
    expect(tos).toEqual([idx(6, 2), idx(6, 4)].sort((a, b) => a - b))
    // no captures present, so caps empty
    expect(moves.every(m => m.caps.length === 0)).toBe(true)
  })
})

describe('captures', () => {
  it('a man captures FORWARD and BACKWARD by jumping an adjacent enemy', () => {
    // forward capture: player 0 man at (7,3), enemy at (6,4), land (5,5)
    const f = emptyState(0)
    f.board[idx(7, 3)] = 0
    f.board[idx(6, 4)] = 1
    const fm = legalMoves(f)
    expect(fm.length).toBe(1)
    expect(fm[0].to).toBe(idx(5, 5))
    expect(fm[0].caps).toEqual([idx(6, 4)])

    // backward capture: player 0 man at (7,3), enemy at (8,4), land (9,5)
    const b = emptyState(0)
    b.board[idx(7, 3)] = 0
    b.board[idx(8, 4)] = 1
    const bm = legalMoves(b)
    // backward capture must be available (men capture both ways)
    expect(bm.some(m => m.caps.includes(idx(8, 4)) && m.to === idx(9, 5))).toBe(true)
  })

  it('captures are mandatory — only capture moves are returned when one exists', () => {
    const s = emptyState(0)
    s.board[idx(7, 3)] = 0
    s.board[idx(6, 4)] = 1
    // a second, non-capturing man that could otherwise step
    s.board[idx(9, 1)] = 0
    const moves = legalMoves(s)
    expect(moves.every(m => m.caps.length > 0)).toBe(true)
  })

  it('MAXIMUM CAPTURE forces the longest chain', () => {
    // man at (9,3): one branch captures 1, another captures 2.
    const s = emptyState(0)
    s.board[idx(9, 3)] = 0
    // chain of two: jump (8,4)->land(7,5), then jump (6,6)->land(5,7)
    s.board[idx(8, 4)] = 1
    s.board[idx(6, 6)] = 1
    // a lone single capture on the other diagonal: jump (8,2)->land(7,1)
    s.board[idx(8, 2)] = 1
    const moves = legalMoves(s)
    // only the 2-capture chain should remain legal
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.caps.length === 2)).toBe(true)
    const chain = moves[0]
    expect(chain.caps.sort((a, b) => a - b)).toEqual([idx(8, 4), idx(6, 6)].sort((a, b) => a - b))
    expect(chain.to).toBe(idx(5, 7))
  })
})

describe('flying kings', () => {
  it('a king glides any distance along an empty diagonal', () => {
    const s = emptyState(0)
    const at = idx(11, 0)
    s.board[at] = 'K0'
    const moves = movesFrom(s, at)
    // up the main diagonal: (10,1),(9,2),...,(0,11) = 11 squares
    const upTos = moves.filter(m => m.to % N === N - 1 - Math.floor(m.to / N)).length
    expect(upTos).toBeGreaterThanOrEqual(1)
    // reaches the far corner (0,11)
    expect(moves.some(m => m.to === idx(0, 11))).toBe(true)
  })

  it('a flying king captures at distance and lands beyond', () => {
    const s = emptyState(0)
    const at = idx(11, 0)
    s.board[at] = 'K0'
    // enemy far up the diagonal at (8,3); empties before and after
    s.board[idx(8, 3)] = 1
    const moves = legalMoves(s)
    // must be a capture move (mandatory), jumping (8,3)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.caps.includes(idx(8, 3)))).toBe(true)
    // can land on multiple squares beyond the victim, e.g. (7,4),(6,5),...
    expect(moves.some(m => m.to === idx(7, 4))).toBe(true)
    expect(moves.some(m => m.to === idx(6, 5))).toBe(true)
  })
})

describe('promotion', () => {
  it('a man promotes only when it ENDS its move on the last row', () => {
    const s = emptyState(0)
    s.board[idx(1, 2)] = 0 // player 0 one step from the top row (row 0)
    const moves = movesFrom(s, idx(1, 2))
    const toTop = moves.find(m => Math.floor(m.to / N) === 0)
    expect(toTop).toBeTruthy()
    const after = applyMove(s, toTop as Move)
    expect(isKing(after.board[(toTop as Move).to])).toBe(true)
    expect(ownerOf(after.board[(toTop as Move).to])).toBe(0)
  })

  it('does NOT promote a man that only passes through the last row during a capture', () => {
    // player 0 man at (2,1). Jump enemy at (1,2) landing on (0,3) would be last row...
    // To prove "pass through, no promote", set up a chain that lands OFF the last row.
    const s = emptyState(0)
    s.board[idx(2, 3)] = 0
    s.board[idx(1, 4)] = 1 // jump -> land (0,5) [last row], then...
    s.board[idx(1, 6)] = 1 // ...jump back down -> land (2,7), NOT last row
    const moves = legalMoves(s)
    // longest chain captures both and ends at (2,7)
    const two = moves.find(m => m.caps.length === 2)
    expect(two).toBeTruthy()
    expect((two as Move).to).toBe(idx(2, 7))
    const after = applyMove(s, two as Move)
    // ended off the last row -> still a plain man, not a king
    expect(isKing(after.board[idx(2, 7)])).toBe(false)
    expect(after.board[idx(2, 7)]).toBe(0)
  })
})

describe('self-play', () => {
  it('runs to a winner or a draw/cap without throwing, with a valid winner if present', () => {
    let s = makeGame()
    const MAX_PLIES = 400
    let plies = 0
    while (s.winner == null && plies < MAX_PLIES) {
      // 40-move (per side) no-capture rule -> declare a draw and stop
      if (s.noCap >= 80) break
      const before = s.turn
      // shallow depth keeps the bounded self-play fast while still exercising the engine
      s = aiTurn(s, 2)
      // aiTurn must make progress (turn flips or game ends)
      if (s.winner == null) {
        expect(s.turn === (before === 0 ? 1 : 0)).toBe(true)
      }
      plies++
    }
    expect(plies).toBeLessThanOrEqual(MAX_PLIES)
    if (s.winner != null) {
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(s.turn).toBeNull()
    }
  })
})
