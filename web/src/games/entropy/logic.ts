/* ENTROPY (a.k.a. Hyle) — logic (built for this codebase, not ported).
   A 5x5 grid filled over 25 placements from a bag of 25 tiles (5 colours × 5).
   Two roles alternate each round:
     CHAOS (you)  — draws a random coloured tile and PLACES it on any empty cell,
                    trying to keep the board DISORDERED.
     ORDER (AI)   — then MOVES one tile any number of empty cells rook-style
                    (not jumping) to a new empty cell, or passes, trying to build
                    symmetric PATTERNS. After Order's move we SCORE the board:
                    every palindromic run of length 2..5 in every row and column
                    scores its length, summed; that is Order's running total.
   WIN RULE: Chaos (you) wins if Order's FINAL score is at or below PAR; else Order wins. */

export const N = 5
export const PAR = 50
export const COLORS = ['c', 'm', 'y', 'g', 'o'] as const  // five tile colours
export type Color = typeof COLORS[number]
export type Cell = Color | null
export type Phase = 'chaos' | 'order' | 'over'

export interface LogEntry { t: string; x: string }

export interface EntropyState {
  board: Cell[]            // length 25, index = r*N + c
  bag: Color[]             // remaining undrawn tiles
  drawn: Color | null      // the tile Chaos must place this turn (null only when over)
  phase: Phase
  score: number            // Order's running palindrome score
  placed: number           // tiles placed so far (0..25)
  winner: 'chaos' | 'order' | null
  last: number | null      // last touched cell (highlight)
  log: LogEntry[]
}

const idx = (r: number, c: number) => r * N + c

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

// Mulberry-ish: just use Math.random (allowed). Draw a uniformly random tile from the bag.
function drawFrom(bag: Color[]): { tile: Color | null; rest: Color[] } {
  if (!bag.length) return { tile: null, rest: bag }
  const k = (Math.random() * bag.length) | 0
  const rest = bag.slice()
  const tile = rest.splice(k, 1)[0]
  return { tile, rest }
}

export function freshBag(): Color[] {
  const bag: Color[] = []
  for (const col of COLORS) for (let i = 0; i < N; i++) bag.push(col)
  return bag
}

export function makeGame(): EntropyState {
  const board: Cell[] = new Array(N * N).fill(null)
  const full = freshBag()
  const { tile, rest } = drawFrom(full)
  return {
    board, bag: rest, drawn: tile, phase: 'chaos', score: 0, placed: 0,
    winner: null, last: null,
    log: [{ t: 'sys', x: `You are CHAOS — place each random tile to keep the board disordered. Keep Order at or below ${PAR} to win.` }],
  }
}

// ===== Palindrome scoring =====
// For a single line (array of cells), count every contiguous run of FILLED cells
// that reads the same forwards and backwards, length 2..N, scoring its length.
export function scoreLine(line: Cell[]): number {
  let total = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === null) continue
    for (let j = i + 1; j < line.length; j++) {
      // substring i..j inclusive, length j-i+1 (>=2); must be a contiguous run of
      // FILLED cells that reads the same forwards and backwards.
      let ok = true
      for (let k = i; k <= j; k++) if (line[k] === null) { ok = false; break }
      if (ok) for (let a = i, b = j; a < b; a++, b--) if (line[a] !== line[b]) { ok = false; break }
      if (ok) total += (j - i + 1)
    }
  }
  return total
}

export function scoreBoard(board: Cell[]): number {
  let total = 0
  for (let r = 0; r < N; r++) {
    const row: Cell[] = []
    for (let c = 0; c < N; c++) row.push(board[idx(r, c)])
    total += scoreLine(row)
  }
  for (let c = 0; c < N; c++) {
    const col: Cell[] = []
    for (let r = 0; r < N; r++) col.push(board[idx(r, c)])
    total += scoreLine(col)
  }
  return total
}

export function emptyCells(board: Cell[]): number[] {
  const out: number[] = []
  for (let i = 0; i < board.length; i++) if (!board[i]) out.push(i)
  return out
}

function finish(s: EntropyState, board: Cell[], score: number, log: LogEntry[]): EntropyState {
  const winner: 'chaos' | 'order' = score <= PAR ? 'chaos' : 'order'
  const msg = winner === 'chaos'
    ? `Board full. Order scored ${score} ≤ par ${PAR} — Chaos wins.`
    : `Board full. Order scored ${score} > par ${PAR} — Order wins.`
  return Object.assign({}, s, { board, score, phase: 'over' as Phase, drawn: null, winner, log: push(log, winner === 'chaos' ? 'you' : 'ai', msg) })
}

// CHAOS places the drawn tile on empty cell i, then it becomes ORDER's turn.
export function place(s: EntropyState, i: number): EntropyState {
  if (s.phase !== 'chaos' || s.winner || s.drawn == null) return s
  if (s.board[i]) return s
  const board = s.board.slice()
  board[i] = s.drawn
  const placed = s.placed + 1
  const r = Math.floor(i / N), c = i % N
  let log = push(s.log, 'you', `Chaos placed ${s.drawn.toUpperCase()} at ${'ABCDE'[c]}${r + 1}.`)
  const score = scoreBoard(board)
  return Object.assign({}, s, { board, placed, last: i, phase: 'order' as Phase, score, log })
}

// ===== ORDER's rook move =====
// All legal rook slides for the tile at `from`: empty destinations reachable
// horizontally/vertically without jumping over a filled cell.
export function rookDests(board: Cell[], from: number): number[] {
  const out: number[] = []
  if (!board[from]) return out
  const r0 = Math.floor(from / N), c0 = from % N
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  for (const [dr, dc] of dirs) {
    let r = r0 + dr, c = c0 + dc
    while (r >= 0 && r < N && c >= 0 && c < N && !board[idx(r, c)]) {
      out.push(idx(r, c))
      r += dr; c += dc
    }
  }
  return out
}

export interface RookMove { from: number; to: number }

export function allRookMoves(board: Cell[]): RookMove[] {
  const out: RookMove[] = []
  for (let from = 0; from < board.length; from++) {
    if (!board[from]) continue
    for (const to of rookDests(board, from)) out.push({ from, to })
  }
  return out
}

export function applyRook(board: Cell[], from: number, to: number): Cell[] {
  const nb = board.slice()
  nb[to] = nb[from]
  nb[from] = null
  return nb
}

// Advance from ORDER phase: draw the next tile for Chaos (or finish if board full).
function afterOrder(s: EntropyState, board: Cell[], score: number, log: LogEntry[], last: number | null): EntropyState {
  if (s.placed >= N * N || emptyCells(board).length === 0) {
    return finish(s, board, score, log)
  }
  const { tile, rest } = drawFrom(s.bag)
  return Object.assign({}, s, { board, score, bag: rest, drawn: tile, phase: 'chaos' as Phase, last, log })
}

// ORDER (the AI) takes its turn: greedy 1-ply — pick the rook move that yields the
// highest board score; pass (no move) if nothing beats the current score.
export function aiStep(s: EntropyState): EntropyState {
  if (s.phase !== 'order' || s.winner) return s
  const cur = scoreBoard(s.board)
  let best = cur
  let bestMoves: RookMove[] = []
  for (const m of allRookMoves(s.board)) {
    const v = scoreBoard(applyRook(s.board, m.from, m.to))
    if (v > best + 1e-9) { best = v; bestMoves = [m] }
    else if (Math.abs(v - best) < 1e-9 && v > cur + 1e-9) bestMoves.push(m)
  }
  if (!bestMoves.length) {
    // pass — nothing improves the score
    const log = push(s.log, 'ai', `Order passed (score holds at ${cur}).`)
    return afterOrder(s, s.board, cur, log, s.last)
  }
  const mv = bestMoves[(Math.random() * bestMoves.length) | 0]
  const board = applyRook(s.board, mv.from, mv.to)
  const score = scoreBoard(board)
  const fr = Math.floor(mv.from / N), fc = mv.from % N
  const tr = Math.floor(mv.to / N), tc = mv.to % N
  const log = push(s.log, 'ai', `Order slid ${'ABCDE'[fc]}${fr + 1}→${'ABCDE'[tc]}${tr + 1} (score ${score}).`)
  return afterOrder(s, board, score, log, mv.to)
}
