import { describe, it, expect } from 'vitest'
import * as UR from './logic'

// Reference logic test: pure, no DOM. Verifies the Ur invariants and plays a few full games
// (random human play vs the heuristic AI) to a real winner. `npm test` runs this in parallel.

describe('royal game of ur — logic', () => {
  it('starts valid: 7 pieces off each, none home, a player to move, board empty', () => {
    const s = UR.makeGame()
    expect(s.pieces.you).toHaveLength(UR.PIECES)
    expect(s.pieces.foe).toHaveLength(UR.PIECES)
    expect(s.pieces.you.every(v => v === UR.OFF)).toBe(true)
    expect(s.pieces.foe.every(v => v === UR.OFF)).toBe(true)
    expect(UR.home(s, 'you')).toBe(0)
    expect(UR.home(s, 'foe')).toBe(0)
    expect(UR.onBoard(s, 'you')).toBe(0)
    expect(UR.onBoard(s, 'foe')).toBe(0)
    expect(s.turn === 'you' || s.turn === 'foe').toBe(true)
    expect(s.winner).toBeNull()
  })

  it('the dice distribution returns 0..4', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 4000; i++) {
      const d = UR.rollDice()
      expect(d).toHaveLength(4)
      expect(d.every(x => x === 0 || x === 1)).toBe(true)
      const sum = UR.diceSum(d)
      expect(sum).toBeGreaterThanOrEqual(0)
      expect(sum).toBeLessThanOrEqual(4)
      seen.add(sum)
    }
    // binomial(4,.5) — every value 0..4 should appear in 4000 rolls
    for (let v = 0; v <= 4; v++) expect(seen.has(v)).toBe(true)
  })

  it('a capture on a shared non-rosette square sends the enemy piece back off-board', () => {
    let s = UR.makeGame()
    // place a foe piece on a shared, non-rosette square (track idx 6), and a you piece 2 behind (idx 4)
    s = { ...s, pieces: { you: [4, -1, -1, -1, -1, -1, -1], foe: [6, -1, -1, -1, -1, -1, -1] } }
    expect(UR.isShared(6)).toBe(true)
    expect(UR.ROSETTES.has(6)).toBe(false)
    // you to move, rolled a 2 → 4 -> 6 lands on the foe
    s = { ...s, turn: 'you', roll: 2, rolled: true }
    const dest = UR.destOf(s, 'you', 0, 2)
    expect(dest).toBe(6)
    const after = UR.move(s, 'you', 0)
    expect(after.pieces.you[0]).toBe(6)            // you advanced onto it
    expect(after.pieces.foe[0]).toBe(UR.OFF)       // foe piece sent home off-board
  })

  it('the central rosette is safe — you cannot capture there', () => {
    let s = UR.makeGame()
    s = { ...s, pieces: { you: [UR.SAFE_ROSETTE - 1, -1, -1, -1, -1, -1, -1], foe: [UR.SAFE_ROSETTE, -1, -1, -1, -1, -1, -1] }, turn: 'you', roll: 1, rolled: true }
    // moving onto the safe rosette where an enemy sits is ILLEGAL
    expect(UR.destOf(s, 'you', 0, 1)).toBeNull()
  })

  it('landing on a rosette grants an extra turn — the turn stays the same player', () => {
    let s = UR.makeGame()
    // you piece one short of a rosette (idx 3), roll a 1 → lands on rosette 3
    s = { ...s, pieces: { you: [2, -1, -1, -1, -1, -1, -1], foe: new Array(UR.PIECES).fill(-1) }, turn: 'you', roll: 1, rolled: true }
    expect(UR.ROSETTES.has(3)).toBe(true)
    const after = UR.move(s, 'you', 0)
    expect(after.pieces.you[0]).toBe(3)
    expect(after.turn).toBe('you')                 // extra turn — still you
    expect(after.rolled).toBe(false)               // must roll again
  })

  it('bearing off requires the exact roll', () => {
    let s = UR.makeGame()
    // a you piece on the last track square (13), needs exactly 1 to bear off
    s = { ...s, pieces: { you: [13, -1, -1, -1, -1, -1, -1], foe: new Array(UR.PIECES).fill(-1) }, turn: 'you' }
    expect(UR.destOf(s, 'you', 0, 1)).toBe(UR.HOME) // exact → off
    expect(UR.destOf(s, 'you', 0, 2)).toBeNull()    // overshoot → illegal
    expect(UR.destOf(s, 'you', 0, 3)).toBeNull()
  })

  it('plays a few full games to a valid winner without throwing, and terminates fast', () => {
    for (let game = 0; game < 4; game++) {
      let s = UR.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 20000) {
        if (s.turn === 'you') {
          if (!s.rolled) {
            s = UR.doRoll(s)                        // roll (auto-passes a 0 / dead roll)
          } else {
            const moves = UR.legalMoves(s, 'you', s.roll!)
            // a piece must be movable here (doRoll only sets rolled when a move exists)
            expect(moves.length).toBeGreaterThan(0)
            s = UR.move(s, 'you', moves[(Math.random() * moves.length) | 0])
          }
        } else {
          s = UR.aiStep(s)
        }
      }
      expect(s.winner).not.toBeNull()                            // terminated with a winner
      expect(s.winner === 'you' || s.winner === 'foe').toBe(true)
      expect(UR.home(s, s.winner!)).toBe(UR.PIECES)              // winner bore all 7 off
    }
  })
})
