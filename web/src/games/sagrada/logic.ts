/* SAGRADA — logic (built for this codebase, not ported).
   Dice-drafting stained glass. You (player 0) and the AI (player 1) each fill a
   private 5x4 window (4 rows × 5 cols = 20 cells). Over 10 rounds, dice are rolled
   into a shared draft pool (2×players + 1 = 5 dice). Players alternate drafting one
   die and placing it, in SNAKE order. Placement rules: the first die of a window must
   sit on an edge/corner cell; every later die must be orthogonally adjacent to an
   existing die, may not touch (orthogonally) a die of the same colour or same value,
   and must satisfy the cell's printed colour/value restriction. At game end each player
   scores private + public objectives minus one point per empty cell.

   No React / DOM here. Dice are deterministic when a seed is supplied. */

export type Color = 'red' | 'yellow' | 'green' | 'blue' | 'purple'
export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue', 'purple']

export interface Die { color: Color; value: number }

/** A printed cell restriction: a required colour, a required value, or neither (open). */
export interface Cell {
  /** Printed colour restriction (a die of any value of this colour) or null. */
  reqColor: Color | null
  /** Printed value restriction (a die of any colour with this value) or null. */
  reqValue: number | null
  /** The placed die, or null while empty. */
  die: Die | null
}

export const ROWS = 4
export const COLS = 5
export const CELLS = ROWS * COLS // 20
export const ROUNDS = 10

export type Player = 0 | 1

export interface PublicObjective {
  id: string
  name: string
  desc: string
  /** Points scored for `window` under this objective. */
  score: (w: Cell[]) => number
}

export interface SagradaState {
  /** Each player's 5x4 window, row-major: index = row*COLS + col. */
  windows: [Cell[], Cell[]]
  /** The current round's draft pool (dice still available to draft). */
  pool: Die[]
  round: number // 1..ROUNDS
  /** Secret private-objective colour per player. */
  secret: [Color, Color]
  /** The shared public objectives in play this game. */
  publics: PublicObjective[]
  /** Whose draft it is right now. */
  turn: Player
  /** How many drafts have happened this round (to drive snake order + round end). */
  picksThisRound: number
  /** Final scores once the game ends (null until then). */
  scores: [number, number] | null
  winner: Player | null
  /** Monotonic counter — bumps on every action so the AI driver re-arms. */
  step: number
  /** RNG state (deterministic when seeded). */
  rng: number
  log: LogEntry[]
}

export interface LogEntry { t: string; x: string }

// ---------------------------------------------------------------- RNG
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function nextRng(rng: number): { v: number; rng: number } {
  // Advance the integer state and return a [0,1) value.
  const r = mulberry32(rng)
  const v = r()
  // derive a fresh integer state from v so successive calls differ
  const rng2 = (Math.floor(v * 4294967296) ^ (rng * 1103515245 + 12345)) >>> 0
  return { v, rng: rng2 }
}

function rollDie(rng: number): { die: Die; rng: number } {
  let a = nextRng(rng)
  const color = COLORS[Math.floor(a.v * COLORS.length) % COLORS.length]
  const b = nextRng(a.rng)
  const value = 1 + (Math.floor(b.v * 6) % 6)
  return { die: { color, value }, rng: b.rng }
}

// ---------------------------------------------------------------- helpers
export function idx(r: number, c: number): number { return r * COLS + c }
export function rc(i: number): { r: number; c: number } { return { r: Math.floor(i / COLS), c: i % COLS } }
export function isEdge(i: number): boolean {
  const { r, c } = rc(i)
  return r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1
}
function orthNeighbors(i: number): number[] {
  const { r, c } = rc(i)
  const out: number[] = []
  if (r > 0) out.push(idx(r - 1, c))
  if (r < ROWS - 1) out.push(idx(r + 1, c))
  if (c > 0) out.push(idx(r, c - 1))
  if (c < COLS - 1) out.push(idx(r, c + 1))
  return out
}
function diagNeighbors(i: number): number[] {
  const { r, c } = rc(i)
  const out: number[] = []
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push(idx(nr, nc))
  }
  return out
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] { return log.concat([{ t, x }]).slice(-24) }
function cloneWindow(w: Cell[]): Cell[] { return w.map(c => ({ ...c, die: c.die ? { ...c.die } : null })) }
export function placedCount(w: Cell[]): number { return w.filter(c => c.die != null).length }
export function isWindowEmpty(w: Cell[]): boolean { return placedCount(w) === 0 }

// ---------------------------------------------------------------- public objectives
export const ALL_PUBLICS: PublicObjective[] = [
  {
    id: 'rows-diff-color',
    name: 'Row Colour Variety',
    desc: 'Rows with all five cells filled and all different colours — 6 points each.',
    score: (w) => {
      let pts = 0
      for (let r = 0; r < ROWS; r++) {
        const dice: Die[] = []
        for (let c = 0; c < COLS; c++) { const d = w[idx(r, c)].die; if (d) dice.push(d) }
        if (dice.length === COLS && new Set(dice.map(d => d.color)).size === COLS) pts += 6
      }
      return pts
    },
  },
  {
    id: 'cols-diff-value',
    name: 'Column Value Variety',
    desc: 'Columns with all four cells filled and all different values — 5 points each.',
    score: (w) => {
      let pts = 0
      for (let c = 0; c < COLS; c++) {
        const dice: Die[] = []
        for (let r = 0; r < ROWS; r++) { const d = w[idx(r, c)].die; if (d) dice.push(d) }
        if (dice.length === ROWS && new Set(dice.map(d => d.value)).size === ROWS) pts += 5
      }
      return pts
    },
  },
  {
    id: 'value-sets',
    name: 'Value Sets 1–6',
    desc: 'Each complete set of one die of every value 1 through 6 — 5 points each.',
    score: (w) => {
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
      for (const cell of w) if (cell.die) counts[cell.die.value]++
      const sets = Math.min(...[1, 2, 3, 4, 5, 6].map(v => counts[v]))
      return sets * 5
    },
  },
  {
    id: 'diag-color',
    name: 'Colour Diagonals',
    desc: 'Each die diagonally adjacent to a same-colour die — 1 point each.',
    score: (w) => {
      let pts = 0
      for (let i = 0; i < CELLS; i++) {
        const d = w[i].die
        if (!d) continue
        if (diagNeighbors(i).some(n => { const nd = w[n].die; return nd != null && nd.color === d.color })) pts++
      }
      return pts
    },
  },
]

// ---------------------------------------------------------------- placement rules
/**
 * Is `die` legally placeable at empty cell `i` of `w`?
 * - cell must be empty
 * - printed colour/value restriction must be satisfied
 * - if the window is empty so far, the cell must be an edge/corner
 * - otherwise the cell must be orthogonally adjacent to a placed die
 * - no orthogonal neighbour may share the die's colour or value
 */
export function canPlaceAt(w: Cell[], die: Die, i: number): boolean {
  const cell = w[i]
  if (cell.die != null) return false
  if (cell.reqColor != null && cell.reqColor !== die.color) return false
  if (cell.reqValue != null && cell.reqValue !== die.value) return false

  const empty = isWindowEmpty(w)
  if (empty) return isEdge(i)

  const neigh = orthNeighbors(i)
  let adjacentToDie = false
  for (const n of neigh) {
    const nd = w[n].die
    if (nd == null) continue
    adjacentToDie = true
    if (nd.color === die.color) return false
    if (nd.value === die.value) return false
  }
  return adjacentToDie
}

/** All cell indices at which `die` could legally be placed in `w`. */
export function legalPlacements(w: Cell[], die: Die): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) if (canPlaceAt(w, die, i)) out.push(i)
  return out
}

/** Can this die be placed anywhere at all in this window? */
export function canPlaceAnywhere(w: Cell[], die: Die): boolean {
  for (let i = 0; i < CELLS; i++) if (canPlaceAt(w, die, i)) return true
  return false
}

// ---------------------------------------------------------------- window setup
/**
 * Build a 5x4 window with a sprinkling of printed restrictions. Deterministic given
 * the rng. Roughly a third of cells carry a colour or value restriction; the rest are
 * open. Restrictions are kept loose enough that a full fill is always achievable.
 */
function makeWindow(rng: number): { window: Cell[]; rng: number } {
  const cells: Cell[] = []
  let r = rng
  for (let i = 0; i < CELLS; i++) {
    let reqColor: Color | null = null
    let reqValue: number | null = null
    const a = nextRng(r); r = a.rng
    if (a.v < 0.20) {
      const b = nextRng(r); r = b.rng
      reqColor = COLORS[Math.floor(b.v * COLORS.length) % COLORS.length]
    } else if (a.v < 0.38) {
      const b = nextRng(r); r = b.rng
      reqValue = 1 + (Math.floor(b.v * 6) % 6)
    }
    cells.push({ reqColor, reqValue, die: null })
  }
  return { window: cells, rng: r }
}

// ---------------------------------------------------------------- draft pool
/** Dice in a fresh pool for a round: 2 × players + 1 = 5. */
export const POOL_SIZE = 2 * 2 + 1

export function rollPool(rng: number): { pool: Die[]; rng: number } {
  const pool: Die[] = []
  let r = rng
  for (let i = 0; i < POOL_SIZE; i++) {
    const x = rollDie(r); r = x.rng
    pool.push(x.die)
  }
  return { pool, rng: r }
}

// ---------------------------------------------------------------- game setup
export interface Setup {
  seed?: number
  /** Optional fixed windows (for tests). */
  windows?: [Cell[], Cell[]]
  secret?: [Color, Color]
  publics?: PublicObjective[]
}

export function makeGame(setup: Setup = {}): SagradaState {
  let rng = (setup.seed ?? ((Math.random() * 4294967296) >>> 0)) >>> 0
  if (rng === 0) rng = 1

  let windows: [Cell[], Cell[]]
  if (setup.windows) {
    windows = [cloneWindow(setup.windows[0]), cloneWindow(setup.windows[1])]
  } else {
    const w0 = makeWindow(rng); rng = w0.rng
    const w1 = makeWindow(rng); rng = w1.rng
    windows = [w0.window, w1.window]
  }

  let secret: [Color, Color]
  if (setup.secret) {
    secret = setup.secret
  } else {
    const a = nextRng(rng); rng = a.rng
    const b = nextRng(rng); rng = b.rng
    secret = [
      COLORS[Math.floor(a.v * COLORS.length) % COLORS.length],
      COLORS[Math.floor(b.v * COLORS.length) % COLORS.length],
    ]
  }

  // Pick 3 distinct public objectives (deterministic).
  let publics: PublicObjective[]
  if (setup.publics) {
    publics = setup.publics
  } else {
    const order = [...ALL_PUBLICS]
    // Fisher-Yates with the rng so selection varies by seed.
    for (let i = order.length - 1; i > 0; i--) {
      const x = nextRng(rng); rng = x.rng
      const j = Math.floor(x.v * (i + 1))
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp
    }
    publics = order.slice(0, 3)
  }

  const pr = rollPool(rng); rng = pr.rng

  return {
    windows,
    pool: pr.pool,
    round: 1,
    secret,
    publics,
    turn: 0,
    picksThisRound: 0,
    scores: null,
    winner: null,
    step: 0,
    rng,
    log: [{ t: 'sys', x: 'Round 1 — draft a die and place it in your window.' }],
  }
}

// ---------------------------------------------------------------- snake order
/**
 * In a 2-player draft each round has 4 picks (each player drafts twice). Snake order:
 * picks go P0, P1, P1, P0. Returns whose turn it is at pick index 0..3.
 */
export function snakeTurn(pickIndex: number): Player {
  const seq: Player[] = [0, 1, 1, 0]
  return seq[pickIndex % seq.length]
}

const PICKS_PER_ROUND = 4

// ---------------------------------------------------------------- place / advance
/**
 * Draft `draftIndex` from the pool and place it at `cellIndex` for `player`. Returns
 * a new state. Illegal calls (wrong turn, bad index, illegal placement) return the
 * state unchanged.
 */
export function placeDie(s: SagradaState, player: Player, draftIndex: number, cellIndex: number): SagradaState {
  if (s.winner != null || s.scores != null) return s
  if (player !== s.turn) return s
  if (draftIndex < 0 || draftIndex >= s.pool.length) return s
  const die = s.pool[draftIndex]
  if (!canPlaceAt(s.windows[player], die, cellIndex)) return s

  const win = cloneWindow(s.windows[player])
  win[cellIndex] = { ...win[cellIndex], die: { ...die } }
  const windows: [Cell[], Cell[]] = player === 0 ? [win, s.windows[1]] : [s.windows[0], win]
  const pool = s.pool.slice(0, draftIndex).concat(s.pool.slice(draftIndex + 1))
  const who = player === 0 ? 'You' : 'AI'
  const log = push(s.log, player === 0 ? 'you' : 'ai', `${who} placed ${die.color} ${die.value}.`)

  return advance({ ...s, windows, pool, log, step: s.step + 1 })
}

/**
 * Skip the current player's pick (used when they cannot legally place any pooled die).
 * Removes one die from the pool (the first), without placing it.
 */
export function skipPick(s: SagradaState, player: Player): SagradaState {
  if (s.winner != null || s.scores != null) return s
  if (player !== s.turn) return s
  const pool = s.pool.length ? s.pool.slice(1) : s.pool
  const who = player === 0 ? 'You' : 'AI'
  const log = push(s.log, 'sys', `${who} could not place — pick skipped.`)
  return advance({ ...s, pool, log, step: s.step + 1 })
}

/** Whether `player` can legally place any die currently in the pool. */
export function hasLegalMove(s: SagradaState, player: Player): boolean {
  return s.pool.some(d => canPlaceAnywhere(s.windows[player], d))
}

/** Advance the snake counter; roll a new pool / end the game when a round completes. */
function advance(s: SagradaState): SagradaState {
  const picks = s.picksThisRound + 1
  if (picks < PICKS_PER_ROUND && s.pool.length > 0) {
    return { ...s, picksThisRound: picks, turn: snakeTurn(picks) }
  }
  // Round over (all picks done, or pool exhausted).
  if (s.round >= ROUNDS) {
    return finish(s)
  }
  const nextRound = s.round + 1
  const pr = rollPool(s.rng)
  const log = push(s.log, 'sys', `Round ${nextRound} — fresh dice rolled.`)
  return {
    ...s,
    round: nextRound,
    pool: pr.pool,
    rng: pr.rng,
    picksThisRound: 0,
    turn: snakeTurn(0),
    log,
  }
}

function finish(s: SagradaState): SagradaState {
  const s0 = scoreWindow(s, 0)
  const s1 = scoreWindow(s, 1)
  const scores: [number, number] = [s0.total, s1.total]
  const winner: Player = scores[0] >= scores[1] ? 0 : 1 // ties go to the human
  const log = push(s.log, 'sys', `Game over — You ${scores[0]}, AI ${scores[1]}.`)
  return { ...s, scores, winner, pool: [], step: s.step + 1, log }
}

// ---------------------------------------------------------------- scoring
export interface ScoreBreakdown {
  private: number
  publics: { name: string; pts: number }[]
  emptyPenalty: number
  total: number
}

/** Score a player's window: private (sum of secret-colour pips) + publics − empty cells. */
export function scoreWindow(s: SagradaState, player: Player): ScoreBreakdown {
  const w = s.windows[player]
  const secret = s.secret[player]
  let priv = 0
  for (const cell of w) if (cell.die && cell.die.color === secret) priv += cell.die.value
  const publics = s.publics.map(o => ({ name: o.name, pts: o.score(w) }))
  const empty = w.filter(c => c.die == null).length
  const total = priv + publics.reduce((a, b) => a + b.pts, 0) - empty
  return { private: priv, publics, emptyPenalty: empty, total }
}

// ---------------------------------------------------------------- AI
/**
 * Greedy AI: for each die in the pool, find the placement that most improves its
 * scored window (private + publics − empty), preferring its own secret colour and
 * keeping options open. Drafts the (die, cell) pair with the best marginal gain.
 */
export function aiBestMove(s: SagradaState, player: Player = 1): { draftIndex: number; cellIndex: number } | null {
  const w = s.windows[player]
  const secret = s.secret[player]
  const baseScore = evalWindow(s, w, secret)
  let best: { draftIndex: number; cellIndex: number } | null = null
  let bestGain = -Infinity

  for (let di = 0; di < s.pool.length; di++) {
    const die = s.pool[di]
    const cells = legalPlacements(w, die)
    for (const ci of cells) {
      const trial = cloneWindow(w)
      trial[ci] = { ...trial[ci], die: { ...die } }
      // +1 because filling a cell removes an empty-cell penalty; evalWindow handles empties.
      const gain = evalWindow(s, trial, secret) - baseScore
      // Tie-break: prefer placements that keep more future options (more open legal frontier).
      const tiebreak = openFrontier(trial) * 0.001
      const total = gain + tiebreak
      if (total > bestGain) { bestGain = total; best = { draftIndex: di, cellIndex: ci } }
    }
  }
  return best
}

/** Heuristic value of a window: publics + secret-pips − empty penalty. */
function evalWindow(s: SagradaState, w: Cell[], secret: Color): number {
  let priv = 0
  for (const cell of w) if (cell.die && cell.die.color === secret) priv += cell.die.value
  const pub = s.publics.reduce((a, o) => a + o.score(w), 0)
  const empty = w.filter(c => c.die == null).length
  return priv + pub - empty
}

/** Count of empty cells that are currently part of the placeable frontier (open options). */
function openFrontier(w: Cell[]): number {
  let n = 0
  for (let i = 0; i < CELLS; i++) {
    if (w[i].die != null) continue
    if (isWindowEmpty(w)) { if (isEdge(i)) n++; continue }
    if (orthNeighbors(i).some(nb => w[nb].die != null)) n++
  }
  return n
}

/** Perform one AI draft+place (or skip if nothing is placeable). */
export function aiTurn(s: SagradaState): SagradaState {
  if (s.winner != null || s.scores != null) return s
  if (s.turn !== 1) return s
  const move = aiBestMove(s, 1)
  if (move == null) return skipPick(s, 1)
  return placeDie(s, 1, move.draftIndex, move.cellIndex)
}

/** Convenience winner accessor. */
export function winner(s: SagradaState): Player | null { return s.winner }
