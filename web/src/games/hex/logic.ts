/* HEX — the connection game (logic, built for this codebase).
   11x11 rhombus of hexagons. You are amber and own the TOP and BOTTOM edges; you win by
   linking top to bottom with an unbroken chain of your stones. The AI is slate and owns the
   LEFT and RIGHT edges, winning by linking left to right. Players alternate placing one stone
   on any empty cell; you go first. Hex can never draw — exactly one player connects.

   Hex adjacency for cell (r,c): (r,c-1),(r,c+1),(r-1,c),(r-1,c+1),(r+1,c-1),(r+1,c) — six
   neighbours, clamped to the board. The AI uses a shortest-connection-distance heuristic:
   a 0-1 BFS where stepping onto its own stone costs 0, an empty cell costs 1, and an enemy
   stone is blocked, measuring the minimum extra cells to complete an edge-to-edge link. */

export const N = 11
export type Stone = 'y' | 's'        // y = You (amber, top/bottom) · s = aI/Slate (left/right)
export type Cell = Stone | null
export interface LogEntry { t: string; x: string }

export interface HexState {
  board: Cell[]                       // length N*N, index = r*N + c
  turn: Stone | null
  you: Stone
  winner: Stone | null               // Hex never draws
  last: number | null
  win: number[]                      // the connecting chain (highlighted on a win)
  log: LogEntry[]
}

const other = (d: Stone): Stone => (d === 'y' ? 's' : 'y')
export const idx = (r: number, c: number) => r * N + c
const NEI = [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, -1], [1, 0]]

function neighbors(i: number): number[] {
  const r = Math.floor(i / N), c = i % N
  const out: number[] = []
  for (const [dr, dc] of NEI) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(idx(nr, nc))
  }
  return out
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): HexState {
  return {
    board: new Array(N * N).fill(null),
    turn: 'y', you: 'y', winner: null, last: null, win: [],
    log: [{ t: 'sys', x: 'You are Amber — link the TOP and BOTTOM edges. The rival (Slate) links LEFT and RIGHT.' }],
  }
}

// Cells on the "first" edge for a colour: You = top row, AI = left column.
function startEdge(who: Stone): number[] {
  const out: number[] = []
  if (who === 'y') { for (let c = 0; c < N; c++) out.push(idx(0, c)) }
  else { for (let r = 0; r < N; r++) out.push(idx(r, 0)) }
  return out
}
// True if cell i lies on the colour's "second" (goal) edge: You = bottom row, AI = right column.
function onGoalEdge(who: Stone, i: number): boolean {
  const r = Math.floor(i / N), c = i % N
  return who === 'y' ? r === N - 1 : c === N - 1
}

/* Win detection: BFS over same-colour neighbours from the start edge; if it reaches the goal
   edge the colour has connected. Returns the connecting chain (one path) or null. */
export function findWin(board: Cell[], who: Stone): number[] | null {
  const seen = new Array(N * N).fill(false)
  const prev = new Array<number>(N * N).fill(-1)
  const q: number[] = []
  for (const i of startEdge(who)) if (board[i] === who) { seen[i] = true; q.push(i) }
  let head = 0, goal = -1
  while (head < q.length) {
    const i = q[head++]
    if (onGoalEdge(who, i)) { goal = i; break }
    for (const j of neighbors(i)) if (!seen[j] && board[j] === who) { seen[j] = true; prev[j] = i; q.push(j) }
  }
  if (goal < 0) return null
  const path: number[] = []
  for (let i = goal; i >= 0; i = prev[i]) path.push(i)
  return path
}

export function place(s: HexState, i: number, who: Stone): HexState {
  if (s.winner || s.turn !== who || s.board[i]) return s
  const board = s.board.slice(); board[i] = who
  const r = Math.floor(i / N), c = i % N
  const coord = `${'ABCDEFGHIJK'[c]}${r + 1}`
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} placed at ${coord}.`)
  const chain = findWin(board, who)
  if (chain) {
    const youWon = who === s.you
    log = push(log, youWon ? 'you' : 'ai', `${youWon ? 'You link your edges — you win!' : 'Rival links its edges — rival wins.'}`)
    return Object.assign({}, s, { board, turn: null, winner: who, last: i, win: chain, log })
  }
  return Object.assign({}, s, { board, turn: other(who), last: i, win: [], log })
}

/* ===== AI: shortest-connection-distance heuristic =====
   0-1 BFS (deque) over the hex graph for `who`: stepping onto one of `who`'s own stones costs 0,
   onto an empty cell costs 1, onto the opponent's stone is blocked. Distance = minimum extra
   empty cells needed to complete the edge-to-edge connection. A connected colour scores 0. */
function connectionDistance(board: Cell[], who: Stone): number {
  const opp = other(who)
  const dist = new Array(N * N).fill(Infinity)
  // double-ended queue via two stacks would be heavier than needed; use array + index with 0/1 inserts.
  const deque: number[] = []
  for (const i of startEdge(who)) {
    if (board[i] === opp) continue
    const w = board[i] === who ? 0 : 1
    if (w < dist[i]) { dist[i] = w; if (w === 0) deque.unshift(i); else deque.push(i) }
  }
  let best = Infinity
  while (deque.length) {
    const i = deque.shift()!
    const d = dist[i]
    if (onGoalEdge(who, i)) { if (d < best) best = d; continue }
    for (const j of neighbors(i)) {
      if (board[j] === opp) continue
      const nd = d + (board[j] === who ? 0 : 1)
      if (nd < dist[j]) { dist[j] = nd; if (board[j] === who) deque.unshift(j); else deque.push(j) }
    }
  }
  return best
}

// Candidate empties: those adjacent to an existing stone, plus a central window — keeps 11x11 fast.
function candidates(board: Cell[]): number[] {
  const set = new Set<number>()
  let any = false
  for (let i = 0; i < N * N; i++) if (board[i]) { any = true; for (const j of neighbors(i)) if (!board[j]) set.add(j) }
  const lo = 3, hi = N - 4
  for (let r = lo; r <= hi; r++) for (let c = lo; c <= hi; c++) if (!board[idx(r, c)]) set.add(idx(r, c))
  if (!any || set.size === 0) {       // empty board / nothing nearby — take the centre
    const mid = (N - 1) / 2
    set.add(idx(mid, mid))
  }
  return [...set]
}

export function aiMove(s: HexState): HexState {
  if (s.winner || s.turn !== 's') return s
  const me: Stone = 's', opp = other(me)

  // All empties — needed so we never miss a winning or must-block square.
  const empties: number[] = []
  for (let i = 0; i < N * N; i++) if (!s.board[i]) empties.push(i)
  if (!empties.length) return s

  // 1) Immediate win.
  for (const i of empties) {
    const b = s.board.slice(); b[i] = me
    if (findWin(b, me)) return place(s, i, me)
  }
  // 2) Block the opponent's immediate win.
  for (const i of empties) {
    const b = s.board.slice(); b[i] = opp
    if (findWin(b, opp)) return place(s, i, me)
  }

  // 3) Heuristic search over the candidate set.
  const cand = candidates(s.board)
  const pool = cand.length ? cand : empties
  let bestV = -Infinity
  const scored: { i: number; v: number }[] = []
  for (const i of pool) {
    const b = s.board.slice(); b[i] = me
    const myD = connectionDistance(b, me)
    const opD = connectionDistance(b, opp)
    const v = opD - myD + Math.random() * 0.01    // tiny tie-break
    scored.push({ i, v })
    if (v > bestV) bestV = v
  }
  const top = scored.filter(o => o.v >= bestV - 1e-9).map(o => o.i)
  const choice = top.length ? top[(Math.random() * top.length) | 0] : pool[0]
  return place(s, choice, me)
}
