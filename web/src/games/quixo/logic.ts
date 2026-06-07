/* QUIXO — logic (built for this codebase, not ported).
   5x5 grid of cubes; each is blank (0), X (you, +1), or O (AI, -1). On your turn you take ONE
   cube from the OUTER BORDER that is blank or already yours, then slide it back into the grid
   from one of the available ends of its row or column. Sliding shifts every cube in that line
   toward the vacated end and inserts your cube at the far end (you cannot push it straight back
   into the same spot). First to a full line of 5 of their own symbol wins. If a move completes a
   line for BOTH players, the player who did NOT move wins. You move first. */

export const N = 5
export type Mark = 0 | 1 | -1           // 0 blank, 1 = X (you), -1 = O (ai)
export type Player = 'you' | 'ai'
export type Dir = 'up' | 'down' | 'left' | 'right'   // direction the cube is INSERTED from

export interface Move {
  cell: number       // index 0..24 of the cube taken (must be on the border)
  dir: Dir           // which end it is pushed in from
}

export interface LogEntry { t: string; x: string }

export interface State {
  board: Mark[]              // length 25, index = r*5 + c
  turn: Player | null        // whose move; null when the game is over
  winner: Player | 'draw' | null
  last: { from: number; to: number } | null
  log: LogEntry[]
}

const markOf = (p: Player): Mark => (p === 'you' ? 1 : -1)
const playerOf = (m: Mark): Player | null => (m === 1 ? 'you' : m === -1 ? 'ai' : null)
const other = (p: Player): Player => (p === 'you' ? 'ai' : 'you')
const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]
const idx = (r: number, c: number) => r * N + c

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): State {
  return {
    board: new Array(N * N).fill(0) as Mark[],
    turn: 'you',
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'You are X and move first. Take a border cube, slide it home, build a line of five.' }],
  }
}

export const isBorder = (i: number): boolean => {
  const [r, c] = rc(i)
  return r === 0 || r === N - 1 || c === 0 || c === N - 1
}

/**
 * Which insertion directions are legal for a cube taken at index `i`.
 * A cube on the border can be pushed in from any end of its row/column EXCEPT the end it
 * currently sits at (that would just put it back where it came from).
 */
export function dirsFor(i: number): Dir[] {
  const [r, c] = rc(i)
  const out: Dir[] = []
  // along the column: push from top (down) or bottom (up). Can't push from the end you're on.
  if (r !== 0) out.push('down')          // insert at top edge, shift column downward
  if (r !== N - 1) out.push('up')        // insert at bottom edge, shift column upward
  // along the row: push from left (right) or right (left).
  if (c !== 0) out.push('right')         // insert at left edge, shift row rightward
  if (c !== N - 1) out.push('left')      // insert at right edge, shift row leftward
  return out
}

export function legalMoves(s: State): Move[] {
  if (s.winner != null || s.turn == null) return []
  const me = markOf(s.turn)
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) {
    if (!isBorder(i)) continue
    if (s.board[i] !== 0 && s.board[i] !== me) continue   // can't take opponent's cube
    for (const d of dirsFor(i)) out.push({ cell: i, dir: d })
  }
  return out
}

/** Slide on a copy of the board: take cube at `cell`, set it to `me`, insert from `dir`. */
function slide(board: Mark[], cell: number, dir: Dir, me: Mark): Mark[] {
  const nb = board.slice()
  const [r, c] = rc(cell)
  if (dir === 'left' || dir === 'right') {
    // operate within row r
    const line: Mark[] = []
    for (let cc = 0; cc < N; cc++) line.push(nb[idx(r, cc)])
    line.splice(c, 1)                       // remove the taken cube
    if (dir === 'right') line.unshift(me)   // inserted at left edge → shifts right
    else line.push(me)                      // dir === 'left' → inserted at right edge
    for (let cc = 0; cc < N; cc++) nb[idx(r, cc)] = line[cc]
  } else {
    // operate within column c
    const line: Mark[] = []
    for (let rr = 0; rr < N; rr++) line.push(nb[idx(rr, c)])
    line.splice(r, 1)
    if (dir === 'down') line.unshift(me)    // inserted at top edge → shifts down
    else line.push(me)                      // dir === 'up' → inserted at bottom edge
    for (let rr = 0; rr < N; rr++) nb[idx(rr, c)] = line[rr]
  }
  return nb
}

/** Where the moved cube ends up, for highlight purposes. */
function destOf(cell: number, dir: Dir): number {
  const [r, c] = rc(cell)
  if (dir === 'right') return idx(r, 0)
  if (dir === 'left') return idx(r, N - 1)
  if (dir === 'down') return idx(0, c)
  return idx(N - 1, c)                        // up
}

const LINES: number[][] = (() => {
  const ls: number[][] = []
  for (let r = 0; r < N; r++) ls.push(Array.from({ length: N }, (_, c) => idx(r, c)))
  for (let c = 0; c < N; c++) ls.push(Array.from({ length: N }, (_, r) => idx(r, c)))
  ls.push(Array.from({ length: N }, (_, k) => idx(k, k)))
  ls.push(Array.from({ length: N }, (_, k) => idx(k, N - 1 - k)))
  return ls
})()

/** Returns set of players who currently have at least one full line on this board. */
function completedLines(board: Mark[]): { you: boolean; ai: boolean } {
  let you = false, ai = false
  for (const line of LINES) {
    const first = board[line[0]]
    if (first === 0) continue
    let all = true
    for (let k = 1; k < N; k++) if (board[line[k]] !== first) { all = false; break }
    if (all) { if (first === 1) you = true; else ai = true }
  }
  return { you, ai }
}

/** Resolve the winner for the player who just moved. Quixo: if both lines complete, the
 *  player who did NOT move wins. */
function resolveWinner(board: Mark[], mover: Player): Player | null {
  const { you, ai } = completedLines(board)
  if (!you && !ai) return null
  if (you && ai) return other(mover)         // both → mover loses
  const w: Player = you ? 'you' : 'ai'
  // single line: that player wins regardless of who moved (only possible to be the mover or,
  // for an opponent's pre-existing line, but lines only change via the mover's slide).
  return w
}

export function applyMove(s: State, move: Move): State {
  if (s.winner != null || s.turn == null) return s
  const me = markOf(s.turn)
  // validate
  if (!isBorder(move.cell)) return s
  if (s.board[move.cell] !== 0 && s.board[move.cell] !== me) return s
  if (!dirsFor(move.cell).includes(move.dir)) return s

  const board = slide(s.board, move.cell, move.dir, me)
  const mover = s.turn
  const to = destOf(move.cell, move.dir)
  const win = resolveWinner(board, mover)

  if (win != null) {
    const youWon = win === 'you'
    return Object.assign({}, s, {
      board, turn: null, winner: win, last: { from: move.cell, to },
      log: push(s.log, youWon ? 'you' : 'ai', `${youWon ? 'You complete' : 'Rival completes'} a line of five — ${youWon ? 'you win' : 'rival wins'}!`),
    })
  }

  const nxt = other(mover)
  const log = push(s.log, mover === 'you' ? 'you' : 'ai',
    `${mover === 'you' ? 'You' : 'Rival'} slid a cube ${move.dir}.`)
  return Object.assign({}, s, { board, turn: nxt, last: { from: move.cell, to }, log })
}

// ===================== AI: alpha-beta over near-complete-line counts =====================

/** Heuristic from `me`'s perspective: for each line score by how full it is for one side. */
function evalBoard(board: Mark[], me: Mark): number {
  const opp = -me as Mark
  let score = 0
  for (const line of LINES) {
    let mine = 0, theirs = 0
    for (const i of line) { const v = board[i]; if (v === me) mine++; else if (v === opp) theirs++ }
    if (mine > 0 && theirs > 0) continue          // contested line — no value to either
    if (mine > 0) score += LINE_VALUE[mine]
    else if (theirs > 0) score -= LINE_VALUE[theirs]
  }
  return score
}
// weight a line by how close it is to five. 5 is a win (huge); 4 is a strong threat.
const LINE_VALUE: Record<number, number> = { 0: 0, 1: 1, 2: 6, 3: 30, 4: 200, 5: 100000 }

function applyFor(board: Mark[], m: Move, me: Mark): Mark[] {
  return slide(board, m.cell, m.dir, me)
}

function movesForBoard(board: Mark[], me: Mark): Move[] {
  const out: Move[] = []
  for (let i = 0; i < N * N; i++) {
    if (!isBorder(i)) continue
    if (board[i] !== 0 && board[i] !== me) continue
    for (const d of dirsFor(i)) out.push({ cell: i, dir: d })
  }
  return out
}

const WIN = 100000

/** Returns winner-mark for the player who just produced this board, or 0 if none.
 *  +1 if X has the (only) line, -1 if O has it, and if BOTH then the non-mover wins. */
function terminalFor(board: Mark[], mover: Mark): Mark {
  const { you, ai } = completedLines(board)
  if (!you && !ai) return 0
  if (you && ai) return (-mover) as Mark        // both → mover loses
  return you ? 1 : -1
}

function search(board: Mark[], toMove: Mark, me: Mark, depth: number, alpha: number, beta: number): number {
  const moves = movesForBoard(board, toMove)
  if (!moves.length) return evalBoard(board, me)
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      const nb = applyFor(board, m, toMove)
      const t = terminalFor(nb, toMove)
      let v: number
      if (t !== 0) v = t === me ? WIN + depth : -(WIN + depth)
      else if (depth <= 1) v = evalBoard(nb, me)
      else v = search(nb, -toMove as Mark, me, depth - 1, alpha, beta)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      const nb = applyFor(board, m, toMove)
      const t = terminalFor(nb, toMove)
      let v: number
      if (t !== 0) v = t === me ? WIN + depth : -(WIN + depth)
      else if (depth <= 1) v = evalBoard(nb, me)
      else v = search(nb, -toMove as Mark, me, depth - 1, alpha, beta)
      if (v < best) best = v
      if (best < beta) beta = best
      if (alpha >= beta) break
    }
    return best
  }
}

const AI_DEPTH = 3

/** Pick the AI's best (cube, direction) move and return it. */
export function aiBestMove(s: State): Move | null {
  if (s.turn !== 'ai' || s.winner != null) return null
  const me = markOf('ai')
  const moves = movesForBoard(s.board, me)
  if (!moves.length) return null
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const nb = applyFor(s.board, m, me)
    const t = terminalFor(nb, me)
    let v: number
    if (t !== 0) v = t === me ? WIN + AI_DEPTH : -(WIN + AI_DEPTH)
    else v = search(nb, -me as Mark, me, AI_DEPTH - 1, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  return top[(Math.random() * top.length) | 0]
}

/** Apply the AI's chosen move (one action per turn). */
export function aiTurn(s: State): State {
  const m = aiBestMove(s)
  if (m == null) return s
  return applyMove(s, m)
}

// expose for tests / UI
export { LINES, completedLines, destOf, markOf, playerOf, other }
