import { describe, it, expect } from 'vitest'
import * as Q from './logic'
import type { Tile, Placement, Board } from './logic'

// Helpers ------------------------------------------------------------------
let idc = 0
const T = (color: Q.Color, shape: Q.Shape): Tile => ({ color, shape, id: idc++ })
function boardFrom(entries: { r: number; c: number; tile: Tile }[]): Board {
  const b: Board = new Map()
  for (const e of entries) b.set(Q.key(e.r, e.c), e.tile)
  return b
}

describe('qwirkle line validity', () => {
  it('accepts a valid same-color line (distinct shapes)', () => {
    expect(Q.isValidLine([T('r', 'circle'), T('r', 'square'), T('r', 'star')])).toBe(true)
  })
  it('accepts a valid same-shape line (distinct colors)', () => {
    expect(Q.isValidLine([T('r', 'circle'), T('b', 'circle'), T('g', 'circle')])).toBe(true)
  })
  it('rejects a duplicate tile in a line', () => {
    expect(Q.isValidLine([T('r', 'circle'), T('r', 'square'), { color: 'r', shape: 'circle', id: 999 }])).toBe(false)
  })
  it('rejects a mixed line (neither shared color nor shape)', () => {
    expect(Q.isValidLine([T('r', 'circle'), T('b', 'square')])).toBe(false)
  })
  it('rejects a line longer than 6', () => {
    const line = [T('r', 'circle'), T('r', 'square'), T('r', 'diamond'), T('r', 'star'), T('r', 'clover'), T('r', 'cross'), T('o', 'circle')]
    // not even same-color (last is orange) but also too long; force a same-color over-length:
    const over = [T('g', 'circle'), T('g', 'square'), T('g', 'diamond'), T('g', 'star'), T('g', 'clover'), T('g', 'cross'), { color: 'g' as Q.Color, shape: 'circle' as Q.Shape, id: 1000 }]
    expect(Q.isValidLine(line)).toBe(false)
    expect(Q.isValidLine(over)).toBe(false)
  })
})

describe('qwirkle placement legality', () => {
  it('validates a perpendicular line on placement', () => {
    // Board: a horizontal red row r-circle, r-square at (0,0),(0,1).
    // Also a vertical column at col 0: r-circle (0,0), b-circle (1,0).
    // Placing b-square at (1,1) forms vertical [b-circle,b-square] (col 1) and
    // horizontal [b-circle(1,0), b-square(1,1)] — both valid.
    const board = boardFrom([
      { r: 0, c: 0, tile: T('r', 'circle') },
      { r: 0, c: 1, tile: T('r', 'square') },
      { r: 1, c: 0, tile: T('b', 'circle') },
    ])
    const good: Placement[] = [{ r: 1, c: 1, tile: T('b', 'square') }]
    expect(Q.isLegalPlacement(board, good).ok).toBe(true)

    // Placing g-star at (1,1): vertical line [r-square(0,1), g-star(1,1)] -> different color+shape -> invalid.
    const bad: Placement[] = [{ r: 1, c: 1, tile: T('g', 'star') }]
    expect(Q.isLegalPlacement(board, bad).ok).toBe(false)
  })

  it('requires placements to connect to the board after the first move', () => {
    const board = boardFrom([{ r: 0, c: 0, tile: T('r', 'circle') }])
    const disconnected: Placement[] = [{ r: 5, c: 5, tile: T('r', 'square') }]
    expect(Q.isLegalPlacement(board, disconnected).ok).toBe(false)
  })
})

describe('qwirkle scoring', () => {
  it('scores line length and counts both lines for a tile in two lines', () => {
    // Horizontal red line at row 0: r-circle(0,0), r-square(0,1).
    // Vertical circle line at col 0: r-circle(0,0), b-circle(1,0).
    // Place g-circle at (2,0) extends ONLY the vertical circle line to length 3.
    const board1 = boardFrom([
      { r: 0, c: 0, tile: T('r', 'circle') },
      { r: 1, c: 0, tile: T('b', 'circle') },
    ])
    const p1: Placement[] = [{ r: 2, c: 0, tile: T('g', 'circle') }]
    expect(Q.scorePlacement(board1, p1)).toBe(3)

    // Double line: a tile completing both a horizontal and a vertical line.
    const board2 = boardFrom([
      { r: 0, c: 0, tile: T('r', 'circle') }, // horizontal red row
      { r: 0, c: 1, tile: T('r', 'square') },
      { r: 1, c: 2, tile: T('b', 'diamond') }, // vertical diamond col 2
    ])
    // place r-diamond at (0,2): horizontal red [circle,square,diamond] = 3,
    // vertical diamond [r-diamond(0,2), b-diamond(1,2)] = 2 -> total 5.
    const p2: Placement[] = [{ r: 0, c: 2, tile: T('r', 'diamond') }]
    expect(Q.scorePlacement(board2, p2)).toBe(5)
  })

  it('awards the +6 Qwirkle bonus for completing a line of 6', () => {
    const board = boardFrom([
      { r: 0, c: 0, tile: T('r', 'circle') },
      { r: 0, c: 1, tile: T('r', 'square') },
      { r: 0, c: 2, tile: T('r', 'diamond') },
      { r: 0, c: 3, tile: T('r', 'star') },
      { r: 0, c: 4, tile: T('r', 'clover') },
    ])
    const p: Placement[] = [{ r: 0, c: 5, tile: T('r', 'cross') }]
    // line of 6 -> 6 + 6 bonus = 12
    expect(Q.scorePlacement(board, p)).toBe(12)
  })
})

describe('qwirkle swap', () => {
  it('returns swapped tiles to the bag and preserves the 108-tile count', () => {
    const s = Q.makeGame(Q.fullBag())
    const before = s.bag.length
    const ids = [s.hands[0][0].id, s.hands[0][1].id]
    const after = Q.swap(s, ids)
    expect(after.bag.length).toBe(before) // drew 2, returned 2
    expect(after.hands[0].length).toBe(Q.HAND_SIZE)
    expect(after.turn).toBe(1) // turn forfeited
    const total = after.bag.length + after.hands[0].length + after.hands[1].length + after.board.size
    expect(total).toBe(108)
  })
})

describe('qwirkle self-play', () => {
  it('plays a full game to a valid winner under a guard cap with tile conservation and no throws', () => {
    let s = Q.makeGame(Q.fullBag())
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 2000) {
        guard++
        // unify: both players use the AI policy by temporarily acting as the current player
        const cur = s.turn
        if (cur === 1) {
          s = Q.aiTurn(s)
        } else {
          // drive player 0 with the same greedy logic via a pseudo-AI turn:
          // flip to AI perspective by swapping turn, run aiTurn, swap back labels.
          // Simpler: emulate player-0 greedy directly.
          const moved = playGreedy(s, 0)
          s = moved
        }
      }
    }).not.toThrow()

    // tile conservation throughout
    const total = s.bag.length + s.hands[0].length + s.hands[1].length + s.board.size
    expect(total).toBe(108)
    expect(guard).toBeLessThan(2000)
    // a clean finish: a valid winner OR the loop ended cleanly with a decided winner
    expect(s.winner === 0 || s.winner === 1 || s.winner === 'draw').toBe(true)
  })
})

// Greedy driver for player 0 reusing the public logic (mirrors aiTurn for player 1).
function playGreedy(s: Q.QState, _player: 0): Q.QState {
  // Temporarily mark it as the AI's perspective is not exposed; instead use makeMove search
  // by reusing aiTurn semantics: we rotate the state so player 0 looks like player 1.
  const rotated: Q.QState = {
    ...s,
    hands: [s.hands[1], s.hands[0]],
    scores: [s.scores[1], s.scores[0]],
    turn: 1,
  }
  const after = Q.aiTurn(rotated)
  // rotate back
  const w =
    after.winner === 0 ? 1 : after.winner === 1 ? 0 : after.winner
  return {
    ...after,
    hands: [after.hands[1], after.hands[0]],
    scores: [after.scores[1], after.scores[0]],
    turn: (after.turn === 1 ? 0 : 1) as 0 | 1,
    winner: w as Q.QState['winner'],
  }
}
