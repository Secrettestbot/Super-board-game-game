import { describe, it, expect } from 'vitest'
import * as KM from './logic'
import type { KState, Player } from './logic'

// Pure logic test: no DOM. Verifies the colour-chain rule, move generation, the
// win condition, and that full games against the real AI terminate without throwing.

const N = KM.N
const r = (i: number) => Math.floor(i / N)
const c = (i: number) => i % N

describe('kamisado logic', () => {
  it('starts with 8 towers each on the home rows, on their own colour cells, first move free', () => {
    const s = KM.makeGame()
    expect(s.board).toHaveLength(64)
    expect(s.turn).toBe('you')
    expect(s.required).toBeNull()
    expect(s.winner).toBeNull()

    const colors: Record<Player, Set<number>> = { you: new Set(), ai: new Set() }
    let youCount = 0, aiCount = 0
    for (let i = 0; i < 64; i++) {
      const t = s.board[i]
      if (!t) continue
      // each tower sits on a cell whose colour equals the tower's colour
      expect(KM.cellColor(i)).toBe(t.color)
      if (t.owner === 'you') { youCount++; colors.you.add(t.color); expect(r(i)).toBe(N - 1) }
      else { aiCount++; colors.ai.add(t.color); expect(r(i)).toBe(0) }
    }
    expect(youCount).toBe(8)
    expect(aiCount).toBe(8)
    // one of each colour 0..7 per side
    expect([...colors.you].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect([...colors.ai].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('after a move, the required colour for the opponent equals the colour of the landed cell', () => {
    const s = KM.makeGame()
    const moves = KM.legalMoves(s, 'you')
    expect(moves.length).toBeGreaterThan(0)
    // pick a move that does not immediately win or trigger a pass-back
    const m = moves[0]
    const n = KM.move(s, m.from, m.to)
    if (!n.winner) {
      // turn passed to the rival (or, on a pass, back to you) but the required colour
      // must equal the landed cell colour in either case
      expect(n.required).toBe(KM.cellColor(m.to))
    }
  })

  it('move generation is forward-only (straight or diagonal), no sideways/backward, no jumping', () => {
    const s = KM.makeGame()
    // a 'you' tower moves UP (decreasing row); pick a back-row tower with open space
    const from = KM.findTower(s.board, 'you', 4)
    expect(from).toBeGreaterThanOrEqual(0)
    const dests = KM.movesFor(s.board, from)
    expect(dests.length).toBeGreaterThan(0)
    for (const d of dests) {
      expect(r(d)).toBeLessThan(r(from))                   // forward (up) only
      const dr = r(from) - r(d), dc = Math.abs(c(d) - c(from))
      expect(dc === 0 || dc === dr).toBe(true)              // straight or true diagonal
    }
    // no jumping: placing a blocker stops the ray
    const board = s.board.slice()
    const blockAt = KM.idx(r(from) - 2, c(from))
    board[blockAt] = { owner: 'ai', color: 0 }
    const blocked = KM.movesFor(board, from)
    expect(blocked.every(d => r(d) > r(blockAt) || c(d) !== c(from))).toBe(true)
    // straight-forward cells beyond the blocker are unreachable
    expect(blocked.includes(KM.idx(r(from) - 3, c(from)))).toBe(false)
  })

  it('reaching the far row sets a win', () => {
    // Build a near-win: a 'you' tower one diagonal step from the goal row, clear path.
    let s = KM.makeGame()
    const board = new Array(64).fill(null)
    // put a single you tower at row 1; goal row for you is 0
    const start = KM.idx(1, 3)
    board[start] = { owner: 'you', color: KM.cellColor(start) }
    // give the ai a token tower somewhere harmless
    board[KM.idx(0, 7)] = { owner: 'ai', color: KM.cellColor(KM.idx(0, 7)) }
    s = Object.assign({}, s, { board, turn: 'you', required: null })
    const dests = KM.movesFor(s.board, start).filter(d => r(d) === 0)
    expect(dests.length).toBeGreaterThan(0)
    const n = KM.move(s, start, dests[0])
    expect(n.winner).toBe('you')
  })

  it('plays several full games to a winner with a cap — terminates, no throws', () => {
    for (let game = 0; game < 8; game++) {
      let s: KState = KM.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 400) {
          if (s.turn === 'you') {
            const moves = KM.legalMoves(s, 'you')
            if (!moves.length) {
              // No legal move for 'you' should not occur as a settled turn (passes are
              // resolved inside move()); if it does, bail to avoid an infinite loop.
              break
            }
            const m = moves[(Math.random() * moves.length) | 0]
            s = KM.move(s, m.from, m.to)
          } else {
            const before = s
            s = KM.aiMove(s)
            // guard against a no-op (AI with nothing to do) to ensure progress
            if (s === before) break
          }
        }
      }).not.toThrow()
      expect(guard).toBeLessThan(400)            // terminated under the cap
      expect(s.winner).not.toBeNull()            // reached a decisive result
    }
  })
})
