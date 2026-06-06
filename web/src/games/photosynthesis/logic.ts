/* PHOTOSYNTHESIS — pure logic (built for this codebase, not ported).

   A sunlight/area tree game. You (player 0) vs a greedy AI (player 1). A hexagonal board of
   radius 3 (37 cells) is divided into four concentric RINGS — center, inner, middle, outer —
   worth descending end-game VP. Each player grows TREES of four sizes: SEED, SMALL, MEDIUM,
   LARGE. The SUN sits on one of six edge directions and ROTATES one step each round; after a
   fixed number of full REVOLUTIONS the game ends and most VP wins.

   COORDS: axial hex (q, r). The board is every (q, r) with |q| ≤ R, |r| ≤ R, |q+r| ≤ R, so
   the ring of a cell is R - distanceFromCenter (center = 3 → ring 0, edge → ring 3). Coords
   are routinely 0 or negative — never truthiness-test a coord, a player, light, or a size.

   SHADOW: a tree of size s casts a shadow s cells long in the direction AWAY from the sun.
   A cell is shaded if any tree casts a shadow onto it whose caster size is >= the shaded
   tree's own size (a same-or-larger tree blocks light). Seeds (size 0) cast no shadow but can
   still be shaded by anything size >= 0, i.e. any non-seed... but seeds collect 0 light anyway.

   LIGHT: at the start of each round every unshaded tree collects light equal to its size
   (small 1, medium 2, large 3; seed 0). Spend light to PLANT a seed adjacent to one of your
   small+ trees (cost 1), GROW to the next size (seed→small 1, small→medium 2, medium→large 3),
   or COLLECT a large tree (cost 4) — remove it and score the ring's current VP tile (tiles
   deplete, highest first). Supply is unlimited for simplicity.

   TERMINATION: the sun makes REVOLUTIONS full turns of 6 steps = ROUNDS_TOTAL rounds. Bounded.
*/

export type Player = 0 | 1
export type Size = 0 | 1 | 2 | 3 // 0 seed, 1 small, 2 medium, 3 large

export const SEED = 0
export const SMALL = 1
export const MEDIUM = 2
export const LARGE = 3

export const SIZE_NAMES = ['Seed', 'Small', 'Medium', 'Large'] as const

/** Board radius — hexagon of radius 3 ≈ 37 cells. */
export const R = 3

/** Number of full sun revolutions before the game ends. */
export const REVOLUTIONS = 3
/** Total rounds = 6 sun steps per revolution * REVOLUTIONS. */
export const ROUNDS_TOTAL = 6 * REVOLUTIONS

export interface Tree { owner: Player; size: Size }

/** A board cell. ring 0 = center .. 3 = outer. tree null if empty. */
export interface Cell {
  q: number
  r: number
  ring: number
  tree: Tree | null
}

export interface PlayerState {
  lightPoints: number
  vp: number
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  /** Map from "q,r" → cell. */
  board: Record<string, Cell>
  /** Sun direction index 0..5. The sun shines FROM this edge direction toward center. */
  sun: number
  /** Current round, 1..ROUNDS_TOTAL. */
  round: number
  players: [PlayerState, PlayerState]
  /** Remaining VP tiles per ring, highest scored first. ring index 0..3. */
  vpTiles: number[][]
  /** Whose action it is. */
  turn: Player
  /** 'play' = active player choosing actions; 'over' = game finished. */
  phase: 'play' | 'over'
  winner: Player | null
  /** Increments every action so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

/* ---------- coords ---------- */

export function key(q: number, r: number): string { return q + ',' + r }

/** Cube distance from center for axial (q, r). */
export function hexDist(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2
}

/** Ring index for a cell: 0 center .. R outer. */
export function ringOf(q: number, r: number): number {
  return hexDist(q, r) // dist 0 = center (ring 0) .. dist R = outer (ring R)
}

/** The six axial neighbour directions. Index aligns with the six sun directions. */
export const DIRS: { q: number; r: number }[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
]

export function neighbors(q: number, r: number): { q: number; r: number }[] {
  return DIRS.map(d => ({ q: q + d.q, r: r + d.r }))
}

export function inBounds(q: number, r: number): boolean {
  return hexDist(q, r) <= R
}

/** All board coords (37 for R=3). */
export function allCoords(): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = []
  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      if (inBounds(q, r)) out.push({ q, r })
    }
  }
  return out
}

/* ---------- VP tiles per ring ---------- */
// Classic-ish descending values: center richest, outer leanest.
export const RING_VP: number[][] = [
  [20, 18, 17],         // ring 0 center
  [17, 16, 14, 13],     // ring 1 inner
  [13, 13, 13, 12, 12], // ring 2 middle
  [12, 12, 12, 12, 12, 12], // ring 3 outer
]

export const RING_NAMES = ['Center', 'Inner', 'Middle', 'Outer'] as const

/* ---------- game setup ---------- */

export function makeGame(): State {
  const board: Record<string, Cell> = {}
  for (const { q, r } of allCoords()) {
    board[key(q, r)] = { q, r, ring: ringOf(q, r), tree: null }
  }
  const s: State = {
    board,
    sun: 0,
    round: 1,
    players: [{ lightPoints: 0, vp: 0 }, { lightPoints: 0, vp: 0 }],
    vpTiles: RING_VP.map(t => t.slice()),
    turn: 0,
    phase: 'play',
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'The sun rises over the forest.' }],
  }
  // Starting trees: each player gets two SMALL trees on opposite outer-ring cells.
  place(s, -R, R, { owner: 0, size: SMALL })   // bottom-left edge
  place(s, R, -R, { owner: 0, size: SMALL })   // top-right edge
  place(s, R, 0, { owner: 1, size: SMALL })    // right edge
  place(s, -R, 0, { owner: 1, size: SMALL })   // left edge
  collectLight(s, 0)
  collectLight(s, 1)
  return s
}

function place(s: State, q: number, r: number, tree: Tree | null) {
  const c = s.board[key(q, r)]
  if (c != null) c.tree = tree
}

/* ---------- shadows ---------- */

/**
 * Returns a Set of cell keys that are in SHADOW for the purpose of the given/queried tree
 * size, but more usefully: returns a map key → max caster size shading that cell. A cell is
 * "shaded" for a tree of size s if maxShade[key] >= s. Seeds (size 0) are considered shaded
 * by any caster (size >= 0 includes a same/larger, but only sizes >= 1 cast shadows).
 */
export function computeShadowMap(s: State): Record<string, number> {
  const shade: Record<string, number> = {}
  // Shadow falls in the direction AWAY from the sun. Sun shines from DIRS[sun] toward center,
  // so shadow extends in the same direction DIRS[sun] (away from the light source side).
  const d = DIRS[s.sun]
  for (const k in s.board) {
    const c = s.board[k]
    if (c.tree == null) continue
    const size = c.tree.size
    if (size <= 0) continue // seeds cast no shadow
    let q = c.q, r = c.r
    for (let i = 1; i <= size; i++) {
      q += d.q; r += d.r
      const kk = key(q, r)
      if (s.board[kk] == null) break // off board
      if (shade[kk] == null || shade[kk] < size) shade[kk] = size
    }
  }
  return shade
}

/**
 * Set of cell keys whose occupying tree is currently shaded (covered by a same-or-larger
 * tree's shadow). Empty cells never appear.
 */
export function computeShadows(s: State): Set<string> {
  const shade = computeShadowMap(s)
  const shaded = new Set<string>()
  for (const k in s.board) {
    const c = s.board[k]
    if (c.tree == null) continue
    const ms = shade[k]
    if (ms != null && ms >= c.tree.size) shaded.add(k)
  }
  return shaded
}

export function isShaded(s: State, q: number, r: number): boolean {
  return computeShadows(s).has(key(q, r))
}

/* ---------- light ---------- */

/** Award light to all of `player`'s unshaded trees: light = size (seeds give 0). */
export function collectLight(s: State, player: Player): number {
  const shaded = computeShadows(s)
  let gained = 0
  for (const k in s.board) {
    const c = s.board[k]
    if (c.tree == null || c.tree.owner !== player) continue
    if (shaded.has(k)) continue
    gained += c.tree.size // seed 0, small 1, medium 2, large 3
  }
  s.players[player].lightPoints += gained
  return gained
}

/* ---------- actions ---------- */

export type Action =
  | { type: 'plant'; q: number; r: number; from: string } // plant seed at (q,r), seeded from key `from`
  | { type: 'grow'; q: number; r: number }                // grow tree at (q,r) to next size
  | { type: 'collect'; q: number; r: number }             // collect large tree at (q,r)
  | { type: 'end' }                                        // end this player's turn

export const PLANT_COST = 1
export const COLLECT_COST = 4

/** Cost to grow a tree of the given current size to the next size. */
export function growCost(size: Size): number {
  // seed→small 1, small→medium 2, medium→large 3
  if (size === SEED) return 1
  if (size === SMALL) return 2
  if (size === MEDIUM) return 3
  return Infinity // large can't grow
}

/** All your small+ trees that could seed an adjacent empty cell. */
function plantTargets(s: State, player: Player): Action[] {
  const out: Action[] = []
  const seen = new Set<string>()
  for (const k in s.board) {
    const c = s.board[k]
    if (c.tree == null || c.tree.owner !== player || c.tree.size < SMALL) continue
    for (const n of neighbors(c.q, c.r)) {
      if (!inBounds(n.q, n.r)) continue
      const nk = key(n.q, n.r)
      const target = s.board[nk]
      if (target.tree != null) continue
      const id = nk + '<' + k
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ type: 'plant', q: n.q, r: n.r, from: k })
    }
  }
  return out
}

/** All legal actions for `player` given current light. Always includes {type:'end'}. */
export function legalActions(s: State, player: Player): Action[] {
  const out: Action[] = []
  const light = s.players[player].lightPoints
  if (light >= PLANT_COST) {
    out.push(...plantTargets(s, player))
  }
  for (const k in s.board) {
    const c = s.board[k]
    if (c.tree == null || c.tree.owner !== player) continue
    if (c.tree.size < LARGE) {
      if (light >= growCost(c.tree.size)) out.push({ type: 'grow', q: c.q, r: c.r })
    } else {
      if (light >= COLLECT_COST) out.push({ type: 'collect', q: c.q, r: c.r })
    }
  }
  out.push({ type: 'end' })
  return out
}

/** Whether a specific action is legal right now. */
export function isLegal(s: State, player: Player, a: Action): boolean {
  return legalActions(s, player).some(x => sameAction(x, a))
}

function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'end' || b.type === 'end') return a.type === b.type
  return (a as { q: number }).q === (b as { q: number }).q &&
         (a as { r: number }).r === (b as { r: number }).r
}

/** Score a collected large tree: take the highest remaining VP tile of its ring. */
function scoreRing(s: State, ring: number): number {
  const tiles = s.vpTiles[ring]
  if (tiles.length > 0) return tiles.shift() as number
  // Depleted — fall back to the cheapest neighbouring outer ring that still has tiles.
  for (let rr = ring + 1; rr <= R; rr++) {
    if (s.vpTiles[rr].length > 0) return s.vpTiles[rr].shift() as number
  }
  return 0
}

/**
 * Apply an action for the CURRENT turn player. Returns a NEW state (immutable at call sites).
 * Does not itself end the round — that happens via endTurn when the player ends.
 */
export function applyAction(s: State, a: Action): State {
  const ns = clone(s)
  if (ns.phase === 'over') return ns
  const p = ns.turn
  const ps = ns.players[p]
  const tag: 'you' | 'ai' = p === 0 ? 'you' : 'ai'

  if (a.type === 'end') {
    return endTurn(ns)
  }
  if (!isLegal(ns, p, a)) return ns // ignore illegal

  if (a.type === 'plant') {
    ps.lightPoints -= PLANT_COST
    ns.board[key(a.q, a.r)].tree = { owner: p, size: SEED }
    ns.log.push({ t: tag, x: (p === 0 ? 'You' : 'Rival') + ' plant a seed.' })
  } else if (a.type === 'grow') {
    const c = ns.board[key(a.q, a.r)]
    const t = c.tree as Tree
    ps.lightPoints -= growCost(t.size)
    t.size = (t.size + 1) as Size
    ns.log.push({ t: tag, x: (p === 0 ? 'You' : 'Rival') + ' grow a tree to ' + SIZE_NAMES[t.size] + '.' })
  } else if (a.type === 'collect') {
    const c = ns.board[key(a.q, a.r)]
    ps.lightPoints -= COLLECT_COST
    const gained = scoreRing(ns, c.ring)
    ps.vp += gained
    c.tree = null
    ns.log.push({ t: tag, x: (p === 0 ? 'You' : 'Rival') + ' collect a tree on the ' + RING_NAMES[c.ring].toLowerCase() + ' ring (+' + gained + ' VP).' })
  }
  ns.step++
  return ns
}

/* ---------- turn / round flow ---------- */

/** End the current player's turn. If both have acted this round, advance the round. */
export function endTurn(s: State): State {
  const ns = s === s ? clone(s) : clone(s) // ensure fresh copy
  if (ns.phase === 'over') return ns
  ns.step++
  if (ns.turn === 0) {
    // hand to AI
    ns.turn = 1
  } else {
    // both played → advance round (rotate sun, collect light, maybe end)
    advanceRound(ns)
  }
  return ns
}

function advanceRound(ns: State): void {
  if (ns.round >= ROUNDS_TOTAL) {
    finish(ns)
    return
  }
  ns.round++
  rotateSunMut(ns)
  collectLight(ns, 0)
  collectLight(ns, 1)
  ns.turn = 0
  ns.log.push({ t: 'sys', x: 'Round ' + ns.round + ' — the sun rotates; trees drink the light.' })
}

function finish(ns: State): void {
  ns.phase = 'over'
  const a = ns.players[0].vp, b = ns.players[1].vp
  ns.winner = a >= b ? 0 : 1 // ties go to you
  ns.log.push({ t: 'sys', x: 'The sun sets for the last time. You ' + a + ' · Rival ' + b + '.' })
}

/** Rotate the sun one step (cycles 0..5). Pure helper returning a new state. */
export function rotateSun(s: State): State {
  const ns = clone(s)
  rotateSunMut(ns)
  return ns
}

function rotateSunMut(ns: State): void {
  ns.sun = (ns.sun + 1) % 6
}

/* ---------- AI ---------- */

/**
 * Greedy AI: take ONE action and return the new state. The driver re-invokes until the AI's
 * turn ends (the AI emits {type:'end'} when nothing worthwhile remains). Priority:
 *   1. Collect a LARGE tree, choosing the one whose ring scores the most right now.
 *   2. Grow toward a collectable: prefer growing medium→large, then small→medium, then seed→small.
 *   3. Plant a seed for board presence (toward inner rings) when cheap.
 * It manages light by simply only doing what it can afford; otherwise ends the turn.
 */
export function aiChoose(s: State): Action {
  const p: Player = 1
  const light = s.players[p].lightPoints
  const acts = legalActions(s, p)

  // 1. Collect — pick the largest-scoring ring available.
  const collects = acts.filter(a => a.type === 'collect') as Extract<Action, { type: 'collect' }>[]
  if (collects.length > 0) {
    let best = collects[0]
    let bestVal = ringPeek(s, s.board[key(best.q, best.r)].ring)
    for (const a of collects) {
      const v = ringPeek(s, s.board[key(a.q, a.r)].ring)
      if (v > bestVal) { bestVal = v; best = a }
    }
    return best
  }

  // 2. Grow — prefer the most advanced tree (closest to large), and inner rings.
  const grows = acts.filter(a => a.type === 'grow') as Extract<Action, { type: 'grow' }>[]
  if (grows.length > 0) {
    let best = grows[0]
    let bestScore = -Infinity
    for (const a of grows) {
      const c = s.board[key(a.q, a.r)]
      const t = c.tree as Tree
      // higher size = closer to harvest; prefer inner (lower ring index) for higher VP.
      const score = t.size * 10 + (R - c.ring) * 2
      if (score > bestScore) { bestScore = score; best = a }
    }
    // Only grow if it leaves enough buffer or it's a high-value medium→large near harvest.
    const c = s.board[key(best.q, best.r)]
    const t = c.tree as Tree
    if (light - growCost(t.size) >= 0) return best
  }

  // 3. Plant — extend toward the center if affordable and we don't have too many seeds out.
  const plants = acts.filter(a => a.type === 'plant') as Extract<Action, { type: 'plant' }>[]
  if (plants.length > 0 && countOwn(s, p, SEED) < 2 && light >= PLANT_COST + 1) {
    // Prefer the empty cell closest to the center (lowest ring number).
    let best = plants[0]
    let bestRing = s.board[key(best.q, best.r)].ring
    for (const a of plants) {
      const ring = s.board[key(a.q, a.r)].ring
      if (ring < bestRing) { bestRing = ring; best = a }
    }
    return best
  }

  return { type: 'end' }
}

/** Apply one AI action (greedy). Returns a new state. */
export function aiTurn(s: State): State {
  if (s.phase === 'over' || s.turn !== 1) return s
  return applyAction(s, aiChoose(s))
}

function ringPeek(s: State, ring: number): number {
  const tiles = s.vpTiles[ring]
  if (tiles.length > 0) return tiles[0]
  for (let rr = ring + 1; rr <= R; rr++) {
    if (s.vpTiles[rr].length > 0) return s.vpTiles[rr][0]
  }
  return 0
}

function countOwn(s: State, p: Player, size: Size): number {
  let n = 0
  for (const k in s.board) {
    const c = s.board[k]
    if (c.tree != null && c.tree.owner === p && c.tree.size === size) n++
  }
  return n
}

/* ---------- utilities ---------- */

export function clone(s: State): State {
  const board: Record<string, Cell> = {}
  for (const k in s.board) {
    const c = s.board[k]
    board[k] = { q: c.q, r: c.r, ring: c.ring, tree: c.tree == null ? null : { owner: c.tree.owner, size: c.tree.size } }
  }
  return {
    board,
    sun: s.sun,
    round: s.round,
    players: [{ ...s.players[0] }, { ...s.players[1] }],
    vpTiles: s.vpTiles.map(t => t.slice()),
    turn: s.turn,
    phase: s.phase,
    winner: s.winner,
    step: s.step,
    log: s.log.slice(),
  }
}

export function winner(s: State): Player | null {
  return s.winner
}

/** Count a player's trees by size, for the UI supply/inventory readout. */
export function treeCounts(s: State, p: Player): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (const k in s.board) {
    const c = s.board[k]
    if (c.tree != null && c.tree.owner === p) out[c.tree.size]++
  }
  return out
}
