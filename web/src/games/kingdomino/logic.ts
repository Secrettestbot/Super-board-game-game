/* KINGDOMINO — pure logic (no React/DOM).
   2-player "duel": 48 dominoes, 24 used (deck shuffled, draws of 4 per round).
   Each domino shows two terrain squares, some squares bear crowns (0-3).
   Each player builds a 5x5 kingdom around a central castle.

   Flow per round:
     - 4 dominoes are revealed, sorted ascending by number.
     - In turn order, each player PLACES their previously-claimed domino (round 1 has
       nothing to place), then CLAIMS one of the 4 revealed tiles for next round.
       The tile you claim sets your seat in next round's order (lower number = earlier).
   When the deck runs out, the final placements resolve and scores are computed.

   Scoring: for each connected single-terrain region, (#squares) * (total crowns).
   Bonuses: +10 for filling the whole 5x5, +5 for a centered castle (castle is always
   centered in this implementation, so it always applies once a kingdom is built). */

export type Terrain = 'wheat' | 'forest' | 'water' | 'grass' | 'swamp' | 'mine'
export const TERRAINS: Terrain[] = ['wheat', 'forest', 'water', 'grass', 'swamp', 'mine']

/** A single terrain square within a domino (or placed on a grid). */
export interface Square {
  terrain: Terrain
  crowns: number
}

/** A domino: two terrain squares, square a then square b, with a draft number. */
export interface Tile {
  id: number
  num: number
  a: Square
  b: Square
}

/** A placed square on a 5x5 grid (null = empty; the castle is a special marker). */
export type Cell = { terrain: 'castle'; crowns: 0 } | Square | null

export type Player = 0 | 1

/** An entry in the current 4-tile draft lineup. claimedBy: which player took it. */
export interface DraftEntry {
  tile: Tile
  claimedBy: Player | null
}

export interface PlayerState {
  grid: Cell[] // 25 cells, row-major 5x5; index 12 = center castle
  claimed: Tile | null // the tile this player will place next
  score: number
}

export interface KingdomState {
  deck: Tile[] // remaining undrawn tiles
  lineup: DraftEntry[] // current round's 4 revealed tiles (sorted by num)
  order: Player[] // turn order for the CURRENT lineup (who acts first)
  nextOrder: Player[] // accumulates next round's order as tiles are claimed
  turnPos: number // index into `order` — whose turn it is within the round
  players: [PlayerState, PlayerState]
  phase: 'place' | 'claim' | 'over'
  current: Player // convenience: order[turnPos] (or 0 when over)
  winner: Player | null // -1 sentinel not used; null until over, then 0/1; tie -> stored separately
  tie: boolean
  tick: number // monotonic counter; changes on every state-advancing action
}

export const GRID = 5
export const CENTER = 12 // 2*5 + 2

// ---- orientation / geometry ----
// A domino placement has an anchor cell (where square `a` goes) and an orientation
// giving the offset to square `b`. 0=right, 1=down, 2=left, 3=up.
export const ORIENTS: { dr: number; dc: number }[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
]

export function rc(idx: number): [number, number] {
  return [Math.floor(idx / GRID), idx % GRID]
}
export function idxOf(r: number, c: number): number {
  return r * GRID + c
}
export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < GRID && c >= 0 && c < GRID
}

// ---- deck ----
// Standard Kingdomino has 48 numbered tiles. We build a representative 48-tile deck
// deterministically so tests are stable, then shuffle with a seeded RNG.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Build the canonical 48-tile deck (numbered 1..48). Crown distribution roughly
    follows the real game: low numbers are crownless, high numbers bear crowns. */
export function buildDeck(): Tile[] {
  // [terrainA, crownsA, terrainB, crownsB] for each of 48 tiles, ordered by value.
  const defs: [Terrain, number, Terrain, number][] = [
    ['wheat', 0, 'wheat', 0],
    ['wheat', 0, 'wheat', 0],
    ['forest', 0, 'forest', 0],
    ['forest', 0, 'forest', 0],
    ['forest', 0, 'forest', 0],
    ['forest', 0, 'forest', 0],
    ['water', 0, 'water', 0],
    ['water', 0, 'water', 0],
    ['water', 0, 'water', 0],
    ['grass', 0, 'grass', 0],
    ['grass', 0, 'grass', 0],
    ['swamp', 0, 'swamp', 0],
    ['wheat', 0, 'forest', 0],
    ['wheat', 0, 'water', 0],
    ['wheat', 0, 'grass', 0],
    ['wheat', 0, 'swamp', 0],
    ['forest', 0, 'water', 0],
    ['forest', 0, 'grass', 0],
    ['wheat', 0, 'forest', 1],
    ['wheat', 0, 'water', 1],
    ['wheat', 0, 'grass', 1],
    ['wheat', 0, 'swamp', 1],
    ['wheat', 0, 'mine', 1],
    ['forest', 1, 'wheat', 0],
    ['forest', 1, 'wheat', 0],
    ['forest', 1, 'wheat', 0],
    ['forest', 1, 'wheat', 0],
    ['water', 1, 'wheat', 0],
    ['water', 1, 'wheat', 0],
    ['water', 1, 'forest', 0],
    ['water', 1, 'forest', 0],
    ['grass', 1, 'wheat', 0],
    ['grass', 1, 'water', 0],
    ['grass', 1, 'forest', 0],
    ['swamp', 1, 'wheat', 0],
    ['swamp', 1, 'grass', 0],
    ['wheat', 0, 'grass', 2],
    ['water', 0, 'grass', 2],
    ['wheat', 0, 'swamp', 2],
    ['grass', 0, 'swamp', 2],
    ['mine', 2, 'wheat', 0],
    ['swamp', 0, 'mine', 2],
    ['swamp', 0, 'mine', 2],
    ['wheat', 0, 'mine', 2],
    ['grass', 0, 'mine', 2],
    ['mine', 3, 'wheat', 0],
    ['mine', 3, 'water', 0],
    ['wheat', 0, 'mine', 3],
  ]
  return defs.map((d, i) => ({
    id: i,
    num: i + 1,
    a: { terrain: d[0], crowns: d[1] },
    b: { terrain: d[2], crowns: d[3] },
  }))
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function emptyGrid(): Cell[] {
  const g: Cell[] = new Array(25).fill(null)
  g[CENTER] = { terrain: 'castle', crowns: 0 }
  return g
}

/** Create a fresh game. Optionally pass a fixed deck for deterministic tests
    (it is used in order, no shuffle). Otherwise a seeded shuffle of the 48-tile deck. */
export function makeGame(optionalDeck?: Tile[], seed?: number): KingdomState {
  let deck: Tile[]
  if (optionalDeck) {
    deck = optionalDeck.slice()
  } else {
    const s = seed == null ? Math.floor(Math.random() * 1e9) : seed
    deck = shuffle(buildDeck(), mulberry32(s)).slice(0, 24)
  }
  const players: [PlayerState, PlayerState] = [
    { grid: emptyGrid(), claimed: null, score: 0 },
    { grid: emptyGrid(), claimed: null, score: 0 },
  ]
  const s: KingdomState = {
    deck,
    lineup: [],
    order: [0, 1],
    nextOrder: [],
    turnPos: 0,
    players,
    phase: 'claim',
    current: 0,
    winner: null,
    tie: false,
    tick: 0,
  }
  dealLineup(s)
  return s
}

/** Deal the next 4 tiles into the lineup, sorted ascending by number. Mutates s. */
function dealLineup(s: KingdomState): void {
  const take = Math.min(4, s.deck.length)
  const tiles = s.deck.slice(0, take).sort((x, y) => x.num - y.num)
  s.deck = s.deck.slice(take)
  s.lineup = tiles.map((t) => ({ tile: t, claimedBy: null as Player | null }))
}

// ---- placement legality ----

/** All legal placements of `tile` on `grid`. Each result: anchor index (square a),
    orientation index, and whether the placement touches a matching terrain (vs only
    castle). Honours the 5x5 bounding box, the castle/terrain adjacency rule, and
    overlap. The 5x5 here is the fixed grid; we also enforce that occupied squares
    fit within a 5-wide footprint (always true on a 5x5 grid). */
export interface Placement {
  anchor: number
  orient: number
}

function terrainAt(grid: Cell[], r: number, c: number): Terrain | 'castle' | null {
  if (!inBounds(r, c)) return null
  const cell = grid[idxOf(r, c)]
  if (cell == null) return null
  return cell.terrain
}

/** Does a square at (r,c) of given terrain connect to the existing kingdom?
    Connection = orthogonally adjacent to the castle OR to a same-terrain square. */
function squareConnects(grid: Cell[], r: number, c: number, terrain: Terrain): boolean {
  for (const o of ORIENTS) {
    const t = terrainAt(grid, r + o.dr, c + o.dc)
    if (t === 'castle') return true
    if (t === terrain) return true
  }
  return false
}

export function legalPlacements(grid: Cell[], tile: Tile): Placement[] {
  const out: Placement[] = []
  for (let anchor = 0; anchor < 25; anchor++) {
    const [ar, ac] = rc(anchor)
    if (grid[anchor] != null) continue
    for (let o = 0; o < ORIENTS.length; o++) {
      const br = ar + ORIENTS[o].dr
      const bc = ac + ORIENTS[o].dc
      if (!inBounds(br, bc)) continue
      const bIdx = idxOf(br, bc)
      if (grid[bIdx] != null) continue
      // Either square must connect to the kingdom (castle or matching terrain),
      // considering the other half is not yet placed (so it can't self-connect here).
      const aConn = squareConnects(grid, ar, ac, tile.a.terrain)
      const bConn = squareConnects(grid, br, bc, tile.b.terrain)
      if (aConn || bConn) out.push({ anchor, orient: o })
    }
  }
  return out
}

/** Apply a placement to a grid copy (does not validate; use legalPlacements first). */
export function applyPlacement(grid: Cell[], tile: Tile, p: Placement): Cell[] {
  const g = grid.slice()
  const [ar, ac] = rc(p.anchor)
  const br = ar + ORIENTS[p.orient].dr
  const bc = ac + ORIENTS[p.orient].dc
  g[p.anchor] = { terrain: tile.a.terrain, crowns: tile.a.crowns }
  g[idxOf(br, bc)] = { terrain: tile.b.terrain, crowns: tile.b.crowns }
  return g
}

// ---- scoring ----

/** Flood-fill scoring: each connected single-terrain region scores size*crowns. */
export function scoreGrid(grid: Cell[]): number {
  const seen = new Array(25).fill(false)
  let total = 0
  let filled = 0
  for (let i = 0; i < 25; i++) {
    const cell = grid[i]
    if (cell == null) continue
    filled++
    if (cell.terrain === 'castle') continue
    if (seen[i]) continue
    const terrain = cell.terrain
    let size = 0
    let crowns = 0
    const stack = [i]
    seen[i] = true
    while (stack.length) {
      const cur = stack.pop()!
      const c = grid[cur]
      if (c == null || c.terrain === 'castle' || c.terrain !== terrain) continue
      size++
      crowns += c.crowns
      const [r, col] = rc(cur)
      for (const o of ORIENTS) {
        const nr = r + o.dr
        const nc = col + o.dc
        if (!inBounds(nr, nc)) continue
        const ni = idxOf(nr, nc)
        if (seen[ni]) continue
        const nci = grid[ni]
        if (nci != null && nci.terrain === terrain) {
          seen[ni] = true
          stack.push(ni)
        }
      }
    }
    total += size * crowns
  }
  // bonuses
  if (filled === 25) total += 10 // full 5x5
  if (grid[CENTER] != null && grid[CENTER]!.terrain === 'castle') total += 5 // centered castle
  return total
}

// ---- actions ----

/** Place the current player's claimed tile. orient + anchor must be a legal placement.
    If the player has no legal placement available, the tile is discarded (call with
    p = null). Advances to the claim phase. Returns a NEW state. */
export function placeTile(s: KingdomState, p: Placement | null): KingdomState {
  if (s.phase !== 'place') return s
  const player = s.order[s.turnPos]
  const ps = s.players[player]
  const ns = cloneState(s)
  const nps = ns.players[player]
  if (ps.claimed != null) {
    if (p != null) {
      // validate legality
      const legal = legalPlacements(ps.grid, ps.claimed)
      const ok = legal.some((l) => l.anchor === p.anchor && l.orient === p.orient)
      if (ok) {
        nps.grid = applyPlacement(ps.grid, ps.claimed, p)
      }
      // if not ok, treated as discard (no change to grid)
    }
    // p == null => discard, grid unchanged
    nps.claimed = null
  }
  ns.phase = 'claim'
  ns.tick = s.tick + 1
  return ns
}

/** Claim a lineup tile (by index) for the current player. Sets next round's seat
    order (claim order = next round order). Advances turn; when the round's 4 actions
    are done, deals the next lineup (or ends the game). Returns a NEW state. */
export function claimTile(s: KingdomState, lineIndex: number): KingdomState {
  if (s.phase !== 'claim') return s
  const entry = s.lineup[lineIndex]
  if (entry == null || entry.claimedBy != null) return s
  const player = s.order[s.turnPos]
  const ns = cloneState(s)
  ns.lineup[lineIndex] = { tile: entry.tile, claimedBy: player }
  ns.players[player].claimed = entry.tile
  ns.nextOrder.push(player)
  ns.tick = s.tick + 1
  advance(ns)
  return ns
}

/** Advance turn within the round; if round complete, start the next round / end game. */
function advance(s: KingdomState): void {
  s.turnPos++
  if (s.turnPos < s.order.length) {
    s.current = s.order[s.turnPos]
    s.phase = s.players[s.current].claimed != null ? 'place' : 'claim'
    return
  }
  // round complete — next round order is the claim order
  const next = s.nextOrder.slice()
  s.nextOrder = []
  s.turnPos = 0
  if (s.deck.length === 0) {
    // final round: players still hold one claimed tile to place, then the game ends.
    // Run a final placement-only round using `next` order, then score.
    finishGame(s, next)
    return
  }
  s.order = next
  dealLineup(s)
  s.current = s.order[0]
  s.phase = s.players[s.current].claimed != null ? 'place' : 'claim'
}

/** After the last lineup is exhausted, both players place their final claimed tile.
    We do this greedily/automatically for the human too? No — final placements should
    still be interactive. Instead we set up a final "place-only" round with an empty
    lineup so the UI walks each player through placing, then scores when both done. */
function finishGame(s: KingdomState, order: Player[]): void {
  s.order = order
  s.lineup = []
  s.turnPos = 0
  s.current = order[0]
  // Only enter place phase if the first player actually has a tile; otherwise score now.
  if (s.players.some((p) => p.claimed != null)) {
    s.phase = 'place'
  } else {
    endGame(s)
  }
}

/** In the final (no-lineup) round, placement advances directly to the next player's
    placement, and scores once everyone has placed. This is invoked from finalPlace. */
export function finalPlace(s: KingdomState, p: Placement | null): KingdomState {
  if (s.phase !== 'place' || s.lineup.length !== 0) return s
  const player = s.order[s.turnPos]
  const ps = s.players[player]
  const ns = cloneState(s)
  const nps = ns.players[player]
  if (ps.claimed != null) {
    if (p != null) {
      const legal = legalPlacements(ps.grid, ps.claimed)
      const ok = legal.some((l) => l.anchor === p.anchor && l.orient === p.orient)
      if (ok) nps.grid = applyPlacement(ps.grid, ps.claimed, p)
    }
    nps.claimed = null
  }
  ns.tick = s.tick + 1
  // advance to next player who still has a tile to place
  ns.turnPos++
  while (ns.turnPos < ns.order.length && ns.players[ns.order[ns.turnPos]].claimed == null) {
    ns.turnPos++
  }
  if (ns.turnPos < ns.order.length) {
    ns.current = ns.order[ns.turnPos]
    ns.phase = 'place'
  } else {
    endGame(ns)
  }
  return ns
}

function endGame(s: KingdomState): void {
  s.players[0].score = scoreGrid(s.players[0].grid)
  s.players[1].score = scoreGrid(s.players[1].grid)
  s.phase = 'over'
  s.current = 0
  if (s.players[0].score > s.players[1].score) {
    s.winner = 0
    s.tie = false
  } else if (s.players[1].score > s.players[0].score) {
    s.winner = 1
    s.tie = false
  } else {
    // tie-break by most crowns; then declare a tie.
    const cr0 = crownTotal(s.players[0].grid)
    const cr1 = crownTotal(s.players[1].grid)
    if (cr0 > cr1) {
      s.winner = 0
      s.tie = false
    } else if (cr1 > cr0) {
      s.winner = 1
      s.tie = false
    } else {
      s.winner = null
      s.tie = true
    }
  }
}

function crownTotal(grid: Cell[]): number {
  let c = 0
  for (const cell of grid) if (cell != null && cell.terrain !== 'castle') c += cell.crowns
  return c
}

function cloneState(s: KingdomState): KingdomState {
  return {
    deck: s.deck.slice(),
    lineup: s.lineup.map((e) => ({ tile: e.tile, claimedBy: e.claimedBy })),
    order: s.order.slice(),
    nextOrder: s.nextOrder.slice(),
    turnPos: s.turnPos,
    players: [
      { grid: s.players[0].grid.slice(), claimed: s.players[0].claimed, score: s.players[0].score },
      { grid: s.players[1].grid.slice(), claimed: s.players[1].claimed, score: s.players[1].score },
    ],
    phase: s.phase,
    current: s.current,
    winner: s.winner,
    tie: s.tie,
    tick: s.tick,
  }
}

// ---- AI ----

/** Evaluate a candidate placement: immediate score delta + a small flexibility term
    (how many empty neighbours the new squares expose, encouraging open growth). */
function evalPlacement(grid: Cell[], tile: Tile, p: Placement): number {
  const before = scoreGrid(grid)
  const g2 = applyPlacement(grid, tile, p)
  const after = scoreGrid(g2)
  let flex = 0
  const [ar, ac] = rc(p.anchor)
  const br = ar + ORIENTS[p.orient].dr
  const bc = ac + ORIENTS[p.orient].dc
  for (const [r, c] of [[ar, ac], [br, bc]] as [number, number][]) {
    for (const o of ORIENTS) {
      const nr = r + o.dr
      const nc = c + o.dc
      if (inBounds(nr, nc) && g2[idxOf(nr, nc)] == null) flex++
    }
  }
  return (after - before) * 10 + flex
}

/** Best legal placement for a tile on a grid, or null if none. */
export function bestPlacement(grid: Cell[], tile: Tile): Placement | null {
  const legal = legalPlacements(grid, tile)
  if (legal.length === 0) return null
  let best = legal[0]
  let bestVal = -Infinity
  for (const p of legal) {
    const v = evalPlacement(grid, tile, p)
    if (v > bestVal) {
      bestVal = v
      best = p
    }
  }
  return best
}

/** Value of claiming a given lineup tile for the AI, balancing tile worth against
    the turn-order cost (lower-numbered tiles grab earlier seating but weaker tiles). */
function evalClaim(s: KingdomState, lineIndex: number): number {
  const tile = s.lineup[lineIndex].tile
  const crowns = tile.a.crowns + tile.b.crowns
  // how well it fits the AI's current kingdom right now
  const grid = s.players[1].grid
  const best = bestPlacement(grid, tile)
  const fit = best == null ? -5 : evalPlacement(grid, tile, best) / 10
  // turn-order cost: higher num => later seat next round (slightly worse)
  const orderCost = tile.num / 100
  return crowns * 3 + fit - orderCost
}

/** Perform one AI action (a place or a claim). Returns a NEW state. The AI is player 1.
    The driver should call this repeatedly while it remains the AI's turn. */
export function aiTurn(s: KingdomState): KingdomState {
  if (s.phase === 'over') return s
  const player = s.order[s.turnPos]
  if (player !== 1) return s
  if (s.phase === 'place') {
    const ps = s.players[1]
    const best = ps.claimed != null ? bestPlacement(ps.grid, ps.claimed) : null
    return s.lineup.length === 0 ? finalPlace(s, best) : placeTile(s, best)
  }
  // claim phase
  let bestIdx = -1
  let bestVal = -Infinity
  for (let i = 0; i < s.lineup.length; i++) {
    if (s.lineup[i].claimedBy != null) continue
    const v = evalClaim(s, i)
    if (v > bestVal) {
      bestVal = v
      bestIdx = i
    }
  }
  if (bestIdx < 0) return s
  return claimTile(s, bestIdx)
}

/** Convenience: is it the AI's turn (and game not over)? */
export function isAITurn(s: KingdomState): boolean {
  return s.phase !== 'over' && s.order[s.turnPos] === 1
}

/** Convenience: the current player whose action is pending. */
export function currentPlayer(s: KingdomState): Player {
  return s.phase === 'over' ? 0 : s.order[s.turnPos]
}
