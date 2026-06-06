import { describe, it, expect } from 'vitest'
import * as SK from './logic'

// Pure logic test (no DOM). Generates a handful of grids and asserts the generator,
// the hole-digger, win detection, and conflict checking all behave. Kept fast.

const N = SK.N, BOX = SK.BOX

function groupHasAll(values: number[]): boolean {
  if (values.length !== N) return false
  const seen = new Set(values)
  if (seen.size !== N) return false
  for (let d = 1; d <= N; d++) if (!seen.has(d)) return false
  return true
}

describe('sudoku logic', () => {
  it('generateSolution produces a valid complete grid (rows, cols, boxes all 1-9 once)', () => {
    for (let g = 0; g < 8; g++) {
      const grid = SK.generateSolution()
      expect(grid).toHaveLength(81)
      expect(SK.isValidSolution(grid)).toBe(true)

      // independently re-check each row / column / box
      for (let r = 0; r < N; r++) {
        const row: number[] = [], col: number[] = []
        for (let c = 0; c < N; c++) { row.push(grid[SK.idx(r, c)]); col.push(grid[SK.idx(c, r)]) }
        expect(groupHasAll(row)).toBe(true)
        expect(groupHasAll(col)).toBe(true)
      }
      for (let br = 0; br < N; br += BOX) {
        for (let bc = 0; bc < N; bc += BOX) {
          const box: number[] = []
          for (let dr = 0; dr < BOX; dr++) for (let dc = 0; dc < BOX; dc++) box.push(grid[SK.idx(br + dr, bc + dc)])
          expect(groupHasAll(box)).toBe(true)
        }
      }
    }
  })

  it('makeGame givens match the solution and hole-count matches the difficulty target', () => {
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      const s = SK.makeGame(diff)
      expect(SK.isValidSolution(s.solution)).toBe(true)

      // every given cell equals the solution, every non-given starts empty
      for (let i = 0; i < 81; i++) {
        if (s.given[i]) expect(s.board[i]).toBe(s.solution[i])
        else expect(s.board[i]).toBe(0)
      }

      const givens = SK.countGivens(s.given)
      expect(givens).toBe(SK.GIVENS[diff])           // exact here, but allow a tolerance band
      expect(Math.abs(givens - SK.GIVENS[diff])).toBeLessThanOrEqual(2)
      expect(s.solved).toBe(false)
    }
  })

  it('filling the puzzle from the solution is detected as solved', () => {
    let s = SK.makeGame('hard')
    expect(SK.isSolved(s.board, s.solution)).toBe(false)
    for (let i = 0; i < 81; i++) {
      if (!s.given[i]) s = SK.setCell(s, i, s.solution[i])
    }
    expect(SK.isSolved(s.board, s.solution)).toBe(true)
    expect(s.solved).toBe(true)
  })

  it('a duplicate in a row, column, or box is flagged as a conflict', () => {
    // start from a clean solved grid so the ONLY conflict is the one we inject
    const base = SK.generateSolution()

    // row duplicate: copy cell (0,0)'s value into (0,1)
    const rowDup = base.slice()
    rowDup[SK.idx(0, 1)] = rowDup[SK.idx(0, 0)]
    expect(SK.isConflict(rowDup, SK.idx(0, 1))).toBe(true)

    // column duplicate
    const colDup = base.slice()
    colDup[SK.idx(1, 0)] = colDup[SK.idx(0, 0)]
    expect(SK.isConflict(colDup, SK.idx(1, 0))).toBe(true)

    // box duplicate: (0,0) and (1,1) share the top-left box
    const boxDup = base.slice()
    boxDup[SK.idx(1, 1)] = boxDup[SK.idx(0, 0)]
    expect(SK.isConflict(boxDup, SK.idx(1, 1))).toBe(true)

    // an unmodified valid grid has zero conflicts, and an empty cell is never a conflict
    expect(SK.conflicts(base).size).toBe(0)
    expect(SK.isConflict([0, ...base.slice(1)], 0)).toBe(false)
  })
})
