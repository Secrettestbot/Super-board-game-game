import { describe, it, expect } from 'vitest'
import {
  makeGame, rollDice, rotateEdges, orientations, makeTile, tileFits,
  legalPlacements, placeTile, skipDie, scoreGrid, longestPath, scoreExits, scoreCenter,
  countErrors, aiTurn, standardExits, cellIdx,
  type Grid, type EdgeType, type RRState,
} from './logic'

const R: EdgeType = 'road'
const L: EdgeType = 'rail'
const O: EdgeType = 'none'

function emptyGrid(): Grid { return Array.from({ length: 49 }, () => null) }

describe('railroad_ink logic', () => {
  it('rotates a tile\'s edges correctly', () => {
    // road_straight base [R,O,R,O] (N/S). +1 quarter-turn -> road on E/W.
    expect(rotateEdges([R, O, R, O], 1)).toEqual([O, R, O, R])
    // a curve [R,R,O,O] (N,E) rotated +1 -> (E,S)
    expect(rotateEdges([R, R, O, O], 1)).toEqual([O, R, R, O])
    // full turn is identity
    expect(rotateEdges([R, L, O, O], 4)).toEqual([R, L, O, O])
  })

  it('dedupes orientations (straight has 2, cross has 1)', () => {
    expect(orientations('road_straight').length).toBe(2)
    expect(orientations('cross_junction').length).toBe(1)
    expect(orientations('road_curve').length).toBe(4)
  })

  it('placement must connect to an exit or existing route with matching type', () => {
    const exits = standardExits()
    const grid = emptyGrid()
    // Top exit at (0,3) is a ROAD exit on side N. A road_straight (N/S road) there connects.
    const roadTile = makeTile('road_straight', 0) // [R,O,R,O]
    expect(tileFits(grid, exits, cellIdx(0, 3), roadTile)).toBe(true)
    // A rail_straight at the same road exit does NOT connect (no matching network anywhere).
    const railTile = makeTile('rail_straight', 0)
    expect(tileFits(grid, exits, cellIdx(0, 3), railTile)).toBe(false)
    // A road tile in the dead center with nothing around it cannot connect.
    expect(tileFits(grid, exits, cellIdx(3, 3), roadTile)).toBe(false)
  })

  it('rail meeting road on a joined side is a conflict (illegal)', () => {
    const exits = standardExits()
    const grid = emptyGrid()
    // place a road_straight connected to the top road exit at (0,3)
    grid[cellIdx(0, 3)] = makeTile('road_straight', 0) // road on S points to (1,3)
    // a rail_straight at (1,3) would meet that road on its N side -> conflict
    const rail = makeTile('rail_straight', 0) // [L,O,L,O], N=rail
    expect(tileFits(grid, exits, cellIdx(1, 3), rail)).toBe(false)
    // a road_straight at (1,3) matches road-to-road -> legal
    const road = makeTile('road_straight', 0)
    expect(tileFits(grid, exits, cellIdx(1, 3), road)).toBe(true)
  })

  it('placeTile updates the grid and marks the die resolved', () => {
    const s = makeGame(['road_straight', 'road_straight', 'road_straight', 'cross_junction'])
    const placements = legalPlacements(s.grids[0], s.exits, 'road_straight')
    expect(placements.length).toBeGreaterThan(0)
    const pl = placements.find(p => p.cell === cellIdx(0, 3))!
    expect(pl).toBeTruthy()
    const s2 = placeTile(s, 0, 0, pl.cell, pl.rot)
    expect(s2.grids[0][cellIdx(0, 3)]).not.toBeNull()
    expect(s2.resolved[0][0]).toBe(true)
    // illegal placement leaves state unchanged
    const s3 = placeTile(s, 0, 0, cellIdx(3, 3), 0)
    expect(s3).toBe(s)
  })

  it('longest road and railway over a known grid', () => {
    const grid = emptyGrid()
    // Build a straight horizontal ROAD of 4 tiles across row 3 (cols 0..3),
    // each exposing road on E and W.
    for (let c = 0; c < 4; c++) grid[cellIdx(3, c)] = makeTile('road_straight', 1) // [O,R,O,R]
    expect(longestPath(grid, 'road')).toBe(4)
    expect(longestPath(grid, 'rail')).toBe(0)
    // Build a vertical RAIL of 3 tiles down col 5 (rows 0..2).
    for (let r = 0; r < 3; r++) grid[cellIdx(r, 5)] = makeTile('rail_straight', 0) // [L,O,L,O]
    expect(longestPath(grid, 'rail')).toBe(3)
  })

  it('connected-exit network scoring uses the table', () => {
    const exits = standardExits()
    const grid = emptyGrid()
    // Connect the left road exit (1,0)->E and the top is far; instead connect two ROAD
    // exits: left (1,0) and right (1,6) via a straight road across row 1.
    for (let c = 0; c < 7; c++) grid[cellIdx(1, c)] = makeTile('road_straight', 1) // road E/W
    // (1,0) west exit is road, (1,6) east exit is road -> both join one network = 2 exits.
    const pts = scoreExits(grid, exits)
    expect(pts).toBe(4) // EXIT_TABLE[2] = 4
  })

  it('center bonus counts filled center 3x3 cells', () => {
    const grid = emptyGrid()
    expect(scoreCenter(grid)).toBe(0)
    grid[cellIdx(2, 2)] = makeTile('cross_junction', 0)
    grid[cellIdx(3, 3)] = makeTile('cross_junction', 0)
    grid[cellIdx(4, 4)] = makeTile('cross_junction', 0)
    grid[cellIdx(0, 0)] = makeTile('cross_junction', 0) // not center
    expect(scoreCenter(grid)).toBe(3)
  })

  it('counts dangling open ends as errors', () => {
    const exits = standardExits()
    const grid = emptyGrid()
    // a lone road_straight at the road exit (0,3): N matches exit (ok), S dangles into
    // empty (1,3) -> 1 error.
    grid[cellIdx(0, 3)] = makeTile('road_straight', 0)
    expect(countErrors(grid, exits)).toBe(1)
  })

  it('plays a full 7-round self-play game to a valid winner without throwing', () => {
    let rng = 1
    const seeded = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return (rng % 1000) / 1000 }
    let s: RRState = makeGame(undefined, seeded)
    let guard = 0
    expect(() => {
      while (s.winner == null && guard++ < 500) {
        if (s.turn === 0) {
          // human auto-plays greedily: resolve each die or skip
          for (let k = 0; k < s.dice.length; k++) {
            if (s.resolved[0][k]) continue
            const pls = legalPlacements(s.grids[0], s.exits, s.dice[k])
            if (pls.length === 0) {
              s = skipDie(s, 0, k)
            } else {
              s = placeTile(s, 0, k, pls[0].cell, pls[0].rot)
            }
          }
        } else {
          s = aiTurn(s)
        }
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(500)
    expect(s.winner === 0 || s.winner === 1 || s.winner === 'draw').toBe(true)
    expect(s.phase).toBe('done')
    // both grids scored
    expect(s.scores[0].total).toBe(scoreGrid(s.grids[0], s.exits).total)
    expect(s.scores[1].total).toBe(scoreGrid(s.grids[1], s.exits).total)
  })
})
