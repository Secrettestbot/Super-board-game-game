import { describe, it, expect } from 'vitest'
import * as QX from './logic'
import type { QwixxState } from './logic'

// Pure logic tests: no DOM. Validates the score sheet, triangular scoring, cross-off
// legality, end conditions, and that greedy auto-play terminates fast with a valid winner.

describe('qwixx setup', () => {
  it('makeGame is valid: four empty coloured rows each, 0 penalties, an active player, dice unrolled', () => {
    const s = QX.makeGame()
    expect(s.players).toHaveLength(2)
    for (const p of s.players) {
      expect(p.penalties).toBe(0)
      for (const c of QX.COLORS) {
        const row = p.rows[c]
        expect(row.marks).toHaveLength(QX.NCOLS)
        expect(row.marks.every(m => m === false)).toBe(true)
        expect(row.locked).toBe(false)
      }
    }
    expect(s.active === 0 || s.active === 1).toBe(true)
    expect(s.dice).toBeNull()
    expect(s.phase).toBe('roll')
    expect(s.winner).toBeNull()
  })

  it('ascending rows run 2..12, descending run 12..2', () => {
    expect(QX.ROW_VALUES.red[0]).toBe(2)
    expect(QX.ROW_VALUES.red[QX.NCOLS - 1]).toBe(12)
    expect(QX.ROW_VALUES.green[0]).toBe(12)
    expect(QX.ROW_VALUES.green[QX.NCOLS - 1]).toBe(2)
  })
})

describe('qwixx scoring', () => {
  it('triangular table: 5 crosses -> 15, 7 -> 28', () => {
    expect(QX.triPoints(5)).toBe(15)
    expect(QX.triPoints(7)).toBe(28)
    expect(QX.triPoints(1)).toBe(1)
    expect(QX.triPoints(12)).toBe(78)
  })

  it('total sums rows and subtracts 5 per penalty', () => {
    const p = { name: 'T', penalties: 2, rows: {
      red:    { marks: mark([0, 1, 2, 3, 4]), locked: false },  // 5 -> 15
      yellow: { marks: mark([0, 1, 2, 3, 4, 5, 6]), locked: false }, // 7 -> 28
      green:  { marks: mark([]), locked: false },
      blue:   { marks: mark([]), locked: false },
    } }
    // 15 + 28 + 0 + 0 - 10 = 33
    expect(QX.scoreTotal(p as any)).toBe(33)
  })

  it('a locked row counts the lock mark among its crosses', () => {
    // 5 normal crosses + the end cell (lock) = 6 marks -> 21
    const row = { marks: mark([0, 1, 2, 3, 4, QX.NCOLS - 1]), locked: true }
    expect(QX.rowScore(row as any)).toBe(QX.triPoints(6))
    expect(QX.triPoints(6)).toBe(21)
  })
})

describe('qwixx cross-off legality', () => {
  it('cannot cross to the left of an existing mark', () => {
    const row = { marks: mark([4]), locked: false }  // red value 6 crossed (index 4)
    // red value 4 is index 2 (left of 4) -> illegal
    expect(QX.cellFor(row as any, 'red', 4)).toBe(-1)
    // red value 8 is index 6 (right) -> legal
    expect(QX.cellFor(row as any, 'red', 8)).toBe(6)
  })

  it('the end number needs >=5 prior crosses', () => {
    const four = { marks: mark([0, 1, 2, 3]), locked: false }
    expect(QX.cellFor(four as any, 'red', 12)).toBe(-1)        // only 4 crosses
    const five = { marks: mark([0, 1, 2, 3, 4]), locked: false }
    expect(QX.cellFor(five as any, 'red', 12)).toBe(QX.NCOLS - 1) // 5 crosses -> legal
  })

  it('crossing the end cell locks the row and increments the lock count', () => {
    let s = QX.makeGame()
    // hand-build: active player has 5 crosses in red, dice give a white-sum of 12
    s.players[s.active].rows.red.marks = mark([0, 1, 2, 3, 4])
    s = forceDice(s, [6, 6, 1, 1, 1, 1])  // white sum = 12
    const a = s.active
    const before = s.locks
    s = QX.cross(s, a, 'red', QX.NCOLS - 1, 'white')
    expect(s.players[a].rows.red.locked).toBe(true)
    expect(s.locks).toBe(before + 1)
  })
})

describe('qwixx end conditions', () => {
  it('two locked rows ends the game', () => {
    let s = QX.makeGame()
    const a = s.active
    s.players[a].rows.red.marks = mark([0, 1, 2, 3, 4])
    s.players[a].rows.yellow.marks = mark([0, 1, 2, 3, 4])
    // dice: [w1, w2, red, yellow, green, blue]. white sum = 12 (locks red end);
    // white+yellow combo = w1(6)+yellow(6) = 12 (locks yellow end).
    s = forceDice(s, [6, 6, 1, 6, 1, 1])
    s = QX.cross(s, a, 'red', QX.NCOLS - 1, 'white')
    expect(s.winner).toBeNull()
    s = QX.cross(s, a, 'yellow', QX.NCOLS - 1, 'color')
    expect(s.locks).toBe(2)
    expect(s.winner).not.toBeNull()
  })

  it('a 4th penalty ends the game', () => {
    let s = QX.makeGame()
    // Each player passes (crosses nothing) every turn -> penalties accrue and someone hits 4.
    let guard = 0
    while (s.winner == null && guard++ < 40) { s = QX.rollDice(s); s = QX.passPenalty(s) }
    expect(s.winner).not.toBeNull()
    expect(Math.max(s.players[0].penalties, s.players[1].penalties)).toBe(4)
    expect(s.players.some(p => p.penalties >= 4)).toBe(true)
  })
})

describe('qwixx greedy self-play', () => {
  it('a few full games terminate fast with a valid winner and no throws', () => {
    for (let g = 0; g < 4; g++) {
      let s: QwixxState = QX.makeGame()
      let guard = 0
      let prevProgress = -1
      while (s.winner == null && guard++ < 400) {
        s = QX.autoTurn(s)
        // progress (marks + penalties) is monotonic non-decreasing -> guarantees termination
        const prog = progress(s)
        expect(prog).toBeGreaterThanOrEqual(prevProgress)
        prevProgress = prog
      }
      expect(s.winner).not.toBeNull()
      expect(s.winner === 0 || s.winner === 1 || s.winner === 'draw').toBe(true)
      expect(guard).toBeLessThan(400)
    }
  })
})

// ---- helpers ----
function mark(indexes: number[]): boolean[] {
  const m = new Array(QX.NCOLS).fill(false)
  for (const i of indexes) m[i] = true
  return m
}
function forceDice(s: QwixxState, dice: number[]): QwixxState {
  return Object.assign({}, s, { phase: 'act', dice, acted: { white: false, color: false }, whiteTakenBy: [false, false] })
}
function progress(s: QwixxState): number {
  let n = 0
  for (const p of s.players) {
    n += p.penalties
    for (const c of QX.COLORS) n += p.rows[c].marks.reduce((a: number, b: boolean) => a + (b ? 1 : 0), 0)
  }
  return n
}
