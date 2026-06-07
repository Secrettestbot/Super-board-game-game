import { describe, it, expect } from 'vitest'
import {
  makeGame, legalMoves, applyMove, aiTurn, movesForPeg, jumpPaths,
  stepMoves, hasWon, HOLES, HOLE_COUNT, SOUTH_IDS, NORTH_IDS, TARGET,
} from './logic'
import type { Occ } from './logic'

describe('board setup', () => {
  it('is a 121-hole star', () => {
    expect(HOLE_COUNT).toBe(121)
    expect(HOLES.length).toBe(121)
  })

  it('has two opposite home triangles of 10 pegs each, correctly owned', () => {
    expect(SOUTH_IDS.length).toBe(10)
    expect(NORTH_IDS.length).toBe(10)
    const s = makeGame()
    // player 0 fills SOUTH, player 1 fills NORTH; everything else empty.
    for (const id of SOUTH_IDS) expect(s.board[id]).toBe(0)
    for (const id of NORTH_IDS) expect(s.board[id]).toBe(1)
    const p0 = s.board.filter(o => o === 0).length
    const p1 = s.board.filter(o => o === 1).length
    expect(p0).toBe(10)
    expect(p1).toBe(10)
    // SOUTH and NORTH are disjoint (opposite ends).
    expect(SOUTH_IDS.some(id => NORTH_IDS.includes(id))).toBe(false)
  })
})

describe('single steps', () => {
  it('produces only adjacent-empty step destinations', () => {
    const s = makeGame()
    // find a player-0 peg that has at least one empty neighbour (front of the triangle)
    const fronts = SOUTH_IDS.filter(id => stepMoves(s.board, id).length > 0)
    expect(fronts.length).toBeGreaterThan(0)
    for (const f of fronts) {
      for (const to of stepMoves(s.board, f)) {
        expect(s.board[to]).toBeNull() // destination empty
      }
    }
  })
})

describe('jumps', () => {
  it('finds a single jump over an adjacent peg into the empty hole beyond', () => {
    // craft a tiny scenario: peg at some hole, an adjacent peg, empty beyond, in line.
    const board: Occ[] = new Array(HOLE_COUNT).fill(null)
    // use coordinate-based holes: pick the center region. Find three collinear holes.
    // hole A, neighbour B (occupied), landing C (empty), along +y direction [0,1,-1].
    const center = HOLES.find(h => h.x === 0 && h.y === 0)!
    const over = HOLES.find(h => h.x === 0 && h.y === 1 && h.z === -1)
    const land = HOLES.find(h => h.x === 0 && h.y === 2 && h.z === -2)
    expect(over).toBeTruthy()
    expect(land).toBeTruthy()
    board[center.id] = 0
    board[over!.id] = 1   // jump over ANY color
    const paths = jumpPaths(board, center.id)
    const ends = paths.map(p => p[p.length - 1])
    expect(ends).toContain(land!.id)
    // and the single-jump path is exactly [center, land]
    expect(paths.some(p => p.length === 2 && p[0] === center.id && p[1] === land!.id)).toBe(true)
  })

  it('finds a multi-jump chain that changes direction and never revisits', () => {
    const board: Occ[] = new Array(HOLE_COUNT).fill(null)
    const start = HOLES.find(h => h.x === 0 && h.y === 0)!
    // first hop along +y over (0,1,-1) to (0,2,-2)
    const o1 = HOLES.find(h => h.x === 0 && h.y === 1 && h.z === -1)!
    const l1 = HOLES.find(h => h.x === 0 && h.y === 2 && h.z === -2)!
    // from l1 hop along +x (-x? ) direction [1,-1,0]: over (1,1,-2) -> (2,0,-2)
    const o2 = HOLES.find(h => h.x === 1 && h.y === 1 && h.z === -2)!
    const l2 = HOLES.find(h => h.x === 2 && h.y === 0 && h.z === -2)!
    board[start.id] = 0
    board[o1.id] = 0
    board[o2.id] = 1
    const paths = jumpPaths(board, start.id)
    // there should be a chain reaching l2 with both hops, no revisits.
    const chain = paths.find(p => p[p.length - 1] === l2.id && p.length === 3)
    expect(chain).toBeTruthy()
    expect(chain).toEqual([start.id, l1.id, l2.id])
    // no path repeats a hole
    for (const p of paths) expect(new Set(p).size).toBe(p.length)
  })
})

describe('win detection', () => {
  it('detects a win when the target triangle is fully filled by the mover', () => {
    const board: Occ[] = new Array(HOLE_COUNT).fill(null)
    // player 0 targets NORTH. Fill NORTH with player-0 pegs except one, place the last
    // peg adjacent so a single move completes it.
    const target = TARGET[0] // NORTH ids
    for (let i = 0; i < target.length - 1; i++) board[target[i]] = 0
    const missing = target[target.length - 1]
    // find an empty neighbour of `missing` to launch a step from
    let from: number | null = null
    for (const n of stepMoves(board, missing)) { /* missing is empty, neighbours... */ }
    // place a player-0 peg on an empty adjacent hole that can step into `missing`
    // i.e. a neighbour of missing that is currently empty.
    const cand = HOLES.find(h => {
      // adjacency: cube distance 1 to missing, currently empty, not the missing hole
      const m = HOLES[missing]
      const d = (Math.abs(h.x - m.x) + Math.abs(h.y - m.y) + Math.abs(h.z - m.z)) / 2
      return d === 1 && board[h.id] == null
    })!
    board[cand.id] = 0
    const s = { board, turn: 0 as const, winner: null, last: null }
    // before the move, not won
    expect(hasWon(board, 0)).toBe(false)
    const moves = movesForPeg(s, cand.id)
    const winning = moves.find(m => m[m.length - 1] === missing)
    expect(winning).toBeTruthy()
    const ns = applyMove(s, winning!)
    expect(ns.winner).toBe(0)
    expect(hasWon(ns.board, 0)).toBe(true)
  })

  it('does not falsely report a win when target is filled by the WRONG player', () => {
    const board: Occ[] = new Array(HOLE_COUNT).fill(null)
    for (const id of TARGET[0]) board[id] = 1 // enemy sitting in player 0's target
    expect(hasWon(board, 0)).toBe(false)
    expect(hasWon(board, 1)).toBe(false) // it's NOT player 1's target
  })
})

describe('applyMove', () => {
  it('moves the peg and flips the turn', () => {
    const s = makeGame()
    const moves = legalMoves(s, 0)
    expect(moves.length).toBeGreaterThan(0)
    const m = moves[0]
    const from = m[0], to = m[m.length - 1]
    const ns = applyMove(s, m)
    expect(ns.board[from]).toBeNull()
    expect(ns.board[to]).toBe(0)
    expect(ns.turn).toBe(1)
    expect(ns.last).toEqual(m)
  })
})

describe('bounded self-play', () => {
  it('terminates under a cap with no throws and a valid state', () => {
    let s = makeGame()
    const CAP = 4000
    let moves = 0
    expect(() => {
      while (s.winner == null && moves < CAP) {
        const before = s.turn
        s = aiTurn(s, s.turn)
        // each turn must change the board (progress) or end the game
        moves++
        if (s.turn === before && s.winner == null) {
          // no legal move for someone: bail out gracefully (shouldn't happen here)
          break
        }
      }
    }).not.toThrow()
    // state is always valid: each player has exactly 10 pegs, occupants are 0|1|null.
    const p0 = s.board.filter(o => o === 0).length
    const p1 = s.board.filter(o => o === 1).length
    expect(p0).toBe(10)
    expect(p1).toBe(10)
    for (const o of s.board) expect(o === 0 || o === 1 || o === null).toBe(true)
    // winner-validity asserted ONLY when a winner exists.
    if (s.winner != null) {
      expect(hasWon(s.board, s.winner)).toBe(true)
    }
  })
})
