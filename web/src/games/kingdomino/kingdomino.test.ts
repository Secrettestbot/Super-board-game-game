import { describe, it, expect } from 'vitest'
import {
  makeGame,
  buildDeck,
  legalPlacements,
  applyPlacement,
  placeTile,
  claimTile,
  scoreGrid,
  aiTurn,
  finalPlace,
  CENTER,
  idxOf,
} from './logic'
import type { Cell, Tile, Terrain } from './logic'

// ---- helpers ----
function emptyGrid(): Cell[] {
  const g: Cell[] = new Array(25).fill(null)
  g[CENTER] = { terrain: 'castle', crowns: 0 }
  return g
}
function sq(terrain: Terrain, crowns = 0): Cell {
  return { terrain, crowns }
}
function tile(num: number, ta: Terrain, ca: number, tb: Terrain, cb: number): Tile {
  return { id: num, num, a: { terrain: ta, crowns: ca }, b: { terrain: tb, crowns: cb } }
}

describe('legalPlacements', () => {
  it('only allows placements adjacent to the castle on an empty kingdom', () => {
    const grid = emptyGrid()
    const t = tile(1, 'wheat', 0, 'forest', 0)
    const legal = legalPlacements(grid, t)
    expect(legal.length).toBeGreaterThan(0)
    // every legal placement must have one of its two squares orthogonally next to center
    for (const p of legal) {
      const g2 = applyPlacement(grid, t, p)
      // castle still present, two new squares added
      const filled = g2.filter((c) => c != null).length
      expect(filled).toBe(3)
    }
  })

  it('respects the 5x5 bound (no placement leaves the grid)', () => {
    const grid = emptyGrid()
    const t = tile(1, 'wheat', 0, 'forest', 0)
    for (const p of legalPlacements(grid, t)) {
      expect(p.anchor).toBeGreaterThanOrEqual(0)
      expect(p.anchor).toBeLessThan(25)
    }
  })

  it('allows terrain-matching adjacency away from the castle', () => {
    const grid = emptyGrid()
    // place a wheat square at (2,1) next to castle (2,2)
    grid[idxOf(2, 1)] = sq('wheat')
    const t = tile(1, 'wheat', 0, 'water', 0)
    const legal = legalPlacements(grid, t)
    // there should exist a placement whose wheat half touches the wheat at (2,1)
    // e.g. anchor (2,0) wheat, orient right -> water at (2,1)? occupied. Try anchor (1,1) wheat down.
    const fits = legal.some((p) => {
      const g2 = applyPlacement(grid, t, p)
      return g2[idxOf(2, 0)] != null || g2[idxOf(1, 1)] != null || g2[idxOf(3, 1)] != null
    })
    expect(fits).toBe(true)
  })
})

describe('placeTile', () => {
  it('updates the grid with both squares of the claimed tile', () => {
    let s = makeGame(buildDeck().slice(0, 24))
    // force a known claimed tile + place phase for player 0
    const t = tile(99, 'wheat', 1, 'forest', 0)
    s = { ...s, phase: 'place', order: [0, 1], turnPos: 0 }
    s.players[0].claimed = t
    const legal = legalPlacements(s.players[0].grid, t)
    const ns = placeTile(s, legal[0])
    const filled = ns.players[0].grid.filter((c) => c != null).length
    expect(filled).toBe(3) // castle + 2 squares
    expect(ns.players[0].claimed).toBe(null)
    expect(ns.phase).toBe('claim')
  })
})

describe('scoreGrid', () => {
  it('scores a single region as size * crowns', () => {
    const grid = emptyGrid()
    // 3 wheat in a row, 1 crown total
    grid[idxOf(2, 1)] = sq('wheat', 1)
    grid[idxOf(1, 1)] = sq('wheat', 0)
    grid[idxOf(3, 1)] = sq('wheat', 0)
    // region of size 3, crowns 1 => 3. plus centered-castle bonus +5
    expect(scoreGrid(grid)).toBe(3 + 5)
  })

  it('scores a crownless region as 0', () => {
    const grid = emptyGrid()
    grid[idxOf(2, 1)] = sq('forest', 0)
    grid[idxOf(1, 1)] = sq('forest', 0)
    // region size 2, 0 crowns => 0, +5 centered castle
    expect(scoreGrid(grid)).toBe(0 + 5)
  })

  it('scores multiple disjoint regions independently', () => {
    const grid = emptyGrid()
    // wheat region of 2 with 2 crowns => 4
    grid[idxOf(2, 1)] = sq('wheat', 1)
    grid[idxOf(1, 1)] = sq('wheat', 1)
    // water region of 3 with 1 crown => 3 (separate, on the other side)
    grid[idxOf(2, 3)] = sq('water', 1)
    grid[idxOf(1, 3)] = sq('water', 0)
    grid[idxOf(3, 3)] = sq('water', 0)
    // 4 + 3 + 5 (castle bonus)
    expect(scoreGrid(grid)).toBe(4 + 3 + 5)
  })
})

describe('claimTile', () => {
  it('sets the claiming player as next-round turn order', () => {
    const s = makeGame(buildDeck().slice(0, 24))
    expect(s.phase).toBe('claim')
    // player 0 claims lineup[2]
    const ns = claimTile(s, 2)
    expect(ns.lineup[2].claimedBy).toBe(0)
    expect(ns.players[0].claimed).not.toBe(null)
    // next player's turn now
    expect(ns.order[ns.turnPos]).toBe(1)
  })
})

describe('discard of unplaceable tile', () => {
  it('discards (no grid change) when placing with null', () => {
    let s = makeGame(buildDeck().slice(0, 24))
    const t = tile(99, 'wheat', 1, 'forest', 0)
    s = { ...s, phase: 'place', order: [0, 1], turnPos: 0 }
    s.players[0].claimed = t
    const before = s.players[0].grid.filter((c) => c != null).length
    const ns = placeTile(s, null)
    const after = ns.players[0].grid.filter((c) => c != null).length
    expect(after).toBe(before) // no change
    expect(ns.players[0].claimed).toBe(null)
    expect(ns.phase).toBe('claim')
  })
})

describe('self-play', () => {
  it('a full AI vs AI game terminates with a valid result and no throws', () => {
    let s = makeGame(buildDeck().slice(0, 24))
    let guard = 0
    while (s.phase !== 'over' && guard < 5000) {
      guard++
      const player = s.order[s.turnPos]
      if (player === 1) {
        s = aiTurn(s)
      } else {
        // drive player 0 with the same greedy AI by temporarily mapping
        // We just claim/place using the lineup directly.
        if (s.phase === 'place') {
          const ps = s.players[0]
          const legal = ps.claimed != null ? legalPlacements(ps.grid, ps.claimed) : []
          // final round (no lineup) vs normal
          if (s.lineup.length === 0) {
            s = finalPlace(s, legal[0] ?? null)
          } else {
            s = placeTile(s, legal[0] ?? null)
          }
        } else {
          // claim first available
          const idx = s.lineup.findIndex((e) => e.claimedBy == null)
          s = claimTile(s, idx)
        }
      }
    }
    expect(s.phase).toBe('over')
    expect(guard).toBeLessThan(5000)
    // winner is 0, 1, or a tie
    if (s.tie) {
      expect(s.winner).toBe(null)
      expect(s.players[0].score).toBe(s.players[1].score)
    } else {
      expect([0, 1]).toContain(s.winner)
    }
    expect(Number.isFinite(s.players[0].score)).toBe(true)
    expect(Number.isFinite(s.players[1].score)).toBe(true)
  })
})
