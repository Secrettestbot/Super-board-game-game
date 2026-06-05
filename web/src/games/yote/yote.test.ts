import { describe, it, expect } from 'vitest'
import * as YT from './logic'
import type { YoteState } from './logic'

// Pure logic test: no DOM. Verifies the core rules and plays several full games
// (random legal human play incl. random extra-removal on capture, AI via aiMove)
// to a winner under a cap, asserting termination + piece-conservation invariants.

function totals(s: YoteState) {
  return {
    d: YT.onBoard(s.board, 'd') + s.hand.d,
    l: YT.onBoard(s.board, 'l') + s.hand.l,
  }
}

describe('yote logic', () => {
  it('starts valid: empty 30-cell board, 12 in hand each, you to move', () => {
    const s = YT.makeGame()
    expect(s.board).toHaveLength(30)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.hand.d).toBe(12)
    expect(s.hand.l).toBe(12)
    expect(s.turn).toBe('d')
    expect(s.you).toBe('d')
    expect(s.winner).toBeNull()
  })

  it('a drop reduces the hand by 1 and fills a cell', () => {
    const s0 = YT.makeGame()
    const s1 = YT.drop(s0, YT.idx(2, 3), 'd')
    expect(s1.board[YT.idx(2, 3)]).toBe('d')
    expect(s1.hand.d).toBe(11)
    expect(s1.turn).toBe('l')            // turn passed
    expect(YT.onBoard(s1.board, 'd')).toBe(1)
  })

  it('a drop on an occupied cell or with the wrong colour is rejected', () => {
    const s0 = YT.makeGame()
    const s1 = YT.drop(s0, YT.idx(2, 3), 'd')
    expect(YT.drop(s1, YT.idx(2, 3), 'l')).toBe(s1)   // occupied -> no-op (same ref)
    expect(YT.drop(s1, YT.idx(0, 0), 'd')).toBe(s1)   // not d's turn -> no-op
  })

  it('a capture jump removes the jumped enemy AND one extra enemy (2 removed total)', () => {
    // Build a position by hand: d at (2,1), l at (2,2) [jumped], l at (0,0) [extra],
    // landing cell (2,3) empty. It's d's turn.
    let s = YT.makeGame()
    const dFrom = YT.idx(2, 1), enemyMid = YT.idx(2, 2), extra = YT.idx(0, 0)
    s = Object.assign({}, s, {
      board: (() => { const b = new Array(30).fill(null); b[dFrom] = 'd'; b[enemyMid] = 'l'; b[extra] = 'l'; return b })(),
      hand: { d: 0, l: 0 },
      turn: 'd',
    }) as YoteState

    const caps = YT.capturesFrom(s.board, dFrom, 'd')
    expect(caps).toHaveLength(1)
    const cap = caps[0]
    expect(cap.to).toBe(YT.idx(2, 3))

    const before = YT.onBoard(s.board, 'l')   // 2 light seeds
    const after = YT.capture(s, cap, extra, 'd')
    expect(after.board[cap.from]).toBeNull()      // mover left
    expect(after.board[cap.to]).toBe('d')         // mover landed
    expect(after.board[enemyMid]).toBeNull()      // jumped enemy gone
    expect(after.board[extra]).toBeNull()         // bonus enemy gone
    expect(YT.onBoard(after.board, 'l')).toBe(before - 2)  // exactly two removed
    // with no enemies and no enemy hand, d wins
    expect(after.winner).toBe('d')
  })

  it('capture falls back to an automatic bonus pick when extra is null', () => {
    let s = YT.makeGame()
    const dFrom = YT.idx(2, 1), enemyMid = YT.idx(2, 2), extra = YT.idx(4, 5)
    s = Object.assign({}, s, {
      board: (() => { const b = new Array(30).fill(null); b[dFrom] = 'd'; b[enemyMid] = 'l'; b[extra] = 'l'; return b })(),
      hand: { d: 0, l: 0 }, turn: 'd',
    }) as YoteState
    const cap = YT.capturesFrom(s.board, dFrom, 'd')[0]
    const after = YT.capture(s, cap, null, 'd')   // null -> auto-pick remaining enemy
    expect(YT.onBoard(after.board, 'l')).toBe(0)
  })

  it('plays several full games to a winner with a cap — terminates, never throws, conserves pieces', () => {
    for (let game = 0; game < 12; game++) {
      let s = YT.makeGame()
      let guard = 0
      const CAP = 4000
      expect(() => {
        while (!s.winner && guard++ < CAP) {
          if (s.turn === 'd') {
            s = randomHumanAction(s)
          } else {
            s = YT.aiMove(s)
          }
          // invariant after every ply: neither colour ever exceeds 12 total
          const t = totals(s)
          expect(t.d).toBeLessThanOrEqual(12)
          expect(t.l).toBeLessThanOrEqual(12)
          expect(t.d).toBeGreaterThanOrEqual(0)
          expect(t.l).toBeGreaterThanOrEqual(0)
          // board occupancy invariant
          expect(YT.onBoard(s.board, 'd')).toBeLessThanOrEqual(12)
          expect(YT.onBoard(s.board, 'l')).toBeLessThanOrEqual(12)
        }
      }).not.toThrow()
      expect(s.winner).not.toBeNull()       // always terminates within the cap
      expect(guard).toBeLessThan(CAP)
    }
  })
})

// pick a uniformly-random legal action for d (human side), including a random
// extra-removal when capturing.
function randomHumanAction(s: YoteState): YoteState {
  const who = 'd' as const
  type A = { kind: 'cap'; cap: YT.Capture } | { kind: 'move'; from: number; to: number } | { kind: 'drop'; to: number }
  const actions: A[] = []
  for (const cap of YT.allCaptures(s.board, who)) actions.push({ kind: 'cap', cap })
  for (let i = 0; i < YT.N; i++) if (s.board[i] === who) for (const to of YT.stepsFrom(s.board, i, who)) actions.push({ kind: 'move', from: i, to })
  if (s.hand[who] > 0) for (const to of YT.emptyCells(s.board)) actions.push({ kind: 'drop', to })
  if (!actions.length) return s   // no action -> AI win will be detected on its side
  const a = actions[(Math.random() * actions.length) | 0]
  if (a.kind === 'drop') return YT.drop(s, a.to, who)
  if (a.kind === 'move') return YT.move(s, a.from, a.to, who)
  // capture: simulate the jump, then pick a random removable enemy
  const b = s.board.slice(); b[a.cap.to] = who; b[a.cap.from] = null; b[a.cap.mid] = null
  const rem = YT.removableEnemies(b, who)
  const extra = rem.length ? rem[(Math.random() * rem.length) | 0] : null
  return YT.capture(s, a.cap, extra, who)
}
