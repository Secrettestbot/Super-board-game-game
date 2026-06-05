import { describe, it, expect } from 'vitest'
import * as HX from './logic'
import type { Stone } from './logic'

// Pure logic test: no DOM. Builds boards directly and plays full games against the real AI.

const { N, idx } = HX

describe('hex logic', () => {
  it('starts on a valid empty 11x11 board, you to move, no winner', () => {
    const s = HX.makeGame()
    expect(s.board).toHaveLength(N * N)
    expect(N).toBe(11)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.turn).toBe('y')
    expect(s.you).toBe('y')
    expect(s.winner).toBeNull()
    expect(s.win).toEqual([])
  })

  it('detects a top-to-bottom connection for You, and not an incomplete chain', () => {
    // You (y) link top↔bottom. Build a vertical line down column 0 (each (r,0)→(r+1,0) is adjacent).
    const board: HX.Cell[] = new Array(N * N).fill(null)
    for (let r = 0; r < N - 1; r++) board[idx(r, 0)] = 'y'   // rows 0..9 — does NOT reach bottom row
    expect(HX.findWin(board, 'y')).toBeNull()

    board[idx(N - 1, 0)] = 'y'                                // complete to the bottom edge
    const chain = HX.findWin(board, 'y')
    expect(chain).not.toBeNull()
    expect(chain!.length).toBeGreaterThanOrEqual(N)
    // a different colour with the same stones must not be "connected" left↔right
    expect(HX.findWin(board, 's')).toBeNull()
  })

  it('detects a left-to-right connection for the rival (Slate)', () => {
    // Slate (s) links left↔right. A horizontal line across row 0 connects column 0 to column N-1.
    const board: HX.Cell[] = new Array(N * N).fill(null)
    for (let c = 0; c < N - 1; c++) board[idx(0, c)] = 's'
    expect(HX.findWin(board, 's')).toBeNull()
    board[idx(0, N - 1)] = 's'
    expect(HX.findWin(board, 's')).not.toBeNull()
  })

  it('plays several full games to a single winner without throwing', () => {
    for (let game = 0; game < 4; game++) {
      let s = HX.makeGame()
      let plies = 0
      expect(() => {
        while (!s.winner && plies < N * N) {
          if (s.turn === 'y') {
            const empties = s.board.map((c, i) => (c ? -1 : i)).filter(i => i >= 0)
            s = HX.place(s, empties[(Math.random() * empties.length) | 0], 'y')
          } else {
            s = HX.aiMove(s)
          }
          plies++
        }
      }).not.toThrow()

      expect(s.winner).not.toBeNull()                 // Hex always terminates with a winner
      const w = s.winner as Stone
      expect(w === 'y' || w === 's').toBe(true)
      // the stored chain really connects that colour's two edges
      expect(HX.findWin(s.board, w)).not.toBeNull()
      // and the loser is NOT also connected (Hex has exactly one winner)
      const loser: Stone = w === 'y' ? 's' : 'y'
      expect(HX.findWin(s.board, loser)).toBeNull()
    }
  })
})
