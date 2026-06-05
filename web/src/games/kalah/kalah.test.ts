import { describe, it, expect } from 'vitest'
import {
  makeGame, legalMoves, applyMove, aiTurn, seedTotal, storeCounts,
  YOUR_STORE, AI_STORE, YOUR_PITS, AI_PITS, TOTAL_SEEDS,
} from './logic'
import type { State, Side } from './logic'

describe('Kalah — setup', () => {
  it('starts with 12 pits of 4, empty stores, 48 seeds total', () => {
    const s = makeGame()
    for (const i of [...YOUR_PITS, ...AI_PITS]) expect(s.pits[i]).toBe(4)
    expect(s.pits[YOUR_STORE]).toBe(0)
    expect(s.pits[AI_STORE]).toBe(0)
    expect(seedTotal(s.pits)).toBe(TOTAL_SEEDS)
    expect(s.turn).toBe('you')
    expect(s.winner).toBeNull()
  })

  it('lists your non-empty pits as legal moves on move one', () => {
    const s = makeGame()
    expect(legalMoves(s, 'you').sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('Kalah — sowing', () => {
  it('sowing pit 5 (index 4, 4 seeds) reaches the store and includes it', () => {
    // index 2 has 4 seeds -> lands in pits 3,4,5,store(6): last seed in own store
    const s = makeGame()
    const n = applyMove(s, 2, 'you')
    expect(n.pits[3]).toBe(5)
    expect(n.pits[4]).toBe(5)
    expect(n.pits[5]).toBe(5)
    expect(n.pits[YOUR_STORE]).toBe(1) // own store got a seed
    expect(seedTotal(n.pits)).toBe(TOTAL_SEEDS)
  })

  it('skips the opponent store when sowing wraps past it', () => {
    // Build a state where YOUR pit 5 (index 5) has enough seeds to wrap around
    // past the AI store. With 9 seeds from index 5: lands in 6,7,8,9,10,11,12,(skip 13),0,1.
    const s = makeGame()
    s.pits[5] = 9
    const total = seedTotal(s.pits)
    const n = applyMove(s, 5, 'you')
    expect(n.pits[AI_STORE]).toBe(0) // opponent store never received a seed
    expect(n.pits[YOUR_STORE]).toBe(1) // own store did
    expect(seedTotal(n.pits)).toBe(total)
  })
})

describe('Kalah — extra turn', () => {
  it('keeps your turn when the last seed lands in your store', () => {
    const s = makeGame()
    // index 2 with 4 seeds lands the last in store -> extra turn
    const n = applyMove(s, 2, 'you')
    expect(n.turn).toBe('you')
    expect(n.pits[YOUR_STORE]).toBe(1)
  })

  it('passes the turn when the last seed does not land in the store', () => {
    const s = makeGame()
    // index 0 with 4 seeds lands in 1,2,3,4 — no store, no capture -> AI's turn
    const n = applyMove(s, 0, 'you')
    expect(n.turn).toBe('ai')
  })
})

describe('Kalah — capture', () => {
  it('captures the opposite pile when landing in an empty own pit', () => {
    const s = makeGame()
    // Engineer: your pit index 2 is empty, you sow from index 0 with exactly 2
    // seeds so the last lands in index 2 (empty), opposite (index 10) has seeds.
    s.pits = new Array(14).fill(0)
    s.pits[0] = 2
    s.pits[2] = 0
    s.pits[10] = 5 // opposite of index 2 is 12-2 = 10
    s.pits[8] = 1  // keep the AI side non-empty so no endgame sweep fires
    s.turn = 'you'
    const before = seedTotal(s.pits)
    const n = applyMove(s, 0, 'you')
    // last seed (1) + opposite pile (5) = 6 banked
    expect(n.pits[YOUR_STORE]).toBe(6)
    expect(n.pits[2]).toBe(0)
    expect(n.pits[10]).toBe(0)
    expect(n.winner).toBeNull()
    expect(seedTotal(n.pits)).toBe(before)
  })

  it('does NOT capture when the opposite pit is empty', () => {
    const s = makeGame()
    s.pits = new Array(14).fill(0)
    s.pits[0] = 2
    s.pits[2] = 0
    s.pits[10] = 0 // opposite empty -> no capture
    s.pits[8] = 1  // keep the AI side non-empty so no endgame sweep fires
    s.turn = 'you'
    const n = applyMove(s, 0, 'you')
    expect(n.pits[YOUR_STORE]).toBe(0)
    expect(n.pits[2]).toBe(1) // the lone seed just sits there
    expect(n.winner).toBeNull()
  })
})

describe('Kalah — endgame sweep', () => {
  it('sweeps the remaining seeds and names a winner when a side empties', () => {
    const s = makeGame()
    // Your side has a single seed in pit 5; AI side full. Sowing it empties your
    // row -> game ends, AI sweeps its row into its store.
    s.pits = new Array(14).fill(0)
    s.pits[5] = 1
    s.pits[YOUR_STORE] = 10
    for (const i of AI_PITS) s.pits[i] = 3 // 18 seeds on AI side
    s.pits[AI_STORE] = 9
    s.turn = 'you'
    const total = seedTotal(s.pits)
    // sow index 5 -> last seed lands in own store (extra-turn slot) but then your
    // pits are empty so the game ends and AI sweeps. Use index 5: 1 seed -> store.
    const n = applyMove(s, 5, 'you')
    expect(n.winner).not.toBeNull()
    // AI swept its 18 -> 9 + 18 = 27; you 10 + 1 = 11
    expect(n.pits[AI_STORE]).toBe(27)
    expect(n.pits[YOUR_STORE]).toBe(11)
    expect(n.winner).toBe('ai')
    expect(seedTotal(n.pits)).toBe(total)
    // every pit empty after sweep
    for (const i of [...YOUR_PITS, ...AI_PITS]) expect(n.pits[i]).toBe(0)
  })
})

describe('Kalah — self-play terminates', () => {
  it('plays 25 full games to a valid winner under the guard cap, seeds conserved', () => {
    for (let g = 0; g < 25; g++) {
      let s: State = makeGame()
      let guard = 0
      expect(() => {
        while (s.winner == null && guard++ < 300) {
          const side: Side = s.turn === 'ai' ? 'ai' : 'you'
          if (side === 'ai') {
            s = aiTurn(s)
          } else {
            const moves = legalMoves(s, 'you')
            // random human-side move to vary games
            const m = moves[(Math.random() * moves.length) | 0]
            s = applyMove(s, m, 'you')
          }
        }
      }).not.toThrow()
      expect(guard).toBeLessThan(300)
      expect(s.winner == null).toBe(false)
      expect(['you', 'ai', 'draw']).toContain(s.winner)
      expect(seedTotal(s.pits)).toBe(TOTAL_SEEDS)
      const { you, ai } = storeCounts(s.pits)
      expect(you + ai).toBe(TOTAL_SEEDS) // everything is banked at game end
    }
  })
})
