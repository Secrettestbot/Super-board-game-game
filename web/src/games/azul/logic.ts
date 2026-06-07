/* AZUL — pure logic (built for this codebase, not ported).
   A 2-player tile-drafting game. You are player 0, the AI is player 1. Each round, five
   factory displays are filled with four tiles each from the bag; players alternate taking
   ALL tiles of one color from one factory (the rest slide to the center) or from the center.
   The first to take from the center this round grabs the first-player marker plus a floor
   penalty and leads next round. Taken tiles fill one pattern line (overflow drops to the
   floor). When the table empties, complete pattern lines push their rightmost tile to the
   wall, scoring for adjacency. Finish a full wall row to end the game; bonuses for rows,
   columns, and complete colors decide the winner. */

export const COLORS = 5
export const N_FACTORIES = 5            // 2-player count
export const TILES_PER_FACTORY = 4
export const PATTERN_LINES = 5

/** Color order used by the fixed wall pattern. 0..4 (azulejo blue/yellow/red/black/teal). */
export type Color = number

/** Floor-line penalty schedule (index = slot 0..6+). */
export const FLOOR_PENALTIES = [-1, -1, -2, -2, -2, -3, -3]

/** Fixed Azul wall: cell (row r, col) holds color (col - r + COLORS) % COLORS. Equivalently a
 *  color c in row r lands in column (c + r) % COLORS. */
export function wallColumnFor(row: number, color: Color): number {
  return (color + row) % COLORS
}
export function wallColorAt(row: number, col: number): Color {
  return (col - row + COLORS * COLORS) % COLORS
}

export interface PlayerBoard {
  /** pattern[row] = { color, count } where row holds row+1 slots. color = -1 when empty. */
  pattern: { color: Color; count: number }[]
  /** wall[row][col] = true when a tile is placed. */
  wall: boolean[][]
  /** floor line: list of tiles (color values) plus possibly the first-player marker (-1). */
  floor: number[]
  score: number
}

export interface Move {
  /** Source: a factory index 0..N-1, or 'center'. */
  source: number | 'center'
  color: Color
  /** Destination pattern line 0..4, or 'floor' to dump straight to the floor. */
  line: number | 'floor'
}

export type Winner = 0 | 1 | 'tie' | null

export interface State {
  factories: Color[][]          // each factory: array of color values (≤4)
  center: Color[]               // tiles in the center
  centerHasFirst: boolean       // is the first-player marker still in the center?
  bag: Color[]                  // draw pile
  lid: Color[]                  // discard pile (refills bag when empty)
  boards: [PlayerBoard, PlayerBoard]
  turn: 0 | 1                   // whose turn to draft
  firstNext: 0 | 1              // who leads the next round (set when marker is taken)
  round: number
  winner: Winner
  /** Monotonic counter — bumps on every applied move so the AI driver re-arms across rounds. */
  step: number
  log: { t: string; x: string }[]
}

const FIRST_MARKER = -1

function push(log: { t: string; x: string }[], t: string, x: string) {
  return log.concat([{ t, x }]).slice(-30)
}

function blankBoard(): PlayerBoard {
  return {
    pattern: Array.from({ length: PATTERN_LINES }, () => ({ color: -1, count: 0 })),
    wall: Array.from({ length: PATTERN_LINES }, () => Array.from({ length: COLORS }, () => false)),
    floor: [],
    score: 0,
  }
}

/** A deterministic, seeded shuffle (mulberry32) so tests get a fixed bag. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let s = seed >>> 0
  const rnd = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Full bag: 20 tiles of each of the 5 colors. */
function fullBag(): Color[] {
  const bag: Color[] = []
  for (let c = 0; c < COLORS; c++) for (let k = 0; k < 20; k++) bag.push(c)
  return bag
}

/**
 * Create a new game. Pass an optional pre-built bag (a flat color array) for deterministic
 * tests; otherwise a randomly seeded bag is built. Factories are filled for round 1.
 */
export function makeGame(optionalBag?: Color[]): State {
  const bag = optionalBag ? optionalBag.slice() : shuffle(fullBag(), (Math.random() * 1e9) | 0)
  const s: State = {
    factories: [],
    center: [],
    centerHasFirst: true,
    bag,
    lid: [],
    boards: [blankBoard(), blankBoard()],
    turn: 0,
    firstNext: 0,
    round: 1,
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Draft tiles of one color from a factory or the center onto your pattern lines. Complete lines tile your wall. Finish a full row to end the game.' }],
  }
  fillFactories(s)
  s.log = push(s.log, 'sys', 'Round 1 — factories filled.')
  return s
}

/** Draw one tile from the bag, refilling from the lid (discards) when empty. */
function drawTile(s: State): Color | null {
  if (s.bag.length === 0) {
    if (s.lid.length === 0) return null
    s.bag = shuffle(s.lid, ((s.round * 2654435761) ^ s.step) >>> 0)
    s.lid = []
  }
  return s.bag.pop() ?? null
}

/** Fill all factories with up to 4 tiles each from the bag. Mutates s. */
function fillFactories(s: State) {
  s.factories = []
  for (let f = 0; f < N_FACTORIES; f++) {
    const fac: Color[] = []
    for (let k = 0; k < TILES_PER_FACTORY; k++) {
      const t = drawTile(s)
      if (t == null) break
      fac.push(t)
    }
    s.factories.push(fac)
  }
  s.center = []
  s.centerHasFirst = true
}

/** Is the table empty (all factories + center drained)? Marks the end of a round. */
export function tableEmpty(s: State): boolean {
  return s.factories.every(f => f.length === 0) && s.center.length === 0
}

/** All distinct colors available from a source array. */
function colorsIn(src: Color[]): Color[] {
  const set = new Set<Color>()
  for (const c of src) if (c >= 0) set.add(c)
  return Array.from(set).sort((a, b) => a - b)
}

/**
 * Can `count` tiles of `color` legally begin/continue pattern line `row` on this board?
 * Rules: the line must not already hold a different color; the color must not already be
 * on the wall in that row; and a partly-filled line keeps its color.
 */
export function canPlaceOnLine(b: PlayerBoard, row: number, color: Color): boolean {
  if (row < 0 || row >= PATTERN_LINES) return false
  const pl = b.pattern[row]
  if (b.wall[row][wallColumnFor(row, color)]) return false       // color already walled in this row
  if (pl.count > 0 && pl.color !== color) return false            // line locked to another color
  if (pl.count >= row + 1) return false                          // line already full
  return true
}

/** The legal destination lines (0..4) for taking `color`, plus 'floor' is always legal. */
export function legalLinesFor(b: PlayerBoard, color: Color): (number | 'floor')[] {
  const lines: (number | 'floor')[] = []
  for (let r = 0; r < PATTERN_LINES; r++) if (canPlaceOnLine(b, r, color)) lines.push(r)
  lines.push('floor')
  return lines
}

/** Enumerate every legal move for the player to act. */
export function legalMoves(s: State): Move[] {
  if (s.winner != null) return []
  const b = s.boards[s.turn]
  const moves: Move[] = []
  const sources: (number | 'center')[] = s.factories.map((_, i) => i)
  sources.push('center')
  for (const src of sources) {
    const arr = src === 'center' ? s.center : s.factories[src]
    if (arr.length === 0) continue
    for (const color of colorsIn(arr)) {
      for (const line of legalLinesFor(b, color)) moves.push({ source: src, color, line })
    }
  }
  return moves
}

/** Drop a list of tiles onto a board's floor line (extra slots beyond 7 still tracked but capped on scoring). */
function addToFloor(b: PlayerBoard, tiles: number[]) {
  for (const t of tiles) b.floor.push(t)
}

/**
 * Apply a drafting move. Returns a NEW state (pure — does not mutate the input).
 * Takes all tiles of move.color from the source; rest of a factory slides to the center.
 * Placed tiles fill the chosen line; overflow (or a 'floor' move) goes to the floor.
 * When the table empties, end-of-round scoring + refill run automatically.
 */
export function applyMove(s: State, move: Move): State {
  if (s.winner != null) return s
  const n = clone(s)
  const player = n.turn
  const b = n.boards[player]

  const srcArr = move.source === 'center' ? n.center : n.factories[move.source]
  const taken = srcArr.filter(c => c === move.color)
  if (taken.length === 0) return s // illegal — no such color at source; ignore

  const who = player === 0 ? 'You' : 'Rival'

  if (move.source === 'center') {
    // Remove taken color from center; first-from-center grabs the marker + floor penalty.
    n.center = srcArr.filter(c => c !== move.color)
    if (n.centerHasFirst) {
      n.centerHasFirst = false
      n.firstNext = player
      b.floor.push(FIRST_MARKER)
      n.log = push(n.log, player === 0 ? 'you' : 'ai', `${who} took the first-player marker.`)
    }
  } else {
    // From a factory: rest of the factory slides into the center.
    const rest = srcArr.filter(c => c !== move.color)
    n.factories[move.source] = []
    n.center = n.center.concat(rest)
  }

  // Place onto the pattern line (or straight to the floor).
  let placed = 0
  let overflow = taken.length
  if (move.line !== 'floor' && canPlaceOnLine(b, move.line, move.color)) {
    const row = move.line
    const pl = b.pattern[row]
    pl.color = move.color
    const capacity = (row + 1) - pl.count
    placed = Math.min(capacity, taken.length)
    pl.count += placed
    overflow = taken.length - placed
  }
  if (overflow > 0) addToFloor(b, Array.from({ length: overflow }, () => move.color))

  const colName = COLOR_NAMES[move.color]
  const dest = move.line === 'floor' ? 'the floor' : `line ${(move.line as number) + 1}`
  n.log = push(n.log, player === 0 ? 'you' : 'ai', `${who} took ${taken.length}× ${colName} → ${dest}.`)

  n.step += 1

  if (tableEmpty(n)) {
    endRoundScoring(n)
  } else {
    n.turn = (player === 0 ? 1 : 0) as 0 | 1
  }
  return n
}

/**
 * End-of-round resolution (mutates the passed state): wall-tile every complete pattern line,
 * scoring adjacency; discard leftover pattern tiles; apply floor penalties; reset floors. Then
 * either declare the winner (a player completed a full wall row) or start the next round.
 */
export function endRoundScoring(s: State): State {
  for (let p = 0; p < 2; p++) {
    const b = s.boards[p as 0 | 1]
    for (let r = 0; r < PATTERN_LINES; r++) {
      const pl = b.pattern[r]
      if (pl.count === r + 1 && pl.color >= 0) {
        const col = wallColumnFor(r, pl.color)
        b.wall[r][col] = true
        b.score += tileScore(b.wall, r, col)
        // leftover (row tiles beyond the one moved) go to the lid.
        for (let k = 0; k < r; k++) s.lid.push(pl.color)
        b.pattern[r] = { color: -1, count: 0 }
      }
    }
    // Floor penalties.
    let pen = 0
    for (let i = 0; i < b.floor.length; i++) pen += FLOOR_PENALTIES[Math.min(i, FLOOR_PENALTIES.length - 1)]
    b.score = Math.max(0, b.score + pen)
    // Floor tiles (real colors) to the lid; the first-player marker just disappears.
    for (const t of b.floor) if (t >= 0) s.lid.push(t)
    b.floor = []
  }

  // Game end: any player completed a full horizontal wall row.
  const ended = s.boards.some(b => b.wall.some(row => row.every(cell => cell)))
  if (ended) {
    finalBonuses(s)
    const a = s.boards[0].score, c = s.boards[1].score
    s.winner = a > c ? 0 : c > a ? 1 : 'tie'
    s.log = push(s.log, 'sys', `Game over — final ${a} vs ${c}.`)
    return s
  }

  s.round += 1
  s.turn = s.firstNext
  fillFactories(s)
  s.step += 1
  s.log = push(s.log, 'sys', `Round ${s.round} — factories filled.`)
  return s
}

/** Adjacency score for a freshly placed wall tile at (row,col): 1 + contiguous H + contiguous V
 *  neighbors. A lone tile scores 1 (it is counted once via whichever run, never double). */
export function tileScore(wall: boolean[][], row: number, col: number): number {
  // Horizontal run length through (row,col).
  let h = 1
  for (let c = col - 1; c >= 0 && wall[row][c]; c--) h++
  for (let c = col + 1; c < COLORS && wall[row][c]; c++) h++
  // Vertical run length through (row,col).
  let v = 1
  for (let r = row - 1; r >= 0 && wall[r][col]; r--) v++
  for (let r = row + 1; r < PATTERN_LINES && wall[r][col]; r++) v++
  if (h > 1 && v > 1) return h + v          // tile counted in both runs
  if (h > 1) return h
  if (v > 1) return v
  return 1                                   // lone tile
}

/** Apply end-of-game bonuses to both boards (mutates): +2 per full row, +7 per full column,
 *  +10 per color placed all 5 times. */
export function finalBonuses(s: State): State {
  for (let p = 0; p < 2; p++) {
    const b = s.boards[p as 0 | 1]
    // Rows.
    for (let r = 0; r < PATTERN_LINES; r++) if (b.wall[r].every(c => c)) b.score += 2
    // Columns.
    for (let col = 0; col < COLORS; col++) {
      let full = true
      for (let r = 0; r < PATTERN_LINES; r++) if (!b.wall[r][col]) { full = false; break }
      if (full) b.score += 7
    }
    // Colors (each color appears once per row at its shifted column → count placements of each color).
    for (let color = 0; color < COLORS; color++) {
      let count = 0
      for (let r = 0; r < PATTERN_LINES; r++) if (b.wall[r][wallColumnFor(r, color)]) count++
      if (count === COLORS) b.score += 10
    }
  }
  return s
}

/** Overall winner once decided (0, 1, 'tie', or null mid-game). */
export function winner(s: State): Winner {
  return s.winner
}

// ===================== AI: greedy heuristic =====================

/**
 * Score a candidate move for the acting player without committing it: estimate the wall value
 * gained when the line eventually completes, reward progress toward completing the line this
 * round, and subtract the floor penalty incurred by overflow / the first-player marker.
 */
function evalMove(s: State, move: Move): number {
  const b = s.boards[s.turn]
  const srcArr = move.source === 'center' ? s.center : s.factories[move.source]
  const taken = srcArr.filter(c => c === move.color).length
  if (taken === 0) return -Infinity

  let value = 0
  let overflow = taken
  const takesMarker = move.source === 'center' && s.centerHasFirst

  if (move.line !== 'floor' && canPlaceOnLine(b, move.line, move.color)) {
    const row = move.line
    const pl = b.pattern[row]
    const capacity = (row + 1) - pl.count
    const placed = Math.min(capacity, taken)
    overflow = taken - placed
    const newCount = pl.count + placed

    // Estimate where this color lands on the wall and its adjacency value if completed now.
    const col = wallColumnFor(row, move.color)
    const projected = b.wall.map(r => r.slice())
    projected[row][col] = true
    const wallVal = tileScore(projected, row, col)

    if (newCount === row + 1) {
      // Completes the line this round — banks the wall value plus a tidy bonus for closing it.
      value += wallVal + 2
    } else {
      // Partial progress: fraction of the wall value, weighted by how much closer we got, and
      // a small bonus for not wasting capacity (prefer filling shorter lines exactly).
      value += wallVal * (placed / (row + 1)) * 0.6
      value += placed * 0.4
    }
    // Mild preference for filling a line snugly (less future overflow risk).
    value += (placed - 0.01 * row)
  }

  // Floor penalty for overflow tiles + (possibly) the first-player marker.
  const floorBase = b.floor.length
  let penalty = 0
  const dumped = overflow + (takesMarker ? 1 : 0)
  for (let i = 0; i < dumped; i++) {
    penalty += -FLOOR_PENALTIES[Math.min(floorBase + i, FLOOR_PENALTIES.length - 1)]
  }
  value -= penalty

  // Taking the marker has positional value (leads next round) but we keep it small.
  if (takesMarker) value += 0.5

  return value
}

/** Choose the AI's best move (greedy over evalMove). Returns null if no legal move. */
export function aiChoose(s: State): Move | null {
  const moves = legalMoves(s)
  if (moves.length === 0) return null
  let best = moves[0], bestVal = -Infinity
  for (const m of moves) {
    const v = evalMove(s, m)
    if (v > bestVal) { bestVal = v; best = m }
  }
  return best
}

/** Apply the AI's chosen move. No-op if it isn't the AI's turn or the game is over. */
export function aiTurn(s: State): State {
  if (s.winner != null || s.turn !== 1) return s
  const m = aiChoose(s)
  if (m == null) return s
  return applyMove(s, m)
}

// ===================== helpers =====================

export const COLOR_NAMES = ['blue', 'yellow', 'red', 'black', 'teal']

/** Total number of physical tiles tracked anywhere in the state (for conservation tests). */
export function tileCount(s: State): number {
  let n = 0
  n += s.bag.length + s.lid.length + s.center.length
  for (const f of s.factories) n += f.length
  for (const b of s.boards) {
    for (const pl of b.pattern) n += pl.count
    for (const row of b.wall) for (const cell of row) if (cell) n += 1
    for (const t of b.floor) if (t >= 0) n += 1   // first-player marker (-1) is not a tile
  }
  return n
}

function clone(s: State): State {
  return {
    factories: s.factories.map(f => f.slice()),
    center: s.center.slice(),
    centerHasFirst: s.centerHasFirst,
    bag: s.bag.slice(),
    lid: s.lid.slice(),
    boards: [cloneBoard(s.boards[0]), cloneBoard(s.boards[1])],
    turn: s.turn,
    firstNext: s.firstNext,
    round: s.round,
    winner: s.winner,
    step: s.step,
    log: s.log.slice(),
  }
}
function cloneBoard(b: PlayerBoard): PlayerBoard {
  return {
    pattern: b.pattern.map(p => ({ ...p })),
    wall: b.wall.map(r => r.slice()),
    floor: b.floor.slice(),
    score: b.score,
  }
}
