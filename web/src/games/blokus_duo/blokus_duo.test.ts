import { describe, it, expect } from 'vitest'
import {
  makeGame, PIECES, TOTAL_CELLS, ORIENTS, orientations, normalize,
  isLegal, legalPlacements, place, pass, canPlaceAny, aiTurn, STARTS, N,
} from './logic'
import type { State } from './logic'

describe('blokus duo — pieces & geometry', () => {
  it('has 21 pieces totaling 89 cells', () => {
    expect(PIECES.length).toBe(21)
    expect(TOTAL_CELLS).toBe(89)
    // breakdown: 1 mono, 1 domino, 2 tromino, 5 tetromino, 12 pentomino
    const bySize: Record<number, number> = {}
    for (const p of PIECES) bySize[p.shape.length] = (bySize[p.shape.length] || 0) + 1
    expect(bySize).toEqual({ 1: 1, 2: 1, 3: 2, 4: 5, 5: 12 })
  })

  it('orientations dedupe correctly (square=1, L-tromino=4, X=1, I5=2)', () => {
    const square = normalize([[0, 0], [0, 1], [1, 0], [1, 1]])
    expect(orientations(square).length).toBe(1)
    const lTromino = normalize([[0, 0], [1, 0], [1, 1]])
    expect(orientations(lTromino).length).toBe(4)
    const x = normalize([[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]])
    expect(orientations(x).length).toBe(1)
    const i5 = normalize([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]])
    expect(orientations(i5).length).toBe(2) // horizontal + vertical
  })

  it('every cached orientation set is non-empty and matches its piece size', () => {
    expect(ORIENTS.length).toBe(21)
    for (let i = 0; i < PIECES.length; i++) {
      expect(ORIENTS[i].length).toBeGreaterThan(0)
      for (const o of ORIENTS[i]) expect(o.length).toBe(PIECES[i].shape.length)
    }
  })
})

describe('blokus duo — placement rules', () => {
  it('first placement must cover the start cell', () => {
    const s = makeGame()
    const [sr, sc] = STARTS[0]
    expect(isLegal(s, 0, [[sr, sc]])).toBe(true)   // monomino on start → legal
    expect(isLegal(s, 0, [[0, 0]])).toBe(false)    // away from start → illegal
  })

  it('a later placement must corner-touch own color and must NOT edge-touch own color', () => {
    let s = makeGame()
    const [sr, sc] = STARTS[0] // (4,4)
    s = place(s, 0, 0, [[sr, sc]]) // monomino (id 0) on start cell
    expect(s.scores[0]).toBe(1)
    const s0: State = { ...s, turn: 0 } // force player-0 perspective for the assertions
    expect(isLegal(s0, 0, [[sr + 1, sc + 1]])).toBe(true)  // diagonal: corner-touch, no edge → legal
    expect(isLegal(s0, 0, [[sr, sc + 1]])).toBe(false)     // edge-adjacent own color → illegal
    expect(isLegal(s0, 0, [[0, 0]])).toBe(false)           // no corner contact → illegal
  })

  it('rejects overlaps and off-board cells', () => {
    let s = makeGame()
    const [sr, sc] = STARTS[0]
    s = place(s, 0, 0, [[sr, sc]])
    const s0: State = { ...s, turn: 0 }
    expect(isLegal(s0, 0, [[sr, sc]])).toBe(false) // overlap
    expect(isLegal(s0, 0, [[-1, -1]])).toBe(false) // off-board
    expect(isLegal(s0, 0, [[N, N]])).toBe(false)   // off-board
  })

  it('canPlaceAny true at start; every legalPlacement is actually legal', () => {
    const s = makeGame()
    expect(canPlaceAny(s, 0)).toBe(true)
    const moves = legalPlacements(s, 0)
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves.slice(0, 60)) expect(isLegal(s, 0, m.cells)).toBe(true)
  })

  it('canPlaceAny false when a player has no pieces left', () => {
    const s = makeGame()
    const empty: State = { ...s, remaining: [[], s.remaining[1]] }
    expect(canPlaceAny(empty, 0)).toBe(false)
  })
})

// Drive player 0 with the same greedy strategy (largest piece) so both seats play.
function driveP0(s: State): State {
  const moves = legalPlacements(s, 0)
  if (moves.length === 0) return pass(s, 0)
  let best = moves[0]
  for (const m of moves) if (m.cells.length > best.cells.length) best = m
  return place(s, 0, best.pieceId, best.cells)
}

describe('blokus duo — self play', () => {
  it('a full AI-vs-AI game terminates fast with a valid winner and no throws', () => {
    let s = makeGame()
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 200) {
        const before = s.step
        s = s.turn === 1 ? aiTurn(s) : driveP0(s)
        expect(s.step).toBeGreaterThanOrEqual(before) // step never goes backwards → no spin
        guard++
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(200)
    expect(s.winner === 0 || s.winner === 1 || s.winner === -1).toBe(true)
    expect(s.scores[0] + s.scores[1]).toBeLessThanOrEqual(2 * TOTAL_CELLS)
    // a non-trivial number of cells should have been placed
    expect(s.scores[0] + s.scores[1]).toBeGreaterThan(10)
  })
})
