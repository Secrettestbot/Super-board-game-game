import { describe, it, expect } from 'vitest'
import * as SB from './logic'
import type { ShutBoxState } from './logic'

// Pure logic test, no DOM. Exercises subset-sum validity, shutting, the stuck/score rule,
// and simulates a few full greedy games asserting no throws and a valid result. `npm test`
// runs this alongside every other game's test.

describe('shut the box logic', () => {
  it('starts with a valid box — all nine tiles up, you to roll, scores unset', () => {
    const s = SB.makeGame()
    expect(s.tiles).toHaveLength(9)
    expect(s.tiles.every(t => t === true)).toBe(true)
    expect(SB.upSum(s.tiles)).toBe(45)
    expect(s.turn).toBe('you')
    expect(s.rolled).toBe(false)
    expect(s.scores.you).toBeNull()
    expect(s.scores.ai).toBeNull()
    expect(s.winner).toBeNull()
  })

  it('subset-sum validity: detects whether a shut exists, and validates a chosen subset', () => {
    const up = [1, 2, 4, 6, 9]
    expect(SB.hasSubset(up, 7)).toBe(true)   // 1+6 or 1+2+4
    expect(SB.hasSubset(up, 3)).toBe(true)   // 1+2
    expect(SB.hasSubset(up, 8)).toBe(true)   // 2+6 = 8
    expect(SB.hasSubset(up, 12)).toBe(true)  // 2+4+6

    expect(SB.isValidSubset(up, [1, 6], 7)).toBe(true)
    expect(SB.isValidSubset(up, [1, 2, 4], 7)).toBe(true)
    expect(SB.isValidSubset(up, [6], 7)).toBe(false)        // wrong sum
    expect(SB.isValidSubset(up, [3], 3)).toBe(false)        // 3 is not up
    expect(SB.isValidSubset(up, [1, 1], 2)).toBe(false)     // no repeats
    expect(SB.isValidSubset(up, [], 0)).toBe(false)         // empty never valid
  })

  it('shutting a valid subset flips exactly those tiles down', () => {
    let s = forceRoll(SB.makeGame(), 3, 4)    // total 7
    expect(s.rolled).toBe(true)
    s = SB.shut(s, [3, 4])
    expect(s.tiles[2]).toBe(false)            // tile "3" down
    expect(s.tiles[3]).toBe(false)            // tile "4" down
    expect(s.tiles[0]).toBe(true)             // tile "1" still up
    expect(s.rolled).toBe(false)              // ready to roll again
    expect(SB.upSum(s.tiles)).toBe(45 - 7)
  })

  it('an invalid shut is rejected (state unchanged)', () => {
    let s = forceRoll(SB.makeGame(), 3, 4)    // total 7
    const before = s.tiles.slice()
    s = SB.shut(s, [2, 4])                     // sums to 6, not 7
    expect(s.tiles).toEqual(before)
    expect(s.rolled).toBe(true)
  })

  it('a roll with no matching subset ends the turn; score = sum of up tiles', () => {
    // Box with only tile 2 up, then roll a 5 -> impossible -> stuck with 2.
    let s = SB.makeGame()
    const tiles = new Array(9).fill(false)
    tiles[8] = true                            // only "9" up (7,8 shut but 9 up → two dice forced)
    s = Object.assign({}, s, { tiles }) as ShutBoxState
    s = forceRoll(s, 2, 3)                      // total 5, no subset of {9} → dead roll ends the turn
    expect(s.scores.you).toBe(9)                // leftover sum recorded as the score
    expect(s.turn).toBe('ai')                  // handed off to the rival
  })

  it('shutting every tile scores a perfect 0', () => {
    let s = SB.makeGame()
    const tiles = new Array(9).fill(false)
    tiles[5] = true                            // only "6" up
    s = Object.assign({}, s, { tiles }) as ShutBoxState
    s = forceRoll(s, 4, 2)                      // total 6
    s = SB.shut(s, [6])
    expect(s.scores.you).toBe(0)
    expect(s.turn).toBe('ai')
  })

  it('plays a few full greedy games — no throws, fast termination, valid winner', () => {
    let seed = 12345
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

    for (let g = 0; g < 4; g++) {
      let s = SB.makeGame()
      let guard = 0
      while (!s.winner) {
        if (++guard > 2000) throw new Error('did not terminate')
        if (s.turn === 'you') {
          // human side also auto-plays greedily so the game runs to completion
          if (!s.rolled) {
            const useOne = SB.canRollOne(s.tiles) && SB.upSum(s.tiles) <= 6
            s = SB.roll(s, useOne, rng)
          } else {
            const total = s.dice[0] + s.dice[1]
            const pick = SB.bestSubset(SB.upNumbers(s.tiles), total)
            expect(pick).not.toBeNull()         // we only reach here when a move exists
            s = SB.shut(s, pick!)
          }
        } else {
          s = SB.aiStep(s, rng)
        }
      }

      expect(s.winner === 'you' || s.winner === 'ai' || s.winner === 'draw').toBe(true)
      const ys = s.scores.you!, as = s.scores.ai!
      expect(ys).toBeGreaterThanOrEqual(0)
      expect(as).toBeGreaterThanOrEqual(0)
      if (s.winner === 'you') expect(ys).toBeLessThan(as)
      else if (s.winner === 'ai') expect(as).toBeLessThan(ys)
      else expect(ys).toBe(as)                  // draw means equal scores
    }
  })
})

// Helper: deterministically set the dice for the player at the table (bypasses RNG) by
// feeding roll() a generator that yields the two desired faces in order.
function forceRoll(s: ShutBoxState, a: number, b: number): ShutBoxState {
  const faces = [(a - 1) / 6 + 0.001, (b - 1) / 6 + 0.001]
  let i = 0
  return SB.roll(s, false, () => faces[i++])
}
