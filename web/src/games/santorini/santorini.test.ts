import { describe, it, expect } from 'vitest'
import * as ST from './logic'
import type { SantoriniState, Side } from './logic'

// Pure logic test (no DOM). Verifies setup, move legality (≤+1 climb, dome/occupancy),
// building / dome capping, the level-3 win, and plays several full games to completion.

const idx = ST.idx

describe('santorini logic', () => {
  it('starts valid — 4 workers placed, all levels 0, you to move', () => {
    const s = ST.makeGame()
    expect(s.levels).toHaveLength(25)
    expect(s.levels.every(l => l === 0)).toBe(true)
    expect(s.workers).toHaveLength(4)
    expect(s.workers.filter(w => w.side === 'you')).toHaveLength(2)
    expect(s.workers.filter(w => w.side === 'ai')).toHaveLength(2)
    // distinct cells
    const cells = new Set(s.workers.map(w => w.pos))
    expect(cells.size).toBe(4)
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
  })

  it('move legality respects ≤+1 climb and dome/occupancy', () => {
    // construct an isolated worker at center, control its neighbours
    const s = ST.makeGame()
    const c = idx(2, 2)
    // put one your-worker alone in the middle of an empty board
    s.workers = [{ side: 'you', pos: c }, { side: 'you', pos: idx(0, 0) }, { side: 'ai', pos: idx(0, 4) }, { side: 'ai', pos: idx(4, 4) }]
    s.levels = new Array(25).fill(0)
    s.levels[idx(1, 2)] = 1   // up by 1 — OK
    s.levels[idx(3, 2)] = 2   // up by 2 — illegal
    s.levels[idx(2, 1)] = 4   // dome — illegal
    s.levels[idx(2, 3)] = 0   // flat — OK
    const wi = s.workers.findIndex(w => w.pos === c)
    const moves = new Set(ST.legalMoves(s, wi))
    expect(moves.has(idx(1, 2))).toBe(true)    // +1
    expect(moves.has(idx(2, 3))).toBe(true)    // flat
    expect(moves.has(idx(3, 2))).toBe(false)   // +2 too high
    expect(moves.has(idx(2, 1))).toBe(false)   // dome
    expect(moves.has(idx(0, 0))).toBe(false)   // occupied by own worker
    // step down is always allowed
    s.levels[c] = 3
    const moves2 = new Set(ST.legalMoves(s, wi))
    expect(moves2.has(idx(2, 3))).toBe(true)   // 3 -> 0 step down
  })

  it('building raises a cell and level 3 → dome blocks entry', () => {
    let s = ST.makeGame()
    s.workers = [{ side: 'you', pos: idx(2, 2) }, { side: 'you', pos: idx(0, 0) }, { side: 'ai', pos: idx(4, 4) }, { side: 'ai', pos: idx(4, 0) }]
    s.levels = new Array(25).fill(0)
    const wi = s.workers.findIndex(w => w.pos === idx(2, 2))
    // move to a flat neighbour and build on idx(2,2)'s old cell-area neighbour
    const before = s.levels[idx(1, 3)] // build target adjacent to the moved worker at (2,3)
    s = ST.applyTurn(s, wi, idx(2, 3), idx(1, 3), 'you')
    expect(s.levels[idx(1, 3)]).toBe(before + 1)

    // raise a cell to 3 then to a dome and confirm it's impassable
    let t = ST.makeGame()
    t.workers = [{ side: 'you', pos: idx(2, 2) }, { side: 'you', pos: idx(0, 0) }, { side: 'ai', pos: idx(4, 4) }, { side: 'ai', pos: idx(4, 0) }]
    t.levels = new Array(25).fill(0)
    t.levels[idx(2, 3)] = 3
    const twi = t.workers.findIndex(w => w.pos === idx(2, 2))
    // move to a neighbour of the level-3 cell, then build on it -> dome
    const t2 = ST.applyTurn(t, twi, idx(1, 3), idx(2, 3), 'you')
    expect(t2.levels[idx(2, 3)]).toBe(4)
    // now a dome is not a legal move target
    const movesFromNew = new Set(ST.legalMoves(t2, t2.workers.findIndex(w => w.pos === idx(1, 3))))
    expect([...movesFromNew].every(m => t2.levels[m] < 4)).toBe(true)
  })

  it('moving a worker onto a level-3 cell sets the winner', () => {
    let s = ST.makeGame()
    s.workers = [{ side: 'you', pos: idx(2, 2) }, { side: 'you', pos: idx(0, 0) }, { side: 'ai', pos: idx(4, 4) }, { side: 'ai', pos: idx(4, 0) }]
    s.levels = new Array(25).fill(0)
    s.levels[idx(2, 2)] = 2     // standing at 2
    s.levels[idx(2, 3)] = 3     // adjacent winning roof (+1)
    const wi = s.workers.findIndex(w => w.pos === idx(2, 2))
    expect(ST.legalMoves(s, wi)).toContain(idx(2, 3))
    s = ST.applyTurn(s, wi, idx(2, 3), -1, 'you')
    expect(s.winner).toBe('you')
    expect(s.turn).toBeNull()
  })

  it('plays several full games to a winner with a cap — terminates, no throws', () => {
    for (let game = 0; game < 12; game++) {
      let s: SantoriniState = ST.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < 400) {
          if (s.turn === 'you') {
            // pick a random legal worker + move + build
            const wis = ST.workerIndices(s, 'you').filter(wi => ST.legalMoves(s, wi).length)
            if (!wis.length) break  // hasLegalTurn would have ended it, but be safe
            const wi = wis[(Math.random() * wis.length) | 0]
            const moves = ST.legalMoves(s, wi)
            const to = moves[(Math.random() * moves.length) | 0]
            if (s.levels[to] === 3) {
              s = ST.applyTurn(s, wi, to, -1, 'you')
            } else {
              const workers = s.workers.map((x, k) => k === wi ? { side: x.side, pos: to } : x)
              const builds = ST.legalBuilds(s.levels, workers, to)
              const b = builds[(Math.random() * builds.length) | 0]
              s = ST.applyTurn(s, wi, to, b, 'you')
            }
          } else {
            s = ST.aiMove(s)
          }
        }
      }).not.toThrow()

      expect(s.winner).not.toBeNull()           // always terminates with a winner
      expect(guard).toBeLessThan(400)

      // The winner either stood on a level-3 roof or the loser had no legal turn.
      const winner = s.winner as Side
      const loser: Side = winner === 'you' ? 'ai' : 'you'
      const reachedRoof = s.workers.some(w => w.side === winner && s.levels[w.pos] === 3)
      const loserTrapped = !ST.hasLegalTurn(Object.assign({}, s, { turn: loser, winner: null }), loser)
      expect(reachedRoof || loserTrapped).toBe(true)
    }
  })
})
