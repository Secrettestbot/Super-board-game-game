/* ALQUERQUE — logic (built for this codebase, not ported).
   The ancient 5x5 lattice. 25 points connected ORTHOGONALLY everywhere and DIAGONALLY only at
   points where (row+col) is even, so the diagonals trace an X in every 2x2 block. You are White
   and move first; the AI is Black and uses alpha-beta (material + mobility + advancement). Step a
   piece along a connected line to an adjacent empty point, or JUMP an adjacent enemy into the empty
   point beyond it — checkers-style along the lattice — removing it. Multi-jumps chain. Capturing is
   mandatory. Capture every enemy (or strand them with no move) to win. */

export const N = 5
export type Side = 'w' | 'b'
export type Cell = Side | null
export interface LogEntry { t: string; x: string }

export interface Move {
  from: number
  to: number
  /** index of the jumped (captured) piece, or null for a plain step. */
  cap: number | null
}

export interface AlquerqueState {
  board: Cell[]              // length 25, index = r*5 + c
  turn: Side | null
  you: Side
  winner: Side | null
  /** when a multi-jump is mid-chain, the index of the piece that must keep jumping. */
  chain: number | null
  last: { from: number; to: number } | null
  log: LogEntry[]
}

const other = (s: Side): Side => s === 'w' ? 'b' : 'w'
export const idx = (r: number, c: number) => r * N + c
const rowOf = (i: number) => Math.floor(i / N)
const colOf = (i: number) => i % N

// The eight compass steps. Diagonals only count where the source point carries them.
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

/** Does point i carry diagonal lines? True where (row+col) is even. */
export function hasDiag(i: number): boolean {
  return ((rowOf(i) + colOf(i)) & 1) === 0
}

/** Connected neighbours of point i along the lattice (orthogonal always, diagonal where present). */
export function neighbors(i: number): number[] {
  const r = rowOf(i), c = colOf(i)
  const steps = hasDiag(i) ? ORTHO.concat(DIAG) : ORTHO
  const out: number[] = []
  for (const [dr, dc] of steps) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(idx(nr, nc))
  }
  return out
}

/** The point exactly one further along the same line beyond neighbour j (for a jump landing). */
function beyond(i: number, j: number): number | null {
  const dr = rowOf(j) - rowOf(i), dc = colOf(j) - colOf(i)
  const lr = rowOf(j) + dr, lc = colOf(j) + dc
  if (lr < 0 || lr >= N || lc < 0 || lc >= N) return null
  const land = idx(lr, lc)
  // The line must continue to exist from j (diagonals only persist on diagonal-carrying points).
  if (!neighbors(j).includes(land)) return null
  return land
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): AlquerqueState {
  const board: Cell[] = new Array(N * N).fill(null)
  // Top two rows + left half of centre row -> Black (AI).
  for (let i = 0; i < N * 2; i++) board[i] = 'b'
  board[idx(2, 0)] = 'b'; board[idx(2, 1)] = 'b'
  // Bottom two rows + right half of centre row -> White (you).
  for (let i = N * 3; i < N * N; i++) board[i] = 'w'
  board[idx(2, 3)] = 'w'; board[idx(2, 4)] = 'w'
  // Centre stays empty.
  board[idx(2, 2)] = null
  return {
    board, turn: 'w', you: 'w', winner: null, chain: null, last: null,
    log: [{ t: 'sys', x: 'You are White and move first. Jump along the lattice lines — capturing is forced.' }],
  }
}

export function counts(board: Cell[]): { w: number; b: number } {
  let w = 0, b = 0
  for (const v of board) { if (v === 'w') w++; else if (v === 'b') b++ }
  return { w, b }
}

/** All capture jumps available to piece at `from`. */
function capturesFrom(board: Cell[], from: number, who: Side): Move[] {
  const out: Move[] = []
  const opp = other(who)
  for (const j of neighbors(from)) {
    if (board[j] !== opp) continue
    const land = beyond(from, j)
    if (land !== null && board[land] === null) out.push({ from, to: land, cap: j })
  }
  return out
}

/** All plain steps available to piece at `from`. */
function stepsFrom(board: Cell[], from: number): Move[] {
  const out: Move[] = []
  for (const j of neighbors(from)) if (board[j] === null) out.push({ from, to: j, cap: null })
  return out
}

/** Every capture available to `who` across the board (mandatory-capture set). */
export function allCaptures(board: Cell[], who: Side): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === who) out.push(...capturesFrom(board, i, who))
  return out
}

/**
 * Legal moves for `who`. If `chain` is set, only that piece may move and only via further captures.
 * Otherwise: if any capture exists anywhere, only captures are legal (mandatory); else steps.
 */
export function legalMoves(board: Cell[], who: Side, chain: number | null = null): Move[] {
  if (chain !== null) return capturesFrom(board, chain, who)
  const caps = allCaptures(board, who)
  if (caps.length) return caps
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === who) out.push(...stepsFrom(board, i))
  return out
}

/** Legal moves for the currently selected piece (UI helper). */
export function movesFor(s: AlquerqueState, from: number): Move[] {
  if (s.winner || s.turn === null) return []
  if (s.chain !== null) return from === s.chain ? capturesFrom(s.board, from, s.turn) : []
  const caps = allCaptures(s.board, s.turn)
  if (caps.length) return caps.filter(m => m.from === from)
  return stepsFrom(s.board, from)
}

function applyMove(board: Cell[], m: Move): Cell[] {
  const nb = board.slice()
  nb[m.to] = nb[m.from]
  nb[m.from] = null
  if (m.cap !== null) nb[m.cap] = null
  return nb
}

function coord(i: number): string {
  return `${'abcde'[colOf(i)]}${rowOf(i) + 1}`
}

function finish(s: AlquerqueState, board: Cell[], winner: Side, log: LogEntry[], reason: string): AlquerqueState {
  const youWon = winner === s.you
  return Object.assign({}, s, {
    board, turn: null, winner, chain: null,
    log: push(log, youWon ? 'you' : 'ai', `${youWon ? 'You win' : 'Rival wins'} — ${reason}`),
  })
}

/** Apply a (legal) move for `who`; handles multi-jump continuation, mandatory capture and win checks. */
export function makeMove(s: AlquerqueState, m: Move, who: Side): AlquerqueState {
  if (s.winner || s.turn !== who) return s
  // Validate against the legal set so callers can't bypass mandatory capture.
  const legal = legalMoves(s.board, who, s.chain)
  if (!legal.some(x => x.from === m.from && x.to === m.to && x.cap === m.cap)) return s

  const board = applyMove(s.board, m)
  const opp = other(who)
  const mine = who === s.you
  let log = push(s.log, mine ? 'you' : 'ai',
    m.cap !== null
      ? `${mine ? 'You' : 'Rival'} jumped ${coord(m.from)}→${coord(m.to)}, capturing ${coord(m.cap)}.`
      : `${mine ? 'You' : 'Rival'} stepped ${coord(m.from)}→${coord(m.to)}.`)

  // Win: opponent wiped out.
  if (counts(board)[opp] === 0) return finish(s, board, who, log, 'every rival piece captured.')

  // Multi-jump: same piece must continue if more captures are available from its new point.
  if (m.cap !== null && capturesFrom(board, m.to, who).length) {
    return Object.assign({}, s, { board, turn: who, chain: m.to, last: { from: m.from, to: m.to }, log })
  }

  // Turn passes. If the opponent is stranded with no legal move, the mover wins.
  if (legalMoves(board, opp).length === 0) return finish(s, board, who, log, 'the rival has no legal move.')
  return Object.assign({}, s, { board, turn: opp, chain: null, last: { from: m.from, to: m.to }, log })
}

// ===== AI: alpha-beta (depth ~5) over material + mobility + advancement =====

function advancement(board: Cell[], me: Side): number {
  // Reward pushing toward the far edge (Black wants larger rows, White smaller rows).
  let adv = 0
  for (let i = 0; i < N * N; i++) {
    const v = board[i]
    if (!v) continue
    const r = rowOf(i)
    const forward = v === 'b' ? r : (N - 1 - r)
    adv += (v === me ? forward : -forward)
  }
  return adv
}

function evalBoard(board: Cell[], me: Side): number {
  const opp = other(me)
  const c = counts(board)
  const myN = c[me], opN = c[opp]
  if (opN === 0) return 1e6
  if (myN === 0) return -1e6
  const material = 100 * (myN - opN)
  const myMob = legalMoves(board, me).length, opMob = legalMoves(board, opp).length
  const mobility = 4 * (myMob - opMob)
  return material + mobility + 2 * advancement(board, me)
}

/** Expand one legal move into all resulting boards after any forced multi-jump completes. */
function applyForAI(board: Cell[], m: Move, who: Side): Cell[] {
  let b = applyMove(board, m)
  if (m.cap === null) return b
  // Continue the chain greedily for search (always extend captures with this piece).
  let at = m.to
  let more = capturesFrom(b, at, who)
  while (more.length) {
    // Pick the chain branch that captures the most overall via shallow recursion-free greedy pass.
    const next = more[0]
    b = applyMove(b, next)
    at = next.to
    more = capturesFrom(b, at, who)
  }
  return b
}

/** Distinct successor boards for `who` (chains collapsed to a single ply for the search). */
function successors(board: Cell[], who: Side): Cell[][] {
  const moves = legalMoves(board, who)
  return moves.map(m => applyForAI(board, m, who))
}

function search(board: Cell[], toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const c = counts(board)
  if (c[me] === 0 || c[other(me)] === 0 || depth === 0) return evalBoard(board, me)
  const kids = successors(board, toMove)
  if (kids.length === 0) {
    // toMove is stranded -> loses.
    return toMove === me ? -1e6 : 1e6
  }
  if (toMove === me) {
    let best = -Infinity
    for (const nb of kids) {
      best = Math.max(best, search(nb, other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const nb of kids) {
      best = Math.min(best, search(nb, other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

const DEPTH = 5

/**
 * One AI ply. Plays the best top-level move; if it began a capture chain, keeps jumping (best branch)
 * until the chain ends — so aiMove always returns with the turn handed back (or a win declared).
 */
export function aiMove(s: AlquerqueState): AlquerqueState {
  if (s.winner || s.turn !== 'b') return s
  const me: Side = 'b'

  let cur = s
  let guard = 0
  do {
    const moves = legalMoves(cur.board, me, cur.chain)
    if (moves.length === 0) return cur
    let best = -Infinity
    let pick = moves[0]
    for (const m of moves) {
      const nb = applyMove(cur.board, m)
      const v = search(nb, other(me), me, DEPTH - 1, -Infinity, Infinity)
      if (v > best) { best = v; pick = m }
    }
    cur = makeMove(cur, pick, me)
  } while (!cur.winner && cur.turn === me && cur.chain !== null && guard++ < 64)

  return cur
}
