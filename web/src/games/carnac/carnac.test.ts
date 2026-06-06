import { describe, it, expect } from 'vitest'
import * as CK from './logic'

// Pure logic test (no DOM). Verifies Domineering move generation/placement and plays
// several full games against the real AI, asserting fast termination with a real loser.

const { COLS, ROWS, idx } = CK

describe('carnac logic', () => {
  it('starts on a valid empty 6×7 grid, you/Menhir to move', () => {
    const s = CK.makeGame()
    expect(s.board).toHaveLength(COLS * ROWS)
    expect(COLS).toBe(6)
    expect(ROWS).toBe(7)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.turn).toBe('m')
    expect(s.you).toBe('m')
    expect(s.winner).toBeNull()
  })

  it('generates correct vertical (menhir) placements — cell + the one below', () => {
    const s = CK.makeGame()
    const moves = CK.legalMoves(s.board, 'm')
    // every column (6) for rows 0..ROWS-2 (6 rows) -> 36 placements on an empty board
    expect(moves.length).toBe(COLS * (ROWS - 1))
    // bottom row can never be an anchor for a vertical domino
    for (const i of moves) expect(Math.floor(i / COLS)).toBeLessThan(ROWS - 1)
    // a vertical placement covers i and i+COLS
    expect(CK.cellsOf(idx(0, 0), 'm')).toEqual([idx(0, 0), idx(1, 0)])
  })

  it('generates correct horizontal (dolmen) placements — cell + the one to the right', () => {
    const s = CK.makeGame()
    const moves = CK.legalMoves(s.board, 'd')
    // (COLS-1) anchors per row * ROWS rows
    expect(moves.length).toBe((COLS - 1) * ROWS)
    for (const i of moves) expect(i % COLS).toBeLessThan(COLS - 1)
    expect(CK.cellsOf(idx(0, 0), 'd')).toEqual([idx(0, 0), idx(0, 1)])
  })

  it('placing a domino fills exactly its two cells', () => {
    let s = CK.makeGame()
    s = CK.place(s, idx(2, 3), 'm')   // vertical at (2,3) -> (2,3),(3,3)
    const filled = s.board.map((v, i) => (v ? i : -1)).filter(i => i >= 0)
    expect(filled).toEqual([idx(2, 3), idx(3, 3)])
    expect(s.board[idx(2, 3)]).toBe('m')
    expect(s.board[idx(3, 3)]).toBe('m')
    expect(s.turn).toBe('d')          // turn passes to the rival
  })

  it('a player with no legal placement in their orientation is the loser', () => {
    // Fill every cell so the Dolmen player (to move) has no horizontal placement.
    const s = CK.makeGame()
    const board = s.board.slice().fill('m')
    expect(CK.legalMoves(board, 'd')).toHaveLength(0)
    // Construct the position where it's the rival's turn with no move: menhir just moved.
    // Leave one vertical gap so menhir could still move but dolmen cannot.
    const b2 = s.board.slice().fill('m')
    b2[idx(0, 0)] = null; b2[idx(1, 0)] = null  // a vertical gap (same column) — no horizontal pair empty
    expect(CK.legalMoves(b2, 'd')).toHaveLength(0)  // dolmen has nowhere to lie
    expect(CK.legalMoves(b2, 'm').length).toBeGreaterThan(0)  // menhir still can
  })

  it('plays several full games to a winner — terminates fast, no throws, real loser', () => {
    for (let game = 0; game < 6; game++) {
      let s = CK.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 30) {
          if (s.turn === 'm') {
            const moves = CK.legalMoves(s.board, 'm')
            if (!moves.length) break  // place() resolves the loss when the opponent moved; safety
            s = CK.place(s, moves[(Math.random() * moves.length) | 0], 'm')
          } else {
            s = CK.aiMove(s)
          }
        }
      }).not.toThrow()
      // Each move fills 2 of 42 cells, so at most 21 placements — well under the guard.
      expect(guard).toBeLessThanOrEqual(22)
      expect(s.winner).not.toBeNull()                 // someone could not move
      expect(s.winner === 'm' || s.winner === 'd').toBe(true)
      // The winner is the side whose opponent has no legal placement.
      const loser = s.winner === 'm' ? 'd' : 'm'
      expect(CK.legalMoves(s.board, loser)).toHaveLength(0)
    }
  })
})
