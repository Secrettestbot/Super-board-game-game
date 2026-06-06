/* CALICO — pure logic (built for this codebase, not ported).

   A cozy quilt-building game. You (player 0) vs a greedy AI (player 1); each fills a
   PERSONAL hex-grid quilt board. The board is a 5×5 axial rhombus (25 hexes). Some EDGE
   hexes come pre-printed with fixed patches; 3 INTERIOR hexes are reserved as DESIGN-GOAL
   tiles (they themselves hold no patch — they score from the 6 patches around them).

   Each PATCH TILE carries a COLOR (one of 6) and a PATTERN (one of 6). On your turn you
   place one of your 2 hand tiles onto an empty board hex, then draw back up to 2 from a
   shared market of 3 (refilled from a shared bag).

   Scoring (scoreBoard):
     COLOR BUTTONS  — every connected group of 3+ same-COLOR patch hexes earns a button
                      worth 3 pts.
     DESIGN GOALS   — each of the 3 goal hexes scores its point value if the 6 surrounding
                      hexes are all filled AND satisfy the goal's required color arrangement
                      (6-unique, 3+3, 2+2+2 — see GOAL_DEFS).

   The game is BOUNDED: each board has a fixed number of placeable hexes, so it always
   terminates once both boards are full. Deterministic bags make self-play reproducible.

   FALSY-ZERO CARE: players are 0/1, colors/patterns are indices 0..5, coords start at 0,
   scores can be 0. We never truthiness-test those — explicit null / === checks throughout. */

export type Player = 0 | 1

/** Six quilt colors and six patterns, referenced by index 0..5. */
export const COLORS = ['rose', 'amber', 'sage', 'teal', 'indigo', 'plum'] as const
export const PATTERNS = ['dots', 'stripes', 'leaf', 'star', 'quilt', 'vine'] as const
export type ColorIdx = number // 0..5
export type PatternIdx = number // 0..5

/** A patch placed (or pre-printed) on a hex. */
export interface Patch { color: ColorIdx; pattern: PatternIdx }

/** A single board hex. Exactly one of these roles applies:
 *   - goal != null  → a design-goal hex (never holds a patch).
 *   - fixed === true → a pre-printed patch (immovable, already filled at setup).
 *   - otherwise      → a normal placeable hex (patch is null until filled). */
export interface Cell {
  patch: Patch | null
  /** True for pre-printed edge patches that start filled and cannot be replaced. */
  fixed: boolean
  /** Index into GOAL_DEFS if this hex is a design-goal tile, else null. */
  goal: number | null
}

/** A player's quilt board: hex key → cell. */
export type Board = Record<string, Cell>

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface CalicoState {
  boards: [Board, Board]
  /** Shared market of up to 3 face-up patch tiles. */
  market: Patch[]
  /** Shared draw bag (consumed from the front). */
  bag: Patch[]
  /** Each player's hand of up to 2 patch tiles. */
  hands: [Patch[], Patch[]]
  turn: Player
  scores: [number, number]
  winner: Player | null
  /** Increments every action so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

// ---------------------------------------------------------------------------
// Hex grid — 5×5 axial rhombus, q,r in 0..4
// ---------------------------------------------------------------------------

export const SIZE = 5

export function hexKey(q: number, r: number): string { return q + ',' + r }
export function parseHex(k: string): { q: number; r: number } {
  const [q, r] = k.split(',').map(Number)
  return { q, r }
}

/** The six axial neighbour directions (pointy-top). */
export const DIRS: { q: number; r: number }[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
]

export function neighbors(q: number, r: number): { q: number; r: number }[] {
  return DIRS.map(d => ({ q: q + d.q, r: r + d.r }))
}

export function inBounds(q: number, r: number): boolean {
  return q >= 0 && q < SIZE && r >= 0 && r < SIZE
}

/** Every hex key on the board, in a stable order. */
export function allHexKeys(): string[] {
  const out: string[] = []
  for (let q = 0; q < SIZE; q++) for (let r = 0; r < SIZE; r++) out.push(hexKey(q, r))
  return out
}

// ---------------------------------------------------------------------------
// Design goals
// ---------------------------------------------------------------------------

export interface GoalDef {
  id: string
  /** Short human label for the UI. */
  label: string
  points: number
  /** Given the 6 surrounding COLOR indices (all present), does the arrangement satisfy it? */
  test: (colors: ColorIdx[]) => boolean
}

/** Multiset signature of a color list, e.g. [3,3] or [2,2,2] or [1,1,1,1,1,1], sorted desc. */
function colorSignature(colors: ColorIdx[]): number[] {
  const counts: Record<number, number> = {}
  for (const c of colors) counts[c] = (counts[c] ?? 0) + 1
  return Object.values(counts).sort((a, b) => b - a)
}

function sigEquals(sig: number[], want: number[]): boolean {
  if (sig.length !== want.length) return false
  for (let i = 0; i < sig.length; i++) if (sig[i] !== want[i]) return false
  return true
}

/** The three implemented goal types. */
export const GOAL_DEFS: GoalDef[] = [
  {
    id: 'six-unique',
    label: '6 unique colors',
    points: 10,
    test: (cs) => sigEquals(colorSignature(cs), [1, 1, 1, 1, 1, 1]),
  },
  {
    id: 'two-triples',
    label: '3 + 3 two colors',
    points: 7,
    test: (cs) => sigEquals(colorSignature(cs), [3, 3]),
  },
  {
    id: 'three-pairs',
    label: '2 + 2 + 2 three pairs',
    points: 8,
    test: (cs) => sigEquals(colorSignature(cs), [2, 2, 2]),
  },
]

// ---------------------------------------------------------------------------
// Deterministic RNG + bag generation
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Build a shared bag of `n` random patches from a seed. */
export function makeBag(seed = 1, n = 120): Patch[] {
  const rng = mulberry32(seed)
  const out: Patch[] = []
  for (let i = 0; i < n; i++) {
    out.push({ color: (rng() * 6) | 0, pattern: (rng() * 6) | 0 })
  }
  return out
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// ---------------------------------------------------------------------------
// Board setup
// ---------------------------------------------------------------------------

/** The 3 interior hexes used as design goals (each has all 6 neighbours in-bounds). */
export const GOAL_HEXES: { q: number; r: number }[] = [
  { q: 1, r: 1 },
  { q: 3, r: 1 },
  { q: 2, r: 3 },
]

/** The pre-printed fixed edge patches (corner-ish hexes), with their patch contents. */
const FIXED_PATCHES: { q: number; r: number; patch: Patch }[] = [
  { q: 0, r: 0, patch: { color: 0, pattern: 0 } },
  { q: 4, r: 0, patch: { color: 2, pattern: 2 } },
  { q: 0, r: 4, patch: { color: 4, pattern: 4 } },
  { q: 4, r: 4, patch: { color: 5, pattern: 1 } },
]

/** Build a fresh board: empty placeable hexes, plus fixed patches and goal markers. */
function makeBoard(): Board {
  const board: Board = {}
  for (const k of allHexKeys()) board[k] = { patch: null, fixed: false, goal: null }
  GOAL_HEXES.forEach((h, i) => { board[hexKey(h.q, h.r)] = { patch: null, fixed: false, goal: i } })
  for (const f of FIXED_PATCHES) {
    board[hexKey(f.q, f.r)] = { patch: { ...f.patch }, fixed: true, goal: null }
  }
  return board
}

/** Hexes that can still receive a placed patch: empty, not fixed, not a goal hex. */
export function legalPlacements(board: Board): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = []
  for (const k of allHexKeys()) {
    const c = board[k]
    if (c.goal == null && !c.fixed && c.patch == null) out.push(parseHex(k))
  }
  return out
}

/** True once no placeable hex remains empty (the quilt is full). */
export function boardFull(board: Board): boolean {
  return legalPlacements(board).length === 0
}

// ---------------------------------------------------------------------------
// Game setup
// ---------------------------------------------------------------------------

/**
 * Create a new game. Pass an optional bag (e.g. makeBag(seed)) for determinism;
 * otherwise a random seed is used.
 */
export function makeGame(optionalBag?: Patch[]): CalicoState {
  const bag = (optionalBag ?? makeBag((Math.random() * 1e9) | 0)).slice()

  // Deal hands (2 each) then the market (3).
  const hands: [Patch[], Patch[]] = [[], []]
  for (let i = 0; i < 2; i++) { hands[0].push(bag.shift()!); hands[1].push(bag.shift()!) }
  const market: Patch[] = []
  for (let i = 0; i < 3; i++) market.push(bag.shift()!)

  return {
    boards: [makeBoard(), makeBoard()],
    market,
    bag,
    hands,
    turn: 0,
    scores: [0, 0],
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Place a patch from your hand, then refill from the market. Group colors for buttons and satisfy the design goals.' }],
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Place hand tile `handIndex` for `player` onto `hex`, then draw back up to 2 tiles from
 * the market (refilling the market from the bag). Advances the turn and ends the game when
 * both boards are full. Returns the same state unchanged on an illegal move.
 */
export function placeTile(
  s: CalicoState,
  player: Player,
  handIndex: number,
  hex: { q: number; r: number },
): CalicoState {
  if (s.winner != null) return s
  if (player !== s.turn) return s
  const hand = s.hands[player]
  const tile = hand[handIndex]
  if (tile == null) return s
  if (!inBounds(hex.q, hex.r)) return s
  const key = hexKey(hex.q, hex.r)
  const board = s.boards[player]
  const cell = board[key]
  if (cell == null || cell.goal != null || cell.fixed || cell.patch != null) return s

  // Place the patch.
  const newBoard: Board = { ...board, [key]: { ...cell, patch: { ...tile } } }

  // Remove the tile from hand.
  const newHand = hand.slice()
  newHand.splice(handIndex, 1)

  // Draw back up to 2 from the market, refilling the market from the bag.
  const market = s.market.slice()
  const bag = s.bag.slice()
  while (newHand.length < 2 && market.length > 0) {
    newHand.push(market.shift()!)
    if (bag.length > 0) market.push(bag.shift()!)
  }

  const boards: [Board, Board] = player === 0 ? [newBoard, s.boards[1]] : [s.boards[0], newBoard]
  const hands: [Patch[], Patch[]] = player === 0 ? [newHand, s.hands[1]] : [s.hands[0], newHand]

  const who: LogEntry['t'] = player === 0 ? 'you' : 'ai'
  const name = player === 0 ? 'You' : 'Rival'
  let log = push(s.log, who, `${name} placed ${COLORS[tile.color]}/${PATTERNS[tile.pattern]}.`)

  const scores: [number, number] = [boardForScore(boards[0]), boardForScore(boards[1])]

  // Game ends when BOTH boards are full.
  const done = boardFull(boards[0]) && boardFull(boards[1])
  let winner: Player | null = null
  if (done) {
    winner = scores[0] >= scores[1] ? 0 : 1
    log = push(log, 'sys', `Quilts complete — You ${scores[0]} · Rival ${scores[1]}. ${winner === 0 ? 'You win!' : 'Rival wins.'}`)
  }

  return {
    ...s,
    boards,
    market,
    bag,
    hands,
    turn: (player === 0 ? 1 : 0) as Player,
    scores,
    winner,
    step: s.step + 1,
    log,
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Connected groups of 3+ same-color patch hexes → 3 pts each. */
export function colorButtons(board: Board): { groups: string[][]; points: number } {
  const seen = new Set<string>()
  const groups: string[][] = []
  for (const k of allHexKeys()) {
    if (seen.has(k)) continue
    const cell = board[k]
    if (cell.patch == null) { seen.add(k); continue }
    // BFS the same-color connected group.
    const color = cell.patch.color
    const group: string[] = []
    const stack = [k]
    seen.add(k)
    while (stack.length) {
      const cur = stack.pop()!
      group.push(cur)
      const { q, r } = parseHex(cur)
      for (const nb of neighbors(q, r)) {
        if (!inBounds(nb.q, nb.r)) continue
        const nk = hexKey(nb.q, nb.r)
        if (seen.has(nk)) continue
        const nc = board[nk]
        if (nc.patch != null && nc.patch.color === color) { seen.add(nk); stack.push(nk) }
      }
    }
    if (group.length >= 3) groups.push(group)
  }
  return { groups, points: groups.length * 3 }
}

/** Per-goal evaluation: { satisfied, points } for each of the board's goal hexes. */
export function goalResults(board: Board): { hex: { q: number; r: number }; def: GoalDef; satisfied: boolean; points: number }[] {
  const out: { hex: { q: number; r: number }; def: GoalDef; satisfied: boolean; points: number }[] = []
  for (const k of allHexKeys()) {
    const cell = board[k]
    if (cell.goal == null) continue
    const def = GOAL_DEFS[cell.goal]
    const { q, r } = parseHex(k)
    const colors: ColorIdx[] = []
    let allFilled = true
    for (const nb of neighbors(q, r)) {
      if (!inBounds(nb.q, nb.r)) { allFilled = false; break }
      const nc = board[hexKey(nb.q, nb.r)]
      if (nc.patch == null) { allFilled = false; break }
      colors.push(nc.patch.color)
    }
    const satisfied = allFilled && colors.length === 6 && def.test(colors)
    out.push({ hex: { q, r }, def, satisfied, points: satisfied ? def.points : 0 })
  }
  return out
}

/** Full score breakdown for a board. */
export function scoreBoard(board: Board): { buttons: number; goals: number; total: number } {
  const buttons = colorButtons(board).points
  const goals = goalResults(board).reduce((acc, g) => acc + g.points, 0)
  return { buttons, goals, total: buttons + goals }
}

function boardForScore(board: Board): number {
  return scoreBoard(board).total
}

// ---------------------------------------------------------------------------
// AI — greedy: place the hand tile that most increases (buttons + goal progress).
// ---------------------------------------------------------------------------

/** A soft heuristic measuring goal progress so the AI builds toward goals even before
 *  a goal is fully satisfied (the binary scoreBoard alone gives no gradient). */
function goalProgress(board: Board): number {
  let prog = 0
  for (const r of goalResults(board)) {
    if (r.satisfied) { prog += r.def.points; continue }
    // Partial credit: reward filled neighbours that move toward the target signature.
    const { q, r: rr } = r.hex
    const colors: ColorIdx[] = []
    for (const nb of neighbors(q, rr)) {
      if (!inBounds(nb.q, nb.r)) continue
      const nc = board[hexKey(nb.q, nb.r)]
      if (nc.patch != null) colors.push(nc.patch.color)
    }
    prog += colors.length * 0.15
  }
  return prog
}

/** Greedy evaluation of a board = real button points + soft goal progress. */
function aiEval(board: Board): number {
  return colorButtons(board).points + goalProgress(board)
}

export interface AiMove { handIndex: number; hex: { q: number; r: number }; gain: number }

/** The AI's greedy best placement for `player`. Returns null if no legal placement. */
export function aiChoose(s: CalicoState, player: Player): AiMove | null {
  const board = s.boards[player]
  const spots = legalPlacements(board)
  if (spots.length === 0) return null
  const hand = s.hands[player]
  if (hand.length === 0) return null
  const base = aiEval(board)
  let best: AiMove | null = null
  for (let hi = 0; hi < hand.length; hi++) {
    const tile = hand[hi]
    for (const hex of spots) {
      const k = hexKey(hex.q, hex.r)
      const cell = board[k]
      const sim: Board = { ...board, [k]: { ...cell, patch: { ...tile } } }
      const gain = aiEval(sim) - base
      if (best == null || gain > best.gain) best = { handIndex: hi, hex, gain }
    }
  }
  return best
}

/** Execute one AI placement. Defensive guard if no legal move is found. */
export function aiTurn(s: CalicoState): CalicoState {
  if (s.winner != null || s.turn !== 1) return s
  const move = aiChoose(s, 1)
  if (move == null) {
    // No legal placement for the AI; if its board is full but the game hasn't ended,
    // pass the turn back so the human can finish. Guarded so self-play can't stall.
    return { ...s, turn: 0, step: s.step + 1 }
  }
  return placeTile(s, 1, move.handIndex, move.hex)
}

/** Winner accessor (null until the game ends). */
export function winner(s: CalicoState): Player | null { return s.winner }
