import { describe, it, expect } from 'vitest'
import * as TW from './logic'
import type { State, Owner } from './logic'

const { N, idx } = TW

// Helper: force-place a peg of `who` at hole i regardless of turn, returning a new state with
// auto-linking applied (drives the real place() by aligning the turn first).
function forcePlace(s: State, who: Owner, i: number): State {
  const t: State = { ...s, turn: who, winner: null }
  return TW.place(t, who, i)
}

describe('twixt logic', () => {
  it('starts on a valid empty 12x12 board, you to move, no winner', () => {
    const s = TW.makeGame()
    expect(s.pegs).toHaveLength(N * N)
    expect(N).toBe(12)
    expect(s.pegs.every(p => p === null)).toBe(true)
    expect(s.turn).toBe(0)
    expect(s.you).toBe(0)
    expect(s.winner).toBeNull()
    expect(s.links).toEqual([])
  })

  it('legalHoles excludes corners, occupied holes, and the opponent border lines', () => {
    const s = TW.makeGame()
    const youLegal = TW.legalHoles(s, 0)
    // You (0) may NOT place in the side columns (c==0 or c==N-1).
    expect(youLegal.every(i => i % N !== 0 && i % N !== N - 1)).toBe(true)
    // You MAY place in the top/bottom rows (interior of them).
    expect(youLegal).toContain(idx(0, 3))
    expect(youLegal).toContain(idx(N - 1, 5))
    // Corners excluded.
    expect(youLegal).not.toContain(idx(0, 0))
    expect(youLegal).not.toContain(idx(N - 1, N - 1))

    // AI (1) may NOT place in the top/bottom rows; MAY place in side columns.
    const aiLegal = TW.legalHoles(s, 1)
    expect(aiLegal.every(i => Math.floor(i / N) !== 0 && Math.floor(i / N) !== N - 1)).toBe(true)
    expect(aiLegal).toContain(idx(3, 0))
    expect(aiLegal).toContain(idx(5, N - 1))

    // Occupied holes drop out.
    const s2 = forcePlace(s, 0, idx(2, 4))
    expect(TW.legalHoles(s2, 0)).not.toContain(idx(2, 4))
  })

  it('placing auto-adds a knight link to an existing same-owner peg', () => {
    let s = TW.makeGame()
    s = forcePlace(s, 0, idx(2, 4))
    expect(s.links).toHaveLength(0)
    // (2,4) -> (4,5) is a knight move (dr=2, dc=1).
    s = forcePlace(s, 0, idx(4, 5))
    expect(s.links).toHaveLength(1)
    const l = s.links[0]
    expect(l.owner).toBe(0)
    expect([l.a, l.b].sort()).toEqual([idx(2, 4), idx(4, 5)].sort())

    // A non-knight neighbour adds no link.
    s = forcePlace(s, 0, idx(3, 8))
    expect(s.links).toHaveLength(1)
  })

  it('does NOT link to an opponent peg even on a knight offset', () => {
    let s = TW.makeGame()
    s = forcePlace(s, 1, idx(4, 5))     // AI peg
    s = forcePlace(s, 0, idx(2, 4))     // your peg a knight move away
    expect(s.links).toHaveLength(0)     // different owners → no link
  })

  it('linksCross: correct geometry on known segments', () => {
    // Two knight links that form an X through the unit cell cross.
    // A: (0,0)-(2,1)  B: (0,1)-(2,0)  — these properly cross.
    const A1 = idx(0, 0), A2 = idx(1, 2)   // (r0c0)-(r1c2): horizontal-ish knight
    const B1 = idx(0, 2), B2 = idx(1, 0)   // (r0c2)-(r1c0): the opposite diagonal
    expect(TW.linksCross(A1, A2, B1, B2)).toBe(true)

    // Sharing an endpoint is NOT a crossing.
    expect(TW.linksCross(A1, A2, A1, idx(2, 1))).toBe(false)

    // Two clearly separate links do not cross.
    const C1 = idx(0, 0), C2 = idx(2, 1)
    const D1 = idx(5, 5), D2 = idx(7, 6)
    expect(TW.linksCross(C1, C2, D1, D2)).toBe(false)
  })

  it('a link is NOT added when it would cross an existing link', () => {
    // Lay an AI link across the cell, then try to add a YOU link that crosses it.
    let s = TW.makeGame()
    // AI link: (0?) — AI can't use top row, build it in interior: (4,5)-(5,7) knight (dr1,dc2).
    s = forcePlace(s, 1, idx(4, 5))
    s = forcePlace(s, 1, idx(5, 7))
    expect(s.links).toHaveLength(1)      // AI bridge in place

    // Now a YOU bridge that crosses it: (4,7)-(5,5) is the opposite diagonal of that cell.
    s = forcePlace(s, 0, idx(4, 7))
    s = forcePlace(s, 0, idx(5, 5))
    // (4,7)-(5,5) is a knight move (dr1,dc-2) and crosses the AI (4,5)-(5,7) bridge → skipped.
    const youLinks = s.links.filter(l => l.owner === 0)
    expect(youLinks).toHaveLength(0)
  })

  it('isConnected detects a completed top↔bottom chain for You', () => {
    // Build a knight-linked ladder from the top row down to the bottom row.
    // Steps alternate (2,+1)/(2,-1) staying in interior columns, with a final (1,*) to reach row 11.
    let s = TW.makeGame()
    const chain = [
      idx(0, 4), idx(2, 5), idx(4, 4), idx(6, 5), idx(8, 4), idx(10, 5), idx(11, 3),
    ]
    // verify each consecutive pair is a knight move
    const isKnight = (p: number, q: number) => {
      const dr = Math.abs(Math.floor(p / N) - Math.floor(q / N))
      const dc = Math.abs((p % N) - (q % N))
      return (dr === 1 && dc === 2) || (dr === 2 && dc === 1)
    }
    for (let k = 1; k < chain.length; k++) expect(isKnight(chain[k - 1], chain[k])).toBe(true)

    for (const h of chain) s = forcePlace(s, 0, h)
    expect(s.links.filter(l => l.owner === 0).length).toBeGreaterThanOrEqual(chain.length - 1)
    expect(TW.isConnected(s, 0)).toBe(true)
    // The AI is not connected with these pegs.
    expect(TW.isConnected(s, 1)).toBe(false)

    // A win-state place at the final hole should register the winner.
    let s2 = TW.makeGame()
    for (let k = 0; k < chain.length - 1; k++) s2 = forcePlace(s2, 0, chain[k])
    expect(s2.winner).toBeNull()
    s2 = forcePlace(s2, 0, chain[chain.length - 1])
    expect(s2.winner).toBe(0)
    expect(s2.win.length).toBeGreaterThan(0)
  })

  it('bounded self-play terminates with valid state and no throws', () => {
    for (let game = 0; game < 5; game++) {
      let s = TW.makeGame()
      let plies = 0
      const cap = N * N + 4
      expect(() => {
        while (s.winner == null && plies < cap) {
          if (s.turn === 0) {
            const legal = TW.legalHoles(s, 0)
            if (!legal.length) break
            s = TW.place(s, 0, legal[(Math.random() * legal.length) | 0])
          } else {
            const before = s.last
            s = TW.aiTurn(s)
            if (s.last === before && s.winner == null) break  // AI had no move
          }
          plies++
        }
      }).not.toThrow()

      // Terminated either by a winner or by hitting the cap / board exhaustion.
      expect(plies).toBeLessThanOrEqual(cap)
      // State integrity: pegs length intact, links reference owned pegs.
      expect(s.pegs).toHaveLength(N * N)
      for (const l of s.links) {
        expect(s.pegs[l.a]).toBe(l.owner)
        expect(s.pegs[l.b]).toBe(l.owner)
      }
      // Winner-validity asserted only when present.
      if (s.winner != null) {
        expect(s.winner === 0 || s.winner === 1).toBe(true)
        expect(TW.isConnected(s, s.winner)).toBe(true)
      }
    }
  })
})
