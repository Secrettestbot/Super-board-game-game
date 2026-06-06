/* HNEFATAFL — pure logic (Brandubh, the 7x7 variant). Built for this codebase, no port.
   Asymmetric tafl: a KING + 4 DEFENDERS sit on the central THRONE and its four orthogonal
   neighbours; 8 ATTACKERS ring the board, two on each edge midline (the cross arms). Every
   piece moves like a chess ROOK. The throne (3,3) and the four CORNERS are restricted — only
   the king may stop on them, and they act as hostile flanking squares. Captures are custodial:
   sandwich an enemy along a row/column WITH YOUR MOVE (never by moving into a sandwich
   yourself). The king is captured when boxed on all four orthogonal sides by attackers (or the
   throne acting as a wall). YOU play the defenders/king; the AI plays the attackers and moves
   FIRST.

   Win: DEFENDERS win if the KING reaches any corner; ATTACKERS win if they CAPTURE the king.
   String winner/side throughout — never truthiness-test them (a side can be falsy-safe string). */

export const N = 7

// piece codes on the board
export type Piece = 'A' | 'D' | 'K' // Attacker, Defender, King
export type Cell = Piece | null
export type Side = 'attackers' | 'defenders' // defenders = king side (you); attackers = AI
export type Winner = 'attackers' | 'defenders' | 'draw' | null

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }
export interface Move { from: number; to: number }

export interface State {
  board: Cell[]            // length 49, index = r*7 + c
  turn: Side | null        // whose move it is (null when game over)
  winner: Winner           // 'defenders' = king escaped, 'attackers' = king captured
  last: Move | null        // last move played (for highlight)
  log: LogEntry[]
}

export const idx = (r: number, c: number) => r * N + c
export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]

export const THRONE = idx(3, 3)
export const CORNERS = [idx(0, 0), idx(0, N - 1), idx(N - 1, 0), idx(N - 1, N - 1)]
const CORNER_SET = new Set(CORNERS)
const SPECIAL_SET = new Set([THRONE, ...CORNERS]) // squares only the king may stop on

const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export const sideOf = (p: Cell): Side | null =>
  p === 'A' ? 'attackers' : (p === 'D' || p === 'K') ? 'defenders' : null
const other = (s: Side): Side => s === 'attackers' ? 'defenders' : 'attackers'
const isKing = (p: Cell) => p === 'K'

function push(log: LogEntry[], t: LogEntry['t'], x: string) { return log.concat([{ t, x }]).slice(-24) }
const sq = (i: number) => { const [r, c] = rc(i); return `${'ABCDEFG'[c]}${r + 1}` }

export function makeGame(): State {
  const board: Cell[] = new Array(N * N).fill(null)
  // King on the throne (centre of 7x7).
  board[THRONE] = 'K'
  // 4 defenders on the throne's orthogonal neighbours (a plus / cross arms).
  for (const [r, c] of [[2, 3], [4, 3], [3, 2], [3, 4]]) board[idx(r, c)] = 'D'
  // 8 attackers, two on each edge midline.
  const att: [number, number][] = [
    [0, 2], [0, 4],   // top edge midline pair
    [6, 2], [6, 4],   // bottom
    [2, 0], [4, 0],   // left
    [2, 6], [4, 6],   // right
  ]
  for (const [r, c] of att) board[idx(r, c)] = 'A'
  return {
    board, turn: 'attackers', winner: null, last: null,
    log: [{ t: 'sys', x: 'You command the King and his guard. The attackers strike first — escort the King to any corner to win.' }],
  }
}

export function counts(board: Cell[]): { att: number; def: number; king: boolean } {
  let att = 0, def = 0, king = false
  for (const v of board) { if (v === 'A') att++; else if (v === 'D') def++; else if (v === 'K') king = true }
  return { att, def, king }
}

export function kingPos(board: Cell[]): number {
  for (let i = 0; i < board.length; i++) if (board[i] === 'K') return i
  return -1
}

/** Rook moves from `i` for the piece sitting there. Blocks on occupied squares (no jumping);
    a non-king may pass over the empty throne but may NOT stop on the throne or any corner. */
export function movesFrom(board: Cell[], i: number): number[] {
  const p = board[i]
  if (p == null) return []
  const king = isKing(p)
  const out: number[] = []
  const [r0, c0] = rc(i)
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr, c = c0 + dc
    while (r >= 0 && r < N && c >= 0 && c < N) {
      const j = idx(r, c)
      if (board[j] != null) break // blocked by a piece (no jumping)
      if (!king && SPECIAL_SET.has(j)) {
        // ordinary piece may slide over the empty throne but not stop on throne/corners
        r += dr; c += dc; continue
      }
      out.push(j)
      r += dr; c += dc
    }
  }
  return out
}

/** Convenience: legal rook moves from a position only when it's `who`'s piece. */
export function movesFor(s: State, pos: number): number[] {
  if (sideOf(s.board[pos]) !== s.turn) return []
  return movesFrom(s.board, pos)
}

/** All legal moves for a side. */
export function legalMoves(board: Cell[], who: Side): Move[] {
  const out: Move[] = []
  for (let i = 0; i < board.length; i++) {
    if (sideOf(board[i]) !== who) continue
    for (const to of movesFrom(board, i)) out.push({ from: i, to })
  }
  return out
}

// A square is a hostile "wall" for a victim of `victimSide` if it holds an enemy of the
// victim, OR it is a corner, OR it is the (empty) throne.
function isHostileFor(board: Cell[], j: number, victimSide: Side): boolean {
  if (j < 0) return false
  if (CORNER_SET.has(j)) return true
  if (j === THRONE && board[j] == null) return true
  const s = sideOf(board[j])
  return s != null && s !== victimSide
}

/** Resolve custodial captures triggered by `mover` (the side that just moved) landing on `to`.
    Mutates `board` in place is NOT done here — returns the captured indices for the caller to
    clear. Simple pieces fall when flanked on two opposite sides; the king falls only when boxed
    on all four orthogonal sides. */
export function resolveCaptures(board: Cell[], to: number, mover: Side): number[] {
  const captured: number[] = []
  const [r0, c0] = rc(to)
  for (const [dr, dc] of DIRS) {
    const nr = r0 + dr, nc = c0 + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    const j = idx(nr, nc)
    const vp = board[j]
    const vs = sideOf(vp)
    if (vs == null || vs === mover) continue // must be an enemy of the mover
    if (isKing(vp)) {
      // King capture: surrounded on all four orthogonal sides.
      if (kingSurrounded(board, j)) captured.push(j)
    } else {
      // Simple custodial capture: the square beyond the victim is a hostile wall.
      const fr = nr + dr, fc = nc + dc
      if (fr < 0 || fr >= N || fc < 0 || fc >= N) continue
      const beyond = idx(fr, fc)
      if (isHostileFor(board, beyond, vs)) captured.push(j)
    }
  }
  return captured
}

/** True if the king at index `k` is boxed on all four orthogonal sides by attackers or by the
    (empty) throne acting as a hostile wall. An open board edge means NOT surrounded. */
export function kingSurrounded(board: Cell[], k: number): boolean {
  const [r, c] = rc(k)
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) return false // open edge — not boxed in
    const j = idx(nr, nc)
    if (board[j] === 'A') continue
    if (j === THRONE && board[j] == null) continue // empty throne is hostile to the king
    return false
  }
  return true
}

/** Apply a move (legality re-checked beyond turn/winner gating) and resolve captures + win. */
export function applyMove(s: State, from: number, to: number, who: Side = s.turn as Side): State {
  if (s.winner != null || s.turn !== who) return s
  if (sideOf(s.board[from]) !== who) return s
  if (!movesFrom(s.board, from).includes(to)) return s

  const board = s.board.slice()
  const p = board[from]!
  board[from] = null
  board[to] = p
  let log = s.log
  const m: Move = { from, to }

  // Defender win: king reaches a corner.
  if (isKing(p) && CORNER_SET.has(to)) {
    log = push(log, who === 'defenders' ? 'you' : 'ai', `King escapes to ${sq(to)} — defenders win!`)
    return { ...s, board, turn: null, winner: 'defenders', last: m, log }
  }

  const caps = resolveCaptures(board, to, who)
  for (const j of caps) board[j] = null
  const kingCaptured = caps.some(j => s.board[j] === 'K') || board.indexOf('K') < 0

  const mover = who === 'defenders' ? 'You' : 'Rival'
  let line = `${mover} ${isKing(p) ? 'King ' : ''}${sq(from)}→${sq(to)}`
  if (caps.length) line += `, capturing ${caps.length}`
  log = push(log, who === 'defenders' ? 'you' : 'ai', line + '.')

  if (kingCaptured) {
    log = push(log, 'ai', 'The King is taken — attackers win!')
    return { ...s, board, turn: null, winner: 'attackers', last: m, log }
  }

  const opp = other(who)
  if (legalMoves(board, opp).length === 0) {
    // The side to move has no legal move — they lose (rare).
    log = push(log, 'sys', `${opp === 'defenders' ? 'Defenders have' : 'Attackers have'} no move.`)
    return { ...s, board, turn: null, winner: who, last: m, log }
  }

  return { ...s, board, turn: opp, last: m, log }
}

// ===================== AI: attackers, minimax + alpha-beta =====================

function simMove(board: Cell[], m: Move): Cell[] {
  const nb = board.slice()
  const p = nb[m.from]!
  nb[m.from] = null
  nb[m.to] = p
  const mover = sideOf(p)!
  for (const j of resolveCaptures(nb, m.to, mover)) nb[j] = null
  return nb
}

// Manhattan distance from king to its nearest corner — fewer steps = better for defenders.
function kingCornerDist(k: number): number {
  const [r, c] = rc(k)
  let best = 99
  for (const corner of CORNERS) { const [cr, cc] = rc(corner); best = Math.min(best, Math.abs(r - cr) + Math.abs(c - cc)) }
  return best
}

// True if the king could reach a corner in one rook move on this board (defender threat).
export function kingCanEscape(board: Cell[]): boolean {
  const k = kingPos(board)
  if (k < 0) return false
  for (const to of movesFrom(board, k)) if (CORNER_SET.has(to)) return true
  return false
}

const ATT_WIN = 1e6
const DEF_WIN = -1e6

// Positive = good for attackers (the AI). Terminal king states dominate.
function evalBoard(board: Cell[]): number {
  const k = kingPos(board)
  if (k < 0) return ATT_WIN
  if (CORNER_SET.has(k)) return DEF_WIN
  const { att, def } = counts(board)
  let score = 0
  score += (att - 8) * 45            // attacker material (start 8)
  score -= def * 70                  // every surviving defender shields the king
  score += kingCornerDist(k) * 16    // push the king away from corners
  // Pressure: attackers (and the hostile throne) adjacent to the king.
  const [kr, kc] = rc(k)
  for (const [dr, dc] of DIRS) {
    const nr = kr + dr, nc = kc + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    const j = idx(nr, nc)
    if (board[j] === 'A') score += 40
    else if (j === THRONE && board[j] == null) score += 22
  }
  if (kingCanEscape(board)) score += DEF_WIN / 2 // a one-move escape threat is nearly fatal
  return score
}

function search(board: Cell[], toMove: Side, depth: number, alpha: number, beta: number): number {
  const k = kingPos(board)
  if (k < 0) return ATT_WIN - (10 - depth)            // prefer faster king captures
  if (CORNER_SET.has(k)) return DEF_WIN + (10 - depth)
  if (depth === 0) return evalBoard(board)
  const moves = legalMoves(board, toMove)
  if (moves.length === 0) return toMove === 'attackers' ? DEF_WIN : ATT_WIN // stuck side loses

  if (toMove === 'attackers') { // maximizing
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(simMove(board, m), 'defenders', depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else { // defenders minimizing
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(simMove(board, m), 'attackers', depth - 1, alpha, beta))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

/** The attacker AI. Plays an immediate king-capturing move if one exists; otherwise runs a
    shallow alpha-beta search with the eval above, picking randomly among equally-best moves.
    Returns the new state with the chosen attacker move applied. Fast: depth 2, branching ~few
    dozen on a 7x7. */
export function aiTurn(s: State): State {
  if (s.winner != null || s.turn !== 'attackers') return s
  const moves = legalMoves(s.board, 'attackers')
  if (moves.length === 0) return s

  // Immediate king capture takes priority.
  for (const m of moves) {
    if (kingPos(simMove(s.board, m)) < 0) return applyMove(s, m.from, m.to, 'attackers')
  }

  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(simMove(s.board, m), 'defenders', 2, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return applyMove(s, choice.from, choice.to, 'attackers')
}
