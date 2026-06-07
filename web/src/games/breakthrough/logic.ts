/* BREAKTHROUGH — logic (built for this codebase, not ported).
   8x8. You are White at the bottom (rows 6 & 7) and move UP; the AI is Black at the top
   (rows 0 & 1) and moves DOWN. A pawn steps one square straight- or diagonally-forward onto
   an EMPTY square, or captures DIAGONALLY-forward onto an enemy. No straight capture, no
   double move, no en passant. Reach the far home row to win (also win if the rival has no
   pieces or no legal move). The AI is alpha-beta minimax over material + advancement +
   defense. */

export const N = 8
export type Pawn = 'w' | 'b'
export type Cell = Pawn | null
export interface LogEntry { t: string; x: string }
export interface Move { from: number; to: number; cap: boolean }

export interface BreakthroughState {
  board: Cell[]            // length 64, index = r*8 + c
  turn: Pawn | null
  you: Pawn
  winner: Pawn | null
  last: Move | null
  log: LogEntry[]
}

const other = (p: Pawn): Pawn => p === 'w' ? 'b' : 'w'
const idx = (r: number, c: number) => r * N + c
const rowOf = (i: number) => Math.floor(i / N)
const colOf = (i: number) => i % N
// White (you) moves up = decreasing row; Black moves down = increasing row.
const dirOf = (p: Pawn) => p === 'w' ? -1 : 1
const goalRow = (p: Pawn) => p === 'w' ? 0 : N - 1

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): BreakthroughState {
  const board: Cell[] = new Array(N * N).fill(null)
  for (let c = 0; c < N; c++) {
    board[idx(0, c)] = 'b'; board[idx(1, c)] = 'b'
    board[idx(6, c)] = 'w'; board[idx(7, c)] = 'w'
  }
  return {
    board, turn: 'w', you: 'w', winner: null, last: null,
    log: [{ t: 'sys', x: 'You are White and move up. Step forward, capture only on the diagonals, and reach the top row to break through.' }],
  }
}

/** Every legal move for `who` on `board`. */
export function legalMoves(board: Cell[], who: Pawn): Move[] {
  const out: Move[] = []
  const dr = dirOf(who)
  for (let i = 0; i < N * N; i++) {
    if (board[i] !== who) continue
    const r = rowOf(i), c = colOf(i)
    const nr = r + dr
    if (nr < 0 || nr >= N) continue
    // straight forward — only onto empty (never a capture)
    if (board[idx(nr, c)] === null) out.push({ from: i, to: idx(nr, c), cap: false })
    // diagonals — onto empty (move) or enemy (capture)
    for (const dc of [-1, 1]) {
      const nc = c + dc
      if (nc < 0 || nc >= N) continue
      const t = board[idx(nr, nc)]
      if (t === null) out.push({ from: i, to: idx(nr, nc), cap: false })
      else if (t !== who) out.push({ from: i, to: idx(nr, nc), cap: true })
    }
  }
  return out
}

export function counts(board: Cell[]): { w: number; b: number } {
  let w = 0, b = 0
  for (const v of board) { if (v === 'w') w++; else if (v === 'b') b++ }
  return { w, b }
}

function apply(board: Cell[], m: Move, who: Pawn): Cell[] {
  const nb = board.slice()
  nb[m.from] = null
  nb[m.to] = who
  return nb
}

function coord(i: number) { return `${'abcdefgh'[colOf(i)]}${N - rowOf(i)}` }

function finish(s: BreakthroughState, board: Cell[], log: LogEntry[], winner: Pawn): BreakthroughState {
  const youWon = winner === s.you
  return Object.assign({}, s, { board, turn: null, winner, log: push(log, youWon ? 'you' : 'ai', youWon ? 'You broke through — you win!' : 'The rival broke through. Rival wins.') })
}

export function move(s: BreakthroughState, m: Move, who: Pawn): BreakthroughState {
  if (s.winner || s.turn !== who) return s
  // validate against legal list
  if (!legalMoves(s.board, who).some(x => x.from === m.from && x.to === m.to)) return s
  const board = apply(s.board, m, who)
  const opp = other(who)
  const cap = s.board[m.to] !== null
  let log = push(s.log, who === s.you ? 'you' : 'ai',
    `${who === s.you ? 'You' : 'Rival'} ${cap ? 'captured at' : 'moved to'} ${coord(m.to)}.`)
  // reached the far home row?
  if (rowOf(m.to) === goalRow(who)) return finish(Object.assign({}, s, { last: { ...m, cap } }), board, log, who)
  // opponent has no pieces or no moves?
  const oppMoves = legalMoves(board, opp)
  if (!oppMoves.length) {
    log = push(log, 'sys', `${opp === s.you ? 'You have' : 'Rival has'} no move left.`)
    return finish(Object.assign({}, s, { last: { ...m, cap } }), board, log, who)
  }
  return Object.assign({}, s, { board, turn: opp, last: { ...m, cap }, log })
}

// ===== AI: alpha-beta minimax =====
// Eval (from `me`'s view) = material + advancement toward the goal row + small defense term.
function evalBoard(board: Cell[], me: Pawn): number {
  const opp = other(me)
  let score = 0
  for (let i = 0; i < N * N; i++) {
    const v = board[i]
    if (!v) continue
    const r = rowOf(i)
    // advancement: rows progressed toward this pawn's goal (0..N-1)
    const adv = v === 'w' ? (N - 1 - r) : r
    // defense: is this pawn guarded by a friendly pawn one rank behind on a diagonal?
    const back = r - dirOf(v)
    let defended = false
    if (back >= 0 && back < N) {
      const c = colOf(i)
      for (const dc of [-1, 1]) {
        const nc = c + dc
        if (nc >= 0 && nc < N && board[idx(back, nc)] === v) { defended = true; break }
      }
    }
    const val = 100 + adv * adv * 1.4 + (defended ? 6 : 0)
    score += v === me ? val : -val
  }
  return score
}

function search(board: Cell[], toMove: Pawn, me: Pawn, depth: number, alpha: number, beta: number): number {
  // terminal: someone already on a home row
  for (let c = 0; c < N; c++) {
    if (board[idx(0, c)] === 'w') return (me === 'w' ? 1 : -1) * 1e6
    if (board[idx(N - 1, c)] === 'b') return (me === 'b' ? 1 : -1) * 1e6
  }
  const moves = legalMoves(board, toMove)
  if (!moves.length) return (toMove === me ? -1 : 1) * 1e6  // side to move is stuck = loss
  if (depth === 0) return evalBoard(board, me)
  // order captures first for better pruning
  moves.sort((a, b) => Number(b.cap) - Number(a.cap))
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(apply(board, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(apply(board, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}

const DEPTH = 4

export function aiMove(s: BreakthroughState): BreakthroughState {
  if (s.winner || s.turn !== 'b') return s
  const me: Pawn = 'b'
  const moves = legalMoves(s.board, me)
  if (!moves.length) return s
  moves.sort((a, b) => Number(b.cap) - Number(a.cap))
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(apply(s.board, m, me), other(me), me, DEPTH - 1, -Infinity, Infinity)
      + Math.random() * 0.5  // tiny tie-break
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6)
  const choice = top[(Math.random() * top.length) | 0].m
  return move(s, choice, me)
}
