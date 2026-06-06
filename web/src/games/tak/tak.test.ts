import { describe, it, expect } from 'vitest'
import {
  makeGame, legalMoves, applyMove, hasRoad, roadPath, aiTurn, aiBestMove,
  flatCount, boardFull, someoneOut, controls, idx, SIZE, CARRY,
} from './logic'
import type { TakState, Move, Piece, Owner } from './logic'

// Build a board from a layout helper: each cell is a Stack (array of pieces, bottom-first).
function blank(): TakState {
  return makeGame()
}
function setStack(s: TakState, r: number, c: number, stack: Piece[]) {
  s.board[idx(r, c)] = stack
}

describe('placement', () => {
  it('places a flat, a wall, and the capstone, decrementing supply', () => {
    let s = blank()
    s = applyMove(s, { kind: 'place', at: idx(0, 0), piece: 'flat' })
    expect(s.board[idx(0, 0)]).toEqual([{ owner: 0, type: 'flat' }])
    expect(s.supply[0].stones).toBe(20)
    expect(s.turn).toBe(1) // turn passed to AI

    // wall placement by player 1
    s = applyMove(s, { kind: 'place', at: idx(1, 1), piece: 'wall' })
    expect(s.board[idx(1, 1)]).toEqual([{ owner: 1, type: 'wall' }])
    expect(s.supply[1].stones).toBe(20)

    // capstone placement by player 0
    s = applyMove(s, { kind: 'place', at: idx(2, 2), piece: 'cap' })
    expect(s.board[idx(2, 2)]).toEqual([{ owner: 0, type: 'cap' }])
    expect(s.supply[0].capstone).toBe(0)
  })

  it('legalMoves offers placements (flat+wall+cap) on every empty square at game start', () => {
    const s = blank()
    const placements = legalMoves(s).filter(m => m.kind === 'place')
    // 25 squares * (flat + wall + cap) = 75
    expect(placements.length).toBe(SIZE * SIZE * 3)
  })
})

describe('stack moves', () => {
  it('picks up <= carryLimit and drops >= 1 per square', () => {
    let s = blank()
    // Build a stack of 3 flats owned by player 0 at (2,2), top is player 0.
    setStack(s, 2, 2, [
      { owner: 1, type: 'flat' },
      { owner: 1, type: 'flat' },
      { owner: 0, type: 'flat' },
    ])
    s.turn = 0
    // Move all 3 to the right over 2 squares (cols 3,4): drop 1 then 2.
    expect(controls(s, idx(2, 2), 0)).toBe(true)
    const move: Move = { kind: 'move', from: idx(2, 2), dir: 1, drops: [1, 2] }
    const after = applyMove(s, move)
    expect(after.board[idx(2, 2)].length).toBe(0)
    expect(after.board[idx(2, 3)].length).toBe(1)
    expect(after.board[idx(2, 4)].length).toBe(2)
    // The carried column is bottom-first; bottom pieces land first.
    expect(after.board[idx(2, 3)][0]).toEqual({ owner: 1, type: 'flat' })
    // (2,4) receives the next two: the second carried flat (owner 1) then the top (owner 0).
    expect(after.board[idx(2, 4)][0]).toEqual({ owner: 1, type: 'flat' })
    expect(after.board[idx(2, 4)][1]).toEqual({ owner: 0, type: 'flat' })
  })

  it('never offers a carry larger than CARRY', () => {
    let s = blank()
    const big: Piece[] = []
    for (let k = 0; k < 7; k++) big.push({ owner: 0, type: 'flat' })
    setStack(s, 2, 0, big)
    s.turn = 0
    const moves = legalMoves(s).filter((m): m is Extract<Move, { kind: 'move' }> => m.kind === 'move')
    const maxTake = Math.max(...moves.filter(m => m.from === idx(2, 0)).map(m => m.drops.reduce((a, b) => a + b, 0)))
    expect(maxTake).toBeLessThanOrEqual(CARRY)
  })

  it('a lone capstone can flatten a lone wall by moving onto it', () => {
    let s = blank()
    setStack(s, 0, 0, [{ owner: 0, type: 'cap' }])
    setStack(s, 0, 1, [{ owner: 1, type: 'wall' }])
    s.turn = 0
    const move: Move = { kind: 'move', from: idx(0, 0), dir: 1, drops: [1] }
    // The slide should be legal (lone capstone onto lone wall).
    const legal = legalMoves(s).some(m => m.kind === 'move' && m.from === idx(0, 0) && m.dir === 1)
    expect(legal).toBe(true)
    const after = applyMove(s, move)
    const dest = after.board[idx(0, 1)]
    // Wall flattened to a flat, capstone on top.
    expect(dest[0]).toEqual({ owner: 1, type: 'flat' })
    expect(dest[1]).toEqual({ owner: 0, type: 'cap' })
  })

  it('a flat cannot move onto a wall', () => {
    let s = blank()
    setStack(s, 0, 0, [{ owner: 0, type: 'flat' }])
    setStack(s, 0, 1, [{ owner: 1, type: 'wall' }])
    s.turn = 0
    const legal = legalMoves(s).some(m => m.kind === 'move' && m.from === idx(0, 0) && m.dir === 1)
    expect(legal).toBe(false)
  })
})

describe('road detection', () => {
  it('detects a completed top-to-bottom road of flats', () => {
    let s = blank()
    for (let r = 0; r < SIZE; r++) setStack(s, r, 2, [{ owner: 0, type: 'flat' }])
    expect(hasRoad(s, 0)).toBe(true)
    const path = roadPath(s.board, 0)
    expect(path).not.toBeNull()
    expect(path!.length).toBe(SIZE)
  })

  it('a wall in the chain breaks the road', () => {
    let s = blank()
    for (let r = 0; r < SIZE; r++) setStack(s, r, 2, [{ owner: 0, type: 'flat' }])
    // Replace one with a wall (walls don't count for roads).
    setStack(s, 2, 2, [{ owner: 0, type: 'wall' }])
    expect(hasRoad(s, 0)).toBe(false)
  })

  it('a capstone counts toward a road; an opponent top does not', () => {
    let s = blank()
    for (let c = 0; c < SIZE; c++) setStack(s, 3, c, [{ owner: 1, type: 'flat' }])
    setStack(s, 3, 4, [{ owner: 1, type: 'cap' }]) // capstone closing the left-right road
    expect(hasRoad(s, 1)).toBe(true)
    // Player 0 has no road.
    expect(hasRoad(s, 0)).toBe(false)
  })

  it('applyMove that completes a road sets winner to the mover', () => {
    let s = blank()
    // Four flats already down for player 0 in column 0, rows 0..3; placing row 4 completes it.
    for (let r = 0; r < SIZE - 1; r++) setStack(s, r, 0, [{ owner: 0, type: 'flat' }])
    s.turn = 0
    const after = applyMove(s, { kind: 'place', at: idx(SIZE - 1, 0), piece: 'flat' })
    expect(after.winner).toBe(0)
    expect(after.winRoad.length).toBe(SIZE)
  })
})

describe('flat-count endgame', () => {
  it('fills the board and wins on flat count', () => {
    let s = blank()
    // Fill all but one square: player 0 gets more flat tops.
    for (let i = 0; i < SIZE * SIZE; i++) {
      const r = Math.floor(i / SIZE), c = i % SIZE
      if (r === 0 && c === 0) continue // leave one empty
      // Avoid creating a full road: alternate owners but ensure no opposite-edge chain.
      // Give player 0 the majority of flats, player 1 some walls (don't count for flats).
      const owner: Owner = i % 3 === 0 ? 1 : 0
      const type = owner === 1 ? 'wall' : 'flat'
      setStack(s, r, c, [{ owner, type }])
    }
    s.turn = 0
    // Sanity: no road yet for either (player-1 squares are walls).
    expect(hasRoad(s, 1)).toBe(false)
    // Place the final piece as a wall so we don't accidentally complete a road, filling the board.
    const after = applyMove(s, { kind: 'place', at: idx(0, 0), piece: 'wall' })
    expect(boardFull(after)).toBe(true)
    expect(after.winner).not.toBeNull()
    // Player 0 placed many flats; should win on count (unless a road formed, also a win for 0).
    expect(after.winner === 0).toBe(true)
    expect(flatCount(after, 0)).toBeGreaterThan(flatCount(after, 1))
  })
})

describe('self-play termination', () => {
  it('runs bounded self-play with no throws and a valid winner when present', () => {
    let s = blank()
    const CAP = 400
    let n = 0
    let threw = false
    try {
      while (s.winner == null && n < CAP) {
        s = aiTurn(s) // both sides use the road-seeking AI
        n++
      }
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(n).toBeLessThanOrEqual(CAP)
    if (s.winner != null) {
      expect([0, 1, 'draw']).toContain(s.winner)
      // If a road decided it, winRoad should be a real chain or empty (flat-count win).
      if (s.winner !== 'draw') {
        const w = s.winner as Owner
        const decided = hasRoad(s, w) || boardFull(s) || someoneOut(s)
        expect(decided).toBe(true)
      }
    }
  })

  it('aiBestMove returns a legal move on a fresh board', () => {
    const s = blank()
    const m = aiBestMove(s)
    expect(m).not.toBeNull()
    const legal = legalMoves(s)
    const found = legal.some(x => JSON.stringify(x) === JSON.stringify(m))
    expect(found).toBe(true)
  })
})
