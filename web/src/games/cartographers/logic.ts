/* CARTOGRAPHERS — pure logic (built for this codebase, not ported).
   A roll-and-write map-drawing duel. You (player 0) and the AI (player 1) each fill
   your OWN 11x11 map. Pre-printed MOUNTAIN cells score coins when fully surrounded;
   RUINS cells force the next shape to overlap one of them.

   Play 4 SEASONS. Each season runs a TIME BUDGET: draw shared EXPLORE cards (a polyomino
   SHAPE + allowed TERRAINs, plus a time value) until accumulated time meets the budget.
   Both players draw the SAME card; each places that shape (any rotation/flip, any legal
   empty position) in a chosen allowed terrain on their own map. Some cards grant a COIN.

   At each season's end, TWO of four scoring EDICTS are scored (rotating A+B / B+C / C+D /
   D+A). Coins (from coin-shapes + a mountain surrounded on all 4 sides) = 1 pt each, every
   season. Highest cumulative total over 4 seasons wins.

   No React / DOM here. The deck is deterministic when passed in (makeGame(deck?)). */

export type Player = 0 | 1
export type Terrain = 'forest' | 'village' | 'farm' | 'water' | 'monster'
/** Cell contents: empty | mountain (pre-printed) | ruins (pre-printed, empty for placement) | a drawn terrain. */
export type Cell = '' | 'mountain' | 'ruins' | Terrain

export const SIZE = 11
export const SEASONS = 4
/** Season time budgets (Cartographers uses 8/8/7/6 in the real game; matched here). */
export const TIME_BUDGET: number[] = [8, 8, 7, 6]
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter']

/** A shape is a list of [row,col] offsets relative to (0,0). */
export type Shape = [number, number][]

export interface ExploreCard {
  id: string
  name: string
  /** One or two shape options (the player picks one). */
  shapes: Shape[]
  /** Terrains the player may choose among for this card. */
  terrains: Terrain[]
  /** Time spent toward the season budget. */
  time: number
  /** Grants a coin on placement (e.g. small "rift land" shapes). */
  coin?: boolean
}

export interface Edict {
  id: string
  name: string
  desc: string
}

export interface PlayerMap {
  /** SIZE*SIZE flat grid. */
  grid: Cell[]
  /** Coins collected from coin-cards. (Surround-a-mountain coins are computed on score.) */
  coins: number
  /** Cumulative score over completed seasons. */
  score: number
  /** Whether this player has placed for the current card yet. */
  placed: boolean
}

export type Phase = 'placing' | 'seasonEnd' | 'over'

export interface State {
  maps: [PlayerMap, PlayerMap]
  deck: ExploreCard[]
  /** Index into deck of the current card. */
  cardIdx: number
  card: ExploreCard | null
  season: number
  /** Time spent so far this season. */
  time: number
  edicts: [Edict, Edict, Edict, Edict]
  /** The two edict indices scored this season. */
  scoredEdicts: [number, number]
  /** Per-season score deltas, for the panel. */
  seasonScores: number[]
  phase: Phase
  /** 0 (you) | 1 (ai). winner === 2 means a draw. null while playing. */
  winner: Player | 2 | null
  /** Increments on every mutation so the AI driver re-arms (useAITurn tick). */
  step: number
}

// ===================== shape geometry =====================

/** Normalize a shape so its min row/col is 0; sorted; deduped signature-friendly. */
export function normalize(shape: Shape): Shape {
  const minR = Math.min(...shape.map(c => c[0]))
  const minC = Math.min(...shape.map(c => c[1]))
  return shape
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

function sig(shape: Shape): string {
  return normalize(shape).map(c => c.join(',')).join(';')
}

/** All 8 orientations (4 rotations x 2 reflections), normalized & deduped. */
export function orientations(shape: Shape): Shape[] {
  const out: Shape[] = []
  const seen = new Set<string>()
  let cur = shape.map(c => [c[0], c[1]] as [number, number])
  for (let refl = 0; refl < 2; refl++) {
    for (let rot = 0; rot < 4; rot++) {
      const n = normalize(cur)
      const s = sig(n)
      if (!seen.has(s)) { seen.add(s); out.push(n) }
      cur = cur.map(([r, c]) => [c, -r] as [number, number]) // rotate 90°
    }
    cur = cur.map(([r, c]) => [r, -c] as [number, number]) // reflect
  }
  return out
}

// ===================== map helpers =====================

export const idx = (r: number, c: number): number => r * SIZE + c
export const inBounds = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE

function blankGrid(): Cell[] {
  return new Array(SIZE * SIZE).fill('') as Cell[]
}

/** Pre-printed mountains (classic Cartographers positions) + a couple of ruins. */
const MOUNTAINS: [number, number][] = [
  [1, 3], [2, 8], [5, 5], [8, 2], [9, 7],
]
const RUINS: [number, number][] = [
  [1, 5], [2, 1], [8, 9], [5, 9], [9, 2],
]

function makeMap(): PlayerMap {
  const grid = blankGrid()
  for (const [r, c] of MOUNTAINS) grid[idx(r, c)] = 'mountain'
  for (const [r, c] of RUINS) grid[idx(r, c)] = 'ruins'
  return { grid, coins: 0, score: 0, placed: false }
}

/** A cell is open for terrain placement if it's empty OR ruins (ruins are placeable). */
export function isOpen(grid: Cell[], r: number, c: number): boolean {
  if (!inBounds(r, c)) return false
  const v = grid[idx(r, c)]
  return v === '' || v === 'ruins'
}

/** Does this grid still hold any un-built ruins cell? */
function hasOpenRuins(grid: Cell[]): boolean {
  return grid.some(v => v === 'ruins')
}

/** Absolute cells of a shape placed at (r0,c0). */
export function placedCells(shape: Shape, r0: number, c0: number): [number, number][] {
  return shape.map(([dr, dc]) => [r0 + dr, c0 + dc] as [number, number])
}

/**
 * All legal placements of `shape` on `map`'s grid: every orientation at every offset
 * whose cells are all open. Each placement is the list of absolute [r,c] cells.
 * If a ruins constraint applies, only placements covering ≥1 ruins cell are returned —
 * unless none exist, in which case the constraint is relaxed (so play never deadlocks).
 */
export function legalPlacements(grid: Cell[], shape: Shape): [number, number][][] {
  const oris = orientations(shape)
  const all: [number, number][][] = []
  const seen = new Set<string>()
  for (const ori of oris) {
    const maxR = Math.max(...ori.map(c => c[0]))
    const maxC = Math.max(...ori.map(c => c[1]))
    for (let r0 = 0; r0 + maxR < SIZE; r0++) {
      for (let c0 = 0; c0 + maxC < SIZE; c0++) {
        const cells = placedCells(ori, r0, c0)
        if (!cells.every(([r, c]) => isOpen(grid, r, c))) continue
        const key = cells.map(([r, c]) => idx(r, c)).sort((a, b) => a - b).join('|')
        if (seen.has(key)) continue
        seen.add(key)
        all.push(cells)
      }
    }
  }
  if (hasOpenRuins(grid)) {
    const ruinsHits = all.filter(cells => cells.some(([r, c]) => grid[idx(r, c)] === 'ruins'))
    if (ruinsHits.length > 0) return ruinsHits
  }
  return all
}

// ===================== explore deck + edicts =====================

// Polyomino library used to build cards.
const SH = {
  // tromino / tetromino / pentomino-ish pieces
  bend: [[0, 0], [0, 1], [1, 1]] as Shape, // L-tromino
  line3: [[0, 0], [0, 1], [0, 2]] as Shape,
  square: [[0, 0], [0, 1], [1, 0], [1, 1]] as Shape,
  tee: [[0, 0], [0, 1], [0, 2], [1, 1]] as Shape,
  ell: [[0, 0], [1, 0], [2, 0], [2, 1]] as Shape,
  zig: [[0, 1], [0, 2], [1, 0], [1, 1]] as Shape, // S/Z tetromino
  plus: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] as Shape,
  big: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2]] as Shape, // U-pentomino
  dot: [[0, 0]] as Shape,
  domino: [[0, 0], [0, 1]] as Shape,
}

/** The default (shuffled-but-deterministic by construction) explore deck. */
export function defaultDeck(): ExploreCard[] {
  return [
    { id: 'e_forest_bend', name: 'Great River', shapes: [SH.line3, SH.square], terrains: ['water', 'farm'], time: 2 },
    { id: 'e_orchard', name: 'Orchard', shapes: [SH.ell, SH.tee], terrains: ['forest', 'farm'], time: 2 },
    { id: 'e_hamlet', name: 'Hamlet', shapes: [SH.square, SH.bend], terrains: ['village', 'farm'], time: 2 },
    { id: 'e_marsh', name: 'Marshlands', shapes: [SH.zig, SH.tee], terrains: ['water', 'monster'], time: 2 },
    { id: 'e_forgotten', name: 'Forgotten Forest', shapes: [SH.bend], terrains: ['forest', 'water'], time: 1, coin: true },
    { id: 'e_rift', name: 'Rift Lands', shapes: [SH.dot], terrains: ['forest', 'village', 'farm', 'water', 'monster'], time: 0, coin: true },
    { id: 'e_treetop', name: 'Treetop Village', shapes: [SH.big, SH.plus], terrains: ['forest', 'village'], time: 2 },
    { id: 'e_farmstead', name: 'Farmstead', shapes: [SH.line3, SH.ell], terrains: ['farm', 'village'], time: 2 },
    { id: 'e_homestead', name: 'Homestead', shapes: [SH.plus, SH.square], terrains: ['village', 'farm'], time: 2 },
    { id: 'e_creek', name: 'Hidden Creek', shapes: [SH.domino, SH.bend], terrains: ['water', 'forest'], time: 1, coin: true },
    { id: 'e_woods', name: 'Old Growth', shapes: [SH.tee, SH.zig], terrains: ['forest'], time: 2 },
    { id: 'e_fields', name: 'Fertile Fields', shapes: [SH.big, SH.line3], terrains: ['farm', 'water'], time: 2 },
    { id: 'e_outpost', name: 'Outpost', shapes: [SH.ell, SH.bend], terrains: ['village', 'monster'], time: 2 },
    { id: 'e_bog', name: 'Bog', shapes: [SH.zig, SH.square], terrains: ['water', 'monster'], time: 2 },
  ]
}

// --- the four edicts ---
export const EDICTS: [Edict, Edict, Edict, Edict] = [
  { id: 'A', name: 'Tradeway', desc: '3 pts per row OR column completely filled (no empty cell).' },
  { id: 'B', name: 'Greenbough', desc: '1 pt per forest tile adjacent to the map edge.' },
  { id: 'C', name: 'Wildholds', desc: '6 pts per cluster of 6+ connected village tiles.' },
  { id: 'D', name: 'Borderlands', desc: '1 pt per empty cell adjacent to a mountain.' },
]

/** The two edict indices scored in `season` (0-based): A+B, B+C, C+D, D+A. */
export function edictPair(season: number): [number, number] {
  const pairs: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]
  return pairs[season % 4]
}

// ===================== scoring =====================

function neighbors4(i: number): number[] {
  const r = Math.floor(i / SIZE), c = i % SIZE
  const out: number[] = []
  if (r > 0) out.push(i - SIZE)
  if (r < SIZE - 1) out.push(i + SIZE)
  if (c > 0) out.push(i - 1)
  if (c < SIZE - 1) out.push(i + 1)
  return out
}

const isFilled = (v: Cell): boolean => v !== '' && v !== 'ruins'

/** A: 3 pts per fully-filled row or column. */
function scoreTradeway(grid: Cell[]): number {
  let n = 0
  for (let r = 0; r < SIZE; r++) {
    let full = true
    for (let c = 0; c < SIZE; c++) if (!isFilled(grid[idx(r, c)])) { full = false; break }
    if (full) n++
  }
  for (let c = 0; c < SIZE; c++) {
    let full = true
    for (let r = 0; r < SIZE; r++) if (!isFilled(grid[idx(r, c)])) { full = false; break }
    if (full) n++
  }
  return n * 3
}

/** B: 1 pt per forest tile on the map edge. */
function scoreGreenbough(grid: Cell[]): number {
  let n = 0
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (grid[idx(r, c)] !== 'forest') continue
    if (r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1) n++
  }
  return n
}

/** C: 6 pts per connected village cluster of size >= 6. */
function scoreWildholds(grid: Cell[]): number {
  const seen = new Array(SIZE * SIZE).fill(false)
  let score = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 'village' || seen[i]) continue
    // BFS the cluster.
    let size = 0
    const stack = [i]
    seen[i] = true
    while (stack.length) {
      const cur = stack.pop()!
      size++
      for (const j of neighbors4(cur)) if (!seen[j] && grid[j] === 'village') { seen[j] = true; stack.push(j) }
    }
    if (size >= 6) score += 6
  }
  return score
}

/** D: 1 pt per empty cell adjacent to a mountain. */
function scoreBorderlands(grid: Cell[]): number {
  let n = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 'mountain') continue
    for (const j of neighbors4(i)) if (!isFilled(grid[j])) n++
  }
  return n
}

export function scoreEdict(grid: Cell[], e: Edict): number {
  switch (e.id) {
    case 'A': return scoreTradeway(grid)
    case 'B': return scoreGreenbough(grid)
    case 'C': return scoreWildholds(grid)
    case 'D': return scoreBorderlands(grid)
    default: return 0
  }
}

/** Coins from mountains fully surrounded on all 4 orthogonal sides by filled cells. */
export function mountainCoins(grid: Cell[]): number {
  let n = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 'mountain') continue
    const nb = neighbors4(i)
    if (nb.length === 4 && nb.every(j => isFilled(grid[j]))) n++
  }
  return n
}

/**
 * Score one player's map at a season end: the two active edicts + coins
 * (card coins already banked in map.coins, + surrounded-mountain coins).
 * Returns the delta to add to the cumulative score.
 */
export function seasonScore(map: PlayerMap, edicts: [Edict, Edict]): number {
  const e1 = scoreEdict(map.grid, edicts[0])
  const e2 = scoreEdict(map.grid, edicts[1])
  const coins = map.coins + mountainCoins(map.grid)
  return e1 + e2 + coins
}

// ===================== game flow =====================

export function makeGame(optionalDeck?: ExploreCard[]): State {
  const deck = optionalDeck && optionalDeck.length ? optionalDeck : defaultDeck()
  const edicts = EDICTS
  return {
    maps: [makeMap(), makeMap()],
    deck,
    cardIdx: 0,
    card: deck[0] ?? null,
    season: 0,
    time: 0,
    edicts,
    scoredEdicts: edictPair(0),
    seasonScores: [],
    phase: 'placing',
    winner: null,
    step: 0,
  }
}

/** Place the current card's shape for `player` on the given absolute cells in `terrain`. */
export function placeShape(s: State, player: Player, cells: [number, number][], terrain: Terrain): State {
  if (s.phase !== 'placing' || !s.card) return s
  const map = s.maps[player]
  if (map.placed) return s
  if (!s.card.terrains.includes(terrain)) return s
  // Validate the cells are all open.
  if (!cells.every(([r, c]) => isOpen(map.grid, r, c))) return s
  const grid = map.grid.slice()
  for (const [r, c] of cells) grid[idx(r, c)] = terrain
  const coins = map.coins + (s.card.coin ? 1 : 0)
  const maps = dupMaps(s.maps)
  maps[player] = { ...map, grid, coins, placed: true }
  return advanceAfterPlacement({ ...s, maps, step: s.step + 1 })
}

/** A player who cannot legally place (no placements for either shape) skips the card. */
export function skipPlacement(s: State, player: Player): State {
  if (s.phase !== 'placing' || !s.card) return s
  const map = s.maps[player]
  if (map.placed) return s
  const maps = dupMaps(s.maps)
  maps[player] = { ...map, placed: true }
  return advanceAfterPlacement({ ...s, maps, step: s.step + 1 })
}

function dupMaps(maps: [PlayerMap, PlayerMap]): [PlayerMap, PlayerMap] {
  return [{ ...maps[0] }, { ...maps[1] }]
}

/** Once both players have acted on the current card, spend time and draw next / end season. */
function advanceAfterPlacement(s: State): State {
  if (!s.maps[0].placed || !s.maps[1].placed) return s
  // Both placed: spend the card's time.
  const time = s.time + (s.card ? s.card.time : 0)
  const budget = TIME_BUDGET[s.season]
  if (time >= budget) {
    return endSeason({ ...s, time })
  }
  // Draw the next card; clear placed flags.
  const cardIdx = (s.cardIdx + 1) % s.deck.length
  const maps = dupMaps(s.maps)
  maps[0] = { ...maps[0], placed: false }
  maps[1] = { ...maps[1], placed: false }
  return { ...s, time, cardIdx, card: s.deck[cardIdx], maps, step: s.step + 1 }
}

/** Tally the season's edicts + coins for both players, advance season or finish. */
export function endSeason(s: State): State {
  const pair = edictPair(s.season)
  const es: [Edict, Edict] = [s.edicts[pair[0]], s.edicts[pair[1]]]
  const d0 = seasonScore(s.maps[0], es)
  const d1 = seasonScore(s.maps[1], es)
  const maps = dupMaps(s.maps)
  maps[0] = { ...maps[0], score: maps[0].score + d0 }
  maps[1] = { ...maps[1], score: maps[1].score + d1 }
  const seasonScores = s.seasonScores.concat([d0, d1])

  const nextSeasonIdx = s.season + 1
  if (nextSeasonIdx >= SEASONS) {
    const w: Player | 2 = maps[0].score > maps[1].score ? 0 : maps[1].score > maps[0].score ? 1 : 2
    return { ...s, maps, seasonScores, phase: 'over', winner: w, step: s.step + 1, scoredEdicts: pair }
  }
  return { ...s, maps, seasonScores, phase: 'seasonEnd', scoredEdicts: pair, step: s.step + 1 }
}

/** Advance from the season-end interstitial into the next season's first card. */
export function nextSeason(s: State): State {
  if (s.phase !== 'seasonEnd') return s
  const season = s.season + 1
  const cardIdx = (s.cardIdx + 1) % s.deck.length
  const maps = dupMaps(s.maps)
  maps[0] = { ...maps[0], placed: false }
  maps[1] = { ...maps[1], placed: false }
  return {
    ...s,
    season,
    time: 0,
    cardIdx,
    card: s.deck[cardIdx],
    maps,
    scoredEdicts: edictPair(season),
    phase: 'placing',
    step: s.step + 1,
  }
}

export function winner(s: State): Player | 2 | null {
  return s.winner
}

// ===================== AI =====================

/**
 * Greedy AI for `player`: try every legal placement of every shape option in every
 * allowed terrain, scoring the resulting map against the CURRENT season's edicts plus
 * a small look-ahead at NEXT season's edicts and coins. Pick the highest-scoring move.
 */
export function aiBestMove(
  s: State,
  player: Player,
): { cells: [number, number][]; terrain: Terrain } | null {
  if (!s.card) return null
  const map = s.maps[player]
  const curPair = edictPair(s.season)
  const nextPair = edictPair((s.season + 1) % SEASONS)
  // Active edicts to optimize toward (weight current full, next half).
  const curEdicts: [Edict, Edict] = [s.edicts[curPair[0]], s.edicts[curPair[1]]]
  const nextEdicts: [Edict, Edict] = [s.edicts[nextPair[0]], s.edicts[nextPair[1]]]

  function evaluate(grid: Cell[]): number {
    const cur = scoreEdict(grid, curEdicts[0]) + scoreEdict(grid, curEdicts[1])
    const nxt = scoreEdict(grid, nextEdicts[0]) + scoreEdict(grid, nextEdicts[1])
    const coins = mountainCoins(grid)
    return cur + 0.5 * nxt + 2 * coins
  }

  let best: { cells: [number, number][]; terrain: Terrain } | null = null
  let bestScore = -Infinity
  for (const shape of s.card.shapes) {
    const placements = legalPlacements(map.grid, shape)
    for (const cells of placements) {
      for (const terrain of s.card.terrains) {
        const grid = map.grid.slice()
        for (const [r, c] of cells) grid[idx(r, c)] = terrain
        const sc = evaluate(grid)
        if (sc > bestScore) {
          bestScore = sc
          best = { cells, terrain }
        }
      }
    }
  }
  return best
}

/** One AI action: place its best move for the current card, or skip if it cannot. */
export function aiTurn(s: State): State {
  if (s.phase !== 'placing' || !s.card) return s
  const player: Player = 1
  if (s.maps[player].placed) return s
  const move = aiBestMove(s, player)
  if (!move) return skipPlacement(s, player)
  return placeShape(s, player, move.cells, move.terrain)
}
