import { describe, it, expect } from 'vitest'
import * as AB from './logic'
import type { AbaloneState, Cell, Key } from './logic'

// Pure logic tests: no DOM. Builds specific positions for in-line / sumito / illegal moves,
// then plays several full games (random legal human vs the real AI) and asserts safety +
// monotonic captures + (ideally) a winner within a ply cap.

const { key } = AB

function emptyBoard(): Record<Key, Cell> {
  const b: Record<Key, Cell> = {}
  for (const { q, r } of AB.allCells()) b[key(q, r)] = null
  return b
}

function blank(turn: 'b' | 'w' = 'b'): AbaloneState {
  return {
    board: emptyBoard(), turn, you: 'b', winner: null,
    off: { b: 0, w: 0 }, last: [], log: [],
  }
}

describe('abalone logic', () => {
  it('starts valid: 14 marbles each, none off, you (Black) to move', () => {
    const s = AB.makeGame()
    expect(Object.keys(s.board)).toHaveLength(61)
    const { b, w } = AB.count(s.board)
    expect(b).toBe(14)
    expect(w).toBe(14)
    expect(s.off).toEqual({ b: 0, w: 0 })
    expect(s.turn).toBe('b')
    expect(s.you).toBe('b')
    expect(s.winner).toBeNull()
  })

  it('a basic in-line move into empty space works', () => {
    const s = blank('b')
    s.board[key(0, 0)] = 'b'
    s.board[key(1, 0)] = 'b'   // pair along E axis, ahead (2,0) empty
    const ns = AB.applyMove(s, [key(0, 0), key(1, 0)], 0 /* E */, 'b')
    expect(ns.board[key(0, 0)]).toBeNull()       // tail vacated
    expect(ns.board[key(1, 0)]).toBe('b')        // middle still occupied
    expect(ns.board[key(2, 0)]).toBe('b')        // front advanced
    expect(ns.off).toEqual({ b: 0, w: 0 })
    expect(ns.turn).toBe('w')                    // handed to rival
  })

  it('a sumito (2-push-1) at the rim ejects an enemy marble and increments the count', () => {
    const s = blank('b')
    // Black pair (2,0),(3,0) pushes E into White at (4,0); behind it (5,0) is OFF-board.
    s.board[key(2, 0)] = 'b'
    s.board[key(3, 0)] = 'b'
    s.board[key(4, 0)] = 'w'
    const ns = AB.applyMove(s, [key(2, 0), key(3, 0)], 0 /* E */, 'b')
    expect(ns.board[key(2, 0)]).toBeNull()
    expect(ns.board[key(3, 0)]).toBe('b')
    expect(ns.board[key(4, 0)]).toBe('b')        // our front took the enemy's old cup
    expect(ns.off.w).toBe(1)                     // a White marble was driven off
    expect(ns.off.b).toBe(0)
    const { w } = AB.count(ns.board)
    expect(w).toBe(0)                            // the only White marble is gone
  })

  it('rejects an illegal push of an equal-length line (2 vs 2)', () => {
    const s = blank('b')
    s.board[key(0, 0)] = 'b'
    s.board[key(1, 0)] = 'b'
    s.board[key(2, 0)] = 'w'
    s.board[key(3, 0)] = 'w'   // 2 black vs 2 white -> cannot push
    const before = JSON.stringify(s.board)
    const ns = AB.tryMove(s.board, [key(0, 0), key(1, 0)], 0 /* E */, 'b')
    expect(ns).toBeNull()
    // applyMove leaves state untouched on an illegal move
    const ns2 = AB.applyMove(s, [key(0, 0), key(1, 0)], 0, 'b')
    expect(JSON.stringify(ns2.board)).toBe(before)
    expect(ns2.off).toEqual({ b: 0, w: 0 })
  })

  it('rejects pushing a longer line and one backed by your own marble', () => {
    // single vs single backed by enemy -> equal/longer, illegal
    const s = blank('b')
    s.board[key(0, 0)] = 'b'
    s.board[key(1, 0)] = 'w'
    s.board[key(2, 0)] = 'w'   // 1 vs 2 -> illegal
    expect(AB.tryMove(s.board, [key(0, 0)], 0, 'b')).toBeNull()

    // 2 vs 1 but cell behind enemy holds your own marble -> blocked
    const s2 = blank('b')
    s2.board[key(0, 0)] = 'b'
    s2.board[key(1, 0)] = 'b'
    s2.board[key(2, 0)] = 'w'
    s2.board[key(3, 0)] = 'b'  // own marble behind enemy
    expect(AB.tryMove(s2.board, [key(0, 0), key(1, 0)], 0, 'b')).toBeNull()
  })

  it('plays several full games (human via move generator vs AI) — safe, monotonic captures, a winner appears', () => {
    let anyWinner = false
    const CAP = 400
    for (let game = 0; game < 5; game++) {
      let s = AB.makeGame()
      let ply = 0
      let prevOffB = 0, prevOffW = 0
      while (!s.winner && ply++ < CAP) {
        expect(s.off.b).toBeGreaterThanOrEqual(prevOffB)   // captures never decrease
        expect(s.off.w).toBeGreaterThanOrEqual(prevOffW)
        prevOffB = s.off.b; prevOffW = s.off.w
        if (s.turn === 'b') {
          const moves = AB.legalMoves(s.board, 'b')
          expect(moves.length).toBeGreaterThan(0)          // always has a move
          // Human: pick a legal move from the generator — prefer captures so games converge,
          // else random. Still strictly a legal move produced by legalMoves().
          const caps = moves.filter(m => (AB.tryMove(s.board, m.cells, m.dir, 'b')!).pushedOff > 0)
          const pool = caps.length ? caps : moves
          const m = pool[(Math.random() * pool.length) | 0]
          const ns = AB.applyMove(s, m.cells, m.dir, 'b')
          expect(ns).not.toBe(s)                            // a legal move always applies
          s = ns
        } else {
          s = AB.aiMove(s, 2)                               // real alpha-beta opponent
        }
        // invariant: marbles on board + marbles off is conserved at 28
        const { b, w } = AB.count(s.board)
        expect(b + w + s.off.b + s.off.w).toBe(28)
        expect(s.off.b).toBeLessThanOrEqual(AB.WIN_OFF)
        expect(s.off.w).toBeLessThanOrEqual(AB.WIN_OFF)
      }
      if (s.winner) {
        anyWinner = true
        expect(['b', 'w']).toContain(s.winner)
        expect(s.off.b >= AB.WIN_OFF || s.off.w >= AB.WIN_OFF).toBe(true)
      }
    }
    // across these games at least one reaches six ejections within the cap
    expect(anyWinner).toBe(true)
  }, 60000)
})
