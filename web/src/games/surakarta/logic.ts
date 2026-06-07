/* SURAKARTA — logic (built for this codebase, not ported).
   A 6x6 grid of points; pieces sit on the 36 intersections. You are Red and move first; the
   AI is Black. Two move kinds: (1) a NON-CAPTURING step to one of the 8 adjacent empty points,
   and (2) a CAPTURING travel along a row/column TRACK that must go AROUND at least one of the
   eight corner LOOPS, gliding over empty points only, to land on the first enemy piece reached.
   You cannot capture in a straight line without looping. Capture everything (or stalemate the
   rival) to win. The AI is alpha-beta minimax over material + a little mobility/centre. */

export const N = 6
export type Player = 'r' | 'b'
export type Cell = Player | null
export interface LogEntry { t: string; x: string }

export interface SurakartaState {
  board: Cell[]            // length 36, index = r*6 + c
  turn: Player | null
  you: Player
  winner: Player | null
  last: { from: number; to: number; cap: boolean } | null
  log: LogEntry[]
}

export const other = (p: Player): Player => (p === 'r' ? 'b' : 'r')
export const idx = (r: number, c: number) => r * N + c
export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]

const STEP_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): SurakartaState {
  const board: Cell[] = new Array(N * N).fill(null)
  // AI (Black) on rows 0,1 ; You (Red) on rows 4,5
  for (let c = 0; c < N; c++) {
    board[idx(0, c)] = 'b'; board[idx(1, c)] = 'b'
    board[idx(4, c)] = 'r'; board[idx(5, c)] = 'r'
  }
  return {
    board, turn: 'r', you: 'r', winner: null, last: null,
    log: [{ t: 'sys', x: 'You are Red and move first. Step to a neighbour, or loop a corner to capture.' }],
  }
}

/* ===========================================================================
   TRACK MODEL — the heart of Surakarta.

   Each move along a track is described as a "tile" = a point plus a heading.
   Headings: 0 N(up), 1 E(right), 2 S(down), 3 W(left). A capturing ray walks
   point-to-point in its heading; when it would step off an EDGE that has a loop
   wired to it, it transfers onto the connected track (turning the corner) and
   keeps walking. Travelling around a corner re-enters the board, and that
   transition is what counts as "going around a loop".

   The eight corner loops: at each of the four corners there is an INNER loop
   (joining track lines 1 of the row/column block) and an OUTER loop (joining
   lines 0). On a 6x6 board the inner rows/columns are rows/cols 1 and 4
   (lines index 1), the outer are rows/cols 0 and 5 (lines index 0). Each loop
   connects the END of a row line to the END of the matching column line so a
   piece can curve from a row onto a column (or vice-versa).
   =========================================================================== */

type Heading = 0 | 1 | 2 | 3  // N, E, S, W
interface Tile { i: number; h: Heading }

const DELTA: Record<Heading, [number, number]> = {
  0: [-1, 0], 1: [0, 1], 2: [1, 0], 3: [0, -1],
}

/* The two "loop lines" on each side. Index 0 = outer line, index 1 = inner line.
   For rows these are row numbers; for cols these are col numbers. On a side of
   length 6 the outer line is 0 and the inner is 1 (top/left) — mirrored on the
   far side as 5 and 4. We capture this with a small helper that, given a point
   trying to leave the board, returns the connected entry tile (or null). */

/* We model loops explicitly as a set of directed edges keyed by (point,heading) ->
   next tile, built once. This is exact and easy to reason about. */

function buildEdges(): Map<string, Tile> {
  const m = new Map<string, Tile>()
  const key = (i: number, h: Heading) => i + ':' + h
  // straight in-board steps
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    for (let h = 0 as Heading; h <= 3; h = (h + 1) as Heading) {
      const [dr, dc] = DELTA[h]
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
        m.set(key(idx(r, c), h), { i: idx(nr, nc), h })
      }
    }
  }
  // corner loop edges. For each loop line `L` (0 outer, 1 inner), at each of the 4
  // corners join the end of the row line to the end of the column line.
  // We add directed edges so a ray leaving the board reverses onto the new track.
  const lines = [0, 1]
  for (const L of lines) {
    const rTop = L                 // top row line
    const rBot = N - 1 - L         // bottom row line
    const cLeft = L                // left col line
    const cRight = N - 1 - L       // right col line

    // TOP-LEFT corner: row rTop going W (off left edge) <-> col cLeft going N (off top edge)
    // Leaving left edge of top row, heading W -> enter top of left col heading S.
    addLoop(m, key, idx(rTop, 0), 3, idx(0, cLeft), 2)
    addLoop(m, key, idx(0, cLeft), 0, idx(rTop, 0), 1)

    // TOP-RIGHT: row rTop going E (off right edge) <-> col cRight going N (off top edge)
    addLoop(m, key, idx(rTop, N - 1), 1, idx(0, cRight), 2)
    addLoop(m, key, idx(0, cRight), 0, idx(rTop, N - 1), 3)

    // BOTTOM-LEFT: row rBot going W <-> col cLeft going S (off bottom edge)
    addLoop(m, key, idx(rBot, 0), 3, idx(N - 1, cLeft), 0)
    addLoop(m, key, idx(N - 1, cLeft), 2, idx(rBot, 0), 1)

    // BOTTOM-RIGHT: row rBot going E <-> col cRight going S
    addLoop(m, key, idx(rBot, N - 1), 1, idx(N - 1, cRight), 0)
    addLoop(m, key, idx(N - 1, cRight), 2, idx(rBot, N - 1), 3)
  }
  return m
}

function addLoop(m: Map<string, Tile>, key: (i: number, h: Heading) => string, fromI: number, fromH: Heading, toI: number, toH: Heading) {
  m.set(key(fromI, fromH) + '|loop', { i: toI, h: toH })
}

const EDGES = buildEdges()
const KEY = (i: number, h: Heading) => i + ':' + h

/* next tile from (i,h): prefer the straight step; if there is none (edge of board)
   try a loop. Returns the next tile and whether a loop was traversed. */
function advance(i: number, h: Heading): { tile: Tile; loop: boolean } | null {
  const straight = EDGES.get(KEY(i, h))
  if (straight) return { tile: straight, loop: false }
  const loop = EDGES.get(KEY(i, h) + '|loop')
  if (loop) return { tile: loop, loop: true }
  return null
}

/* ===========================================================================
   MOVE GENERATION
   =========================================================================== */

export interface Move { from: number; to: number; cap: boolean; path?: number[] }

// adjacency steps to empty points
function stepMoves(board: Cell[], from: number): Move[] {
  const [r, c] = rc(from)
  const out: Move[] = []
  for (const [dr, dc] of STEP_DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < N && nc >= 0 && nc < N && board[idx(nr, nc)] === null) {
      out.push({ from, to: idx(nr, nc), cap: false })
    }
  }
  return out
}

// capture rays: from `from`, in each of the 4 headings, walk the track (through loops)
// skipping empty points; the FIRST piece encountered after traversing >=1 loop, if it
// is an enemy, is a capture. An own piece anywhere before that, or an enemy reached
// before any loop, blocks/aborts that ray.
function captureMoves(board: Cell[], from: number, who: Player): Move[] {
  const out: Move[] = []
  for (let h0 = 0 as Heading; h0 <= 3; h0 = (h0 + 1) as Heading) {
    let i = from, h = h0
    let loops = 0
    const path: number[] = [from]
    const seen = new Set<string>()
    let steps = 0
    while (steps++ < 200) {
      const adv = advance(i, h)
      if (!adv) break                 // dead end (edge with no loop)
      if (adv.loop) loops++
      i = adv.tile.i; h = adv.tile.h
      const sig = i + ':' + h
      if (seen.has(sig)) break        // full cycle back, no capture
      seen.add(sig)
      if (i === from) break           // returned to origin
      path.push(i)
      const v = board[i]
      if (v === null) continue        // glide over empty
      if (v === who) break            // own piece blocks the ray
      // enemy piece
      if (loops >= 1) { out.push({ from, to: i, cap: true, path: path.slice() }) }
      break                           // first piece ends the ray regardless
    }
  }
  return out
}

export function movesFrom(board: Cell[], from: number, who: Player): Move[] {
  if (board[from] !== who) return []
  return stepMoves(board, from).concat(captureMoves(board, from, who))
}

export function allMoves(board: Cell[], who: Player): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === who) out.push(...movesFrom(board, i, who))
  return out
}

export function counts(board: Cell[]): { r: number; b: number } {
  let r = 0, b = 0
  for (const v of board) { if (v === 'r') r++; else if (v === 'b') b++ }
  return { r, b }
}

function nameOf(i: number): string {
  const [r, c] = rc(i)
  return 'abcdef'[c] + (N - r)
}

function checkEnd(s: SurakartaState, board: Cell[], log: LogEntry[], mover: Player): SurakartaState | null {
  const { r, b } = counts(board)
  const opp = other(mover)
  if (r === 0) return endGame(s, board, log, 'b')
  if (b === 0) return endGame(s, board, log, 'r')
  // if the side to move next (opp) has no move, they lose
  if (allMoves(board, opp).length === 0) return endGame(s, board, log, mover)
  return null
}

function endGame(s: SurakartaState, board: Cell[], log: LogEntry[], winner: Player): SurakartaState {
  const youWon = winner === s.you
  const { r, b } = counts(board)
  const msg = youWon ? `You win — ${r} to ${b}.` : `The rival wins — ${b} to ${r}.`
  return Object.assign({}, s, { board, turn: null, winner, log: push(log, youWon ? 'you' : 'ai', msg) })
}

// Apply a concrete move (no legality re-check beyond turn/winner guards in callers).
export function applyMove(s: SurakartaState, m: Move, who: Player): SurakartaState {
  if (s.winner || s.turn !== who) return s
  const board = s.board.slice()
  board[m.to] = who
  board[m.from] = null
  let log = push(
    s.log, who === s.you ? 'you' : 'ai',
    m.cap
      ? `${who === s.you ? 'You' : 'Rival'} looped ${nameOf(m.from)}→${nameOf(m.to)}, capturing.`
      : `${who === s.you ? 'You' : 'Rival'} stepped ${nameOf(m.from)}→${nameOf(m.to)}.`,
  )
  const last = { from: m.from, to: m.to, cap: m.cap }
  const opp = other(who)
  const ended = checkEnd(s, board, log, who)
  if (ended) return Object.assign({}, ended, { last })
  return Object.assign({}, s, { board, turn: opp, last, log })
}

// convenience used by the UI: find & apply the legal move from->to for `who`
export function move(s: SurakartaState, from: number, to: number, who: Player): SurakartaState {
  if (s.winner || s.turn !== who) return s
  const m = movesFrom(s.board, from, who).find(x => x.to === to)
  if (!m) return s
  return applyMove(s, m, who)
}

/* ===========================================================================
   AI — alpha-beta minimax. Eval = material (dominant) + small mobility & centre.
   =========================================================================== */

const CENTRE = (() => {
  const w = new Array(N * N).fill(0)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const d = Math.min(r, N - 1 - r) + Math.min(c, N - 1 - c)
    w[idx(r, c)] = d            // 0 at edge corners up to peak in centre
  }
  return w
})()

function evalBoard(board: Cell[], me: Player): number {
  const { r, b } = counts(board)
  const myCount = me === 'r' ? r : b
  const opCount = me === 'r' ? b : r
  if (opCount === 0) return 1e6
  if (myCount === 0) return -1e6
  let score = 1000 * (myCount - opCount)
  let centre = 0, mob = 0
  for (let i = 0; i < N * N; i++) {
    const v = board[i]
    if (!v) continue
    const sign = v === me ? 1 : -1
    centre += sign * CENTRE[i]
    mob += sign * stepDegree(board, i)   // cheap step-only mobility proxy
  }
  score += 2 * centre + 1 * mob
  return score
}

// number of empty 8-neighbours of point i (a fast mobility proxy for the eval)
function stepDegree(board: Cell[], i: number): number {
  const [r, c] = rc(i)
  let n = 0
  for (const [dr, dc] of STEP_DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < N && nc >= 0 && nc < N && board[idx(nr, nc)] === null) n++
  }
  return n
}

function doMove(board: Cell[], m: Move, who: Player): Cell[] {
  const nb = board.slice(); nb[m.to] = who; nb[m.from] = null; return nb
}

// order: captures first (helps pruning)
function ordered(board: Cell[], who: Player): Move[] {
  const ms = allMoves(board, who)
  ms.sort((a, b) => (b.cap ? 1 : 0) - (a.cap ? 1 : 0))
  return ms
}

function search(board: Cell[], toMove: Player, me: Player, depth: number, alpha: number, beta: number): number {
  const { r, b } = counts(board)
  if (r === 0 || b === 0 || depth === 0) return evalBoard(board, me)
  const moves = ordered(board, toMove)
  if (!moves.length) {
    // side to move is stalemated -> they lose
    return toMove === me ? -1e6 : 1e6
  }
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(doMove(board, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(doMove(board, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}

export function pickMove(board: Cell[], me: Player, depth = 3): Move | null {
  const moves = ordered(board, me)
  if (!moves.length) return null
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(doMove(board, m, me), other(me), me, depth - 1, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  return top[(Math.random() * top.length) | 0]
}

export function aiMove(s: SurakartaState): SurakartaState {
  if (s.winner || s.turn !== 'b') return s
  const m = pickMove(s.board, 'b', 3)
  if (!m) {
    // stalemated -> human wins
    return endGame(s, s.board, s.log, 'r')
  }
  return applyMove(s, m, 'b')
}
