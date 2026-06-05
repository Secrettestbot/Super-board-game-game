/* CHECKERS / ENGLISH DRAUGHTS — logic + AI (built for this codebase, not ported).
   8x8, pieces on dark squares only. You are RED at the bottom (rows 5–7) and move UP;
   the AI is BLACK at the top (rows 0–2) and moves DOWN. Men step one diagonal forward to
   an empty dark square; captures jump an adjacent enemy to the empty square beyond and may
   chain. Captures are MANDATORY. Reaching the far row promotes a man to a KING (moves both
   ways). No legal move = you lose. AI is minimax + alpha-beta over material + position. */

export const N = 8
export type Side = 'r' | 'b'
// piece codes: 'r' red man, 'R' red king, 'b' black man, 'B' black king, null empty
export type Piece = 'r' | 'R' | 'b' | 'B' | null
export interface LogEntry { t: string; x: string }

export interface Move {
  from: number
  to: number
  caps: number[]        // captured square indices (>=1 for a jump, chained jumps list all)
  path: number[]        // landing squares from start to finish (for animation/log)
}

export interface CheckersState {
  board: Piece[]         // length 64, index = r*8 + c
  turn: Side | null
  you: Side
  winner: Side | null
  last: { from: number; to: number } | null
  log: LogEntry[]
}

const idx = (r: number, c: number) => r * N + c
const rowOf = (i: number) => Math.floor(i / N)
const colOf = (i: number) => i % N
const inB = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const isRed = (p: Piece) => p === 'r' || p === 'R'
const isBlack = (p: Piece) => p === 'b' || p === 'B'
const isKing = (p: Piece) => p === 'R' || p === 'B'
const sideOf = (p: Piece): Side | null => (isRed(p) ? 'r' : isBlack(p) ? 'b' : null)
const other = (s: Side): Side => (s === 'r' ? 'b' : 'r')
const isDark = (i: number) => (rowOf(i) + colOf(i)) % 2 === 1
const sq = (i: number) => `${'ABCDEFGH'[colOf(i)]}${rowOf(i) + 1}`

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

// Red kings on row 0, red men move up (-1). Black men move down (+1), kings either way.
function dirsFor(p: Piece): number[] {
  if (p === 'r') return [-1]
  if (p === 'b') return [1]
  return [-1, 1] // king
}

export function makeGame(): CheckersState {
  const board: Piece[] = new Array(N * N).fill(null)
  for (let i = 0; i < N * N; i++) {
    if (!isDark(i)) continue
    const r = rowOf(i)
    if (r <= 2) board[i] = 'b'
    else if (r >= 5) board[i] = 'r'
  }
  return {
    board, turn: 'r', you: 'r', winner: null, last: null,
    log: [{ t: 'sys', x: 'You are Red and move first. Step forward on the dark squares; captures are forced. Crown a man at the top to make a king.' }],
  }
}

export function counts(board: Piece[]): { r: number; b: number; rk: number; bk: number } {
  let r = 0, b = 0, rk = 0, bk = 0
  for (const p of board) {
    if (p === 'r') r++
    else if (p === 'R') { r++; rk++ }
    else if (p === 'b') b++
    else if (p === 'B') { b++; bk++ }
  }
  return { r, b, rk, bk }
}

// ----- move generation (captures mandatory) -----
function jumpsFrom(board: Piece[], i: number): Move[] {
  const p = board[i]
  const side = sideOf(p)
  if (!side) return []
  const out: Move[] = []
  // recursive multi-jump explorer
  function explore(curBoard: Piece[], at: number, piece: Piece, caps: number[], path: number[]) {
    let extended = false
    for (const dr of dirsFor(piece)) {
      for (const dc of [-1, 1]) {
        const r = rowOf(at), c = colOf(at)
        const mr = r + dr, mc = c + dc        // square jumped over
        const lr = r + 2 * dr, lc = c + 2 * dc // landing square
        if (!inB(lr, lc)) continue
        const mid = idx(mr, mc), land = idx(lr, lc)
        const midP = curBoard[mid]
        if (sideOf(midP) !== other(side)) continue
        if (curBoard[land] !== null) continue
        if (caps.includes(mid)) continue
        // make the jump on a working board
        const nb = curBoard.slice()
        nb[at] = null
        nb[mid] = null
        // promotion mid-chain stops the chain for a man that reaches the far row
        let np = piece
        let promoted = false
        if (piece === 'r' && lr === 0) { np = 'R'; promoted = true }
        else if (piece === 'b' && lr === N - 1) { np = 'B'; promoted = true }
        nb[land] = np
        extended = true
        const ncaps = caps.concat([mid])
        const npath = path.concat([land])
        if (promoted) {
          out.push({ from: i, to: land, caps: ncaps, path: npath })
        } else {
          explore(nb, land, np, ncaps, npath)
        }
      }
    }
    if (!extended && caps.length) out.push({ from: i, to: at, caps, path })
  }
  explore(board, i, p, [], [i])
  return out
}

function stepsFrom(board: Piece[], i: number): Move[] {
  const p = board[i]
  if (!p) return []
  const out: Move[] = []
  const r = rowOf(i), c = colOf(i)
  for (const dr of dirsFor(p)) {
    for (const dc of [-1, 1]) {
      const nr = r + dr, nc = c + dc
      if (!inB(nr, nc)) continue
      const land = idx(nr, nc)
      if (board[land] === null) out.push({ from: i, to: land, caps: [], path: [i, land] })
    }
  }
  return out
}

export function legalMoves(board: Piece[], who: Side): Move[] {
  const caps: Move[] = []
  const steps: Move[] = []
  for (let i = 0; i < N * N; i++) {
    if (sideOf(board[i]) !== who) continue
    const j = jumpsFrom(board, i)
    if (j.length) caps.push(...j)
    else steps.push(...stepsFrom(board, i))
  }
  // captures are mandatory: if any exist, only captures are legal
  return caps.length ? caps : steps
}

// legal moves originating from a single square (for click-to-select highlighting)
export function movesFrom(board: Piece[], who: Side, from: number): Move[] {
  return legalMoves(board, who).filter(m => m.from === from)
}

function applyMove(board: Piece[], m: Move): Piece[] {
  const nb = board.slice()
  let p = nb[m.from]
  nb[m.from] = null
  for (const cap of m.caps) nb[cap] = null
  // promotion at landing
  if (p === 'r' && rowOf(m.to) === 0) p = 'R'
  else if (p === 'b' && rowOf(m.to) === N - 1) p = 'B'
  nb[m.to] = p
  return nb
}

function finish(s: CheckersState, board: Piece[], log: LogEntry[], winner: Side): CheckersState {
  const youWon = winner === s.you
  const c = counts(board)
  const survivors = winner === 'r' ? c.r : c.b
  const msg = `${youWon ? 'You win' : 'Rival wins'} — ${survivors} ${survivors === 1 ? 'piece' : 'pieces'} left standing.`
  return Object.assign({}, s, { board, turn: null, winner, log: push(log, youWon ? 'you' : 'ai', msg) })
}

export function move(s: CheckersState, m: Move, who: Side): CheckersState {
  if (s.winner || s.turn !== who) return s
  // validate against legal set
  const legal = legalMoves(s.board, who)
  const ok = legal.find(L => L.from === m.from && L.to === m.to && L.caps.length === m.caps.length)
  if (!ok) return s
  const board = applyMove(s.board, ok)
  const wasMan = !isKing(s.board[ok.from])
  const promoted = wasMan && isKing(board[ok.to])
  const mine = who === s.you
  let detail: string
  if (ok.caps.length) detail = `${mine ? 'You' : 'Rival'} jumped ${ok.caps.length === 1 ? sq(ok.from) + '→' + sq(ok.to) : ok.caps.length + ' in a row to ' + sq(ok.to)}.`
  else detail = `${mine ? 'You' : 'Rival'} moved ${sq(ok.from)}→${sq(ok.to)}.`
  let log = push(s.log, mine ? 'you' : 'ai', detail)
  if (promoted) log = push(log, 'sys', `${mine ? 'Your' : "Rival's"} man is crowned a King at ${sq(ok.to)}.`)

  const opp = other(who)
  const oppMoves = legalMoves(board, opp)
  if (!oppMoves.length) {
    // opponent cannot move (or has no pieces) — current player wins
    return finish(Object.assign({}, s, { last: { from: ok.from, to: ok.to } }), board, log, who)
  }
  return Object.assign({}, s, { board, turn: opp, last: { from: ok.from, to: ok.to }, log })
}

// ===== AI: minimax with alpha-beta =====
const MAN = 100, KING = 170
function evalBoard(board: Piece[], me: Side): number {
  let score = 0
  for (let i = 0; i < N * N; i++) {
    const p = board[i]
    if (!p) continue
    const s = sideOf(p)!
    const king = isKing(p)
    let v = king ? KING : MAN
    // advancement bonus for men (closer to promotion), centre bonus for all
    const r = rowOf(i), c = colOf(i)
    if (!king) {
      const adv = s === 'r' ? (N - 1 - r) : r   // distance travelled toward crowning
      v += adv * 4
    }
    const centre = 3.5 - Math.abs(c - 3.5)       // 0..3.5, central files safer
    v += centre
    score += s === me ? v : -v
  }
  return score
}

function search(board: Piece[], toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, toMove)
  if (!moves.length) {
    // toMove loses; terminal — score heavily in favour of the other side
    return toMove === me ? -100000 - depth : 100000 + depth
  }
  if (depth === 0) return evalBoard(board, me)
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(board, m), other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(applyMove(board, m), other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

export function aiMove(s: CheckersState): CheckersState {
  if (s.winner || s.turn !== 'b') return s
  const me: Side = 'b'
  const moves = legalMoves(s.board, me)
  if (!moves.length) return s
  const DEPTH = 6
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(applyMove(s.board, m), other(me), me, DEPTH - 1, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return move(s, choice, me)
}
