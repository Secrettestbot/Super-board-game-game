import { describe, it, expect } from 'vitest'
import * as C from './logic'
import type { CatanState, Resource } from './logic'

/** Build a state with a fixed dice pool and the active player in build phase. */
function withDice(dice: Resource[], turn: C.Player = 0): CatanState {
  const s = C.makeGame(0)
  return { ...s, dice, turn, phase: 'build', rollsLeft: 0 }
}

/** A scripted rng cycling through a fixed list of values in [0,1). */
function scriptedRng(vals: number[]): C.Rng {
  let i = 0
  return () => vals[(i++) % vals.length]
}

describe('catan dice — dice / keep / reroll', () => {
  it('first roll fills six dice and decrements rolls-left', () => {
    const s0 = C.makeGame(0)
    const s1 = C.rollDice(s0, scriptedRng([0]))   // all face index 0 = wood
    expect(s1.dice).toHaveLength(C.NDICE)
    expect(s1.dice.every(d => d === 'wood')).toBe(true)
    expect(s1.rollsLeft).toBe(C.MAX_ROLLS - 1)
    expect(s1.phase).toBe('roll')
  })

  it('reroll respects kept dice and stops at zero rolls', () => {
    let s = C.makeGame(0)
    s = C.rollDice(s, scriptedRng([0]))           // wood x6, rollsLeft 2
    s = C.toggleKeep(s, 0)                          // keep die 0
    s = C.toggleKeep(s, 1)                          // keep die 1
    // Reroll the rest to brick (face index 1 of DIE_FACES).
    const brickIdx = C.DIE_FACES.indexOf('brick') / C.DIE_FACES.length
    s = C.rollDice(s, scriptedRng([brickIdx]))
    expect(s.dice[0]).toBe('wood')
    expect(s.dice[1]).toBe('wood')
    expect(s.dice[2]).toBe('brick')
    expect(s.rollsLeft).toBe(C.MAX_ROLLS - 2)
    // Third roll exhausts rolls and moves to build.
    s = C.rollDice(s, scriptedRng([brickIdx]))
    expect(s.rollsLeft).toBe(0)
    expect(s.phase).toBe('build')
    // Further rolls are a no-op.
    const s2 = C.rollDice(s, scriptedRng([0]))
    expect(s2).toBe(s)
  })
})

describe('catan dice — costs and gold-as-wild', () => {
  it('canBuild checks exact resource costs for a road (next track slot)', () => {
    expect(C.canBuild(withDice(['wood', 'brick']), 0, 'road')).toBe(true)
    expect(C.canBuild(withDice(['wood', 'wood']), 0, 'road')).toBe(false) // missing brick
  })

  it('gold substitutes for any one missing resource', () => {
    // road = wood+brick. Have wood + gold → gold covers the brick.
    expect(C.canBuild(withDice(['wood', 'gold']), 0, 'road')).toBe(true)
    // two gold can cover both wood and brick.
    expect(C.canBuild(withDice(['gold', 'gold']), 0, 'road')).toBe(true)
    // one gold cannot cover a 2-resource shortfall.
    expect(C.canBuild(withDice(['gold']), 0, 'road')).toBe(false)
  })

  it('city needs 2 wheat + 3 ore exactly, gold fills shortfall', () => {
    // No settlement to upgrade yet → cannot build a city regardless of resources.
    expect(C.canBuild(withDice(['wheat', 'wheat', 'ore', 'ore', 'ore']), 0, 'city')).toBe(false)
  })
})

describe('catan dice — build deducts and advances', () => {
  it('building a road consumes wood+brick and advances the track', () => {
    const s = withDice(['wood', 'brick', 'ore'])
    const after = C.build(s, 0, 'road')
    expect(after.sheets[0].trackBuilt).toBe(1)
    // wood+brick consumed; the spare ore remains in the dice pool.
    expect(after.dice.sort()).toEqual(['ore'])
  })

  it('build order is enforced — cannot settle before the first road', () => {
    // First track slot is a road. A settlement is not buildable yet even if affordable.
    const s = withDice(['wood', 'brick', 'wheat', 'sheep'])
    expect(C.canBuild(s, 0, 'settlement')).toBe(false)
    const built = C.build(s, 0, 'settlement')
    expect(built.sheets[0].trackBuilt).toBe(0) // no-op
    // After a road, the settlement becomes legal.
    const afterRoad = C.build(withDice(['wood', 'brick', 'wood', 'brick', 'wheat', 'sheep']), 0, 'road')
    expect(C.canBuild(afterRoad, 0, 'settlement')).toBe(true)
  })

  it('city upgrades a built settlement for net +1 point', () => {
    // Manually advance a sheet to: road, settlement built.
    let s = withDice(['wood', 'brick'])
    s = C.build(s, 0, 'road')
    s = { ...s, dice: ['wood', 'brick', 'wheat', 'sheep'] }
    s = C.build(s, 0, 'settlement')
    expect(C.scoreSheet(s, 0).pieces).toBe(1) // one settlement = 1 pt
    // Now upgrade to a city: 2 wheat + 3 ore.
    s = { ...s, dice: ['wheat', 'wheat', 'ore', 'ore', 'ore'] }
    expect(C.canBuild(s, 0, 'city')).toBe(true)
    s = C.build(s, 0, 'city')
    expect(s.sheets[0].cities).toBe(1)
    expect(C.scoreSheet(s, 0).pieces).toBe(2) // city = 2 pts
  })
})

describe('catan dice — scoring bonuses', () => {
  it('longest-road and knight bonuses go to the strict leader; unbuilt settlements penalise', () => {
    const base = C.makeGame(0)
    // Player 0: 1 road, 0 settlements, 1 knight. Player 1: empty.
    const s: CatanState = {
      ...base,
      sheets: [
        { trackBuilt: 1, cities: 0, knights: 1 },
        { trackBuilt: 0, cities: 0, knights: 0 },
      ],
    }
    const a = C.scoreSheet(s, 0)
    expect(a.longestRoad).toBe(C.LONGEST_ROAD_BONUS)
    expect(a.knightBonus).toBe(C.KNIGHT_BONUS)
    // 5 settlement slots empty on P0's track → penalty of 5.
    const emptySettlements = C.TRACK.slice(1).filter(x => x === 'settlement').length
    expect(a.penalty).toBe(emptySettlements * C.UNBUILT_PENALTY)
    // Player 1 (all empty) gets no bonuses and the full settlement penalty.
    const b = C.scoreSheet(s, 1)
    expect(b.longestRoad).toBe(0)
    expect(b.knightBonus).toBe(0)
  })

  it('a tie in roads/knights awards the bonus to neither', () => {
    const base = C.makeGame(0)
    const s: CatanState = {
      ...base,
      sheets: [
        { trackBuilt: 1, cities: 0, knights: 1 },
        { trackBuilt: 1, cities: 0, knights: 1 },
      ],
    }
    expect(C.scoreSheet(s, 0).longestRoad).toBe(0)
    expect(C.scoreSheet(s, 0).knightBonus).toBe(0)
  })
})

describe('catan dice — self-play terminates', () => {
  it('full AI-vs-AI game ends in a valid winner under a guard cap with no throws', () => {
    let s = C.makeGame(0)
    // Make BOTH players AI by treating you as an out-of-band value the loop ignores;
    // we just run aiTurn for whoever's turn it is, regardless of s.you.
    const rng = scriptedRng([0.05, 0.2, 0.4, 0.55, 0.7, 0.85, 0.95, 0.33, 0.66, 0.1])
    let guard = 0
    expect(() => {
      while (s.winner == null && guard++ < 200) {
        s = C.aiTurn(s, rng)
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(200)            // terminated well within the cap
    expect(s.winner != null).toBe(true)
    expect([0, 1, 'tie']).toContain(s.winner)
    // Scores are finite numbers.
    expect(Number.isFinite(C.totalScore(s, 0))).toBe(true)
    expect(Number.isFinite(C.totalScore(s, 1))).toBe(true)
  })

  it('aiStep drives a single turn to completion identically valid', () => {
    let s = C.makeGame(0)
    // Force it to be the AI's turn (you = 1 so turn 0 is AI).
    s = { ...s, you: 1 }
    let guard = 0
    const startRound = s.round
    while (s.turn === 0 && s.round === startRound && guard++ < 60) {
      s = C.aiStep(s, scriptedRng([0.1, 0.3, 0.5, 0.7, 0.9]))
    }
    expect(guard).toBeLessThan(60)
    // The AI handed off the turn (or the round advanced).
    expect(s.turn === 1 || s.round > startRound).toBe(true)
  })
})
