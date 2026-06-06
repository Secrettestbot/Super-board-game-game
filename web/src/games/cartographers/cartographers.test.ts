import { describe, it, expect } from 'vitest'
import {
  makeGame, legalPlacements, placeShape, skipPlacement, scoreEdict, seasonScore,
  mountainCoins, edictPair, aiTurn, nextSeason, EDICTS, SIZE, idx, orientations,
  defaultDeck,
} from './logic'
import type { Cell, Edict, Shape, State } from './logic'

const E = (id: string): Edict => EDICTS.find(e => e.id === id)!

function blank(): Cell[] { return new Array(SIZE * SIZE).fill('') as Cell[] }

describe('legalPlacements', () => {
  it('respects bounds and occupied/mountain cells', () => {
    const grid = blank()
    // Block the top-left 2x2 region partially with a mountain + a placed tile.
    grid[idx(0, 0)] = 'mountain'
    grid[idx(0, 1)] = 'forest'
    const domino: Shape = [[0, 0], [0, 1]]
    const places = legalPlacements(grid, domino)
    // No placement may cover the mountain or the occupied forest.
    for (const cells of places) {
      for (const [r, c] of cells) {
        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThan(SIZE)
        expect(grid[idx(r, c)]).not.toBe('mountain')
        expect(grid[idx(r, c)]).not.toBe('forest')
      }
    }
    // And there is at least one legal spot somewhere on the big board.
    expect(places.length).toBeGreaterThan(0)
  })

  it('generates the 4 orientations of an L-tromino (deduped)', () => {
    const oris = orientations([[0, 0], [0, 1], [1, 1]])
    expect(oris.length).toBe(4)
  })
})

describe('placeShape', () => {
  it('fills exactly the shape cells with the chosen terrain', () => {
    const deck = defaultDeck()
    // Use a one-cell card (rift lands, dot) so the placement is unambiguous.
    const dotCard = deck.find(c => c.shapes.length === 1 && c.shapes[0].length === 1)!
    const s0 = makeGame([dotCard])
    expect(s0.card?.id).toBe(dotCard.id)
    const cells = legalPlacements(s0.maps[0].grid, dotCard.shapes[0])
    // With ruins on the map, the single-cell placement must cover a ruins cell.
    const target = cells[0]
    const before = s0.maps[0].grid.filter(v => v === 'farm').length
    const s1 = placeShape(s0, 0, target, 'farm')
    const after = s1.maps[0].grid.filter(v => v === 'farm').length
    expect(after - before).toBe(1)
    const [r, c] = target[0]
    expect(s1.maps[0].grid[idx(r, c)]).toBe('farm')
    expect(s1.maps[0].placed).toBe(true)
  })

  it('rejects a terrain not allowed by the card', () => {
    const deck = defaultDeck()
    const card = deck.find(c => !c.terrains.includes('monster'))!
    const s0 = makeGame([card])
    const cells = legalPlacements(s0.maps[0].grid, s0.card!.shapes[0])
    const s1 = placeShape(s0, 0, cells[0], 'monster')
    expect(s1).toBe(s0) // no-op, returns same state
  })
})

describe('edict scoring', () => {
  it('A (Tradeway): 3 pts per filled row/column', () => {
    const grid = blank()
    for (let c = 0; c < SIZE; c++) grid[idx(0, c)] = 'farm' // fill row 0
    expect(scoreEdict(grid, E('A'))).toBe(3)
    for (let r = 0; r < SIZE; r++) grid[idx(r, 0)] = 'farm' // fill col 0 too
    expect(scoreEdict(grid, E('A'))).toBe(6)
  })

  it('B (Greenbough): 1 pt per forest on the edge', () => {
    const grid = blank()
    grid[idx(0, 4)] = 'forest' // edge
    grid[idx(5, 5)] = 'forest' // interior, no point
    grid[idx(10, 10)] = 'forest' // edge corner
    expect(scoreEdict(grid, E('B'))).toBe(2)
  })

  it('C (Wildholds): 6 pts per village cluster of size >= 6', () => {
    const grid = blank()
    // a connected run of 6 villages
    for (let c = 0; c < 6; c++) grid[idx(3, c)] = 'village'
    expect(scoreEdict(grid, E('C'))).toBe(6)
    // a separate cluster of only 3 -> no extra points
    for (let c = 0; c < 3; c++) grid[idx(7, c)] = 'village'
    expect(scoreEdict(grid, E('C'))).toBe(6)
  })

  it('D (Borderlands): 1 pt per empty cell adjacent to a mountain', () => {
    const grid = blank()
    grid[idx(5, 5)] = 'mountain' // 4 empty neighbors
    expect(scoreEdict(grid, E('D'))).toBe(4)
    grid[idx(5, 4)] = 'water' // fill one neighbor
    expect(scoreEdict(grid, E('D'))).toBe(3)
  })
})

describe('coins', () => {
  it('a fully-surrounded interior mountain yields a coin', () => {
    const grid = blank()
    grid[idx(5, 5)] = 'mountain'
    expect(mountainCoins(grid)).toBe(0)
    grid[idx(4, 5)] = 'forest'
    grid[idx(6, 5)] = 'forest'
    grid[idx(5, 4)] = 'water'
    grid[idx(5, 6)] = 'water'
    expect(mountainCoins(grid)).toBe(1)
  })

  it('seasonScore folds card coins + mountain coins into the edict total', () => {
    const grid = blank()
    for (let c = 0; c < SIZE; c++) grid[idx(0, c)] = 'farm' // row 0 -> 3 pts under A
    const map = { grid, coins: 2, score: 0, placed: false }
    // A scores 3, plus 2 banked coins, no surrounded mountains -> 5
    expect(seasonScore(map, [E('A'), E('B')])).toBe(5)
  })
})

describe('season rotation', () => {
  it('scores the right edict pair per season (A+B / B+C / C+D / D+A)', () => {
    expect(edictPair(0)).toEqual([0, 1])
    expect(edictPair(1)).toEqual([1, 2])
    expect(edictPair(2)).toEqual([2, 3])
    expect(edictPair(3)).toEqual([3, 0])
  })
})

describe('self-play', () => {
  it('plays 4 full seasons to a valid winner with no throws (guard-capped)', () => {
    let s: State = makeGame()
    let guard = 0
    expect(() => {
      while (s.phase !== 'over' && guard < 5000) {
        guard++
        if (s.phase === 'seasonEnd') { s = nextSeason(s); continue }
        // placing: human auto-plays via the same greedy AI as player 0, AI as player 1.
        if (!s.maps[0].placed) {
          const before = s.step
          s = aiTurnFor(s, 0)
          if (s.step === before) s = skipPlacement(s, 0)
        }
        if (s.phase === 'placing' && !s.maps[1].placed) {
          const before = s.step
          s = aiTurn(s)
          if (s.step === before) s = skipPlacement(s, 1)
        }
      }
    }).not.toThrow()
    expect(s.phase).toBe('over')
    expect(guard).toBeLessThan(5000)
    expect([0, 1, 2]).toContain(s.winner)
    // both players advanced through 4 seasons
    expect(s.season).toBe(3)
    expect(s.seasonScores.length).toBe(8)
  })
})

// Helper: run the greedy chooser for an arbitrary player (player 0 in self-play).
function aiTurnFor(s: State, player: 0 | 1): State {
  // Mirror aiTurn but for a chosen player using the exported greedy via placeShape.
  if (s.phase !== 'placing' || !s.card || s.maps[player].placed) return s
  // Reuse aiBestMove indirectly by temporarily treating this player like the AI:
  const move = bestMove(s, player)
  if (!move) return skipPlacement(s, player)
  return placeShape(s, player, move.cells, move.terrain)
}

// re-import the greedy directly for player 0 testing.
import { aiBestMove } from './logic'
function bestMove(s: State, player: 0 | 1) { return aiBestMove(s, player) }
