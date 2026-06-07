import { describe, it, expect } from 'vitest'
import * as LOA from './logic'
import type { LoaState, Move, Cell } from './logic'

// Pure logic test: no DOM. Verifies setup, the count-of-pieces-on-the-line move rule,
// the connected-group win detector, and plays several full games against the real AI.

const { N, idx } = LOA

describe('lines of action logic', () => {
  it('starts on a valid board: 12 per side on the correct edges, Black to move', () => {
    const s = LOA.makeGame()
    expect(s.board).toHaveLength(64)
    const { b, w } = LOA.counts(s.board)
    expect(b).toBe(12)
    expect(w).toBe(12)
    expect(s.turn).toBe('b')
    expect(s.you).toBe('b')
    expect(s.winner).toBeNull()
    // Black on top & bottom rows, cols 1..6
    for (let c = 1; c <= 6; c++) {
      expect(s.board[idx(0, c)]).toBe('b')
      expect(s.board[idx(7, c)]).toBe('b')
    }
    // White on left & right cols, rows 1..6
    for (let r = 1; r <= 6; r++) {
      expect(s.board[idx(r, 0)]).toBe('w')
      expect(s.board[idx(r, 7)]).toBe('w')
    }
    // corners empty
    for (const [r, c] of [[0, 0], [0, 7], [7, 0], [7, 7]] as const) {
      expect(s.board[idx(r, c)]).toBeNull()
    }
  })

  it('move distance equals the count of pieces on the line travelled', () => {
    // Build a board with exactly 3 pieces on row 3: a black mover at (3,0) plus
    // two others on the same row. The horizontal move must travel exactly 3 squares.
    const board: Cell[] = new Array(64).fill(null)
    board[idx(3, 0)] = 'b'   // mover
    board[idx(3, 5)] = 'b'   // own piece on the line (jumpable)
    board[idx(3, 7)] = 'w'   // enemy on the line (off the path to col 3)
    // line through row 3 has 3 pieces -> horizontal distance is 3
    const dests = LOA.movesFrom(board, idx(3, 0), 'b')
    const horiz = dests.filter(m => Math.floor(m.to / N) === 3)
    // only rightward is in-bounds (leftward goes off board); lands on (3,3), empty
    expect(horiz.length).toBe(1)
    expect(horiz[0].to).toBe(idx(3, 3))
    expect(horiz[0].cap).toBe(false)

    // Now drop a third black on the row so the count becomes 4 -> distance 4 -> (3,4)
    const board2 = board.slice()
    board2[idx(3, 6)] = 'b'
    const d2 = LOA.movesFrom(board2, idx(3, 0), 'b').filter(m => Math.floor(m.to / N) === 3)
    expect(d2.length).toBe(1)
    expect(d2[0].to).toBe(idx(3, 4))

    // Enemy in the path blocks the slide (cannot jump enemies).
    const board3: Cell[] = new Array(64).fill(null)
    board3[idx(3, 0)] = 'b'
    board3[idx(3, 1)] = 'w'  // enemy directly in the path
    board3[idx(3, 5)] = 'b'  // makes line count 3 -> would land on (3,3) but path blocked at col1
    const d3 = LOA.movesFrom(board3, idx(3, 0), 'b').filter(m => Math.floor(m.to / N) === 3)
    expect(d3.length).toBe(0)
  })

  it('connected() fires only when all of a colour forms one 8-connected group', () => {
    // A single 2x2 block of black is one connected group.
    const conn: Cell[] = new Array(64).fill(null)
    conn[idx(3, 3)] = 'b'; conn[idx(3, 4)] = 'b'; conn[idx(4, 3)] = 'b'; conn[idx(4, 4)] = 'b'
    expect(LOA.connected(conn, 'b')).toBe(true)

    // Diagonal-only adjacency still counts (8-connected).
    const diag: Cell[] = new Array(64).fill(null)
    diag[idx(2, 2)] = 'b'; diag[idx(3, 3)] = 'b'; diag[idx(4, 4)] = 'b'
    expect(LOA.connected(diag, 'b')).toBe(true)

    // A separated piece breaks connectivity.
    const split: Cell[] = new Array(64).fill(null)
    split[idx(2, 2)] = 'b'; split[idx(3, 3)] = 'b'; split[idx(7, 7)] = 'b'
    expect(LOA.connected(split, 'b')).toBe(false)

    // A single piece counts as connected; zero pieces does not.
    const one: Cell[] = new Array(64).fill(null)
    one[idx(5, 5)] = 'b'
    expect(LOA.connected(one, 'b')).toBe(true)
    expect(LOA.connected(one, 'w')).toBe(false)

    // The opening position is NOT connected for either side.
    const start = LOA.makeGame()
    expect(LOA.connected(start.board, 'b')).toBe(false)
    expect(LOA.connected(start.board, 'w')).toBe(false)
  })

  it('plays several full games to a connected winner with a cap, no throws', () => {
    for (let game = 0; game < 8; game++) {
      let s: LoaState = LOA.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 2000) {
        if (s.turn === 'b') {
          const moves: Move[] = LOA.legalMoves(s.board, 'b')
          expect(moves.length).toBeGreaterThan(0)
          const m = moves[(Math.random() * moves.length) | 0]
          s = LOA.play(s, m, 'b')
        } else {
          s = LOA.aiMove(s)
        }
      }
      // terminated within the cap
      expect(s.winner === 'b' || s.winner === 'w').toBe(true)
      // the declared winner is genuinely connected
      expect(LOA.connected(s.board, s.winner as LOA.Side)).toBe(true)
    }
  })
})
