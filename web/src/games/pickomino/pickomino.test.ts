import { describe, it, expect } from 'vitest'
import * as P from './logic'
import type { PickominoState, Face } from './logic'

const WORM = P.WORM

describe('pickomino logic', () => {
  it('assigns the right worm value to each tile (21-24=1 ... 33-36=4)', () => {
    expect(P.tileWorms(21)).toBe(1)
    expect(P.tileWorms(24)).toBe(1)
    expect(P.tileWorms(25)).toBe(2)
    expect(P.tileWorms(28)).toBe(2)
    expect(P.tileWorms(29)).toBe(3)
    expect(P.tileWorms(32)).toBe(3)
    expect(P.tileWorms(33)).toBe(4)
    expect(P.tileWorms(36)).toBe(4)
    const s = P.makeGame(1)
    expect(s.row).toHaveLength(16)
    expect(s.row[0].n).toBe(21)
    expect(s.row[15].n).toBe(36)
  })

  it('setAside takes ALL dice of a value and blocks re-taking that value', () => {
    let s = P.makeGame(7)
    // craft a deterministic roll
    s = Object.assign({}, s, { roll: [5, 5, 5, 2, WORM, 1, 1, 3] as Face[], hasRolled: true })
    s = P.setAside(s, 5)
    expect(s.aside.filter(d => d === 5)).toHaveLength(3) // all three 5s
    expect(s.takenValues).toContain(5)
    expect(s.roll.includes(5)).toBe(false)
    // re-taking 5 is blocked — state unchanged
    const before = s.aside.length
    s = Object.assign({}, s, { hasRolled: true, roll: [5, 5] as Face[] })
    const after = P.setAside(s, 5)
    expect(after.aside.length).toBe(before)
  })

  it('canStop requires sum >= 21 AND a worm', () => {
    let s = P.makeGame(2)
    s = Object.assign({}, s, { aside: [5, 5, 5, 5] as Face[] }) // sum 20, no worm
    expect(P.canStop(s)).toBe(false)
    s = Object.assign({}, s, { aside: [5, 5, 5, 5, 1] as Face[] }) // sum 21, no worm
    expect(P.canStop(s)).toBe(false)
    s = Object.assign({}, s, { aside: [5, 5, 5, WORM] as Face[] }) // sum 20 with worm
    expect(P.canStop(s)).toBe(false)
    s = Object.assign({}, s, { aside: [5, 5, 5, 1, WORM] as Face[] }) // sum 21 + worm
    expect(P.canStop(s)).toBe(true)
  })

  it('stop takes the highest row tile <= sum', () => {
    let s = P.makeGame(3)
    s = Object.assign({}, s, { turn: 0, aside: [5, 5, 5, 5, 5, WORM] as Face[] }) // sum 30
    s = P.stop(s)
    const me = s.players[0]
    expect(me.stack).toHaveLength(1)
    expect(me.stack[0].n).toBe(30) // highest <= 30
    expect(s.row.find(t => t.n === 30)).toBeUndefined()
  })

  it('stop steals an opponent top tile on an exact sum match', () => {
    let s = P.makeGame(4)
    // give AI seat 1 a top tile of exactly 25
    s = Object.assign({}, s, {
      players: s.players.map(p =>
        p.seat === 1 ? Object.assign({}, p, { stack: [{ n: 25, worms: 2 }] }) : p),
      turn: 0,
      aside: [5, 5, 5, 5, WORM] as Face[], // sum 25
    })
    s = P.stop(s)
    expect(s.players[0].stack.some(t => t.n === 25)).toBe(true) // stolen
    expect(s.players[1].stack).toHaveLength(0) // victim lost top
    // tile 25 also still in the row (was never removed) -> not double-counted
    expect(s.row.filter(t => t.n === 25)).toHaveLength(1)
  })

  it('bust returns your top tile to the row and flips out the highest tile', () => {
    let s = P.makeGame(5)
    // you hold a tile 22; row still has 21..36 (16 tiles) minus 22? keep full for clarity
    s = Object.assign({}, s, {
      turn: 0,
      players: s.players.map(p =>
        p.seat === 0 ? Object.assign({}, p, { stack: [{ n: 22, worms: 1 }] }) : p),
      aside: [1, 1, 1] as Face[], // sum 3, no worm -> bust on stop
    })
    const rowBefore = s.row.length
    s = P.stop(s)
    // your tile 22 returned to row, then highest (36) flipped out:
    expect(s.players[0].stack).toHaveLength(0)
    expect(s.row.find(t => t.n === 36)).toBeUndefined() // 36 flipped
    expect(s.row.find(t => t.n === 22)).toBeDefined()   // 22 returned
    // net: +1 (returned) -1 (flipped) = same count
    expect(s.row.length).toBe(rowBefore)
    expect(s.turn).toBe(1) // advanced to next seat
  })

  it('empties the row to end the game with the most-worms winner', () => {
    let s = P.makeGame(6)
    // contrive: only one tile left, you take it and win
    s = Object.assign({}, s, {
      row: [{ n: 21, worms: 1 }],
      turn: 0,
      aside: [5, 5, 5, 5, 1, WORM] as Face[], // sum 26 -> takes 21
      players: s.players.map(p =>
        p.seat === 2 ? Object.assign({}, p, { stack: [{ n: 36, worms: 4 }] }) : p),
    })
    s = P.stop(s)
    expect(s.phase).toBe('over')
    // seat 2 had 4 worms, you took the 1-worm tile -> seat 2 wins
    expect(s.winner).toBe(2)
  })

  it('plays a full self-play game to a valid winner with no throws (guard-capped)', () => {
    let s: PickominoState = P.makeGame(123456)
    let guard = 0
    expect(() => {
      while (s.phase !== 'over' && guard < 200000) {
        guard++
        if (s.turn === 0) {
          // human policy mirrors the AI policy
          s = humanStep(s)
        } else {
          s = P.aiStep(s)
        }
      }
    }).not.toThrow()
    expect(s.phase).toBe('over')
    expect(guard).toBeLessThan(200000)
    expect(s.winner != null).toBe(true)
    expect([0, 1, 2]).toContain(s.winner)
    // row fully consumed
    expect(s.row.length).toBe(0)
  })
})

// A simple deterministic policy for seat 0 in the self-play test, reusing the AI brain
// by temporarily treating it as a non-zero seat is awkward; instead inline a greedy step.
function humanStep(s: PickominoState): PickominoState {
  if (s.phase === 'over') return s
  if (!s.hasRolled) {
    if (s.aside.length === P.N_DICE) return P.stop(s)
    if (P.canStop(s)) {
      const sum = P.sumOf(s.aside)
      if (P.stealTarget(s, sum) || P.takeableRowTile(s.row, sum)) {
        // bank once we have a worm and >= 21 and a tile is reachable, when few dice remain
        if (P.diceInHand(s) <= 3) return P.stop(s)
      }
    }
    return P.rollDice(s)
  }
  const avail = P.availableValues(s)
  if (avail.length === 0) return P.resolveBust(s)
  // need a worm? grab it; else grab highest-count*value
  const needWorm = !P.hasWorm(s.aside)
  if (needWorm && avail.includes(WORM)) return P.setAside(s, WORM)
  let best: Face = avail[0]
  let bestScore = -1
  for (const v of avail) {
    const count = s.roll.filter(d => d === v).length
    const score = P.faceValue(v) * count
    if (score > bestScore) { bestScore = score; best = v }
  }
  return P.setAside(s, best)
}
