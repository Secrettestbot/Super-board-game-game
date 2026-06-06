import { describe, it, expect } from 'vitest'
import {
  makeGame, placePiece, legalPlacements, placingColor, legalMoves, applyMove,
  controlledCount, winnerOf, aiTurn, neighbors, idx, NCELLS,
  stackHasRed, controllerOf,
} from './logic'
import type { DvonnState, Stack } from './logic'

// Fill the whole board via placement (3 red first, then alternating w/b).
function fillBoard(): DvonnState {
  let s = makeGame()
  let guard = 0
  while (s.phase === 'place' && guard++ < 200) {
    const cells = legalPlacements(s)
    s = placePiece(s, cells[0])
  }
  return s
}

describe('placement', () => {
  it('fills the board with 3 red + 23 white + 23 black', () => {
    const s = fillBoard()
    expect(s.phase).toBe('move')
    expect(s.turn).toBe(0)
    expect(s.board.filter(x => x != null).length).toBe(NCELLS)
    let red = 0, w = 0, b = 0
    for (const st of s.board) {
      if (st == null) continue
      const c = st[0].color
      if (c === 'r') red++; else if (c === 'w') w++; else b++
    }
    expect(red).toBe(3)
    expect(w).toBe(23)
    expect(b).toBe(23)
  })

  it('places red pieces before player pieces', () => {
    const s = makeGame()
    expect(placingColor(s)).toBe('r')
    const s1 = placePiece(s, legalPlacements(s)[0])
    expect(placingColor(s1)).toBe('r')
  })
})

describe('movement geometry', () => {
  it('moves a stack exactly its height in a straight line onto an occupied cell', () => {
    // Build a tiny hand-made state with two height-1 stacks adjacent, plus a red anchor.
    const board: (Stack | null)[] = new Array(NCELLS).fill(null)
    board[idx(3, 3)] = [{ color: 'r' }]                 // red anchor (keeps things connected)
    board[idx(3, 4)] = [{ color: 'w' }]                 // white stack height 1
    // a neighbour of idx(3,4) one step away to land on
    const nbrs = neighbors(idx(3, 4))
    const target = nbrs.find(j => board[j] != null)!     // should be the red anchor
    expect(target).toBe(idx(3, 3))
    const s: DvonnState = { ...makeGame(), board, phase: 'move', turn: 0 }
    const moves = legalMoves(s, 0)
    expect(moves.some(m => m.from === idx(3, 4) && m.to === idx(3, 3))).toBe(true)
    const after = applyMove(s, idx(3, 4), idx(3, 3))
    const landed = after.board[idx(3, 3)]!
    expect(landed.length).toBe(2)           // white moved on top of red
    expect(controllerOf(landed)).toBe(0)    // white now on top
    expect(after.board[idx(3, 4)]).toBeNull()
  })

  it('a stack with no occupied neighbour cannot move (stranded)', () => {
    const board: (Stack | null)[] = new Array(NCELLS).fill(null)
    const center = idx(3, 3)
    board[center] = [{ color: 'w' }]              // alone, no occupied neighbours
    board[idx(0, 0)] = [{ color: 'r' }]           // a far red so the board isn't trivially empty
    const s: DvonnState = { ...makeGame(), board, phase: 'move', turn: 0 }
    const moves = legalMoves(s, 0).filter(m => m.from === center)
    expect(moves.length).toBe(0)
  })

  it('a height-1 piece surrounded by occupied cells CAN still move onto a neighbour', () => {
    const board: (Stack | null)[] = new Array(NCELLS).fill(null)
    const center = idx(3, 3)
    board[center] = [{ color: 'w' }]
    for (const j of neighbors(center)) board[j] = [{ color: 'b' }]
    const s: DvonnState = { ...makeGame(), board, phase: 'move', turn: 0 }
    const moves = legalMoves(s, 0).filter(m => m.from === center)
    expect(moves.length).toBeGreaterThan(0)
  })

  it('only allows landing on occupied stacks, never empty cells', () => {
    const board: (Stack | null)[] = new Array(NCELLS).fill(null)
    board[idx(3, 3)] = [{ color: 'r' }]
    board[idx(3, 4)] = [{ color: 'w' }]
    const s: DvonnState = { ...makeGame(), board, phase: 'move', turn: 0 }
    for (const m of legalMoves(s, 0)) expect(s.board[m.to]).not.toBeNull()
  })
})

describe('DVONN disconnection removal', () => {
  it('removes stacks no longer connected to a red piece after a move', () => {
    const board: (Stack | null)[] = new Array(NCELLS).fill(null)
    // red anchor at A1
    board[idx(0, 0)] = [{ color: 'r' }]
    // a white stack adjacent to red that we will move away
    board[idx(0, 1)] = [{ color: 'w' }]
    // a lone black stack far away, connected to the board only through (0,1)
    // place it so that after the white moves, it becomes isolated.
    // (5,5) and (5,6) — these touch nothing red.
    board[idx(5, 5)] = [{ color: 'b' }]
    board[idx(5, 6)] = [{ color: 'b' }]
    const s: DvonnState = { ...makeGame(), board, phase: 'move', turn: 0 }
    // white (height 1) at (0,1) moves 1 onto the red anchor (0,0)
    const after = applyMove(s, idx(0, 1), idx(0, 0))
    // the two black stacks were never connected to red -> removed
    expect(after.board[idx(5, 5)]).toBeNull()
    expect(after.board[idx(5, 6)]).toBeNull()
    // the red+white stack survives
    expect(after.board[idx(0, 0)]!.length).toBe(2)
    expect(stackHasRed(after.board[idx(0, 0)]!)).toBe(true)
  })
})

describe('scoring', () => {
  it('controlledCount sums pieces in stacks the player tops', () => {
    const board: (Stack | null)[] = new Array(NCELLS).fill(null)
    board[idx(3, 3)] = [{ color: 'b' }, { color: 'w' }]   // height 2, white top
    board[idx(3, 4)] = [{ color: 'r' }, { color: 'b' }]   // height 2, black top
    board[idx(2, 3)] = [{ color: 'w' }]                   // height 1, white top
    const s: DvonnState = { ...makeGame(), board, phase: 'move', turn: 0 }
    expect(controlledCount(s, 0)).toBe(3)   // 2 + 1
    expect(controlledCount(s, 1)).toBe(2)
    expect(winnerOf(s)).toBe(0)
  })
})

describe('self-play', () => {
  it('terminates under a guard cap with a valid (or null) winner and no throws', () => {
    let s = makeGame()
    let guard = 0
    // placement
    while (s.phase === 'place' && guard++ < 300) {
      if (s.turn === 1 || placingColor(s) === 'r') {
        s = aiTurn(s)
      } else {
        const cells = legalPlacements(s)
        s = placePiece(s, cells[0])
      }
    }
    expect(s.phase === 'move' || s.phase === 'done').toBe(true)
    // movement self-play: both sides use the AI heuristic
    let cap = 0
    while (s.phase === 'move' && cap++ < 3000) {
      const mover = s.turn
      const moves = legalMoves(s, mover)
      if (!moves.length) {
        // resolveTurn inside applyMove handles passes; but if we somehow get here,
        // force the heuristic which calls resolveTurn safely
        s = aiTurn({ ...s, turn: mover })
        continue
      }
      // pick via the heuristic regardless of which player
      let best = moves[0], bestV = -Infinity
      for (const m of moves) {
        const after = applyMove(s, m.from, m.to)
        const v = controlledCount(after, mover) - controlledCount(after, mover === 0 ? 1 : 0)
        if (v > bestV) { bestV = v; best = m }
      }
      s = applyMove(s, best.from, best.to)
    }
    expect(cap).toBeLessThan(3000)
    if (s.phase === 'done') {
      expect(s.winner === 0 || s.winner === 1 || s.winner === null).toBe(true)
    }
  })
})
