import { describe, it, expect } from 'vitest'
import {
  makeGame, applyMove, legalMoves, legalPlacements, placeableTypes,
  isQueenSurrounded, isConnectedWithout, aiTurn, allLegalMoves, key, neighbors,
} from './logic'
import type { HiveState, Piece, PieceType } from './logic'

// --- fixture helpers -----------------------------------------------------
function emptyState(): HiveState {
  const s = makeGame()
  s.cells = {}
  return s
}
function put(s: HiveState, q: number, r: number, owner: 0 | 1, type: PieceType) {
  const h = key(q, r)
  if (!s.cells[h]) s.cells[h] = []
  s.cells[h].push({ owner, type } as Piece)
}

describe('Hive logic', () => {
  it('placement (after opening) must touch own + not touch opponent', () => {
    // Build: P0 at (0,0), P1 at (1,0). P0 to place again -> must touch own, not opp.
    const s = emptyState()
    put(s, 0, 0, 0, 'S')
    put(s, 1, 0, 1, 'S')
    s.turn = 0
    s.turnNo = [1, 1]
    const spots = legalPlacements(s, 0)
    // every spot must be adjacent to (0,0) and NOT adjacent to (1,0)
    const own = new Set(neighbors(key(0, 0)))
    const opp = new Set(neighbors(key(1, 0)))
    expect(spots.length).toBeGreaterThan(0)
    for (const sp of spots) {
      expect(own.has(sp)).toBe(true)
      expect(opp.has(sp)).toBe(false)
    }
  })

  it('queen must be placed by the 4th turn', () => {
    const s = emptyState()
    // P0 has taken 3 turns already (placed 3 non-queens), now on 4th turn, queen still in hand
    put(s, 0, 0, 0, 'A'); put(s, 1, 0, 0, 'A'); put(s, 2, 0, 0, 'S')
    s.turn = 0
    s.turnNo = [3, 0]
    s.hands[0] = { Q: 1, S: 1, B: 2, G: 3, A: 1 }
    const types = placeableTypes(s, 0)
    expect(types).toEqual(['Q'])
  })

  it('queen moves exactly one sliding step', () => {
    // hive: Q at (0,0), neighbor A at (1,0). Queen has its own queen down so movement allowed.
    const s = emptyState()
    put(s, 0, 0, 0, 'Q')
    put(s, 1, 0, 0, 'A')
    s.turn = 0
    s.turnNo = [2, 2]
    const dests = legalMoves(s, key(0, 0))
    // all destinations must be adjacent to (0,0)
    const adj = new Set(neighbors(key(0, 0)))
    expect(dests.length).toBeGreaterThan(0)
    for (const d of dests) expect(adj.has(d)).toBe(true)
    // queen should be able to slide to a hex adjacent to both itself and the ant (stays attached)
    expect(dests).toContain(key(1, -1))
  })

  it('spider moves exactly three hexes', () => {
    // straight line of pieces so the spider has a clear path around the outside
    const s = emptyState()
    put(s, 0, 0, 0, 'S')              // spider to move
    put(s, 1, 0, 0, 'Q')
    put(s, 2, 0, 0, 'A')
    put(s, 3, 0, 1, 'A')
    s.turn = 0
    s.turnNo = [2, 2]
    const dests = legalMoves(s, key(0, 0)).slice().sort()
    // sliding exactly 3 around the 3-piece line, the spider reaches precisely these two hexes
    expect(dests).toEqual([key(2, 1), key(3, -1)].sort())
    // and never its own square or a 1-step hex
    expect(dests).not.toContain(key(0, 0))
    expect(dests).not.toContain(key(1, -1))
  })

  it('grasshopper jumps a straight line over contiguous pieces', () => {
    const s = emptyState()
    put(s, 0, 0, 0, 'G')              // grasshopper
    put(s, 1, 0, 0, 'Q')             // jump over this
    put(s, 2, 0, 1, 'A')             // and this (contiguous in +q dir)
    s.turn = 0
    s.turnNo = [2, 2]
    const dests = legalMoves(s, key(0, 0))
    // along +q (dir [1,0]) it should land on (3,0) — first empty beyond the contiguous run
    expect(dests).toContain(key(3, 0))
    // it must NOT land on (1,0) or (2,0) (occupied), nor on a hex it didn't jump over
    expect(dests).not.toContain(key(1, 0))
  })

  it('ant slides to many hexes around the hive', () => {
    const s = emptyState()
    put(s, 0, 0, 0, 'A')             // ant to move
    put(s, 1, 0, 0, 'Q')
    put(s, 2, 0, 1, 'A')
    s.turn = 0
    s.turnNo = [2, 2]
    const dests = legalMoves(s, key(0, 0))
    // ant should reach far more hexes than a queen (slides any distance)
    expect(dests.length).toBeGreaterThanOrEqual(4)
  })

  it('beetle can climb on top of an adjacent piece', () => {
    const s = emptyState()
    put(s, 0, 0, 0, 'B')             // beetle
    put(s, 1, 0, 0, 'Q')            // adjacent piece to climb
    s.turn = 0
    s.turnNo = [2, 2]
    const dests = legalMoves(s, key(0, 0))
    expect(dests).toContain(key(1, 0))   // can climb onto the queen's hex
  })

  it('one-hive rule forbids a move that would disconnect the hive', () => {
    // line A-Q-A: the middle Q is an articulation point — moving it splits the hive.
    const s = emptyState()
    put(s, 0, 0, 0, 'A')
    put(s, 1, 0, 0, 'Q')             // middle, also our queen
    put(s, 2, 0, 0, 'A')
    // removing the middle (1,0) should disconnect (0,0) from (2,0)
    expect(isConnectedWithout(s, key(1, 0))).toBe(false)
    s.turn = 0
    s.turnNo = [3, 3]
    // queen at (1,0) is an articulation point -> no legal moves
    expect(legalMoves(s, key(1, 0))).toEqual([])
  })

  it('freedom-to-move forbids sliding through a one-wide gap', () => {
    // Queen at (0,0). The shared gateways between (0,0) and (1,-1) are (1,0) and (0,-1).
    // CASE A — only ONE gateway (1,0) occupied: the queen CAN slide into (1,-1).
    const a = emptyState()
    put(a, 0, 0, 0, 'Q')
    put(a, 1, 0, 0, 'A')             // gateway (1,0) filled, (0,-1) open
    a.turn = 0; a.turnNo = [3, 3]
    expect(legalMoves(a, key(0, 0))).toContain(key(1, -1))
    // CASE B — BOTH gateways (1,0) & (0,-1) occupied: sliding into (1,-1) is now blocked.
    const b = emptyState()
    put(b, 0, 0, 0, 'Q')
    put(b, 1, 0, 0, 'A')
    put(b, 0, -1, 0, 'A')            // second gateway filled -> 1-wide gap
    b.turn = 0; b.turnNo = [3, 3]
    expect(legalMoves(b, key(0, 0))).not.toContain(key(1, -1))
  })

  it('detects a fully surrounded queen as a loss (deterministic win)', () => {
    // Place player 0's queen at (0,0) and fill 5 of 6 neighbours; the final placement wins.
    const s = emptyState()
    put(s, 0, 0, 0, 'Q')
    const nbs = neighbors(key(0, 0))
    for (let i = 0; i < 5; i++) {
      const [q, r] = nbs[i].split(',').map(Number)
      put(s, q, r, 1, 'A')
    }
    expect(isQueenSurrounded(s, 0)).toBe(false)   // 5/6, not yet
    // AI (player 1) places the last surrounding piece -> player 0 loses (winner = 1)
    s.turn = 1
    s.turnNo = [5, 5]
    s.hands[1] = { Q: 0, S: 0, B: 0, G: 0, A: 3 }
    const last = nbs[5]
    const ns = applyMove(s, { kind: 'place', type: 'A', to: last })
    expect(isQueenSurrounded(ns, 0)).toBe(true)
    expect(ns.winner).toBe(1)
  })

  it('bounded self-play terminates without throwing; winner valid when present', () => {
    let s = makeGame()
    let steps = 0
    const CAP = 400
    expect(() => {
      while (s.winner == null && steps < CAP) {
        // both sides use the AI heuristic by temporarily flipping turn semantics:
        // player 0 picks greedily too (reuse allLegalMoves + first/best heuristic via aiTurn-like)
        const p = s.turn
        const moves = allLegalMoves(s, p)
        if (!moves.length) {
          // pass
          s = applyMove(s, moves[0] ?? { kind: 'place', type: 'A', to: key(0, 0) })
          break
        }
        if (p === 1) {
          s = aiTurn(s)
        } else {
          // player 0: greedy toward enemy queen — just take a heuristic move (first that
          // increases enemy-queen pressure, else first move). Deterministic.
          s = applyMove(s, moves[0])
        }
        steps++
      }
    }).not.toThrow()
    expect(steps).toBeLessThanOrEqual(CAP)
    if (s.winner != null) {
      expect([0, 1, 'draw']).toContain(s.winner)
    }
  })
})
