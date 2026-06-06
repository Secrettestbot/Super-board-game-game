import { describe, it, expect } from 'vitest'
import * as MM from './logic'
import type { Peg } from './logic'

// Pure logic test: no DOM. Exercises the feedback oracle on known cases and runs a
// full deductive solve from a fresh game. `npm test` runs this alongside every game's test.

const { COLORS, SLOTS, MAX_GUESSES } = MM

describe('mastermind logic', () => {
  it('makeGame() is valid — 4-peg secret over the colour set, no guesses, not over', () => {
    const s = MM.makeGame()
    expect(s.secret).toHaveLength(SLOTS)
    expect(s.secret.every(p => p >= 0 && p < COLORS && Number.isInteger(p))).toBe(true)
    expect(s.rows).toHaveLength(0)
    expect(s.guesses).toBe(0)
    expect(s.over).toBe(false)
    expect(s.won).toBe(false)
  })

  it('feedback: an exact match is all black', () => {
    expect(MM.feedback([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ black: 4, white: 0 })
  })

  it('feedback: right colours all in wrong spots is all white', () => {
    // a derangement of the secret — every colour present, none in place
    expect(MM.feedback([0, 1, 2, 3], [1, 0, 3, 2])).toEqual({ black: 0, white: 4 })
    expect(MM.feedback([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ black: 0, white: 4 })
  })

  it('feedback: a total miss is zero/zero', () => {
    expect(MM.feedback([0, 0, 0, 0], [1, 1, 1, 1])).toEqual({ black: 0, white: 0 })
  })

  it('feedback: duplicates obey the per-colour min-count rule', () => {
    // secret has one 0; guess has three 0s → only one 0 can match. The leading 0 is
    // black (right spot); the other guess-0s find no secret-0 left → no whites for them.
    expect(MM.feedback([0, 1, 2, 3], [0, 0, 0, 0])).toEqual({ black: 1, white: 0 })
    // secret [1,1,2,3]; guess [2,3,1,1] — every guess peg has a matching colour in the
    // secret but none in the right spot: 1↔1 (×2), 2, 3 → 0 black, 4 white.
    expect(MM.feedback([1, 1, 2, 3], [2, 3, 1, 1])).toEqual({ black: 0, white: 4 })
    // mixed: secret [1,2,1,2], guess [1,1,2,2] → spots 0 and 3 black; remaining 1↔2 swap → 2 white
    expect(MM.feedback([1, 2, 1, 2], [1, 1, 2, 2])).toEqual({ black: 2, white: 2 })
  })

  it('feedback: black + white never exceeds the number of slots, over random pairs', () => {
    const rnd = () => Array.from({ length: SLOTS }, () => (Math.random() * COLORS) | 0) as Peg[]
    for (let i = 0; i < 500; i++) {
      const fb = MM.feedback(rnd(), rnd())
      expect(fb.black + fb.white).toBeLessThanOrEqual(SLOTS)
      expect(fb.black).toBeGreaterThanOrEqual(0)
      expect(fb.white).toBeGreaterThanOrEqual(0)
    }
  })

  it('full deductive solve: filters the candidate space by feedback consistency and wins ≤ 10', () => {
    // enumerate every possible code once
    function allCodes(): Peg[][] {
      let codes: Peg[][] = [[]]
      for (let i = 0; i < SLOTS; i++) {
        const next: Peg[][] = []
        for (const c of codes) for (let v = 0; v < COLORS; v++) next.push(c.concat([v as Peg]))
        codes = next
      }
      return codes
    }
    const fbEq = (a: MM.Feedback, b: MM.Feedback) => a.black === b.black && a.white === b.white

    for (let trial = 0; trial < 20; trial++) {
      let s = MM.makeGame()
      let candidates = allCodes()
      let guard = 0
      while (!s.over && guard++ < MAX_GUESSES + 1) {
        // pick any remaining consistent candidate as the next guess
        const guess = candidates[0]
        s = MM.submit(s, guess)
        const last = s.rows[s.rows.length - 1]
        // prune candidates to those that would have produced the same feedback
        candidates = candidates.filter(c => fbEq(MM.feedback(c, last.guess), last.fb))
        expect(candidates.length).toBeGreaterThan(0) // truth is always still in the set
      }
      expect(s.over).toBe(true)
      expect(s.won).toBe(true)
      expect(s.guesses).toBeLessThanOrEqual(MAX_GUESSES)
    }
  })
})
