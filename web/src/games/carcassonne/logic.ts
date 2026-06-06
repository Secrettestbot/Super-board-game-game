/* CARCASSONNE — pure logic (no React/DOM).
   2-player tile-laying duel: you (player 0) vs a greedy AI (player 1).

   A tile is a square whose four edges (N,E,S,W) are each one of {city,road,field}.
   City and road edges are grouped into SEGMENTS that connect across the tile interior
   (a "feature"). Some tiles bear a cloister (monastery) in the centre, and city
   segments may carry a pennant (worth +2 when scored). We omit farmers/fields for
   meeples (fields are not scored), keeping the core city/road/cloister engine.

   Flow per turn: DRAW the next tile → PLACE it adjacent to the tableau so every
   touching edge MATCHES (city-city, road-road, field-field) → optionally place a
   MEEPLE on a feature of the just-placed tile that is not already occupied. When a
   feature COMPLETES it is scored and its meeples return. At game end (deck empty)
   incomplete features score at reduced value.

   Scoring (completed): CITY = 2/tile (+2 per pennant); ROAD = 1/tile;
   CLOISTER = 9 (itself + all 8 neighbours present).
   Scoring (end-game, incomplete): CITY = 1/tile (+1 per pennant); ROAD = 1/tile;
   CLOISTER = 1 per present tile in its 3x3 (incl. itself). */

export type Edge = 'city' | 'road' | 'field'
export type Player = 0 | 1
/** A meeple kind: knight (city), robber (road), monk (cloister). */
export type MeepleKind = 'knight' | 'robber' | 'monk'

/** A connected feature on a single tile: a set of edge-slots (0=N 1=E 2=S 3=W)
    that share one city or road segment, or the special cloister segment. */
export interface Segment {
  /** Stable id within the tile (0-based). */
  id: number
  kind: 'city' | 'road' | 'cloister'
  /** Edge indices this segment occupies. Empty for a cloister. */
  edges: number[]
  /** City segments only: does it carry a pennant? */
  pennant?: boolean
}

/** A tile definition. `edges` are in unrotated orientation (N,E,S,W). */
export interface TileDef {
  id: string
  edges: [Edge, Edge, Edge, Edge]
  segments: Segment[]
}

/** A placed tile: the def + the rotation applied (0..3, each = 90° clockwise). */
export interface PlacedTile {
  def: TileDef
  rotation: number
  /** Per-segment meeple owner (segment.id -> player), or absent. */
  meeples: Record<number, Player>
}

export interface PlayerState {
  score: number
  meeplesLeft: number
}

export interface CarcassonneState {
  /** coord key "x,y" -> placed tile. */
  board: Record<string, PlacedTile>
  /** remaining tiles to draw (the deck), front = next. */
  deck: TileDef[]
  /** the tile just drawn, awaiting placement (null between turns is not used —
      a tile is always drawn at the start of a turn). */
  current: TileDef | null
  players: [PlayerState, PlayerState]
  /** whose turn it is. */
  turn: Player
  /** null until game over; then 0/1, or 'tie'. */
  winner: Player | 'tie' | null
  /** monotonic counter — changes on every state-advancing action (for AI driver). */
  tick: number
}

export const MEEPLES_PER_PLAYER = 7
export const DIRS: { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 }, // E
  { dx: 0, dy: 1 }, // S
  { dx: -1, dy: 0 }, // W
]

// ---------- coordinate helpers ----------
export function key(x: number, y: number): string {
  return x + ',' + y
}
export function parseKey(k: string): [number, number] {
  const i = k.indexOf(',')
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))]
}

// ---------- rotation ----------
/** The edge type on side `dir` (0=N..3=W) of a placed tile, accounting for rotation.
    Rotation r turns the tile clockwise r quarter-turns, so side d shows the
    unrotated side (d - r) mod 4. */
export function edgeAt(def: TileDef, rotation: number, dir: number): Edge {
  return def.edges[(((dir - rotation) % 4) + 4) % 4]
}

/** The rotated edge indices for a segment of a placed tile. */
export function rotatedSegEdges(seg: Segment, rotation: number): number[] {
  return seg.edges.map((e) => (e + rotation) % 4)
}

// ---------- tile set ----------
/** Build a representative Carcassonne tile set. Counts roughly follow the base game
    but the set is deliberately compact + deterministic so tests are stable. */
function def(id: string, edges: [Edge, Edge, Edge, Edge], segments: Segment[]): TileDef {
  return { id, edges, segments }
}

// Segment-builder shorthands.
const cloisterSeg = (id: number): Segment => ({ id, kind: 'cloister', edges: [] })

/** The canonical 24-tile base set used here (one of each kind, multiplied). */
export function baseTiles(): { def: TileDef; count: number }[] {
  const F: Edge = 'field', R: Edge = 'road', C: Edge = 'city'
  return [
    // Cloister, all fields.
    { def: def('cloister', [F, F, F, F], [cloisterSeg(0)]), count: 4 },
    // Cloister with a road exiting south.
    {
      def: def('cloister_road', [F, F, R, F], [
        cloisterSeg(0),
        { id: 1, kind: 'road', edges: [2] },
      ]),
      count: 2,
    },
    // Straight road (N-S).
    { def: def('road_straight', [R, F, R, F], [{ id: 0, kind: 'road', edges: [0, 2] }]), count: 8 },
    // Road curve (E-S).
    { def: def('road_curve', [F, R, R, F], [{ id: 0, kind: 'road', edges: [1, 2] }]), count: 8 },
    // T-junction (E,S,W roads, each its own stub).
    {
      def: def('road_t', [F, R, R, R], [
        { id: 0, kind: 'road', edges: [1] },
        { id: 1, kind: 'road', edges: [2] },
        { id: 2, kind: 'road', edges: [3] },
      ]),
      count: 4,
    },
    // Single city edge (N), rest field.
    { def: def('city_cap', [C, F, F, F], [{ id: 0, kind: 'city', edges: [0] }]), count: 5 },
    // City edge (N) with a road passing E-W underneath it.
    {
      def: def('city_cap_road', [C, R, F, R], [
        { id: 0, kind: 'city', edges: [0] },
        { id: 1, kind: 'road', edges: [1, 3] },
      ]),
      count: 3,
    },
    // Two adjacent city edges (N,E) forming one corner city.
    { def: def('city_corner', [C, C, F, F], [{ id: 0, kind: 'city', edges: [0, 1] }]), count: 4 },
    // Two adjacent city edges (N,E) with a pennant.
    {
      def: def('city_corner_p', [C, C, F, F], [{ id: 0, kind: 'city', edges: [0, 1], pennant: true }]),
      count: 2,
    },
    // City spanning N+S (two opposite edges, one city through the middle).
    { def: def('city_tunnel', [C, F, C, F], [{ id: 0, kind: 'city', edges: [0, 2] }]), count: 3 },
    // Three city edges (N,E,W) one big city, road exits S.
    {
      def: def('city_three_road', [C, C, R, C], [
        { id: 0, kind: 'city', edges: [0, 1, 3] },
        { id: 1, kind: 'road', edges: [2] },
      ]),
      count: 3,
    },
    // Four city edges — a full closed city with a pennant.
    { def: def('city_full', [C, C, C, C], [{ id: 0, kind: 'city', edges: [0, 1, 2, 3], pennant: true }]), count: 1 },
  ]
}

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

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The fixed starting tile: a road passing E-W with a city cap to the N. */
export function startingTile(): TileDef {
  const F: Edge = 'field', R: Edge = 'road', C: Edge = 'city'
  return def('start', [C, R, F, R], [
    { id: 0, kind: 'city', edges: [0] },
    { id: 1, kind: 'road', edges: [1, 3] },
  ])
}

/** Build the full deck (excluding the start tile, which is auto-placed at origin). */
export function buildDeck(): TileDef[] {
  const out: TileDef[] = []
  for (const { def: d, count } of baseTiles()) {
    for (let i = 0; i < count; i++) out.push({ ...d, id: d.id + '#' + i })
  }
  return out
}

// ---------- game construction ----------
/** Create a fresh game. Pass an explicit deck for deterministic tests (used in
    order, front = next draw). Otherwise a seeded shuffle of the base deck. */
export function makeGame(optionalDeck?: TileDef[], seed?: number): CarcassonneState {
  let deck: TileDef[]
  if (optionalDeck) {
    deck = optionalDeck.slice()
  } else {
    const s = seed == null ? Math.floor(Math.random() * 1e9) : seed
    deck = shuffle(buildDeck(), mulberry32(s))
  }
  const board: Record<string, PlacedTile> = {}
  board[key(0, 0)] = { def: startingTile(), rotation: 0, meeples: {} }
  const s: CarcassonneState = {
    board,
    deck,
    current: null,
    players: [
      { score: 0, meeplesLeft: MEEPLES_PER_PLAYER },
      { score: 0, meeplesLeft: MEEPLES_PER_PLAYER },
    ],
    turn: 0,
    winner: null,
    tick: 0,
  }
  drawNext(s)
  return s
}

/** Draw the next placeable tile into `current`, discarding any that have no legal
    placement on the current board (standard rule → avoids deadlock). If the deck
    empties without a placeable tile, ends the game. Mutates s. */
function drawNext(s: CarcassonneState): void {
  while (s.deck.length > 0) {
    const t = s.deck.shift()!
    if (legalPlacements(s, t).length > 0) {
      s.current = t
      return
    }
    // else discard (unplaceable) and continue
  }
  s.current = null
  endGame(s)
}

// ---------- placement legality ----------
export interface Placement {
  x: number
  y: number
  rotation: number
}

/** All legal (x,y,rotation) placements for `tile` on the current board. A position
    is legal iff: empty, orthogonally adjacent to ≥1 placed tile, and EVERY shared
    edge with an existing neighbour matches exactly. */
export function legalPlacements(s: CarcassonneState, tile: TileDef): Placement[] {
  const out: Placement[] = []
  // Candidate cells: empty cells adjacent to any placed tile.
  const candidates = new Set<string>()
  for (const k of Object.keys(s.board)) {
    const [x, y] = parseKey(k)
    for (const d of DIRS) {
      const nk = key(x + d.dx, y + d.dy)
      if (s.board[nk] == null) candidates.add(nk)
    }
  }
  for (const ck of candidates) {
    const [x, y] = parseKey(ck)
    for (let r = 0; r < 4; r++) {
      if (fits(s, tile, x, y, r)) out.push({ x, y, rotation: r })
    }
  }
  return out
}

/** Does `tile` at (x,y,rotation) match all existing neighbours (and touch ≥1)? */
export function fits(s: CarcassonneState, tile: TileDef, x: number, y: number, rotation: number): boolean {
  if (s.board[key(x, y)] != null) return false
  let touches = false
  for (let dir = 0; dir < 4; dir++) {
    const d = DIRS[dir]
    const nb = s.board[key(x + d.dx, y + d.dy)]
    if (nb == null) continue
    touches = true
    const mine = edgeAt(tile, rotation, dir)
    const theirs = edgeAt(nb.def, nb.rotation, (dir + 2) % 4) // their opposite side
    if (mine !== theirs) return false
  }
  return touches
}

// ---------- placing a tile ----------
/** Place the current tile at coord (x,y) with `rotation`, optionally putting the
    current player's meeple on segment `meepleSegId` of the just-placed tile (must be
    a city/road/cloister segment that is part of an UNOCCUPIED feature, and the player
    must have a meeple left). Then resolve completions and pass the turn (drawing the
    next tile). Returns a NEW state. */
export function placeTile(
  s: CarcassonneState,
  x: number,
  y: number,
  rotation: number,
  meepleSegId: number | null,
): CarcassonneState {
  if (s.winner != null || s.current == null) return s
  if (!fits(s, s.current, x, y, rotation)) return s
  const ns = clone(s)
  const tile = ns.current!
  const placed: PlacedTile = { def: tile, rotation, meeples: {} }
  ns.board[key(x, y)] = placed

  // meeple placement
  if (meepleSegId != null) {
    const seg = tile.segments.find((sg) => sg.id === meepleSegId)
    const player = ns.turn
    if (
      seg != null &&
      ns.players[player].meeplesLeft > 0 &&
      isFeatureUnoccupied(ns, x, y, seg)
    ) {
      placed.meeples[seg.id] = player
      ns.players[player].meeplesLeft -= 1
    }
  }

  resolveCompletions(ns)

  ns.tick = s.tick + 1
  ns.current = null
  ns.turn = (ns.turn === 0 ? 1 : 0) as Player
  drawNext(ns) // sets current or ends game
  return ns
}

// ---------- feature graph (union over (tileKey, segId)) ----------
interface FeatureNode {
  k: string // tile key
  seg: Segment
}

/** Walk the connected feature (city or road) containing (tileKey, seg), collecting
    all member (tile,segment) nodes and whether the feature is CLOSED (every edge of
    every member segment has a neighbouring tile present). Cloisters handled separately. */
function collectFeature(s: CarcassonneState, startK: string, startSeg: Segment): { nodes: FeatureNode[]; closed: boolean } {
  const nodes: FeatureNode[] = []
  const seen = new Set<string>()
  const stack: FeatureNode[] = [{ k: startK, seg: startSeg }]
  let closed = true
  while (stack.length) {
    const node = stack.pop()!
    const nodeId = node.k + ':' + node.seg.id
    if (seen.has(nodeId)) continue
    seen.add(nodeId)
    nodes.push(node)
    const [x, y] = parseKey(node.k)
    const placed = s.board[node.k]!
    for (const e of rotatedSegEdges(node.seg, placed.rotation)) {
      const d = DIRS[e]
      const nk = key(x + d.dx, y + d.dy)
      const nb = s.board[nk]
      if (nb == null) {
        closed = false
        continue
      }
      // find the neighbour's segment that owns the opposite edge
      const opp = (e + 2) % 4
      const nseg = segmentOwningEdge(nb, opp)
      if (nseg != null && nseg.kind === node.seg.kind) {
        const nid = nk + ':' + nseg.id
        if (!seen.has(nid)) stack.push({ k: nk, seg: nseg })
      }
    }
  }
  return { nodes, closed }
}

/** The segment of a placed tile occupying rotated edge index `edge`, or null. */
function segmentOwningEdge(placed: PlacedTile, edge: number): Segment | null {
  for (const seg of placed.def.segments) {
    if (seg.kind === 'cloister') continue
    if (rotatedSegEdges(seg, placed.rotation).includes(edge)) return seg
  }
  return null
}

/** Is the feature that segment `seg` of tile (x,y) belongs to currently free of any
    meeple? (Used to forbid placing onto an already-claimed feature.) */
export function isFeatureUnoccupied(s: CarcassonneState, x: number, y: number, seg: Segment): boolean {
  if (seg.kind === 'cloister') {
    return s.board[key(x, y)]?.meeples[seg.id] == null
  }
  const { nodes } = collectFeature(s, key(x, y), seg)
  for (const n of nodes) {
    if (s.board[n.k]!.meeples[n.seg.id] != null) return false
  }
  return true
}

// ---------- completion + scoring ----------
/** Surrounding-tile count for a cloister at (x,y) including the centre tile itself. */
function cloisterCount(s: CarcassonneState, x: number, y: number): number {
  let n = 0
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (s.board[key(x + dx, y + dy)] != null) n++
    }
  }
  return n
}

/** Score a completed city/road feature; return points + the majority winner(s). */
function scoreFeature(s: CarcassonneState, nodes: FeatureNode[], kind: 'city' | 'road', complete: boolean): number {
  const tiles = new Set(nodes.map((n) => n.k))
  let pennants = 0
  for (const n of nodes) if (n.seg.pennant) pennants++
  if (kind === 'city') {
    const per = complete ? 2 : 1
    const penVal = complete ? 2 : 1
    return tiles.size * per + pennants * penVal
  }
  // road
  return tiles.size // 1 per tile, complete or not
}

/** Count meeples per player on a feature's nodes; return the majority winners. */
function majorityWinners(s: CarcassonneState, nodes: FeatureNode[]): Player[] {
  let c0 = 0, c1 = 0
  for (const n of nodes) {
    const owner = s.board[n.k]!.meeples[n.seg.id]
    if (owner === 0) c0++
    else if (owner === 1) c1++
  }
  if (c0 === 0 && c1 === 0) return []
  if (c0 === c1) return [0, 1]
  return c0 > c1 ? [0] : [1]
}

/** Remove all meeples on the given nodes and credit the meeple counts back. */
function returnMeeples(s: CarcassonneState, nodes: FeatureNode[]): void {
  for (const n of nodes) {
    const placed = s.board[n.k]!
    const owner = placed.meeples[n.seg.id]
    if (owner != null) {
      s.players[owner].meeplesLeft += 1
      delete placed.meeples[n.seg.id]
    }
  }
}

/** Scan the whole board for newly COMPLETED features (cities, roads, cloisters that
    are surrounded), award points to the majority holder(s), and return their meeples.
    Mutates s. Idempotent: only features that currently hold a meeple are scored
    (returning the meeple removes it, so it won't be re-scored). */
export function resolveCompletions(s: CarcassonneState): void {
  // Cloisters first.
  for (const k of Object.keys(s.board)) {
    const placed = s.board[k]
    const [x, y] = parseKey(k)
    for (const seg of placed.def.segments) {
      if (seg.kind !== 'cloister') continue
      const owner = placed.meeples[seg.id]
      if (owner == null) continue
      if (cloisterCount(s, x, y) === 9) {
        s.players[owner].score += 9
        s.players[owner].meeplesLeft += 1
        delete placed.meeples[seg.id]
      }
    }
  }
  // City + road features. Visit each feature once via its meeple'd nodes.
  const done = new Set<string>()
  for (const k of Object.keys(s.board)) {
    const placed = s.board[k]
    for (const seg of placed.def.segments) {
      if (seg.kind === 'cloister') continue
      if (placed.meeples[seg.id] == null) continue // only meeple'd features can score
      const nid = k + ':' + seg.id
      if (done.has(nid)) continue
      const { nodes, closed } = collectFeature(s, k, seg)
      for (const n of nodes) done.add(n.k + ':' + n.seg.id)
      if (!closed) continue
      const winners = majorityWinners(s, nodes)
      const pts = scoreFeature(s, nodes, seg.kind, true)
      for (const w of winners) s.players[w].score += pts
      returnMeeples(s, nodes)
    }
  }
}

/** At game end, score every remaining (incomplete) feature still holding a meeple,
    at reduced value, and return meeples. Then decide the winner. Mutates s. */
export function endGameScoring(s: CarcassonneState): void {
  // Cloisters.
  for (const k of Object.keys(s.board)) {
    const placed = s.board[k]
    const [x, y] = parseKey(k)
    for (const seg of placed.def.segments) {
      if (seg.kind !== 'cloister') continue
      const owner = placed.meeples[seg.id]
      if (owner == null) continue
      s.players[owner].score += cloisterCount(s, x, y) // 1 per present tile incl. itself
      s.players[owner].meeplesLeft += 1
      delete placed.meeples[seg.id]
    }
  }
  // Cities + roads.
  const done = new Set<string>()
  for (const k of Object.keys(s.board)) {
    const placed = s.board[k]
    for (const seg of placed.def.segments) {
      if (seg.kind === 'cloister') continue
      if (placed.meeples[seg.id] == null) continue
      const nid = k + ':' + seg.id
      if (done.has(nid)) continue
      const { nodes } = collectFeature(s, k, seg)
      for (const n of nodes) done.add(n.k + ':' + n.seg.id)
      const winners = majorityWinners(s, nodes)
      const pts = scoreFeature(s, nodes, seg.kind, false)
      for (const w of winners) s.players[w].score += pts
      returnMeeples(s, nodes)
    }
  }
}

function endGame(s: CarcassonneState): void {
  endGameScoring(s)
  const a = s.players[0].score
  const b = s.players[1].score
  s.winner = a > b ? 0 : b > a ? 1 : 'tie'
}

// ---------- AI ----------
/** Enumerate every legal (placement, meeple option) the AI could take with `tile`.
    Meeple option is a segment id or null. */
export interface AIMove {
  placement: Placement
  meepleSegId: number | null
}

/** Heuristic value of an AI move (player 1): immediate completion score it would
    grab for itself, plus growth/claim incentives, minus a small spread penalty. */
function evalMove(s: CarcassonneState, tile: TileDef, move: AIMove): number {
  const player: Player = 1
  // simulate placement only (no turn pass) to read completions for THIS player.
  const sim = clone(s)
  const { x, y, rotation } = move.placement
  const placed: PlacedTile = { def: tile, rotation, meeples: {} }
  sim.board[key(x, y)] = placed
  const before = sim.players[player].score
  const beforeMeeples = sim.players[player].meeplesLeft

  let claimVal = 0
  if (move.meepleSegId != null && sim.players[player].meeplesLeft > 0) {
    const seg = tile.segments.find((sg) => sg.id === move.meepleSegId)
    if (seg != null && isFeatureUnoccupied(sim, x, y, seg)) {
      placed.meeples[seg.id] = player
      sim.players[player].meeplesLeft -= 1
      // potential value of the claimed feature (encourage cities + near-complete)
      if (seg.kind === 'city') claimVal = 1.4
      else if (seg.kind === 'road') claimVal = 0.8
      else claimVal = 1.0 // cloister
    }
  }

  resolveCompletions(sim)
  const gained = sim.players[player].score - before
  // meeples returned by completion are good (frees them up); meeples still committed
  // with no completion is a mild cost.
  const meepleDelta = sim.players[player].meeplesLeft - beforeMeeples

  // crude "fewer empty exposed edges" preference to keep features completable
  return gained * 10 + claimVal + meepleDelta * 0.5
}

/** Pick the AI's best move (greedy). Returns null only if no legal placement. */
export function aiChooseMove(s: CarcassonneState, tile: TileDef): AIMove | null {
  const places = legalPlacements(s, tile)
  if (places.length === 0) return null
  let best: AIMove | null = null
  let bestVal = -Infinity
  const hasMeeple = s.players[1].meeplesLeft > 0
  for (const p of places) {
    // option: no meeple
    const candidates: (number | null)[] = [null]
    if (hasMeeple) for (const seg of tile.segments) candidates.push(seg.id)
    for (const segId of candidates) {
      const move: AIMove = { placement: p, meepleSegId: segId }
      const v = evalMove(s, tile, move)
      if (v > bestVal) {
        bestVal = v
        best = move
      }
    }
  }
  return best
}

/** Perform the AI's full turn (player 1): place its current tile + optional meeple.
    Returns a NEW state. If no legal placement exists (shouldn't happen because
    drawNext discards unplaceable tiles), passes by drawing again. */
export function aiTurn(s: CarcassonneState): CarcassonneState {
  if (s.winner != null || s.current == null || s.turn !== 1) return s
  const move = aiChooseMove(s, s.current)
  if (move == null) {
    // discard current + redraw (defensive; drawNext already prevents this)
    const ns = clone(s)
    ns.current = null
    ns.tick = s.tick + 1
    ns.turn = 0
    drawNext(ns)
    return ns
  }
  return placeTile(s, move.placement.x, move.placement.y, move.placement.rotation, move.meepleSegId)
}

/** Convenience: the winner (0/1/'tie'/null). */
export function winner(s: CarcassonneState): Player | 'tie' | null {
  return s.winner
}

// ---------- clone ----------
function clone(s: CarcassonneState): CarcassonneState {
  const board: Record<string, PlacedTile> = {}
  for (const k of Object.keys(s.board)) {
    const p = s.board[k]
    board[k] = { def: p.def, rotation: p.rotation, meeples: { ...p.meeples } }
  }
  return {
    board,
    deck: s.deck.slice(),
    current: s.current,
    players: [
      { score: s.players[0].score, meeplesLeft: s.players[0].meeplesLeft },
      { score: s.players[1].score, meeplesLeft: s.players[1].meeplesLeft },
    ],
    turn: s.turn,
    winner: s.winner,
    tick: s.tick,
  }
}
