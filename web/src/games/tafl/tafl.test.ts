import { describe, it, expect } from 'vitest'
import * as T from './logic'
import type { Cell, Side, State } from './logic'

// Pure-logic tests (no DOM): Brandubh 7x7 setup, rook movement + blocking + restricted squares,
// custodial capture, both win conditions, and a bounded self-play smoke test.

const { N, idx, THRONE, CORNERS } = T

function empty(): Cell[] { return new Array(N * N).fill(null) }

// Drop a constructed board into a fresh state with a chosen side to move.
function stateFrom(board: Cell[], turn: Side): State {
  return { board, turn, winner: null, last: null, log: [] }
}

describe('setup', () => {
  it('makes the standard 7x7 Brandubh position with attackers to move first', () => {
    const s = T.makeGame()
    expect(s.board).toHaveLength(49)
    expect(s.turn).toBe('attackers')
    expect(s.winner).toBeNull()

    // King on the throne (centre).
    expect(s.board[THRONE]).toBe('K')
    expect(T.kingPos(s.board)).toBe(THRONE)

    // 4 defenders + 1 king + 8 attackers.
    const { att, def, king } = T.counts(s.board)
    expect(att).toBe(8)
    expect(def).toBe(4)
    expect(king).toBe(true)

    // Defenders on the throne's four orthogonal neighbours.
    for (const [r, c] of [[2, 3], [4, 3], [3, 2], [3, 4]]) expect(s.board[idx(r, c)]).toBe('D')
    // Attackers two per edge midline.
    for (const [r, c] of [[0, 2], [0, 4], [6, 2], [6, 4], [2, 0], [4, 0], [2, 6], [4, 6]]) {
      expect(s.board[idx(r, c)]).toBe('A')
    }
  })
})

describe('movement', () => {
  it('moves like a rook, blocks on pieces, and bars ordinary pieces from special squares', () => {
    const b = empty()
    b[idx(3, 1)] = 'D'          // a defender on row 3
    b[idx(3, 5)] = 'A'          // enemy further along the same row
    const moves = new Set(T.movesFrom(b, idx(3, 1)))
    expect(moves.has(idx(3, 2))).toBe(true)
    expect(moves.has(idx(3, 4))).toBe(true)
    expect(moves.has(idx(3, 5))).toBe(false) // occupied — blocked
    expect(moves.has(idx(3, 6))).toBe(false) // beyond the blocker
    expect(moves.has(THRONE)).toBe(false)    // throne is on row 3 at col 3 — non-king may pass, not stop
    // Vertical sliding works.
    expect(moves.has(idx(0, 1))).toBe(true)
    expect(moves.has(idx(6, 1))).toBe(true)
  })

  it('lets the king stop on the throne and corners', () => {
    const b = empty()
    b[idx(3, 1)] = 'K'
    const moves = new Set(T.movesFrom(b, idx(3, 1)))
    expect(moves.has(THRONE)).toBe(true)
    expect(moves.has(idx(3, 0))).toBe(true)  // left edge of row 3 — not a corner, plain reach
    b[idx(0, 1)] = 'K'; b[idx(3, 1)] = null
    expect(new Set(T.movesFrom(b, idx(0, 1))).has(CORNERS[0])).toBe(true) // king reaches a corner
  })
})

describe('capture', () => {
  it('removes a custodially flanked enemy when the mover closes the sandwich', () => {
    // Row 1 (avoids the throne row). Wall at (1,2), victim attacker at (1,3); a defender
    // slides up the column to (1,4) and flanks the attacker from the right.
    const b = empty()
    b[idx(1, 2)] = 'D'         // wall
    b[idx(1, 3)] = 'A'         // victim
    b[idx(5, 4)] = 'D'         // mover
    const s = stateFrom(b, 'defenders')
    const ns = T.applyMove(s, idx(5, 4), idx(1, 4), 'defenders')
    expect(ns.board[idx(1, 3)]).toBeNull()   // attacker captured
    expect(ns.board[idx(1, 4)]).toBe('D')    // mover landed
  })

  it('does NOT capture a piece that moves into a sandwich itself', () => {
    const b = empty()
    b[idx(1, 2)] = 'A'         // enemy wall
    b[idx(1, 4)] = 'A'         // enemy wall
    b[idx(5, 3)] = 'D'         // our piece slides up between the two attackers
    const s = stateFrom(b, 'defenders')
    const ns = T.applyMove(s, idx(5, 3), idx(1, 3), 'defenders')
    expect(ns.board[idx(1, 3)]).toBe('D')    // survives — voluntary entry is safe
  })
})

describe('win conditions', () => {
  it('declares a defenders win when the king reaches a corner one move away', () => {
    const b = empty()
    b[idx(0, 3)] = 'K'         // king on the top edge with a clear lane to corner (0,0)
    const s = stateFrom(b, 'defenders')
    const ns = T.applyMove(s, idx(0, 3), CORNERS[0], 'defenders')
    expect(ns.winner).toBe('defenders')
    expect(ns.turn).toBeNull()
  })

  it('declares an attackers win when the king is surrounded on four sides', () => {
    const b = empty()
    const k = idx(2, 2)
    b[k] = 'K'
    b[idx(1, 2)] = 'A'        // up
    b[idx(2, 1)] = 'A'        // left
    b[idx(3, 2)] = 'A'        // down
    b[idx(2, 5)] = 'A'        // mover — slides left to (2,3), closing the right side
    const s = stateFrom(b, 'attackers')
    const ns = T.applyMove(s, idx(2, 5), idx(2, 3), 'attackers')
    expect(T.kingSurrounded(ns.board, k)).toBe(true)
    expect(ns.winner).toBe('attackers')
    expect(ns.turn).toBeNull()
  })
})

describe('self-play smoke', () => {
  it('plays bounded games with the real AI and random defenders — no throws, valid state', () => {
    for (let game = 0; game < 6; game++) {
      let s = T.makeGame()
      let guard = 0
      expect(() => {
        while (s.winner == null && guard++ < 200) {
          if (s.turn === 'attackers') {
            s = T.aiTurn(s)
          } else {
            const moves = T.legalMoves(s.board, 'defenders')
            expect(moves.length).toBeGreaterThan(0)
            const m = moves[(Math.random() * moves.length) | 0]
            s = T.applyMove(s, m.from, m.to, 'defenders')
          }
        }
      }).not.toThrow()
      // A winner, when set, must be valid; otherwise we simply hit the cap (accepted).
      if (s.winner != null) expect(['attackers', 'defenders', 'draw']).toContain(s.winner)
      // Either a winner was reached, or we stopped at the hard cap — never an endless loop.
      expect(s.winner != null || guard >= 200).toBe(true)
      expect(guard).toBeLessThanOrEqual(201)
    }
  }, 20000)
})
