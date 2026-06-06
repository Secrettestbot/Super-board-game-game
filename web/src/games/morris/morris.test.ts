import { describe, it, expect } from 'vitest'
import * as MM from './logic'
import type { MorrisState, Color } from './logic'

// Pure logic test, no DOM. Validates the initial state, mill detection on a constructed line,
// and plays several full games (random legal human, real AI) to a winner with a hard cap —
// asserting termination, no throws, and the never-more-than-nine-per-side invariant.

function totals(s: MorrisState) {
  let w = 0, b = 0
  for (const v of s.board) { if (v === 'w') w++; else if (v === 'b') b++ }
  return { wBoard: w, bBoard: b, wAll: w + s.hand.w, bAll: b + s.hand.b }
}

// one full RANDOM-LEGAL human turn for the side to move (place/slide + a random legal removal).
function randomTurn(s: MorrisState, who: Color): MorrisState {
  if (s.phase === 'place') {
    const open = s.board.map((c, i) => (c ? -1 : i)).filter(i => i >= 0)
    s = MM.place(s, open[(Math.random() * open.length) | 0], who)
  } else if (s.phase === 'move') {
    const slides = MM.legalSlides(s.board, who)
    const [from, to] = slides[(Math.random() * slides.length) | 0]
    s = MM.slide(s, from, to, who)
  }
  // resolve a removal if the move opened a mill (still our turn, phase 'remove')
  if (!s.winner && s.turn === who && s.phase === 'remove') {
    const rem = MM.removable(s.board, who === 'w' ? 'b' : 'w')
    s = MM.remove(s, rem[(Math.random() * rem.length) | 0], who)
  }
  return s
}

describe("nine men's morris logic", () => {
  it('starts on a valid empty board: 24 points, 9 men each in hand, placing, you to move', () => {
    const s = MM.makeGame()
    expect(s.board).toHaveLength(MM.POINTS)
    expect(MM.POINTS).toBe(24)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.hand.w).toBe(9)
    expect(s.hand.b).toBe(9)
    expect(s.onBoard.w).toBe(0)
    expect(s.onBoard.b).toBe(0)
    expect(s.phase).toBe('place')
    expect(s.turn).toBe('w')
    expect(s.you).toBe('w')
    expect(s.winner).toBeNull()
  })

  it('has 16 mills and 24 layout/adjacency entries', () => {
    expect(MM.MILLS).toHaveLength(16)
    expect(MM.LAYOUT).toHaveLength(24)
    expect(MM.ADJ).toHaveLength(24)
    // adjacency is symmetric and diagonal-free (every neighbour shares a row or column on the grid)
    MM.ADJ.forEach((nbrs, a) => nbrs.forEach(b => {
      expect(MM.ADJ[b]).toContain(a)
      const [ax, ay] = MM.LAYOUT[a], [bx, by] = MM.LAYOUT[b]
      expect(ax === bx || ay === by).toBe(true)
    }))
  })

  it('detects a mill on a constructed line and finds removable rival men', () => {
    const board: MM.Cell[] = new Array(24).fill(null)
    const [a, b, c] = MM.MILLS[0]
    board[a] = 'w'; board[b] = 'w'
    expect(MM.millsClosedBy(board, c, 'w')).toHaveLength(0) // not yet complete
    board[c] = 'w'
    expect(MM.millsClosedBy(board, c, 'w').length).toBeGreaterThan(0)
    // a lone rival man (not in a mill) is removable
    board[5] = 'b'
    expect(MM.removable(board, 'b')).toContain(5)
  })

  it('plays several full games to a winner without throwing, men/side never exceed 9', () => {
    for (let game = 0; game < 12; game++) {
      let s = MM.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 600) {
        const t = totals(s)
        expect(t.wAll).toBeLessThanOrEqual(9)
        expect(t.bAll).toBeLessThanOrEqual(9)
        if (s.turn === 'w') s = randomTurn(s, 'w')
        else s = MM.aiMove(s, 3)   // modest depth for speed
      }
      expect(s.winner).not.toBeNull()                 // always terminates with a winner
      expect(['w', 'b']).toContain(s.winner)
      const t = totals(s)
      expect(t.wAll).toBeLessThanOrEqual(9)
      expect(t.bAll).toBeLessThanOrEqual(9)
      // the loser is reduced to two men or stalemated; either way one side never has < 0
      expect(t.wBoard).toBeGreaterThanOrEqual(0)
      expect(t.bBoard).toBeGreaterThanOrEqual(0)
    }
  })
})
