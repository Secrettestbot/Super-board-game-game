import { describe, it, expect } from 'vitest'
import * as PG from './logic'

// Pure logic test: no DOM. Verifies the dice mechanics deterministically (via applyRoll with
// fixed values) and plays full random games to prove they always terminate with a valid win.

describe('pig logic', () => {
  it('starts on a valid fresh game — 0–0, no turn total, you to move, no winner', () => {
    const s = PG.makeGame()
    expect(s.scores.you).toBe(0)
    expect(s.scores.ai).toBe(0)
    expect(s.turnTotal).toBe(0)
    expect(s.turn).toBe('you')
    expect(s.die).toBeNull()
    expect(s.winner).toBeNull()
  })

  it('a roll of 1 zeroes the turn total and passes the turn; other rolls accumulate', () => {
    let s = PG.makeGame()
    s = PG.applyRoll(s, 5)              // you roll 5
    expect(s.turnTotal).toBe(5)
    expect(s.turn).toBe('you')         // still your turn
    s = PG.applyRoll(s, 4)             // you roll 4
    expect(s.turnTotal).toBe(9)
    s = PG.applyRoll(s, 1)             // pig!
    expect(s.turnTotal).toBe(0)
    expect(s.busted).toBe(true)
    expect(s.turn).toBe('ai')          // turn passed, nothing banked
    expect(s.scores.you).toBe(0)
  })

  it('hold banks the turn total into the score and passes the turn', () => {
    let s = PG.makeGame()
    s = PG.applyRoll(s, 6)
    s = PG.applyRoll(s, 5)             // turn total 11
    expect(s.turnTotal).toBe(11)
    s = PG.hold(s, 'you')
    expect(s.scores.you).toBe(11)
    expect(s.turnTotal).toBe(0)
    expect(s.turn).toBe('ai')
    expect(s.winner).toBeNull()
  })

  it('banking to 100+ ends the game with a winner', () => {
    let s = PG.makeGame()
    s = Object.assign({}, s, { scores: { you: 95, ai: 40 }, turnTotal: 7 })
    s = PG.hold(s, 'you')
    expect(s.scores.you).toBe(102)
    expect(s.winner).toBe('you')
  })

  it('plays several full random games — always terminates, winner has >= 100, never throws', () => {
    for (let game = 0; game < 30; game++) {
      let s = PG.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 5000) {
        if (s.turn === 'you') {
          // simple human policy: roll until turn total >= 20, then hold
          if (s.turnTotal >= 20) s = PG.hold(s, 'you')
          else s = PG.roll(s, 'you')
        } else {
          s = PG.aiStep(s)
        }
      }
      expect(s.winner).not.toBeNull()                 // terminated within the cap
      expect(['you', 'ai']).toContain(s.winner)
      expect(s.scores[s.winner!]).toBeGreaterThanOrEqual(100)
    }
  })
})
