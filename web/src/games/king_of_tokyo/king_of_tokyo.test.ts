import { describe, it, expect } from 'vitest'
import {
  makeGame, scoreNumbers, resolveDice, yieldTokyo, endTurn, aiTurn, setRng,
  WIN_VP, MAX_HEALTH,
} from './logic'
import type { KotState, Face } from './logic'

/** Helper: build a state ready to resolve a fixed dice set for a given player. */
function staged(dice: Face[], over: Partial<KotState> = {}): KotState {
  const g = makeGame()
  return Object.assign({}, g, {
    dice,
    rolled: true,
    rerollsLeft: 0,
    phase: 'roll' as const,
  }, over)
}

describe('dice scoring', () => {
  it('three 1s = 1 VP, three 2s = 2 VP, four 2s = 3 VP', () => {
    expect(scoreNumbers([1, 1, 1, 'claw', 'heart', 'energy'])).toBe(1)
    expect(scoreNumbers([2, 2, 2, 'claw', 'heart', 'energy'])).toBe(2)
    expect(scoreNumbers([2, 2, 2, 2, 'heart', 'energy'])).toBe(3)
    expect(scoreNumbers([3, 3, 3, 3, 3, 'energy'])).toBe(5) // 3 + 2 extras
    expect(scoreNumbers([1, 1, 'claw', 'claw', 'heart', 'energy'])).toBe(0)
  })

  it('numbers VP is applied on resolve', () => {
    const s = staged([2, 2, 2, 'energy', 'energy', 'heart'])
    const r = resolveDice(s)
    expect(r.monsters[0].vp).toBe(2)
    expect(r.monsters[0].energy).toBe(2)
  })
})

describe('claws', () => {
  it('from outside Tokyo hit the Tokyo monster', () => {
    // player 0 outside, monster 1 in Tokyo
    const s = staged(['claw', 'claw', 'energy', 'heart', 1, 2], {
      tokyoOccupant: 1,
      monsters: makeGame().monsters.map(m => m.id === 1 ? Object.assign({}, m, { inTokyo: true }) : m),
    })
    const r = resolveDice(s)
    expect(r.monsters[1].health).toBe(MAX_HEALTH - 2)
    expect(r.monsters[0].inTokyo).toBe(false) // still outside, Tokyo occupied
    // a yield decision is now pending
    expect(r.phase).toBe('yield')
    expect(r.pendingYield?.defender).toBe(1)
  })

  it('from inside Tokyo hit ALL others', () => {
    const base = makeGame()
    const s = staged(['claw', 'claw', 'claw', 'energy', 'heart', 1], {
      tokyoOccupant: 0,
      monsters: base.monsters.map(m => m.id === 0 ? Object.assign({}, m, { inTokyo: true }) : m),
    })
    const r = resolveDice(s)
    expect(r.monsters[1].health).toBe(MAX_HEALTH - 3)
    expect(r.monsters[2].health).toBe(MAX_HEALTH - 3)
    expect(r.monsters[0].health).toBe(MAX_HEALTH) // attacker untouched
  })
})

describe('hearts', () => {
  it('heal only outside Tokyo, capped at 10', () => {
    const base = makeGame()
    // outside Tokyo, wounded → heals
    const s1 = staged(['heart', 'heart', 'energy', 1, 2, 3], {
      monsters: base.monsters.map(m => m.id === 0 ? Object.assign({}, m, { health: 5 }) : m),
    })
    expect(resolveDice(s1).monsters[0].health).toBe(7)
    // cap at 10
    const s2 = staged(['heart', 'heart', 'heart', 'heart', 1, 2], {
      monsters: base.monsters.map(m => m.id === 0 ? Object.assign({}, m, { health: 9 }) : m),
    })
    expect(resolveDice(s2).monsters[0].health).toBe(MAX_HEALTH)
    // in Tokyo → no heal
    const s3 = staged(['heart', 'heart', 'energy', 1, 2, 3], {
      tokyoOccupant: 0,
      monsters: base.monsters.map(m => m.id === 0 ? Object.assign({}, m, { health: 5, inTokyo: true }) : m),
    })
    expect(resolveDice(s3).monsters[0].health).toBe(5)
  })
})

describe('Tokyo', () => {
  it('entering empty Tokyo on a claw gives +1 VP; +2 at start of turn while held', () => {
    const s = staged(['claw', 'energy', 'heart', 1, 2, 3]) // Tokyo empty
    const r = resolveDice(s)
    expect(r.monsters[0].inTokyo).toBe(true)
    expect(r.tokyoOccupant).toBe(0)
    expect(r.monsters[0].vp).toBe(1) // entry bonus
    // now end turn around to player 0 again to collect +2 start-of-turn
    let st = endTurn(r) // -> player 1
    st = aiTurn(st)     // AI plays through (may or may not take Tokyo)
    // force: if player 0 still holds Tokyo when their turn starts they'd get +2.
    // Build a direct check instead:
    const held = Object.assign({}, makeGame(), {
      tokyoOccupant: 0,
      turn: 2,
      phase: 'resolved' as const,
      monsters: makeGame().monsters.map(m => m.id === 0 ? Object.assign({}, m, { inTokyo: true, vp: 1 }) : m),
    })
    const after = endTurn(held) // advances to player 0
    expect(after.turn).toBe(0)
    expect(after.monsters[0].vp).toBe(3) // 1 + 2 start-of-turn
  })

  it('yield: defender leaves and attacker takes Tokyo (+1 VP)', () => {
    const base = makeGame()
    const s = staged(['claw', 'claw', 1, 2, 3, 'energy'], {
      tokyoOccupant: 1,
      monsters: base.monsters.map(m => m.id === 1 ? Object.assign({}, m, { inTokyo: true }) : m),
    })
    const r = resolveDice(s)
    expect(r.phase).toBe('yield')
    const y = yieldTokyo(r, true)
    expect(y.monsters[1].inTokyo).toBe(false)
    expect(y.monsters[0].inTokyo).toBe(true)
    expect(y.tokyoOccupant).toBe(0)
    expect(y.monsters[0].vp).toBe(1) // entry bonus from yield
  })
})

describe('win conditions', () => {
  it('an eliminated monster (0 health) is out and excluded', () => {
    const base = makeGame()
    // player 0 in Tokyo claws everyone; monster 1 already at 1 health → dies
    const s = staged(['claw', 'claw', 1, 2, 3, 'energy'], {
      tokyoOccupant: 0,
      monsters: base.monsters.map(m => {
        if (m.id === 0) return Object.assign({}, m, { inTokyo: true })
        if (m.id === 1) return Object.assign({}, m, { health: 2 })
        return m
      }),
    })
    const r = resolveDice(s)
    expect(r.monsters[1].alive).toBe(false)
    expect(r.monsters[1].health).toBe(0)
  })

  it('first to 20 VP wins; last standing wins', () => {
    const base = makeGame()
    // 20 VP win: player 0 about to cross 20 via numbers
    const s = staged([3, 3, 3, 3, 3, 'energy'], { // 5 VP
      monsters: base.monsters.map(m => m.id === 0 ? Object.assign({}, m, { vp: WIN_VP - 5 }) : m),
    })
    const r = resolveDice(s)
    expect(r.winner).toBe(0)

    // last standing: only player 0 alive
    const ls = Object.assign({}, base, {
      phase: 'resolved' as const,
      monsters: base.monsters.map(m => m.id === 0 ? m : Object.assign({}, m, { alive: false, health: 0 })),
    })
    const w = endTurn(ls)
    expect(w.winner).toBe(0)
  })
})

describe('AI self-play', () => {
  it('reaches a valid winner under a guard cap without throwing', () => {
    // deterministic-ish RNG
    let seed = 12345
    const restore = setRng(() => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    })
    try {
      let s = makeGame()
      let guard = 0
      const CAP = 5000
      expect(() => {
        while (s.winner == null && guard < CAP) {
          guard++
          if (s.phase === 'yield' && s.pendingYield) {
            // resolve any pending yield (human or AI) deterministically
            s = yieldTokyo(s, s.monsters[s.pendingYield.defender].health <= 5)
            continue
          }
          if (s.turn === 0) {
            // drive player 0 like an AI for self-play
            if (s.phase === 'roll') {
              if (!s.rolled) { s = rollDicePub(s); continue }
              if (s.rerollsLeft > 0) { s = rollDicePub(s); continue }
              s = resolveDice(s); continue
            }
            if (s.phase === 'resolved') { s = endTurn(s); continue }
          } else {
            s = aiTurn(s)
            if (s.turn !== 0 && s.winner == null) {
              // aiTurn ended on player 0's turn or winner; if stuck advance
              s = endTurn(s)
            }
          }
        }
      }).not.toThrow()
      expect(s.winner).not.toBeNull()
      expect(s.winner).toBeGreaterThanOrEqual(0)
      expect(s.winner).toBeLessThan(3)
      const w = s.monsters[s.winner as number]
      expect(w.alive || w.vp >= WIN_VP).toBe(true)
    } finally {
      restore()
    }
  })
})

// local re-export shim to call rollDice (kept simple to avoid an extra import line above)
import { rollDice as rollDicePub } from './logic'
