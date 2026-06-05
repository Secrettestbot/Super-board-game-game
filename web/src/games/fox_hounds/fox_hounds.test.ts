import { describe, it, expect } from 'vitest'
import * as FH from './logic'
import type { FHState } from './logic'

// Pure logic test (no DOM). Verifies the start position, the asymmetric move rules
// (hounds forward-only, fox any diagonal), both win conditions, and that full games
// against the real minimax AI always terminate without throwing.

const { idx, rowOf, isDark } = FH

describe('fox-and-hounds logic', () => {
  it('starts valid: 4 hounds + 1 fox on dark squares, correct rows, you/fox to move', () => {
    const s = FH.makeGame()
    expect(s.hounds).toHaveLength(4)
    expect(isDark(s.fox)).toBe(true)
    expect(s.hounds.every(isDark)).toBe(true)
    // hounds share one back row (row 0); fox on the opposite back row (row 7)
    expect(s.hounds.every(h => rowOf(h) === 0)).toBe(true)
    expect(rowOf(s.fox)).toBe(FH.N - 1)
    // no overlaps
    expect(new Set([s.fox, ...s.hounds]).size).toBe(5)
    expect(s.you).toBe('fox')
    expect(s.turn).toBe('fox')
    expect(s.winner).toBeNull()
  })

  it('hounds move forward-diagonal only; the fox moves along any diagonal', () => {
    // a hound mid-board with both forward squares open
    const occ = new Set<number>()
    const hound = idx(3, 3)
    const hMoves = FH.houndMoves(hound, occ)
    expect(hMoves.length).toBe(2)
    // every hound destination is strictly forward (a higher row index)
    expect(hMoves.every(t => rowOf(t) === rowOf(hound) + 1)).toBe(true)

    // a fox mid-board reaches all four diagonals — both forward and backward rows
    const fox = idx(4, 3) // a dark mid-board square
    const fMoves = FH.foxMoves(fox, occ)
    expect(fMoves.length).toBe(4)
    expect(fMoves.some(t => rowOf(t) === rowOf(fox) + 1)).toBe(true) // forward
    expect(fMoves.some(t => rowOf(t) === rowOf(fox) - 1)).toBe(true) // backward
    expect(fMoves.every(isDark)).toBe(true)
  })

  it('the fox reaching the hounds’ back row (row 0) is a fox win', () => {
    // fox one step from breaking through; hounds parked out of the way
    const s: FHState = {
      fox: idx(1, 2), hounds: [idx(0, 5), idx(0, 7), idx(2, 5), idx(2, 7)],
      turn: 'fox', you: 'fox', winner: null, last: null, log: [],
    }
    const to = idx(0, 1) // diagonal-forward into row 0, empty + dark
    expect(FH.foxMoves(s.fox, new Set([s.fox, ...s.hounds])).includes(to)).toBe(true)
    const ns = FH.moveFox(s, to)
    expect(rowOf(ns.fox)).toBe(0)
    expect(ns.winner).toBe('fox')
    expect(ns.turn).toBeNull()
  })

  it('a hound move that leaves the fox with no escape is a hound win', () => {
    // fox cornered at (7,0); its only neighbour is (6,1). A hound at (5,0) steps to (6,1) -> trap.
    const s: FHState = {
      fox: idx(7, 0), hounds: [idx(5, 0), idx(0, 3), idx(0, 5), idx(0, 7)],
      turn: 'hound', you: 'fox', winner: null, last: null, log: [],
    }
    const ns = FH.moveHound(s, 0, idx(6, 1))
    expect(ns.hounds).toContain(idx(6, 1))
    expect(FH.foxMoves(ns.fox, new Set([ns.fox, ...ns.hounds]))).toHaveLength(0)
    expect(ns.winner).toBe('hound')
    expect(ns.turn).toBeNull()
  })

  it('plays several full games (random fox vs minimax hounds) to a winner without throwing', () => {
    for (let game = 0; game < 8; game++) {
      let s = FH.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 400) {
        if (s.turn === 'fox') {
          const moves = FH.legalMoves({ fox: s.fox, hounds: s.hounds }, 'fox')
          if (!moves.length) break // safety; trap is normally caught in moveHound
          s = FH.moveFox(s, moves[(Math.random() * moves.length) | 0])
        } else {
          s = FH.aiMove(s)
        }
      }
      expect(s.winner).not.toBeNull()       // always terminates in a result
      expect(['fox', 'hound']).toContain(s.winner) // and it's one of the two sides
      expect(s.turn).toBeNull()
    }
  })
})
