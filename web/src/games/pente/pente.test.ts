import { describe, it, expect } from 'vitest'
import * as PT from './logic'
import type { PenteState, Stone } from './logic'

// Pure logic test (no DOM). Verifies the win conditions and the signature custodial capture,
// then plays several full games to a terminal state with no throws. `npm test` runs this in
// parallel with every other game's test.

const N = PT.N
const at = (r: number, c: number) => r * N + c

// Build a state with a forced board and turn, bypassing the normal move flow.
function withBoard(cells: Array<[number, number, Stone]>, turn: Stone = 'b'): PenteState {
  const s = PT.makeGame()
  const board = s.board.slice()
  for (const [r, c, who] of cells) board[at(r, c)] = who
  return Object.assign({}, s, { board, turn })
}

describe('pente logic', () => {
  it('starts on a valid empty board, no captures, a player to move', () => {
    const s = PT.makeGame()
    expect(s.board).toHaveLength(N * N)
    expect(s.board.every(c => c === null)).toBe(true)
    expect(s.pairs).toEqual({ b: 0, w: 0 })
    expect(s.turn).toBe('b')
    expect(s.winner).toBeNull()
  })

  it('detects a five-in-a-row win', () => {
    // black has B at (6,3..6); play (6,7) to complete five horizontally
    const s = withBoard([
      [6, 3, 'b'], [6, 4, 'b'], [6, 5, 'b'], [6, 6, 'b'],
    ], 'b')
    const r = PT.place(s, at(6, 7), 'b')
    expect(r.winner).toBe('b')
    expect(r.win).not.toBeNull()
    expect(r.win!.length).toBe(5)
  })

  it('captures exactly a flanked PAIR and increments the captor count', () => {
    // YOU(b) at (6,2) already; OPP(w) at (6,3),(6,4); play YOU(b) at (6,5): b - w w - b
    const s = withBoard([
      [6, 2, 'b'], [6, 3, 'w'], [6, 4, 'w'],
    ], 'b')
    const r = PT.place(s, at(6, 5), 'b')
    expect(r.pairs.b).toBe(1)
    expect(r.board[at(6, 3)]).toBeNull()
    expect(r.board[at(6, 4)]).toBeNull()
    expect(r.board[at(6, 5)]).toBe('b')
    expect(r.captured.sort()).toEqual([at(6, 3), at(6, 4)].sort())
  })

  it('does NOT capture a single flanked stone (not a pair)', () => {
    // b at (6,2); single w at (6,3); play b at (6,4): b - w - b is only ONE stone, no capture
    const s = withBoard([
      [6, 2, 'b'], [6, 3, 'w'],
    ], 'b')
    const r = PT.place(s, at(6, 4), 'b')
    expect(r.pairs.b).toBe(0)
    expect(r.board[at(6, 3)]).toBe('w')   // survivor remains
  })

  it('does NOT capture THREE flanked stones', () => {
    // b at (6,1); www at (6,2),(6,3),(6,4); play b at (6,5): b-w-w-w-b — three, no capture
    const s = withBoard([
      [6, 1, 'b'], [6, 2, 'w'], [6, 3, 'w'], [6, 4, 'w'],
    ], 'b')
    const r = PT.place(s, at(6, 5), 'b')
    expect(r.pairs.b).toBe(0)
    expect(r.board[at(6, 2)]).toBe('w')
    expect(r.board[at(6, 3)]).toBe('w')
    expect(r.board[at(6, 4)]).toBe('w')
  })

  it('does NOT self-capture when moving INTO a bracket', () => {
    // w at (6,2); single empty (6,3); w at (6,4)... actually test the player moving into
    // OPP-?-YOU: white w at (6,3),(6,4) with black b at (6,5); black plays (6,2) -> b w w b
    // captures (placer completes). Here we verify moving into w-_-w as black does NOT remove black.
    // Layout: w(6,3) b? we place black at (6,4) between two whites w(6,3) w(6,5): w - b - w
    const s = withBoard([
      [6, 3, 'w'], [6, 5, 'w'],
    ], 'b')
    const r = PT.place(s, at(6, 4), 'b')
    expect(r.board[at(6, 4)]).toBe('b')   // black stone survives
    expect(r.pairs.w).toBe(0)             // white scores nothing — black completed the move
  })

  it('captures a diagonal pair', () => {
    // b(4,4); w(5,5),w(6,6); play b(7,7) -> diagonal b w w b
    const s = withBoard([
      [4, 4, 'b'], [5, 5, 'w'], [6, 6, 'w'],
    ], 'b')
    const r = PT.place(s, at(7, 7), 'b')
    expect(r.pairs.b).toBe(1)
    expect(r.board[at(5, 5)]).toBeNull()
    expect(r.board[at(6, 6)]).toBeNull()
  })

  it('reaching five captured pairs wins', () => {
    // pre-set black at four pairs, then make the fifth capture
    let s = withBoard([
      [6, 2, 'b'], [6, 3, 'w'], [6, 4, 'w'],
    ], 'b')
    s = Object.assign({}, s, { pairs: { b: 4, w: 0 } })
    const r = PT.place(s, at(6, 5), 'b')
    expect(r.pairs.b).toBe(5)
    expect(r.winner).toBe('b')
  })

  it('plays several full games to a terminal state without throwing', () => {
    for (let game = 0; game < 8; game++) {
      let s = PT.makeGame()
      let guard = 0
      expect(() => {
        while (!s.winner && guard++ < N * N + 5) {
          if (s.turn === 'b') {
            // human: random empty intersection, biased near existing stones when possible
            const occupied = s.board.some(c => c !== null)
            let pool: number[] = []
            if (occupied) {
              const near = new Set<number>()
              for (let i = 0; i < N * N; i++) {
                if (!s.board[i]) continue
                const r0 = Math.floor(i / N), c0 = i % N
                for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
                  const r = r0 + dr, c = c0 + dc
                  if (r >= 0 && r < N && c >= 0 && c < N && !s.board[at(r, c)]) near.add(at(r, c))
                }
              }
              pool = [...near]
            }
            if (!pool.length) pool = s.board.map((c, i) => (c ? -1 : i)).filter(i => i >= 0)
            if (!pool.length) break
            s = PT.place(s, pool[(Math.random() * pool.length) | 0], 'b')
          } else {
            const before = s
            s = PT.aiMove(s)
            if (s === before) break   // AI had no move (shouldn't happen) — avoid infinite loop
          }
        }
      }).not.toThrow()
      expect(s.winner !== null || guard >= N * N + 5).toBe(true)   // terminated
    }
  })
})
