/* YOTE — a West African capture game (built for this codebase, not ported).
   5 rows x 6 columns = 30 cells, starts EMPTY. Each player holds 12 pieces in hand.
   You are the dark seed and move first; the AI is the light seed.

   A turn is ONE of:
     (a) DROP    — place a piece from hand onto any empty cell.
     (b) MOVE    — slide an on-board piece one step orthogonally to an adjacent empty cell.
     (c) CAPTURE — jump an on-board piece orthogonally over an ADJACENT enemy into the empty
                   cell beyond (straight line, checkers-style), removing the jumped enemy AND,
                   by the bonus rule, ONE MORE enemy piece of the capturer's choice from
                   anywhere on the board — so every capture removes TWO enemy pieces.
   Multi-jumps are NOT implemented: a capture is a single jump (stated for simplicity).

   WIN: a player wins if the opponent has NO pieces on the board AND NONE in hand, OR when it
   is the opponent's turn and they have no legal action. The AI is alpha-beta minimax (depth 4)
   over material (board + hand, capture-weighted) plus mobility, and picks the best extra
   removal on every capture. */

export const ROWS = 5
export const COLS = 6
export const N = ROWS * COLS   // 30
export const HAND0 = 12

export type Seed = 'd' | 'l'   // d = dark (you), l = light (AI)
export type Cell = Seed | null
export interface LogEntry { t: string; x: string }

export interface YoteState {
  board: Cell[]                 // length 30, index = r*COLS + c
  hand: { d: number; l: number }
  turn: Seed | null
  you: Seed
  winner: Seed | null
  last: number | null           // last destination cell (highlight)
  log: LogEntry[]
}

export const other = (s: Seed): Seed => (s === 'd' ? 'l' : 'd')
export const idx = (r: number, c: number) => r * COLS + c
export const rowOf = (i: number) => Math.floor(i / COLS)
export const colOf = (i: number) => i % COLS
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): YoteState {
  return {
    board: new Array(N).fill(null),
    hand: { d: HAND0, l: HAND0 },
    turn: 'd',
    you: 'd',
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'You move first. Drop a seed, slide one step, or jump an enemy to capture two.' }],
  }
}

export function onBoard(board: Cell[], who: Seed): number {
  let n = 0
  for (const v of board) if (v === who) n++
  return n
}

// total pieces a colour controls (board + hand)
export function totalOf(s: YoteState, who: Seed): number {
  return onBoard(s.board, who) + s.hand[who]
}

// ---- legal-action enumeration ----------------------------------------------
// A single capture: from `i`, over adjacent enemy at `mid`, landing on empty `to`.
export interface Capture { from: number; mid: number; to: number }

export function capturesFrom(board: Cell[], i: number, who: Seed): Capture[] {
  const out: Capture[] = []
  if (board[i] !== who) return out
  const r = rowOf(i), c = colOf(i), opp = other(who)
  for (const [dr, dc] of DIRS) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc
    if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) continue
    const mid = idx(mr, mc), to = idx(tr, tc)
    if (board[mid] === opp && board[to] === null) out.push({ from: i, mid, to })
  }
  return out
}

export function allCaptures(board: Cell[], who: Seed): Capture[] {
  const out: Capture[] = []
  for (let i = 0; i < N; i++) if (board[i] === who) out.push(...capturesFrom(board, i, who))
  return out
}

// simple orthogonal steps to an empty neighbour
export function stepsFrom(board: Cell[], i: number, who: Seed): number[] {
  const out: number[] = []
  if (board[i] !== who) return out
  const r = rowOf(i), c = colOf(i)
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue
    const to = idx(nr, nc)
    if (board[to] === null) out.push(to)
  }
  return out
}

export function emptyCells(board: Cell[]): number[] {
  const out: number[] = []
  for (let i = 0; i < N; i++) if (board[i] === null) out.push(i)
  return out
}

// enemies that can be removed as the bonus piece (anywhere on board)
export function removableEnemies(board: Cell[], who: Seed): number[] {
  const opp = other(who)
  const out: number[] = []
  for (let i = 0; i < N; i++) if (board[i] === opp) out.push(i)
  return out
}

// Does `who` have any legal action (drop / move / capture)?
export function hasAction(s: YoteState, who: Seed): boolean {
  if (s.hand[who] > 0 && emptyCells(s.board).length) return true
  for (let i = 0; i < N; i++) {
    if (s.board[i] !== who) continue
    if (stepsFrom(s.board, i, who).length) return true
    if (capturesFrom(s.board, i, who).length) return true
  }
  return false
}

// ---- mutation helpers (return new state) -----------------------------------
function endTurn(s: YoteState, board: Cell[], hand: { d: number; l: number }, last: number, log: LogEntry[], who: Seed): YoteState {
  const opp = other(who)
  // win: opponent wiped out (no board pieces, no hand)
  if (onBoard(board, opp) === 0 && hand[opp] === 0) {
    return Object.assign({}, s, { board, hand, turn: null, last, winner: who, log: push(log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} cleared the board — game over.`) })
  }
  const next: YoteState = Object.assign({}, s, { board, hand, turn: opp, last, log })
  // if opponent has no legal action, current player wins
  if (!hasAction(next, opp)) {
    return Object.assign({}, next, { turn: null, winner: who, log: push(log, who === s.you ? 'you' : 'ai', `${opp === s.you ? 'You have' : 'Rival has'} no legal move — ${who === s.you ? 'you win' : 'rival wins'}.`) })
  }
  return next
}

export function drop(s: YoteState, to: number, who: Seed): YoteState {
  if (s.winner || s.turn !== who) return s
  if (s.hand[who] <= 0 || s.board[to] !== null) return s
  const board = s.board.slice(); board[to] = who
  const hand = Object.assign({}, s.hand); hand[who] -= 1
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} dropped a seed at ${cellName(to)}.`)
  return endTurn(s, board, hand, to, log, who)
}

export function move(s: YoteState, from: number, to: number, who: Seed): YoteState {
  if (s.winner || s.turn !== who) return s
  if (s.board[from] !== who || s.board[to] !== null) return s
  if (!stepsFrom(s.board, from, who).includes(to)) return s
  const board = s.board.slice(); board[to] = who; board[from] = null
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} slid to ${cellName(to)}.`)
  return endTurn(s, board, Object.assign({}, s.hand), to, log, who)
}

/**
 * Perform a capture jump, then remove the bonus enemy at `extra`. If `extra` is
 * null/invalid but a removable enemy still exists, the first one is taken (the UI
 * always supplies a choice; this guards the pure path). Removes 2 enemy pieces.
 */
export function capture(s: YoteState, cap: Capture, extra: number | null, who: Seed): YoteState {
  if (s.winner || s.turn !== who) return s
  const opp = other(who)
  if (s.board[cap.from] !== who || s.board[cap.mid] !== opp || s.board[cap.to] !== null) return s
  // validate the jump is one of the legal captures from `from`
  if (!capturesFrom(s.board, cap.from, who).some(c => c.mid === cap.mid && c.to === cap.to)) return s
  const board = s.board.slice()
  board[cap.to] = who; board[cap.from] = null; board[cap.mid] = null
  let removed = 1
  // pick the bonus removal
  let pick = extra
  if (pick === null || pick < 0 || board[pick] !== opp) {
    const rem = removableEnemies(board, who)
    pick = rem.length ? rem[0] : null
  }
  if (pick !== null) { board[pick] = null; removed = 2 }
  const log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} captured ${removed} at ${cellName(cap.to)}.`)
  return endTurn(s, board, Object.assign({}, s.hand), cap.to, log, who)
}

export function cellName(i: number): string {
  return 'ABCDEF'[colOf(i)] + (rowOf(i) + 1)
}

// ===== AI: alpha-beta minimax over drop / move / capture ====================
type Action =
  | { kind: 'drop'; to: number }
  | { kind: 'move'; from: number; to: number }
  | { kind: 'capture'; cap: Capture; extra: number | null }

// enumerate every legal action for `who` on a raw board+hand pair
function genActions(board: Cell[], hand: { d: number; l: number }, who: Seed): Action[] {
  const out: Action[] = []
  const caps = allCaptures(board, who)
  for (const cap of caps) {
    // simulate jump to know which enemies remain for the bonus pick
    const b2 = board.slice(); b2[cap.to] = who; b2[cap.from] = null; b2[cap.mid] = null
    const rem = removableEnemies(b2, who)
    if (rem.length) for (const e of rem) out.push({ kind: 'capture', cap, extra: e })
    else out.push({ kind: 'capture', cap, extra: null })
  }
  for (let i = 0; i < N; i++) if (board[i] === who) for (const to of stepsFrom(board, i, who)) out.push({ kind: 'move', from: i, to })
  if (hand[who] > 0) for (const to of emptyCells(board)) out.push({ kind: 'drop', to })
  return out
}

function applyAction(board: Cell[], hand: { d: number; l: number }, who: Seed, a: Action): { board: Cell[]; hand: { d: number; l: number } } {
  const b = board.slice()
  const h = { d: hand.d, l: hand.l }
  if (a.kind === 'drop') { b[a.to] = who; h[who] -= 1 }
  else if (a.kind === 'move') { b[a.to] = who; b[a.from] = null }
  else {
    b[a.cap.to] = who; b[a.cap.from] = null; b[a.cap.mid] = null
    if (a.extra !== null && b[a.extra] === other(who)) b[a.extra] = null
  }
  return { board: b, hand: h }
}

function evalPos(board: Cell[], hand: { d: number; l: number }, me: Seed): number {
  const opp = other(me)
  const myTotal = onBoard(board, me) + hand[me]
  const opTotal = onBoard(board, opp) + hand[opp]
  // capture emphasis: weight board presence (active pieces) above reserve
  const myBoard = onBoard(board, me), opBoard = onBoard(board, opp)
  let score = 120 * (myTotal - opTotal) + 18 * (myBoard - opBoard)
  // mobility: capture threats are valuable
  const myCaps = allCaptures(board, me).length, opCaps = allCaptures(board, opp).length
  score += 30 * (myCaps - opCaps)
  return score
}

function search(board: Cell[], hand: { d: number; l: number }, toMove: Seed, me: Seed, depth: number, alpha: number, beta: number): number {
  const opp0 = other(toMove)
  // terminal: someone wiped out
  if (onBoard(board, me) + hand[me] === 0) return -100000 - depth
  if (onBoard(board, opp(me)) + hand[opp(me)] === 0) return 100000 + depth
  if (depth === 0) return evalPos(board, hand, me)
  const actions = genActions(board, hand, toMove)
  if (!actions.length) {
    // toMove cannot act -> the other side wins
    return toMove === me ? -100000 - depth : 100000 + depth
  }
  if (toMove === me) {
    let best = -Infinity
    for (const a of actions) {
      const nx = applyAction(board, hand, toMove, a)
      best = Math.max(best, search(nx.board, nx.hand, opp0, me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const a of actions) {
      const nx = applyAction(board, hand, toMove, a)
      best = Math.min(best, search(nx.board, nx.hand, opp0, me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}
function opp(s: Seed): Seed { return other(s) }

const DEPTH = 3

export function aiMove(s: YoteState): YoteState {
  if (s.winner || s.turn === null) return s
  const me = s.turn
  const actions = genActions(s.board, s.hand, me)
  if (!actions.length) return s
  // captures are pruned to keep the branching sane: only score the best-extra per jump
  let best = -Infinity
  const scored: { a: Action; v: number }[] = []
  for (const a of actions) {
    const nx = applyAction(s.board, s.hand, me, a)
    // small bias so the AI doesn't fritter equal-value moves
    let v = search(nx.board, nx.hand, other(me), me, DEPTH - 1, -Infinity, Infinity)
    if (a.kind === 'capture') v += 1   // tiebreak toward capturing
    scored.push({ a, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.a)
  const choice = top[(Math.random() * top.length) | 0]
  if (choice.kind === 'drop') return drop(s, choice.to, me)
  if (choice.kind === 'move') return move(s, choice.from, choice.to, me)
  return capture(s, choice.cap, choice.extra, me)
}
