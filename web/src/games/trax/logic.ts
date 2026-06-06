/* TRAX — pure logic (no React/DOM).
   Square tiles, two curved tracks per tile in WHITE and RED. Each of the 4 edges
   (N,E,S,W) carries a track-end colored white or red. Two tile shapes:
     - STRAIGHT: one color runs straight across one axis, the other color straight
       across the other axis.
     - CURVED/ELBOW: two corner arcs, each connecting two adjacent edges; the two
       arcs are different colors, and together they split the tile so opposite
       edges differ.
   On a tile, the WHITE track connects the two white edges, the RED track connects
   the two red edges. Every tile therefore has exactly two white edges and two red
   edges (a 2/2 split is the only legal Trax coloring).

   We represent a placed tile by its 4 edge colors [N,E,S,W] and which pairs are
   joined (the track topology) so we can trace lines/loops.

   Win: a color forms a closed LOOP, or a LINE spanning >= 8 rows or >= 8 columns. */

export type Color = 'W' | 'R'
export type Dir = 0 | 1 | 2 | 3 // N, E, S, W

export const DIRS: Dir[] = [0, 1, 2, 3]
export const DR = [-1, 0, 1, 0]
export const DC = [0, 1, 0, -1]
export const OPP: Dir[] = [2, 3, 0, 1]

export type Player = 0 | 1 // 0 = white(you), 1 = red(ai)

/** A tile instance: edge colors [N,E,S,W] and the two connection pairs.
 * `links[d]` = the dir that edge d's track connects to within this tile. */
export interface Tile {
  edges: [Color, Color, Color, Color]
  links: [Dir, Dir, Dir, Dir]
}

/** The 8 canonical tile orientations (some are duplicates across shapes — we keep
 * the distinct ones). We generate them programmatically from two base shapes. */

function mkTile(edges: [Color, Color, Color, Color], links: [Dir, Dir, Dir, Dir]): Tile {
  return { edges, links }
}

/** Rotate a tile clockwise by `q` quarter turns. */
export function rotate(t: Tile, q: number): Tile {
  let cur = t
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) {
    const e = cur.edges
    // new edge d came from old edge d-1 (rotating tile CW shifts edges forward)
    const ne: [Color, Color, Color, Color] = [e[3], e[0], e[1], e[2]]
    const l = cur.links
    const nl: [Dir, Dir, Dir, Dir] = [0, 0, 0, 0]
    for (let d = 0 as Dir; d < 4; d++) {
      const old = ((d + 3) % 4) as Dir // edge that becomes d
      nl[d] = ((l[old] + 1) % 4) as Dir
    }
    cur = mkTile(ne, nl)
  }
  return cur
}

// Base STRAIGHT: white runs N<->S, red runs E<->W.
const STRAIGHT_BASE = mkTile(['W', 'R', 'W', 'R'], [2, 3, 0, 1])
// Base CURVED: arc joins N<->E (one color) and S<->W (other color).
// N&E same color, S&W same color, and adjacent split => N,E = W ; S,W = R.
const CURVE_BASE = mkTile(['W', 'W', 'R', 'R'], [1, 0, 3, 2])

// Exposed for tests.
export const STRAIGHT_BASE_TEST = STRAIGHT_BASE
export const CURVE_BASE_TEST = CURVE_BASE

/** All distinct orientations across both shapes. STRAIGHT has 2 distinct rotations,
 * CURVE has 4 distinct rotations => 6 distinct tiles. We keep all 8 (with dups
 * harmless) but expose a deduped list for placement search. */
export const ALL_TILES: Tile[] = dedupe([
  rotate(STRAIGHT_BASE, 0),
  rotate(STRAIGHT_BASE, 1),
  rotate(STRAIGHT_BASE, 2),
  rotate(STRAIGHT_BASE, 3),
  rotate(CURVE_BASE, 0),
  rotate(CURVE_BASE, 1),
  rotate(CURVE_BASE, 2),
  rotate(CURVE_BASE, 3),
])

function tileKey(t: Tile): string {
  return t.edges.join('') + '|' + t.links.join('')
}
function dedupe(list: Tile[]): Tile[] {
  const seen = new Set<string>()
  const out: Tile[] = []
  for (const t of list) {
    const k = tileKey(t)
    if (!seen.has(k)) { seen.add(k); out.push(t) }
  }
  return out
}

// ---------------- State ----------------

export type Cell = string // "r,c"
export function key(r: number, c: number): Cell { return r + ',' + c }
export function parse(cell: Cell): [number, number] {
  const i = cell.indexOf(',')
  return [Number(cell.slice(0, i)), Number(cell.slice(i + 1))]
}

export interface State {
  board: Map<Cell, Tile>
  turn: Player
  winner: Player | null
  winColor: Color | null
  log: { who: Player | 'sys'; x: string }[]
  moves: number // counter (re-arms AI timer)
}

export function makeGame(): State {
  return {
    board: new Map(),
    turn: 0,
    winner: null,
    winColor: null,
    log: [{ who: 'sys', x: 'White (you) places the first tile anywhere.' }],
    moves: 0,
  }
}

export function clone(s: State): State {
  return {
    board: new Map(s.board),
    turn: s.turn,
    winner: s.winner,
    winColor: s.winColor,
    log: s.log.slice(),
    moves: s.moves,
  }
}

// ---------------- Placement legality ----------------

/** Color that the existing neighbor in direction `d` presents to cell (r,c),
 * or null if that neighbor cell is empty. */
function neighborColor(board: Map<Cell, Tile>, r: number, c: number, d: Dir): Color | null {
  const nr = r + DR[d], nc = c + DC[d]
  const nt = board.get(key(nr, nc))
  if (!nt) return null
  return nt.edges[OPP[d]]
}

/** Does this tile orientation fit at (r,c) given current neighbors?
 * Every shared edge must match colors. */
export function fits(board: Map<Cell, Tile>, r: number, c: number, t: Tile): boolean {
  for (const d of DIRS) {
    const nc = neighborColor(board, r, c, d)
    if (nc != null && nc !== t.edges[d]) return false
  }
  return true
}

/** All empty cells adjacent to >=1 placed tile (or origin if board empty). */
export function emptyFrontier(board: Map<Cell, Tile>): Cell[] {
  if (board.size === 0) return [key(0, 0)]
  const seen = new Set<Cell>()
  const out: Cell[] = []
  for (const cell of board.keys()) {
    const [r, c] = parse(cell)
    for (const d of DIRS) {
      const nr = r + DR[d], nc = c + DC[d]
      const k = key(nr, nc)
      if (!board.has(k) && !seen.has(k)) { seen.add(k); out.push(k) }
    }
  }
  return out
}

export interface Placement {
  cell: Cell
  tile: Tile
  ti: number // index into ALL_TILES
}

/** Legal placements: for every frontier cell, every tile orientation that fits.
 * (The forced cells are excluded here — they are resolved automatically; a player
 * chooses a non-forced placement.) */
export function legalPlacements(s: State): Placement[] {
  const out: Placement[] = []
  const frontier = emptyFrontier(s.board)
  const forced = new Set(forcedCells(s.board).map(f => f.cell))
  for (const cell of frontier) {
    if (forced.has(cell)) continue // forced cells auto-resolve, not chosen
    const [r, c] = parse(cell)
    for (let ti = 0; ti < ALL_TILES.length; ti++) {
      const t = ALL_TILES[ti]
      if (fits(s.board, r, c, t)) out.push({ cell, tile: t, ti })
    }
  }
  return out
}

// ---------------- Forced play ----------------

/** A cell is forced if 2+ of its edges receive the SAME color from neighbors. */
interface Forced { cell: Cell; color: Color; counts: { W: number; R: number } }

export function forcedCells(board: Map<Cell, Tile>): Forced[] {
  const out: Forced[] = []
  for (const cell of emptyFrontier(board)) {
    const [r, c] = parse(cell)
    let w = 0, rd = 0
    for (const d of DIRS) {
      const col = neighborColor(board, r, c, d)
      if (col === 'W') w++
      else if (col === 'R') rd++
    }
    if (w >= 2) out.push({ cell, color: 'W', counts: { W: w, R: rd } })
    else if (rd >= 2) out.push({ cell, color: 'R', counts: { W: w, R: rd } })
  }
  return out
}

/** Choose the (unique-ish) tile that satisfies a forced cell's constraints.
 * Required edge colors come from existing neighbors; the forced color must occupy
 * the matching edges. Returns the fitting tile, or null if impossible (blocked). */
function forcedTile(board: Map<Cell, Tile>, r: number, c: number): Tile | null {
  // gather fixed edge colors
  const fixed: (Color | null)[] = [null, null, null, null]
  for (const d of DIRS) fixed[d] = neighborColor(board, r, c, d)
  // any tile orientation whose edges match all fixed edges
  for (const t of ALL_TILES) {
    let ok = true
    for (const d of DIRS) {
      if (fixed[d] != null && fixed[d] !== t.edges[d]) { ok = false; break }
    }
    if (ok) return t
  }
  return null
}

/** Resolve all forced placements iteratively. Mutates board. Returns false if a
 * contradiction (a forced cell that cannot be satisfied) is encountered. */
export function resolveForced(board: Map<Cell, Tile>): boolean {
  let guard = 0
  while (guard++ < 10000) {
    const forced = forcedCells(board)
    if (forced.length === 0) return true
    let placedAny = false
    for (const f of forced) {
      if (board.has(f.cell)) continue
      const [r, c] = parse(f.cell)
      const t = forcedTile(board, r, c)
      if (!t) return false // blocked/contradiction
      board.set(f.cell, t)
      placedAny = true
    }
    if (!placedAny) return true
  }
  return true
}

// ---------------- Win detection ----------------

/** Build a graph of color-track segments and detect loops & spanning lines.
 * Each tile contributes track segments connecting its same-colored edges. We walk
 * the network for the given color across the whole board. */

interface WinInfo { win: boolean; loop: boolean; rowSpan: number; colSpan: number }

/** Trace connectivity for `color`. A "node" is a directed edge-port (cell + dir)
 * carrying `color`. Two ports connect within a tile via links; across tiles via
 * adjacency. We find connected components, detect cycles, and measure the bounding
 * span of cells touched by each component. */
export function analyzeColor(board: Map<Cell, Tile>, color: Color): WinInfo {
  // collect all colored ports: key "r,c,d"
  const portKey = (r: number, c: number, d: Dir) => r + ',' + c + ',' + d
  type P = { r: number; c: number; d: Dir }
  const ports: Map<string, P> = new Map()
  for (const [cell, tile] of board) {
    const [r, c] = parse(cell)
    for (const d of DIRS) {
      if (tile.edges[d] === color) ports.set(portKey(r, c, d), { r, c, d })
    }
  }
  // adjacency among ports: intra-tile (link) + inter-tile (shared edge w/ a tile present)
  const adj = new Map<string, string[]>()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push(b)
  }
  for (const [cell, tile] of board) {
    const [r, c] = parse(cell)
    for (const d of DIRS) {
      if (tile.edges[d] !== color) continue
      const a = portKey(r, c, d)
      // intra-tile link
      const ld = tile.links[d]
      if (tile.edges[ld] === color) addEdge(a, portKey(r, c, ld))
      // inter-tile: neighbor port (nr,nc,OPP[d]) if neighbor tile exists & is color
      const nr = r + DR[d], nc = c + DC[d]
      const nt = board.get(key(nr, nc))
      if (nt && nt.edges[OPP[d]] === color) {
        addEdge(a, portKey(nr, nc, OPP[d]))
      }
    }
  }

  // connected components on this undirected-ish graph; detect cycle & spans
  const visited = new Set<string>()
  let loop = false
  let bestRow = 0, bestCol = 0
  for (const start of ports.keys()) {
    if (visited.has(start)) continue
    // BFS collecting cells; cycle detection via counting nodes vs edges in a tree
    const stack = [start]
    visited.add(start)
    const compPorts: string[] = []
    const cellsTouched = new Set<Cell>()
    let edgeCount = 0
    while (stack.length) {
      const cur = stack.pop()!
      compPorts.push(cur)
      const p = ports.get(cur)!
      cellsTouched.add(key(p.r, p.c))
      const ns = adj.get(cur) || []
      for (const nb of ns) {
        edgeCount++
        if (!visited.has(nb)) { visited.add(nb); stack.push(nb) }
      }
    }
    // edgeCount double counts each undirected edge (a->b and b->a). undirectedEdges:
    const undirected = edgeCount / 2
    const nodes = compPorts.length
    // A cycle exists if undirected edges >= nodes (more edges than a tree).
    if (undirected >= nodes && nodes >= 4) loop = true
    // span: distinct rows / cols among cells touched
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity
    for (const cl of cellsTouched) {
      const [r, c] = parse(cl)
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c
    }
    const rs = maxR - minR + 1
    const cs = maxC - minC + 1
    if (rs > bestRow) bestRow = rs
    if (cs > bestCol) bestCol = cs
  }

  const win = loop || bestRow >= 8 || bestCol >= 8
  return { win, loop, rowSpan: bestRow, colSpan: bestCol }
}

/** Check whether either color has won. Returns winning player or null.
 * If both win simultaneously (rare), the just-moved player's color wins. */
export function checkWin(board: Map<Cell, Tile>, justMoved: Player | null): { player: Player; color: Color } | null {
  const w = analyzeColor(board, 'W')
  const r = analyzeColor(board, 'R')
  if (w.win && r.win) {
    if (justMoved === 0) return { player: 0, color: 'W' }
    if (justMoved === 1) return { player: 1, color: 'R' }
    return { player: 0, color: 'W' }
  }
  if (w.win) return { player: 0, color: 'W' }
  if (r.win) return { player: 1, color: 'R' }
  return null
}

// ---------------- Apply a placement ----------------

/** Place tile at cell for the current turn's player, resolve forced placements,
 * check win, advance turn. Returns a new state. If the placement is illegal or
 * causes a blocked forced contradiction, returns the input unchanged. */
export function place(s: State, cell: Cell, tile: Tile): State {
  if (s.winner != null) return s
  const [r, c] = parse(cell)
  if (s.board.has(cell)) return s
  if (s.board.size > 0 && !isFrontier(s.board, r, c)) return s
  if (!fits(s.board, r, c, tile)) return s

  const ns = clone(s)
  const mover = ns.turn
  ns.board.set(cell, tile)
  const ok = resolveForced(ns.board)
  if (!ok) {
    // blocked placement — illegal; revert
    return s
  }
  ns.moves++
  ns.log = ns.log.slice(-40)
  ns.log.push({ who: mover, x: (mover === 0 ? 'White' : 'Red') + ' tile at (' + r + ',' + c + ')' })

  const won = checkWin(ns.board, mover)
  if (won) {
    ns.winner = won.player
    ns.winColor = won.color
    ns.log.push({ who: 'sys', x: (won.color === 'W' ? 'White' : 'Red') + ' completes a ' + (analyzeColor(ns.board, won.color).loop ? 'loop' : 'line') + '!' })
  } else {
    ns.turn = (mover === 0 ? 1 : 0) as Player
  }
  return ns
}

function isFrontier(board: Map<Cell, Tile>, r: number, c: number): boolean {
  for (const d of DIRS) {
    if (board.has(key(r + DR[d], c + DC[d]))) return true
  }
  return false
}

// ---------------- AI ----------------

/** Heuristic score of a board from RED's perspective (higher = better for red). */
function scoreForRed(board: Map<Cell, Tile>): number {
  const r = analyzeColor(board, 'R')
  const w = analyzeColor(board, 'W')
  if (r.win) return 100000
  if (w.win) return -100000
  // reward longer red spans, penalize long white spans
  const redReach = Math.max(r.rowSpan, r.colSpan)
  const whiteReach = Math.max(w.rowSpan, w.colSpan)
  return redReach * 10 - whiteReach * 9 + (r.loop ? 50 : 0)
}

/** Does white have an immediate winning reply on this board? (1-ply for white) */
function whiteCanWinNext(board: Map<Cell, Tile>): boolean {
  const tmp: State = {
    board, turn: 0, winner: null, winColor: null, log: [], moves: 0,
  }
  const placements = legalPlacements(tmp)
  for (const pl of placements) {
    const b2 = new Map(board)
    const [r, c] = parse(pl.cell)
    if (!fits(b2, r, c, pl.tile)) continue
    b2.set(pl.cell, pl.tile)
    if (!resolveForced(b2)) continue
    const won = checkWin(b2, 0)
    if (won && won.player === 0) return true
  }
  return false
}

/** AI (red, player 1) picks a placement. Returns a new state after red moves. */
export function aiTurn(s: State): State {
  if (s.winner != null || s.turn !== 1) return s
  const placements = legalPlacements(s)
  if (placements.length === 0) {
    // no legal move — pass (shouldn't normally happen); flip turn
    const ns = clone(s)
    ns.turn = 0
    ns.log = ns.log.slice(-40)
    ns.log.push({ who: 'sys', x: 'Red has no legal move and passes.' })
    return ns
  }

  let best: Placement | null = null
  let bestScore = -Infinity
  let safeBest: Placement | null = null
  let safeBestScore = -Infinity

  for (const pl of placements) {
    const b2 = new Map(s.board)
    const [r, c] = parse(pl.cell)
    if (!fits(b2, r, c, pl.tile)) continue
    b2.set(pl.cell, pl.tile)
    if (!resolveForced(b2)) continue
    const won = checkWin(b2, 1)
    if (won && won.player === 1) {
      // immediate red win — take it
      return place(s, pl.cell, pl.tile)
    }
    const sc = scoreForRed(b2)
    if (sc > bestScore) { bestScore = sc; best = pl }
    // safe = doesn't hand white an immediate win
    if (!whiteCanWinNext(b2)) {
      if (sc > safeBestScore) { safeBestScore = sc; safeBest = pl }
    }
  }

  const choice = safeBest ?? best ?? placements[0]
  return place(s, choice.cell, choice.tile)
}
