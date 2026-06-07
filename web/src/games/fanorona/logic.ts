/* FANORONA (Fanoron-Tsivy) — logic (built for this codebase, not ported).
   A 5x9 grid of 45 intersections with the characteristic Fanorona line pattern:
   every point connects orthogonally to its neighbours; "strong" points where (row+col)
   is even also connect diagonally (8 lines), "weak" points (row+col odd) only orthogonally
   (4 lines). You are White (bottom) and move first; the AI is Black (top).

   Movement: a piece slides one step along a line to an adjacent EMPTY point. Captures are
   by APPROACH (an enemy line sits beyond the destination, in the move direction) or by
   WITHDRAWAL (an enemy line sits behind the origin, opposite the move direction); the whole
   contiguous enemy line in that direction is removed. Capturing is MANDATORY when any
   capture exists, and the same piece may CHAIN further captures (no repeated direction, no
   revisited point). Capture every enemy piece to win. */

export const ROWS = 5
export const COLS = 9
export const N = ROWS * COLS        // 45 points

export type Piece = 'w' | 'b'
export type Cell = Piece | null
export type CapKind = 'approach' | 'withdrawal'
export interface LogEntry { t: string; x: string }

export interface Move {
  from: number
  to: number
  kind: CapKind | null            // null = paika (non-capturing step)
}

export interface FanoronaState {
  board: Cell[]                   // length 45, index = r*COLS + c
  turn: Piece | null
  you: Piece
  winner: Piece | null
  // chain state: when non-null, a capture is in progress and the same piece must keep going
  // (or stop). `chainAt` is the active piece's point; visited points + used directions block repeats.
  chainAt: number | null
  chainVisited: number[]
  chainDirs: string[]             // "dr,dc" directions already used this chain
  last: { from: number; to: number } | null
  log: LogEntry[]
}

export const other = (p: Piece): Piece => p === 'w' ? 'b' : 'w'
export const rc = (i: number): [number, number] => [Math.floor(i / COLS), i % COLS]
export const idx = (r: number, c: number) => r * COLS + c
export const inBounds = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS
export const isStrong = (i: number) => { const [r, c] = rc(i); return (r + c) % 2 === 0 }

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

/** The directions you may travel from point i (orthogonal always; diagonal only at strong points). */
export function dirsFrom(i: number): number[][] {
  return isStrong(i) ? ORTHO.concat(DIAG) : ORTHO
}

/** Points adjacent to i along a real Fanorona line. */
export function neighbours(i: number): number[] {
  const [r, c] = rc(i)
  const out: number[] = []
  for (const [dr, dc] of dirsFrom(i)) { const nr = r + dr, nc = c + dc; if (inBounds(nr, nc)) out.push(idx(nr, nc)) }
  return out
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function counts(board: Cell[]): { w: number; b: number } {
  let w = 0, b = 0
  for (const v of board) { if (v === 'w') w++; else if (v === 'b') b++ }
  return { w, b }
}

/* ---- Standard 22/22 Fanorona starting position ----
   Rows 0,1 = Black; rows 3,4 = White; centre row (2) alternates B W B W _ B W B W with the
   middle point (2,4) empty. Per the standard setup two pieces flanking the centre are swapped
   so the centre row reads, left→right: B W B W . W B W B  — giving each side 22 pieces. */
export function makeGame(): FanoronaState {
  const board: Cell[] = new Array(N).fill(null)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(r, c)
      if (r < 2) board[i] = 'b'
      else if (r > 2) board[i] = 'w'
      else {
        if (c === 4) board[i] = null                 // empty centre
        else if (c < 4) board[i] = c % 2 === 0 ? 'b' : 'w'
        else board[i] = c % 2 === 0 ? 'b' : 'w'       // mirror -> B W B W . W B W B
      }
    }
  }
  // enforce the canonical alternating centre row explicitly: B W B W . W B W B
  const mid = [['b'], ['w'], ['b'], ['w'], [null], ['w'], ['b'], ['w'], ['b']]
  for (let c = 0; c < COLS; c++) board[idx(2, c)] = mid[c][0] as Cell
  return {
    board, turn: 'w', you: 'w', winner: null,
    chainAt: null, chainVisited: [], chainDirs: [],
    last: null,
    log: [{ t: 'sys', x: 'You are White and move first. Capture is forced — slide to flank an enemy line by approach or withdrawal.' }],
  }
}

/** Collect the contiguous run of enemy pieces starting one step past (sr,sc) heading (dr,dc). */
function enemyRun(board: Cell[], sr: number, sc: number, dr: number, dc: number, foe: Piece): number[] {
  const run: number[] = []
  let r = sr, c = sc
  while (inBounds(r, c) && board[idx(r, c)] === foe) { run.push(idx(r, c)); r += dr; c += dc }
  return run
}

/** All capturing destinations/kinds for the piece at `from`, given a constraint set
    (visited points + used directions for chains; pass empty arrays for a fresh move). */
export function captureMoves(board: Cell[], from: number, who: Piece, visited: number[] = [], usedDirs: string[] = []): Move[] {
  const foe = other(who)
  const [r0, c0] = rc(from)
  const out: Move[] = []
  for (const [dr, dc] of dirsFrom(from)) {
    const key = dr + ',' + dc
    const revKey = (-dr) + ',' + (-dc)
    if (usedDirs.includes(key) || usedDirs.includes(revKey)) continue
    const tr = r0 + dr, tc = c0 + dc
    if (!inBounds(tr, tc) || board[idx(tr, tc)] !== null) continue
    const to = idx(tr, tc)
    if (visited.includes(to)) continue
    // APPROACH: enemy directly beyond the destination, continuing in the move direction
    const ar = tr + dr, ac = tc + dc
    if (inBounds(ar, ac) && board[idx(ar, ac)] === foe) out.push({ from, to, kind: 'approach' })
    // WITHDRAWAL: enemy directly behind the origin, opposite the move direction
    const wr = r0 - dr, wc = c0 - dc
    if (inBounds(wr, wc) && board[idx(wr, wc)] === foe) out.push({ from, to, kind: 'withdrawal' })
  }
  return out
}

/** Points captured by a given move (the full contiguous enemy line in the relevant direction). */
export function capturedBy(board: Cell[], m: Move, who: Piece): number[] {
  if (!m.kind) return []
  const foe = other(who)
  const [r0, c0] = rc(m.from)
  const [tr, tc] = rc(m.to)
  const dr = tr - r0, dc = tc - c0
  if (m.kind === 'approach') return enemyRun(board, tr + dr, tc + dc, dr, dc, foe)
  return enemyRun(board, r0 - dr, c0 - dc, -dr, -dc, foe)               // withdrawal: line behind origin
}

/** Every legal non-capturing (paika) step for `who`. */
export function paikaMoves(board: Cell[], who: Piece): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N; i++) {
    if (board[i] !== who) continue
    for (const j of neighbours(i)) if (board[j] === null) out.push({ from: i, to: j, kind: null })
  }
  return out
}

/** All capturing moves available to `who` across the whole board (used for the mandatory rule). */
export function allCaptureMoves(board: Cell[], who: Piece): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N; i++) if (board[i] === who) out.push(...captureMoves(board, i, who))
  return out
}

/**
 * The legal moves for the side to move in state `s`. If a chain is in progress, only the
 * active piece's continuing captures (or "stop"). Otherwise: if any capture exists, only
 * captures are legal (mandatory); else the paika steps.
 */
export function legalMoves(s: FanoronaState): Move[] {
  if (s.winner || !s.turn) return []
  if (s.chainAt !== null) return captureMoves(s.board, s.chainAt, s.turn, s.chainVisited, s.chainDirs)
  const caps = allCaptureMoves(s.board, s.turn)
  if (caps.length) return caps
  return paikaMoves(s.board, s.turn)
}

function checkWinner(board: Cell[]): Piece | null {
  const { w, b } = counts(board)
  if (b === 0) return 'w'
  if (w === 0) return 'b'
  return null
}

/** Apply a chosen move. Capturing moves remove the enemy line and may open a chain. */
export function applyMove(s: FanoronaState, m: Move): FanoronaState {
  if (s.winner || s.turn == null) return s
  const who = s.turn
  // validate against the current legal set
  const legal = legalMoves(s)
  const ok = legal.some(x => x.from === m.from && x.to === m.to && x.kind === m.kind)
  if (!ok) return s

  const board = s.board.slice()
  const [r0, c0] = rc(m.from)
  const [tr, tc] = rc(m.to)
  const dirKey = (tr - r0) + ',' + (tc - c0)

  if (!m.kind) {
    // paika — a single non-capturing step, turn passes
    board[m.from] = null; board[m.to] = who
    const youStr = who === s.you ? 'You' : 'Rival'
    let log = push(s.log, who === s.you ? 'you' : 'ai', `${youStr} slid a piece (no capture).`)
    const winner = checkWinner(board)
    return Object.assign({}, s, { board, turn: winner ? null : other(who), winner, chainAt: null, chainVisited: [], chainDirs: [], last: { from: m.from, to: m.to }, log })
  }

  const taken = capturedBy(board, m, who)
  board[m.from] = null; board[m.to] = who
  for (const t of taken) board[t] = null

  const youStr = who === s.you ? 'You' : 'Rival'
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${youStr} captured ${taken.length} by ${m.kind}.`)

  const winner = checkWinner(board)
  if (winner) {
    return Object.assign({}, s, { board, turn: null, winner, chainAt: null, chainVisited: [], chainDirs: [], last: { from: m.from, to: m.to }, log })
  }

  // open / extend a chain from the destination
  const chainVisited = s.chainAt === null ? [m.from, m.to] : s.chainVisited.concat([m.to])
  const chainDirs = (s.chainAt === null ? [] : s.chainDirs).concat([dirKey])
  const more = captureMoves(board, m.to, who, chainVisited, chainDirs)
  if (more.length) {
    return Object.assign({}, s, { board, turn: who, chainAt: m.to, chainVisited, chainDirs, last: { from: m.from, to: m.to }, log })
  }
  // no continuation — turn passes
  return Object.assign({}, s, { board, turn: other(who), chainAt: null, chainVisited: [], chainDirs: [], last: { from: m.from, to: m.to }, log })
}

/** Voluntarily end a capture chain (only meaningful while chainAt is set). */
export function stopChain(s: FanoronaState): FanoronaState {
  if (s.winner || s.chainAt === null || s.turn == null) return s
  const who = s.turn
  const winner = checkWinner(s.board)
  return Object.assign({}, s, { turn: winner ? null : other(who), winner, chainAt: null, chainVisited: [], chainDirs: [], log: push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} ended the chain.`) })
}

/* ===================== AI: minimax with alpha-beta ===================== */

function evalBoard(board: Cell[], me: Piece): number {
  const opp = other(me)
  const { w, b } = counts(board)
  const myN = me === 'w' ? w : b, opN = me === 'w' ? b : w
  if (opN === 0) return 1e6
  if (myN === 0) return -1e6
  const material = 100 * (myN - opN)
  // mobility: count capture threats first, then plain steps (capture pressure dominates)
  const myCap = allCaptureMoves(board, me).length, opCap = allCaptureMoves(board, opp).length
  const myMob = myCap ? myCap : paikaMoves(board, me).length
  const opMob = opCap ? opCap : paikaMoves(board, opp).length
  return material + 6 * (myCap - opCap) + 1 * (myMob - opMob)
}

/** A flat, single-step view of applying one move for the search (chains explored as plies). */
function simApply(board: Cell[], m: Move, who: Piece): { board: Cell[]; captured: number } {
  const nb = board.slice()
  const taken = capturedBy(board, m, who)
  nb[m.from] = null; nb[m.to] = who
  for (const t of taken) nb[t] = null
  return { board: nb, captured: taken.length }
}

interface SearchState { board: Cell[]; toMove: Piece; chainAt: number | null; visited: number[]; dirs: string[] }

function movesFor(st: SearchState): Move[] {
  if (st.chainAt !== null) return captureMoves(st.board, st.chainAt, st.toMove, st.visited, st.dirs)
  const caps = allCaptureMoves(st.board, st.toMove)
  return caps.length ? caps : paikaMoves(st.board, st.toMove)
}

function stepState(st: SearchState, m: Move): SearchState {
  const [r0, c0] = rc(m.from); const [tr, tc] = rc(m.to)
  const dirKey = (tr - r0) + ',' + (tc - c0)
  const { board } = simApply(st.board, m, st.toMove)
  if (!m.kind) return { board, toMove: other(st.toMove), chainAt: null, visited: [], dirs: [] }
  const visited = st.chainAt === null ? [m.from, m.to] : st.visited.concat([m.to])
  const dirs = (st.chainAt === null ? [] : st.dirs).concat([dirKey])
  const more = captureMoves(board, m.to, st.toMove, visited, dirs)
  if (more.length) return { board, toMove: st.toMove, chainAt: m.to, visited, dirs }
  return { board, toMove: other(st.toMove), chainAt: null, visited: [], dirs: [] }
}

function search(st: SearchState, me: Piece, depth: number, alpha: number, beta: number): number {
  const { w, b } = counts(st.board)
  if (w === 0 || b === 0 || depth <= 0) return evalBoard(st.board, me)
  const moves = movesFor(st)
  if (!moves.length) {
    // side to move is stuck — treat as a loss for them
    return st.toMove === me ? -1e6 : 1e6
  }
  const maximizing = st.toMove === me
  let best = maximizing ? -Infinity : Infinity
  for (const m of moves) {
    const child = stepState(st, m)
    // a continued chain stays the same player, so we don't decrement depth then
    const nextDepth = child.toMove === st.toMove ? depth : depth - 1
    const v = search(child, me, nextDepth, alpha, beta)
    if (maximizing) { if (v > best) best = v; if (best > alpha) alpha = best }
    else { if (v < best) best = v; if (best < beta) beta = best }
    if (alpha >= beta) break
  }
  return best
}

/**
 * The AI's whole move for the current ply: it picks the best root move by alpha-beta, then
 * applies it through the real state machine — automatically continuing the best capture chain.
 */
export function aiMove(s: FanoronaState): FanoronaState {
  if (s.winner || s.turn == null || s.turn === s.you) return s
  const me = s.turn
  let cur = s
  let guard = 0
  // act repeatedly while it's still the AI's turn (covers capture chains)
  do {
    const moves = legalMoves(cur)
    if (!moves.length) {
      // stuck: opponent wins
      return Object.assign({}, cur, { turn: null, winner: other(me), log: push(cur.log, 'sys', `${me === cur.you ? 'You have' : 'Rival has'} no move.`) })
    }
    const root: SearchState = { board: cur.board, toMove: me, chainAt: cur.chainAt, visited: cur.chainVisited, dirs: cur.chainDirs }
    let best = -Infinity
    const scored: { m: Move; v: number }[] = []
    for (const m of moves) {
      const child = stepState(root, m)
      const nextDepth = child.toMove === me ? 4 : 3
      const v = search(child, me, nextDepth, -Infinity, Infinity)
      scored.push({ m, v })
      if (v > best) best = v
    }
    const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
    const choice = top[(Math.random() * top.length) | 0]
    cur = applyMove(cur, choice)
  } while (!cur.winner && cur.turn === me && guard++ < 60)
  return cur
}
