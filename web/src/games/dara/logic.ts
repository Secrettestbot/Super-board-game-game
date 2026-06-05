/* DARA — logic (built for this codebase, not ported).
   A West African 3-in-a-row capture game on a 5-row × 6-column board (30 cells), starting empty.
   Each side has 12 stones. PHASE 1 (drop): players alternate placing their 12 stones one per turn
   on an empty cell, but a placement may NOT create a three-in-a-row, and no captures occur.
   PHASE 2 (move): players alternate sliding a stone one step orthogonally to an adjacent empty
   cell. When a move forms a NEW line of EXACTLY three of the mover's stones (a "dara"), the mover
   captures one opponent stone of their choice. Lines of four or more do not count. A player loses
   when reduced below 3 stones or left with no legal move. You are sand and move first; the AI is
   slate and uses depth-limited alpha-beta over the current phase's legal actions. */

export const ROWS = 5
export const COLS = 6
export const CELLS = ROWS * COLS   // 30
export const HAND = 12

export type Stone = 's' | 'a'      // 's' = you (sand), 'a' = AI (slate)
export type Cell = Stone | null
export type Phase = 'drop' | 'move'
export interface LogEntry { t: string; x: string }

export interface DaraState {
  board: Cell[]                    // length 30, index = r*COLS + c
  phase: Phase
  turn: Stone | null               // null when game over
  you: Stone
  hand: { s: number; a: number }   // stones still to drop (phase 1)
  pendingCapture: Stone | null     // when set, `turn` must remove one of this colour's stones
  winner: Stone | null
  last: number | null
  log: LogEntry[]
}

export const other = (d: Stone): Stone => (d === 's' ? 'a' : 's')
export const idx = (r: number, c: number) => r * COLS + c
export const rc = (i: number) => ({ r: Math.floor(i / COLS), c: i % COLS })

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

const cellName = (i: number) => `${'ABCDEF'[i % COLS]}${Math.floor(i / COLS) + 1}`

export function makeGame(): DaraState {
  return {
    board: new Array(CELLS).fill(null),
    phase: 'drop',
    turn: 's',
    you: 's',
    hand: { s: HAND, a: HAND },
    pendingCapture: null,
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'Drop phase — place your 12 stones, but never make three in a row yet.' }],
  }
}

export function counts(board: Cell[]): { s: number; a: number } {
  let s = 0, a = 0
  for (const v of board) { if (v === 's') s++; else if (v === 'a') a++ }
  return { s, a }
}

/* The orthogonal run length of `who`-stones through cell i, along one axis.
   `horiz` true measures the row run, false the column run. Counts cell i itself. */
function runLen(board: Cell[], i: number, who: Stone, horiz: boolean): number {
  const { r, c } = rc(i)
  let n = 1
  if (horiz) {
    for (let cc = c - 1; cc >= 0 && board[idx(r, cc)] === who; cc--) n++
    for (let cc = c + 1; cc < COLS && board[idx(r, cc)] === who; cc++) n++
  } else {
    for (let rr = r - 1; rr >= 0 && board[idx(rr, c)] === who; rr--) n++
    for (let rr = r + 1; rr < ROWS && board[idx(rr, c)] === who; rr++) n++
  }
  return n
}

/* Would placing `who` at empty cell i create any orthogonal run of >= 3 (illegal in drop)? */
export function makesThree(board: Cell[], i: number, who: Stone): boolean {
  return runLen(board, i, who, true) >= 3 || runLen(board, i, who, false) >= 3
}

/* After `who` lands a stone on cell i, did this move form a line of EXACTLY three?
   (Exactly 3 on either axis counts; a run of 4+ does NOT.) */
export function formsExactThree(board: Cell[], i: number, who: Stone): boolean {
  return runLen(board, i, who, true) === 3 || runLen(board, i, who, false) === 3
}

/* ---- legal-action enumeration ---- */

export function dropCells(board: Cell[], who: Stone): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) if (!board[i] && !makesThree(board, i, who)) out.push(i)
  return out
}

const ADJ: number[][] = (() => {
  const a: number[][] = []
  for (let i = 0; i < CELLS; i++) {
    const { r, c } = rc(i)
    const ns: number[] = []
    if (r > 0) ns.push(idx(r - 1, c))
    if (r < ROWS - 1) ns.push(idx(r + 1, c))
    if (c > 0) ns.push(idx(r, c - 1))
    if (c < COLS - 1) ns.push(idx(r, c + 1))
    a.push(ns)
  }
  return a
})()

export const neighbors = (i: number) => ADJ[i]

export interface Move { from: number; to: number }

export function moves(board: Cell[], who: Stone): Move[] {
  const out: Move[] = []
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== who) continue
    for (const j of ADJ[i]) if (!board[j]) out.push({ from: i, to: j })
  }
  return out
}

/* The opponent stones `who` may capture after forming a dara (any opponent stone). */
export function captureTargets(board: Cell[], who: Stone): number[] {
  const opp = other(who)
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) if (board[i] === opp) out.push(i)
  return out
}

/* ---- terminal check (phase 2 only) ---- */
function checkLoss(board: Cell[], toMove: Stone): boolean {
  const cnt = counts(board)
  if (cnt[toMove] < 3) return true            // can no longer form a three
  if (!moves(board, toMove).length) return true // no legal move
  return false
}

function finish(s: DaraState, winner: Stone, board: Cell[], log: LogEntry[], last: number | null): DaraState {
  const youWon = winner === s.you
  return Object.assign({}, s, {
    board, turn: null, phase: 'move' as Phase, pendingCapture: null, winner, last,
    log: push(log, youWon ? 'you' : 'ai', youWon ? 'You win — the rival can no longer make three.' : 'The rival wins — you can no longer make three.'),
  })
}

/* ---- player actions ---- */

// PHASE 1: drop a stone on empty cell i (rejects illegal / three-making placements).
export function drop(s: DaraState, i: number, who: Stone): DaraState {
  if (s.winner || s.phase !== 'drop' || s.turn !== who || s.pendingCapture) return s
  if (s.board[i] || makesThree(s.board, i, who)) return s
  const board = s.board.slice(); board[i] = who
  const hand = Object.assign({}, s.hand, { [who]: s.hand[who] - 1 })
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} dropped on ${cellName(i)}.`)
  const opp = other(who)
  // Drop phase ends when both hands are empty; then the first mover of phase 2 is `you`.
  if (hand.s === 0 && hand.a === 0) {
    log = push(log, 'sys', 'All stones placed — move phase. Slide to form exactly three and capture.')
    return Object.assign({}, s, { board, hand, phase: 'move' as Phase, turn: s.you, last: i, log })
  }
  return Object.assign({}, s, { board, hand, turn: opp, last: i, log })
}

// PHASE 2: slide a stone from->to (one orthogonal step onto an empty cell).
export function move(s: DaraState, from: number, to: number, who: Stone): DaraState {
  if (s.winner || s.phase !== 'move' || s.turn !== who || s.pendingCapture) return s
  if (s.board[from] !== who || s.board[to] || !ADJ[from].includes(to)) return s
  const board = s.board.slice(); board[from] = null; board[to] = who
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} moved ${cellName(from)}→${cellName(to)}.`)
  if (formsExactThree(board, to, who) && captureTargets(board, who).length) {
    log = push(log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} formed a dara — capture a stone.`)
    return Object.assign({}, s, { board, last: to, pendingCapture: other(who), turn: who, log })
  }
  // no capture — pass turn (check whether the opponent is now stuck/too few)
  const opp = other(who)
  if (checkLoss(board, opp)) return finish(Object.assign({}, s, {}), who, board, log, to)
  return Object.assign({}, s, { board, turn: opp, last: to, log })
}

// Resolve a pending capture: `who` removes opponent stone at cell i.
export function capture(s: DaraState, i: number, who: Stone): DaraState {
  if (s.winner || s.turn !== who || s.pendingCapture !== other(who)) return s
  if (s.board[i] !== other(who)) return s
  const board = s.board.slice(); board[i] = null
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} captured ${cellName(i)}.`)
  const opp = other(who)
  if (checkLoss(board, opp)) return finish(Object.assign({}, s, {}), who, board, log, i)
  return Object.assign({}, s, { board, turn: opp, pendingCapture: null, last: i, log })
}

/* ============================================================
   AI — alpha-beta (depth ~4) over the current phase's legal actions.
   Eval = material + potential threes (two-in-a-row with an open extension) + mobility.
   ============================================================ */

const AI: Stone = 'a'

// Count, for `who`, lines of exactly two same-colour stones that have an open
// empty cell extending the pair to a potential three (a "threat").
function potentialThrees(board: Cell[], who: Stone): number {
  let n = 0
  // horizontal windows of length 3
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c + 2 < COLS; c++) {
      const a = board[idx(r, c)], b = board[idx(r, c + 1)], d = board[idx(r, c + 2)]
      const mine = (a === who ? 1 : 0) + (b === who ? 1 : 0) + (d === who ? 1 : 0)
      const empty = (a === null ? 1 : 0) + (b === null ? 1 : 0) + (d === null ? 1 : 0)
      if (mine === 2 && empty === 1) n++
    }
  }
  // vertical windows of length 3
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r + 2 < ROWS; r++) {
      const a = board[idx(r, c)], b = board[idx(r + 1, c)], d = board[idx(r + 2, c)]
      const mine = (a === who ? 1 : 0) + (b === who ? 1 : 0) + (d === who ? 1 : 0)
      const empty = (a === null ? 1 : 0) + (b === null ? 1 : 0) + (d === null ? 1 : 0)
      if (mine === 2 && empty === 1) n++
    }
  }
  return n
}

function evalBoard(board: Cell[], me: Stone): number {
  const opp = other(me)
  const cnt = counts(board)
  const material = (cnt[me] - cnt[opp]) * 100
  const threat = (potentialThrees(board, me) - potentialThrees(board, opp)) * 6
  const mob = (moves(board, me).length - moves(board, opp).length) * 2
  return material + threat + mob
}

/* Apply a phase-2 move (and, if it forms a three, greedily capture the opponent's
   stone whose removal most reduces the opponent's threats) for search purposes. */
function applyMove(board: Cell[], m: Move, who: Stone): Cell[] {
  const nb = board.slice(); nb[m.from] = null; nb[m.to] = who
  if (formsExactThree(nb, m.to, who) && captureTargets(nb, who).length) {
    const opp = other(who)
    let bestI = -1, bestScore = Infinity
    for (let i = 0; i < CELLS; i++) {
      if (nb[i] !== opp) continue
      const t = nb.slice(); t[i] = null
      const sc = potentialThrees(t, opp)
      if (sc < bestScore) { bestScore = sc; bestI = i }
    }
    if (bestI >= 0) nb[bestI] = null
  }
  return nb
}

function applyDrop(board: Cell[], i: number, who: Stone): Cell[] {
  const nb = board.slice(); nb[i] = who; return nb
}

// Search restricted to a single phase (drop OR move). Within the drop phase we
// don't track exhausting hands precisely — the heuristic shaping is enough for the
// opening; depth keeps it bounded. In the move phase it models captures.
function search(board: Cell[], toMove: Stone, me: Stone, phase: Phase, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return evalBoard(board, me)
  if (phase === 'move') {
    const cnt = counts(board)
    if (cnt[toMove] < 3) return toMove === me ? -100000 : 100000
  }
  const acts = phase === 'drop' ? dropCells(board, toMove) : moves(board, toMove)
  if (!acts.length) {
    if (phase === 'move') return toMove === me ? -100000 : 100000
    return evalBoard(board, me)
  }
  const maximizing = toMove === me
  let best = maximizing ? -Infinity : Infinity
  for (const act of acts) {
    const nb = phase === 'drop'
      ? applyDrop(board, act as number, toMove)
      : applyMove(board, act as Move, toMove)
    const v = search(nb, other(toMove), me, phase, depth - 1, alpha, beta)
    if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, best) }
    else { best = Math.min(best, v); beta = Math.min(beta, best) }
    if (alpha >= beta) break
  }
  return best
}

/* aiMove drives the whole AI turn (drop, or move + any forced capture) in one call. */
export function aiMove(s: DaraState): DaraState {
  if (s.winner || s.turn !== AI) return s

  // Resolve a pending capture first (the move-then-capture is split across states).
  if (s.pendingCapture === other(AI)) {
    const opp = other(AI)
    let bestI = -1, bestScore = Infinity
    for (let i = 0; i < CELLS; i++) {
      if (s.board[i] !== opp) continue
      const t = s.board.slice(); t[i] = null
      const sc = potentialThrees(t, opp)
      if (sc < bestScore) { bestScore = sc; bestI = i }
    }
    if (bestI < 0) return s
    return capture(s, bestI, AI)
  }

  if (s.phase === 'drop') {
    const cells = dropCells(s.board, AI)
    if (!cells.length) return s
    let best = -Infinity
    const scored: { i: number; v: number }[] = []
    for (const i of cells) {
      const v = search(applyDrop(s.board, i, AI), other(AI), AI, 'drop', 3, -Infinity, Infinity)
      scored.push({ i, v }); if (v > best) best = v
    }
    const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.i)
    return drop(s, top[(Math.random() * top.length) | 0], AI)
  }

  // move phase
  const ms = moves(s.board, AI)
  if (!ms.length) return s
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of ms) {
    const v = search(applyMove(s.board, m, AI), other(AI), AI, 'move', 4, -Infinity, Infinity)
    scored.push({ m, v }); if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const pick = top[(Math.random() * top.length) | 0]
  return move(s, pick.from, pick.to, AI)
}
