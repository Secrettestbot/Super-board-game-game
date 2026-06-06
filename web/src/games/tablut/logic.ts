/* TABLUT — logic (built for this codebase, not ported).
   9x9 hnefatafl/tafl. Asymmetric: a KING + 8 DEFENDERS (Swedes) start clustered on the
   central THRONE; 16 ATTACKERS (Muscovites) ring the edges. The throne (4,4) and the four
   CORNERS are special: only the king may stop on them, and they act as hostile flanking
   squares. Every piece moves like a chess rook. Captures are custodial — sandwich an enemy
   along a row/column with your move. The king is captured when boxed on all four sides.
   YOU play the defenders/king; the AI plays the attackers and moves FIRST.

   Win: defenders win if the KING reaches any corner; attackers win if they CAPTURE the king. */

export const N = 9

// piece codes on the board
export type Piece = 'A' | 'D' | 'K' // Attacker, Defender, King
export type Cell = Piece | null
export type Side = 'att' | 'def'    // att = attackers (AI), def = defenders+king (you)

export interface LogEntry { t: string; x: string }
export interface Move { from: number; to: number }

export interface TablutState {
  board: Cell[]              // length 81, index = r*9 + c
  turn: Side | null          // whose move it is
  winner: Side | null        // 'def' = king escaped, 'att' = king captured
  last: Move | null          // last move played (for highlight)
  log: LogEntry[]
}

export const idx = (r: number, c: number) => r * N + c
export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]

export const THRONE = idx(4, 4)
export const CORNERS = [idx(0, 0), idx(0, 8), idx(8, 0), idx(8, 8)]
const CORNER_SET = new Set(CORNERS)
const SPECIAL_SET = new Set([THRONE, ...CORNERS]) // squares only the king may stop on

const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export const sideOf = (p: Cell): Side | null => p === 'A' ? 'att' : (p === 'D' || p === 'K') ? 'def' : null
const other = (s: Side): Side => s === 'att' ? 'def' : 'att'
const isKing = (p: Cell) => p === 'K'

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }
const sq = (i: number) => { const [r, c] = rc(i); return `${'ABCDEFGHI'[c]}${r + 1}` }

export function makeGame(): TablutState {
  const board: Cell[] = new Array(N * N).fill(null)
  // King on the throne
  board[idx(4, 4)] = 'K'
  // 8 defenders in a plus around the throne
  for (const [r, c] of [[4, 2], [4, 3], [4, 5], [4, 6], [2, 4], [3, 4], [5, 4], [6, 4]]) board[idx(r, c)] = 'D'
  // 16 attackers at the four edge midpoints
  const att: [number, number][] = [
    [0, 3], [0, 4], [0, 5], [1, 4],   // top
    [8, 3], [8, 4], [8, 5], [7, 4],   // bottom
    [3, 0], [4, 0], [5, 0], [4, 1],   // left
    [3, 8], [4, 8], [5, 8], [4, 7],   // right
  ]
  for (const [r, c] of att) board[idx(r, c)] = 'A'
  return {
    board, turn: 'att', winner: null, last: null,
    log: [{ t: 'sys', x: 'You command the King and his Swedes. Attackers move first — march the King to a corner to win.' }],
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

/** Rook moves from `i` for the piece sitting there. Blocks on occupied squares; the empty
    throne may be passed over but only the king may stop on the throne/corners. */
export function movesFrom(board: Cell[], i: number): number[] {
  const p = board[i]
  if (!p) return []
  const king = isKing(p)
  const out: number[] = []
  const [r0, c0] = rc(i)
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr, c = c0 + dc
    while (r >= 0 && r < N && c >= 0 && c < N) {
      const j = idx(r, c)
      if (board[j]) break // blocked by a piece (no jumping)
      if (!king && SPECIAL_SET.has(j)) {
        // non-king may pass over the empty throne but not stop on throne/corners
        r += dr; c += dc; continue
      }
      out.push(j)
      r += dr; c += dc
    }
  }
  return out
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

// A square counts as a hostile "wall" for capturing piece of `victimSide` if it holds an
// enemy of the victim, OR it is a corner, OR it is the (empty) throne.
function isHostileFor(board: Cell[], j: number, victimSide: Side): boolean {
  if (j < 0) return false
  if (CORNER_SET.has(j)) return true
  if (j === THRONE && board[j] === null) return true
  const s = sideOf(board[j])
  return s !== null && s !== victimSide
}

/** Resolve custodial captures triggered by `mover` (the side that just moved) landing on
    `to`. Returns the list of captured indices and mutates a copy is the caller's job — this
    works on the given array in place. Simple pieces are captured by flanking on two opposite
    sides; the king is captured only when surrounded on all four orthogonal sides. */
export function resolveCaptures(board: Cell[], to: number, mover: Side): number[] {
  const captured: number[] = []
  const [r0, c0] = rc(to)
  for (const [dr, dc] of DIRS) {
    const nr = r0 + dr, nc = c0 + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    const j = idx(nr, nc)
    const vp = board[j]
    const vs = sideOf(vp)
    if (vs === null || vs === mover) continue // must be an enemy of the mover
    if (isKing(vp)) {
      // King capture: all four orthogonal neighbours hostile (attacker or throne/corner).
      if (kingSurrounded(board, j)) captured.push(j)
    } else {
      // Simple custodial capture: square beyond the victim is a hostile wall.
      const fr = nr + dr, fc = nc + dc
      if (fr < 0 || fr >= N || fc < 0 || fc >= N) continue
      const beyond = idx(fr, fc)
      if (isHostileFor(board, beyond, vs)) captured.push(j)
    }
  }
  return captured
}

/** True if the king at index `k` is boxed on all four orthogonal sides by attackers or by
    the throne acting as a hostile wall (board edge does NOT count — king must be enclosed). */
export function kingSurrounded(board: Cell[], k: number): boolean {
  const [r, c] = rc(k)
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) return false // open edge — not surrounded
    const j = idx(nr, nc)
    if (board[j] === 'A') continue
    if (j === THRONE && board[j] === null) continue // empty throne is hostile to the king
    return false
  }
  return true
}

/** Apply a move (no legality re-check beyond turn/winner gating) and resolve captures + win. */
export function move(s: TablutState, m: Move, who: Side): TablutState {
  if (s.winner || s.turn !== who) return s
  if (sideOf(s.board[m.from]) !== who) return s
  if (!movesFrom(s.board, m.from).includes(m.to)) return s

  const board = s.board.slice()
  const p = board[m.from]!
  board[m.from] = null
  board[m.to] = p
  let log = s.log

  // Defender win: king reaches a corner.
  if (isKing(p) && CORNER_SET.has(m.to)) {
    log = push(log, who === 'def' ? 'you' : 'ai', `King escapes to ${sq(m.to)} — defenders win!`)
    return Object.assign({}, s, { board, turn: null, winner: 'def' as Side, last: m, log })
  }

  const caps = resolveCaptures(board, m.to, who)
  for (const j of caps) board[j] = null
  const kingCaptured = caps.some(j => s.board[j] === 'K') || board.indexOf('K') < 0

  const mover = who === 'def' ? 'You' : 'Rival'
  let line = `${mover} ${isKing(p) ? 'King ' : ''}${sq(m.from)}→${sq(m.to)}`
  if (caps.length) line += `, capturing ${caps.length}`
  log = push(log, who === 'def' ? 'you' : 'ai', line + '.')

  if (kingCaptured) {
    log = push(log, 'ai', 'The King is taken — attackers win!')
    return Object.assign({}, s, { board, turn: null, winner: 'att' as Side, last: m, log })
  }

  const opp = other(who)
  if (!legalMoves(board, opp).length) {
    // No legal move for the next side — they lose (rare). Treat as a win for the mover.
    log = push(log, 'sys', `${opp === 'def' ? 'Defenders have' : 'Attackers have'} no move.`)
    return Object.assign({}, s, { board, turn: null, winner: who, last: m, log })
  }

  return Object.assign({}, s, { board, turn: opp, last: m, log })
}

// ===================== AI: attackers, minimax + alpha-beta =====================

function applyMove(board: Cell[], m: Move): Cell[] {
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
function kingCanEscape(board: Cell[]): boolean {
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
  score += (att - 16) * 40          // attacker material (start 16)
  score -= def * 60                 // every surviving defender helps the king
  score += kingCornerDist(k) * 12   // push the king away from corners
  // Pressure: attackers adjacent to the king.
  const [kr, kc] = rc(k)
  for (const [dr, dc] of DIRS) {
    const nr = kr + dr, nc = kc + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    if (board[idx(nr, nc)] === 'A') score += 35
    if (idx(nr, nc) === THRONE && board[idx(nr, nc)] === null) score += 20
  }
  if (kingCanEscape(board)) score += DEF_WIN / 2 // letting the king run is nearly fatal
  return score
}

function search(board: Cell[], toMove: Side, depth: number, alpha: number, beta: number): number {
  const k = kingPos(board)
  if (k < 0) return ATT_WIN - (10 - depth)         // prefer faster king captures
  if (CORNER_SET.has(k)) return DEF_WIN + (10 - depth)
  if (depth === 0) return evalBoard(board)
  const moves = legalMoves(board, toMove)
  if (!moves.length) return toMove === 'att' ? DEF_WIN : ATT_WIN // stuck side loses

  if (toMove === 'att') { // maximizing
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(board, m), 'def', depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else { // defenders minimizing
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(applyMove(board, m), 'att', depth - 1, alpha, beta))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

/** The attacker AI. Always plays a king-capturing move if one exists; otherwise a depth-3
    alpha-beta search with the eval above. Picks randomly among equally-best moves. */
export function aiMove(s: TablutState): TablutState {
  if (s.winner || s.turn !== 'att') return s
  const moves = legalMoves(s.board, 'att')
  if (!moves.length) return s

  // Immediate king capture takes priority.
  for (const m of moves) {
    const nb = applyMove(s.board, m)
    if (kingPos(nb) < 0) return move(s, m, 'att')
  }

  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(applyMove(s.board, m), 'def', 2, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return move(s, choice, 'att')
}
