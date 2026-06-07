import { describe, it, expect } from 'vitest'
import * as TTT from './logic'

// Reference logic test: pure, no DOM. Plays full games against the real AI and asserts
// invariants. `npm test` runs this and every other game's test in parallel.

describe('tic-tac-toe logic', () => {
  it('starts on a valid empty board, X to move', () => {
    const s = TTT.makeGame()
    expect(s.board).toHaveLength(9)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.turn).toBe('x')
    expect(s.winner).toBeNull()
  })

  it('detects a row win', () => {
    let s = TTT.makeGame()
    // X: 0,1,2 ; O: 3,4 — force the line by placing as the side to move
    s = TTT.place(s, 0, 'x'); s = TTT.place(s, 3, 'o')
    s = TTT.place(s, 1, 'x'); s = TTT.place(s, 4, 'o')
    s = TTT.place(s, 2, 'x')
    expect(s.winner).toBe('x')
    expect(s.line).toEqual([0, 1, 2])
  })

  it('a perfect AI is never beaten — random human play ends in a draw or AI win, never a human win', () => {
    for (let game = 0; game < 25; game++) {
      let s = TTT.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 20) {
        if (s.turn === 'x') {
          const open = s.board.map((c, i) => (c ? -1 : i)).filter(i => i >= 0)
          s = TTT.place(s, open[(Math.random() * open.length) | 0], 'x')
        } else {
          s = TTT.aiMove(s)
        }
      }
      expect(s.winner).not.toBeNull()       // always terminates
      expect(s.winner).not.toBe('x')        // a perfect O is never beaten
    }
  })
})
