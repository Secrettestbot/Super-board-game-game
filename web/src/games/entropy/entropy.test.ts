import { describe, it, expect } from 'vitest'
import * as EN from './logic'
import type { Color } from './logic'

// Pure logic test: no DOM. Verifies setup, palindrome scoring, placement/draw, the
// rook slide, and plays a few full games against the real AI asserting invariants.

const { N, PAR } = EN

describe('entropy logic', () => {
  it('starts on a valid empty board, full bag, Chaos to place, score 0', () => {
    const s = EN.makeGame()
    expect(s.board).toHaveLength(N * N)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.phase).toBe('chaos')
    expect(s.score).toBe(0)
    expect(s.placed).toBe(0)
    expect(s.winner).toBeNull()
    // one tile already drawn for Chaos; bag holds the remaining 24
    expect(s.drawn).not.toBeNull()
    expect(s.bag).toHaveLength(N * N - 1)
    // bag composition: 5 colours, 5 of each across drawn + bag
    const all = s.bag.concat(s.drawn ? [s.drawn] : [])
    expect(all).toHaveLength(N * N)
    const counts: Record<string, number> = {}
    for (const c of all) counts[c] = (counts[c] || 0) + 1
    for (const col of EN.COLORS) expect(counts[col]).toBe(N)
  })

  it('scores palindromic runs in a line and ignores non-palindromes', () => {
    const A: Color = 'c', B: Color = 'm'
    // A B A : the length-3 run is a palindrome -> 3 points (no length-2 sub palindromes)
    expect(EN.scoreLine([A, B, A, null, null])).toBe(3)
    // A A : a length-2 palindrome -> 2 points
    expect(EN.scoreLine([A, A, null, null, null])).toBe(2)
    // A B (distinct, no equal pair) -> 0
    expect(EN.scoreLine([A, B, null, null, null])).toBe(0)
    // A B C with all distinct -> 0
    expect(EN.scoreLine([A, B, 'y', null, null])).toBe(0)
    // A B B A : whole length-4 palindrome (4) + inner B B (2) = 6
    expect(EN.scoreLine([A, B, B, A, null])).toBe(6)
    // gaps (null) break runs: null A A -> the A A pair still scores 2
    expect(EN.scoreLine([null, A, A, null, null])).toBe(2)
    // a null inside a span makes that span non-palindromic (null !== null comparison guard)
    expect(EN.scoreLine([A, null, A, null, null])).toBe(0)
  })

  it('scoreBoard sums rows and columns', () => {
    const board: (Color | null)[] = new Array(N * N).fill(null)
    // top row: A B A  -> row scores 3
    board[0] = 'c'; board[1] = 'm'; board[2] = 'c'
    // make a column palindrome in column 0: rows 0,1,2 = A,_,A won't (gap). Use A A in col 0.
    board[0 + 0 * N] = 'c'; board[0 + 1 * N] = 'c' // col0 rows0,1 = A A -> +2
    const sc = EN.scoreBoard(board)
    // row0 A B A = 3 ; col0 A A = 2  (other lines empty)
    expect(sc).toBe(3 + 2)
  })

  it('place fills a cell and consumes the drawn tile, handing off to Order', () => {
    const s = EN.makeGame()
    const drawn = s.drawn
    const ns = EN.place(s, 12)
    expect(ns.board[12]).toBe(drawn)
    expect(ns.placed).toBe(1)
    expect(ns.phase).toBe('order')
    // empty cells dropped by exactly one
    expect(EN.emptyCells(ns.board)).toHaveLength(N * N - 1)
  })

  it("Order's rook move slides a tile in a line without jumping", () => {
    const board: (Color | null)[] = new Array(N * N).fill(null)
    board[0] = 'c'           // tile at A1 (r0,c0)
    board[3] = 'm'           // blocker at D1 (r0,c3)
    const dests = EN.rookDests(board, 0)
    // rightward it can reach c1,c2 but NOT c3 (occupied) or beyond; downward c0 col r1..r4
    expect(dests).toContain(1)
    expect(dests).toContain(2)
    expect(dests).not.toContain(3)   // cannot land on a filled cell / jump it
    expect(dests).toContain(0 + 1 * N) // straight down one
    const moved = EN.applyRook(board, 0, 2)
    expect(moved[0]).toBeNull()
    expect(moved[2]).toBe('c')
  })

  it('plays a few full games to a valid winner with strict termination', () => {
    for (let g = 0; g < 4; g++) {
      let s = EN.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 200) {
        if (s.phase === 'chaos') {
          const open = EN.emptyCells(s.board)
          expect(open.length).toBeGreaterThan(0)
          expect(s.drawn).not.toBeNull()
          s = EN.place(s, open[(Math.random() * open.length) | 0])
        } else if (s.phase === 'order') {
          s = EN.aiStep(s)
        } else break
      }
      expect(s.winner).not.toBeNull()                 // always terminates
      expect(['chaos', 'order']).toContain(s.winner)  // valid winner per par rule
      expect(s.placed).toBeLessThanOrEqual(N * N)      // never exceeds 25 placements
      expect(s.board.every(c => c !== null)).toBe(true) // board strictly fills
      // par rule consistency
      if (s.winner === 'chaos') expect(s.score).toBeLessThanOrEqual(PAR)
      else expect(s.score).toBeGreaterThan(PAR)
    }
  })
})
