import { describe, it, expect } from 'vitest'
import * as Q from './logic'
import type { State, Move } from './logic'

// Pure-logic tests (no DOM). Board setup, border/legal-move rules, the slide mechanic,
// win detection, and a self-play loop to a valid terminal state under a hard guard cap.

const idx = (r: number, c: number) => r * Q.N + c

describe('quixo logic', () => {
  it('starts on a valid 25-blank board, you to move, no winner', () => {
    const s = Q.makeGame()
    expect(s.board.length).toBe(25)
    expect(s.board.every(v => v === 0)).toBe(true)
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
  })

  it('isBorder marks the 16 perimeter cells only', () => {
    let count = 0
    for (let i = 0; i < 25; i++) if (Q.isBorder(i)) count++
    expect(count).toBe(16)
    expect(Q.isBorder(idx(0, 0))).toBe(true)
    expect(Q.isBorder(idx(2, 0))).toBe(true)
    expect(Q.isBorder(idx(2, 2))).toBe(false)  // center
    expect(Q.isBorder(idx(2, 4))).toBe(true)
  })

  it('legalMoves only returns border cubes that are blank or yours, with valid dirs', () => {
    let s = Q.makeGame()
    const board = s.board.slice()
    board[idx(2, 2)] = -1       // center owned by AI (not a border cube anyway)
    board[idx(0, 0)] = -1       // a border cube owned by AI — must be excluded
    board[idx(0, 1)] = 1        // a border cube owned by you — allowed
    s = { ...s, board }
    const moves = Q.legalMoves(s)
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(Q.isBorder(m.cell)).toBe(true)
      expect(s.board[m.cell] === 0 || s.board[m.cell] === 1).toBe(true)
      expect(Q.dirsFor(m.cell).includes(m.dir)).toBe(true)
    }
    // no move ever takes the AI-owned corner
    expect(moves.some(m => m.cell === idx(0, 0))).toBe(false)
    // your border cube is takeable
    expect(moves.some(m => m.cell === idx(0, 1))).toBe(true)
  })

  it('a cube cannot be slid straight back into its own spot', () => {
    // corner (0,0): it sits at the top end of its column and left end of its row, so it can
    // only be inserted from the OTHER ends → push up (insert at bottom) and left (insert at right).
    const dirs = Q.dirsFor(idx(0, 0))
    expect(dirs.sort()).toEqual(['left', 'up'])
    // bottom-right (4,4): sits at bottom + right ends → can insert from top (down) and left end (right).
    expect(Q.dirsFor(idx(4, 4)).sort()).toEqual(['down', 'right'])
    // a middle edge cube on the top row (0,2): top of its column (so up/down? it's at top, so
    // only 'up'), and a non-edge column so both 'left' and 'right' along the row.
    expect(Q.dirsFor(idx(0, 2)).sort()).toEqual(['left', 'right', 'up'])
  })

  it('applyMove slides the row and inserts your symbol at the far end', () => {
    // Take the top-left corner (0,0). It sits at the left end, so the only row insertion is
    // dir 'left' (insert at the RIGHT edge, shifting the row leftward). Pre-seed to observe it.
    let s = Q.makeGame()
    const board = s.board.slice()
    board[idx(0, 1)] = -1
    board[idx(0, 2)] = -1
    s = { ...s, board, turn: 'you' }
    const after = Q.applyMove(s, { cell: idx(0, 0), dir: 'left' })
    // row 0 was [0(taken), -1, -1, 0, 0]; remove taken, insert X at right edge, shift left
    // → [-1, -1, 0, 0, X]
    expect(after.board[idx(0, 0)]).toBe(-1)
    expect(after.board[idx(0, 1)]).toBe(-1)
    expect(after.board[idx(0, 2)]).toBe(0)
    expect(after.board[idx(0, 3)]).toBe(0)
    expect(after.board[idx(0, 4)]).toBe(1)
    expect(after.turn).toBe('ai')
  })

  it('applyMove sliding a column shifts cubes correctly', () => {
    // Take bottom of column 0 (4,0), push from the top (down): inserts X at row 0,
    // shifts the column down.
    let s = Q.makeGame()
    const board = s.board.slice()
    board[idx(0, 0)] = -1
    board[idx(1, 0)] = -1
    s = { ...s, board, turn: 'you' }
    const after = Q.applyMove(s, { cell: idx(4, 0), dir: 'down' })
    // column 0 was [-1,-1,0,0,0(taken)]; remove last, insert X at top → [X,-1,-1,0,0]
    expect(after.board[idx(0, 0)]).toBe(1)
    expect(after.board[idx(1, 0)]).toBe(-1)
    expect(after.board[idx(2, 0)]).toBe(-1)
    expect(after.board[idx(3, 0)]).toBe(0)
  })

  it('detects a winning line of five for the mover', () => {
    // Set row 2 to X in columns 1..4 and take the border cube (2,0) pushing right to complete it.
    let s = Q.makeGame()
    const board = s.board.slice()
    board[idx(2, 1)] = 1; board[idx(2, 2)] = 1; board[idx(2, 3)] = 1; board[idx(2, 4)] = 1
    s = { ...s, board, turn: 'you' }
    const after = Q.applyMove(s, { cell: idx(2, 0), dir: 'left' })
    // taking the blank left cube and inserting X at the right edge keeps row 2 all X → win
    expect(after.board.slice(idx(2, 0), idx(2, 0) + 5).every(v => v === 1)).toBe(true)
    expect(after.winner).toBe('you')
  })

  it('if a move completes lines for BOTH players, the non-mover wins', () => {
    // Construct a board where the slide forms an X line and an O line simultaneously.
    // Column 0 has O in rows 0..3 (need row4 O). Row 4 has X in cols1..4 (need col0 X).
    // The mover (you) takes (4,0) blank and pushes 'up' along column 0... that would not
    // help. Instead engineer: you take corner (0,0) and push 'down' to complete BOTH.
    // Simpler: directly verify resolveWinner via completedLines on a both-complete board.
    let board = new Array(25).fill(0) as Q.Mark[]
    for (let c = 0; c < 5; c++) board[idx(0, c)] = 1   // X top row
    for (let c = 0; c < 5; c++) board[idx(4, c)] = -1  // O bottom row
    const lines = Q.completedLines(board)
    expect(lines.you).toBe(true)
    expect(lines.ai).toBe(true)
    // Now drive a real move that yields both: mover 'you', so 'ai' should win.
    // Build a state one slide away: take (0,0) of an already-double-complete-ish board.
    // Use row0 X missing col0, row4 O complete, and a column that closes row0 on the push.
    let b2 = new Array(25).fill(0) as Q.Mark[]
    b2[idx(0, 1)] = 1; b2[idx(0, 2)] = 1; b2[idx(0, 3)] = 1; b2[idx(0, 4)] = 1  // row0 needs col0
    for (let c = 0; c < 5; c++) b2[idx(4, c)] = -1                              // row4 all O already
    const s: State = { ...Q.makeGame(), board: b2, turn: 'you' }
    const after = Q.applyMove(s, { cell: idx(0, 0), dir: 'left' })  // completes row0 X; row4 O stays
    expect(after.winner).toBe('ai')   // both complete after your move → AI (non-mover) wins
  })

  it('AI returns a legal move', () => {
    const s: State = { ...Q.makeGame(), turn: 'ai' }
    const m = Q.aiBestMove(s)
    expect(m).not.toBeNull()
    const legal = Q.legalMoves(s)
    expect(legal.some(l => l.cell === (m as Move).cell && l.dir === (m as Move).dir)).toBe(true)
  })

  it('plays full self-play games to a valid terminal state under the guard cap, no throws', () => {
    for (let g = 0; g < 3; g++) {
      let s = Q.makeGame()
      let guard = 0
      while (s.winner == null && guard++ < 500) {
        if (s.turn === 'ai') {
          s = Q.aiTurn(s)
        } else {
          // you: use the same best-move search (treat 'you' as a strong player) so games
          // progress toward a decision rather than wandering.
          const moves = Q.legalMoves(s)
          expect(moves.length).toBeGreaterThan(0)
          // pick a move that maximizes immediate own-line value, else random
          let best = moves[0]
          let bestV = -Infinity
          for (const m of moves) {
            const nb = applyAndScore(s, m)
            if (nb > bestV) { bestV = nb; best = m }
          }
          s = Q.applyMove(s, best)
        }
      }
      expect(s.winner == null).toBe(false)         // a winner was found
      expect(guard).toBeLessThan(500)              // stayed under the cap
      expect(s.winner === 'you' || s.winner === 'ai').toBe(true)
    }
  })
})

// quick own-line greedy score for the human self-play policy
function applyAndScore(s: State, m: Move): number {
  const next = Q.applyMove(s, m)
  const me = 1
  let score = 0
  for (const line of Q.LINES) {
    let mine = 0, theirs = 0
    for (const i of line) { const v = next.board[i]; if (v === me) mine++; else if (v !== 0) theirs++ }
    if (mine > 0 && theirs > 0) continue
    score += mine * mine
  }
  return score
}
