/* KAMISADO — logic (built for this codebase, not ported).
   8x8 board where every cell is one of 8 colours, in the fixed Kamisado layout.
   Each player owns 8 towers (one per colour), starting on their home row, each on
   its own colour cell. Towers move straight FORWARD (toward the opponent) or
   diagonally forward, any number of empty cells, never sideways/backward, never
   jumping. THE COLOUR RULE: the colour of the cell a tower LANDS on dictates which
   tower the opponent must move next. First move is free. A blocked dictated tower
   passes the colour back to the opponent. Reach the opponent's far row to win. */

export const N = 8

// Player 'you' moves UP the board (from row 7 toward row 0).
// Player 'ai' moves DOWN the board (from row 0 toward row 7).
export type Player = 'you' | 'ai'

export interface Tower { owner: Player; color: number }
export interface LogEntry { t: string; x: string }

export interface KState {
  // board[r*8+c] = Tower or null. Cell COLOUR is read from LAYOUT, not the board.
  board: (Tower | null)[]
  turn: Player | null
  you: Player           // always 'you'
  required: number | null   // colour the player-to-move must move; null = free move
  winner: Player | 'draw' | null
  last: { from: number; to: number } | null
  log: LogEntry[]
}

export const idx = (r: number, c: number) => r * N + c
const other = (p: Player): Player => (p === 'you' ? 'ai' : 'you')

// Standard Kamisado colour layout — 8x8 indices 0-7, symmetric by 180° rotation.
// Colours: 0 orange, 1 blue, 2 purple, 3 pink, 4 yellow, 5 red, 6 green, 7 brown.
export const LAYOUT: number[] = [
  0, 1, 2, 3, 4, 5, 6, 7,
  5, 0, 3, 6, 1, 4, 7, 2,
  6, 3, 0, 5, 2, 7, 4, 1,
  3, 2, 1, 0, 7, 6, 5, 4,
  4, 5, 6, 7, 0, 1, 2, 3,
  1, 4, 7, 2, 5, 0, 3, 6,
  2, 7, 4, 1, 6, 3, 0, 5,
  7, 6, 5, 4, 3, 2, 1, 0,
]

export const COLOR_NAMES = ['Orange', 'Blue', 'Purple', 'Pink', 'Yellow', 'Red', 'Green', 'Brown']

export const cellColor = (i: number) => LAYOUT[i]

// Forward direction in rows for a player (you go up = -1, ai goes down = +1).
const forward = (p: Player) => (p === 'you' ? -1 : 1)
// The opponent's home row (the goal) for a player.
export const goalRow = (p: Player) => (p === 'you' ? 0 : N - 1)
export const homeRow = (p: Player) => (p === 'you' ? N - 1 : 0)

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): KState {
  const board: (Tower | null)[] = new Array(N * N).fill(null)
  // AI on row 0, you on row 7; each tower on the cell of its own colour.
  for (let c = 0; c < N; c++) {
    board[idx(0, c)] = { owner: 'ai', color: LAYOUT[idx(0, c)] }
    board[idx(N - 1, c)] = { owner: 'you', color: LAYOUT[idx(N - 1, c)] }
  }
  return {
    board, turn: 'you', you: 'you', required: null, winner: null, last: null,
    log: [{ t: 'sys', x: 'You move first — any tower. The colour you land on tells the rival which tower to move.' }],
  }
}

// Find the board index of a player's tower of a given colour (each player has exactly one).
export function findTower(board: (Tower | null)[], owner: Player, color: number): number {
  for (let i = 0; i < N * N; i++) {
    const t = board[i]
    if (t && t.owner === owner && t.color === color) return i
  }
  return -1
}

// Legal destination indices for the tower at `from` (forward straight + both forward diagonals).
export function movesFor(board: (Tower | null)[], from: number): number[] {
  const t = board[from]
  if (!t) return []
  const r0 = Math.floor(from / N), c0 = from % N
  const fdr = forward(t.owner)
  const out: number[] = []
  // three directions: straight forward, diagonal forward-left, diagonal forward-right
  const dirs = [[fdr, 0], [fdr, -1], [fdr, 1]]
  for (const [dr, dc] of dirs) {
    let r = r0 + dr, c = c0 + dc
    while (r >= 0 && r < N && c >= 0 && c < N && board[idx(r, c)] === null) {
      out.push(idx(r, c))
      r += dr; c += dc
    }
  }
  return out
}

// All legal moves for `who` given the required colour (null = any tower).
export interface Move { from: number; to: number; color: number }
export function legalMoves(s: KState, who: Player): Move[] {
  const out: Move[] = []
  if (s.required == null) {
    for (let i = 0; i < N * N; i++) {
      const t = s.board[i]
      if (t && t.owner === who) for (const to of movesFor(s.board, i)) out.push({ from: i, to, color: t.color })
    }
  } else {
    const from = findTower(s.board, who, s.required)
    if (from >= 0) for (const to of movesFor(s.board, from)) out.push({ from, to, color: s.required })
  }
  return out
}

const coord = (i: number) => `${'ABCDEFGH'[i % N]}${N - Math.floor(i / N)}`

// Apply a single move (from -> to) for `who`. Caller guarantees legality.
export function move(s: KState, from: number, to: number): KState {
  if (s.winner || s.turn == null) return s
  const who = s.turn
  const t = s.board[from]
  if (!t || t.owner !== who) return s
  if (!movesFor(s.board, from).includes(to)) return s
  if (s.required != null && t.color !== s.required) return s

  const board = s.board.slice()
  board[from] = null
  board[to] = t
  const landColor = cellColor(to)
  const who2 = who === s.you ? 'You' : 'Rival'
  let log = push(s.log, who === s.you ? 'you' : 'ai',
    `${who2} moved ${COLOR_NAMES[t.color]} to ${coord(to)} (on ${COLOR_NAMES[landColor]}).`)

  // Win: reached the opponent's home row.
  if (Math.floor(to / N) === goalRow(who)) {
    const won = who === s.you
    log = push(log, who === s.you ? 'you' : 'ai', `${won ? 'You reach' : 'Rival reaches'} the far row — Kamisado!`)
    return Object.assign({}, s, { board, turn: null, required: null, winner: who, last: { from, to }, log })
  }

  const opp = other(who)
  // Required colour for the opponent = colour of the landed cell.
  let req: number = landColor
  let toMove: Player = opp

  // Resolve passes: if the player to move has no legal move for the required colour,
  // they pass and the SAME required colour passes back to the other player.
  let guard = 0
  while (guard++ < 4) {
    const cand = legalMovesRaw(board, toMove, req)
    if (cand.length) break
    // toMove is blocked on this colour -> pass back.
    log = push(log, 'sys',
      `${toMove === s.you ? 'Your' : "Rival's"} ${COLOR_NAMES[req]} tower is blocked — pass.`)
    const next = other(toMove)
    if (!legalMovesRaw(board, next, req).length) {
      // Both blocked on this colour: deadlock. The player who caused the block loses;
      // since `who` made the move that dictated this colour, `who` is responsible -> opp wins.
      log = push(log, 'sys', `Both ${COLOR_NAMES[req]} towers are stuck — deadlock.`)
      const loser = who
      const winner = other(loser)
      log = push(log, winner === s.you ? 'you' : 'ai',
        `${winner === s.you ? 'You win' : 'Rival wins'} the deadlock.`)
      return Object.assign({}, s, { board, turn: null, required: null, winner, last: { from, to }, log })
    }
    toMove = next
  }

  return Object.assign({}, s, { board, turn: toMove, required: req, winner: null, last: { from, to }, log })
}

// Pure legal-move count helper that doesn't depend on KState (for pass resolution).
function legalMovesRaw(board: (Tower | null)[], who: Player, required: number): Move[] {
  const from = findTower(board, who, required)
  if (from < 0) return []
  return movesFor(board, from).map(to => ({ from, to, color: required }))
}

// ===== AI: minimax with alpha-beta. Branching is tiny (one tower / few cells). =====

// Distance of a tower toward its goal row (0 = at the goal). Lower is better.
function distToGoal(owner: Player, i: number) {
  const r = Math.floor(i / N)
  return owner === 'you' ? r : N - 1 - r
}

function evalBoard(board: (Tower | null)[], me: Player): number {
  const opp = other(me)
  let score = 0
  let myBest = N, opBest = N
  for (let i = 0; i < N * N; i++) {
    const t = board[i]
    if (!t) continue
    const d = distToGoal(t.owner, i)
    // Advancement: closer to goal = more value. (N - d) rewards progress.
    const adv = (N - 1 - d)
    if (t.owner === me) { score += adv; myBest = Math.min(myBest, d) }
    else { score -= adv; opBest = Math.min(opBest, d) }
  }
  // Reward having a tower nearer the goal than the opponent's nearest.
  score += (opBest - myBest) * 2
  return score
}

const WIN = 100000

// Generate moves for a state-like {board,turn,required}. Returns null on terminal pass deadlock.
interface Node { board: (Tower | null)[]; turn: Player; required: number | null }

function genMoves(n: Node): Move[] {
  if (n.required == null) {
    const out: Move[] = []
    for (let i = 0; i < N * N; i++) {
      const t = n.board[i]
      if (t && t.owner === n.turn) for (const to of movesFor(n.board, i)) out.push({ from: i, to, color: t.color })
    }
    return out
  }
  return legalMovesRaw(n.board, n.turn, n.required)
}

// Apply a move at the search level, returning the next Node and a possible terminal winner.
function applyNode(n: Node, m: Move, me: Player): { next: Node | null; terminal: number | null } {
  const board = n.board.slice()
  const t = board[m.from]!
  board[m.from] = null
  board[m.to] = t
  if (Math.floor(m.to / N) === goalRow(n.turn)) {
    return { next: null, terminal: n.turn === me ? WIN : -WIN }
  }
  let req = cellColor(m.to)
  let toMove = other(n.turn)
  let guard = 0
  while (guard++ < 4) {
    if (legalMovesRaw(board, toMove, req).length) break
    const nxt = other(toMove)
    if (!legalMovesRaw(board, nxt, req).length) {
      // deadlock: the mover (n.turn) is responsible -> loses.
      const winner = other(n.turn)
      return { next: null, terminal: winner === me ? WIN : -WIN }
    }
    toMove = nxt
  }
  return { next: { board, turn: toMove, required: req }, terminal: null }
}

function search(n: Node, me: Player, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return evalBoard(n.board, me)
  const moves = genMoves(n)
  if (!moves.length) return evalBoard(n.board, me) // shouldn't happen (passes resolved), but safe
  const maxing = n.turn === me
  let best = maxing ? -Infinity : Infinity
  for (const m of moves) {
    const { next, terminal } = applyNode(n, m, me)
    const v = terminal != null
      ? (terminal > 0 ? WIN - (6 - depth) : -WIN + (6 - depth)) // prefer faster wins / slower losses
      : search(next!, me, depth - 1, alpha, beta)
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best }
    else { if (v < best) best = v; if (best < beta) beta = best }
    if (alpha >= beta) break
  }
  return best
}

export function aiMove(s: KState): KState {
  if (s.winner || s.turn !== 'ai') return s
  const me: Player = 'ai'
  const moves = legalMoves(s, me)
  if (!moves.length) return s // pass resolution means this is rare; nothing to do
  const root: Node = { board: s.board, turn: 'ai', required: s.required }
  const depth = 5
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    // Always take an immediate winning move.
    if (Math.floor(m.to / N) === goalRow('ai')) { return move(s, m.from, m.to) }
    const { next, terminal } = applyNode(root, m, me)
    const v = terminal != null ? terminal
      : search(next!, me, depth - 1, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return move(s, choice.from, choice.to)
}
