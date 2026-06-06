import { describe, it, expect } from 'vitest'
import * as M from './logic'
import type { State, PieceType } from './logic'

const { idx } = M

describe('mijnlieff — opening', () => {
  it('first move cannot be on the 4 centre cells', () => {
    const s = M.makeGame()
    const legal = M.legalPlacements(s)
    const centers = [idx(1, 1), idx(1, 2), idx(2, 1), idx(2, 2)]
    for (const c of centers) expect(legal).not.toContain(c)
    // there are 12 non-centre cells, all legal on the opening
    expect(legal.length).toBe(12)
    // placing on a centre cell is rejected (state unchanged)
    const blocked = M.place(s, idx(1, 1), 'straight')
    expect(blocked).toBe(s)
  })
})

describe('mijnlieff — placement constraints', () => {
  // helper: build a state with one placed piece of `type` at `cell`, opponent to move
  function after(cell: number, type: PieceType): State {
    const s = M.makeGame()
    // place at an edge cell so opening centre-ban is satisfied, then override last
    const placed = M.place(s, cell, type)
    return placed
  }

  it('STRAIGHT restricts to same row or column', () => {
    const s = after(idx(0, 0), 'straight')
    const legal = M.legalPlacements(s)
    // every legal cell shares row 0 or column 0, excluding the occupied cell
    for (const c of legal) {
      const r = Math.floor(c / 4), col = c % 4
      expect(r === 0 || col === 0).toBe(true)
    }
    expect(legal).toContain(idx(0, 3)) // same row
    expect(legal).toContain(idx(3, 0)) // same column
    expect(legal).not.toContain(idx(1, 1)) // neither
    expect(legal).not.toContain(idx(0, 0)) // occupied
  })

  it('DIAGONAL restricts to a diagonal line', () => {
    const s = after(idx(0, 0), 'diagonal')
    const legal = M.legalPlacements(s)
    for (const c of legal) {
      const r = Math.floor(c / 4), col = c % 4
      expect(Math.abs(r - 0) === Math.abs(col - 0)).toBe(true)
    }
    expect(legal).toContain(idx(1, 1))
    expect(legal).toContain(idx(3, 3))
    expect(legal).not.toContain(idx(0, 1))
    expect(legal).not.toContain(idx(1, 0))
  })

  it('NEAR restricts to king-adjacent cells', () => {
    // place at a central-ish edge so it has many neighbours; use r1c0 (idx 4)
    const s = after(idx(1, 0), 'near')
    const legal = M.legalPlacements(s)
    const neigh = new Set([idx(0, 0), idx(0, 1), idx(1, 1), idx(2, 0), idx(2, 1)])
    expect(new Set(legal)).toEqual(neigh)
  })

  it('FAR restricts to non-adjacent cells', () => {
    const s = after(idx(0, 0), 'far')
    const legal = M.legalPlacements(s)
    // adjacent to (0,0) are (0,1),(1,0),(1,1) — must be excluded
    expect(legal).not.toContain(idx(0, 1))
    expect(legal).not.toContain(idx(1, 0))
    expect(legal).not.toContain(idx(1, 1))
    expect(legal).toContain(idx(0, 2))
    expect(legal).toContain(idx(2, 2))
    for (const c of legal) {
      const r = Math.floor(c / 4), col = c % 4
      expect(Math.max(Math.abs(r - 0), Math.abs(col - 0))).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('mijnlieff — pass handling', () => {
  it('a player with pieces but no legal square passes', () => {
    // construct: opponent just played a NEAR piece in a corner, but surround all neighbours
    const s = M.makeGame()
    const board = s.board.slice()
    // fill the 3 neighbours of corner (0,0) so a NEAR constraint has zero targets
    board[idx(0, 1)] = { owner: 1, type: 'straight' }
    board[idx(1, 0)] = { owner: 1, type: 'straight' }
    board[idx(1, 1)] = { owner: 1, type: 'straight' }
    const forced: State = {
      ...s,
      board,
      turn: 0,
      last: { cell: idx(0, 0), type: 'near', owner: 1 },
    }
    // player 0 has no legal NEAR target -> legalPlacements empty
    expect(M.legalPlacements(forced)).toEqual([])
  })
})

describe('mijnlieff — line scoring', () => {
  it('scores 1 pt for a line of exactly 3 and 2 pts for a line of 4', () => {
    const board: (M.Piece | null)[] = new Array(16).fill(null)
    // player 0: full row 0 (length 4) -> 2 pts
    for (let c = 0; c < 4; c++) board[idx(0, c)] = { owner: 0, type: 'straight' }
    // player 0: a length-3 diagonal (1,0)-(2,1)-(3,2) -> 1 pt
    board[idx(1, 0)] = { owner: 0, type: 'near' }
    board[idx(2, 1)] = { owner: 0, type: 'near' }
    board[idx(3, 2)] = { owner: 0, type: 'near' }
    const res = M.scoreLines(board, 0)
    // row of 4 = 2, diagonal of 3 = 1  => 3 total. The full row should not also yield its
    // length-3 sub-windows.
    expect(res.points).toBe(3)
  })

  it('scores orthogonal column of 3', () => {
    const board: (M.Piece | null)[] = new Array(16).fill(null)
    board[idx(0, 0)] = { owner: 1, type: 'far' }
    board[idx(1, 0)] = { owner: 1, type: 'far' }
    board[idx(2, 0)] = { owner: 1, type: 'far' }
    const res = M.scoreLines(board, 1)
    expect(res.points).toBe(1)
  })
})

describe('mijnlieff — full self-play terminates', () => {
  it('reaches a valid winner/draw with no throws under a guard cap', () => {
    let s = M.makeGame()
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 200) {
        s = M.aiTurn({ ...s, turn: s.turn }) // both sides driven by the AI
        guard++
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(200)
    expect(s.winner == null).toBe(false)
    expect([0, 1, 'draw']).toContain(s.winner)
    // scores are consistent with a finished board
    expect(s.scores[0]).toBeGreaterThanOrEqual(0)
    expect(s.scores[1]).toBeGreaterThanOrEqual(0)
  })
})
