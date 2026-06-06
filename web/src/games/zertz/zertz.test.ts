import { describe, it, expect } from 'vitest'
import {
  makeGame, key, legalCaptures, legalPlaceRemove, applyCapture, applyPlaceRemove,
  checkIsolation, hasWinningSet, isRemovable, mustCapture, aiTurn, liveCells,
  zeroCounts, bestChainFrom,
} from './logic'
import type { ZertzState, Jump } from './logic'

/* A tiny helper: a fresh game with a hand-set board. */
function blank(): ZertzState {
  const s = makeGame()
  const board: Record<string, any> = {}
  for (const k in s.board) board[k] = null
  return { ...s, board, captured: [zeroCounts(), zeroCounts()] }
}

describe('zertz logic', () => {
  it('a jump captures the jumped marble into the mover pile', () => {
    const s = blank()
    // marble on (0,0) jumps over (1,0) into (2,0)
    s.board[key(0, 0)] = 'w'
    s.board[key(1, 0)] = 'k'
    s.turn = 0
    const caps = legalCaptures(s, 0)
    const j = caps.find(c => c.from === key(0, 0) && c.over === key(1, 0) && c.to === key(2, 0))
    expect(j).toBeTruthy()
    const ns = applyCapture(s, [j!])
    expect(ns.captured[0].k).toBe(1)        // black jumped marble captured by player 0
    expect(ns.board[key(1, 0)]).toBeNull()  // jumped marble gone from board
    expect(ns.board[key(2, 0)]).toBe('w')   // mover landed beyond
    expect(ns.board[key(0, 0)]).toBeNull()  // mover left origin
  })

  it('capture is MANDATORY: place+remove is illegal when a jump exists', () => {
    const s = blank()
    s.board[key(0, 0)] = 'w'
    s.board[key(1, 0)] = 'k'
    s.turn = 0
    expect(mustCapture(s)).toBe(true)
    expect(legalPlaceRemove(s).length).toBe(0)
    // attempting a place does nothing (returns same state)
    const ns = applyPlaceRemove(s, 'g', key(-1, 0), key(0, 3))
    expect(ns.board[key(-1, 0)]).toBeNull()
  })

  it('place + remove: places a marble and removes a free edge ring', () => {
    const s = makeGame()
    const edge = key(0, 3)              // corner-ish, definitely on the rim → removable
    expect(isRemovable(s, edge)).toBe(true)
    const placeAt = key(0, 0)          // centre, empty
    const ns = applyPlaceRemove(s, 'w', placeAt, edge)
    expect(ns.board[placeAt]).toBe('w')
    expect(ns.removed[edge]).toBe(true)
    expect(liveCells(ns).length).toBe(liveCells(s).length - 1)
    expect(ns.supply.w).toBe(s.supply.w - 1)
    expect(ns.turn).toBe(1)            // turn passed to AI
  })

  it('chain captures: a marble keeps jumping while jumps remain', () => {
    const s = blank()
    // mover at (-2,0): jump E over (-1,0)→land (0,0), then jump E over (1,0)→land (2,0).
    s.board[key(-2, 0)] = 'w'
    s.board[key(-1, 0)] = 'k'   // first jump over (black)
    s.board[key(1, 0)] = 'g'    // second jump over (grey)
    s.turn = 0
    const chain = bestChainFrom(s, key(-2, 0))
    expect(chain.length).toBe(2)
    const ns = applyCapture(s, chain)
    expect(ns.captured[0].k).toBe(1)
    expect(ns.captured[0].g).toBe(1)
    expect(ns.board[key(2, 0)]).toBe('w')  // landed two jumps along
  })

  it('isolation of a fully-filled region captures those marbles', () => {
    const s = blank()
    // Build a 2-cell region {(2,1),(3,0)} (both on board) and sever it by removing the
    // only link between it and the rest. (3,0) corner neighbours within board: (2,0),(2,1),(3,-1)... .
    // Simplest: fill an entire isolated single-cell corner that has been cut off.
    // Use corner (3,0): its on-board neighbours are (2,0),(2,1),(3,-1). Fill (3,0) and
    // remove its neighbours so it's a filled singleton component.
    s.board[key(3, 0)] = 'w'
    s.removed[key(2, 0)] = true
    s.removed[key(2, 1)] = true
    s.removed[key(3, -1)] = true
    // now (3,0) is a connected component of size 1, fully filled
    const ns = checkIsolation(s, 0)
    expect(ns.captured[0].w).toBe(1)
    expect(ns.board[key(3, 0)]).toBeNull()
  })

  it('winning sets: 3 of a colour OR 1 of each are detected (0-counts safe)', () => {
    expect(hasWinningSet({ w: 3, g: 0, k: 0 })).toBe(true)
    expect(hasWinningSet({ w: 0, g: 0, k: 3 })).toBe(true)
    expect(hasWinningSet({ w: 1, g: 1, k: 1 })).toBe(true)
    expect(hasWinningSet({ w: 2, g: 2, k: 0 })).toBe(false)
    expect(hasWinningSet({ w: 0, g: 0, k: 0 })).toBe(false)
    expect(hasWinningSet(zeroCounts())).toBe(false)
  })

  it('a capture that completes a set ends the game with a valid winner', () => {
    const s = blank()
    s.board[key(0, 0)] = 'w'
    s.board[key(1, 0)] = 'k'
    s.turn = 0
    s.captured[0] = { w: 0, g: 0, k: 2 }   // need one more black
    const j: Jump = { from: key(0, 0), over: key(1, 0), to: key(2, 0) }
    const ns = applyCapture(s, [j])
    expect(ns.captured[0].k).toBe(3)
    expect(ns.winner).toBe(0)
  })

  it('self-play terminates under a cap with no throws and a valid winner if any', () => {
    let s = makeGame()
    let guard = 0
    const CAP = 4000
    expect(() => {
      while (s.winner == null && guard < CAP) {
        guard++
        const before = JSON.stringify({ b: s.board, r: s.removed, c: s.captured, t: s.turn })
        s = aiTurn(s)
        const after = JSON.stringify({ b: s.board, r: s.removed, c: s.captured, t: s.turn })
        if (before === after) break   // no progress → stop (shouldn't happen, but safe)
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(CAP)
    if (s.winner != null) {
      expect(s.winner === 0 || s.winner === 1).toBe(true)
    }
  })

  it('removable detection: an interior space is NOT removable, a rim space IS', () => {
    const s = makeGame()
    expect(isRemovable(s, key(0, 0))).toBe(false)  // centre, surrounded
    expect(isRemovable(s, key(3, 0))).toBe(true)   // corner of the hexagon
  })
})
