/* LINES OF ACTION — logic (built for this codebase, not ported).
   8x8. You are Black and move first; the AI is White and uses alpha-beta (depth 3)
   over a connectivity/clustering eval.

   Setup: Black holds the top & bottom edge rows minus corners (row 0 cols 1..6 and
   row 7 cols 1..6 — 12 pieces). White holds the left & right edge columns minus
   corners (col 0 rows 1..6 and col 7 rows 1..6 — 12 pieces). Corners are empty.

   Move: a piece slides in a straight line (orthogonal or diagonal) EXACTLY as many
   squares as the total number of pieces (both colours) on that entire line. It may
   jump its OWN pieces but NOT enemy pieces, and may land on empty or capture an enemy
   (not its own). Win: be first to connect all your remaining pieces into one
   8-connected group; if a move connects both, the mover wins. */

export const N = 8
export type Side = 'b' | 'w'
export type Cell = Side | null
export interface LogEntry { t: string; x: string }

export interface Move { from: number; to: number; cap: boolean }

export interface LoaState {
  board: Cell[]            // length 64, index = r*8 + c
  turn: Side | null
  you: Side
  winner: Side | null
  last: Move | null
  log: LogEntry[]
}

export const other = (d: Side): Side => d === 'b' ? 'w' : 'b'
export const idx = (r: number, c: number) => r * N + c
const inB = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N

// four line orientations, each as a (dr,dc) axis
const AXES = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal "\"
  [1, -1],  // diagonal "/"
]

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

const FILE = 'ABCDEFGH'
const sq = (i: number) => `${FILE[i % N]}${Math.floor(i / N) + 1}`

export function makeGame(): LoaState {
  const board: Cell[] = new Array(N * N).fill(null)
  for (let c = 1; c <= 6; c++) { board[idx(0, c)] = 'b'; board[idx(7, c)] = 'b' }
  for (let r = 1; r <= 6; r++) { board[idx(r, 0)] = 'w'; board[idx(r, 7)] = 'w' }
  return {
    board, turn: 'b', you: 'b', winner: null, last: null,
    log: [{ t: 'sys', x: 'You are Black and move first. Gather all your pieces into one connected group to win.' }],
  }
}

export function counts(board: Cell[]): { b: number; w: number } {
  let b = 0, w = 0
  for (const v of board) { if (v === 'b') b++; else if (v === 'w') w++ }
  return { b, w }
}

// Number of pieces (both colours) on the full line through (r,c) along axis (dr,dc).
function lineCount(board: Cell[], r: number, c: number, dr: number, dc: number): number {
  let n = 0
  // walk one way
  let rr = r, cc = c
  while (inB(rr, cc)) { if (board[idx(rr, cc)]) n++; rr += dr; cc += dc }
  // walk the other way, skipping the origin (already counted)
  rr = r - dr; cc = c - dc
  while (inB(rr, cc)) { if (board[idx(rr, cc)]) n++; rr -= dr; cc -= dc }
  return n
}

// All legal destinations for the piece at `from` (must belong to `who`).
export function movesFrom(board: Cell[], from: number, who: Side): Move[] {
  if (board[from] !== who) return []
  const r = Math.floor(from / N), c = from % N
  const out: Move[] = []
  const opp = other(who)
  for (const [dr, dc] of AXES) {
    const dist = lineCount(board, r, c, dr, dc)
    // a line always has at least the piece itself, so dist >= 1
    for (const sgn of [1, -1]) {
      const sr = dr * sgn, sc = dc * sgn
      // path of (dist-1) intermediate squares must not hold an enemy piece (no jumping enemies)
      let blocked = false
      for (let k = 1; k < dist; k++) {
        const rr = r + sr * k, cc = c + sc * k
        if (!inB(rr, cc)) { blocked = true; break }
        if (board[idx(rr, cc)] === opp) { blocked = true; break }
      }
      if (blocked) continue
      const tr = r + sr * dist, tc = c + sc * dist
      if (!inB(tr, tc)) continue
      const tIdx = idx(tr, tc)
      const tgt = board[tIdx]
      if (tgt === who) continue            // cannot land on own piece
      out.push({ from, to: tIdx, cap: tgt === opp })
    }
  }
  return out
}

export function legalMoves(board: Cell[], who: Side): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === who) out.push(...movesFrom(board, i, who))
  return out
}

// Is `who` reduced to a single 8-connected group? (zero pieces => false; one => true)
export function connected(board: Cell[], who: Side): boolean {
  const cells: number[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === who) cells.push(i)
  if (cells.length === 0) return false
  if (cells.length === 1) return true
  const set = new Set(cells)
  const seen = new Set<number>()
  const stack = [cells[0]]
  seen.add(cells[0])
  while (stack.length) {
    const i = stack.pop()!
    const r = Math.floor(i / N), c = i % N
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const rr = r + dr, cc = c + dc
      if (!inB(rr, cc)) continue
      const j = idx(rr, cc)
      if (set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j) }
    }
  }
  return seen.size === cells.length
}

// Count 8-connected groups for `who`.
function groupCount(board: Cell[], who: Side): number {
  const cells: number[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === who) cells.push(i)
  const set = new Set(cells)
  const seen = new Set<number>()
  let groups = 0
  for (const start of cells) {
    if (seen.has(start)) continue
    groups++
    const stack = [start]; seen.add(start)
    while (stack.length) {
      const i = stack.pop()!
      const r = Math.floor(i / N), c = i % N
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const rr = r + dr, cc = c + dc
        if (!inB(rr, cc)) continue
        const j = idx(rr, cc)
        if (set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j) }
      }
    }
  }
  return groups
}

// Mean distance of `who`'s pieces to their centroid (spread; lower = tighter).
function spread(board: Cell[], who: Side): number {
  let n = 0, sr = 0, sc = 0
  for (let i = 0; i < N * N; i++) if (board[i] === who) { n++; sr += Math.floor(i / N); sc += i % N }
  if (n === 0) return 0
  const mr = sr / n, mc = sc / n
  let d = 0
  for (let i = 0; i < N * N; i++) if (board[i] === who) {
    const r = Math.floor(i / N), c = i % N
    d += Math.hypot(r - mr, c - mc)
  }
  return d / n
}

function applyMove(board: Cell[], m: Move, who: Side): Cell[] {
  const nb = board.slice()
  nb[m.from] = null
  nb[m.to] = who
  return nb
}

function finish(s: LoaState, board: Cell[], log: LogEntry[], winner: Side): LoaState {
  const youWon = winner === s.you
  return Object.assign({}, s, {
    board, turn: null, winner,
    log: push(log, youWon ? 'you' : 'ai', youWon ? 'You connected all your pieces — you win!' : 'The rival connected all its pieces — rival wins.'),
  })
}

export function play(s: LoaState, m: Move, who: Side): LoaState {
  if (s.winner || s.turn !== who) return s
  const legal = movesFrom(s.board, m.from, who).some(x => x.to === m.to)
  if (!legal) return s
  const board = applyMove(s.board, m, who)
  const cap = m.cap
  let log = push(s.log, who === s.you ? 'you' : 'ai',
    `${who === s.you ? 'You' : 'Rival'} ${cap ? 'captured at' : 'moved to'} ${sq(m.to)}${cap ? '' : ` (from ${sq(m.from)})`}.`)
  const move: Move = { from: m.from, to: m.to, cap }
  // win check: mover wins if connected; if both connected, mover wins (so check mover first)
  if (connected(board, who)) return finish(Object.assign({}, s, { last: move }), board, log, who)
  const opp = other(who)
  if (connected(board, opp)) return finish(Object.assign({}, s, { last: move }), board, log, opp)
  return Object.assign({}, s, { board, turn: opp, last: move, log })
}

// ===== AI: alpha-beta over a connectivity/clustering eval =====
// Higher = better for `me`. Fewer groups, tighter spread, more material.
function evalBoard(board: Cell[], me: Side): number {
  const opp = other(me)
  const myG = groupCount(board, me), opG = groupCount(board, opp)
  const mySp = spread(board, me), opSp = spread(board, opp)
  const { b, w } = counts(board)
  const myMat = me === 'b' ? b : w, opMat = me === 'b' ? w : b
  // fewer groups is much better; tighter spread is better; material matters
  return (opG - myG) * 24 + (opSp - mySp) * 6 + (myMat - opMat) * 8
}

function search(board: Cell[], toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  // terminal: someone connected
  if (connected(board, me)) return 100000 + depth
  if (connected(board, other(me))) return -100000 - depth
  if (depth === 0) return evalBoard(board, me)
  const moves = legalMoves(board, toMove)
  if (!moves.length) return evalBoard(board, me)
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(board, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(applyMove(board, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

export function aiMove(s: LoaState): LoaState {
  if (s.winner || s.turn !== 'w') return s
  const me: Side = 'w'
  const moves = legalMoves(s.board, me)
  if (!moves.length) return s
  // order: prefer immediate wins / captures up front for better pruning
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const nb = applyMove(s.board, m, me)
    let v: number
    if (connected(nb, me)) v = 1e9
    else if (connected(nb, other(me))) v = -1e9
    else v = search(nb, other(me), me, 2, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return play(s, choice, me)
}
