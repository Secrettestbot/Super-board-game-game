/* QUARTO — logic (built for this codebase, not ported).
   A 4x4 board and 16 UNIQUE pieces. Each piece is a 4-bit code over four binary attributes:
     bit 0 — height : TALL (1) / short (0)
     bit 1 — colour : DARK (1) / light (0)
     bit 2 — shape  : SQUARE (1) / round (0)
     bit 3 — fill   : SOLID (1) / hollow (0)
   THE TWIST: you never choose your own piece — your OPPONENT hands you the piece you must place.
   A turn = (1) place the handed piece on any empty cell, then (2) hand one unused piece to the
   opponent. A line (row / column / either main diagonal) of 4 pieces that all SHARE at least one
   attribute value wins for the player who just placed. Board full with no such line = draw.
   AI: depth-limited minimax over (place, hand) pairs that always takes an immediate win and never
   hands a piece that lets the opponent win when avoidable. */

export const N = 4
export const NCELL = N * N      // 16
export const NPIECE = 16        // pieces 0..15, the 4 attribute bits

export type Piece = number       // 0..15
export type Cell = Piece | null
export type Player = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export interface QuartoState {
  board: Cell[]              // length 16, index = r*4 + c
  pool: boolean[]            // length 16, pool[p] = piece p is still unused & not on board/handed
  hand: Piece | null         // the piece the current player must place
  turn: Player | null        // whose turn (who must place `hand`)
  winner: Player | 'draw' | null
  line: number[] | null      // winning cell indices (for highlight)
  last: number | null        // last placed cell
  log: LogEntry[]
}

const other = (p: Player): Player => (p === 'you' ? 'ai' : 'you')
const idx = (r: number, c: number) => r * N + c

// attribute bit masks
export const TALL = 1, DARK = 2, SQUARE = 4, SOLID = 8

export interface Attrs { tall: boolean; dark: boolean; square: boolean; solid: boolean }
export function attrs(p: Piece): Attrs {
  return { tall: !!(p & TALL), dark: !!(p & DARK), square: !!(p & SQUARE), solid: !!(p & SOLID) }
}

/** A human-readable name, e.g. "tall dark hollow square". */
export function pieceName(p: Piece): string {
  const a = attrs(p)
  return [a.tall ? 'tall' : 'short', a.dark ? 'dark' : 'light', a.solid ? 'solid' : 'hollow', a.square ? 'square' : 'round'].join(' ')
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): QuartoState {
  const board: Cell[] = new Array(NCELL).fill(null)
  const pool: boolean[] = new Array(NPIECE).fill(true)
  // The first piece is handed to the human to start; pick a random one out of the pool.
  const first = (Math.random() * NPIECE) | 0
  pool[first] = false
  return {
    board, pool, hand: first, turn: 'you', winner: null, line: null, last: null,
    log: [
      { t: 'sys', x: 'In Quarto your rival picks the piece you must place. Make a line of four that share any one trait to win.' },
      { t: 'ai', x: `Rival hands you a ${pieceName(first)}.` },
    ],
  }
}

// ===== line-win detection =====
const LINES: number[][] = (() => {
  const ls: number[][] = []
  for (let r = 0; r < N; r++) ls.push([0, 1, 2, 3].map(c => idx(r, c)))         // rows
  for (let c = 0; c < N; c++) ls.push([0, 1, 2, 3].map(r => idx(r, c)))         // cols
  ls.push([0, 1, 2, 3].map(k => idx(k, k)))                                     // main diag
  ls.push([0, 1, 2, 3].map(k => idx(k, N - 1 - k)))                             // anti diag
  return ls
})()

export const ALL_LINES = LINES

/** Do four pieces all share at least one attribute value? */
function quartet(a: Piece, b: Piece, c: Piece, d: Piece): boolean {
  // shared-1 bits: bit set in all four. shared-0 bits: bit clear in all four.
  const and = a & b & c & d            // bits that are 1 in every piece
  const or = a | b | c | d             // a 0 bit here means that bit was 0 in every piece
  return and !== 0 || (or & 0xf) !== 0xf
}

/** Returns the winning line's cells if the board has a completed sharing line, else null. */
export function winningLine(board: Cell[]): number[] | null {
  for (const ln of LINES) {
    const [i, j, k, l] = ln
    const a = board[i], b = board[j], c = board[k], d = board[l]
    if (a === null || b === null || c === null || d === null) continue
    if (quartet(a, b, c, d)) return ln
  }
  return null
}

export function emptyCells(board: Cell[]): number[] {
  const out: number[] = []
  for (let i = 0; i < NCELL; i++) if (board[i] === null) out.push(i)
  return out
}

export function poolPieces(pool: boolean[]): Piece[] {
  const out: Piece[] = []
  for (let p = 0; p < NPIECE; p++) if (pool[p]) out.push(p)
  return out
}

// ===== mutations =====

/** Place the currently-handed piece on an empty cell. Resolves a win/draw, otherwise leaves
 *  the same player to HAND a piece (turn stays; hand becomes null to signal "pick to hand"). */
export function place(s: QuartoState, cell: number): QuartoState {
  if (s.winner || s.turn === null || s.hand === null) return s
  if (s.board[cell] !== null) return s
  const who = s.turn
  const piece = s.hand
  const board = s.board.slice(); board[cell] = piece
  const r = Math.floor(cell / N), c = cell % N
  const at = `${'ABCD'[c]}${r + 1}`
  let log = push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You place' : 'Rival places'} the ${pieceName(piece)} on ${at}.`)

  const line = winningLine(board)
  if (line) {
    log = push(log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You complete' : 'Rival completes'} a line — QUARTO!`)
    return Object.assign({}, s, { board, hand: null, turn: null, winner: who, line, last: cell, log })
  }
  if (emptyCells(board).length === 0) {
    log = push(log, 'sys', 'The gallery is full — a draw.')
    return Object.assign({}, s, { board, hand: null, turn: null, winner: 'draw', line: null, last: cell, log })
  }
  // placed; now this player must hand a piece (hand = null => "choose to hand")
  return Object.assign({}, s, { board, hand: null, turn: who, last: cell, log })
}

/** Current player hands `piece` to the opponent, passing the turn. */
export function hand(s: QuartoState, piece: Piece): QuartoState {
  if (s.winner || s.turn === null || s.hand !== null) return s
  if (!s.pool[piece]) return s
  const who = s.turn
  const opp = other(who)
  const pool = s.pool.slice(); pool[piece] = false
  const log = push(s.log, who === 'you' ? 'you' : 'ai',
    `${who === 'you' ? 'You hand the rival' : 'Rival hands you'} a ${pieceName(piece)}.`)
  return Object.assign({}, s, { pool, hand: piece, turn: opp, log })
}

// ===== AI: depth-limited minimax over (place, hand) pairs =====
// The AI ('ai') wants to win. It searches the place-then-hand sequence. A node is keyed by
// (board, pool, handedPiece, playerToPlace). Score: +1 the mover-to-act eventually wins, etc.
// We score from the AI's perspective: +LARGE good for AI, -LARGE good for human.

const WIN = 1000

/** Is there an immediate winning placement of `piece` for the player to move? */
function immediateWinCell(board: Cell[], piece: Piece): number | null {
  for (const cell of emptyCells(board)) {
    const nb = board.slice(); nb[cell] = piece
    if (winningLine(nb)) return cell
  }
  return null
}

/**
 * Negamax-style search. `toPlace` is the player whose turn it is to place `piece`.
 * Returns a score from `toPlace`'s perspective (positive = good for the player to act now).
 * depth counts placements remaining to explore.
 */
function search(board: Cell[], pool: boolean[], piece: Piece, depth: number, alpha: number, beta: number): number {
  // If the mover can win immediately, they will.
  const winCell = immediateWinCell(board, piece)
  if (winCell !== null) return WIN

  const empties = emptyCells(board)
  if (empties.length === 0) return 0   // board fills with this placement -> draw (no win found)

  const remaining = poolPieces(pool)
  // If no pieces remain to hand but the board isn't full, after placing it's a draw line.
  if (remaining.length === 0) {
    // place anywhere (no win possible since immediateWin was null), board not full -> can't hand -> draw
    return 0
  }

  if (depth <= 0) {
    // Heuristic: slight preference to positions where the opponent has fewer winning replies.
    return heuristic(board, pool, piece)
  }

  let best = -WIN * 2
  for (const cell of empties) {
    const nb = board.slice(); nb[cell] = piece
    // placing didn't win (checked). Now mover hands a piece to opponent; opponent then acts.
    let bestForThisCell = -WIN * 2     // mover picks the hand that's worst for the opponent
    for (const give of remaining) {
      const np = pool.slice(); np[give] = false
      // opponent's resulting score (from opponent's perspective); negate for mover.
      const oppScore = search(nb, np, give, depth - 1, -beta, -alpha)
      const moverScore = -oppScore
      if (moverScore > bestForThisCell) bestForThisCell = moverScore
      // alpha-beta on the hand choice (maximizing moverScore)
      if (bestForThisCell > best) best = bestForThisCell
      if (best > alpha) alpha = best
      if (alpha >= beta) return best
    }
  }
  return best
}

/** Cheap leaf estimate: fewer immediate-win threats we hand the opponent is better. */
function heuristic(board: Cell[], pool: boolean[], piece: Piece): number {
  // The mover must place `piece` then hand one. Estimate by: can the mover place such that
  // every remaining hand is "safe" (opponent can't immediately win)? Reward safety.
  const empties = emptyCells(board)
  const remaining = poolPieces(pool)
  let bestCellScore = -WIN
  for (const cell of empties) {
    const nb = board.slice(); nb[cell] = piece
    if (winningLine(nb)) return WIN
    if (remaining.length === 0) { bestCellScore = Math.max(bestCellScore, 0); continue }
    let safeHands = 0
    for (const give of remaining) if (immediateWinCell(nb, give) === null) safeHands++
    // if at least one safe hand exists, this cell is non-losing-ish
    const cellScore = safeHands > 0 ? safeHands : -50
    bestCellScore = Math.max(bestCellScore, cellScore)
  }
  return bestCellScore
}

const AI_DEPTH = 2

export function aiMove(s: QuartoState): QuartoState {
  if (s.winner || s.turn !== 'ai') return s

  // PHASE 1 — place the handed piece.
  if (s.hand !== null) {
    const piece = s.hand
    // (a) take an immediate win if one exists.
    const winCell = immediateWinCell(s.board, piece)
    let cell: number
    if (winCell !== null) {
      cell = winCell
    } else {
      // choose the placement that maximizes our eventual outcome (search over the hand that follows).
      const empties = emptyCells(s.board)
      const remaining = poolPieces(s.pool)
      let best = -WIN * 3
      const scored: { cell: number; v: number }[] = []
      for (const c of empties) {
        const nb = s.board.slice(); nb[c] = piece
        // after we place, we must hand; value = best hand we can give (max over gives of -oppScore)
        let cellV: number
        if (remaining.length === 0) {
          cellV = emptyCells(nb).length === 0 ? 0 : 0
        } else {
          cellV = -WIN * 3
          for (const give of remaining) {
            const np = s.pool.slice(); np[give] = false
            const oppScore = search(nb, np, give, AI_DEPTH - 1, -WIN * 4, WIN * 4)
            cellV = Math.max(cellV, -oppScore)
          }
        }
        scored.push({ cell: c, v: cellV })
        if (cellV > best) best = cellV
      }
      const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.cell)
      cell = top[(Math.random() * top.length) | 0]
    }
    return place(s, cell)
  }

  // PHASE 2 — hand a piece to the human.
  const remaining = poolPieces(s.pool)
  if (remaining.length === 0) return s   // shouldn't happen mid-game
  // (b) never hand a piece that lets the human immediately win, if avoidable.
  const safe = remaining.filter(p => immediateWinCell(s.board, p) === null)
  const candidates = safe.length ? safe : remaining
  // Among candidates, pick the hand that minimizes the human's eventual score (= search from human's view).
  let best = WIN * 3
  const scored: { give: Piece; v: number }[] = []
  for (const give of candidates) {
    const np = s.pool.slice(); np[give] = false
    const humanScore = search(s.board, np, give, AI_DEPTH - 1, -WIN * 4, WIN * 4)
    scored.push({ give, v: humanScore })
    if (humanScore < best) best = humanScore
  }
  const top = scored.filter(o => o.v <= best + 1e-6).map(o => o.give)
  const give = top[(Math.random() * top.length) | 0]
  return hand(s, give)
}
