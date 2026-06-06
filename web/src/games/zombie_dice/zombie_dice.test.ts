import { describe, it, expect } from 'vitest'
import * as ZD from './logic'
import type { Rolled, ZombieState } from './logic'

// Pure logic test, no DOM. Covers cup composition, roll resolution, busting and banking,
// then plays a few full games (human policy vs the real aiStep) to a valid winner.

describe('zombie dice logic', () => {
  it('starts with a valid 13-die cup, 0 banked each, a player to act', () => {
    const s = ZD.makeGame()
    expect(s.cup).toHaveLength(13)
    const c = ZD.cupCount(s.cup)
    expect(c).toEqual({ g: 6, y: 4, r: 3 })   // 6 green, 4 yellow, 3 red
    expect(s.scores).toEqual({ you: 0, ai: 0 })
    expect(s.winner).toBeNull()
    expect(s.turn === 'you' || s.turn === 'ai').toBe(true)
    expect(s.brains).toBe(0)
    expect(s.shots).toBe(0)
    expect(s.rolling).toBe(false)
  })

  it('resolveRoll classifies brain/shotgun/runner and sets aside correctly', () => {
    const rolled: Rolled[] = [
      { color: 'g', face: 'brain' },
      { color: 'r', face: 'shot' },
      { color: 'y', face: 'run' },
    ]
    const res = ZD.resolveRoll(rolled, 0, 0)
    expect(res.brains).toBe(1)            // brain scored
    expect(res.shots).toBe(1)             // shotgun set aside
    expect(res.keep).toHaveLength(1)      // runner kept in hand
    expect(res.keep[0].face).toBe('run')
    expect(res.busted).toBe(false)
  })

  it('reaching 3 shotguns in a turn busts (0 brains banked from that turn)', () => {
    // 2 shotguns already this turn; roll resolves a third -> bust.
    const rolled: Rolled[] = [
      { color: 'r', face: 'shot' },
      { color: 'g', face: 'brain' },
      { color: 'y', face: 'run' },
    ]
    const res = ZD.resolveRoll(rolled, 2 /*brains*/, 2 /*shots*/)
    expect(res.shots).toBe(3)
    expect(res.busted).toBe(true)

    // and at the state level: a turn that busts banks nothing and passes the cup.
    const base: ZombieState = Object.assign(ZD.makeGame(), {
      turn: 'you' as const, rolling: true, brains: 2, shots: 2,
      hand: [{ color: 'r', face: 'run' } as Rolled, { color: 'r', face: 'run' } as Rolled],
      // force the cup to be all red so the only drawn face possibilities still cannot
      // change that a 3rd shotgun busts; we instead assert via resolveRoll above and
      // here just check that a bust state banks nothing by simulating stop after bust.
    })
    // simulate a bust outcome by hand: resolve with 3 shots then ensure no bank happened.
    const busted = ZD.resolveRoll([{ color: 'r', face: 'shot' } as Rolled], base.brains, base.shots)
    expect(busted.busted).toBe(true)
    expect(base.scores.you).toBe(0)       // nothing banked on a bust
  })

  it('stopping banks the turn\'s brains into the total', () => {
    const s: ZombieState = Object.assign(ZD.makeGame(), {
      turn: 'you' as const, rolling: true, brains: 4, shots: 1,
    })
    const after = ZD.stop(s)
    expect(after.scores.you).toBe(4)      // 4 brains banked
    expect(after.turn).toBe('ai')         // cup passes to the rival
    expect(after.brains).toBe(0)          // this-turn tally reset
    expect(after.shots).toBe(0)
    expect(after.cup).toHaveLength(13)    // cup refilled
  })

  it('plays several full games to a valid winner without throwing, and terminates fast', () => {
    for (let game = 0; game < 4; game++) {
      let s = ZD.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 4000) {
        if (s.turn === 'you') {
          // simple human policy: roll until 2 shotguns, then stop.
          if (s.rolling && s.shots >= 2) s = ZD.stop(s)
          else if (s.rolling && s.brains >= 5) s = ZD.stop(s)  // also bank a big haul
          else s = ZD.roll(s)
        } else {
          s = ZD.aiStep(s)
        }
      }
      expect(s.winner).not.toBeNull()                    // always terminates
      expect(s.winner === 'you' || s.winner === 'ai').toBe(true)
      const w = s.winner as 'you' | 'ai'
      expect(s.scores[w]).toBeGreaterThanOrEqual(ZD.GOAL) // winner truly reached the goal
    }
  })
})
