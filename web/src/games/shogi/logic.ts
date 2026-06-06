/* MINISHOGI (5x5) — pure logic. No React / DOM.

   The complete official reduced Shogi: drops + promotion on a 5x5 board.

   Coordinates: a 25-cell array, index = r*5 + c. Row 0 is the top (Gote / AI back rank),
   row 4 is the bottom (Sente / you back rank). Player 0 (you, Sente) sits at the bottom
   and moves "forward" = toward row 0 (decreasing row). Player 1 (AI, Gote) sits at the
   top and moves forward = toward row 4 (increasing row).

   Promotion zone = the furthest single rank for the mover: row 0 for player 0, row 4 for
   player 1. A move INTO that rank may promote (Pawn/Silver always optional except where a
   piece would otherwise be stuck — pawns reaching the last rank must promote since an
   unpromoted pawn there has no moves).

   Pieces:  K king · G gold · S silver · B bishop · R rook · P pawn.
   Promoted (promoted=true):  R→Dragon (rook+king) · B→Horse (bishop+king) ·
   S→gold moves · P→gold moves.  K and G never promote.

   Drops: captured pieces flip to the captor's hand (always UNPROMOTED) and may be dropped
   onto any empty square instead of a board move. Restrictions implemented: no two
   unpromoted pawns in the same file for one player; no drop onto a square where the piece
   would have zero legal moves (a pawn on the mover's last rank). */

export type Player = 0 | 1
export type PieceType = 'K' | 'G' | 'S' | 'B' | 'R' | 'P'
export interface Piece { type: PieceType; owner: Player; promoted: boolean }
export type Board = (Piece | null)[]
/** Hand: per-player count of each (unpromoted) piece type held. */
export type Hand = Record<PieceType, number>

export interface State {
  board: Board
  hands: [Hand, Hand]
  turn: Player
  winner: 'you' | 'ai' | 'draw' | null
  last: Move | null
  check: boolean
}

/** A board move (from/to, optional promotion) OR a drop (drop=type, from=-1). */
export interface Move {
  from: number          // -1 for a drop
  to: number
  promote?: boolean     // board move into the zone
  drop?: PieceType      // drop of a hand piece
}

export const N = 5
export const SIZE = N * N
export const id = (r: number, c: number) => r * N + c
export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]
const inB = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const emptyHand = (): Hand => ({ K: 0, G: 0, S: 0, B: 0, R: 0, P: 0 })

/** "Forward" row delta for a player: player 0 moves up (−1), player 1 moves down (+1). */
const fwd = (owner: Player) => (owner === 0 ? -1 : 1)
/** The promotion rank for a player (their furthest row). */
export const promoRank = (owner: Player) => (owner === 0 ? 0 : N - 1)

export function makeGame(): State {
  const b: Board = new Array(SIZE).fill(null)
  // Gote (player 1) back rank on row 0: K G S B R  (rook on file 4, bishop file 3 mirrored)
  // Standard Minishogi setup. Sente mirrors it across the board.
  // Player 1 (top): row0 = R B S G K, pawn in front of the king.
  const top: PieceType[] = ['R', 'B', 'S', 'G', 'K']
  for (let c = 0; c < N; c++) b[id(0, c)] = { type: top[c], owner: 1, promoted: false }
  b[id(1, 4)] = { type: 'P', owner: 1, promoted: false } // pawn ahead of Gote king
  // Player 0 (bottom): point-symmetric — row4 = K G S B R, pawn ahead of king.
  const bot: PieceType[] = ['K', 'G', 'S', 'B', 'R']
  for (let c = 0; c < N; c++) b[id(4, c)] = { type: bot[c], owner: 0, promoted: false }
  b[id(3, 0)] = { type: 'P', owner: 0, promoted: false } // pawn ahead of Sente king
  return {
    board: b,
    hands: [emptyHand(), emptyHand()],
    turn: 0,
    winner: null,
    last: null,
    check: false,
  }
}

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

/** Step directions (single-square) for gold for the given owner. */
function goldSteps(owner: Player): number[][] {
  const f = fwd(owner)
  // orthogonals + the two forward diagonals
  return [[-1, 0], [1, 0], [0, -1], [0, 1], [f, -1], [f, 1]]
}
/** Silver: the four diagonals + straight forward. */
function silverSteps(owner: Player): number[][] {
  const f = fwd(owner)
  return [[-1, -1], [-1, 1], [1, -1], [1, 1], [f, 0]]
}

/** Pseudo-legal destination indices for the piece at i (no check filtering). */
export function pieceMoves(board: Board, i: number): number[] {
  const p = board[i]
  if (!p) return []
  const [r, c] = rc(i)
  const out: number[] = []
  const owner = p.owner
  const add = (nr: number, nc: number) => {
    if (!inB(nr, nc)) return
    const t = board[id(nr, nc)]
    if (!t || t.owner !== owner) out.push(id(nr, nc))
  }
  const slide = (dirs: number[][]) => {
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc
      while (inB(nr, nc)) {
        const t = board[id(nr, nc)]
        if (!t) out.push(id(nr, nc))
        else { if (t.owner !== owner) out.push(id(nr, nc)); break }
        nr += dr; nc += dc
      }
    }
  }
  const steps = (dirs: number[][]) => { for (const [dr, dc] of dirs) add(r + dr, c + dc) }

  if (p.type === 'K') { steps([...ORTHO, ...DIAG]); return out }
  if (p.type === 'G') { steps(goldSteps(owner)); return out }
  if (p.type === 'P') {
    if (p.promoted) { steps(goldSteps(owner)) }
    else { add(r + fwd(owner), c) }
    return out
  }
  if (p.type === 'S') {
    if (p.promoted) { steps(goldSteps(owner)) }
    else { steps(silverSteps(owner)) }
    return out
  }
  if (p.type === 'R') {
    slide(ORTHO)
    if (p.promoted) steps(DIAG) // Dragon adds king's diagonal steps
    return out
  }
  if (p.type === 'B') {
    slide(DIAG)
    if (p.promoted) steps(ORTHO) // Horse adds king's orthogonal steps
    return out
  }
  return out
}

function kingPos(board: Board, owner: Player): number {
  for (let i = 0; i < SIZE; i++) { const p = board[i]; if (p && p.type === 'K' && p.owner === owner) return i }
  return -1
}

/** Is `owner` to move currently in check (their king attacked)? */
export function inCheck(s: State, owner: Player): boolean
export function inCheck(board: Board, owner: Player): boolean
export function inCheck(arg: State | Board, owner: Player): boolean {
  const board = Array.isArray(arg) ? (arg as Board) : (arg as State).board
  const k = kingPos(board, owner)
  if (k < 0) return true // king captured ⇒ treat as in check (lost)
  const opp: Player = owner === 0 ? 1 : 0
  for (let i = 0; i < SIZE; i++) {
    const p = board[i]
    if (p && p.owner === opp) { if (pieceMoves(board, i).includes(k)) return true }
  }
  return false
}

/** Apply a raw board/drop move to a board copy and return the new board (no validation). */
function rawApply(board: Board, m: Move, owner: Player): Board {
  const nb = board.slice()
  if (m.drop) {
    nb[m.to] = { type: m.drop, owner, promoted: false }
  } else {
    const p = nb[m.from]!
    nb[m.to] = { type: p.type, owner: p.owner, promoted: p.promoted || !!m.promote }
    nb[m.from] = null
  }
  return nb
}

/** Does the player have an unpromoted pawn already in column c? */
function hasPawnInFile(board: Board, owner: Player, col: number): boolean {
  for (let r = 0; r < N; r++) {
    const p = board[id(r, col)]
    if (p && p.owner === owner && p.type === 'P' && !p.promoted) return true
  }
  return false
}

/** All fully-legal moves for `s.turn` (board moves with promotion options + drops),
    filtered so the mover never leaves their own king in check. */
export function legalMoves(s: State): Move[] {
  const owner = s.turn
  const board = s.board
  const out: Move[] = []
  const pushIfSafe = (m: Move) => {
    const nb = rawApply(board, m, owner)
    if (!inCheck(nb, owner)) out.push(m)
  }

  // --- board moves ---
  for (let i = 0; i < SIZE; i++) {
    const p = board[i]
    if (!p || p.owner !== owner) continue
    for (const to of pieceMoves(board, i)) {
      const [tr] = rc(to)
      const intoZone = tr === promoRank(owner)
      const canPromote = !p.promoted && (p.type === 'P' || p.type === 'S' || p.type === 'B' || p.type === 'R') && intoZone
      // Pawn into last rank MUST promote (no moves otherwise).
      const mustPromote = canPromote && p.type === 'P'
      if (canPromote) {
        pushIfSafe({ from: i, to, promote: true })
        if (!mustPromote) pushIfSafe({ from: i, to, promote: false })
      } else {
        pushIfSafe({ from: i, to })
      }
    }
  }

  // --- drops ---
  const hand = s.hands[owner]
  const types: PieceType[] = ['R', 'B', 'G', 'S', 'P']
  for (const t of types) {
    if (hand[t] <= 0) continue
    for (let to = 0; to < SIZE; to++) {
      if (board[to]) continue
      const [tr, tc] = rc(to)
      if (t === 'P') {
        // no two unpromoted pawns in the same file
        if (hasPawnInFile(board, owner, tc)) continue
        // no drop where it has no legal move: pawn on its own last rank
        if (tr === promoRank(owner)) continue
      }
      pushIfSafe({ from: -1, to, drop: t })
    }
  }
  return out
}

export function isCheckmate(s: State): boolean {
  return inCheck(s, s.turn) && legalMoves(s).length === 0
}

function moveEq(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && !!a.promote === !!b.promote && a.drop === b.drop
}

/** Apply a (validated) move, capturing into hand, flipping the turn, and computing
    win / check on the new side to move. Returns a fresh State (input untouched). */
export function applyMove(s: State, move: Move): State {
  if (s.winner != null) return s
  const owner = s.turn
  // validate against legal moves
  const legal = legalMoves(s)
  if (!legal.some(m => moveEq(m, move))) return s

  const board = s.board.slice()
  const hands: [Hand, Hand] = [{ ...s.hands[0] }, { ...s.hands[1] }]

  if (move.drop) {
    board[move.to] = { type: move.drop, owner, promoted: false }
    hands[owner][move.drop] -= 1
  } else {
    const p = board[move.from]!
    const captured = board[move.to]
    if (captured) {
      // captured piece reverts to unpromoted and joins captor's hand (kings can't be captured
      // in legal play, but guard anyway by ignoring K).
      if (captured.type !== 'K') hands[owner][captured.type] += 1
    }
    board[move.to] = { type: p.type, owner: p.owner, promoted: p.promoted || !!move.promote }
    board[move.from] = null
  }

  const next: Player = owner === 0 ? 1 : 0
  const ns: State = {
    board,
    hands,
    turn: next,
    winner: null,
    last: move,
    check: false,
  }
  // win / check on the new side to move
  const nextLegal = legalMoves(ns)
  const chk = inCheck(ns, next)
  ns.check = chk
  if (nextLegal.length === 0) {
    // checkmate (or stalemate — in shogi stalemate is also a loss for the side unable to move)
    ns.winner = owner === 0 ? 'you' : 'ai'
    ns.turn = next // keep for display; winner decides
  }
  return ns
}

// ===================== AI: alpha-beta minimax =====================

const VAL: Record<PieceType, number> = { K: 100000, R: 90, B: 80, G: 60, S: 50, P: 12 }
/** Promotion bonuses (added on top of base value when the piece is promoted). */
const PROMO_BONUS: Record<PieceType, number> = { R: 40, B: 40, S: 18, P: 48, G: 0, K: 0 }
/** A piece in hand is worth slightly more than the bare type (flexibility of a drop). */
const HAND_VAL: Record<PieceType, number> = { K: 0, R: 95, B: 85, G: 62, S: 52, P: 16 }

function evaluate(s: State, me: Player): number {
  let sc = 0
  for (let i = 0; i < SIZE; i++) {
    const p = s.board[i]
    if (!p) continue
    let v = VAL[p.type]
    if (p.promoted) v += PROMO_BONUS[p.type]
    // king safety: reward king with friendly neighbours, mild central penalty handled implicitly
    sc += p.owner === me ? v : -v
  }
  for (const t of ['R', 'B', 'G', 'S', 'P'] as PieceType[]) {
    sc += HAND_VAL[t] * s.hands[me][t]
    sc -= HAND_VAL[t] * s.hands[me === 0 ? 1 : 0][t]
  }
  // king safety: count attackers on each king's square cheaply via inCheck flags
  if (inCheck(s.board, me)) sc -= 35
  if (inCheck(s.board, me === 0 ? 1 : 0)) sc += 35
  return sc
}

/** Apply a move WITHOUT the full legality re-check (search has already generated legal
    moves), producing the next State. Mirrors applyMove's capture/turn bookkeeping. */
function fastApply(s: State, move: Move): State {
  const owner = s.turn
  const board = s.board.slice()
  const hands: [Hand, Hand] = [{ ...s.hands[0] }, { ...s.hands[1] }]
  if (move.drop) {
    board[move.to] = { type: move.drop, owner, promoted: false }
    hands[owner][move.drop] -= 1
  } else {
    const p = board[move.from]!
    const captured = board[move.to]
    if (captured && captured.type !== 'K') hands[owner][captured.type] += 1
    board[move.to] = { type: p.type, owner: p.owner, promoted: p.promoted || !!move.promote }
    board[move.from] = null
  }
  const next: Player = owner === 0 ? 1 : 0
  return { board, hands, turn: next, winner: null, last: move, check: false }
}

function isCaptureOrDrop(s: State, m: Move): number {
  if (m.drop) return 5
  const t = s.board[m.to]
  return t ? VAL[t.type] : 0
}

function search(s: State, me: Player, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(s)
  if (moves.length === 0) {
    // side to move is mated/stalemated ⇒ they lose
    return s.turn === me ? -99999 + (6 - depth) : 99999 - (6 - depth)
  }
  if (depth === 0) return evaluate(s, me)
  moves.sort((a, b) => isCaptureOrDrop(s, b) - isCaptureOrDrop(s, a))
  const maximizing = s.turn === me
  if (maximizing) {
    let best = -1e9
    for (const m of moves) {
      const v = search(fastApply(s, m), me, depth - 1, alpha, beta)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = 1e9
    for (const m of moves) {
      const v = search(fastApply(s, m), me, depth - 1, alpha, beta)
      if (v < best) best = v
      if (best < beta) beta = best
      if (alpha >= beta) break
    }
    return best
  }
}

/** AI (player 1, Gote) picks and applies a move via depth-limited alpha-beta. */
export function aiMove(s: State): State {
  if (s.winner != null) return s
  const me = s.turn
  const moves = legalMoves(s)
  if (moves.length === 0) return s
  moves.sort((a, b) => isCaptureOrDrop(s, b) - isCaptureOrDrop(s, a))
  const DEPTH = 3
  let best = moves[0]
  let bv = -1e9
  for (const m of moves) {
    const v = search(fastApply(s, m), me, DEPTH - 1, -1e9, 1e9) + Math.random() * 2
    if (v > bv) { bv = v; best = m }
  }
  return applyMove(s, best)
}
