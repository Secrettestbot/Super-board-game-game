/* CASCADIA — pure logic (built for this codebase, not ported).

   Tile + token drafting, area-building. You (player 0) vs a greedy AI (player 1); each
   builds a PERSONAL tableau of hexagonal habitat tiles. A central market offers four
   tile+token PAIRS — taking a pair couples the habitat you want with the wildlife token
   you must then place. The pairing is the tension.

   Coordinate system: AXIAL hex (q, r) with a pointy-top layout. The six neighbour
   directions are the standard axial set. Coords can be 0 or negative — never truthiness-
   test a coord. A tile shows 1-2 of five TERRAINS and 1-3 WILDLIFE SLOTS (animals it may
   host). On a turn the active player takes a market pair, places the habitat tile in any
   empty hex adjacent to their tableau (with a rotation that just reorders the two-terrain
   edge labelling — kept simple), then places the wildlife token on any own tile whose slot
   allows that animal, or sets it aside.

   Scoring at game end:
     WILDLIFE — each animal has its own rule (see wildlifeScore).
     HABITAT CORRIDORS — for each terrain, the LARGEST connected group of tiles bearing
       that terrain scores its size, plus a +2 majority bonus for the larger of the two.
   Highest total wins.

   The game is bounded: each player places a fixed number of tiles (TILES_EACH), so it
   always terminates. Deterministic bags make the self-play test reproducible. */

export type Player = 0 | 1
export type Terrain = 'forest' | 'wetland' | 'river' | 'mountain' | 'prairie'
export type Animal = 'bear' | 'elk' | 'salmon' | 'hawk' | 'fox'

export const TERRAINS: Terrain[] = ['forest', 'wetland', 'river', 'mountain', 'prairie']
export const ANIMALS: Animal[] = ['bear', 'elk', 'salmon', 'hawk', 'fox']

/** How many tiles each player places over the whole game (bounds the game). */
export const TILES_EACH = 20

/** A habitat tile definition (what's printed on it). */
export interface TileDef {
  /** 1-2 terrains shown on the tile. */
  terrains: Terrain[]
  /** 1-3 animals this tile may host (its wildlife slots). */
  slots: Animal[]
}

/** A placed tile in a tableau. */
export interface PlacedTile {
  terrains: Terrain[]
  slots: Animal[]
  /** Rotation 0..5 (cosmetic for the simplified scoring; stored for the UI). */
  rotation: number
  /** The wildlife token resting on this tile, or null. */
  placedAnimal: Animal | null
}

/** An axial hex coordinate. q and r may be negative or zero. */
export interface Hex { q: number; r: number }

export function hexKey(q: number, r: number): string { return q + ',' + r }
export function parseHex(k: string): Hex { const [q, r] = k.split(',').map(Number); return { q, r } }

/** The six axial neighbour directions (pointy-top). */
export const DIRS: Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
]

export function neighbors(q: number, r: number): Hex[] {
  return DIRS.map(d => ({ q: q + d.q, r: r + d.r }))
}

/** A player's tableau: a map from hex key → placed tile. */
export type Tableau = Record<string, PlacedTile>

/** A market entry: a habitat tile paired with a wildlife token. */
export interface MarketPair { tile: TileDef; token: Animal }

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface CascadiaState {
  tableaus: [Tableau, Tableau]
  /** The four tile+token pairs on offer. */
  market: MarketPair[]
  /** Draw bags (consumed from the front). */
  tileBag: TileDef[]
  tokenBag: Animal[]
  turn: Player
  /** Total placement turns remaining across BOTH players. */
  turnsLeft: number
  scores: [number, number]
  winner: Player | null
  /** Increments every action so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

// ---------------------------------------------------------------------------
// Deterministic-ish RNG + bag generation
// ---------------------------------------------------------------------------

/** Tiny seeded PRNG (mulberry32) so bags are reproducible when a seed is given. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T { return arr[(rng() * arr.length) | 0] }

/** Build a random habitat tile: 1-2 terrains, 1-3 wildlife slots. */
function randTile(rng: () => number): TileDef {
  const nT = rng() < 0.45 ? 1 : 2
  const terrains: Terrain[] = []
  while (terrains.length < nT) {
    const t = pick(rng, TERRAINS)
    if (!terrains.includes(t)) terrains.push(t)
  }
  const nS = 1 + ((rng() * 3) | 0) // 1..3
  const slots: Animal[] = []
  while (slots.length < nS) {
    const a = pick(rng, ANIMALS)
    if (!slots.includes(a)) slots.push(a)
  }
  return { terrains, slots }
}

/** Build the default bags (a tile bag + a token bag) from a seed. */
export function makeBags(seed = 1, n = 120): { tileBag: TileDef[]; tokenBag: Animal[] } {
  const rng = mulberry32(seed)
  const tileBag: TileDef[] = []
  const tokenBag: Animal[] = []
  for (let i = 0; i < n; i++) { tileBag.push(randTile(rng)); tokenBag.push(pick(rng, ANIMALS)) }
  return { tileBag, tokenBag }
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// ---------------------------------------------------------------------------
// Game setup
// ---------------------------------------------------------------------------

/** A fixed central starter tile so each player has an anchor to build from. */
function starterTile(): PlacedTile {
  return { terrains: ['forest', 'prairie'], slots: ['bear', 'elk', 'fox'], rotation: 0, placedAnimal: null }
}

/**
 * Create a new game. Pass optional bags (e.g. from makeBags(seed)) for determinism;
 * otherwise a random seed is used.
 */
export function makeGame(bags?: { tileBag: TileDef[]; tokenBag: Animal[] }): CascadiaState {
  const b = bags ?? makeBags((Math.random() * 1e9) | 0)
  const tileBag = b.tileBag.slice()
  const tokenBag = b.tokenBag.slice()

  const market: MarketPair[] = []
  for (let i = 0; i < 4; i++) market.push({ tile: tileBag.shift()!, token: tokenBag.shift()! })

  const startA: Tableau = { [hexKey(0, 0)]: starterTile() }
  const startB: Tableau = { [hexKey(0, 0)]: starterTile() }

  return {
    tableaus: [startA, startB],
    market,
    tileBag,
    tokenBag,
    turn: 0,
    turnsLeft: TILES_EACH * 2,
    scores: [0, 0],
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Draft a tile+token pair, grow your habitat corridors, and place wildlife to score.' }],
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** All empty hexes adjacent to at least one placed tile in this tableau (legal tile spots). */
export function legalTilePlacements(tab: Tableau): Hex[] {
  const out: Hex[] = []
  const seen = new Set<string>()
  for (const k of Object.keys(tab)) {
    const { q, r } = parseHex(k)
    for (const nb of neighbors(q, r)) {
      const nk = hexKey(nb.q, nb.r)
      if (tab[nk] != null) continue // occupied
      if (seen.has(nk)) continue
      seen.add(nk)
      out.push(nb)
    }
  }
  // Stable ordering for determinism.
  out.sort((a, b) => (a.q - b.q) || (a.r - b.r))
  return out
}

/** Hexes in this tableau whose slots allow the given animal AND are currently empty. */
export function legalAnimalSpots(tab: Tableau, animal: Animal): Hex[] {
  const out: Hex[] = []
  for (const k of Object.keys(tab)) {
    const t = tab[k]
    if (t.placedAnimal == null && t.slots.includes(animal)) out.push(parseHex(k))
  }
  out.sort((a, b) => (a.q - b.q) || (a.r - b.r))
  return out
}

/**
 * Take market pair `marketIndex`, place its habitat tile at `hex` with `rotation`, then
 * place its wildlife token at `animalCoord` (must be a legal slot) or set it aside if null.
 * Refills the market from the bags. Advances the turn; ends the game when turnsLeft hits 0.
 * Returns the same state unchanged on an illegal move.
 */
export function placePair(
  s: CascadiaState,
  player: Player,
  marketIndex: number,
  hex: Hex,
  rotation: number,
  animalCoord: Hex | null,
): CascadiaState {
  if (s.winner != null) return s
  if (player !== s.turn) return s
  const pair = s.market[marketIndex]
  if (pair == null) return s

  const tab = s.tableaus[player]
  const targetKey = hexKey(hex.q, hex.r)
  if (tab[targetKey] != null) return s // occupied
  // Must be adjacent to the existing tableau.
  const adjacent = neighbors(hex.q, hex.r).some(nb => tab[hexKey(nb.q, nb.r)] != null)
  if (!adjacent) return s

  const placed: PlacedTile = {
    terrains: pair.tile.terrains.slice(),
    slots: pair.tile.slots.slice(),
    rotation: ((rotation % 6) + 6) % 6,
    placedAnimal: null,
  }
  const newTab: Tableau = { ...tab, [targetKey]: placed }

  // Place the token if a coord is given and legal.
  if (animalCoord != null) {
    const ak = hexKey(animalCoord.q, animalCoord.r)
    const host = newTab[ak]
    if (host != null && host.placedAnimal == null && host.slots.includes(pair.token)) {
      newTab[ak] = { ...host, placedAnimal: pair.token }
    }
    // If illegal, the token is simply set aside (no-op) rather than rejecting the move.
  }

  const tableaus: [Tableau, Tableau] = player === 0 ? [newTab, s.tableaus[1]] : [s.tableaus[0], newTab]

  // Refill market.
  const tileBag = s.tileBag.slice()
  const tokenBag = s.tokenBag.slice()
  const market = s.market.slice()
  const newTile = tileBag.shift()
  const newToken = tokenBag.shift()
  if (newTile != null && newToken != null) market[marketIndex] = { tile: newTile, token: newToken }
  else market.splice(marketIndex, 1) // bag empty (shouldn't happen within bounds)

  const turnsLeft = s.turnsLeft - 1
  const who: LogEntry['t'] = player === 0 ? 'you' : 'ai'
  const name = player === 0 ? 'You' : 'Rival'
  let log = push(s.log, who, `${name} took ${pair.tile.terrains.join('/')} + ${pair.token}.`)

  let next: CascadiaState = {
    ...s,
    tableaus,
    market,
    tileBag,
    tokenBag,
    turn: (player === 0 ? 1 : 0) as Player,
    turnsLeft,
    step: s.step + 1,
    log,
  }

  if (turnsLeft <= 0) {
    const s0 = totalScore(tableaus[0])
    const s1 = totalScore(tableaus[1])
    const winner: Player = s0 >= s1 ? 0 : 1
    log = push(log, 'sys', `Final: You ${s0} · Rival ${s1}. ${winner === 0 ? 'You win!' : 'Rival wins.'}`)
    next = { ...next, scores: [s0, s1], winner, log }
  } else {
    next = { ...next, scores: [totalScore(tableaus[0]), totalScore(tableaus[1])] }
  }
  return next
}

// ---------------------------------------------------------------------------
// Scoring — wildlife
// ---------------------------------------------------------------------------

/** Map of hex key → animal for every placed token in a tableau. */
function animalMap(tab: Tableau): Record<string, Animal> {
  const m: Record<string, Animal> = {}
  for (const k of Object.keys(tab)) { const a = tab[k].placedAnimal; if (a != null) m[k] = a }
  return m
}

function adjKeys(k: string): string[] {
  const { q, r } = parseHex(k)
  return neighbors(q, r).map(nb => hexKey(nb.q, nb.r))
}

/**
 * BEAR — scores by PAIRS of adjacent bears. Each bear belongs to at most one pair; a
 * connected group of size 2 is one pair (4 pts), larger groups score floor(size/2) pairs.
 * (Simplified, clear, deterministic.)
 */
function scoreBear(tab: Tableau): number {
  const am = animalMap(tab)
  const bears = Object.keys(am).filter(k => am[k] === 'bear')
  const set = new Set(bears)
  const seen = new Set<string>()
  let pairs = 0
  for (const start of bears) {
    if (seen.has(start)) continue
    // BFS the connected bear group.
    const stack = [start]; seen.add(start); let size = 0
    while (stack.length) {
      const k = stack.pop()!; size++
      for (const nk of adjKeys(k)) if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) }
    }
    pairs += Math.floor(size / 2)
  }
  return pairs * 4
}

/** ELK — scores by straight LINES. Longer the longest line through a clump, the better.
 *  We greedily count maximal straight runs along each of the 3 axes and award per length:
 *  1→2, 2→5, 3→9, 4+→13 per run, consuming used cells so each elk counts once. */
function scoreElk(tab: Tableau): number {
  const am = animalMap(tab)
  const elk = new Set(Object.keys(am).filter(k => am[k] === 'elk'))
  const used = new Set<string>()
  // Three line axes (a dir and its opposite share an axis).
  const axes: Hex[] = [DIRS[0], DIRS[1], DIRS[2]]
  const lenPts = (n: number) => (n >= 4 ? 13 : n === 3 ? 9 : n === 2 ? 5 : 2)
  let total = 0
  // Repeatedly find the longest available straight run, score & consume it.
  for (;;) {
    let best: string[] = []
    for (const start of elk) {
      if (used.has(start)) continue
      for (const ax of axes) {
        // Only start a run at a cell with no predecessor in this axis (run head).
        const { q, r } = parseHex(start)
        const prevK = hexKey(q - ax.q, r - ax.r)
        if (elk.has(prevK) && !used.has(prevK)) continue
        // Walk forward.
        const run: string[] = []
        let cq = q, cr = r
        while (elk.has(hexKey(cq, cr)) && !used.has(hexKey(cq, cr))) {
          run.push(hexKey(cq, cr)); cq += ax.q; cr += ax.r
        }
        if (run.length > best.length) best = run
      }
    }
    if (best.length === 0) break
    total += lenPts(best.length)
    for (const k of best) used.add(k)
  }
  return total
}

/** SALMON — scores by RUNS (chains). Each maximal connected chain scores by its length:
 *  1→0, 2→2, 3→4, 4→7, 5+→11. (A salmon must form a flowing run to score.) */
function scoreSalmon(tab: Tableau): number {
  const am = animalMap(tab)
  const salmon = Object.keys(am).filter(k => am[k] === 'salmon')
  const set = new Set(salmon)
  const seen = new Set<string>()
  const pts = (n: number) => (n >= 5 ? 11 : n === 4 ? 7 : n === 3 ? 4 : n === 2 ? 2 : 0)
  let total = 0
  for (const start of salmon) {
    if (seen.has(start)) continue
    const stack = [start]; seen.add(start); let size = 0
    while (stack.length) {
      const k = stack.pop()!; size++
      for (const nk of adjKeys(k)) if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) }
    }
    total += pts(size)
  }
  return total
}

/** HAWK — scores by NON-ADJACENT singles (a hawk likes solitude). Each hawk with NO
 *  adjacent hawk scores 3; clustered hawks score nothing. */
function scoreHawk(tab: Tableau): number {
  const am = animalMap(tab)
  const hawks = Object.keys(am).filter(k => am[k] === 'hawk')
  const set = new Set(hawks)
  let total = 0
  for (const k of hawks) {
    const lonely = adjKeys(k).every(nk => !set.has(nk))
    if (lonely) total += 3
  }
  return total
}

/** FOX — scores by VARIETY of distinct animals adjacent to it (a fox watches its
 *  neighbours). Each fox scores 1 point per distinct animal type in its neighbouring
 *  tiles (including other foxes). */
function scoreFox(tab: Tableau): number {
  const am = animalMap(tab)
  const foxes = Object.keys(am).filter(k => am[k] === 'fox')
  let total = 0
  for (const k of foxes) {
    const kinds = new Set<Animal>()
    for (const nk of adjKeys(k)) { const a = am[nk]; if (a != null) kinds.add(a) }
    total += kinds.size
  }
  return total
}

/** Per-animal wildlife scores plus the total. */
export function wildlifeScore(tab: Tableau): { byAnimal: Record<Animal, number>; total: number } {
  const byAnimal: Record<Animal, number> = {
    bear: scoreBear(tab),
    elk: scoreElk(tab),
    salmon: scoreSalmon(tab),
    hawk: scoreHawk(tab),
    fox: scoreFox(tab),
  }
  const total = ANIMALS.reduce((acc, a) => acc + byAnimal[a], 0)
  return { byAnimal, total }
}

// ---------------------------------------------------------------------------
// Scoring — habitat corridors
// ---------------------------------------------------------------------------

/** The size of the LARGEST connected group of tiles bearing `terrain`. */
export function largestCorridor(tab: Tableau, terrain: Terrain): number {
  const cells = Object.keys(tab).filter(k => tab[k].terrains.includes(terrain))
  const set = new Set(cells)
  const seen = new Set<string>()
  let best = 0
  for (const start of cells) {
    if (seen.has(start)) continue
    const stack = [start]; seen.add(start); let size = 0
    while (stack.length) {
      const k = stack.pop()!; size++
      for (const nk of adjKeys(k)) if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) }
    }
    if (size > best) best = size
  }
  return best
}

/** Corridor scores: each terrain's largest connected group size, plus a +2 majority bonus
 *  for the terrain whose corridor is largest of all (ties share the bonus). */
export function corridorScore(tab: Tableau): { byTerrain: Record<Terrain, number>; total: number } {
  const sizes: Record<Terrain, number> = {} as Record<Terrain, number>
  let max = 0
  for (const t of TERRAINS) { sizes[t] = largestCorridor(tab, t); if (sizes[t] > max) max = sizes[t] }
  const byTerrain: Record<Terrain, number> = {} as Record<Terrain, number>
  for (const t of TERRAINS) {
    byTerrain[t] = sizes[t] + (max > 0 && sizes[t] === max ? 2 : 0)
  }
  const total = TERRAINS.reduce((acc, t) => acc + byTerrain[t], 0)
  return { byTerrain, total }
}

/** Total score for a tableau = wildlife + corridors. */
export function totalScore(tab: Tableau): number {
  return wildlifeScore(tab).total + corridorScore(tab).total
}

/** Full score breakdown for the UI. */
export function scoreBreakdown(tab: Tableau) {
  const w = wildlifeScore(tab)
  const c = corridorScore(tab)
  return { wildlife: w, corridor: c, total: w.total + c.total }
}

// ---------------------------------------------------------------------------
// AI — greedy: take the pair that best grows corridors + enables high-value wildlife.
// ---------------------------------------------------------------------------

/** Evaluate the marginal gain of placing tile def at `hex` with its token, for `player`,
 *  by simulating the placement and comparing totalScore. Returns the best (delta, move). */
interface AiMove {
  marketIndex: number
  hex: Hex
  rotation: number
  animalCoord: Hex | null
  delta: number
}

function bestAnimalSpot(tab: Tableau, animal: Animal): { coord: Hex | null; gain: number } {
  const spots = legalAnimalSpots(tab, animal)
  if (spots.length === 0) return { coord: null, gain: 0 }
  const base = wildlifeScore(tab).total
  let best: Hex | null = null, bestGain = -Infinity
  for (const sp of spots) {
    const k = hexKey(sp.q, sp.r)
    const host = tab[k]
    const sim: Tableau = { ...tab, [k]: { ...host, placedAnimal: animal } }
    const gain = wildlifeScore(sim).total - base
    if (gain > bestGain) { bestGain = gain; best = sp }
  }
  // Only set aside if no spot at all; otherwise place even at gain 0 (keeps slots used).
  return { coord: best, gain: bestGain < 0 ? 0 : bestGain }
}

/** The AI's greedy choice for the current player. */
export function aiChoose(s: CascadiaState, player: Player): AiMove | null {
  const tab = s.tableaus[player]
  const spots = legalTilePlacements(tab)
  if (spots.length === 0) return null
  const base = totalScore(tab)
  let best: AiMove | null = null

  for (let mi = 0; mi < s.market.length; mi++) {
    const pair = s.market[mi]
    if (pair == null) continue
    for (const hex of spots) {
      const k = hexKey(hex.q, hex.r)
      const placed: PlacedTile = {
        terrains: pair.tile.terrains.slice(),
        slots: pair.tile.slots.slice(),
        rotation: 0,
        placedAnimal: null,
      }
      const simTab: Tableau = { ...tab, [k]: placed }
      // Corridor gain from the tile.
      const corridorGain = corridorScore(simTab).total - corridorScore(tab).total
      // Best wildlife placement for the paired token on the post-tile tableau.
      const anim = bestAnimalSpot(simTab, pair.token)
      const delta = corridorGain + anim.gain * 1.0
      if (best == null || delta > best.delta) {
        best = { marketIndex: mi, hex, rotation: 0, animalCoord: anim.coord, delta }
      }
    }
  }
  return best
}

/** Execute one AI placement. Falls back to a forced legal move if scoring finds none. */
export function aiTurn(s: CascadiaState): CascadiaState {
  if (s.winner != null || s.turn !== 1) return s
  const move = aiChoose(s, 1)
  if (move == null) {
    // No legal spot (shouldn't happen) — guard: just consume a market pair off-board is
    // impossible, so end the game defensively.
    const s0 = totalScore(s.tableaus[0]); const s1 = totalScore(s.tableaus[1])
    return { ...s, winner: (s0 >= s1 ? 0 : 1) as Player, scores: [s0, s1], step: s.step + 1 }
  }
  return placePair(s, 1, move.marketIndex, move.hex, move.rotation, move.animalCoord)
}

/** The winner accessor (null until the game ends). */
export function winner(s: CascadiaState): Player | null { return s.winner }
