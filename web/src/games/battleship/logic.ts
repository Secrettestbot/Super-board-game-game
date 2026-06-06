/* BATTLESHIP — logic + AI (built for this codebase, not ported).
   Two 10x10 grids. You and the rival each hide a standard fleet of 5 ships
   (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2 = 17 cells).
   Fleets are placed at random with no overlaps, all in-bounds, H or V.
   Players alternate firing one shot at the other's grid; a ship is SUNK when
   all its cells are hit; first to sink all 5 of the opponent's ships wins.
   The AI uses HUNT/TARGET: parity hunting, then orthogonal targeting that
   locks onto a ship's line once two hits line up. Pure — no React/DOM. */

export const N = 10

export interface ShipSpec { name: string; len: number; key: string }
export const FLEET: ShipSpec[] = [
  { key: 'carrier', name: 'Carrier', len: 5 },
  { key: 'battleship', name: 'Battleship', len: 4 },
  { key: 'cruiser', name: 'Cruiser', len: 3 },
  { key: 'submarine', name: 'Submarine', len: 3 },
  { key: 'destroyer', name: 'Destroyer', len: 2 },
]

export interface Ship {
  key: string
  name: string
  len: number
  cells: number[]   // board indices it occupies
  hits: number      // how many of its cells are hit
  sunk: boolean
}

export interface Grid {
  ships: Ship[]
  fired: boolean[]  // length 100 — has this cell been fired at?
  hit: boolean[]    // length 100 — was the shot a hit?
}

export type Side = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

// AI's hunting brain — carried on state so logic stays pure/immutable.
export interface AIMind {
  queue: number[]            // target cells to try (orthogonal neighbours of hits)
  hits: number[]             // confirmed hit cells of the ship currently being chased
}

export interface BattleshipState {
  you: Grid                  // YOUR fleet — the AI fires here
  enemy: Grid                // the RIVAL's fleet — you fire here
  turn: Side | null
  winner: Side | null
  shotsFired: number         // total shots both sides — used for AI tick re-arm
  ai: AIMind
  log: LogEntry[]
}

const idx = (r: number, c: number) => r * N + c
const rowOf = (i: number) => Math.floor(i / N)
const colOf = (i: number) => i % N
const COLS = 'ABCDEFGHIJ'
export const coord = (i: number) => COLS[colOf(i)] + (rowOf(i) + 1)

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-30)
}

// ---- random placement ----
function placeFleet(): Ship[] {
  const ships: Ship[] = []
  const occupied = new Set<number>()
  for (const spec of FLEET) {
    let placed = false
    let guard = 0
    while (!placed && guard++ < 1000) {
      const horiz = Math.random() < 0.5
      const maxR = horiz ? N : N - spec.len
      const maxC = horiz ? N - spec.len : N
      const r = (Math.random() * maxR) | 0
      const c = (Math.random() * maxC) | 0
      const cells: number[] = []
      for (let k = 0; k < spec.len; k++) cells.push(horiz ? idx(r, c + k) : idx(r + k, c))
      if (cells.some(x => occupied.has(x))) continue
      for (const x of cells) occupied.add(x)
      ships.push({ key: spec.key, name: spec.name, len: spec.len, cells, hits: 0, sunk: false })
      placed = true
    }
    if (!placed) return placeFleet() // extremely unlikely — restart
  }
  return ships
}

function emptyGrid(): Grid {
  return { ships: placeFleet(), fired: new Array(N * N).fill(false), hit: new Array(N * N).fill(false) }
}

export function makeGame(): BattleshipState {
  return {
    you: emptyGrid(),
    enemy: emptyGrid(),
    turn: 'you',
    winner: null,
    shotsFired: 0,
    ai: { queue: [], hits: [] },
    log: [{ t: 'sys', x: 'Battle stations. Click the rival waters to fire — sink all five ships to win.' }],
  }
}

export function fleetSunkCount(g: Grid): number {
  return g.ships.filter(s => s.sunk).length
}
export function allSunk(g: Grid): boolean {
  return g.ships.every(s => s.sunk)
}

// Apply a shot to a grid; returns { grid, hit, sunkShip }. Caller guarantees cell un-fired.
function applyShot(g: Grid, i: number): { grid: Grid; isHit: boolean; sunk: Ship | null } {
  const fired = g.fired.slice(); fired[i] = true
  const hitArr = g.hit.slice()
  let isHit = false
  let sunk: Ship | null = null
  const ships = g.ships.map(s => {
    if (s.cells.includes(i)) {
      isHit = true
      const hits = s.hits + 1
      const nowSunk = hits >= s.len
      if (nowSunk) sunk = { ...s, hits, sunk: true }
      return { ...s, hits, sunk: nowSunk }
    }
    return s
  })
  hitArr[i] = isHit
  return { grid: { ships, fired, hit: hitArr }, isHit, sunk }
}

// ---- YOUR shot at the enemy grid ----
export function fire(s: BattleshipState, i: number): BattleshipState {
  if (s.winner || s.turn !== 'you') return s
  if (i < 0 || i >= N * N || s.enemy.fired[i]) return s
  const { grid, isHit, sunk } = applyShot(s.enemy, i)
  let log = push(s.log, 'you', `You fire at ${coord(i)} — ${isHit ? 'HIT' : 'miss'}.`)
  if (sunk) log = push(log, 'you', `You sank the rival's ${sunk.name}!`)
  const shotsFired = s.shotsFired + 1
  if (allSunk(grid)) {
    log = push(log, 'you', 'Enemy fleet destroyed — victory!')
    return { ...s, enemy: grid, turn: null, winner: 'you', shotsFired, log }
  }
  return { ...s, enemy: grid, turn: 'ai', shotsFired, log }
}

// ---- AI shot at YOUR grid (HUNT / TARGET) ----
function neighbours(i: number): number[] {
  const r = rowOf(i), c = colOf(i)
  const out: number[] = []
  if (r > 0) out.push(idx(r - 1, c))
  if (r < N - 1) out.push(idx(r + 1, c))
  if (c > 0) out.push(idx(r, c - 1))
  if (c < N - 1) out.push(idx(r, c + 1))
  return out
}

// Given two-plus confirmed hits in a line, the cells that extend that line.
function lineExtensions(hits: number[]): number[] {
  if (hits.length < 2) return []
  const sameRow = hits.every(h => rowOf(h) === rowOf(hits[0]))
  const sameCol = hits.every(h => colOf(h) === colOf(hits[0]))
  const out: number[] = []
  if (sameRow) {
    const r = rowOf(hits[0])
    const cs = hits.map(colOf).sort((a, b) => a - b)
    const lo = cs[0], hi = cs[cs.length - 1]
    if (lo - 1 >= 0) out.push(idx(r, lo - 1))
    if (hi + 1 < N) out.push(idx(r, hi + 1))
  } else if (sameCol) {
    const c = colOf(hits[0])
    const rs = hits.map(rowOf).sort((a, b) => a - b)
    const lo = rs[0], hi = rs[rs.length - 1]
    if (lo - 1 >= 0) out.push(idx(lo - 1, c))
    if (hi + 1 < N) out.push(idx(hi + 1, c))
  }
  return out
}

// Pick the AI's next cell on YOUR grid. Returns -1 only if board is exhausted (never in practice).
function chooseAITarget(g: Grid, mind: AIMind): { cell: number; queue: number[]; hits: number[] } {
  const fired = g.fired
  let queue = mind.queue.slice()
  let hits = mind.hits.slice()

  // If we're chasing a ship with a known line, prefer line extensions.
  const lineCells = lineExtensions(hits).filter(c => !fired[c])
  const merged = lineCells.concat(queue.filter(c => !fired[c] && !lineCells.includes(c)))
  const dedup: number[] = []
  for (const c of merged) if (!dedup.includes(c)) dedup.push(c)
  queue = dedup

  if (queue.length) {
    const cell = queue.shift() as number
    return { cell, queue, hits }
  }

  // HUNT: parity / checkerboard pattern among un-fired cells.
  const avail: number[] = []
  for (let i = 0; i < N * N; i++) if (!fired[i]) avail.push(i)
  const parity = avail.filter(i => (rowOf(i) + colOf(i)) % 2 === 0)
  const pool = parity.length ? parity : avail
  const cell = pool[(Math.random() * pool.length) | 0]
  return { cell, queue, hits: [] }
}

export function aiFire(s: BattleshipState): BattleshipState {
  if (s.winner || s.turn !== 'ai') return s
  const { cell, queue, hits } = chooseAITarget(s.you, s.ai)
  if (cell < 0) return s
  const { grid, isHit, sunk } = applyShot(s.you, cell)

  let nextHits = hits.slice()
  let nextQueue = queue.slice()
  if (isHit) {
    nextHits = nextHits.concat([cell])
    // enqueue orthogonal neighbours to keep targeting
    for (const nb of neighbours(cell)) if (!grid.fired[nb] && !nextQueue.includes(nb)) nextQueue.push(nb)
  }
  if (sunk) {
    // ship destroyed — reset the hunting brain
    nextHits = []
    nextQueue = []
  }

  let log = push(s.log, 'ai', `Rival fires at ${coord(cell)} — ${isHit ? 'HIT' : 'miss'}.`)
  if (sunk) log = push(log, 'ai', `Rival sank your ${(sunk as Ship).name}!`)
  const shotsFired = s.shotsFired + 1
  const mind: AIMind = { queue: nextQueue, hits: nextHits }

  if (allSunk(grid)) {
    log = push(log, 'ai', 'Your fleet is lost — the rival wins.')
    return { ...s, you: grid, ai: mind, turn: null, winner: 'ai', shotsFired, log }
  }
  return { ...s, you: grid, ai: mind, turn: 'you', shotsFired, log }
}
