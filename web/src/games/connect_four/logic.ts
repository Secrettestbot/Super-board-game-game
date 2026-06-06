/* CONNECT FOUR — logic (built for this codebase, not ported).
   7 columns x 6 rows. You are Red and drop first; the AI is Yellow and searches with
   alpha-beta + a window heuristic. Drop a disc into a column; it falls to the lowest empty
   slot. Four in a row (any direction) wins. */

export const W = 7, H = 6
export type Disc = 'r' | 'y'
export type Cell = Disc | null
export interface LogEntry { t: string; x: string }

export interface C4State {
  board: Cell[]            // length W*H, index = row*W + col, row 0 = top
  turn: Disc | null
  you: Disc
  winner: Disc | 'draw' | null
  line: number[] | null    // winning four, for highlight
  log: LogEntry[]
}

const other = (d: Disc): Disc => d === 'r' ? 'y' : 'r'
const idx = (r: number, c: number) => r * W + c

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-20) }

export function makeGame(): C4State {
  return {
    board: new Array(W * H).fill(null),
    turn: 'r', you: 'r', winner: null, line: null,
    log: [{ t: 'sys', x: 'Drop discs to connect four. You are Red and go first.' }],
  }
}

export function legalCols(board: Cell[]): number[] {
  const out: number[] = []
  for (let c = 0; c < W; c++) if (!board[idx(0, c)]) out.push(c)
  return out
}
function lowestEmpty(board: Cell[], c: number): number {
  for (let r = H - 1; r >= 0; r--) if (!board[idx(r, c)]) return r
  return -1
}

// all length-4 lines on the board, precomputed
const LINES: number[][] = (() => {
  const ls: number[][] = []
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const [dr, dc] of dirs) {
    const cells: number[] = []
    let ok = true
    for (let k = 0; k < 4; k++) {
      const rr = r + dr * k, cc = c + dc * k
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) { ok = false; break }
      cells.push(idx(rr, cc))
    }
    if (ok) ls.push(cells)
  }
  return ls
})()

export function winnerOf(board: Cell[]): { winner: Disc | null; line: number[] | null } {
  for (const ln of LINES) {
    const a = board[ln[0]]
    if (a && board[ln[1]] === a && board[ln[2]] === a && board[ln[3]] === a) return { winner: a, line: ln }
  }
  return { winner: null, line: null }
}

export function drop(s: C4State, col: number, who: Disc): C4State {
  if (s.winner || s.turn !== who) return s
  const r = lowestEmpty(s.board, col)
  if (r < 0) return s
  const board = s.board.slice(); board[idx(r, col)] = who
  const { winner, line } = winnerOf(board)
  const full = legalCols(board).length === 0
  const result: Disc | 'draw' | null = winner ? winner : full ? 'draw' : null
  const turn = result ? null : other(who)
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} dropped in column ${col + 1}.`)
  if (result === 'draw') log = push(log, 'sys', 'The board fills — a draw.')
  else if (winner) log = push(log, winner === s.you ? 'you' : 'ai', `${winner === s.you ? 'You connect four — you win' : 'Rival connects four'}.`)
  return Object.assign({}, s, { board, turn, winner: result, line, log })
}

// ===== AI: alpha-beta with a window heuristic =====
function evalWindow(board: Cell[], me: Disc): number {
  const opp = other(me)
  let score = 0
  for (const ln of LINES) {
    let mine = 0, theirs = 0
    for (const i of ln) { const v = board[i]; if (v === me) mine++; else if (v === opp) theirs++ }
    if (mine && theirs) continue
    if (mine === 4) score += 100000
    else if (mine === 3) score += 60
    else if (mine === 2) score += 8
    if (theirs === 4) score -= 100000
    else if (theirs === 3) score -= 80   // weight blocking slightly higher
    else if (theirs === 2) score -= 8
  }
  // centre control
  for (let r = 0; r < H; r++) { const v = board[idx(r, 3)]; if (v === me) score += 6; else if (v === opp) score -= 6 }
  return score
}

function search(board: Cell[], depth: number, alpha: number, beta: number, toMove: Disc, me: Disc): number {
  const { winner } = winnerOf(board)
  if (winner === me) return 1_000_000 - (6 - depth)
  if (winner === other(me)) return -1_000_000 + (6 - depth)
  const cols = legalCols(board)
  if (cols.length === 0) return 0
  if (depth === 0) return evalWindow(board, me)
  // explore centre-first for better pruning
  cols.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3))
  if (toMove === me) {
    let best = -Infinity
    for (const c of cols) {
      const nb = board.slice(); nb[idx(lowestEmpty(board, c), c)] = toMove
      best = Math.max(best, search(nb, depth - 1, alpha, beta, other(toMove), me))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const c of cols) {
      const nb = board.slice(); nb[idx(lowestEmpty(board, c), c)] = toMove
      best = Math.min(best, search(nb, depth - 1, alpha, beta, other(toMove), me))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

export function aiMove(s: C4State): C4State {
  if (s.winner || s.turn !== 'y') return s
  const me: Disc = 'y'
  const cols = legalCols(s.board)
  let best = -Infinity
  const scored: { c: number; v: number }[] = []
  for (const c of cols) {
    const nb = s.board.slice(); nb[idx(lowestEmpty(s.board, c), c)] = me
    const v = search(nb, 6, -Infinity, Infinity, other(me), me)
    scored.push({ c, v })
    if (v > best) best = v
  }
  // random tie-break among (near-)best moves for variety
  const top = scored.filter(o => o.v >= best - 1).map(o => o.c)
  const choice = top[(Math.random() * top.length) | 0]
  return drop(s, choice, me)
}
