/* CHESS — pure logic. Full standard chess on an 8x8 board.
   You are White (color 0, bottom); the AI is Black (color 1, top).

   Board is a flat array of 64 squares, index = rank*8 + file, with index 0 = a8
   (top-left, Black's back rank) and index 56 = a1 (bottom-left, White's back rank).
   A square is a Piece {type, color} or null. color 0 = white, 1 = black — both REAL,
   so we never truthiness-test color. result is a string: 'white' | 'black' | 'draw' | null.

   AI: alpha-beta minimax with material + piece-square tables, MVV-LVA move ordering,
   and a capture-only quiescence search with a check extension. NO React / DOM here. */

export type Color = 0 | 1 // 0 = white (you), 1 = black (ai)
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export interface Piece { type: PieceType; color: Color }
export type Square = Piece | null
export type Board = Square[]
export type Result = 'white' | 'black' | 'draw' | null

export interface Move {
  from: number
  to: number
  /** Promotion piece type, when a pawn reaches the last rank. */
  promo?: PieceType
  /** True when this move is an en-passant capture. */
  enPassant?: boolean
  /** 'k' or 'q' when this move is a castle. */
  castle?: 'k' | 'q'
}

export interface Castling { wk: boolean; wq: boolean; bk: boolean; bq: boolean }

export interface ChessState {
  board: Board
  /** Side to move. */
  turn: Color
  castling: Castling
  /** En-passant target square index, or -1 when none. */
  ep: number
  /** Halfmove clock for the 50-move rule. */
  halfmove: number
  /** Full move number. */
  fullmove: number
  /** Position keys seen, for threefold repetition. */
  history: string[]
  /** Last move played (for highlighting). */
  last: Move | null
  /** Captured pieces, by capturing color. */
  captured: { 0: PieceType[]; 1: PieceType[] }
  result: Result
  /** 'checkmate' | 'stalemate' | 'fifty' | 'repetition' | 'material' | null. */
  reason: string | null
}

export const WHITE: Color = 0
export const BLACK: Color = 1
export const other = (c: Color): Color => (c === 0 ? 1 : 0)

export const rankOf = (i: number) => i >> 3
export const fileOf = (i: number) => i & 7
export const sq = (rank: number, file: number) => rank * 8 + file
const onBoard = (rank: number, file: number) => rank >= 0 && rank < 8 && file >= 0 && file < 8

const PIECE_VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }

// ---------- setup ----------
export function makeGame(): ChessState {
  const board: Board = new Array(64).fill(null)
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let f = 0; f < 8; f++) {
    board[sq(0, f)] = { type: back[f], color: BLACK }
    board[sq(1, f)] = { type: 'p', color: BLACK }
    board[sq(6, f)] = { type: 'p', color: WHITE }
    board[sq(7, f)] = { type: back[f], color: WHITE }
  }
  const s: ChessState = {
    board,
    turn: WHITE,
    castling: { wk: true, wq: true, bk: true, bq: true },
    ep: -1,
    halfmove: 0,
    fullmove: 1,
    history: [],
    last: null,
    captured: { 0: [], 1: [] },
    result: null,
    reason: null,
  }
  s.history.push(positionKey(s))
  return s
}

// ---------- attack / check detection ----------

// Is square `target` attacked by any piece of color `by`?
export function isAttacked(board: Board, target: number, by: Color): boolean {
  const tr = rankOf(target), tf = fileOf(target)

  // Pawns: a `by`-pawn attacks diagonally forward. White pawns move toward rank 0,
  // so a white pawn on (r,f) attacks (r-1, f±1); black pawns attack (r+1, f±1).
  const pdir = by === WHITE ? 1 : -1 // direction from target back to the attacking pawn
  for (const df of [-1, 1]) {
    const pr = tr + pdir, pf = tf + df
    if (onBoard(pr, pf)) {
      const p = board[sq(pr, pf)]
      if (p && p.color === by && p.type === 'p') return true
    }
  }

  // Knights
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
  for (const [dr, df] of KN) {
    const r = tr + dr, f = tf + df
    if (onBoard(r, f)) { const p = board[sq(r, f)]; if (p && p.color === by && p.type === 'n') return true }
  }

  // King
  for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
    if (dr === 0 && df === 0) continue
    const r = tr + dr, f = tf + df
    if (onBoard(r, f)) { const p = board[sq(r, f)]; if (p && p.color === by && p.type === 'k') return true }
  }

  // Sliders — rook/queen orthogonally, bishop/queen diagonally
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  for (const [dr, df] of ORTHO) {
    let r = tr + dr, f = tf + df
    while (onBoard(r, f)) {
      const p = board[sq(r, f)]
      if (p) { if (p.color === by && (p.type === 'r' || p.type === 'q')) return true; break }
      r += dr; f += df
    }
  }
  for (const [dr, df] of DIAG) {
    let r = tr + dr, f = tf + df
    while (onBoard(r, f)) {
      const p = board[sq(r, f)]
      if (p) { if (p.color === by && (p.type === 'b' || p.type === 'q')) return true; break }
      r += dr; f += df
    }
  }
  return false
}

function kingSquare(board: Board, color: Color): number {
  for (let i = 0; i < 64; i++) { const p = board[i]; if (p && p.color === color && p.type === 'k') return i }
  return -1
}

export function inCheck(s: ChessState, color: Color): boolean {
  const k = kingSquare(s.board, color)
  if (k < 0) return false
  return isAttacked(s.board, k, other(color))
}

// ---------- pseudo-legal move generation ----------

function pushPawnMove(out: Move[], from: number, to: number, color: Color, ep = false) {
  const toRank = rankOf(to)
  const last = color === WHITE ? 0 : 7
  if (toRank === last) {
    for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) out.push({ from, to, promo })
  } else {
    out.push(ep ? { from, to, enPassant: true } : { from, to })
  }
}

// Pseudo-legal moves (does NOT filter out moves leaving own king in check).
function pseudoMoves(s: ChessState, color: Color): Move[] {
  const out: Move[] = []
  const board = s.board
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p || p.color !== color) continue
    const r = rankOf(i), f = fileOf(i)
    switch (p.type) {
      case 'p': {
        const dir = color === WHITE ? -1 : 1
        const startRank = color === WHITE ? 6 : 1
        // single push
        const r1 = r + dir
        if (onBoard(r1, f) && !board[sq(r1, f)]) {
          pushPawnMove(out, i, sq(r1, f), color)
          // double push
          const r2 = r + 2 * dir
          if (r === startRank && !board[sq(r2, f)]) out.push({ from: i, to: sq(r2, f) })
        }
        // captures
        for (const df of [-1, 1]) {
          const cr = r + dir, cf = f + df
          if (!onBoard(cr, cf)) continue
          const tIdx = sq(cr, cf)
          const t = board[tIdx]
          if (t && t.color !== color) pushPawnMove(out, i, tIdx, color)
          else if (tIdx === s.ep && s.ep >= 0) pushPawnMove(out, i, tIdx, color, true)
        }
        break
      }
      case 'n': {
        const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
        for (const [dr, df] of KN) {
          const nr = r + dr, nf = f + df
          if (!onBoard(nr, nf)) continue
          const t = board[sq(nr, nf)]
          if (!t || t.color !== color) out.push({ from: i, to: sq(nr, nf) })
        }
        break
      }
      case 'k': {
        for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
          if (dr === 0 && df === 0) continue
          const nr = r + dr, nf = f + df
          if (!onBoard(nr, nf)) continue
          const t = board[sq(nr, nf)]
          if (!t || t.color !== color) out.push({ from: i, to: sq(nr, nf) })
        }
        // castling — generated here, full legality verified below
        addCastles(s, color, i, out)
        break
      }
      default: {
        const dirs = p.type === 'r' ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
          : p.type === 'b' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
          : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]] // queen
        for (const [dr, df] of dirs) {
          let nr = r + dr, nf = f + df
          while (onBoard(nr, nf)) {
            const t = board[sq(nr, nf)]
            if (!t) out.push({ from: i, to: sq(nr, nf) })
            else { if (t.color !== color) out.push({ from: i, to: sq(nr, nf) }); break }
            nr += dr; nf += df
          }
        }
        break
      }
    }
  }
  return out
}

function addCastles(s: ChessState, color: Color, kingIdx: number, out: Move[]) {
  const board = s.board
  const homeRank = color === WHITE ? 7 : 0
  if (rankOf(kingIdx) !== homeRank || fileOf(kingIdx) !== 4) return
  // king must not currently be in check
  if (isAttacked(board, kingIdx, other(color))) return
  const ks = color === WHITE ? s.castling.wk : s.castling.bk
  const qs = color === WHITE ? s.castling.wq : s.castling.bq
  // king side: squares f,g empty; king passes through f,g not attacked; rook on h
  if (ks) {
    const fSq = sq(homeRank, 5), gSq = sq(homeRank, 6), rookSq = sq(homeRank, 7)
    const rook = board[rookSq]
    if (!board[fSq] && !board[gSq] && rook && rook.type === 'r' && rook.color === color &&
      !isAttacked(board, fSq, other(color)) && !isAttacked(board, gSq, other(color))) {
      out.push({ from: kingIdx, to: gSq, castle: 'k' })
    }
  }
  // queen side: squares d,c,b empty; king passes through d,c not attacked; rook on a
  if (qs) {
    const dSq = sq(homeRank, 3), cSq = sq(homeRank, 2), bSq = sq(homeRank, 1), rookSq = sq(homeRank, 0)
    const rook = board[rookSq]
    if (!board[dSq] && !board[cSq] && !board[bSq] && rook && rook.type === 'r' && rook.color === color &&
      !isAttacked(board, dSq, other(color)) && !isAttacked(board, cSq, other(color))) {
      out.push({ from: kingIdx, to: cSq, castle: 'q' })
    }
  }
}

// ---------- apply a move to a raw board (no state bookkeeping) ----------
// Returns the resulting board; used by both applyMove and the legality filter / search.
function makeBoardMove(board: Board, m: Move): Board {
  const nb = board.slice()
  const p = nb[m.from]!
  nb[m.to] = p
  nb[m.from] = null
  if (m.enPassant) {
    // captured pawn sits on the same file as `to`, same rank as `from`
    const capIdx = sq(rankOf(m.from), fileOf(m.to))
    nb[capIdx] = null
  }
  if (m.promo) nb[m.to] = { type: m.promo, color: p.color }
  if (m.castle) {
    const homeRank = rankOf(m.to)
    if (m.castle === 'k') { nb[sq(homeRank, 5)] = nb[sq(homeRank, 7)]; nb[sq(homeRank, 7)] = null }
    else { nb[sq(homeRank, 3)] = nb[sq(homeRank, 0)]; nb[sq(homeRank, 0)] = null }
  }
  return nb
}

// ---------- fully legal moves (check-filtered) ----------
export function legalMoves(s: ChessState): Move[] {
  const color = s.turn
  const out: Move[] = []
  for (const m of pseudoMoves(s, color)) {
    const nb = makeBoardMove(s.board, m)
    const k = kingSquare(nb, color)
    if (k < 0) continue
    if (!isAttacked(nb, k, other(color))) out.push(m)
  }
  return out
}

// ---------- apply move (full state) ----------
export function applyMove(s: ChessState, m: Move): ChessState {
  if (s.result != null) return s
  // validate against legal moves (match from/to and promo if present)
  const legal = legalMoves(s)
  const match = legal.find(x => x.from === m.from && x.to === m.to &&
    (m.promo ? x.promo === m.promo : true))
  if (!match) return s
  const move = match
  const color = s.turn
  const board = s.board
  const moving = board[move.from]!
  const captured = move.enPassant ? board[sq(rankOf(move.from), fileOf(move.to))] : board[move.to]

  const nb = makeBoardMove(board, move)

  // castling rights update
  const castling: Castling = { ...s.castling }
  if (moving.type === 'k') {
    if (color === WHITE) { castling.wk = false; castling.wq = false }
    else { castling.bk = false; castling.bq = false }
  }
  // rook moved or captured — clear relevant rights by home square
  const clearRook = (idx: number) => {
    if (idx === sq(7, 7)) castling.wk = false
    else if (idx === sq(7, 0)) castling.wq = false
    else if (idx === sq(0, 7)) castling.bk = false
    else if (idx === sq(0, 0)) castling.bq = false
  }
  clearRook(move.from)
  clearRook(move.to)

  // en-passant target: only when a pawn double-steps
  let ep = -1
  if (moving.type === 'p' && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    ep = sq((rankOf(move.from) + rankOf(move.to)) / 2, fileOf(move.from))
  }

  // halfmove clock
  let halfmove = s.halfmove + 1
  if (moving.type === 'p' || captured) halfmove = 0

  const capturedList = { 0: s.captured[0].slice(), 1: s.captured[1].slice() }
  if (captured) capturedList[color].push(captured.type)

  const ns: ChessState = {
    board: nb,
    turn: other(color),
    castling,
    ep,
    halfmove,
    fullmove: color === BLACK ? s.fullmove + 1 : s.fullmove,
    history: s.history.slice(),
    last: move,
    captured: capturedList,
    result: null,
    reason: null,
  }
  ns.history.push(positionKey(ns))

  // terminal detection on the side to move
  const replies = legalMoves(ns)
  if (replies.length === 0) {
    if (inCheck(ns, ns.turn)) { ns.result = color === WHITE ? 'white' : 'black'; ns.reason = 'checkmate' }
    else { ns.result = 'draw'; ns.reason = 'stalemate' }
    return ns
  }
  if (halfmove >= 100) { ns.result = 'draw'; ns.reason = 'fifty'; return ns }
  if (isThreefold(ns)) { ns.result = 'draw'; ns.reason = 'repetition'; return ns }
  if (insufficientMaterial(ns.board)) { ns.result = 'draw'; ns.reason = 'material'; return ns }
  return ns
}

// ---------- terminal helpers ----------
export function isCheckmate(s: ChessState): boolean {
  return legalMoves(s).length === 0 && inCheck(s, s.turn)
}
export function isStalemate(s: ChessState): boolean {
  return legalMoves(s).length === 0 && !inCheck(s, s.turn)
}

export function insufficientMaterial(board: Board): boolean {
  const minors: PieceType[] = []
  let bishopColors: number[] = []
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p) continue
    if (p.type === 'p' || p.type === 'r' || p.type === 'q') return false
    if (p.type === 'n' || p.type === 'b') {
      minors.push(p.type)
      if (p.type === 'b') bishopColors.push((rankOf(i) + fileOf(i)) & 1)
    }
  }
  // K vs K, K+minor vs K, K+B vs K+B same color
  if (minors.length === 0) return true
  if (minors.length === 1) return true
  if (minors.length === 2 && minors.every(m => m === 'b') && bishopColors[0] === bishopColors[1]) return true
  return false
}

// position key: pieces + turn + castling + ep. Used for repetition.
export function positionKey(s: ChessState): string {
  let k = ''
  for (let i = 0; i < 64; i++) {
    const p = s.board[i]
    k += p ? (p.color === WHITE ? p.type.toUpperCase() : p.type) : '.'
  }
  k += '|' + s.turn
  k += '|' + (s.castling.wk ? 'K' : '') + (s.castling.wq ? 'Q' : '') + (s.castling.bk ? 'k' : '') + (s.castling.bq ? 'q' : '')
  k += '|' + s.ep
  return k
}

function isThreefold(s: ChessState): boolean {
  const key = s.history[s.history.length - 1]
  let count = 0
  for (const h of s.history) if (h === key) count++
  return count >= 3
}

// ===================== AI =====================

// Piece-square tables, from White's perspective (index 0 = a8 / top-left).
// They are mirrored for Black by flipping the rank.
const PST: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
}

// Evaluate a board from the perspective of `me` (positive = good for me).
function evaluate(board: Board, me: Color): number {
  let score = 0
  for (let i = 0; i < 64; i++) {
    const p = board[i]
    if (!p) continue
    let v = PIECE_VALUE[p.type]
    // PST: white reads the table directly, black reads the vertically mirrored square.
    const pstIdx = p.color === WHITE ? i : sq(7 - rankOf(i), fileOf(i))
    v += PST[p.type][pstIdx]
    score += p.color === me ? v : -v
  }
  return score
}

const MATE = 1_000_000

// Order moves: captures first by MVV-LVA, then quiet moves.
function orderMoves(board: Board, moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => scoreMove(board, b) - scoreMove(board, a))
}
function scoreMove(board: Board, m: Move): number {
  const victim = m.enPassant ? { type: 'p' as PieceType } : board[m.to]
  let s = 0
  if (victim) {
    const attacker = board[m.from]!
    s += 10 * PIECE_VALUE[victim.type] - PIECE_VALUE[attacker.type]
  }
  if (m.promo) s += PIECE_VALUE[m.promo]
  return s
}

// Generate fully-legal moves for an arbitrary (board, color, ep, castling) tuple.
function genLegal(board: Board, color: Color, ep: number, castling: Castling): Move[] {
  const tmp: ChessState = {
    board, turn: color, castling, ep, halfmove: 0, fullmove: 1,
    history: [], last: null, captured: { 0: [], 1: [] }, result: null, reason: null,
  }
  return legalMoves(tmp)
}

// Apply a move at the search level, returning new board + ep + castling.
function searchApply(board: Board, m: Move, color: Color, castling: Castling): { board: Board; ep: number; castling: Castling } {
  const nb = makeBoardMove(board, m)
  const moving = board[m.from]!
  const nc: Castling = { ...castling }
  if (moving.type === 'k') { if (color === WHITE) { nc.wk = false; nc.wq = false } else { nc.bk = false; nc.bq = false } }
  const clear = (idx: number) => {
    if (idx === sq(7, 7)) nc.wk = false
    else if (idx === sq(7, 0)) nc.wq = false
    else if (idx === sq(0, 7)) nc.bk = false
    else if (idx === sq(0, 0)) nc.bq = false
  }
  clear(m.from); clear(m.to)
  let ep = -1
  if (moving.type === 'p' && Math.abs(rankOf(m.to) - rankOf(m.from)) === 2) ep = sq((rankOf(m.from) + rankOf(m.to)) / 2, fileOf(m.from))
  return { board: nb, ep, castling: nc }
}

// Quiescence: only capture (and promotion) moves, to avoid horizon blunders.
function quiesce(board: Board, color: Color, me: Color, ep: number, castling: Castling, alpha: number, beta: number): number {
  const standPat = color === me ? evaluate(board, me) : -evaluate(board, me)
  // standPat is from `color`'s view; convert to a max-node value for `color`.
  let best = standPat
  if (best >= beta) return beta
  if (best > alpha) alpha = best
  const moves = genLegal(board, color, ep, castling).filter(m => {
    const cap = m.enPassant || board[m.to] != null
    return cap || m.promo
  })
  const ordered = orderMoves(board, moves)
  for (const m of ordered) {
    const nx = searchApply(board, m, color, castling)
    const val = -quiesce(nx.board, other(color), me, nx.ep, nx.castling, -beta, -alpha)
    if (val >= beta) return beta
    if (val > alpha) alpha = val
  }
  return alpha
}

// Negamax alpha-beta. Returns score from `color`'s perspective.
function negamax(board: Board, color: Color, me: Color, depth: number, ep: number, castling: Castling, alpha: number, beta: number): number {
  const moves = genLegal(board, color, ep, castling)
  if (moves.length === 0) {
    const k = kingSquare(board, color)
    const checked = k >= 0 && isAttacked(board, k, other(color))
    if (checked) return -MATE - depth // prefer faster mates
    return 0 // stalemate
  }
  if (depth === 0) {
    // check extension: if in check, search one capture ply via quiescence anyway
    return quiesce(board, color, me, ep, castling, alpha, beta)
  }
  const ordered = orderMoves(board, moves)
  let best = -Infinity
  for (const m of ordered) {
    const nx = searchApply(board, m, color, castling)
    const val = -negamax(nx.board, other(color), me, depth - 1, nx.ep, nx.castling, -beta, -alpha)
    if (val > best) best = val
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

export const AI_DEPTH = 3

// Pick the AI's move (Black by default). Returns the chosen Move, or null if none.
export function chooseMove(s: ChessState, depth = AI_DEPTH): Move | null {
  const color = s.turn
  const moves = legalMoves(s)
  if (moves.length === 0) return null
  const ordered = orderMoves(s.board, moves)
  // Root search uses a FULL window per move so each returns its true score (a
  // narrowing alpha window would clamp inferior moves to the alpha bound and make
  // them tie the best — then tie-breaking could pick a worse move). Among exact
  // ties we keep the capture-ordered first move, with a tiny jitter for variety.
  let best = ordered[0], bestVal = -Infinity
  for (const m of ordered) {
    const nx = searchApply(s.board, m, color, s.castling)
    const val = -negamax(nx.board, other(color), color, depth - 1, nx.ep, nx.castling, -Infinity, Infinity)
    const jittered = val + Math.random() * 0.001
    if (jittered > bestVal) { bestVal = jittered; best = m }
  }
  return best
}

// Convenience: apply the AI's chosen move and return the new state.
export function aiMove(s: ChessState, depth = AI_DEPTH): ChessState {
  if (s.result != null) return s
  const m = chooseMove(s, depth)
  if (!m) return s
  return applyMove(s, m)
}

// algebraic name of a square, e.g. 0 -> "a8", 56 -> "a1".
export function squareName(i: number): string {
  const file = 'abcdefgh'[fileOf(i)]
  const rank = 8 - rankOf(i)
  return file + rank
}
