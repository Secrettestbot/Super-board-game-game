import { describe, it, expect } from 'vitest'
import * as MS from './logic'
import type { MineState } from './logic'

// Minesweeper logic test: pure, no DOM. Covers board construction, first-click safety,
// adjacency counts on a hand-built board, flood-fill, and win/lose status.

function countMines(s: MineState): number { return s.grid.filter(c => c.mine).length }

describe('minesweeper logic', () => {
  it('makeGame builds valid boards for every difficulty', () => {
    for (const d of ['beginner', 'intermediate', 'expert'] as const) {
      const spec = MS.DIFFICULTIES[d]
      const s = MS.makeGame(d)
      expect(s.grid).toHaveLength(spec.rows * spec.cols)
      expect(s.rows).toBe(spec.rows)
      expect(s.cols).toBe(spec.cols)
      expect(s.mines).toBe(spec.mines)
      expect(s.grid.every(c => !c.revealed && !c.flagged && !c.mine)).toBe(true)
      expect(s.started).toBe(false)
      expect(s.status).toBe('playing')
      expect(countMines(s)).toBe(0) // no mines until first reveal
    }
  })

  it('beginner is the default difficulty', () => {
    const s = MS.makeGame()
    expect(s.difficulty).toBe('beginner')
    expect(s.rows).toBe(9)
    expect(s.cols).toBe(9)
    expect(s.mines).toBe(10)
  })

  it('first reveal places the right number of mines, never on the clicked cell, never loses', () => {
    for (let trial = 0; trial < 40; trial++) {
      const fresh = MS.makeGame('beginner')
      const click = (Math.random() * fresh.grid.length) | 0
      const s = MS.reveal(fresh, click)
      expect(s.started).toBe(true)
      expect(countMines(s)).toBe(fresh.mines)
      expect(s.grid[click].mine).toBe(false)     // clicked cell is safe
      expect(s.grid[click].revealed).toBe(true)
      expect(s.status).not.toBe('lost')          // first click never detonates
    }
  })

  it('adjacency counts are correct on a constructed board', () => {
    // 3x3 board, mines at corners (0) and center-bottom (7).  idx = r*3 + c
    //  0(M) 1    2
    //  3    4    5
    //  6    7(M) 8
    let s = MS.makeGame('beginner')
    s = { ...s, rows: 3, cols: 3, mines: 2, grid: Array.from({ length: 9 }, () => ({ mine: false, count: 0, revealed: false, flagged: false })) }
    s.grid[0].mine = true
    s.grid[7].mine = true
    s = MS.computeCounts(s)
    const counts = s.grid.map(c => c.count)
    // cell 0,7 are mines (count irrelevant); check the rest
    expect(counts[1]).toBe(1) // neighbours of 1: 0(M),2,3,4,5 -> 1
    expect(counts[2]).toBe(0)
    expect(counts[3]).toBe(2) // neighbours: 0(M),1,4,6,7(M) -> 2
    expect(counts[4]).toBe(2) // neighbours: 0(M),1,2,3,5,6,7(M),8 -> 2
    expect(counts[5]).toBe(1) // neighbours: 2,4,8,1?,... touching 7(M) -> 1
    expect(counts[6]).toBe(1) // neighbours: 3,4,7(M) -> 1
    expect(counts[8]).toBe(1) // neighbours: 5,4,7(M) -> 1
  })

  it('flood-fill reveals the connected zero-region and its numbered border', () => {
    // 3x3 board with a single mine in the corner (cell 0). Clicking the far corner (8),
    // which has count 0, should flood out and reveal every non-mine cell.
    let s = MS.makeGame('beginner')
    s = { ...s, rows: 3, cols: 3, mines: 1, started: true,
      grid: Array.from({ length: 9 }, () => ({ mine: false, count: 0, revealed: false, flagged: false })) }
    s.grid[0].mine = true
    s = MS.computeCounts(s)
    // cell 8 (bottom-right) has count 0; flood should open all 8 non-mine cells.
    const after = MS.reveal(s, 8)
    const revealed = after.grid.filter(c => c.revealed && !c.mine).length
    expect(revealed).toBe(8)        // every non-mine cell opened by the flood
    expect(after.status).toBe('won')
    expect(after.grid[0].revealed).toBe(true) // on a win the mine is exposed too
  })

  it('revealing every non-mine cell sets status=won', () => {
    let s = MS.makeGame('beginner')
    s = { ...s, rows: 2, cols: 2, mines: 1, started: true,
      grid: Array.from({ length: 4 }, () => ({ mine: false, count: 0, revealed: false, flagged: false })) }
    s.grid[0].mine = true
    s = MS.computeCounts(s)
    // cells 1,2,3 are safe (each count 1). Reveal them one by one.
    s = MS.reveal(s, 1)
    expect(s.status).toBe('playing')
    s = MS.reveal(s, 2)
    expect(s.status).toBe('playing')
    s = MS.reveal(s, 3)
    expect(s.status).toBe('won')
  })

  it('revealing a mine sets status=lost and exposes all mines', () => {
    let s = MS.makeGame('beginner')
    s = { ...s, rows: 2, cols: 2, mines: 2, started: true,
      grid: Array.from({ length: 4 }, () => ({ mine: false, count: 0, revealed: false, flagged: false })) }
    s.grid[0].mine = true
    s.grid[3].mine = true
    s = MS.computeCounts(s)
    const after = MS.reveal(s, 0) // step on a mine
    expect(after.status).toBe('lost')
    expect(after.grid.filter(c => c.mine && c.revealed).length).toBe(2) // all mines shown
  })

  it('flags block reveal and track the mines-remaining counter', () => {
    let s = MS.makeGame('beginner')
    s = MS.reveal(s, 40) // start the board (center of 9x9)
    const target = s.grid.findIndex(c => !c.revealed)
    expect(MS.minesRemaining(s)).toBe(s.mines)
    s = MS.toggleFlag(s, target)
    expect(s.grid[target].flagged).toBe(true)
    expect(s.flags).toBe(1)
    expect(MS.minesRemaining(s)).toBe(s.mines - 1)
    // a flagged cell cannot be revealed
    const blocked = MS.reveal(s, target)
    expect(blocked.grid[target].revealed).toBe(false)
    // unflag restores the counter
    s = MS.toggleFlag(s, target)
    expect(s.grid[target].flagged).toBe(false)
    expect(MS.minesRemaining(s)).toBe(s.mines)
  })
})
