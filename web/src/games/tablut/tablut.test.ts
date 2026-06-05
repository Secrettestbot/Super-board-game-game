import { describe, it, expect } from 'vitest'
import * as TB from './logic'
import type { Cell, Side } from './logic'

// Pure logic test: no DOM. Verifies the standard Tablut setup, rook movement + blocking,
// custodial capture, both win conditions, and that full self-play games terminate cleanly.

const { N, idx, THRONE, CORNERS } = TB

// Build an empty 81-cell board for constructed scenarios.
function empty(): Cell[] { return new Array(N * N).fill(null) }

// Drop a constructed board into a fresh state with a chosen side to move.
function stateFrom(board: Cell[], turn: Side): TB.TablutState {
  return { board, turn, winner: null, last: null, log: [] }
}

describe('tablut setup', () => {
  it('makes the standard 9x9 position with attackers to move first', () => {
    const s = TB.makeGame()
    expect(s.board).toHaveLength(81)
    expect(s.turn).toBe('att')
    expect(s.winner).toBeNull()

    // King on the throne.
    expect(s.board[THRONE]).toBe('K')
    expect(TB.kingPos(s.board)).toBe(THRONE)

    // 8 defenders + 1 king + 16 attackers.
    const { att, def, king } = TB.counts(s.board)
    expect(att).toBe(16)
    expect(def).toBe(8)
    expect(king).toBe(true)

    // Defenders sit on the exact standard plus-shape cells.
    for (const [r, c] of [[4, 2], [4, 3], [4, 5], [4, 6], [2, 4], [3, 4], [5, 4], [6, 4]]) {
      expect(s.board[idx(r, c)]).toBe('D')
    }
    // Attackers at the four edge-midpoint groups.
    for (const [r, c] of [[0, 3], [0, 4], [0, 5], [1, 4], [8, 3], [8, 4], [8, 5], [7, 4],
      [3, 0], [4, 0], [5, 0], [4, 1], [3, 8], [4, 8], [5, 8], [4, 7]]) {
      expect(s.board[idx(r, c)]).toBe('A')
    }
  })
})

describe('movement', () => {
  it('moves like a rook and blocks on pieces; only the king may stop on special squares', () => {
    const b = empty()
    b[idx(4, 2)] = 'D'          // a defender on row 4
    b[idx(4, 6)] = 'A'          // an enemy further along the same row
    const moves = new Set(TB.movesFrom(b, idx(4, 2)))
    // Can slide right up to but not onto/past the blocker at (4,6).
    expect(moves.has(idx(4, 3))).toBe(true)
    expect(moves.has(idx(4, 5))).toBe(true)
    expect(moves.has(idx(4, 6))).toBe(false) // occupied by enemy — blocked
    expect(moves.has(idx(4, 7))).toBe(false) // beyond the blocker
    // The throne is on this row at (4,4); a non-king may pass over but not stop there.
    expect(moves.has(THRONE)).toBe(false)
    // Vertical sliding works too.
    expect(moves.has(idx(0, 2))).toBe(true)
    expect(moves.has(idx(8, 2))).toBe(true)
  })

  it('lets the king stop on the throne and corners but blocks ordinary pieces', () => {
    const b = empty()
    b[idx(4, 2)] = 'K'
    expect(new Set(TB.movesFrom(b, idx(4, 2))).has(THRONE)).toBe(true)
    expect(new Set(TB.movesFrom(b, idx(4, 2))).has(idx(4, 0))).toBe(true) // corner reachable
  })
})

describe('capture', () => {
  it('removes a custodially flanked enemy on the moving side only', () => {
    const b = empty()
    // Attacker at (3,3); defender wall already at (3,5); a defender at (5,4) will slide up
    // to (3,4) to sandwich the attacker between (3,3)... no — set up a clean horizontal one:
    b[idx(3, 3)] = 'D'          // our wall on the left
    b[idx(3, 4)] = 'A'          // the victim attacker in the middle
    b[idx(7, 5)] = 'D'          // our mover, will slide up to (3,5) to flank from the right
    const s = stateFrom(b, 'def')
    const ns = TB.move(s, { from: idx(7, 5), to: idx(3, 5) }, 'def')
    expect(ns.board[idx(3, 4)]).toBeNull()      // attacker captured
    expect(ns.board[idx(3, 5)]).toBe('D')       // mover landed
  })

  it('does NOT capture by moving into a sandwich yourself', () => {
    const b = empty()
    b[idx(3, 3)] = 'A'          // enemy wall
    b[idx(3, 5)] = 'A'          // enemy wall
    b[idx(7, 4)] = 'D'          // our piece slides up into (3,4) between two attackers
    const s = stateFrom(b, 'def')
    const ns = TB.move(s, { from: idx(7, 4), to: idx(3, 4) }, 'def')
    // We are not captured for moving in voluntarily; our piece survives.
    expect(ns.board[idx(3, 4)]).toBe('D')
  })
})

describe('win conditions', () => {
  it('declares a defender win when the king reaches a corner', () => {
    const b = empty()
    b[idx(0, 3)] = 'K'          // king on the top edge, clear path to corner (0,0)
    const s = stateFrom(b, 'def')
    const ns = TB.move(s, { from: idx(0, 3), to: CORNERS[0] }, 'def')
    expect(ns.winner).toBe('def')
    expect(ns.turn).toBeNull()
  })

  it('declares an attacker win when the king is surrounded on four sides', () => {
    // A clean four-attacker box away from the throne. Three sides are already walled;
    // the mover slides in to close the fourth and trigger the king capture.
    const b = empty()
    const k = idx(2, 2)
    b[k] = 'K'
    b[idx(1, 2)] = 'A'        // up
    b[idx(2, 1)] = 'A'        // left
    b[idx(3, 2)] = 'A'        // down
    b[idx(2, 8)] = 'A'        // mover — slides left to (2,3) closing the right side
    const s = stateFrom(b, 'att')
    const ns = TB.move(s, { from: idx(2, 8), to: idx(2, 3) }, 'att')
    expect(TB.kingSurrounded(ns.board, k)).toBe(true)
    expect(ns.winner).toBe('att')
  })
})

describe('self-play', () => {
  it('plays several full games to a winner with no throws and a hard cap', () => {
    for (let game = 0; game < 6; game++) {
      let s = TB.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 400) {
          if (s.turn === 'att') {
            s = TB.aiMove(s)                          // real attacker AI
          } else {
            const moves = TB.legalMoves(s.board, 'def')
            expect(moves.length).toBeGreaterThan(0)
            const m = moves[(Math.random() * moves.length) | 0]
            s = TB.move(s, m, 'def')                  // random legal defender move
          }
        }
      }).not.toThrow()
      // Either someone won, or we hit the cap — but never an inconsistent state.
      if (s.winner) expect(['att', 'def']).toContain(s.winner)
      expect(guard).toBeLessThanOrEqual(400)
    }
  }, 30000)
})
