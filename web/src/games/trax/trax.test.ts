import { describe, it, expect } from 'vitest'
import {
  ALL_TILES, STRAIGHT_BASE_TEST, CURVE_BASE_TEST, rotate, fits, place, makeGame,
  resolveForced, forcedCells, analyzeColor, legalPlacements, aiTurn, key,
} from './logic'
import type { Tile, State } from './logic'

describe('Trax tile model', () => {
  it('every tile has exactly two white and two red edges (2/2 split)', () => {
    for (const t of ALL_TILES) {
      const w = t.edges.filter(e => e === 'W').length
      const r = t.edges.filter(e => e === 'R').length
      expect(w).toBe(2)
      expect(r).toBe(2)
    }
  })

  it('straight tile keeps straight topology under rotation', () => {
    // base straight: white N<->S, red E<->W
    const s0 = STRAIGHT_BASE_TEST
    expect(s0.edges).toEqual(['W', 'R', 'W', 'R'])
    // link N(0) -> S(2)
    expect(s0.links[0]).toBe(2)
    // rotate 1 quarter CW: edges shift -> [R,W,R,W]
    const s1 = rotate(s0, 1)
    expect(s1.edges).toEqual(['R', 'W', 'R', 'W'])
    // still a straight: N links to S
    expect(s1.links[0]).toBe(2)
  })

  it('curved tile joins adjacent edges of one color and is a true elbow', () => {
    const c0 = CURVE_BASE_TEST
    // N&E white, S&W red
    expect(c0.edges).toEqual(['W', 'W', 'R', 'R'])
    // N links to E (adjacent), S links to W
    expect(c0.links[0]).toBe(1)
    expect(c0.links[2]).toBe(3)
    // curve has 4 distinct rotations
    const set = new Set([0, 1, 2, 3].map(q => rotate(c0, q).edges.join('')))
    expect(set.size).toBe(4)
  })
})

describe('placement legality', () => {
  it('a placement must match all shared edges', () => {
    let s = makeGame()
    // place a curve at origin
    const curve = CURVE_BASE_TEST // edges N=W E=W S=R W=R
    s = place(s, key(0, 0), curve)
    expect(s.board.size).toBeGreaterThanOrEqual(1)
    // east neighbor (0,1): its West edge must equal origin's East edge = 'W'
    const eastNeighborOk = ALL_TILES.filter(t => fits(s.board, 0, 1, t))
    for (const t of eastNeighborOk) expect(t.edges[3]).toBe('W')
    // a tile presenting RED on west must NOT fit at (0,1)
    const badAtEast = ALL_TILES.find(t => t.edges[3] === 'R')!
    expect(fits(s.board, 0, 1, badAtEast)).toBe(false)
  })
})

describe('forced play', () => {
  it('fills a cell that has two same-color incoming edges', () => {
    // Construct a board where empty cell (0,1) gets WHITE from west (0,0) and
    // WHITE from north (-1,1).
    const board = new Map<string, Tile>()
    // tile at (0,0): East edge = W
    const a = ALL_TILES.find(t => t.edges[1] === 'W')! // East white
    board.set(key(0, 0), a)
    // tile at (-1,1): South edge = W
    const b = ALL_TILES.find(t => t.edges[2] === 'W')! // South white
    board.set(key(-1, 1), b)
    const forced = forcedCells(board)
    const f = forced.find(x => x.cell === key(0, 1))
    expect(f).toBeTruthy()
    expect(f!.color).toBe('W')
    const ok = resolveForced(board)
    expect(ok).toBe(true)
    expect(board.has(key(0, 1))).toBe(true)
    // resolution terminates with no remaining forced cells
    expect(forcedCells(board).length).toBe(0)
  })
})

describe('win detection', () => {
  it('detects a closed loop of a color', () => {
    // Build a 2x2 ring of curve tiles whose white arcs form a closed loop.
    // Corners curve so white runs around the inner square.
    // (0,0) white arc S<->E ; (0,1) white arc S<->W ; (1,0) white arc N<->E ; (1,1) white arc N<->W
    const board = new Map<string, Tile>()
    // Helper: find a tile whose white track links dir x<->y.
    const findWhiteArc = (x: number, y: number): Tile => {
      for (const t of ALL_TILES) {
        if (t.edges[x] === 'W' && t.edges[y] === 'W' && t.links[x] === y) return t
      }
      throw new Error('no white arc ' + x + ' ' + y)
    }
    board.set(key(0, 0), findWhiteArc(2, 1)) // S<->E white
    board.set(key(0, 1), findWhiteArc(2, 3)) // S<->W white
    board.set(key(1, 0), findWhiteArc(0, 1)) // N<->E white
    board.set(key(1, 1), findWhiteArc(0, 3)) // N<->W white
    const info = analyzeColor(board, 'W')
    expect(info.loop).toBe(true)
    expect(info.win).toBe(true)
  })

  it('detects an 8-span line', () => {
    // A straight horizontal run of straight tiles spanning 8 columns.
    // Use a straight tile whose RED runs E<->W (so red line across columns).
    const board = new Map<string, Tile>()
    // straight with red E<->W: base straight edges [W,R,W,R], red links E(1)<->W(3)
    const redStraight = ALL_TILES.find(
      t => t.edges[1] === 'R' && t.edges[3] === 'R' && t.links[1] === 3,
    )!
    for (let c = 0; c < 8; c++) board.set(key(0, c), redStraight)
    const info = analyzeColor(board, 'R')
    expect(info.colSpan).toBeGreaterThanOrEqual(8)
    expect(info.win).toBe(true)
  })
})

describe('self-play', () => {
  it('terminates under a cap with no throws and a valid winner when present', () => {
    let s: State = makeGame()
    let guard = 0
    // first move by white: place a tile at origin
    const first = legalPlacements(s)
    expect(first.length).toBeGreaterThan(0)
    s = place(s, first[0].cell, first[0].tile)
    while (s.winner == null && guard++ < 400) {
      if (s.turn === 1) {
        const before = s.moves
        s = aiTurn(s)
        if (s.moves === before && s.winner == null) {
          // AI passed or stuck; break safely
          if (s.turn === 1) break
        }
      } else {
        const pls = legalPlacements(s)
        if (pls.length === 0) break
        // white plays a "random-ish" but deterministic move
        const pick = pls[guard % pls.length]
        const before = s.moves
        s = place(s, pick.cell, pick.tile)
        if (s.moves === before) {
          // placement rejected; try first
          s = place(s, pls[0].cell, pls[0].tile)
          if (s.moves === before) break
        }
      }
    }
    // winner must be 0, 1, or null — never invalid
    expect(s.winner === null || s.winner === 0 || s.winner === 1).toBe(true)
    if (s.winner != null) {
      expect(s.winColor === 'W' || s.winColor === 'R').toBe(true)
    }
  })
})
