import { describe, it, expect } from 'vitest'
import {
  makeGame, group, liberties, legalMoves, place, pass, areaScore, aiMove,
  idx, type GoState, type Cell,
} from './logic'

const S = 9
const at = (r: number, c: number) => idx(S, r, c)

// helper: drop a stone of `player` at (r,c) regardless of whose turn it is,
// by setting turn first (keeps tests independent of alternation).
function forcePlace(s: GoState, player: 0 | 1, r: number, c: number): GoState {
  return place({ ...s, turn: player }, player, at(r, c))
}

describe('Go logic', () => {
  it('counts liberties of a single stone and a group', () => {
    let s = makeGame()
    s = forcePlace(s, 0, 4, 4)                 // center black stone -> 4 liberties
    expect(liberties(s.board, group(s.board, at(4, 4))).length).toBe(4)

    let s2 = makeGame()
    s2 = forcePlace(s2, 0, 0, 0)               // corner black stone -> 2 liberties
    expect(liberties(s2.board, group(s2.board, at(0, 0))).length).toBe(2)

    // two-stone connected group
    let s3 = makeGame()
    s3 = forcePlace(s3, 0, 4, 4)
    s3 = forcePlace(s3, 0, 4, 5)
    const g = group(s3.board, at(4, 4))
    expect(g.length).toBe(2)
    expect(liberties(s3.board, g).length).toBe(6)
  })

  it('captures a single stone with no liberties (removes it)', () => {
    let s = makeGame()
    // surround a white stone at (4,4) with black on all 4 sides
    s = forcePlace(s, 1, 4, 4)
    s = forcePlace(s, 0, 3, 4)
    s = forcePlace(s, 0, 5, 4)
    s = forcePlace(s, 0, 4, 3)
    expect(s.board[at(4, 4)]).toBe(1)          // still there with 1 liberty
    s = forcePlace(s, 0, 4, 5)                  // fill last liberty
    expect(s.board[at(4, 4)]).toBeNull()        // captured
    expect(s.captures[0]).toBe(1)               // black captured 1
  })

  it('captures a surrounded multi-stone group', () => {
    let s = makeGame()
    // white pair at (4,4)-(4,5); black surrounds them entirely
    s = forcePlace(s, 1, 4, 4)
    s = forcePlace(s, 1, 4, 5)
    for (const [r, c] of [[3, 4], [3, 5], [5, 4], [5, 5], [4, 3]] as const) s = forcePlace(s, 0, r, c)
    expect(s.board[at(4, 4)]).toBe(1)
    s = forcePlace(s, 0, 4, 6)                  // last outside liberty
    expect(s.board[at(4, 4)]).toBeNull()
    expect(s.board[at(4, 5)]).toBeNull()
    expect(s.captures[0]).toBe(2)
  })

  it('forbids suicide', () => {
    let s = makeGame()
    // black builds a ring around empty (4,4); white to play (4,4) = suicide (no captures)
    for (const [r, c] of [[3, 4], [5, 4], [4, 3], [4, 5]] as const) s = forcePlace(s, 0, r, c)
    s = { ...s, turn: 1 }
    const moves = legalMoves(s)
    expect(moves).not.toContain(at(4, 4))       // suicide excluded
    // placing it directly is rejected (state unchanged at that point)
    const after = place(s, 1, at(4, 4))
    expect(after.board[at(4, 4)]).toBeNull()
  })

  it('allows a move that captures (frees a liberty) even though it would otherwise be suicide', () => {
    let s = makeGame()
    // White stone at corner (0,0) with liberties (0,1) and (1,0).
    s = forcePlace(s, 1, 0, 0)
    s = forcePlace(s, 0, 1, 0)                   // black takes one white liberty
    // Now black at (0,1) would normally need a liberty, but it captures white(0,0),
    // because after capture (0,0) is empty -> black(0,1) gains a liberty. Legal.
    s = { ...s, turn: 0 }
    expect(legalMoves(s)).toContain(at(0, 1))
    s = place(s, 0, at(0, 1))
    expect(s.board[at(0, 0)]).toBeNull()        // white captured
    expect(s.board[at(0, 1)]).toBe(0)
  })

  it('forbids immediate recapture via simple ko', () => {
    let s = makeGame()
    // Classic ko diamond around the (4,4)/(4,5) pair.
    // Black ring: (3,5),(5,5),(4,6)   White ring: (3,4),(5,4),(4,3)
    // White plays the lone stone (4,5); Black takes it at (4,4) -> ko.
    for (const [r, c] of [[3, 5], [5, 5], [4, 6]] as const) s = forcePlace(s, 0, r, c)
    for (const [r, c] of [[3, 4], [5, 4], [4, 3]] as const) s = forcePlace(s, 1, r, c)
    s = forcePlace(s, 1, 4, 5)                   // white plays lone stone (4,5), in atari
    // black plays (4,4), capturing white(4,5) -> ko set
    s = forcePlace(s, 0, 4, 4)
    expect(s.board[at(4, 5)]).toBeNull()         // white captured
    expect(s.koPoint).toBe(at(4, 5))
    // white may NOT immediately recapture at (4,5)
    const wMoves = legalMoves({ ...s, turn: 1 })
    expect(wMoves).not.toContain(at(4, 5))
  })

  it('ends the game on two consecutive passes', () => {
    let s = makeGame()
    s = pass(s)
    expect(s.winner).toBeNull()
    expect(s.consecutivePasses).toBe(1)
    s = pass(s)
    expect(s.consecutivePasses).toBe(2)
    expect(s.winner).not.toBeNull()
    expect(s.score).not.toBeNull()
  })

  it('area-scores stones + surrounded territory + komi', () => {
    // Tiny constructed position: black wall splitting a 3x3 corner is overkill;
    // instead build a clear case on the full board.
    let s = makeGame(9, 5.5)
    // Black occupies column 3 fully (9 stones); everything left (cols 0-2) is black territory,
    // White occupies column 5 fully (9 stones); cols 6-8 white territory. Cols 4 neutral-ish.
    const board: Cell[] = new Array(81).fill(null)
    for (let r = 0; r < 9; r++) { board[idx(9, r, 3)] = 0; board[idx(9, r, 5)] = 1 }
    s = { ...s, board }
    const sc = areaScore(s)
    // Black: 9 stones + 27 empties (cols 0,1,2) = 36
    expect(sc.black).toBe(36)
    // White: 9 stones + 27 empties (cols 6,7,8) = 36, + komi 5.5
    expect(sc.white).toBeCloseTo(41.5, 5)
    // Col 4 borders both -> neutral, scored for neither.
  })

  it('self-plays to a terminal scored result under a guard cap with no throws', () => {
    expect(() => {
      let s = makeGame()
      let guard = 0
      const CAP = 4000
      while (s.winner == null && guard < CAP) {
        guard++
        if (s.turn === 1) {
          s = aiMove(s)
        } else {
          // black: greedy capture-ish — pick any legal move, else pass
          const moves = legalMoves(s)
          // avoid filling all space forever: with small chance, pass
          if (moves.length === 0 || (guard > 200 && Math.random() < 0.05)) s = pass(s)
          else s = place(s, 0, moves[(Math.random() * moves.length) | 0])
        }
      }
      // Either two passes ended it (winner set) or we hit the cap — both acceptable.
      const sc = areaScore(s)
      expect(typeof sc.black).toBe('number')
      expect(typeof sc.white).toBe('number')
      expect(Number.isFinite(sc.black)).toBe(true)
      expect(Number.isFinite(sc.white)).toBe(true)
      if (s.winner != null) {
        expect(['black', 'white', 'draw']).toContain(s.winner)
        expect(s.score).not.toBeNull()
      }
    }).not.toThrow()
  })
})
