/* BATTLESHIP — netplay adapter. Maps battleship's pure logic onto the uniform
 * GameAdapter so useGameSession can host/join it. 2 seats: 0 = the "you" grid,
 * 1 = the "enemy" grid (matches logic's solo orientation: seat 0 fires at the enemy
 * grid, seat 1 fires at the you grid).
 *
 * HIDDEN INFO: each seat's SHIP LAYOUT is private. The opponent must only ever see the
 * shots landed on your grid (hits/misses) and your SUNK ships — never the position of a
 * still-floating ship cell. redactFor rebuilds the OTHER seat's grid so its `ships`
 * contain no un-hit cells: a sunk ship is revealed in full (so the UI can draw the wreck),
 * but a ship that is still afloat is reduced to only its already-hit cells. Un-hit ship
 * cells are simply absent, so a guest can never learn where a live ship sits. The
 * leak test in battleship.net.test.ts guards this.
 *
 * PLACEMENT phase: each player privately places their fleet before firing begins. The
 * net layer is turn-based, so the adapter carries adapter-private bookkeeping on the
 * state: `_phase` ('placement' | 'playing') and `_placed` (which seats have confirmed a
 * layout). seatToMove walks the seats that still owe a placement (seat 0 first, then 1);
 * once both are in we drop the bookkeeping and firing begins with seat 0. The real
 * logic.ts `makeGame` random-places both fleets, which we keep as the AI/default layout —
 * a human `place` intent overwrites only that seat's own grid.
 */

import * as BS from './logic'
import type { BattleshipState, Grid, Ship, Side } from './logic'
import type { GameAdapter } from '../../net/protocol'

const N = BS.N

/** A ship the player wants to place: which fleet slot + the exact cells it occupies. */
export interface PlacedShip { key: string; cells: number[] }
/** Intents: privately place your fleet during setup, or fire one shot during play. */
export type BattleshipIntent =
  | { kind: 'place'; ships: PlacedShip[] }
  | { kind: 'fire'; cell: number }

type Phase = 'placement' | 'playing'
export interface BattleshipNetState extends BattleshipState {
  _phase?: Phase
  _placed?: [boolean, boolean]
}

// Grid property name on the state for each seat (NOT the `turn` Side value): seat 0's
// fleet lives on `you`, seat 1's on `enemy`.
const SEAT_TO_GRID = ['you', 'enemy'] as const
function gridFor(s: BattleshipState, seat: number): Grid {
  return seat === 0 ? s.you : s.enemy
}

function phaseOf(s: BattleshipNetState): Phase {
  return s._phase ?? 'playing'
}
function placedOf(s: BattleshipNetState): [boolean, boolean] {
  return s._placed ?? [true, true]
}

/** Lowest seat (0,1) that still owes a placement, or null if both are in. */
function nextPlacer(s: BattleshipNetState): number | null {
  const p = placedOf(s)
  for (let seat = 0; seat < 2; seat++) if (!p[seat]) return seat
  return null
}

// ---- placement validation -----------------------------------------------------------
// A fresh game with both seats still to place; fleets default to logic's random layout.
function freshPlacement(): BattleshipNetState {
  const base = BS.makeGame() as BattleshipNetState
  return Object.assign({}, base, { _phase: 'placement' as Phase, _placed: [false, false] as [boolean, boolean] })
}

/** Cells form a straight, contiguous, in-bounds H or V line of the given length. */
function isStraightLine(cells: number[], len: number): boolean {
  if (cells.length !== len) return false
  const uniq = new Set(cells)
  if (uniq.size !== len) return false
  for (const c of cells) if (c < 0 || c >= N * N) return false
  const rows = cells.map(c => Math.floor(c / N))
  const cols = cells.map(c => c % N)
  const sameRow = rows.every(r => r === rows[0])
  const sameCol = cols.every(c => c === cols[0])
  if (!sameRow && !sameCol) return false
  const line = (sameRow ? cols : rows).slice().sort((a, b) => a - b)
  for (let k = 1; k < line.length; k++) if (line[k] !== line[k - 1] + 1) return false
  return true
}

/** A full legal fleet: exactly the FLEET ships, each a straight line, no overlaps. */
function legalLayout(ships: PlacedShip[]): Ship[] | null {
  if (!Array.isArray(ships) || ships.length !== BS.FLEET.length) return null
  const occupied = new Set<number>()
  const out: Ship[] = []
  for (const spec of BS.FLEET) {
    const placed = ships.find(p => p.key === spec.key)
    if (!placed || !Array.isArray(placed.cells)) return null
    if (!isStraightLine(placed.cells, spec.len)) return null
    for (const c of placed.cells) {
      if (occupied.has(c)) return null
      occupied.add(c)
    }
    out.push({ key: spec.key, name: spec.name, len: spec.len, cells: placed.cells.slice(), hits: 0, sunk: false })
  }
  return out
}

/** Replace `seat`'s grid ships with a validated layout and mark it placed. */
function recordPlacement(s: BattleshipNetState, seat: number, ships: Ship[]): BattleshipNetState {
  const side = SEAT_TO_GRID[seat]
  const grid: Grid = { ships, fired: new Array(N * N).fill(false), hit: new Array(N * N).fill(false) }
  const placed = placedOf(s).slice() as [boolean, boolean]
  placed[seat] = true
  const next = Object.assign({}, s, { [side]: grid, _placed: placed }) as BattleshipNetState
  if (nextPlacer(next) == null) {
    // both fleets are in — leave placement, begin firing with seat 0.
    const out = Object.assign({}, next, { _phase: 'playing' as Phase, turn: 'you' as Side }) as BattleshipNetState
    delete out._placed
    delete out._phase
    return out
  }
  return next
}

// ---- firing -------------------------------------------------------------------------
// Apply seat's shot at the OTHER seat's grid. Seat 0 reuses logic's fire() directly; seat
// 1 fires at the `you` grid (logic's aiFire chooses its own AI target, so we cannot use it
// for a human-chosen cell — we mirror its shot bookkeeping here without the AI brain).
function fireFromSeat(s: BattleshipNetState, seat: number, cell: number): BattleshipNetState {
  if (seat === 0) return BS.fire(s, cell) as BattleshipNetState
  return fireAtYou(s, cell)
}

function fireAtYou(s: BattleshipNetState, cell: number): BattleshipNetState {
  if (s.winner || s.turn !== 'ai') return s
  if (cell < 0 || cell >= N * N || s.you.fired[cell]) return s
  const g = s.you
  const fired = g.fired.slice(); fired[cell] = true
  const hit = g.hit.slice()
  let isHit = false
  let sunkShip: Ship | null = null
  const ships = g.ships.map(sh => {
    if (sh.cells.includes(cell)) {
      isHit = true
      const hits = sh.hits + 1
      const nowSunk = hits >= sh.len
      if (nowSunk) sunkShip = { ...sh, hits, sunk: true }
      return { ...sh, hits, sunk: nowSunk }
    }
    return sh
  })
  hit[cell] = isHit
  const grid: Grid = { ships, fired, hit }
  let log = s.log.concat([{ t: 'ai', x: `Opponent fires at ${BS.coord(cell)} — ${isHit ? 'HIT' : 'miss'}.` }]).slice(-30)
  if (sunkShip) log = log.concat([{ t: 'ai', x: `Opponent sank your ${(sunkShip as Ship).name}!` }]).slice(-30)
  const shotsFired = s.shotsFired + 1
  if (BS.allSunk(grid)) {
    log = log.concat([{ t: 'ai', x: 'Your fleet is lost — the opponent wins.' }]).slice(-30)
    return Object.assign({}, s, { you: grid, turn: null, winner: 'ai' as Side, shotsFired, log }) as BattleshipNetState
  }
  return Object.assign({}, s, { you: grid, turn: 'you' as Side, shotsFired, log }) as BattleshipNetState
}

// ---- adapter ------------------------------------------------------------------------
export const battleshipAdapter: GameAdapter<BattleshipNetState, BattleshipIntent> = {
  makeGame: () => freshPlacement(),
  numSeats: () => 2,

  seatToMove: s => {
    if (s.winner) return null
    if (phaseOf(s) === 'placement') return nextPlacer(s)
    return s.turn === 'you' ? 0 : s.turn === 'ai' ? 1 : null
  },

  isOver: s => s.winner != null,

  applyIntent: (s, seat, intent) => {
    if (s.winner) return s
    if (phaseOf(s) === 'placement') {
      if (intent.kind !== 'place') return s
      if (nextPlacer(s) !== seat) return s // not this seat's turn to place / already placed
      const layout = legalLayout(intent.ships)
      if (!layout) return s
      return recordPlacement(s, seat, layout)
    }
    // playing
    if (intent.kind !== 'fire') return s
    const turnSeat = s.turn === 'you' ? 0 : s.turn === 'ai' ? 1 : null
    if (turnSeat !== seat) return s
    return fireFromSeat(s, seat, intent.cell)
  },

  aiStep: (s, seat) => {
    if (phaseOf(s) === 'placement') {
      if (nextPlacer(s) !== seat) return s
      // logic's makeGame already random-placed this seat's grid; just confirm it.
      const grid = gridFor(s, seat)
      return recordPlacement(s, seat, grid.ships.map(sh => ({ ...sh, cells: sh.cells.slice(), hits: 0, sunk: false })))
    }
    if (s.turn !== 'ai') return s
    return BS.aiFire(s) as BattleshipNetState // seat-1 AI reuses the HUNT/TARGET brain
  },

  // Changes on EVERY transition: a placement flips a _placed entry / the phase; a shot
  // bumps shotsFired and flips the turn or sets a winner.
  tickKey: s => {
    const ph = phaseOf(s)
    const placed = placedOf(s).filter(Boolean).length
    return `${ph}-${placed}-${s.shotsFired}-${s.turn ?? 'x'}-${s.winner ?? ''}`
  },

  // Hidden info: rebuild the OTHER seat's grid so it exposes no un-hit ship cells. A sunk
  // ship is shown in full (the wreck is public); a ship still afloat is reduced to only
  // the cells already hit, so its un-hit cells — and thus its true position — never cross
  // the wire. fired/hit boards are public (the shots themselves are visible to both).
  redactFor: (s, seat) => {
    const other = seat === 0 ? 1 : 0
    const otherSide = SEAT_TO_GRID[other]
    const og = gridFor(s, other)
    const maskedShips: Ship[] = og.ships.map(sh =>
      sh.sunk
        ? { ...sh, cells: sh.cells.slice() } // sunk: reveal the whole wreck
        : { ...sh, cells: sh.cells.filter(c => og.hit[c]) }, // afloat: only already-hit cells
    )
    const maskedGrid: Grid = { ships: maskedShips, fired: og.fired.slice(), hit: og.hit.slice() }
    return Object.assign({}, s, { [otherSide]: maskedGrid }) as BattleshipNetState
  },
}
