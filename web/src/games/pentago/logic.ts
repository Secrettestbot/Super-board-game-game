/* PENTAGO — logic (built for this codebase, not ported).
   A 6x6 board split into four 3x3 quadrants. You are White and move first; the AI is Black.
   A turn is TWO steps: (1) PLACE one of your marbles in any empty cell, then (2) ROTATE one of
   the four quadrants 90° clockwise or counter-clockwise. WIN: after the rotation, FIVE in a row
   (horizontal, vertical, or diagonal) anywhere on the 6x6 — lines may cross quadrant borders.
   Both five-at-once after a rotation = draw; full board with no five = draw.

   AI: minimax with alpha-beta at depth 2 (branching is empty-cells × 8 rotations) over a
   line-potential heuristic counting open runs of 2/3/4 for both sides, with an immediate
   win/block shortcut and a tiny random tie-break. */

export const N = 6
export type Marble = 'w' | 'b'
export type Cell = Marble | null
export interface LogEntry { t: string; x: string }

// Phase: 'place' = pick an empty cell; 'rotate' = pick a quadrant + direction.
export type Phase = 'place' | 'rotate'

export interface PentagoState {
  board: Cell[]                 // length 36, index = r*6 + c
  turn: Marble | null           // whose turn (null when finished)
  phase: Phase                  // current step within the turn
  you: Marble
  pending: number | null        // cell just placed this turn, awaiting a rotation
  winner: Marble | 'draw' | null
  line: number[] | null         // the winning five cells (for highlight)
  last: number | null           // last placed cell (for highlight)
  log: LogEntry[]
}

export type Dir = 'cw' | 'ccw'
// Quadrants: 0 = TL, 1 = TR, 2 = BL, 3 = BR
export const QUADS = [
  { id: 0, name: 'TL', r0: 0, c0: 0 },
  { id: 1, name: 'TR', r0: 0, c0: 3 },
  { id: 2, name: 'BL', r0: 3, c0: 0 },
  { id: 3, name: 'BR', r0: 3, c0: 3 },
]

const other = (m: Marble): Marble => m === 'w' ? 'b' : 'w'
const idx = (r: number, c: number) => r * N + c

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): PentagoState {
  return {
    board: new Array(N * N).fill(null),
    turn: 'w', phase: 'place', you: 'w',
    pending: null, winner: null, line: null, last: null,
    log: [{ t: 'sys', x: 'You are White and move first. Place a marble, then twist a quadrant — five in a row wins.' }],
  }
}

// ---- rotation ----
// Rotate the 3x3 quadrant `q` of `board` by `dir`, returning a new board.
export function rotateQuad(board: Cell[], q: number, dir: Dir): Cell[] {
  const { r0, c0 } = QUADS[q]
  const nb = board.slice()
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    // clockwise: new(r,c) = old(2-c, r); counter-clockwise: new(r,c) = old(c, 2-r)
    const sr = dir === 'cw' ? 2 - c : c
    const sc = dir === 'cw' ? r : 2 - r
    nb[idx(r0 + r, c0 + c)] = board[idx(r0 + sr, c0 + sc)]
  }
  return nb
}

// ---- win detection ----
const LINES: number[][] = (() => {
  const out: number[][] = []
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    for (const [dr, dc] of dirs) {
      const er = r + 4 * dr, ec = c + 4 * dc
      if (er < 0 || er >= N || ec < 0 || ec >= N) continue
      const run: number[] = []
      for (let k = 0; k < 5; k++) run.push(idx(r + k * dr, c + k * dc))
      out.push(run)
    }
  }
  return out
})()

// Returns the winning line for `who`, or null. (Five consecutive same-colour cells.)
export function fiveLine(board: Cell[], who: Marble): number[] | null {
  for (const ln of LINES) {
    if (ln.every(i => board[i] === who)) return ln
  }
  return null
}

export function isFull(board: Cell[]): boolean { return board.every(v => v !== null) }

function settle(s: PentagoState, board: Cell[], log: LogEntry[], placed: number): PentagoState {
  const wL = fiveLine(board, 'w'), bL = fiveLine(board, 'b')
  if (wL && bL) {
    return Object.assign({}, s, { board, turn: null, phase: 'place', pending: null, last: placed, winner: 'draw', line: wL.concat(bL), log: push(log, 'sys', 'Both made five at once — a draw.') })
  }
  if (wL || bL) {
    const winner: Marble = wL ? 'w' : 'b'
    const youWon = winner === s.you
    return Object.assign({}, s, { board, turn: null, phase: 'place', pending: null, last: placed, winner, line: (wL || bL), log: push(log, youWon ? 'you' : 'ai', `${youWon ? 'You make' : 'The rival makes'} five in a row.`) })
  }
  if (isFull(board)) {
    return Object.assign({}, s, { board, turn: null, phase: 'place', pending: null, last: placed, winner: 'draw', line: null, log: push(log, 'sys', 'The board is full with no five — a draw.') })
  }
  const turn = other(s.turn as Marble)
  return Object.assign({}, s, { board, turn, phase: 'place', pending: null, last: placed, winner: null, line: null, log })
}

// ---- step 1: place a marble ----
export function place(s: PentagoState, i: number, who: Marble): PentagoState {
  if (s.winner || s.turn !== who || s.phase !== 'place') return s
  if (s.board[i]) return s
  const board = s.board.slice(); board[i] = who
  const r = Math.floor(i / N), c = i % N
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You place' : 'Rival places'} ${'ABCDEF'[c]}${r + 1}.`)
  return Object.assign({}, s, { board, phase: 'rotate', pending: i, last: i, log })
}

// ---- step 2: rotate a quadrant, ending the turn ----
export function rotate(s: PentagoState, q: number, dir: Dir, who: Marble): PentagoState {
  if (s.winner || s.turn !== who || s.phase !== 'rotate') return s
  const board = rotateQuad(s.board, q, dir)
  const arrow = dir === 'cw' ? '↻' : '↺'
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You rotate' : 'Rival rotates'} ${QUADS[q].name} ${arrow}.`)
  return settle(s, board, log, s.pending ?? (s.last as number))
}

// ===== AI: alpha-beta, depth 2, over a line-potential heuristic =====

const WIN = 1e7

// Count open runs of n same-colour cells (rest empty) within each 5-window for `me`/`opp`.
function evalBoard(board: Cell[], me: Marble): number {
  const opp = other(me)
  let score = 0
  for (const ln of LINES) {
    let mine = 0, theirs = 0
    for (const i of ln) { const v = board[i]; if (v === me) mine++; else if (v === opp) theirs++ }
    if (mine && theirs) continue          // blocked window, no potential
    if (mine === 5) return WIN
    if (theirs === 5) return -WIN
    score += POT[mine] - POT[theirs]
  }
  return score
}
const POT = [0, 1, 5, 25, 120, 0]         // weight by run length (index = cell count)

function terminalScore(board: Cell[], me: Marble): number | null {
  const opp = other(me)
  const mL = fiveLine(board, me), oL = fiveLine(board, opp)
  if (mL && oL) return 0                   // simultaneous five -> draw
  if (mL) return WIN
  if (oL) return -WIN
  if (isFull(board)) return 0
  return null
}

// All (cell, quad, dir) turns from a board for `who`, returning the resulting boards.
function genTurns(board: Cell[], who: Marble): { board: Cell[]; i: number; q: number; dir: Dir }[] {
  const out: { board: Cell[]; i: number; q: number; dir: Dir }[] = []
  for (let i = 0; i < N * N; i++) {
    if (board[i]) continue
    const placed = board.slice(); placed[i] = who
    for (let q = 0; q < 4; q++) {
      for (const dir of ['cw', 'ccw'] as Dir[]) {
        out.push({ board: rotateQuad(placed, q, dir), i, q, dir })
      }
    }
  }
  return out
}

function search(board: Cell[], toMove: Marble, me: Marble, depth: number, alpha: number, beta: number): number {
  const term = terminalScore(board, me)
  if (term !== null) return term
  if (depth === 0) return evalBoard(board, me)
  const turns = genTurns(board, toMove)
  if (!turns.length) return evalBoard(board, me)
  if (toMove === me) {
    let best = -Infinity
    for (const t of turns) {
      best = Math.max(best, search(t.board, other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const t of turns) {
      best = Math.min(best, search(t.board, other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}

// Pick a full turn (place + rotate) for the AI and apply both steps.
export function aiMove(s: PentagoState): PentagoState {
  if (s.winner || s.turn !== 'b' || s.phase !== 'place') return s
  const me: Marble = 'b', opp = other(me)
  const turns = genTurns(s.board, me)
  if (!turns.length) return s

  // 1) Immediate win — take it.
  for (const t of turns) if (fiveLine(t.board, me)) return applyTurn(s, t)

  // 2) Block an opponent immediate win. If the opponent could make five on their next
  //    turn from the board we'd leave, prefer turns that deny every such threat.
  const safe = turns.filter(t => !opponentCanWin(t.board, opp))

  const pool = safe.length ? safe : turns
  let best = -Infinity
  const scored: { t: typeof turns[number]; v: number }[] = []
  for (const t of pool) {
    const v = search(t.board, opp, me, 1, -Infinity, Infinity)
    scored.push({ t, v }); if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6)
  const choice = top[(Math.random() * top.length) | 0].t
  return applyTurn(s, choice)
}

function opponentCanWin(board: Cell[], opp: Marble): boolean {
  for (const t of genTurns(board, opp)) if (fiveLine(t.board, opp)) return true
  return false
}

function applyTurn(s: PentagoState, t: { i: number; q: number; dir: Dir }): PentagoState {
  const placed = place(s, t.i, 'b')
  return rotate(placed, t.q, t.dir, 'b')
}
