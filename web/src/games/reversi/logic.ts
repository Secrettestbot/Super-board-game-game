/* REVERSI / OTHELLO — logic (built for this codebase, not ported).
   8x8. You are Black and move first; the AI is White and uses alpha-beta over a positional
   weight matrix plus mobility. Place a disc so it brackets a straight line of the opponent's
   discs against one of yours — those flip. No legal move means you pass. Most discs wins. */

export const N = 8
export type Disc = 'b' | 'w'
export type Cell = Disc | null
export interface LogEntry { t: string; x: string }

export interface ReversiState {
  board: Cell[]            // length 64, index = r*8 + c
  turn: Disc | null
  you: Disc
  winner: Disc | 'draw' | null
  last: number | null
  log: LogEntry[]
}

const other = (d: Disc): Disc => d === 'b' ? 'w' : 'b'
const idx = (r: number, c: number) => r * N + c
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): ReversiState {
  const board: Cell[] = new Array(N * N).fill(null)
  board[idx(3, 3)] = 'w'; board[idx(3, 4)] = 'b'
  board[idx(4, 3)] = 'b'; board[idx(4, 4)] = 'w'
  return {
    board, turn: 'b', you: 'b', winner: null, last: null,
    log: [{ t: 'sys', x: 'You are Black and move first. Flank the rival to flip discs; corners are gold.' }],
  }
}

// cells that would flip if `who` plays at i (empty list = illegal)
function flips(board: Cell[], i: number, who: Disc): number[] {
  if (board[i]) return []
  const r0 = Math.floor(i / N), c0 = i % N
  const opp = other(who)
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const run: number[] = []
    let r = r0 + dr, c = c0 + dc
    while (r >= 0 && r < N && c >= 0 && c < N && board[idx(r, c)] === opp) { run.push(idx(r, c)); r += dr; c += dc }
    if (run.length && r >= 0 && r < N && c >= 0 && c < N && board[idx(r, c)] === who) out.push(...run)
  }
  return out
}

export function legalMoves(board: Cell[], who: Disc): number[] {
  const out: number[] = []
  for (let i = 0; i < N * N; i++) if (!board[i] && flips(board, i, who).length) out.push(i)
  return out
}

export function counts(board: Cell[]): { b: number; w: number } {
  let b = 0, w = 0
  for (const v of board) { if (v === 'b') b++; else if (v === 'w') w++ }
  return { b, w }
}

function finish(s: ReversiState, board: Cell[], log: LogEntry[]): ReversiState {
  const { b, w } = counts(board)
  const winner: Disc | 'draw' = b === w ? 'draw' : b > w ? 'b' : 'w'
  const youWon = winner === s.you
  const msg = winner === 'draw' ? `An even split — ${b}–${w}.` : `${youWon ? 'You win' : 'Rival wins'} ${Math.max(b, w)}–${Math.min(b, w)}.`
  return Object.assign({}, s, { board, turn: null, winner, log: push(log, winner === s.you ? 'you' : 'ai', msg) })
}

export function place(s: ReversiState, i: number, who: Disc): ReversiState {
  if (s.winner || s.turn !== who) return s
  const fl = flips(s.board, i, who)
  if (!fl.length) return s
  const board = s.board.slice(); board[i] = who; for (const f of fl) board[f] = who
  const r = Math.floor(i / N), c = i % N
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} played ${'ABCDEFGH'[c]}${r + 1}, flipping ${fl.length}.`)
  const opp = other(who)
  if (legalMoves(board, opp).length) return Object.assign({}, s, { board, turn: opp, last: i, log })
  // opponent has no move
  if (legalMoves(board, who).length) {
    log = push(log, 'sys', `${opp === s.you ? 'You have' : 'Rival has'} no move — pass.`)
    return Object.assign({}, s, { board, turn: who, last: i, log })
  }
  // neither can move — game over
  return finish(Object.assign({}, s, { last: i }), board, log)
}

// ===== AI: alpha-beta over a positional weight matrix =====
const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
]
function evalBoard(board: Cell[], me: Disc): number {
  const opp = other(me)
  let pos = 0
  for (let i = 0; i < N * N; i++) { const v = board[i]; if (v === me) pos += WEIGHTS[i]; else if (v === opp) pos -= WEIGHTS[i] }
  const myMob = legalMoves(board, me).length, opMob = legalMoves(board, opp).length
  const mob = (myMob + opMob) ? 100 * (myMob - opMob) / (myMob + opMob) : 0
  return pos + mob
}
function apply(board: Cell[], i: number, who: Disc): Cell[] {
  const nb = board.slice(); nb[i] = who; for (const f of flips(board, i, who)) nb[f] = who; return nb
}
function search(board: Cell[], toMove: Disc, me: Disc, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return evalBoard(board, me)
  const moves = legalMoves(board, toMove)
  if (!moves.length) {
    // pass; if neither can move, evaluate terminally by disc difference
    if (!legalMoves(board, other(toMove)).length) {
      const { b, w } = counts(board); const diff = (me === 'b' ? b - w : w - b)
      return diff * 1000
    }
    return search(board, other(toMove), me, depth, alpha, beta)
  }
  if (toMove === me) {
    let best = -Infinity
    for (const i of moves) { best = Math.max(best, search(apply(board, i, toMove), other(toMove), me, depth - 1, alpha, beta)); alpha = Math.max(alpha, best); if (alpha >= beta) break }
    return best
  } else {
    let best = Infinity
    for (const i of moves) { best = Math.min(best, search(apply(board, i, toMove), other(toMove), me, depth - 1, alpha, beta)); beta = Math.min(beta, best); if (alpha >= beta) break }
    return best
  }
}

export function aiMove(s: ReversiState): ReversiState {
  if (s.winner || s.turn !== 'w') return s
  const me: Disc = 'w'
  const moves = legalMoves(s.board, me)
  if (!moves.length) return s
  let best = -Infinity
  const scored: { i: number; v: number }[] = []
  for (const i of moves) {
    const v = search(apply(s.board, i, me), other(me), me, 4, -Infinity, Infinity)
    scored.push({ i, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.i)
  const choice = top[(Math.random() * top.length) | 0]
  return place(s, choice, me)
}
