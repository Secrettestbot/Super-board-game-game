/* THE ISLE OF CATS — pure logic (built for this codebase; inspired by Frank West's game).
   Two players (you=0, ai=1) each fill their OWN 6x6 boat with polyomino CAT tiles drafted
   from a shared market. Boats have pre-printed BASKET squares (must stay uncovered) and
   printed colored ROOM zones (filling a room cell with a matching-color cat scores a bonus).
   Drafting is FREE here (simplified from "pay fish"): on your turn, take one tile from the
   shared market of N and place it on empty, non-basket cells (rotations/flips allowed, no
   overlap). The market refills from a deterministic bag until exhausted. When both players
   can no longer place (market empty or no tile fits), the game ends.
   SCORING per boat: (a) largest connected group of each color, scored via COLOR_GROUP_TABLE;
   (b) +ROOM_BONUS for each room cell covered by a cat of the room's color; (c) −1 per
   uncovered non-basket cell (holes). Higher total wins. */

export type Player = 0 | 1

/** Cat colors (palette indices). 6 colors. */
export const COLORS = ['orange', 'teal', 'gold', 'plum', 'blue', 'sage'] as const
export type Color = number // 0..5
export const NCOLORS = COLORS.length

export const BOAT_N = 6 // boat is 6x6
export const BCELLS = BOAT_N * BOAT_N // 36

/** Size of the shared market (how many face-up tiles to draft from). */
export const MARKET_SIZE = 4

/** A polyomino: list of [dr,dc] offsets, normalized so min row=0 and min col=0. */
export type Shape = [number, number][]

/** Each cell of a boat is one of these. Baskets/rooms are PRINTED; `cat` is placed. */
export interface BoatCell {
  /** true if this is a pre-printed basket square (must remain uncovered). */
  basket: boolean
  /** if this is a printed colored ROOM cell, the color it wants; else -1. */
  room: Color | -1
  /** the cat color placed here (covering the cell), or -1 if uncovered. */
  cat: Color | -1
}

export type Boat = BoatCell[] // length BCELLS

export interface CatTile {
  id: number
  color: Color
  shape: Shape
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  boats: [Boat, Boat]
  /** Face-up tiles available to draft (length up to MARKET_SIZE). */
  market: CatTile[]
  /** Remaining draw pile feeding the market. */
  bag: CatTile[]
  turn: Player | null // whose turn; null when the game is over
  winner: Player | -1 | null // 0/1, -1 draw, or null while in progress
  scores: [number, number] | null
  log: LogEntry[]
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// ============================ shapes & geometry ============================

/** Normalize a shape so min row=0, min col=0, sorted deterministically. */
export function normalize(cells: [number, number][]): Shape {
  const minR = Math.min(...cells.map(c => c[0]))
  const minC = Math.min(...cells.map(c => c[1]))
  return cells
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** Rotate a shape 90° clockwise: (r,c) -> (c,-r), normalized. */
export function rotate(shape: Shape): Shape {
  return normalize(shape.map(([r, c]) => [c, -r] as [number, number]))
}

/** Flip a shape horizontally: (r,c) -> (r,-c), normalized. */
export function flip(shape: Shape): Shape {
  return normalize(shape.map(([r, c]) => [r, -c] as [number, number]))
}

/** All distinct orientations (up to 8) of a shape, normalized & deduped. */
export function orientations(shape: Shape): Shape[] {
  const out: Shape[] = []
  const seen = new Set<string>()
  let cur = normalize(shape)
  for (let f = 0; f < 2; f++) {
    for (let r = 0; r < 4; r++) {
      const sig = cur.map(c => c.join(',')).join(';')
      if (!seen.has(sig)) { seen.add(sig); out.push(cur) }
      cur = rotate(cur)
    }
    cur = flip(cur)
  }
  return out
}

/**
 * Flat 6x6 cell indices a (already-oriented) shape covers when its normalized
 * origin sits at anchor (r0,c0). Returns null if ANY cell falls off the grid.
 * index = row*6 + col.
 */
export function cellsFor(shape: Shape, r0: number, c0: number): number[] | null {
  const out: number[] = []
  for (const [dr, dc] of shape) {
    const r = r0 + dr
    const c = c0 + dc
    if (r < 0 || r >= BOAT_N || c < 0 || c >= BOAT_N) return null
    out.push(r * BOAT_N + c)
  }
  return out
}

/** Can this oriented shape be placed at (r0,c0)? In-bounds, no basket, no overlap. */
export function canPlace(boat: Boat, shape: Shape, r0: number, c0: number): boolean {
  const cells = cellsFor(shape, r0, c0)
  if (cells === null) return false
  for (const idx of cells) {
    const cell = boat[idx]
    if (cell.basket) return false
    if (cell.cat !== -1) return false
  }
  return true
}

export interface Placement {
  orientation: number // index into orientations(shape)
  shape: Shape
  r0: number
  c0: number
  cells: number[]
}

/** Every legal placement of a shape on a boat, across all orientations & anchors. */
export function legalPlacements(boat: Boat, shape: Shape): Placement[] {
  const out: Placement[] = []
  const ors = orientations(shape)
  ors.forEach((sh, oi) => {
    for (let r0 = 0; r0 < BOAT_N; r0++) {
      for (let c0 = 0; c0 < BOAT_N; c0++) {
        if (canPlace(boat, sh, r0, c0)) {
          out.push({ orientation: oi, shape: sh, r0, c0, cells: cellsFor(sh, r0, c0)! })
        }
      }
    }
  })
  return out
}

/** Does any orientation of this shape fit anywhere on the boat? */
export function fitsSomewhere(boat: Boat, shape: Shape): boolean {
  for (const sh of orientations(shape)) {
    for (let r0 = 0; r0 < BOAT_N; r0++)
      for (let c0 = 0; c0 < BOAT_N; c0++)
        if (canPlace(boat, sh, r0, c0)) return true
  }
  return false
}

// ============================ cat shapes & bag ============================

/** The pool of distinct polyomino shapes cats come in (1..5 cells). */
export const CAT_SHAPES: Shape[] = [
  normalize([[0, 0], [0, 1]]),                          // domino
  normalize([[0, 0], [0, 1], [0, 2]]),                  // I-tromino
  normalize([[0, 0], [0, 1], [1, 0]]),                  // L-tromino
  normalize([[0, 0], [0, 1], [1, 0], [1, 1]]),          // square (O)
  normalize([[0, 0], [0, 1], [0, 2], [1, 1]]),          // T-tetromino
  normalize([[0, 0], [0, 1], [1, 1], [1, 2]]),          // S-tetromino
  normalize([[0, 0], [1, 0], [1, 1], [1, 2]]),          // L-tetromino
  normalize([[0, 0], [0, 1], [0, 2], [0, 3]]),          // I-tetromino
  normalize([[0, 1], [1, 0], [1, 1], [1, 2]]),          // T-tetromino tall
  normalize([[0, 0], [0, 1], [0, 2], [1, 0], [1, 2]]),  // U-pentomino
  normalize([[0, 0], [1, 0], [1, 1], [2, 1]]),          // S-tetromino tall
  normalize([[0, 0]]),                                  // single
]

/** Largest-connected-group score per color by group size (index = size). */
export const COLOR_GROUP_TABLE: number[] = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45]

/** Bonus per room cell covered by its matching color. */
export const ROOM_BONUS = 3

/** Look up the group score for a group of `size` cells (clamped to the table). */
export function colorGroupScore(size: number): number {
  if (size <= 0) return 0
  if (size >= COLOR_GROUP_TABLE.length) {
    // beyond table: extend with the triangular pattern n*(n+1)/2 - baseline
    return size * (size + 1) / 2 - 0
  }
  return COLOR_GROUP_TABLE[size]
}

// deterministic LCG shuffle (reproducible for tests)
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let s = (seed >>> 0) || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp
  }
  return a
}

/** Build the full deterministic bag of cat tiles (every shape × every color, a couple passes). */
export function makeBag(seed = 1): CatTile[] {
  const tiles: CatTile[] = []
  let id = 0
  // Two passes over (color × shape) so there are plenty of tiles to fill two boats.
  for (let pass = 0; pass < 2; pass++) {
    for (let color = 0; color < NCOLORS; color++) {
      for (const shape of CAT_SHAPES) {
        tiles.push({ id: id++, color, shape })
      }
    }
  }
  return shuffle(tiles, seed)
}

// ============================ printed boat layout ============================

/** Build a blank boat with the printed baskets + room zones for a player. */
export function makeBoat(): Boat {
  const boat: Boat = []
  for (let i = 0; i < BCELLS; i++) boat.push({ basket: false, room: -1, cat: -1 })
  const at = (r: number, c: number) => boat[r * BOAT_N + c]
  // Baskets: a handful of pre-printed squares scattered so they break up the grid.
  const baskets: [number, number][] = [[0, 0], [0, 5], [5, 0], [5, 5], [2, 3]]
  for (const [r, c] of baskets) at(r, c).basket = true
  // Printed colored ROOM zones — small clusters wanting a specific color.
  const rooms: { color: Color; cells: [number, number][] }[] = [
    { color: 0, cells: [[1, 1], [1, 2]] },   // orange room
    { color: 1, cells: [[1, 4], [2, 4]] },   // teal room
    { color: 2, cells: [[3, 1], [4, 1]] },   // gold room
    { color: 3, cells: [[4, 4], [4, 3]] },   // plum room
    { color: 4, cells: [[3, 4]] },           // blue room
    { color: 5, cells: [[4, 2]] },           // sage room
  ]
  for (const { color, cells } of rooms) {
    for (const [r, c] of cells) {
      const cell = at(r, c)
      if (!cell.basket) cell.room = color
    }
  }
  return boat
}

// ============================ game setup ============================

/** Refill the market from the bag up to MARKET_SIZE (mutates market & bag). */
function refill(market: CatTile[], bag: CatTile[]): void {
  while (market.length < MARKET_SIZE && bag.length > 0) {
    market.push(bag.shift()!)
  }
}

/** Create a fresh game. Pass an explicit bag for deterministic tests. */
export function makeGame(optionalBag?: CatTile[]): State {
  const bag = optionalBag ? optionalBag.slice() : makeBag(Math.floor(Math.random() * 1e9))
  const market: CatTile[] = []
  refill(market, bag)
  const s: State = {
    boats: [makeBoat(), makeBoat()],
    market,
    bag,
    turn: 0,
    winner: null,
    scores: null,
    log: [{ t: 'sys', x: 'Draft a cat from the market and place it on your boat. Cover empty squares (not baskets). Fewest holes + biggest color groups wins.' }],
  }
  return s
}

function cloneBoat(boat: Boat): Boat {
  return boat.map(c => ({ basket: c.basket, room: c.room, cat: c.cat }))
}

function cloneState(s: State): State {
  return {
    boats: [cloneBoat(s.boats[0]), cloneBoat(s.boats[1])],
    market: s.market.slice(),
    bag: s.bag.slice(),
    turn: s.turn,
    winner: s.winner,
    scores: s.scores,
    log: s.log,
  }
}

// ============================ scoring ============================

/** Largest connected (orthogonal) group size for a given color on a boat. */
export function largestColorGroup(boat: Boat, color: Color): number {
  const seen = new Array(BCELLS).fill(false)
  let best = 0
  for (let start = 0; start < BCELLS; start++) {
    if (seen[start] || boat[start].cat !== color) continue
    // BFS flood-fill
    let size = 0
    const stack = [start]
    seen[start] = true
    while (stack.length > 0) {
      const idx = stack.pop()!
      size++
      const r = Math.floor(idx / BOAT_N), c = idx % BOAT_N
      const nbrs: [number, number][] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      for (const [nr, nc] of nbrs) {
        if (nr < 0 || nr >= BOAT_N || nc < 0 || nc >= BOAT_N) continue
        const ni = nr * BOAT_N + nc
        if (!seen[ni] && boat[ni].cat === color) { seen[ni] = true; stack.push(ni) }
      }
    }
    if (size > best) best = size
  }
  return best
}

export interface ScoreBreakdown {
  colorGroups: number[]   // per-color largest-group score
  colorSizes: number[]    // per-color largest-group SIZE (for display)
  groupTotal: number
  roomBonus: number
  holes: number           // count of uncovered non-basket cells
  holePenalty: number     // -holes
  total: number
}

/** Full score breakdown for a boat. */
export function scoreBoat(boat: Boat): ScoreBreakdown {
  const colorSizes: number[] = []
  const colorGroups: number[] = []
  let groupTotal = 0
  for (let color = 0; color < NCOLORS; color++) {
    const size = largestColorGroup(boat, color)
    const sc = colorGroupScore(size)
    colorSizes.push(size)
    colorGroups.push(sc)
    groupTotal += sc
  }
  // room bonuses
  let roomBonus = 0
  for (let i = 0; i < BCELLS; i++) {
    const cell = boat[i]
    if (cell.room !== -1 && cell.cat === cell.room) roomBonus += ROOM_BONUS
  }
  // holes: uncovered, non-basket cells
  let holes = 0
  for (let i = 0; i < BCELLS; i++) {
    const cell = boat[i]
    if (!cell.basket && cell.cat === -1) holes++
  }
  const holePenalty = -holes
  const total = groupTotal + roomBonus + holePenalty
  return { colorGroups, colorSizes, groupTotal, roomBonus, holes, holePenalty, total }
}

/** Convenience: the scalar score of a boat. */
export function boatScore(boat: Boat): number {
  return scoreBoat(boat).total
}

// ============================ moves ============================

/** Has this player any legal move (a tile in the market that fits somewhere)? */
export function hasMove(s: State, player: Player): boolean {
  const boat = s.boats[player]
  for (const tile of s.market) {
    if (fitsSomewhere(boat, tile.shape)) return true
  }
  return false
}

/** Is the game over for BOTH players (no one can place)? Considers a refill. */
function noMovesLeft(s: State): boolean {
  // If market+bag both can't help either player. Since market refills, just check
  // current market against both boats — and if the market can refill, it's not over.
  if (s.bag.length > 0 && s.market.length < MARKET_SIZE) return false
  return !hasMove(s, 0) && !hasMove(s, 1)
}

function finalize(s: State): void {
  const a = scoreBoat(s.boats[0]).total
  const b = scoreBoat(s.boats[1]).total
  s.scores = [a, b]
  s.winner = a > b ? 0 : b > a ? 1 : -1
  s.turn = null
  const msg = s.winner === 0 ? `You win ${a} to ${b}.`
    : s.winner === 1 ? `AI wins ${b} to ${a}.`
      : `Draw at ${a} apiece.`
  s.log = push(s.log, 'sys', msg)
}

/**
 * Advance the turn after a player acted. The opponent goes next IF they have a move;
 * otherwise the same player keeps going; if neither can move, finalize.
 */
function advanceTurn(s: State, justMoved: Player): void {
  refill(s.market, s.bag)
  if (noMovesLeft(s)) { finalize(s); return }
  const other = (justMoved ^ 1) as Player
  if (hasMove(s, other)) { s.turn = other; return }
  if (hasMove(s, justMoved)) { s.turn = justMoved; return }
  finalize(s)
}

/**
 * DRAFT tile `tileId` from the market and PLACE it on `player`'s boat covering `cells`
 * (the flat indices, which must match a legal placement). Returns a new state; returns
 * the SAME state object unchanged on any illegal request.
 */
export function placeCat(s: State, player: Player, tileId: number, cells: number[]): State {
  if (s.winner !== null) return s
  if (s.turn !== player) return s
  const tile = s.market.find(t => t.id === tileId)
  if (!tile) return s
  const boat = s.boats[player]
  // validate the target cells form a legal placement of this tile's shape
  if (cells.length !== tile.shape.length) return s
  for (const idx of cells) {
    if (idx < 0 || idx >= BCELLS) return s
    const cell = boat[idx]
    if (cell.basket || cell.cat !== -1) return s
  }
  // ensure cells actually correspond to an orientation of the shape (anchored)
  if (!cellsAreAnOrientation(tile.shape, cells)) return s

  const ns = cloneState(s)
  const nb = ns.boats[player]
  for (const idx of cells) nb[idx].cat = tile.color
  // remove the drafted tile from the market
  ns.market = ns.market.filter(t => t.id !== tileId)
  ns.log = push(ns.log, player === 0 ? 'you' : 'ai',
    `${player === 0 ? 'You' : 'AI'} placed a ${COLORS[tile.color]} cat (${tile.shape.length}).`)
  advanceTurn(ns, player)
  return ns
}

/** Check that a set of flat cells equals some orientation of `shape` at some anchor. */
function cellsAreAnOrientation(shape: Shape, cells: number[]): boolean {
  if (cells.length !== shape.length) return false
  const rs = cells.map(i => Math.floor(i / BOAT_N))
  const cs = cells.map(i => i % BOAT_N)
  const minR = Math.min(...rs), minC = Math.min(...cs)
  const norm = cells
    .map(i => [Math.floor(i / BOAT_N) - minR, (i % BOAT_N) - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const sig = norm.map(c => c.join(',')).join(';')
  for (const o of orientations(shape)) {
    if (o.map(c => c.join(',')).join(';') === sig) return true
  }
  return false
}

// ============================ AI ============================

/**
 * Evaluate placing a tile at a placement on a boat: greedily maximize color-group growth
 * + room fills, and minimize new isolated holes. Returns a heuristic value (higher = better).
 */
function evalPlacement(boat: Boat, tile: CatTile, pl: Placement): number {
  // simulate
  const sim = cloneBoat(boat)
  for (const idx of pl.cells) sim[idx].cat = tile.color
  const before = scoreBoat(boat)
  const after = scoreBoat(sim)
  // base: change in real score (groups + rooms - holes)
  let val = after.total - before.total
  // tie-break: prefer placements that grow THIS color's largest group (clustering)
  val += (after.colorSizes[tile.color] - before.colorSizes[tile.color]) * 0.5
  // small bias toward filling more cells (coverage)
  val += pl.cells.length * 0.1
  return val
}

/** Best (tile, placement) for a player, or null if no legal move. */
export function bestMove(s: State, player: Player): { tileId: number; placement: Placement } | null {
  const boat = s.boats[player]
  let bestVal = -Infinity
  let best: { tileId: number; placement: Placement } | null = null
  for (const tile of s.market) {
    const pls = legalPlacements(boat, tile.shape)
    for (const pl of pls) {
      const v = evalPlacement(boat, tile, pl)
      if (v > bestVal) { bestVal = v; best = { tileId: tile.id, placement: pl } }
    }
  }
  return best
}

/** One AI move (player 1). Greedy. Always returns a state where it actually acted (if able). */
export function aiTurn(s: State): State {
  if (s.winner !== null) return s
  if (s.turn !== 1) return s
  const mv = bestMove(s, 1)
  if (mv === null) {
    // AI cannot move; advance the turn (will finalize or pass).
    const ns = cloneState(s)
    advanceTurn(ns, 1)
    return ns
  }
  return placeCat(s, 1, mv.tileId, mv.placement.cells)
}

/** Public helper for the UI/tests: whose turn / winner state. */
export function winnerOf(s: State): Player | -1 | null {
  return s.winner
}
