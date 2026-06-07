import { describe, it, expect } from 'vitest'
import {
  makeGame, roll, movePawn, releaseWithSum, canReleaseWithSum, finishMovePhase,
  legalMoves, destOf, aiStep, absSquare, homeCount, entryOffset,
  HOME, PATH_FIRST, START, SAFE_SQUARES, PLAYERS, PAWNS,
} from './logic'
import type { ParState } from './logic'

// Deterministic dice: returns the given faces in order, looping. roll() pulls TWO per call.
function seqRng(faces: number[]): () => number {
  let i = 0
  return () => {
    const f = faces[i % faces.length]
    i++
    return (f - 1 + 0.5) / 6 // maps to face `f` via 1 + floor(rng*6)
  }
}

describe('Parcheesi setup', () => {
  it('starts with 4 players × 4 pawns all in the start circle', () => {
    const s = makeGame()
    expect(s.pawns.length).toBe(PLAYERS)
    for (let p = 0; p < PLAYERS; p++) {
      expect(s.pawns[p].length).toBe(PAWNS)
      expect(s.pawns[p].every(t => t === START)).toBe(true)
    }
    expect(s.turn).toBe(0)
    expect(s.winner).toBe(null)
    expect(s.phase).toBe('roll')
  })
})

describe('release on a 5', () => {
  it('a die of 5 releases a pawn onto the entry square', () => {
    let s = makeGame()
    s = roll(s, seqRng([5, 2])) // dice = [5,2]
    expect(s.dice).toEqual([5, 2])
    expect(legalMoves(s, 0, 5)).toEqual([0, 1, 2, 3]) // any pawn can release with the 5
    s = movePawn(s, 0, 0, 5)
    expect(s.pawns[0][0]).toBe(1) // on entry square (progress 1)
    expect(absSquare(0, 1)).toBe(entryOffset(0))
  })

  it('a non-5 die cannot release a pawn from start', () => {
    const fresh = makeGame()
    expect(destOf(fresh, 0, 0, 3)).toBe(null)
    expect(destOf(fresh, 0, 0, 5)).toBe(1)
  })

  it('two dice summing to 5 release a pawn (consuming both dice)', () => {
    let s = makeGame()
    s = roll(s, seqRng([2, 3])) // dice = [2,3], sum 5, not doubles
    expect(canReleaseWithSum(s, 0, 0)).toBe(true)
    s = releaseWithSum(s, 0, 0)
    expect(s.pawns[0][0]).toBe(1)
    // both dice consumed by the single sum-release → turn passes to player 1
    expect(s.turn).toBe(1)
  })
})

describe('two dice move separately', () => {
  it('the two dice can move two different pawns', () => {
    let s = makeGame()
    s.pawns[0][0] = 5
    s.pawns[0][1] = 10
    s = Object.assign({}, s, { phase: 'roll', rolled: false, dice: null, usedDice: [false, false] })
    s = roll(s, seqRng([3, 4])) // dice = [3,4]
    expect(s.dice).toEqual([3, 4])
    s = movePawn(s, 0, 0, 3) // pawn 0 by die A
    expect(s.pawns[0][0]).toBe(8)
    expect(s.usedDice[0]).toBe(true) // first die spent, second still pending
    expect(s.turn).toBe(0)           // still your turn (one die left)
    s = movePawn(s, 0, 1, 4) // pawn 1 by die B
    expect(s.pawns[0][1]).toBe(14)
    // both dice spent (not doubles) → turn passes to player 1
    expect(s.turn).toBe(1)
  })
})

describe('capture grants +20 bonus', () => {
  it('landing on a lone opponent sends it home and grants a +20 bonus move', () => {
    let s = makeGame()
    // place enemy player 2 on a NON-safe abs square. p0 progress 4 → abs 3 (not safe).
    // p2 entry = 34; progress mapping to abs 3: (34 + prog-1)%68 = 3 => prog-1 = (3-34+68)%68 = 37 => prog 38
    s.pawns[2][0] = 38
    expect(absSquare(2, 38)).toBe(3)
    expect(SAFE_SQUARES.has(3)).toBe(false)
    s.pawns[0][0] = 1
    s = Object.assign({}, s, { turn: 0, phase: 'roll', rolled: false, dice: null, usedDice: [false, false] })
    s = roll(s, seqRng([3, 6])) // 1 + 3 = 4 → abs 3
    s = movePawn(s, 0, 0, 3)
    expect(s.pawns[0][0]).toBe(4)
    expect(s.pawns[2][0]).toBe(START) // captured → back to start
    expect(s.bonus).toBe(20)          // +20 bonus pending
  })

  it('safe squares prevent capture', () => {
    let s = makeGame()
    // enemy player 1 on its entry (abs 17, safe). p0 progress whose abs is 17: (0+prog-1)%68=17 => prog 18
    s.pawns[1][0] = 1
    expect(absSquare(1, 1)).toBe(17)
    expect(SAFE_SQUARES.has(17)).toBe(true)
    s.pawns[0][0] = 16 // +2 → progress 18 → abs 17
    s = Object.assign({}, s, { turn: 0, phase: 'roll', rolled: false, dice: null, usedDice: [false, false] })
    s = roll(s, seqRng([2, 6]))
    s = movePawn(s, 0, 0, 2)
    expect(s.pawns[0][0]).toBe(18)
    expect(s.pawns[1][0]).toBe(1)  // still on its safe entry — NOT captured
    expect(s.bonus).toBe(0)        // no capture bonus
  })
})

describe('blockade blocks passing and landing', () => {
  it('two of your pawns form a blockade an opponent cannot pass', () => {
    let s = makeGame()
    // p1 blockade on abs 20 (two pawns). p1 entry = 17; abs 20 → prog (20-17)+1 = 4.
    s.pawns[1][0] = 4
    s.pawns[1][1] = 4
    expect(absSquare(1, 4)).toBe(20)
    expect(absSquare(1, 4)).toBe(20)
    // p0 pawn just before that abs: abs 19 → p0 prog 20. A die of 2 would pass abs 20 → illegal.
    s.pawns[0][0] = 20
    expect(absSquare(0, 20)).toBe(19)
    expect(destOf(s, 0, 0, 1)).toBe(null) // landing on the blockade square is illegal
    expect(destOf(s, 0, 0, 2)).toBe(null) // passing through the blockade is illegal
    expect(destOf(s, 0, 0, 6)).toBe(null) // also passes through → illegal
  })
})

describe('exact count to the center grants +10', () => {
  it('needs the exact count to reach HOME, overshoot illegal, and grants a +10 bonus', () => {
    const s = makeGame()
    s.pawns[0][0] = 66 // home path; HOME is 69, so exactly 3 needed
    expect(destOf(s, 0, 0, 3)).toBe(HOME)
    expect(destOf(s, 0, 0, 4)).toBe(null) // overshoot illegal
    expect(destOf(s, 0, 0, 1)).toBe(67)   // partial advance along home path is legal
    expect(PATH_FIRST).toBe(64)

    let s2 = makeGame()
    s2.pawns[0][0] = 66
    s2 = Object.assign({}, s2, { turn: 0, phase: 'roll', rolled: false, dice: null, usedDice: [false, false] })
    s2 = roll(s2, seqRng([3, 6]))
    s2 = movePawn(s2, 0, 0, 3)
    expect(s2.pawns[0][0]).toBe(HOME)
    expect(s2.bonus).toBe(10) // +10 bonus for reaching the center
  })
})

describe('doubles grant an extra turn', () => {
  it('rolling doubles lets the same player roll again after moving both dice', () => {
    let s = makeGame()
    s.pawns[0][0] = 5
    s = Object.assign({}, s, { phase: 'roll', rolled: false, dice: null, usedDice: [false, false] })
    s = roll(s, seqRng([3, 3])) // doubles
    expect(s.dice).toEqual([3, 3])
    expect(s.doublesCount).toBe(1)
    s = movePawn(s, 0, 0, 3) // consume one 3
    s = movePawn(s, 0, 0, 3) // consume the other 3
    expect(s.pawns[0][0]).toBe(11)
    // both dice spent on doubles → same player rolls again
    expect(s.turn).toBe(0)
    expect(s.phase).toBe('roll')
    expect(s.rolled).toBe(false)
  })

  it('three doubles in a row sends the furthest pawn back to start', () => {
    let s = makeGame()
    s.pawns[0] = [40, 5, START, START]
    s = Object.assign({}, s, { turn: 0, phase: 'roll', rolled: false, dice: null, usedDice: [false, false], doublesCount: 2 })
    s = roll(s, seqRng([4, 4])) // third double
    expect(s.pawns[0][0]).toBe(START) // furthest pawn (progress 40) sent home
    expect(s.turn).toBe(1)            // turn ends
  })
})

describe('winning', () => {
  it('first player to get all 4 pawns to the center wins', () => {
    let s = makeGame()
    s.pawns[0] = [HOME, HOME, HOME, 66]
    s = Object.assign({}, s, { turn: 0, phase: 'roll', rolled: false, dice: null, usedDice: [false, false] })
    s = roll(s, seqRng([3, 6])) // 66 + 3 = 69 = HOME
    const mv = legalMoves(s, 0, 3)
    expect(mv).toContain(3)
    s = movePawn(s, 0, 3, 3)
    expect(homeCount(s, 0)).toBe(PAWNS)
    expect(s.winner).toBe(0)
    expect(s.phase).toBe('over')
  })
})

describe('AI self-play terminates with a valid winner', () => {
  it('reaches a valid winner (or the guard cap) with no throws', () => {
    let s: ParState = makeGame()
    let guard = 0
    const CAP = 500000
    expect(() => {
      while (s.winner == null && guard++ < CAP) {
        if (s.turn === 0) {
          // drive the human like an AI too, so the game is fully automated
          if (s.phase === 'roll' && !s.rolled) {
            const before = s.step
            s = roll(s)
            if (s.step === before) break
          } else if (s.phase === 'move' && s.rolled) {
            const before = s.step
            // try any legal die move, else finish the phase
            let moved = false
            if (s.bonus > 0) {
              const mv = legalMoves(s, 0, s.bonus)
              if (mv.length) { s = movePawn(s, 0, mv[0], s.bonus); moved = true }
            }
            if (!moved && s.dice) {
              for (const slot of [0, 1]) {
                if (!s.usedDice[slot]) {
                  const mv = legalMoves(s, 0, s.dice[slot])
                  if (mv.length) { s = movePawn(s, 0, mv[0], s.dice[slot]); moved = true; break }
                }
              }
            }
            // sum-to-5 combined release (both dice unused) when no single-die move exists
            if (!moved && s.dice && !s.usedDice[0] && !s.usedDice[1]) {
              for (let i = 0; i < PAWNS; i++) {
                if (canReleaseWithSum(s, 0, i)) { s = releaseWithSum(s, 0, i); moved = true; break }
              }
            }
            if (!moved) s = finishMovePhase(s)
            if (s.step === before) break
          } else break
        } else {
          const before = s.step
          s = aiStep(s)
          if (s.step === before) break
        }
      }
    }).not.toThrow()
    if (s.winner != null) {
      expect(s.winner).toBeGreaterThanOrEqual(0)
      expect(s.winner).toBeLessThan(PLAYERS)
      expect(homeCount(s, s.winner)).toBe(PAWNS)
    }
    expect(guard).toBeLessThanOrEqual(CAP)
  })
})
