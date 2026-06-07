/* RAILROAD INK — logic (built for this codebase, not ported).
   A roll-and-write route network. You (player 0) and an AI (player 1) each own a 7x7
   grid. Twelve EXITS sit on the border (some ROAD exits, some RAIL exits). Over 7 ROUNDS,
   4 shared dice are rolled — 3 "route" dice and 1 "junction" die. Each player must draw
   ALL 4 rolled pieces into their own grid (rotations allowed). Every new piece must CONNECT
   to an existing piece or a board exit, matching ROAD-to-ROAD and RAIL-to-RAIL across the
   joining edge (a STATION connects road on one side to rail on the other).

   Scoring at game end (per grid):
     + longest ROAD path  (1 pt per tile on the path)
     + longest RAILWAY path (1 pt per tile)
     + connected-exits network (table on count of exits joined into one network)
     + center 3x3 cells filled (+1 each)
     - 1 per dangling/open end (a road/rail edge pointing at an empty in-board cell). */

export type Player = 0 | 1
export interface LogEntry { t: string; x: string }

export const N = 7
export const CENTER = [2, 3, 4] // center 3x3 rows/cols

// ---- edge model --------------------------------------------------------------
// Each cell tile carries, for its 4 sides (N=0, E=1, S=2, W=3), an EdgeType.
export type EdgeType = 'none' | 'road' | 'rail'
export const N_ = 0, E_ = 1, S_ = 2, W_ = 3
export const SIDES = [N_, E_, S_, W_] as const

/** A placed tile: the edge type on each of its 4 sides + which tile def it came from. */
export interface Tile {
  defId: string
  edges: [EdgeType, EdgeType, EdgeType, EdgeType] // N, E, S, W
}

// ---- tile definitions (base orientation) -------------------------------------
// Edges listed N,E,S,W. We generate all 4 rotations and dedupe identical ones.
export interface TileDef {
  id: string
  kind: 'route' | 'junction'
  label: string
  base: [EdgeType, EdgeType, EdgeType, EdgeType]
}

const R: EdgeType = 'road'
const L: EdgeType = 'rail'
const O: EdgeType = 'none'

// Route dice faces (3 identical 6-sided "route" dice in classic Railroad Ink).
// Junction die faces (the 4th die).
export const TILE_DEFS: TileDef[] = [
  // ---- route die faces ----
  { id: 'road_straight', kind: 'route', label: 'Road —', base: [R, O, R, O] },
  { id: 'road_curve', kind: 'route', label: 'Road ⌐', base: [R, R, O, O] },
  { id: 'road_t', kind: 'route', label: 'Road ⊥', base: [R, R, O, R] },
  { id: 'rail_straight', kind: 'route', label: 'Rail —', base: [L, O, L, O] },
  { id: 'rail_curve', kind: 'route', label: 'Rail ⌐', base: [L, L, O, O] },
  { id: 'rail_t', kind: 'route', label: 'Rail ⊥', base: [L, L, O, L] },
  // ---- junction die faces ----
  { id: 'station_straight', kind: 'junction', label: 'Station —', base: [R, O, L, O] }, // road N, rail S
  { id: 'station_curve', kind: 'junction', label: 'Station ⌐', base: [R, L, O, O] }, // road N, rail E
  { id: 'overpass', kind: 'junction', label: 'Overpass', base: [R, L, R, L] }, // road N/S, rail E/W (cross, no connect)
  { id: 'cross_junction', kind: 'junction', label: 'Crossroad', base: [R, R, R, R] },
]

const DEF_MAP: Record<string, TileDef> = (() => {
  const m: Record<string, TileDef> = {}
  for (const d of TILE_DEFS) m[d.id] = d
  return m
})()
export function defOf(id: string): TileDef { return DEF_MAP[id] }

/** Rotate an edge array by `rot` quarter-turns clockwise. A +1 rotation moves
 *  N->E, E->S, S->W, W->N, i.e. new[s] = old[(s - rot) mod 4]. */
export function rotateEdges(base: [EdgeType, EdgeType, EdgeType, EdgeType], rot: number): [EdgeType, EdgeType, EdgeType, EdgeType] {
  const r = ((rot % 4) + 4) % 4
  const out: EdgeType[] = [O, O, O, O]
  for (let s = 0; s < 4; s++) out[s] = base[((s - r) % 4 + 4) % 4]
  return out as [EdgeType, EdgeType, EdgeType, EdgeType]
}

/** The set of DISTINCT orientations (rotation indices 0..3, deduped) for a def. */
export function orientations(defId: string): number[] {
  const def = defOf(defId)
  const seen = new Set<string>()
  const out: number[] = []
  for (let r = 0; r < 4; r++) {
    const e = rotateEdges(def.base, r)
    const key = e.join(',')
    if (!seen.has(key)) { seen.add(key); out.push(r) }
  }
  return out
}

/** Build a concrete Tile from a def + rotation. */
export function makeTile(defId: string, rot: number): Tile {
  return { defId, edges: rotateEdges(defOf(defId).base, rot) }
}

// ---- board geometry ----------------------------------------------------------
export const cellIdx = (r: number, c: number) => r * N + c
export const rowOf = (i: number) => Math.floor(i / N)
export const colOf = (i: number) => i % N

/** Neighbour cell across side `s` of cell i, or null if off-board. Also gives the
 *  opposite side index the neighbour shares. */
export function neighbor(i: number, s: number): { cell: number; oppSide: number } | null {
  const r = rowOf(i), c = colOf(i)
  if (s === N_) return r > 0 ? { cell: cellIdx(r - 1, c), oppSide: S_ } : null
  if (s === E_) return c < N - 1 ? { cell: cellIdx(r, c + 1), oppSide: W_ } : null
  if (s === S_) return r < N - 1 ? { cell: cellIdx(r + 1, c), oppSide: N_ } : null
  return c > 0 ? { cell: cellIdx(r, c - 1), oppSide: E_ } : null // W_
}

// ---- exits -------------------------------------------------------------------
// An exit sits on the OUTSIDE of a border cell's outer side. A piece placed in that
// cell connects to the exit if the matching edge type points outward to the exit.
export interface Exit {
  cell: number
  side: number // which outer side of the cell faces off-board
  type: EdgeType // 'road' or 'rail'
}

// Fixed standard layout: 12 exits, 3 per edge, alternating around the border.
// Classic Railroad Ink puts road & rail exits at the centers and corners of edges.
export function standardExits(): Exit[] {
  const ex: Exit[] = []
  // Top edge (row 0, side N): cols 1,3,5  -> rail, road, rail
  ex.push({ cell: cellIdx(0, 1), side: N_, type: L })
  ex.push({ cell: cellIdx(0, 3), side: N_, type: R })
  ex.push({ cell: cellIdx(0, 5), side: N_, type: L })
  // Bottom edge (row 6, side S): cols 1,3,5 -> rail, road, rail
  ex.push({ cell: cellIdx(6, 1), side: S_, type: L })
  ex.push({ cell: cellIdx(6, 3), side: S_, type: R })
  ex.push({ cell: cellIdx(6, 5), side: S_, type: L })
  // Left edge (col 0, side W): rows 1,3,5 -> road, rail, road
  ex.push({ cell: cellIdx(1, 0), side: W_, type: R })
  ex.push({ cell: cellIdx(3, 0), side: W_, type: L })
  ex.push({ cell: cellIdx(5, 0), side: W_, type: R })
  // Right edge (col 6, side E): rows 1,3,5 -> road, rail, road
  ex.push({ cell: cellIdx(1, 6), side: E_, type: R })
  ex.push({ cell: cellIdx(3, 6), side: E_, type: L })
  ex.push({ cell: cellIdx(5, 6), side: E_, type: R })
  return ex
}

// ---- state -------------------------------------------------------------------
export type Grid = (Tile | null)[] // length 49

export interface DiePiece {
  defId: string
  placed: boolean // placed by the human this round (per-player tracked via state.placed arrays)
}

export interface RRState {
  grids: [Grid, Grid] // grids[0]=you, grids[1]=ai
  exits: Exit[]
  dice: string[] // 4 rolled defIds this round
  /** Which of the 4 dice each player has already resolved (placed or skipped). */
  resolved: [boolean[], boolean[]]
  round: number // 1..7
  turn: Player // whose placements we're resolving
  phase: 'place' | 'done'
  scores: [ScoreBreakdown, ScoreBreakdown]
  winner: Player | 'draw' | null
  /** monotonic counter — bumps on every action so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

export interface ScoreBreakdown {
  road: number
  rail: number
  exits: number
  center: number
  errors: number
  total: number
}

const blankGrid = (): Grid => Array.from({ length: N * N }, () => null)
const blankScore = (): ScoreBreakdown => ({ road: 0, rail: 0, exits: 0, center: 0, errors: 0, total: 0 })

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-30) }

// ---- dice rolling (injectable randomness for tests) --------------------------
const ROUTE_FACES = TILE_DEFS.filter(d => d.kind === 'route').map(d => d.id)
const JUNCTION_FACES = TILE_DEFS.filter(d => d.kind === 'junction').map(d => d.id)

export type Rng = () => number

/** Roll the 4 shared dice: 3 route + 1 junction. rng defaults to Math.random. */
export function rollDice(rng: Rng = Math.random): string[] {
  const pick = (arr: string[]) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]
  return [pick(ROUTE_FACES), pick(ROUTE_FACES), pick(ROUTE_FACES), pick(JUNCTION_FACES)]
}

export function makeGame(optionalDice?: string[], rng: Rng = Math.random): RRState {
  const dice = optionalDice ?? rollDice(rng)
  return {
    grids: [blankGrid(), blankGrid()],
    exits: standardExits(),
    dice,
    resolved: [[false, false, false, false], [false, false, false, false]],
    round: 1,
    turn: 0,
    phase: 'place',
    scores: [blankScore(), blankScore()],
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Round 1 — place the four rolled pieces into your grid. Connect road-to-road and rail-to-rail.' }],
  }
}

// ---- placement legality ------------------------------------------------------
/** Does cell `i` of `grid` (with `exits`) currently touch any route or exit on any
 *  side? Used to know whether a fresh tile placement can ever connect. */
function cellTouchesNetwork(grid: Grid, exits: Exit[], i: number): boolean {
  for (const s of SIDES) {
    const nb = neighbor(i, s)
    if (nb) { if (grid[nb.cell]) return true }
    else {
      // border side — is there an exit here?
      if (exits.some(e => e.cell === i && e.side === s)) return true
    }
  }
  return false
}

/** Check a concrete tile placed at cell i: it must (a) CONNECT to >=1 neighbour route
 *  or exit with a matching edge type, and (b) never CONFLICT (road meeting rail) on any
 *  joined side. Returns true if a legal connection exists and no conflicts. */
export function tileFits(grid: Grid, exits: Exit[], i: number, tile: Tile): boolean {
  if (grid[i]) return false
  let connects = false
  for (const s of SIDES) {
    const myEdge = tile.edges[s]
    const nb = neighbor(i, s)
    if (nb) {
      const other = grid[nb.cell]
      if (!other) continue // empty neighbour — no constraint
      const otherEdge = other.edges[nb.oppSide]
      if (myEdge === 'none' && otherEdge === 'none') continue
      if (myEdge === otherEdge) { connects = true; continue }
      // one has a route the other doesn't match -> conflict (road meets rail, or
      // a route runs into a blank side of a placed tile).
      return false
    } else {
      // border side: an exit may sit here
      const exit = exits.find(e => e.cell === i && e.side === s)
      if (myEdge === 'none') continue
      if (exit) {
        if (exit.type === myEdge) { connects = true; continue }
        // route pointing into an exit of the wrong type — that's just a dangling end
        // off the board edge; allowed but counts as error later. Not a conflict.
        continue
      }
      // route pointing off a plain border edge — dangling, allowed (counts as error).
      continue
    }
  }
  return connects
}

export interface Placement { cell: number; rot: number }

/** All legal (cell, rotation) placements for a die face on a grid. */
export function legalPlacements(grid: Grid, exits: Exit[], defId: string): Placement[] {
  const out: Placement[] = []
  const rots = orientations(defId)
  for (let i = 0; i < N * N; i++) {
    if (grid[i]) continue
    if (!cellTouchesNetwork(grid, exits, i)) continue
    for (const rot of rots) {
      const tile = makeTile(defId, rot)
      if (tileFits(grid, exits, i, tile)) out.push({ cell: i, rot })
    }
  }
  return out
}

/** Index of the first unresolved die showing `defId` for player `p`, or -1. */
function firstUnresolvedDie(s: RRState, p: Player, defId: string): number {
  for (let k = 0; k < s.dice.length; k++) {
    if (s.dice[k] === defId && !s.resolved[p][k]) return k
  }
  return -1
}

/** Place a tile (by die index) for a player. Validates legality. Returns new state
 *  (unchanged if illegal). After all 4 resolved for the turn, advances. */
export function placeTile(s: RRState, p: Player, dieIdx: number, cell: number, rot: number): RRState {
  if (s.winner != null || s.phase !== 'place' || s.turn !== p) return s
  if (dieIdx < 0 || dieIdx >= s.dice.length) return s
  if (s.resolved[p][dieIdx]) return s
  const tile = makeTile(s.dice[dieIdx], rot)
  if (!tileFits(s.grids[p], s.exits, cell, tile)) return s
  const grids = s.grids.slice() as [Grid, Grid]
  const g = grids[p].slice()
  g[cell] = tile
  grids[p] = g
  const resolved = s.resolved.map(a => a.slice()) as [boolean[], boolean[]]
  resolved[p][dieIdx] = true
  const who = p === 0 ? 'You' : 'AI'
  const log = push(s.log, p === 0 ? 'you' : 'ai', `${who} placed ${defOf(s.dice[dieIdx]).label}.`)
  return advance({ ...s, grids, resolved, step: s.step + 1, log })
}

/** Skip a die (when it cannot be legally placed). */
export function skipDie(s: RRState, p: Player, dieIdx: number): RRState {
  if (s.winner != null || s.phase !== 'place' || s.turn !== p) return s
  if (dieIdx < 0 || dieIdx >= s.dice.length || s.resolved[p][dieIdx]) return s
  // Only allow skipping when there are genuinely no legal placements.
  if (legalPlacements(s.grids[p], s.exits, s.dice[dieIdx]).length > 0) return s
  const resolved = s.resolved.map(a => a.slice()) as [boolean[], boolean[]]
  resolved[p][dieIdx] = true
  const who = p === 0 ? 'You' : 'AI'
  const log = push(s.log, p === 0 ? 'you' : 'ai', `${who} could not place ${defOf(s.dice[dieIdx]).label} — skipped.`)
  return advance({ ...s, resolved, step: s.step + 1, log })
}

/** Auto-resolve any of a player's remaining dice that have NO legal placement (so
 *  the UI never deadlocks). */
export function autoSkipDeadDice(s: RRState, p: Player): RRState {
  let st = s
  for (let k = 0; k < st.dice.length; k++) {
    if (st.resolved[p][k]) continue
    if (legalPlacements(st.grids[p], st.exits, st.dice[k]).length === 0) {
      st = skipDie(st, p, k)
    }
  }
  return st
}

function allResolved(s: RRState, p: Player): boolean {
  return s.resolved[p].every(Boolean)
}

/** Advance turn/round once the active player has resolved all 4 dice. */
function advance(s: RRState): RRState {
  if (!allResolved(s, s.turn)) return s
  if (s.turn === 0) {
    // Hand off to the AI for the same round (fresh start; AI resolves its 4 dice).
    return { ...s, turn: 1, step: s.step + 1 }
  }
  // AI just finished — round complete.
  if (s.round >= 7) {
    return finalize(s)
  }
  const nextDice = rollDice()
  const log = push(s.log, 'sys', `Round ${s.round + 1} — four new pieces rolled.`)
  return {
    ...s,
    round: s.round + 1,
    dice: nextDice,
    resolved: [[false, false, false, false], [false, false, false, false]],
    turn: 0,
    step: s.step + 1,
    log,
  }
}

/** Reroll dice for a fresh round using a given rng (used by self-play tests). */
export function rerollFor(s: RRState, dice: string[]): RRState {
  return { ...s, dice, resolved: [[false, false, false, false], [false, false, false, false]], turn: 0 }
}

// ---- scoring -----------------------------------------------------------------
/** Longest simple path through tiles connected by a given network type ('road' or
 *  'rail'). We build an undirected graph where an edge connects two adjacent tiles
 *  if both expose `type` on the shared side, then find the longest simple path
 *  (in tiles) via DFS. Grids are small (<=49) and sparse, so this is fine. */
export function longestPath(grid: Grid, type: EdgeType): number {
  // adjacency over cells that participate in this network type
  const adj: Record<number, number[]> = {}
  const nodes: number[] = []
  for (let i = 0; i < N * N; i++) {
    const t = grid[i]
    if (!t) continue
    if (!t.edges.some(e => e === type)) continue
    nodes.push(i)
    adj[i] = []
  }
  for (const i of nodes) {
    const t = grid[i]!
    for (const s of SIDES) {
      if (t.edges[s] !== type) continue
      const nb = neighbor(i, s)
      if (!nb) continue
      const o = grid[nb.cell]
      if (!o) continue
      if (o.edges[nb.oppSide] === type) adj[i].push(nb.cell)
    }
  }
  // longest simple path via DFS from each node
  let best = 0
  const visited = new Set<number>()
  function dfs(u: number, len: number) {
    if (len > best) best = len
    for (const v of adj[u]) {
      if (visited.has(v)) continue
      visited.add(v)
      dfs(v, len + 1)
      visited.delete(v)
    }
  }
  for (const start of nodes) {
    visited.clear()
    visited.add(start)
    dfs(start, 1)
  }
  return best
}

const EXIT_TABLE: Record<number, number> = {
  0: 0, 1: 0, 2: 4, 3: 8, 4: 12, 5: 16, 6: 20, 7: 24, 8: 28, 9: 32, 10: 36, 11: 41, 12: 45,
}

/** Score the connected-exit network: find connected components of tiles+exits where
 *  adjacency means a matching route crosses the shared side; for each component count
 *  how many EXITS it joins; score the LARGEST such count via EXIT_TABLE. */
export function scoreExits(grid: Grid, exits: Exit[]): number {
  // Union-find over cells, joined when adjacent tiles share a matching route edge.
  const parent: number[] = Array.from({ length: N * N }, (_, i) => i)
  function find(a: number): number { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
  function union(a: number, b: number) { parent[find(a)] = find(b) }
  for (let i = 0; i < N * N; i++) {
    const t = grid[i]
    if (!t) continue
    for (const s of [E_, S_]) { // only need E and S to avoid double work
      if (t.edges[s] === 'none') continue
      const nb = neighbor(i, s)
      if (!nb) continue
      const o = grid[nb.cell]
      if (!o) continue
      if (o.edges[nb.oppSide] === t.edges[s]) union(i, nb.cell)
    }
  }
  // count exits per component root
  const perRoot: Record<number, number> = {}
  for (const ex of exits) {
    const t = grid[ex.cell]
    if (!t) continue
    if (t.edges[ex.side] === ex.type) {
      const root = find(ex.cell)
      perRoot[root] = (perRoot[root] ?? 0) + 1
    }
  }
  let maxExits = 0
  for (const k of Object.keys(perRoot)) maxExits = Math.max(maxExits, perRoot[Number(k)])
  return EXIT_TABLE[Math.min(12, maxExits)] ?? 0
}

/** Count filled cells in the center 3x3. */
export function scoreCenter(grid: Grid): number {
  let n = 0
  for (const r of CENTER) for (const c of CENTER) if (grid[cellIdx(r, c)]) n++
  return n
}

/** Count open/dangling ends: a route edge of a placed tile pointing into an EMPTY
 *  in-board neighbour cell (not a matched exit). Each is -1. */
export function countErrors(grid: Grid, exits: Exit[]): number {
  let errs = 0
  for (let i = 0; i < N * N; i++) {
    const t = grid[i]
    if (!t) continue
    for (const s of SIDES) {
      if (t.edges[s] === 'none') continue
      const nb = neighbor(i, s)
      if (nb) {
        const o = grid[nb.cell]
        if (!o) errs++ // points into empty in-board cell -> dangling
        // (matched/conflicting handled at placement; a placed neighbour always matches by legality)
      } else {
        // border side: dangling unless it lands on a matching exit
        const ex = exits.find(e => e.cell === i && e.side === s)
        if (!ex || ex.type !== t.edges[s]) errs++
      }
    }
  }
  return errs
}

export function scoreGrid(grid: Grid, exits: Exit[]): ScoreBreakdown {
  const road = longestPath(grid, 'road')
  const rail = longestPath(grid, 'rail')
  const exitsPts = scoreExits(grid, exits)
  const center = scoreCenter(grid)
  const errors = countErrors(grid, exits)
  const total = road + rail + exitsPts + center - errors
  return { road, rail, exits: exitsPts, center, errors, total }
}

function finalize(s: RRState): RRState {
  const scores: [ScoreBreakdown, ScoreBreakdown] = [
    scoreGrid(s.grids[0], s.exits),
    scoreGrid(s.grids[1], s.exits),
  ]
  let winner: Player | 'draw'
  if (scores[0].total > scores[1].total) winner = 0
  else if (scores[1].total > scores[0].total) winner = 1
  else winner = 'draw'
  const msg = winner === 'draw'
    ? `Tie game — both scored ${scores[0].total}.`
    : winner === 0
      ? `You win ${scores[0].total}–${scores[1].total}!`
      : `AI wins ${scores[1].total}–${scores[0].total}.`
  const log = push(s.log, winner === 0 ? 'you' : winner === 1 ? 'ai' : 'sys', msg)
  return { ...s, scores, winner, phase: 'done', step: s.step + 1, log }
}

// ---- AI ----------------------------------------------------------------------
/** Heuristic value of placing a die's tile at a candidate spot — greedy: extend
 *  networks, connect exits, fill center, avoid creating errors. We score the AI's
 *  resulting grid delta cheaply. */
function placementScore(grid: Grid, exits: Exit[], cell: number, tile: Tile): number {
  let score = 0
  // count matched connections (good) and new dangling ends (bad)
  for (const s of SIDES) {
    const myEdge = tile.edges[s]
    const nb = neighbor(cell, s)
    if (nb) {
      const o = grid[nb.cell]
      if (o) {
        if (myEdge !== 'none' && o.edges[nb.oppSide] === myEdge) score += 3 // good join
      } else if (myEdge !== 'none') {
        score -= 1 // dangling into empty cell (may be filled later, mild penalty)
      }
    } else {
      const ex = exits.find(e => e.cell === cell && e.side === s)
      if (ex && ex.type === myEdge) score += 5 // connect an exit — valuable
      else if (myEdge !== 'none') score -= 2 // route off board edge — error
    }
  }
  // center bonus
  if (CENTER.includes(rowOf(cell)) && CENTER.includes(colOf(cell))) score += 2
  return score
}

/** AI resolves ONE die this call (greedy best placement; skip if impossible), so the
 *  driver can re-arm on s.step and animate placements one at a time. */
export function aiStep(s: RRState): RRState {
  if (s.winner != null || s.turn !== 1 || s.phase !== 'place') return s
  // pick the first unresolved die
  let k = -1
  for (let j = 0; j < s.dice.length; j++) if (!s.resolved[1][j]) { k = j; break }
  if (k < 0) return advance(s) // safety
  const defId = s.dice[k]
  const placements = legalPlacements(s.grids[1], s.exits, defId)
  if (placements.length === 0) return skipDie(s, 1, k)
  let best = placements[0], bestScore = -Infinity
  for (const pl of placements) {
    const tile = makeTile(defId, pl.rot)
    const sc = placementScore(s.grids[1], s.exits, pl.cell, tile)
    if (sc > bestScore) { bestScore = sc; best = pl }
  }
  return placeTile(s, 1, k, best.cell, best.rot)
}

/** Resolve the AI's ENTIRE turn (all 4 dice) in one call — used by tests / fast play. */
export function aiTurn(s: RRState): RRState {
  let st = s
  let guard = 0
  while (st.turn === 1 && st.phase === 'place' && st.winner == null && guard++ < 50) {
    const before = st.step
    st = aiStep(st)
    if (st.step === before) break // no progress — bail
  }
  return st
}

export function winner(s: RRState): Player | 'draw' | null { return s.winner }
