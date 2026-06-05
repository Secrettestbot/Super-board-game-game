import { describe, it, expect } from 'vitest'
import * as KO from './logic'
import type { KonaneState } from './logic'

// Pure logic test: no DOM. Validates the filled-board start, the two opening removals, multi-jump
// captures, and plays several full games (random legal human + the real AI) to a forced winner.

function pick<T>(xs: T[]): T { return xs[(Math.random() * xs.length) | 0] }

// One full legal human turn: opening removal during the opening phase, else a random capturing jump.
function humanMove(s: KonaneState): KonaneState {
  if (s.phase === 'open1' || s.phase === 'open2') {
    const rem = KO.openingRemovals(s, 'b')
    return KO.move(s, 'b', { from: pick(rem), path: [] })
  }
  const moves = KO.legalMoves(s.board, 'b')
  return KO.move(s, 'b', pick(moves))
}

describe('konane logic', () => {
  it('starts full: checkerboard, 32 each, black to open', () => {
    const s = KO.makeGame()
    expect(s.board).toHaveLength(64)
    const { b, w } = KO.counts(s.board)
    expect(b).toBe(32)
    expect(w).toBe(32)
    // checkerboard: (r+c) even => black, odd => white, no holes
    for (let i = 0; i < 64; i++) {
      const [r, c] = KO.rc(i)
      expect(s.board[i]).toBe((r + c) % 2 === 0 ? 'b' : 'w')
    }
    expect(s.turn).toBe('b')
    expect(s.phase).toBe('open1')
    expect(s.winner).toBeNull()
    // opening phase exposes legal removals but NO capturing jumps yet (board is full)
    expect(KO.openingRemovals(s, 'b').length).toBeGreaterThan(0)
    expect(KO.legalMoves(s.board, 'b').length).toBe(0)
  })

  it('after the two opening removals, legal capturing jumps exist', () => {
    let s = KO.makeGame()
    const r1 = KO.openingRemovals(s, 'b')
    expect(r1.length).toBeGreaterThan(0)
    s = KO.move(s, 'b', { from: r1[0], path: [] })
    expect(s.phase).toBe('open2')
    expect(s.turn).toBe('w')
    const r2 = KO.openingRemovals(s, 'w')
    expect(r2.length).toBeGreaterThan(0)
    s = KO.move(s, 'w', { from: r2[0], path: [] })
    expect(s.phase).toBe('play')
    expect(s.turn).toBe('b')
    // exactly two holes now, 31 + 31 stones
    const { b, w } = KO.counts(s.board)
    expect(b + w).toBe(62)
    // and black has at least one capturing jump available
    expect(KO.legalMoves(s.board, 'b').length).toBeGreaterThan(0)
  })

  it('a multi-jump captures multiple stones in a straight line', () => {
    // Hand-build a board with a single black stone able to chain two captures in one line.
    // Layout on row 4: B at c0, enemy w at c1, empty c2, enemy w at c3, empty c4.
    const board: KO.Cell[] = new Array(64).fill(null)
    const r = 4
    board[KO.idx(r, 0)] = 'b'
    board[KO.idx(r, 1)] = 'w'
    board[KO.idx(r, 3)] = 'w'
    // c2 and c4 are empty -> b can jump c0->c2 (cap c1), then c2->c4 (cap c3)
    const moves = KO.legalMoves(board, 'b')
    // find the longest turn from c0
    const long = moves.filter(m => m.from === KO.idx(r, 0)).sort((a, b) => b.path.length - a.path.length)[0]
    expect(long).toBeDefined()
    expect(long.path.length).toBe(2)
    expect(long.path[long.path.length - 1]).toBe(KO.idx(r, 4))

    // apply it via a play-phase state and confirm two whites were removed
    const s: KonaneState = {
      board, turn: 'b', you: 'b', phase: 'play', winner: null, last: [],
      log: [],
    }
    const after = KO.move(s, 'b', long)
    const { b, w } = KO.counts(after.board)
    expect(b).toBe(1)            // the single black stone survives
    expect(w).toBe(0)            // both whites captured
    expect(after.board[KO.idx(r, 4)]).toBe('b')
  })

  it('plays several full games to a forced winner with no throws', () => {
    for (let game = 0; game < 8; game++) {
      let s = KO.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 400) {
        const before = s
        if (s.turn === 'b') s = humanMove(s)
        else s = KO.aiMove(s)
        // every turn must make progress (state object changes) until a winner is set
        expect(s).not.toBe(before)
      }
      expect(s.winner).not.toBeNull()        // someone ran out of captures
      expect(['b', 'w']).toContain(s.winner) // a real winner, never a draw
      // the winner is the side that still had a move when the loser was stranded
      const loser = s.winner === 'b' ? 'w' : 'b'
      expect(KO.legalMoves(s.board, loser as KO.Stone).length).toBe(0)
    }
  })
})
