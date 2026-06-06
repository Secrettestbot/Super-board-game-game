import { describe, it, expect } from 'vitest'
import * as G from './logic'
import type { State, Die, Color } from './logic'

// Pure-logic tests: no DOM. Validates dice picking + the strictly-lower-to-platter rule, the
// white wild, the per-track placement rules (green threshold, purple ascending, orange
// multipliers, yellow/blue grids), opponent platter picks, track scoring on known states, and
// that greedy self-play reaches a valid winner under a guard cap with no throws.

function die(color: Color, value: number): Die { return { color, value } }

// Build a "pick" state with a chosen roll on the table for the active player.
function withRoll(roll: Die[], active: 0 | 1 = 0): State {
  const s = G.makeGame()
  return Object.assign({}, s, { active, phase: 'pick', roll })
}

describe('setup', () => {
  it('makeGame: two empty sheets, you=0 active, roll phase, 3 picks, no winner', () => {
    const s = G.makeGame()
    expect(s.sheets).toHaveLength(2)
    expect(s.active).toBe(0)
    expect(s.you).toBe(0)
    expect(s.phase).toBe('roll')
    expect(s.picksLeft).toBe(3)
    expect(s.winner).toBeNull()
    for (const sh of s.sheets) {
      expect(G.totalScore(sh)).toBe(0)
      expect(sh.purple.values).toHaveLength(0)
      expect(sh.green.count).toBe(0)
    }
  })
})

describe('picking + strictly-lower-to-platter', () => {
  it('picking a die places it on its track and sets aside ALL strictly-lower dice', () => {
    // chosen orange=4; dice with value <4 go to platter; values >=4 stay rollable.
    const roll = [
      die('orange', 4), // chosen, index 0
      die('green', 2),  // < 4 -> platter
      die('purple', 3), // < 4 -> platter
      die('yellow', 4), // == 4 -> stays
      die('blue', 5),   // > 4 -> stays
      die('white', 1),  // < 4 -> platter
    ]
    const s = withRoll(roll)
    const ns = G.pickDie(s, 0)
    // orange track got the 4
    expect(ns.sheets[0].orange.values[0]).toBe(4)
    // platter has exactly the three strictly-lower dice
    const platVals = ns.platter.map(d => d.value).sort()
    expect(platVals).toEqual([1, 2, 3])
    // picks decremented and we re-roll (or move on)
    expect(ns.picksLeft).toBe(2)
  })

  it('white die is a wildcard usable as any colour', () => {
    const roll = [die('white', 3), die('orange', 6)]
    const s = withRoll(roll)
    // place white onto purple
    const ns = G.pickDie(s, 0, 'purple')
    expect(ns.sheets[0].purple.values).toEqual([3])
  })
})

describe('green ascending threshold', () => {
  it('green requires a value >= a rising threshold; below threshold is rejected', () => {
    // threshold for cell 0 is 1 (always ok). Advance several, then a too-low value fails.
    let sheet = G.makeGame().sheets[0]
    // Helper: place via a single-die pick state for the green track.
    function placeGreen(v: number): boolean {
      const s = Object.assign({}, G.makeGame(), { phase: 'pick', roll: [die('green', v)] })
      s.sheets[0] = sheet
      const ns = G.pickDie(s as State, 0)
      const advanced = ns.sheets[0].green.count > sheet.green.count
      sheet = ns.sheets[0]
      return advanced
    }
    expect(placeGreen(1)).toBe(true)  // cell0 thresh 1
    expect(placeGreen(1)).toBe(true)  // cell1 thresh 1
    expect(placeGreen(1)).toBe(true)  // cell2 thresh 1
    // cell3 threshold is 2 -> a 1 must fail
    const before = sheet.green.count
    expect(G.GREEN_THRESH[before]).toBe(2)
    expect(placeGreen(1)).toBe(false)
    expect(placeGreen(2)).toBe(true)
  })
})

describe('purple greater-than-previous (6 resets)', () => {
  it('each new purple value must exceed the previous, but a 6 may follow anything', () => {
    let sheet = G.makeGame().sheets[0]
    function placePurple(v: number): boolean {
      const s = Object.assign({}, G.makeGame(), { phase: 'pick', roll: [die('purple', v)] })
      s.sheets[0] = sheet
      const ns = G.pickDie(s as State, 0)
      const added = ns.sheets[0].purple.values.length > sheet.purple.values.length
      sheet = ns.sheets[0]
      return added
    }
    expect(placePurple(3)).toBe(true)
    expect(placePurple(3)).toBe(false) // not greater
    expect(placePurple(5)).toBe(true)
    expect(placePurple(2)).toBe(false) // not greater
    expect(placePurple(6)).toBe(true)  // 6 follows anything
    expect(placePurple(1)).toBe(true)  // after a 6 the requirement reset
    expect(sheet.purple.values).toEqual([3, 5, 6, 1])
  })
})

describe('orange multipliers', () => {
  it('orange score applies per-cell multipliers', () => {
    const t = { values: [3, 3, 3, 3, 3, 3, 3, 3, 3] as (number | null)[] }
    // mults: [1,1,1,2,1,2,1,3,3] -> 3*(1+1+1+2+1+2+1+3+3)=3*15=45
    expect(G.orangeScore(t)).toBe(45)
  })
})

describe('opponent platter pick', () => {
  it('after the active turn opponents take one die from the platter', () => {
    // Force an end-of-turn: 1 pick left, choose a die so the rest go to platter.
    const roll = [die('orange', 5), die('green', 2), die('purple', 3)]
    let s = withRoll(roll)
    s = Object.assign({}, s, { picksLeft: 1 })
    s = G.pickDie(s, 0) // places orange 5; lower dice -> platter; turn ends
    expect(s.phase).toBe('platter')
    expect(s.platterPending).toEqual([1])
    expect(s.platter.length).toBeGreaterThan(0)
    const before = G.totalScore(s.sheets[1])
    s = G.aiPlatterPick(s, 1)
    expect(s.platterPending).toHaveLength(0)
    // opponent's score should not have decreased
    expect(G.totalScore(s.sheets[1])).toBeGreaterThanOrEqual(before)
  })
})

describe('track scoring over known states', () => {
  it('yellow column completion + green/purple totals + foxes multiply lowest track', () => {
    const sheet = G.makeGame().sheets[0]
    // complete yellow column 0: cells at rows 0..3, col 0 (indices 0,4,8,12)
    sheet.yellow.cells[0] = sheet.yellow.cells[4] = sheet.yellow.cells[8] = sheet.yellow.cells[12] = true
    expect(G.yellowScore(sheet.yellow)).toBe(G.YELLOW_COL_SCORE[0])
    // green count 5 -> GREEN_SCORE[5]
    sheet.green.count = 5
    expect(G.greenScore(sheet.green)).toBe(G.GREEN_SCORE[5])
    // purple [2,4,6] -> 12
    sheet.purple.values = [2, 4, 6]
    expect(G.purpleScore(sheet.purple)).toBe(12)
    // give an explicit fox; lowest track is blue (0) or orange (0) -> fox multiplies 0
    sheet.foxes = 1
    const ts = G.trackScores(sheet)
    const lowest = Math.min(...G.TRACK_COLORS.map(c => ts[c]))
    expect(lowest).toBe(0)
    // total = base + foxes*lowest = base + 0
    const base = G.TRACK_COLORS.reduce((a, c) => a + ts[c], 0)
    expect(G.totalScore(sheet)).toBe(base)
  })

  it('trackScore helper matches trackScores map', () => {
    const sheet = G.makeGame().sheets[0]
    sheet.orange.values = [6, 6, 6, null, null, null, null, null, null]
    expect(G.trackScore(sheet, 'orange')).toBe(G.orangeScore(sheet.orange))
  })
})

describe('self-play terminates', () => {
  it('greedy self-play reaches a valid winner under a guard cap, no throws', () => {
    // deterministic-ish rng so it is reproducible
    let seed = 12345
    G.setRng(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff })
    try {
      for (let game = 0; game < 3; game++) {
        let s: State = G.makeGame()
        let guard = 0
        while (s.winner == null && guard++ < 2000) {
          s = G.autoStep(s)
        }
        expect(s.winner).not.toBeNull()
        expect(s.winner === 0 || s.winner === 1 || s.winner === 'draw').toBe(true)
        expect(guard).toBeLessThan(2000)
        expect(s.round).toBeGreaterThan(s.rounds)
      }
    } finally {
      G.resetRng()
    }
  })
})
