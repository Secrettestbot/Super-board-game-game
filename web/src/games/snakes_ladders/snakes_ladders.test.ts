import { describe, it, expect } from 'vitest'
import * as SL from './logic'
import type { SLState } from './logic'

// Pure logic test: no DOM. Dice are injected (fixed rng) so nothing needs mocking, and a
// deterministic self-play proves games always terminate with a valid winner.

// Helper: an rng returning a fixed die face d (1..6) via 1 + floor(rng*6) = d.
const rngFor = (d: number) => () => (d - 1) / 6 + 0.001

// Helper: set the current player's position directly.
function at(s: SLState, player: number, pos: number): SLState {
  const positions = s.positions.slice()
  positions[player] = pos
  return Object.assign({}, s, { positions })
}

describe('snakes & ladders logic', () => {
  it('boustrophedon mapping: square→row/col and back are consistent', () => {
    // square 1 = bottom-left
    expect(SL.squareToRC(1)).toEqual({ row: 0, col: 0 })
    // square 10 = bottom-right (even row, left→right)
    expect(SL.squareToRC(10)).toEqual({ row: 0, col: 9 })
    // square 11 = second row, right end (odd row runs right→left so 11 sits at col 9)
    expect(SL.squareToRC(11)).toEqual({ row: 1, col: 9 })
    // square 20 = second row, left end
    expect(SL.squareToRC(20)).toEqual({ row: 1, col: 0 })
    // square 100 = top-left (row 9 is odd → right→left, 100 lands at col 0)
    expect(SL.squareToRC(100)).toEqual({ row: 9, col: 0 })
    // round-trip every square
    for (let n = 1; n <= 100; n++) {
      const { row, col } = SL.squareToRC(n)
      expect(SL.rcToSquare(row, col)).toBe(n)
    }
  })

  it('a fresh game starts valid — all off-board, you to move, no winner', () => {
    const s = SL.makeGame()
    expect(s.positions).toEqual([0, 0, 0, 0])
    expect(s.turn).toBe(0)
    expect(s.die).toBeNull()
    expect(s.winner).toBeNull()
  })

  it('moving advances the token by the die', () => {
    let s = SL.makeGame({})        // empty layout → no jumps to interfere
    s = at(s, 0, 10)
    s = SL.roll(s, rngFor(5))      // 10 + 5 = 15, no jump
    expect(s.positions[0]).toBe(15)
    expect(s.die).toBe(5)
  })

  it('landing on a ladder bottom climbs to its top', () => {
    let s = SL.makeGame({ 4: 14 })  // ladder 4 → 14
    s = at(s, 0, 1)
    s = SL.roll(s, rngFor(3))       // 1 + 3 = 4 → ladder → 14
    expect(s.positions[0]).toBe(14)
    expect(s.last?.jump).toBe('ladder')
  })

  it('landing on a snake head slides down to its tail', () => {
    let s = SL.makeGame({ 16: 6 })  // snake 16 → 6
    s = at(s, 0, 12)
    s = SL.roll(s, rngFor(4))       // 12 + 4 = 16 → snake → 6
    expect(s.positions[0]).toBe(6)
    expect(s.last?.jump).toBe('snake')
  })

  it('reaching 100 wins; overshoot also wins and clamps to 100', () => {
    // exact reach
    let a = SL.makeGame({})
    a = at(a, 0, 97)
    a = SL.roll(a, rngFor(3))       // 97 + 3 = 100
    expect(a.positions[0]).toBe(100)
    expect(a.winner).toBe(0)

    // overshoot wins too (reach-or-overshoot rule), clamped to 100
    let b = SL.makeGame({})
    b = at(b, 0, 98)
    b = SL.roll(b, rngFor(5))       // 98 + 5 = 103 → win, clamp 100
    expect(b.positions[0]).toBe(100)
    expect(b.winner).toBe(0)
  })

  it('rolling a 6 grants an extra turn (same player keeps the turn)', () => {
    let s = SL.makeGame({})
    s = SL.roll(s, rngFor(6))        // you roll a 6
    expect(s.rolledSix).toBe(true)
    expect(s.extraTurn).toBe(true)
    expect(s.positions[0]).toBe(6)
    s = SL.endTurn(s)               // extra turn → stays player 0, die re-armed
    expect(s.turn).toBe(0)
    expect(s.die).toBeNull()
  })

  it('a non-6 ends the turn and passes to the next player', () => {
    let s = SL.makeGame({})
    s = SL.roll(s, rngFor(2))
    expect(s.extraTurn).toBe(false)
    s = SL.endTurn(s)
    expect(s.turn).toBe(1)
  })

  it('deterministic self-play reaches a valid winner under a guard cap with no throws', () => {
    // rng cycles through faces so all 4 players make forward progress; bounded loop.
    let seed = 7
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    for (let game = 0; game < 25; game++) {
      let s = SL.makeGame()
      let guard = 0
      while (s.winner == null && guard++ < 100000) {
        if (s.turn === 0) {
          // human modeled as a plain roller
          s = SL.roll(s, rng)
          if (s.winner == null) s = SL.endTurn(s)
        } else {
          s = SL.aiTurn(s, rng)
        }
      }
      expect(s.winner).not.toBeNull()
      expect([0, 1, 2, 3]).toContain(s.winner)
      expect(s.positions[s.winner!]).toBe(100)
    }
  })
})
