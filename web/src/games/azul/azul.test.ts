import { describe, it, expect } from 'vitest'
import * as A from './logic'
import type { State, Move } from './logic'

// Pure-logic tests (no DOM). Builds states from a deterministic bag, exercises drafting,
// pattern-line rules, wall scoring adjacency, floor penalties, the end-of-game trigger and
// final bonuses, then plays a full self-play game to a valid winner under a guard cap with
// tile conservation.

/** A deterministic bag: 100 tiles, 20 of each color, in a fixed repeating pattern. */
function fixedBag(): number[] {
  const bag: number[] = []
  for (let k = 0; k < 20; k++) for (let c = 0; c < A.COLORS; c++) bag.push(c)
  return bag
}

describe('azul logic', () => {
  it('starts with 5 filled factories (4 tiles each), an empty center holding the first marker', () => {
    const s = A.makeGame(fixedBag())
    expect(s.factories.length).toBe(A.N_FACTORIES)
    for (const f of s.factories) expect(f.length).toBe(A.TILES_PER_FACTORY)
    expect(s.center.length).toBe(0)
    expect(s.centerHasFirst).toBe(true)
    expect(s.turn).toBe(0)
    expect(s.winner).toBeNull()
    // 100 in bag minus 5*4 dealt to factories = 80 remain.
    expect(s.bag.length).toBe(100 - A.N_FACTORIES * A.TILES_PER_FACTORY)
  })

  it('taking a color from a factory slides the rest to the center', () => {
    let s = A.makeGame(fixedBag())
    // Construct a known factory: [0,0,1,2].
    s = { ...s, factories: s.factories.map((f, i) => (i === 0 ? [0, 0, 1, 2] : f)) }
    const before = A.tileCount(s)
    const next = A.applyMove(s, { source: 0, color: 0, line: 0 })
    expect(next.factories[0].length).toBe(0)          // factory emptied
    // The two non-taken tiles (1 and 2) slid to the center.
    expect(next.center.filter(c => c === 1).length).toBe(1)
    expect(next.center.filter(c => c === 2).length).toBe(1)
    // Two blue (0) tiles were taken: one fills line 0 (capacity 1), one overflows to floor.
    expect(next.boards[0].pattern[0]).toEqual({ color: 0, count: 1 })
    expect(next.boards[0].floor.filter(t => t === 0).length).toBe(1)
    expect(A.tileCount(next)).toBe(before)             // conservation across the move
  })

  it('first take from the center grabs the first-player marker and a floor penalty', () => {
    let s = A.makeGame(fixedBag())
    s = { ...s, center: [3, 3, 4], centerHasFirst: true }
    const next = A.applyMove(s, { source: 'center', color: 3, line: 2 })
    expect(next.centerHasFirst).toBe(false)
    expect(next.firstNext).toBe(0)
    // Floor now holds the first-player marker (-1).
    expect(next.boards[0].floor).toContain(-1)
    // Two black (3) tiles taken onto line 2 (capacity 3): both fit, none overflow.
    expect(next.boards[0].pattern[2]).toEqual({ color: 3, count: 2 })
    expect(next.center).toEqual([4])
  })

  it('pattern-line placement obeys color-lock and wall-row restrictions; overflow goes to the floor', () => {
    const b = A.makeGame(fixedBag()).boards[0]
    // Empty line accepts any color.
    expect(A.canPlaceOnLine(b, 1, 2)).toBe(true)
    // Lock line 1 to color 2.
    b.pattern[1] = { color: 2, count: 1 }
    expect(A.canPlaceOnLine(b, 1, 2)).toBe(true)       // same color ok
    expect(A.canPlaceOnLine(b, 1, 3)).toBe(false)      // different color blocked
    // A full line rejects more.
    b.pattern[1] = { color: 2, count: 2 }
    expect(A.canPlaceOnLine(b, 1, 2)).toBe(false)
    // Wall-row restriction: if the wall already has that color in the row, the line is blocked.
    const b2 = A.makeGame(fixedBag()).boards[0]
    b2.wall[0][A.wallColumnFor(0, 4)] = true
    expect(A.canPlaceOnLine(b2, 0, 4)).toBe(false)
  })

  it('wall scoring: a lone tile is 1; horizontal and vertical runs count contiguous neighbors', () => {
    const wall = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => false))
    wall[2][2] = true
    expect(A.tileScore(wall, 2, 2)).toBe(1)            // lone
    wall[2][3] = true                                  // horizontal pair
    expect(A.tileScore(wall, 2, 3)).toBe(2)
    wall[1][3] = true; wall[3][3] = true               // vertical run through (2,3): rows 1,2,3
    // (2,3) now has a horizontal run of 2 and a vertical run of 3 → 2 + 3 = 5.
    expect(A.tileScore(wall, 2, 3)).toBe(5)
  })

  it('end-of-round walls complete lines, scores them, and applies floor penalties', () => {
    let s = A.makeGame(fixedBag())
    // Drain table and set up board 0: a complete line 0 (color 0) and 3 floor tiles.
    s = { ...s, factories: s.factories.map(() => []), center: [], centerHasFirst: false }
    s.boards[0].pattern[0] = { color: 0, count: 1 }    // complete (line 0 holds 1)
    s.boards[0].floor = [1, 1, 1]                       // 3 floor tiles → -1 -1 -2 = -4
    const before = A.tileCount(s)
    const next = A.endRoundScoring(s)
    // Wall got the blue tile at (0, col); lone → +1 score, minus 4 floor = max(0, -3) = 0.
    expect(next.boards[0].wall[0][A.wallColumnFor(0, 0)]).toBe(true)
    expect(next.boards[0].score).toBe(0)               // 1 - 4 clamped at 0
    expect(next.boards[0].floor).toEqual([])           // floor reset
    expect(next.boards[0].pattern[0]).toEqual({ color: -1, count: 0 })
    // Tiles conserved (placed wall tile + leftovers/floor moved to lid).
    expect(A.tileCount(next)).toBe(before)
  })

  it('completing a full wall row ends the game; final bonuses add row/column/color credit', () => {
    let s = A.makeGame(fixedBag())
    s = { ...s, factories: s.factories.map(() => []), center: [], centerHasFirst: false }
    // Pre-fill board 0's wall row 0 in cols 0..3, then complete the last cell via a pattern line.
    for (let col = 0; col < 4; col++) s.boards[0].wall[0][col] = true
    const lastColor = A.wallColorAt(0, 4)
    s.boards[0].pattern[0] = { color: lastColor, count: 1 } // completes wall row 0
    const next = A.endRoundScoring(s)
    expect(next.winner === 0 || next.winner === 1 || next.winner === 'tie').toBe(true)
    // Row 0 fully tiled → at least the +2 row bonus is baked into board 0's score.
    expect(next.boards[0].wall[0].every(c => c)).toBe(true)
  })

  it('finalBonuses awards +2 row, +7 column, +10 color on a fully tiled wall', () => {
    let s = A.makeGame(fixedBag())
    // Tile the ENTIRE wall of board 0: every cell true → 5 rows, 5 cols, 5 colors.
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) s.boards[0].wall[r][c] = true
    s.boards[0].score = 0
    A.finalBonuses(s)
    // 5*2 (rows) + 5*7 (cols) + 5*10 (colors) = 10 + 35 + 50 = 95.
    expect(s.boards[0].score).toBe(95)
  })

  it('plays a full self-play game to a valid winner under a guard cap, no throws, tiles conserved', () => {
    let s = A.makeGame(fixedBag())
    const total = A.tileCount(s) // all 100 tiles accounted for at start
    expect(total).toBe(100)
    let guard = 0
    while (s.winner == null && guard++ < 5000) {
      // Both sides use the greedy AI policy (player 0 via aiChoose, player 1 via aiTurn).
      const m: Move | null = A.aiChoose(s)
      expect(m).not.toBeNull()
      s = A.applyMove(s, m!)
      // Conservation must hold after every move (wall tiles + bag + lid + center + factories + lines + floor).
      expect(A.tileCount(s)).toBe(100)
    }
    expect(guard).toBeLessThan(5000)                   // terminated
    expect(s.winner === 0 || s.winner === 1 || s.winner === 'tie').toBe(true)
    // A winner means some wall row is complete on at least one board.
    expect(s.boards.some(b => b.wall.some(row => row.every(c => c)))).toBe(true)
  })
})
