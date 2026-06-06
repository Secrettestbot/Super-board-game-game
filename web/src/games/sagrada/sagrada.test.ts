import { describe, it, expect } from 'vitest'
import * as S from './logic'
import type { Cell, Die, PublicObjective } from './logic'

// Pure-logic tests (no DOM). Build known windows, check placement legality + every
// objective, then play a full self-play game to a valid winner under a guard cap.

function blank(): Cell[] {
  return Array.from({ length: S.CELLS }, () => ({ reqColor: null, reqValue: null, die: null } as Cell))
}
const die = (color: S.Color, value: number): Die => ({ color, value })

describe('sagrada logic', () => {
  it('first die of a window must sit on an edge/corner cell', () => {
    const w = blank()
    const d = die('red', 3)
    // center cell (row 1, col 2) is index 7 — not an edge.
    expect(S.isEdge(S.idx(1, 2))).toBe(false)
    expect(S.canPlaceAt(w, d, S.idx(1, 2))).toBe(false)
    // corner (0,0) and an edge (0,3) are legal.
    expect(S.canPlaceAt(w, d, S.idx(0, 0))).toBe(true)
    expect(S.canPlaceAt(w, d, S.idx(0, 3))).toBe(true)
    // legalPlacements for an empty window = exactly the edge cells.
    const legal = S.legalPlacements(w, d)
    expect(legal.length).toBe(S.CELLS - 6) // 20 cells, 6 interior (2x3) non-edge
    expect(legal.every(i => S.isEdge(i))).toBe(true)
  })

  it('a later die must be orthogonally adjacent and not touch same colour or value', () => {
    const w = blank()
    w[S.idx(0, 0)] = { reqColor: null, reqValue: null, die: die('red', 3) }
    // (0,1) is orthogonally adjacent.
    expect(S.canPlaceAt(w, die('blue', 5), S.idx(0, 1))).toBe(true) // ok: diff colour+value
    expect(S.canPlaceAt(w, die('red', 5), S.idx(0, 1))).toBe(false) // same colour as neighbour
    expect(S.canPlaceAt(w, die('blue', 3), S.idx(0, 1))).toBe(false) // same value as neighbour
    // a non-adjacent cell (2,2) is illegal even though window is non-empty.
    expect(S.canPlaceAt(w, die('blue', 5), S.idx(2, 2))).toBe(false)
    // diagonal-only adjacency (1,1) is NOT orthogonal adjacency → illegal.
    expect(S.canPlaceAt(w, die('blue', 5), S.idx(1, 1))).toBe(false)
  })

  it('enforces printed colour and value restrictions', () => {
    const w = blank()
    w[S.idx(0, 0)] = { reqColor: 'green', reqValue: null, die: null }
    w[S.idx(0, 1)] = { reqColor: null, reqValue: 4, die: null }
    expect(S.canPlaceAt(w, die('green', 2), S.idx(0, 0))).toBe(true)
    expect(S.canPlaceAt(w, die('red', 2), S.idx(0, 0))).toBe(false) // wrong colour
    expect(S.canPlaceAt(w, die('blue', 4), S.idx(0, 1))).toBe(true)
    expect(S.canPlaceAt(w, die('blue', 5), S.idx(0, 1))).toBe(false) // wrong value
  })

  it('private objective = sum of pips of the secret colour', () => {
    const w = blank()
    w[0] = { reqColor: null, reqValue: null, die: die('purple', 5) }
    w[1] = { reqColor: null, reqValue: null, die: die('purple', 2) }
    w[2] = { reqColor: null, reqValue: null, die: die('red', 6) } // not counted
    const s = S.makeGame({ seed: 1, windows: [w, blank()], secret: ['purple', 'red'], publics: [] })
    const bd = S.scoreWindow(s, 0)
    expect(bd.private).toBe(7) // 5 + 2
  })

  it('public: rows with all different colours = 6 each', () => {
    const obj = S.ALL_PUBLICS.find(o => o.id === 'rows-diff-color') as PublicObjective
    const w = blank()
    // Row 0: 5 distinct colours → 6 pts.
    const fill: S.Color[] = ['red', 'yellow', 'green', 'blue', 'purple']
    for (let c = 0; c < 5; c++) w[S.idx(0, c)] = { reqColor: null, reqValue: null, die: die(fill[c], c + 1) }
    expect(obj.score(w)).toBe(6)
    // Break row 0 (duplicate colour) → 0.
    w[S.idx(0, 4)] = { reqColor: null, reqValue: null, die: die('red', 6) }
    expect(obj.score(w)).toBe(0)
  })

  it('public: columns with all different values = 5; value-sets 1..6 = 5; colour diagonals = 1 each', () => {
    const cols = S.ALL_PUBLICS.find(o => o.id === 'cols-diff-value') as PublicObjective
    const wc = blank()
    // Column 0 (4 rows) with values 1,2,3,4 → 5 pts.
    for (let r = 0; r < 4; r++) wc[S.idx(r, 0)] = { reqColor: null, reqValue: null, die: die('red', r + 1) }
    expect(cols.score(wc)).toBe(5)

    const sets = S.ALL_PUBLICS.find(o => o.id === 'value-sets') as PublicObjective
    const ws = blank()
    const vals = [1, 2, 3, 4, 5, 6]
    for (let i = 0; i < 6; i++) ws[i] = { reqColor: null, reqValue: null, die: die('blue', vals[i]) }
    expect(sets.score(ws)).toBe(5) // one complete set
    ws[6] = { reqColor: null, reqValue: null, die: die('red', 1) } // second 1 only, no full 2nd set
    expect(sets.score(ws)).toBe(5)

    const diag = S.ALL_PUBLICS.find(o => o.id === 'diag-color') as PublicObjective
    const wd = blank()
    wd[S.idx(0, 0)] = { reqColor: null, reqValue: null, die: die('green', 1) }
    wd[S.idx(1, 1)] = { reqColor: null, reqValue: null, die: die('green', 2) } // diagonal same colour pair
    expect(diag.score(wd)).toBe(2) // both dice count (each diagonally adjacent to a same colour)
  })

  it('empty-cell penalty subtracts one point per empty cell', () => {
    const w = blank()
    w[0] = { reqColor: null, reqValue: null, die: die('red', 4) }
    const s = S.makeGame({ seed: 2, windows: [w, blank()], secret: ['red', 'blue'], publics: [] })
    const bd = S.scoreWindow(s, 0)
    expect(bd.emptyPenalty).toBe(19) // 20 cells - 1 placed
    expect(bd.total).toBe(4 - 19) // private 4, no publics, minus 19
  })

  it('placeDie respects turn + legality and advances snake order', () => {
    const s = S.makeGame({ seed: 7 })
    expect(s.turn).toBe(0)
    // Wrong player → no-op.
    expect(S.placeDie(s, 1, 0, 0).step).toBe(s.step)
    // Place first die (player 0) at an edge cell that fits the die.
    const die0 = s.pool[0]
    const legal = S.legalPlacements(s.windows[0], die0)
    const s2 = S.placeDie(s, 0, 0, legal[0])
    expect(s2.step).toBe(s.step + 1)
    expect(s2.turn).toBe(1) // snake: after P0's first pick it's P1
    expect(s2.pool.length).toBe(s.pool.length - 1)
    expect(S.placedCount(s2.windows[0])).toBe(1)
  })

  it('self-play reaches a valid winner under a guard cap with no throws', () => {
    let s = S.makeGame({ seed: 12345 })
    let guard = 0
    while (s.winner == null && guard++ < 5000) {
      if (s.turn === 1) { s = S.aiTurn(s); continue }
      // Human policy: greedy like the AI; skip if nothing placeable.
      const move = S.aiBestMove(s, 0)
      s = move == null ? S.skipPick(s, 0) : S.placeDie(s, 0, move.draftIndex, move.cellIndex)
    }
    expect(guard).toBeLessThan(5000) // terminated well within cap
    expect(s.winner === 0 || s.winner === 1).toBe(true)
    expect(s.scores).not.toBeNull()
    expect(s.round).toBe(S.ROUNDS)
    // Scores are internally consistent with scoreWindow.
    expect(s.scores![0]).toBe(S.scoreWindow(s, 0).total)
    expect(s.scores![1]).toBe(S.scoreWindow(s, 1).total)
    // Winner has the >= score (ties to player 0).
    if (s.winner === 0) expect(s.scores![0]).toBeGreaterThanOrEqual(s.scores![1])
    else expect(s.scores![1]).toBeGreaterThan(s.scores![0])
  })

  it('multiple seeds all terminate with a valid winner', () => {
    for (const seed of [1, 2, 99, 4040, 777]) {
      let s = S.makeGame({ seed })
      let guard = 0
      while (s.winner == null && guard++ < 5000) {
        if (s.turn === 1) s = S.aiTurn(s)
        else {
          const m = S.aiBestMove(s, 0)
          s = m == null ? S.skipPick(s, 0) : S.placeDie(s, 0, m.draftIndex, m.cellIndex)
        }
      }
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(s.scores).not.toBeNull()
    }
  })
})
