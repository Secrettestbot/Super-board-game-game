import { describe, it, expect, afterEach } from 'vitest'
import * as BG from './logic'
import type { BackgammonState, Side } from './logic'

// Pure logic tests (no DOM). The dice use Math.random, so for determinism we install a tiny
// seeded RNG over Math.random where needed and restore it afterward.

const realRandom = Math.random
afterEach(() => { Math.random = realRandom })

function seed(n: number) {
  // mulberry32 — deterministic, fast
  let a = n >>> 0
  Math.random = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function totalCheckers(s: BackgammonState, side: Side): number {
  let n = side === 'w' ? s.offW + s.barW : s.offB + s.barB
  for (let i = 0; i < 24; i++) {
    const v = s.points[i]
    if (side === 'w' && v > 0) n += v
    if (side === 'b' && v < 0) n += -v
  }
  return n
}

describe('backgammon — setup', () => {
  it('makeGame is a valid standard opening, You (White) to move pre-roll', () => {
    const s = BG.makeGame()
    expect(s.points).toHaveLength(24)
    expect(totalCheckers(s, 'w')).toBe(15)
    expect(totalCheckers(s, 'b')).toBe(15)
    expect(s.offW).toBe(0); expect(s.offB).toBe(0)
    expect(s.barW).toBe(0); expect(s.barB).toBe(0)
    expect(s.turn).toBe('w')
    expect(s.you).toBe('w')
    expect(s.rolled).toBe(false)
    expect(s.winner).toBeNull()
    // standard start points for White (+) and Black (−)
    expect(s.points[23]).toBe(2)
    expect(s.points[12]).toBe(5)
    expect(s.points[7]).toBe(3)
    expect(s.points[5]).toBe(5)
    expect(s.points[0]).toBe(-2)
    expect(s.points[11]).toBe(-5)
    expect(s.points[16]).toBe(-3)
    expect(s.points[18]).toBe(-5)
  })
})

describe('backgammon — hitting & the bar', () => {
  it('landing on a lone enemy blot sends it to the bar and forces re-entry', () => {
    // Construct: White lone blot on point 4; Black checker on point 0 to hit with a 4 (0 -> 4).
    const s0 = BG.makeGame()
    const points = new Array(24).fill(0)
    points[4] = 1     // White blot
    points[0] = -1    // a single Black checker that will hit it
    points[18] = -14  // rest of Black (kept off the action)
    points[5] = 14    // rest of White
    const s: BackgammonState = Object.assign({}, s0, {
      points, turn: 'b', rolled: true, dice: [4, 2], remaining: [4, 2], barW: 0, barB: 0,
    })
    const moves = BG.legalMoves(s, 'b')
    const hit = moves.find(m => m.from === 0 && m.to === 4)
    expect(hit).toBeTruthy()
    expect(hit!.hit).toBe(true)

    const after = BG.move(s, 'b', 0, 4)
    expect(after.barW).toBe(1)            // White blot went to the bar
    expect(after.points[4]).toBe(-1)      // Black now occupies the point

    // Now White (on the bar) must re-enter before anything else.
    const wTurn: BackgammonState = Object.assign({}, after, {
      turn: 'w', rolled: true, dice: [1, 3], remaining: [1, 3],
    })
    const wMoves = BG.legalMoves(wTurn, 'w')
    expect(wMoves.length).toBeGreaterThan(0)
    expect(wMoves.every(m => m.from === BG.BAR_FROM)).toBe(true)   // every legal move is a re-entry
  })
})

describe('backgammon — blocked points', () => {
  it('cannot land on a point held by 2+ enemies', () => {
    const s0 = BG.makeGame()
    const points = new Array(24).fill(0)
    points[10] = 1    // White checker to move
    points[6] = -2    // Black holds point 6 (2 checkers) -> White moving 10->6 with a 4 is blocked
    points[8] = -1    // Black blot on 8 -> White 10->8 with a 2 is allowed (a hit)
    points[5] = 13
    points[18] = -12
    const s: BackgammonState = Object.assign({}, s0, {
      points, turn: 'w', rolled: true, dice: [4, 2], remaining: [4, 2],
    })
    const moves = BG.legalMoves(s, 'w')
    expect(moves.find(m => m.from === 10 && m.to === 6)).toBeUndefined()  // blocked
    const hit = moves.find(m => m.from === 10 && m.to === 8)
    expect(hit).toBeTruthy()
    expect(hit!.hit).toBe(true)
  })
})

describe('backgammon — bearing off', () => {
  it('bears off from the home board when all 15 are home', () => {
    const s0 = BG.makeGame()
    const points = new Array(24).fill(0)
    // White all home (points 0..5). Put 15 White checkers in home.
    points[5] = 5; points[4] = 4; points[3] = 3; points[2] = 1; points[1] = 1; points[0] = 1
    points[23] = -15   // Black far away, irrelevant
    const s: BackgammonState = Object.assign({}, s0, {
      points, turn: 'w', rolled: true, dice: [6, 1], remaining: [6, 1], offW: 0,
    })
    const moves = BG.legalMoves(s, 'w')
    // a 6 bears off the checker on point 5 (edge distance 6); a 1 bears off point 0
    const off6 = moves.find(m => m.from === 5 && m.to === -1)
    expect(off6).toBeTruthy()

    const after = BG.move(s, 'w', 5, 6)
    expect(after.offW).toBe(1)
    expect(after.points[5]).toBe(4)
  })

  it('declares a winner once all 15 are borne off', () => {
    const s0 = BG.makeGame()
    const points = new Array(24).fill(0)
    points[0] = 1      // White's very last checker, one pip from off
    points[23] = -15
    const s: BackgammonState = Object.assign({}, s0, {
      points, turn: 'w', rolled: true, dice: [1, 1, 1, 1], remaining: [1, 1, 1, 1], offW: 14,
    })
    const after = BG.move(s, 'w', 0, 1)
    expect(after.offW).toBe(15)
    expect(after.winner).toBe('w')
  })
})

describe('backgammon — full games terminate with a winner', () => {
  it('plays a few random games to completion, always terminating, never throwing', () => {
    for (let g = 0; g < 3; g++) {
      seed(1234 + g * 7919)
      let s = BG.makeGame()
      let plies = 0
      const PLY_CAP = 4000
      while (!s.winner && plies++ < PLY_CAP) {
        const side = s.turn as Side
        if (!s.rolled) {
          s = BG.roll(s, side)
          continue
        }
        if (side === 'b') {
          // AI mover plays one checker per step
          s = BG.aiStep(s)
          continue
        }
        // White: play a legal move (or the turn auto-passes via roll() when none exist)
        const moves = BG.usableMoves(s, 'w')
        if (!moves.length) {
          // shouldn't happen while rolled & dice remain, but guard: force a re-roll cycle
          s = Object.assign({}, s, { turn: BG.other('w'), rolled: false, dice: [], remaining: [] }) as BackgammonState
          continue
        }
        const m = moves[(Math.random() * moves.length) | 0]
        s = BG.move(s, 'w', m.from, m.die)
      }
      expect(s.winner).not.toBeNull()
      expect(s.winner === 'w' || s.winner === 'b').toBe(true)
      const champ = s.winner as Side
      expect(champ === 'w' ? s.offW : s.offB).toBe(15)
      // total checkers conserved for both sides
      expect(totalCheckers(s, 'w')).toBe(15)
      expect(totalCheckers(s, 'b')).toBe(15)
    }
  })
})
