import { describe, it, expect } from 'vitest'
import * as BS from './logic'
import type { BattleshipState, Grid } from './logic'

// Pure logic test: no DOM. Validates placement, plays full games against the real
// HUNT/TARGET AI, and checks ship-sinking rules. Robust to randomness (loops games).

const N = BS.N
const EXPECTED = [
  { name: 'Carrier', len: 5 },
  { name: 'Battleship', len: 4 },
  { name: 'Cruiser', len: 3 },
  { name: 'Submarine', len: 3 },
  { name: 'Destroyer', len: 2 },
]

function checkFleet(g: Grid) {
  // exactly the 5 ships with the right lengths (17 cells total)
  expect(g.ships).toHaveLength(5)
  const occupied = new Set<number>()
  let total = 0
  for (let k = 0; k < EXPECTED.length; k++) {
    const sh = g.ships[k]
    expect(sh.name).toBe(EXPECTED[k].name)
    expect(sh.len).toBe(EXPECTED[k].len)
    expect(sh.cells).toHaveLength(sh.len)
    total += sh.len
    for (const c of sh.cells) {
      expect(c).toBeGreaterThanOrEqual(0)       // in-bounds
      expect(c).toBeLessThan(N * N)
      expect(occupied.has(c)).toBe(false)        // no overlap
      occupied.add(c)
    }
    // cells form a straight contiguous H or V line
    const rows = sh.cells.map(c => Math.floor(c / N))
    const cols = sh.cells.map(c => c % N)
    const sameRow = rows.every(r => r === rows[0])
    const sameCol = cols.every(c => c === cols[0])
    expect(sameRow || sameCol).toBe(true)
  }
  expect(total).toBe(17)
}

describe('battleship logic', () => {
  it('makeGame() produces two valid fleets', () => {
    for (let i = 0; i < 12; i++) {
      const s = BS.makeGame()
      expect(s.turn).toBe('you')
      expect(s.winner).toBeNull()
      checkFleet(s.you)
      checkFleet(s.enemy)
    }
  })

  it('firing a known ship cell is a HIT; hitting every cell sinks the ship', () => {
    const s = BS.makeGame()
    const ship = s.enemy.ships[2] // Cruiser, len 3
    let cur: BattleshipState = s
    for (let k = 0; k < ship.cells.length; k++) {
      const cell = ship.cells[k]
      cur = BS.fire(cur, cell)
      expect(cur.enemy.hit[cell]).toBe(true) // registered a hit
      // hand the turn back to the human so we can keep firing
      cur = { ...cur, turn: 'you' }
    }
    const sunk = cur.enemy.ships.find(x => x.name === ship.name)!
    expect(sunk.hits).toBe(ship.len)
    expect(sunk.sunk).toBe(true)
  })

  it('plays several full games to completion without duplicates and ends with a winner', () => {
    for (let game = 0; game < 6; game++) {
      let s = BS.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 460) {
        if (s.turn === 'you') {
          // fire at a random un-fired enemy cell
          const open: number[] = []
          for (let i = 0; i < N * N; i++) if (!s.enemy.fired[i]) open.push(i)
          expect(open.length).toBeGreaterThan(0)
          const before = s.enemy.fired.filter(Boolean).length
          s = BS.fire(s, open[(Math.random() * open.length) | 0])
          const after = s.enemy.fired.filter(Boolean).length
          expect(after).toBe(before + 1) // exactly one new cell fired, no dup
        } else {
          const before = s.you.fired.filter(Boolean).length
          s = BS.aiFire(s)
          const after = s.you.fired.filter(Boolean).length
          expect(after).toBe(before + 1) // AI never fires a duplicate cell
        }
      }
      expect(s.winner).not.toBeNull()                    // terminated
      const loser: Grid = s.winner === 'you' ? s.enemy : s.you
      expect(loser.ships.every(sh => sh.sunk)).toBe(true) // every loser ship sunk
      // all of the loser's ship cells are hit
      for (const sh of loser.ships) for (const c of sh.cells) expect(loser.hit[c]).toBe(true)
      // shot counts within the cap (<= 220 per side)
      expect(s.you.fired.filter(Boolean).length).toBeLessThanOrEqual(220)
      expect(s.enemy.fired.filter(Boolean).length).toBeLessThanOrEqual(220)
    }
  })
})
