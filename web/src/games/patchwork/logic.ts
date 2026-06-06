/* PATCHWORK — pure logic (built for this codebase; Uwe Rosenberg's quilt game).
   Two players (you=0, ai=1) race a shared time track 0..53 building a 9x9 quilt out of
   polyomino patches bought from a circular market. The player whose time token is FURTHER
   BACK moves next; ties broken by who arrived on the square most recently (on top). A
   player can take many consecutive turns. Final score = buttons - 2*empty quilt cells. */

export type Player = 0 | 1
export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export const END = 53
export const QN = 9 // quilt is 9x9
export const QCELLS = QN * QN // 81
/** Button-income spaces on the time track. */
export const INCOME_SPACES: number[] = [5, 11, 17, 23, 29, 35, 41, 47, 53]
const INCOME_SET = new Set(INCOME_SPACES)

/** A polyomino: list of [dr,dc] offsets, normalized so min row=0 and min col=0. */
export type Shape = [number, number][]

export interface Patch {
  id: number
  shape: Shape
  buttonCost: number
  timeCost: number
  income: number
  color: number // palette index for the UI
}

export interface PlayerState {
  pos: number
  /** Monotonic timestamp of the player's last arrival on its square (higher = more recent = on top). */
  arrival: number
  buttons: number
  /** 9x9 grid: -1 empty, otherwise the patch color index that fills the cell. */
  quilt: number[]
  income: number // sum of income of all patches placed (cached)
}

export interface State {
  players: [PlayerState, PlayerState]
  /** The circular market of remaining patches (in clockwise order). */
  market: Patch[]
  /** Index in `market` the neutral token points AT (the first of the next-3). */
  neutral: number
  /** Monotonic counter used both to stamp arrivals and as a generic move tick. */
  clock: number
  turn: Player | null // re-synced to toMove(s) after every change; null only when both done
  winner: Player | -1 | null // 0/1, or -1 for a draw, or null while in progress
  scores: [number, number] | null
  log: LogEntry[]
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// ============================ shapes & geometry ============================

/** Normalize a shape so min row=0, min col=0, and cells are sorted deterministically. */
export function normalize(cells: [number, number][]): Shape {
  const minR = Math.min(...cells.map(c => c[0]))
  const minC = Math.min(...cells.map(c => c[1]))
  return cells
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** Rotate a shape 90° clockwise: (r,c) -> (c, -r), then normalize. */
export function rotate(shape: Shape): Shape {
  return normalize(shape.map(([r, c]) => [c, -r] as [number, number]))
}

/** Flip a shape horizontally: (r,c) -> (r, -c), then normalize. */
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
 * The flat 9x9 cell indices a shape (already an orientation) covers when its
 * normalized origin is placed at anchor (r0,c0). Returns null if ANY cell falls
 * outside the 9x9 grid. index = row*9 + col.
 */
export function cellsFor(shape: Shape, r0: number, c0: number): number[] | null {
  const out: number[] = []
  for (const [dr, dc] of shape) {
    const r = r0 + dr
    const c = c0 + dc
    if (r < 0 || r >= QN || c < 0 || c >= QN) return null
    out.push(r * QN + c)
  }
  return out
}

/** Can this oriented shape be placed at (r0,c0) on the given quilt (in-bounds + no overlap)? */
export function canPlace(quilt: number[], shape: Shape, r0: number, c0: number): boolean {
  const cells = cellsFor(shape, r0, c0)
  if (cells === null) return false
  for (const idx of cells) if (quilt[idx] !== -1) return false
  return true
}

export interface Placement {
  orientation: number // index into orientations(patch.shape)
  shape: Shape
  r0: number
  c0: number
  cells: number[]
}

/** Every legal placement of a patch's shape on a quilt, across all orientations & anchors. */
export function placementsFor(quilt: number[], shape: Shape): Placement[] {
  const out: Placement[] = []
  const ors = orientations(shape)
  ors.forEach((sh, oi) => {
    for (let r0 = 0; r0 < QN; r0++) {
      for (let c0 = 0; c0 < QN; c0++) {
        const cells = cellsFor(sh, r0, c0)
        if (cells === null) continue
        let ok = true
        for (const idx of cells) if (quilt[idx] !== -1) { ok = false; break }
        if (ok) out.push({ orientation: oi, shape: sh, r0, c0, cells })
      }
    }
  })
  return out
}

/** Does the patch fit anywhere on this quilt at all? */
export function fitsSomewhere(quilt: number[], shape: Shape): boolean {
  for (const sh of orientations(shape)) {
    for (let r0 = 0; r0 < QN; r0++)
      for (let c0 = 0; c0 < QN; c0++)
        if (canPlace(quilt, sh, r0, c0)) return true
  }
  return false
}

// ============================ turn model ============================

/**
 * SINGLE SOURCE OF TRUTH for whose turn it is, computed fresh from positions + arrival.
 * - Player further BACK (smaller pos) moves next.
 * - On a tie, the one who arrived MORE RECENTLY (higher arrival = on top) moves.
 * - Returns null ONLY when BOTH tokens have reached END.
 */
export function toMove(s: State): Player | null {
  const a = s.players[0]
  const b = s.players[1]
  if (a.pos >= END && b.pos >= END) return null
  if (a.pos < b.pos) return 0
  if (b.pos < a.pos) return 1
  // same position: the one on top (more recent arrival) moves
  return a.arrival >= b.arrival ? 0 : 1
}

// ============================ patch set ============================

/** Fixed, deterministic ~25-patch market with variety in size/cost/time/income. */
export function makePatches(): Patch[] {
  // raw definitions: [cells, buttonCost, timeCost, income]
  const defs: { cells: [number, number][]; b: number; t: number; i: number }[] = [
    { cells: [[0, 0]], b: 1, t: 1, i: 0 },                                   // 1x1
    { cells: [[0, 0], [0, 1]], b: 2, t: 2, i: 0 },                           // domino
    { cells: [[0, 0], [0, 1], [0, 2]], b: 2, t: 2, i: 0 },                   // I-tromino
    { cells: [[0, 0], [0, 1], [1, 0]], b: 3, t: 1, i: 1 },                   // L-tromino, income
    { cells: [[0, 0], [0, 1], [1, 1]], b: 1, t: 3, i: 0 },                   // L-tromino
    { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], b: 3, t: 3, i: 1 },           // I-tetromino
    { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], b: 6, t: 5, i: 2 },           // square, rich
    { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], b: 7, t: 1, i: 3 },           // S-tetromino, rich
    { cells: [[0, 1], [1, 0], [1, 1], [1, 2]], b: 2, t: 2, i: 0 },           // T-tetromino
    { cells: [[0, 0], [1, 0], [1, 1], [1, 2]], b: 4, t: 6, i: 2 },           // L-tetromino
    { cells: [[0, 2], [1, 0], [1, 1], [1, 2]], b: 4, t: 2, i: 1 },           // J-tetromino
    { cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]], b: 5, t: 4, i: 1 },   // P-pentomino
    { cells: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]], b: 3, t: 6, i: 2 },   // T-pentomino
    { cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], b: 5, t: 3, i: 1 },   // L-pentomino
    { cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], b: 5, t: 5, i: 2 },   // plus-pentomino
    { cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]], b: 3, t: 4, i: 0 },   // W-pentomino
    { cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], b: 7, t: 1, i: 1 },   // I-pentomino long
    { cells: [[0, 0], [0, 1], [1, 0]], b: 2, t: 1, i: 0 },                   // small L
    { cells: [[0, 0], [0, 1], [0, 2], [1, 2]], b: 1, t: 2, i: 0 },           // J-tetromino cheap
    { cells: [[0, 0], [1, 0], [1, 1]], b: 4, t: 2, i: 1 },                   // V-tromino income
    { cells: [[0, 0], [0, 1], [1, 0], [2, 0]], b: 6, t: 4, i: 2 },           // L4 rich
    { cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], b: 2, t: 3, i: 0 },   // U-pentomino
    { cells: [[0, 0], [0, 1]], b: 1, t: 1, i: 0 },                           // domino cheap fast
    { cells: [[0, 0], [0, 1], [0, 2], [1, 0]], b: 3, t: 3, i: 1 },           // L-tetromino income
    { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], b: 5, t: 2, i: 1 },           // S-tetromino tall
    { cells: [[0, 0]], b: 2, t: 0, i: 0 },                                   // 1x1 instant
  ]
  return defs.map((d, idx) => ({
    id: idx,
    shape: normalize(d.cells),
    buttonCost: d.b,
    timeCost: d.t,
    income: d.i,
    color: idx % 8,
  }))
}

// simple deterministic-enough shuffle seeded by a number (keeps tests reproducible if needed)
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let s = seed >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp
  }
  return a
}

export function makeGame(seed = 1): State {
  const market = shuffle(makePatches(), seed)
  const blankQuilt = (): number[] => new Array(QCELLS).fill(-1)
  const mk = (): PlayerState => ({ pos: 0, arrival: 0, buttons: 5, quilt: blankQuilt(), income: 0 })
  const s: State = {
    players: [mk(), mk()],
    market,
    neutral: 0,
    clock: 0,
    turn: 0,
    winner: null,
    scores: null,
    log: [{ t: 'sys', x: 'Build a 9x9 quilt. Advance for buttons, or buy a patch and place it. Fewest empty squares wins.' }],
  }
  // player 0 starts on top (arrival 0 == 0, tie goes to player 0 by toMove)
  s.turn = toMove(s)
  return s
}

// ============================ market helpers ============================

/** The next 3 patches clockwise from the neutral token. */
export function nextThree(s: State): Patch[] {
  const out: Patch[] = []
  const m = s.market
  if (m.length === 0) return out
  for (let k = 0; k < 3 && k < m.length; k++) {
    out.push(m[(s.neutral + k) % m.length])
  }
  return out
}

/** Find the absolute market index of a patch id (or -1). */
function marketIndexOfId(s: State, patchId: number): number {
  return s.market.findIndex(p => p.id === patchId)
}

/** Is this patch among the next-3 AND buyable (affordable + fits) for the player? */
export function canBuy(s: State, player: Player, patchId: number): boolean {
  const three = nextThree(s)
  const patch = three.find(p => p.id === patchId)
  if (!patch) return false
  const pl = s.players[player]
  if (pl.buttons < patch.buttonCost) return false
  return fitsSomewhere(pl.quilt, patch.shape)
}

// ============================ moves ============================

/** Award button income for each income-space the player crosses moving from->to (inclusive of `to`). */
function applyIncome(pl: PlayerState, from: number, to: number): number {
  if (to <= from) return 0
  let earned = 0
  for (let sp = from + 1; sp <= to; sp++) {
    if (INCOME_SET.has(sp)) earned += pl.income
  }
  pl.buttons += earned
  return earned
}

function cloneState(s: State): State {
  return {
    players: [
      { ...s.players[0], quilt: s.players[0].quilt.slice() },
      { ...s.players[1], quilt: s.players[1].quilt.slice() },
    ],
    market: s.market.slice(),
    neutral: s.neutral,
    clock: s.clock,
    turn: s.turn,
    winner: s.winner,
    scores: s.scores,
    log: s.log,
  }
}

/** Re-sync turn from positions, and finalize the game if both tokens are done. */
function resync(s: State): State {
  const mv = toMove(s)
  s.turn = mv
  if (mv === null && s.winner === null) {
    finalize(s)
  }
  return s
}

function finalize(s: State): void {
  const s0 = scoreOf(s, 0)
  const s1 = scoreOf(s, 1)
  s.scores = [s0, s1]
  s.winner = s0 > s1 ? 0 : s1 > s0 ? 1 : -1
  const msg = s.winner === 0 ? `You win ${s0} to ${s1}.`
    : s.winner === 1 ? `AI wins ${s1} to ${s0}.`
      : `Draw at ${s0} apiece.`
  s.log = push(s.log, 'sys', msg)
}

/** Final score for a player: buttons - 2*(empty quilt cells). */
export function scoreOf(s: State, player: Player): number {
  const pl = s.players[player]
  let empty = 0
  for (let i = 0; i < QCELLS; i++) if (pl.quilt[i] === -1) empty++
  return pl.buttons - 2 * empty
}

/** Count empty cells on a quilt. */
export function emptyCells(quilt: number[]): number {
  let e = 0
  for (let i = 0; i < QCELLS; i++) if (quilt[i] === -1) e++
  return e
}

/**
 * MOVE (a): advance & receive buttons. Move token to opponent_pos+1 (>=1 space,
 * capped at END), gaining buttons = spaces moved, plus any income spaces crossed.
 */
export function advance(s: State, player: Player): State {
  if (s.winner !== null) return s
  if (toMove(s) !== player) return s
  const ns = cloneState(s)
  const me = ns.players[player]
  const opp = ns.players[player ^ 1]
  const from = me.pos
  let to = opp.pos + 1
  if (to > END) to = END
  if (to <= from) to = Math.min(from + 1, END) // always advance at least 1 (still capped)
  const moved = to - from
  me.pos = to
  ns.clock += 1
  me.arrival = ns.clock
  me.buttons += moved
  const inc = applyIncome(me, from, to)
  ns.log = push(ns.log, player === 0 ? 'you' : 'ai',
    `${player === 0 ? 'You' : 'AI'} advanced ${moved} for ${moved} button${moved === 1 ? '' : 's'}${inc ? ` (+${inc} income)` : ''}.`)
  return resync(ns)
}

/**
 * MOVE (b): buy a patch (must be in next-3, affordable, placeable) and place it.
 * `orientation` indexes orientations(patch.shape); anchor is (r0,c0).
 */
export function buyPlace(s: State, player: Player, patchId: number, r0: number, c0: number, orientation: number): State {
  if (s.winner !== null) return s
  if (toMove(s) !== player) return s
  const three = nextThree(s)
  const patch = three.find(p => p.id === patchId)
  if (!patch) return s
  const me = s.players[player]
  if (me.buttons < patch.buttonCost) return s
  const ors = orientations(patch.shape)
  const sh = ors[orientation]
  if (!sh) return s
  if (!canPlace(me.quilt, sh, r0, c0)) return s
  const cells = cellsFor(sh, r0, c0)
  if (cells === null) return s

  const ns = cloneState(s)
  const meN = ns.players[player]
  // pay
  meN.buttons -= patch.buttonCost
  // place
  for (const idx of cells) meN.quilt[idx] = patch.color
  meN.income += patch.income
  // remove from market and move neutral to just after the taken patch
  const absIdx = marketIndexOfId(ns, patchId)
  ns.market.splice(absIdx, 1)
  if (ns.market.length === 0) {
    ns.neutral = 0
  } else {
    // neutral points at the patch that was immediately after the taken one;
    // since we removed index absIdx, that successor now sits at absIdx % newLen.
    ns.neutral = absIdx % ns.market.length
  }
  // advance time
  const from = meN.pos
  let to = from + patch.timeCost
  if (to > END) to = END
  meN.pos = to
  ns.clock += 1
  meN.arrival = ns.clock
  const inc = applyIncome(meN, from, to)
  ns.log = push(ns.log, player === 0 ? 'you' : 'ai',
    `${player === 0 ? 'You' : 'AI'} bought a patch (-${patch.buttonCost}b, +${patch.timeCost}t)${inc ? `, +${inc} income` : ''}.`)
  return resync(ns)
}

// ============================ AI ============================

/** Best legal placement for a patch on a quilt, scoring tight packing (prefer top-left fill). */
function bestPlacement(quilt: number[], shape: Shape): Placement | null {
  const ps = placementsFor(quilt, shape)
  if (ps.length === 0) return null
  let best: Placement | null = null
  let bestScore = Infinity
  for (const p of ps) {
    // prefer low row/col sum -> packs toward a corner, leaving open contiguous space
    let s = 0
    for (const idx of p.cells) { const r = Math.floor(idx / QN), c = idx % QN; s += r * QN + c }
    if (s < bestScore) { bestScore = s; best = p }
  }
  return best
}

/**
 * One AI turn (player 1). Heuristic: evaluate buyable next-3 patches by coverage per
 * button and income value; buy the best if it's worthwhile, else advance for buttons.
 * Always returns a state where the AI actually moved (so the tick changes).
 */
export function aiTurn(s: State): State {
  if (s.winner !== null) return s
  if (toMove(s) !== 1) return s
  const me = s.players[1]
  const three = nextThree(s)

  let bestId = -1
  let bestVal = -Infinity
  let bestPl: Placement | null = null

  const lateGame = me.pos >= 35 // past most income spaces

  for (const patch of three) {
    if (me.buttons < patch.buttonCost) continue
    const pl = bestPlacement(me.quilt, patch.shape)
    if (pl === null) continue
    const area = patch.shape.length
    // value: coverage reduces -2/empty penalty (worth ~2 each), minus button cost,
    // plus income value (each income button pays roughly per remaining income space),
    // minus a small time-cost aversion.
    const incomeSpacesLeft = INCOME_SPACES.filter(sp => sp > me.pos).length
    const coverageVal = area * 2
    const incomeVal = lateGame ? patch.income * 1 : patch.income * Math.min(incomeSpacesLeft, 4)
    const timePenalty = patch.timeCost * 0.4
    const val = coverageVal + incomeVal - patch.buttonCost - timePenalty
    if (val > bestVal) { bestVal = val; bestId = patch.id; bestPl = pl }
  }

  // Buy if worthwhile and we keep some button reserve; otherwise advance.
  const lowOnButtons = me.buttons <= 1
  if (bestId !== -1 && bestPl !== null && bestVal > 0 && !lowOnButtons) {
    return buyPlace(s, 1, bestId, bestPl.r0, bestPl.c0, bestPl.orientation)
  }
  return advance(s, 1)
}

/** Convenience: a list of legal placements for the player for a given patch id in the market. */
export function legalPlacements(s: State, player: Player, patchId: number): Placement[] {
  const three = nextThree(s)
  const patch = three.find(p => p.id === patchId)
  if (!patch) return []
  return placementsFor(s.players[player].quilt, patch.shape)
}
