/* CANADIAN / INTERNATIONAL CHECKERS — pure logic + AI (built for this codebase).
   12x12 draughts on the 72 dark squares. You are player 0 (bottom, rows 7–11) and move
   UP; the AI is player 1 (top, rows 0–4) and moves DOWN. Each side starts with 30 men.
   Men step one diagonal FORWARD to an empty dark square; they CAPTURE forward OR backward
   by jumping an adjacent enemy into the empty square beyond, chaining multi-jumps. Kings
   are FLYING: they glide any distance along an empty diagonal, and capture by flying over
   a single enemy at any distance and landing any distance beyond. MAXIMUM CAPTURE is
   enforced: if any capture exists you must capture, taking a move with the most pieces.
   A man promotes only if it ENDS its move on the last row (not when passing through during
   a jump). AI is alpha-beta minimax over material (king≈3 men) + advancement + centre. */

export const N = 12

// Square contents: 0|1 = a man of that player, 'K0'|'K1' = a king, null = empty dark square
// (light squares are never used; they stay null).
export type Player = 0 | 1
export type Cell = 0 | 1 | 'K0' | 'K1' | null

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface Move {
  from: number
  to: number
  caps: number[] // captured square indices (the enemy pieces removed), in jump order
  path: number[] // landing squares from start to finish (for animation / highlight)
}

export interface State {
  board: Cell[]            // length 144, index = r*N + c
  turn: Player | null      // whose move it is; null once the game is over
  you: Player              // the human (always 0 here)
  winner: Player | null    // set when someone has won; null while in progress (no draws stored)
  last: { from: number; to: number } | null
  log: LogEntry[]
  noCap: number            // plies since the last capture (for the AI draw/cap heuristic)
}

const idx = (r: number, c: number) => r * N + c
const rowOf = (i: number) => Math.floor(i / N)
const colOf = (i: number) => i % N
const inB = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const isDark = (i: number) => (rowOf(i) + colOf(i)) % 2 === 1

export const isKing = (p: Cell): boolean => p === 'K0' || p === 'K1'
export const ownerOf = (p: Cell): Player | null =>
  p === 0 || p === 'K0' ? 0 : p === 1 || p === 'K1' ? 1 : null
const other = (p: Player): Player => (p === 0 ? 1 : 0)

const FILES = 'ABCDEFGHIJKL'
const sq = (i: number) => `${FILES[colOf(i)]}${N - rowOf(i)}`

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

export function makeGame(): State {
  const board: Cell[] = new Array(N * N).fill(null)
  for (let i = 0; i < N * N; i++) {
    if (!isDark(i)) continue
    const r = rowOf(i)
    if (r <= 4) board[i] = 1            // top five rows: AI (player 1)
    else if (r >= 7) board[i] = 0       // bottom five rows: you (player 0)
  }
  return {
    board,
    turn: 0,
    you: 0,
    winner: null,
    last: null,
    noCap: 0,
    log: [{ t: 'sys', x: 'You are the light men at the bottom and move first. Step diagonally forward; captures are forced and you must take the longest one. Crown a man at the far row to make a flying king.' }],
  }
}

export function counts(board: Cell[]): { p0: number; p1: number; k0: number; k1: number } {
  let p0 = 0, p1 = 0, k0 = 0, k1 = 0
  for (const p of board) {
    if (p === 0) p0++
    else if (p === 'K0') { p0++; k0++ }
    else if (p === 1) p1++
    else if (p === 'K1') { p1++; k1++ }
  }
  return { p0, p1, k0, k1 }
}

// Forward direction (row delta) for a man of the given player. Player 0 moves up (-1).
const manFwd = (pl: Player) => (pl === 0 ? -1 : 1)

const DIAGS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
]

// ---------- capture generation (max-capture aware) ----------
// Explore every capture sequence from square `i`; only the longest chains are returned by
// legalMoves, but jumpsFrom returns all maximal sequences from this square.
function jumpsFrom(board: Cell[], i: number): Move[] {
  const piece = board[i]
  const owner = ownerOf(piece)
  if (owner == null) return []
  const enemy = other(owner)
  const out: Move[] = []

  // `captured` holds enemy square indices already taken this chain — a piece can be jumped
  // only once, and a flying king's path can't cross the same captured piece twice.
  function explore(at: number, king: boolean, captured: number[], path: number[]) {
    let extended = false
    const r0 = rowOf(at), c0 = colOf(at)
    for (const [dr, dc] of DIAGS) {
      if (king) {
        // scan outward for the first piece on this diagonal
        let r = r0 + dr, c = c0 + dc
        // glide over empties
        while (inB(r, c) && board[idx(r, c)] === null) { r += dr; c += dc }
        if (!inB(r, c)) continue
        const victim = idx(r, c)
        // must be an enemy not already captured, and not crossing a captured square en route
        if (ownerOf(board[victim]) !== enemy) continue
        if (captured.includes(victim)) continue
        // landing squares: any number of empties beyond the victim
        let lr = r + dr, lc = c + dc
        while (inB(lr, lc) && board[idx(lr, lc)] === null) {
          const land = idx(lr, lc)
          extended = true
          explore(land, king, captured.concat([victim]), path.concat([land]))
          lr += dr; lc += dc
        }
        // if the square right after the victim is blocked, no landing on this diagonal
      } else {
        // man: jump an ADJACENT enemy (forward OR backward) to the square just beyond
        const mr = r0 + dr, mc = c0 + dc
        const lr = r0 + 2 * dr, lc = c0 + 2 * dc
        if (!inB(lr, lc)) continue
        const mid = idx(mr, mc), land = idx(lr, lc)
        if (ownerOf(board[mid]) !== enemy) continue
        if (captured.includes(mid)) continue
        if (board[land] !== null) continue
        extended = true
        explore(land, king, captured.concat([mid]), path.concat([land]))
      }
    }
    if (!extended && captured.length) {
      out.push({ from: i, to: at, caps: captured.slice(), path: path.slice() })
    }
  }

  explore(i, isKing(piece), [], [i])
  return out
}

function stepsFrom(board: Cell[], i: number): Move[] {
  const piece = board[i]
  const owner = ownerOf(piece)
  if (owner == null) return []
  const out: Move[] = []
  const r0 = rowOf(i), c0 = colOf(i)
  if (isKing(piece)) {
    for (const [dr, dc] of DIAGS) {
      let r = r0 + dr, c = c0 + dc
      while (inB(r, c) && board[idx(r, c)] === null) {
        out.push({ from: i, to: idx(r, c), caps: [], path: [i, idx(r, c)] })
        r += dr; c += dc
      }
    }
  } else {
    const dr = manFwd(owner)
    for (const dc of [-1, 1]) {
      const nr = r0 + dr, nc = c0 + dc
      if (!inB(nr, nc)) continue
      const land = idx(nr, nc)
      if (board[land] === null) out.push({ from: i, to: land, caps: [], path: [i, land] })
    }
  }
  return out
}

export function legalMoves(s: State, who?: Player): Move[] {
  const turn = who == null ? s.turn : who
  if (turn == null) return []
  const board = s.board
  const caps: Move[] = []
  const steps: Move[] = []
  for (let i = 0; i < N * N; i++) {
    if (ownerOf(board[i]) !== turn) continue
    const j = jumpsFrom(board, i)
    if (j.length) caps.push(...j)
    else steps.push(...stepsFrom(board, i))
  }
  if (!caps.length) return steps
  // MAXIMUM CAPTURE: only the chains that take the most pieces are legal.
  let max = 0
  for (const m of caps) if (m.caps.length > max) max = m.caps.length
  return caps.filter(m => m.caps.length === max)
}

// legal moves originating from one square (click-to-select highlighting)
export function movesFrom(s: State, from: number): Move[] {
  return legalMoves(s).filter(m => m.from === from)
}

// Apply a fully-resolved move to a raw board (captures removed AFTER the chain; promotion
// only if the man ENDS on the far row).
function applyToBoard(board: Cell[], m: Move): Cell[] {
  const nb = board.slice()
  const piece = nb[m.from]
  nb[m.from] = null
  for (const cap of m.caps) nb[cap] = null
  const owner = ownerOf(piece)!
  let placed: Cell = piece
  if (!isKing(piece)) {
    const lastRow = owner === 0 ? 0 : N - 1
    if (rowOf(m.to) === lastRow) placed = (owner === 0 ? 'K0' : 'K1')
  }
  nb[m.to] = placed
  return nb
}

function finish(s: State, board: Cell[], log: LogEntry[], winner: Player, last: State['last'], noCap: number): State {
  const youWon = winner === s.you
  const c = counts(board)
  const left = winner === 0 ? c.p0 : c.p1
  const msg = `${youWon ? 'You win' : 'Rival wins'} — ${left} ${left === 1 ? 'piece' : 'pieces'} left standing.`
  return { ...s, board, turn: null, winner, last, noCap, log: push(log, youWon ? 'you' : 'ai', msg) }
}

export function applyMove(s: State, m: Move): State {
  if (s.winner != null || s.turn == null) return s
  const who = s.turn
  // validate against the legal set (same from/to and same number of captures)
  const legal = legalMoves(s)
  const ok = legal.find(L => L.from === m.from && L.to === m.to && L.caps.length === m.caps.length)
  if (!ok) return s

  const board = applyToBoard(s.board, ok)
  const wasMan = !isKing(s.board[ok.from])
  const promoted = wasMan && isKing(board[ok.to])
  const mine = who === s.you
  let detail: string
  if (ok.caps.length) {
    detail = ok.caps.length === 1
      ? `${mine ? 'You' : 'Rival'} captured ${sq(ok.from)}→${sq(ok.to)}.`
      : `${mine ? 'You' : 'Rival'} swept ${ok.caps.length} pieces to ${sq(ok.to)}.`
  } else {
    detail = `${mine ? 'You' : 'Rival'} moved ${sq(ok.from)}→${sq(ok.to)}.`
  }
  let log = push(s.log, mine ? 'you' : 'ai', detail)
  if (promoted) log = push(log, 'sys', `${mine ? 'Your' : "Rival's"} man is crowned a King at ${sq(ok.to)}.`)

  const noCap = ok.caps.length ? 0 : s.noCap + 1
  const last = { from: ok.from, to: ok.to }
  const opp = other(who)
  const oppMoves = legalMoves({ ...s, board, turn: opp })
  if (!oppMoves.length) {
    // opponent has no legal move (no pieces or fully blocked) — current player wins
    return finish(s, board, log, who, last, noCap)
  }
  return { ...s, board, turn: opp, last, noCap, log }
}

// ===== AI: alpha-beta minimax =====
const MAN = 100
const KING = 300 // a king is worth ~3 men

function evalBoard(board: Cell[], me: Player): number {
  let score = 0
  for (let i = 0; i < N * N; i++) {
    const p = board[i]
    if (p == null) continue
    const owner = ownerOf(p)!
    const king = isKing(p)
    let v = king ? KING : MAN
    const r = rowOf(i), c = colOf(i)
    if (!king) {
      // advancement toward the crowning row
      const adv = owner === 0 ? (N - 1 - r) : r
      v += adv * 3
    }
    // centre control (central files are safer / more mobile)
    const centre = (N - 1) / 2 - Math.abs(c - (N - 1) / 2)
    v += centre
    score += owner === me ? v : -v
  }
  return score
}

function searchState(s: State, me: Player, depth: number, alpha: number, beta: number): number {
  if (s.winner != null) {
    return s.winner === me ? 100000 + depth : -100000 - depth
  }
  const toMove = s.turn!
  const moves = legalMoves(s)
  if (!moves.length) {
    // side to move is stuck and therefore loses
    return toMove === me ? -100000 - depth : 100000 + depth
  }
  if (depth === 0) return evalBoard(s.board, me)
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, searchState(applyMove(s, m), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, searchState(applyMove(s, m), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

// Pick depth based on branching: forced single-capture positions can search deep cheaply,
// quiet 12x12 positions (wide branching) must stay shallow to remain fast.
function pickDepth(moveCount: number, anyCapture: boolean): number {
  if (anyCapture) return moveCount <= 6 ? 7 : 5
  if (moveCount <= 8) return 5
  if (moveCount <= 14) return 4
  return 3
}

export function aiTurn(s: State, depthOverride?: number): State {
  if (s.winner != null || s.turn == null) return s
  const me = s.turn
  const moves = legalMoves(s)
  if (!moves.length) return s
  const anyCapture = moves[0].caps.length > 0
  const depth = depthOverride ?? pickDepth(moves.length, anyCapture)
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = searchState(applyMove(s, m), me, depth - 1, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return applyMove(s, choice)
}
