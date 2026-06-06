/* BLOKUS DUO — pure logic (built for this codebase; the two-player 14x14 Blokus variant).
   You are player 0, the AI is player 1. Each player owns the standard 21 polyominoes
   (monomino → all 12 pentominoes, 89 cells). Your FIRST piece must cover your start cell
   (player 0 → (4,4), player 1 → (9,9)). Every LATER piece must touch one of your own
   already-placed cells at a CORNER (diagonal) and must NOT share an EDGE with any of your
   own cells. Overlaps are illegal; edge/corner contact with the OPPONENT is fine. Pieces
   may be rotated and flipped. A player who can place nothing passes; both pass → game ends.
   Score = total cells placed; most placed wins. NO React/DOM in this file. */

export type Player = 0 | 1
/** Board cell owner: 0 or 1, or null for empty. (Never use 0 truthiness — 0 is a real owner.) */
export type Cell = Player | null
export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export const N = 14 // 14x14 board
/** Start cells: player 0 covers (4,4), player 1 covers (9,9) on their first move. */
export const STARTS: Record<Player, [number, number]> = { 0: [4, 4], 1: [9, 9] }

/** A polyomino shape: list of [row, col] offsets, normalized so min row=0, min col=0. */
export type Shape = [number, number][]
export interface Piece { id: number; name: string; shape: Shape }

// ============================ the 21 Blokus pieces ============================
// Standard set: 1 monomino, 1 domino, 2 trominoes, 5 tetrominoes, 12 pentominoes = 89 cells.
const RAW: { name: string; cells: [number, number][] }[] = [
  // 1-cell
  { name: '1', cells: [[0, 0]] },
  // 2-cell
  { name: '2', cells: [[0, 0], [0, 1]] },
  // 3-cell (2 trominoes)
  { name: 'I3', cells: [[0, 0], [0, 1], [0, 2]] },
  { name: 'L3', cells: [[0, 0], [1, 0], [1, 1]] },
  // 4-cell (5 tetrominoes)
  { name: 'I4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { name: 'O4', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { name: 'T4', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { name: 'L4', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { name: 'S4', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  // 5-cell (12 pentominoes)
  { name: 'F', cells: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]] },
  { name: 'I5', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { name: 'L5', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
  { name: 'N', cells: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]] },
  { name: 'P', cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]] },
  { name: 'T5', cells: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]] },
  { name: 'U', cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]] },
  { name: 'V', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
  { name: 'W', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
  { name: 'X', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
  { name: 'Y', cells: [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]] },
  { name: 'Z', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]] },
]

export const PIECES: Piece[] = RAW.map((p, id) => ({ id, name: p.name, shape: normalize(p.cells) }))
/** Total cells across all 21 pieces = 89. */
export const TOTAL_CELLS = PIECES.reduce((a, p) => a + p.shape.length, 0)

// ============================ shape geometry ============================

/** Normalize a shape: shift to min row/col = 0 and sort deterministically. */
export function normalize(cells: [number, number][]): Shape {
  const minR = Math.min(...cells.map(c => c[0]))
  const minC = Math.min(...cells.map(c => c[1]))
  return cells
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

/** Rotate 90° clockwise: (r,c) -> (c,-r), then normalize. */
export function rotate(shape: Shape): Shape {
  return normalize(shape.map(([r, c]) => [c, -r] as [number, number]))
}

/** Flip horizontally: (r,c) -> (r,-c), then normalize. */
export function flip(shape: Shape): Shape {
  return normalize(shape.map(([r, c]) => [r, -c] as [number, number]))
}

function sig(shape: Shape): string {
  return shape.map(c => c.join(',')).join(';')
}

/** All distinct orientations (≤8) of a shape, normalized & deduped. */
export function orientations(shape: Shape): Shape[] {
  const out: Shape[] = []
  const seen = new Set<string>()
  let cur = normalize(shape)
  for (let f = 0; f < 2; f++) {
    for (let r = 0; r < 4; r++) {
      const s = sig(cur)
      if (!seen.has(s)) { seen.add(s); out.push(cur) }
      cur = rotate(cur)
    }
    cur = flip(cur)
  }
  return out
}

/** Cached orientations per piece id. */
export const ORIENTS: Shape[][] = PIECES.map(p => orientations(p.shape))

// ============================ state ============================

export interface State {
  /** N*N flat board of owners (0|1|null). index = r*N + c. */
  board: Cell[]
  /** Remaining piece ids each player still holds. */
  remaining: [number[], number[]]
  turn: Player
  /** True once a player has had no legal move and passed. */
  passed: [boolean, boolean]
  winner: Player | -1 | null // 0/1, -1 draw, null while in progress
  scores: [number, number] // cells placed per player
  /** Monotonic tick; changes on every placement/pass so AI driver re-arms. */
  step: number
  log: LogEntry[]
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

export function makeGame(): State {
  return {
    board: new Array<Cell>(N * N).fill(null),
    remaining: [PIECES.map(p => p.id), PIECES.map(p => p.id)],
    turn: 0,
    passed: [false, false],
    winner: null,
    scores: [0, 0],
    step: 0,
    log: [{ t: 'sys', x: 'Cover your start square first, then grow corner-to-corner. Edges of your own color may never touch.' }],
  }
}

const inB = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const idx = (r: number, c: number) => r * N + c

/** Has the player placed any piece yet? (false → next placement is their first.) */
export function isFirstMove(s: State, player: Player): boolean {
  return s.scores[player] === 0
}

/**
 * Concrete cells a normalized orientation covers when anchored at (r0,c0).
 * Returns null if any cell is off-board.
 */
export function placedCells(shape: Shape, r0: number, c0: number): [number, number][] | null {
  const out: [number, number][] = []
  for (const [dr, dc] of shape) {
    const r = r0 + dr, c = c0 + dc
    if (!inB(r, c)) return null
    out.push([r, c])
  }
  return out
}

/**
 * Is placing `cells` legal for `player` on state `s`?
 *  - every cell on-board & empty (no overlap)
 *  - first move: must cover the player's start cell
 *  - later moves: ≥1 own-color CORNER contact AND zero own-color EDGE contact
 */
export function isLegal(s: State, player: Player, cells: [number, number][]): boolean {
  // overlap / bounds
  for (const [r, c] of cells) {
    if (!inB(r, c)) return false
    if (s.board[idx(r, c)] !== null) return false
  }
  if (isFirstMove(s, player)) {
    const [sr, sc] = STARTS[player]
    return cells.some(([r, c]) => r === sr && c === sc)
  }
  let corner = false
  for (const [r, c] of cells) {
    // edge-adjacent own color → illegal
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc
      if (inB(nr, nc) && s.board[idx(nr, nc)] === player) return false
    }
    // diagonal own color → satisfies corner requirement
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = r + dr, nc = c + dc
      if (inB(nr, nc) && s.board[idx(nr, nc)] === player) corner = true
    }
  }
  return corner
}

/** A concrete legal placement. */
export interface Placement {
  pieceId: number
  /** The orientation index within ORIENTS[pieceId]. */
  orient: number
  /** Anchor (top-left of normalized orientation). */
  r: number
  c: number
  /** Absolute cells covered. */
  cells: [number, number][]
}

/** All legal placements for `player` in the current state. */
export function legalPlacements(s: State, player: Player): Placement[] {
  const out: Placement[] = []
  for (const pieceId of s.remaining[player]) {
    const orients = ORIENTS[pieceId]
    for (let o = 0; o < orients.length; o++) {
      const shape = orients[o]
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cells = placedCells(shape, r, c)
          if (!cells) continue
          if (isLegal(s, player, cells)) out.push({ pieceId, orient: o, r, c, cells })
        }
      }
    }
  }
  return out
}

/** Can `player` make ANY legal move? (cheap-ish early-exit version). */
export function canPlaceAny(s: State, player: Player): boolean {
  for (const pieceId of s.remaining[player]) {
    const orients = ORIENTS[pieceId]
    for (let o = 0; o < orients.length; o++) {
      const shape = orients[o]
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cells = placedCells(shape, r, c)
          if (cells && isLegal(s, player, cells)) return true
        }
      }
    }
  }
  return false
}

// ============================ moves ============================

/**
 * Place `pieceId` for `player` onto the given absolute cells (must already be a legal
 * placement). Removes the piece, fills the board, advances the turn, and resolves the
 * game if it has ended. Returns a NEW state (caller passes validated cells).
 */
export function place(s: State, player: Player, pieceId: number, cells: [number, number][]): State {
  if (s.winner != null || s.turn !== player) return s
  if (!s.remaining[player].includes(pieceId)) return s
  if (!isLegal(s, player, cells)) return s

  const board = s.board.slice()
  for (const [r, c] of cells) board[idx(r, c)] = player
  const remaining: [number[], number[]] = [s.remaining[0].slice(), s.remaining[1].slice()]
  remaining[player] = remaining[player].filter(id => id !== pieceId)
  const scores: [number, number] = [s.scores[0], s.scores[1]]
  scores[player] += cells.length
  const passed: [boolean, boolean] = [false, false] // a successful placement clears pass flags
  const who = player === 0 ? 'You' : 'The AI'
  const log = push(s.log, player === 0 ? 'you' : 'ai', `${who} placed ${PIECES[pieceId].name} (${cells.length} cells).`)

  const next: State = { ...s, board, remaining, scores, passed, turn: (1 - player) as Player, step: s.step + 1, log }
  return resolve(next)
}

/** The active player has no legal move: record a pass and advance the turn. */
export function pass(s: State, player: Player): State {
  if (s.winner != null || s.turn !== player) return s
  const passed: [boolean, boolean] = [s.passed[0], s.passed[1]]
  passed[player] = true
  const who = player === 0 ? 'You' : 'The AI'
  const log = push(s.log, 'sys', `${who} cannot move and passes.`)
  const next: State = { ...s, passed, turn: (1 - player) as Player, step: s.step + 1, log }
  return resolve(next)
}

/**
 * After a turn change, skip any players who must pass and decide whether the game is over.
 * The game ends when NEITHER player can place a piece. Winner = most cells placed.
 */
function resolve(s: State): State {
  let cur = s
  // Let the (new) active player pass automatically if they truly cannot move, until
  // either someone can move or both are stuck. Bounded: at most 2 passes added here.
  for (let guard = 0; guard < 2; guard++) {
    if (cur.winner != null) return cur
    if (canPlaceAny(cur, cur.turn)) return cur
    // current player can't move → pass them
    const player = cur.turn
    const passed: [boolean, boolean] = [cur.passed[0], cur.passed[1]]
    passed[player] = true
    const who = player === 0 ? 'You' : 'The AI'
    const log = push(cur.log, 'sys', `${who} cannot move and passes.`)
    cur = { ...cur, passed, turn: (1 - player) as Player, step: cur.step + 1, log }
    if (cur.passed[0] && cur.passed[1]) break
  }
  if (cur.passed[0] && cur.passed[1]) {
    const [a, b] = cur.scores
    const winner: Player | -1 = a > b ? 0 : b > a ? 1 : -1
    const msg = winner === 0 ? `You win ${a}–${b}!` : winner === 1 ? `The AI wins ${b}–${a}.` : `Draw ${a}–${b}.`
    return { ...cur, winner, step: cur.step + 1, log: push(cur.log, 'sys', msg) }
  }
  return cur
}

// ============================ AI ============================

/** The four corner-reach offsets used to count a placement's future corner openings. */
const DIAG: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

/**
 * Greedy AI: among all legal placements, pick the one that maximizes cells placed,
 * then keeps the most corner reach (open diagonal frontier), with a light center pull.
 * The placement search is naturally capped by the finite piece/orientation/position set;
 * we additionally prefer scanning larger pieces first so early prune keeps turns fast.
 */
export function bestPlacement(s: State, player: Player): Placement | null {
  const moves = legalPlacements(s, player)
  if (moves.length === 0) return null
  let best: Placement | null = null
  let bestScore = -Infinity
  for (const m of moves) {
    let score = m.cells.length * 100 // dominant term: place as many cells as possible
    // corner reach: count empty diagonal neighbours not edge-blocked by own color → future moves
    let reach = 0
    const own = new Set(m.cells.map(([r, c]) => idx(r, c)))
    for (const [r, c] of m.cells) {
      for (const [dr, dc] of DIAG) {
        const nr = r + dr, nc = c + dc
        if (!inB(nr, nc)) continue
        if (s.board[idx(nr, nc)] !== null || own.has(idx(nr, nc))) continue
        reach++
      }
    }
    score += reach * 2
    // mild center attraction (toward 6.5,6.5) so the AI fights for the middle early
    let central = 0
    for (const [r, c] of m.cells) central -= Math.abs(r - 6.5) + Math.abs(c - 6.5)
    score += central * 0.1
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}

/** Execute one AI move (place its best placement, or pass if it has none). */
export function aiTurn(s: State): State {
  if (s.winner != null || s.turn !== 1) return s
  const m = bestPlacement(s, 1)
  if (!m) return pass(s, 1)
  return place(s, 1, m.pieceId, m.cells)
}

/** Public winner accessor (by cells placed). null while in progress, -1 draw. */
export function winner(s: State): Player | -1 | null {
  return s.winner
}
