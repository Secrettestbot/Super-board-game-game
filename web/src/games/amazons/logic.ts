/* GAME OF THE AMAZONS — logic (built for this codebase, not ported).
   10x10. Each side has 4 amazons (chess queens). A TURN is two parts:
   (1) MOVE one amazon any number of empty squares in a straight line (queen move), then
   (2) from its NEW square, SHOOT a burning ARROW along another queen move; the landing
   square is BURNED forever. Neither a move nor an arrow may cross an amazon, a burned
   square, or the board edge. A player who cannot move any amazon LOSES.

   You are White and move first; the AI is Black and uses a minimax over the standard
   Amazons MOBILITY heuristic (your legal queen-moves minus the opponent's). */

export const N = 10
export type Side = 'w' | 'b'
export type Cell = Side | 'x' | null   // 'x' = burned (arrow) square
export interface LogEntry { t: string; x: string }

export interface AmazonsState {
  board: Cell[]                 // length 100, index = r*10 + c
  turn: Side | null
  you: Side
  winner: Side | null
  lastMoveFrom: number | null   // last completed turn: amazon origin
  lastMoveTo: number | null     // last completed turn: amazon destination
  lastShot: number | null       // last completed turn: burned square
  log: LogEntry[]
}

const other = (s: Side): Side => (s === 'w' ? 'b' : 'w')
export const idx = (r: number, c: number) => r * N + c
export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]

// Algebraic-ish label: column a-j, row 1-10 (row 0 at top = rank 10).
function sq(i: number): string {
  const [r, c] = rc(i)
  return 'abcdefghij'[c] + String(N - r)
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): AmazonsState {
  const board: Cell[] = new Array(N * N).fill(null)
  // Standard opening — White (you): d1,g1,a4,j4 ; Black (AI): a7,j7,d10,g10.
  // row 0 = rank 10 (top), row 9 = rank 1 (bottom).
  board[idx(9, 3)] = 'w'; board[idx(9, 6)] = 'w'; board[idx(6, 0)] = 'w'; board[idx(6, 9)] = 'w'
  board[idx(3, 0)] = 'b'; board[idx(3, 9)] = 'b'; board[idx(0, 3)] = 'b'; board[idx(0, 6)] = 'b'
  return {
    board, turn: 'w', you: 'w', winner: null,
    lastMoveFrom: null, lastMoveTo: null, lastShot: null,
    log: [{ t: 'sys', x: 'You are White and move first. Glide a queen, then shoot a burning arrow to scorch a square.' }],
  }
}

// All empty squares reachable from `from` by a single queen move (board must already
// have `from` cleared if the moving amazon left it — caller handles that for arrows).
export function queenMoves(board: Cell[], from: number): number[] {
  const [r0, c0] = rc(from)
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr, c = c0 + dc
    while (r >= 0 && r < N && c >= 0 && c < N && board[idx(r, c)] === null) {
      out.push(idx(r, c)); r += dr; c += dc
    }
  }
  return out
}

export function amazonsOf(board: Cell[], side: Side): number[] {
  const out: number[] = []
  for (let i = 0; i < N * N; i++) if (board[i] === side) out.push(i)
  return out
}

// Total number of legal queen-moves available to `side` (mobility). Doubles as a
// has-any-move test when you only need >0.
export function mobility(board: Cell[], side: Side): number {
  let total = 0
  for (const a of amazonsOf(board, side)) total += queenMoves(board, a).length
  return total
}

export function hasMove(board: Cell[], side: Side): boolean {
  for (const a of amazonsOf(board, side)) {
    const [r0, c0] = rc(a)
    for (const [dr, dc] of DIRS) {
      const r = r0 + dr, c = c0 + dc
      if (r >= 0 && r < N && c >= 0 && c < N && board[idx(r, c)] === null) return true
    }
  }
  return false
}

// A full move = (from -> to -> shoot). Returns the resulting board (no state bookkeeping).
export function applyTurn(board: Cell[], from: number, to: number, shoot: number): Cell[] {
  const nb = board.slice()
  const side = nb[from]
  nb[from] = null
  nb[to] = side
  nb[shoot] = 'x'
  return nb
}

// Arrow targets from `to`, given the amazon already moved off `from`.
export function arrowTargets(board: Cell[], from: number, to: number): number[] {
  const tmp = board.slice()
  const side = tmp[from]
  tmp[from] = null
  tmp[to] = side
  return queenMoves(tmp, to)
}

function finish(s: AmazonsState, board: Cell[], log: LogEntry[], extra: Partial<AmazonsState>): AmazonsState {
  // The side that just got the turn handed to them has no move -> they lose;
  // the player who made the last move wins. Caller passes winner via extra.
  return Object.assign({}, s, { board, turn: null, log }, extra)
}

// Commit a full human/AI turn. Validates move + shot are legal queen moves.
export function playTurn(s: AmazonsState, from: number, to: number, shoot: number, side: Side): AmazonsState {
  if (s.winner || s.turn !== side) return s
  if (s.board[from] !== side) return s
  if (!queenMoves(s.board, from).includes(to)) return s
  if (!arrowTargets(s.board, from, to).includes(shoot)) return s

  const board = applyTurn(s.board, from, to, shoot)
  const mover = side === s.you ? 'You' : 'Rival'
  let log = push(s.log, side === s.you ? 'you' : 'ai',
    `${mover}: ${sq(from)}→${sq(to)}, arrow to ${sq(shoot)}.`)
  const opp = other(side)

  if (!hasMove(board, opp)) {
    const youWon = side === s.you
    log = push(log, youWon ? 'you' : 'ai',
      `${opp === s.you ? 'You are' : 'Rival is'} frozen — no amazon can move.`)
    return finish(s, board, log, {
      winner: side, lastMoveFrom: from, lastMoveTo: to, lastShot: shoot,
    })
  }
  return Object.assign({}, s, {
    board, turn: opp, lastMoveFrom: from, lastMoveTo: to, lastShot: shoot, log,
  })
}

// ===== AI: minimax over the mobility heuristic =====
// Mobility dominates Amazons; evaluate as (my queen-moves) - (opp queen-moves).
function evalBoard(board: Cell[], me: Side): number {
  return mobility(board, me) - mobility(board, other(me))
}

interface Turn { from: number; to: number; shoot: number }

function allTurns(board: Cell[], side: Side): Turn[] {
  const turns: Turn[] = []
  for (const from of amazonsOf(board, side)) {
    for (const to of queenMoves(board, from)) {
      for (const shoot of arrowTargets(board, from, to)) {
        turns.push({ from, to, shoot })
      }
    }
  }
  return turns
}

function search(board: Cell[], toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  if (!hasMove(board, toMove)) {
    // toMove is frozen and loses. Terminal: huge value in favor of the other side.
    return toMove === me ? -1e6 : 1e6
  }
  if (depth === 0) return evalBoard(board, me)
  const turns = allTurns(board, toMove)
  if (toMove === me) {
    let best = -Infinity
    for (const t of turns) {
      const v = search(applyTurn(board, t.from, t.to, t.shoot), other(toMove), me, depth - 1, alpha, beta)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const t of turns) {
      const v = search(applyTurn(board, t.from, t.to, t.shoot), other(toMove), me, depth - 1, alpha, beta)
      if (v < best) best = v
      if (best < beta) beta = best
      if (alpha >= beta) break
    }
    return best
  }
}

// Pick a turn for `side` using depth-1 lookahead (a full ply of move+shot is already
// a deep evaluation given the branching). Greedy on mobility at the leaf.
export function bestTurn(board: Cell[], side: Side, depth = 1): Turn | null {
  const turns = allTurns(board, side)
  if (!turns.length) return null
  let best = -Infinity
  const top: Turn[] = []
  for (const t of turns) {
    const v = search(applyTurn(board, t.from, t.to, t.shoot), other(side), side, depth - 1, -Infinity, Infinity)
    if (v > best + 1e-9) { best = v; top.length = 0; top.push(t) }
    else if (v >= best - 1e-9) top.push(t)
  }
  return top[(Math.random() * top.length) | 0]
}

export function aiMove(s: AmazonsState): AmazonsState {
  if (s.winner || s.turn !== 'b') return s
  const t = bestTurn(s.board, 'b', 1)
  if (!t) return s
  return playTurn(s, t.from, t.to, t.shoot, 'b')
}

// Helper for tests / random play: a uniformly random legal full turn for `side`.
export function randomTurn(board: Cell[], side: Side): Turn | null {
  const froms = amazonsOf(board, side).filter(f => queenMoves(board, f).length > 0)
  if (!froms.length) return null
  const from = froms[(Math.random() * froms.length) | 0]
  const tos = queenMoves(board, from)
  const to = tos[(Math.random() * tos.length) | 0]
  const shots = arrowTargets(board, from, to)
  const shoot = shots[(Math.random() * shots.length) | 0]
  return { from, to, shoot }
}
