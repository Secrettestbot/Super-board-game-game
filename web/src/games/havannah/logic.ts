/* HAVANNAH — the hexagonal connection game (pure logic, built for this codebase).
   A hexagonal board of hexagonal cells with side length N (default 6 → 91 cells). Cube
   coordinates (x,y,z) with x+y+z=0 and max(|x|,|y|,|z|) <= N-1. Players alternate placing
   one stone of their colour on any empty cell — no captures, no moving. You are player 0
   (Ember, warm); the AI is player 1 (Frost, cool). You go first.

   A player wins by completing ANY ONE of three structures with a single connected group of
   their stones:
     · BRIDGE — the group touches at least TWO of the six corner cells.
     · FORK   — the group touches at least THREE of the six edges (edge = border cell that is
                not a corner; the six edges are the six straight border segments).
     · RING   — the group forms a closed loop enclosing at least one cell (the enclosed cell(s)
                may be empty, yours, or the opponent's). Detected via flood-fill: a "hole" of
                cells unreachable from the board's outside without crossing the group.

   If the board fills with no winner it is a draw (rare). No React/DOM in this file. */

export type Player = 0 | 1
export type Owner = Player | null
export type WinType = 'bridge' | 'fork' | 'ring' | null

export interface Cube { x: number; y: number; z: number }

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  N: number
  cells: string[]                 // all cell keys, stable order
  board: Record<string, Owner>    // key -> 0 | 1 | null (empty is null, NEVER 0)
  corners: Set<string>            // the six corner cells
  edges: Set<string>              // all border cells that are not corners
  edgeId: Record<string, number>  // for an edge cell, which of the 6 edges (0..5); else absent
  turn: Player                    // whose move it is
  winner: Owner                   // 0 | 1 | null
  winType: WinType
  winGroup: string[]              // the winning connected group (highlighted)
  last: string | null             // last placed cell key
  log: LogEntry[]
}

// ---- coords -------------------------------------------------------------
export const key = (x: number, y: number): string => `${x},${y}`   // z = -x-y is implied
export function cubeOf(k: string): Cube {
  const [x, y] = k.split(',').map(Number)
  return { x, y, z: -x - y }
}

// The six cube-coordinate directions around a hex.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

export function neighbors(k: string): string[] {
  const [x, y] = k.split(',').map(Number)
  const out: string[] = []
  for (const [dx, dy] of DIRS) out.push(key(x + dx, y + dy))
  return out
}

const other = (p: Player): Player => (p === 0 ? 1 : 0)

// ---- board construction -------------------------------------------------
function buildCells(N: number): string[] {
  const cells: string[] = []
  for (let x = -(N - 1); x <= N - 1; x++) {
    for (let y = -(N - 1); y <= N - 1; y++) {
      const z = -x - y
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= N - 1) cells.push(key(x, y))
    }
  }
  return cells
}

/* A cell is on the border when max(|x|,|y|,|z|) === N-1. A corner is where TWO of the three
   coords are at the extreme ±(N-1). The six edges are the six straight segments between
   adjacent corners; we label each non-corner border cell with the edge it belongs to by
   which coordinate is pinned at +(N-1) or -(N-1). */
function classify(N: number, cells: string[]) {
  const M = N - 1
  const corners = new Set<string>()
  const edges = new Set<string>()
  const edgeId: Record<string, number> = {}
  for (const k of cells) {
    const { x, y, z } = cubeOf(k)
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z)
    const onBorder = Math.max(ax, ay, az) === M
    if (!onBorder) continue
    const extremes = (ax === M ? 1 : 0) + (ay === M ? 1 : 0) + (az === M ? 1 : 0)
    if (extremes >= 2) { corners.add(k); continue }
    // exactly one coordinate is pinned at ±M -> it sits on one of the six edges.
    edges.add(k)
    let id: number
    if (x === M) id = 0
    else if (y === -M) id = 1
    else if (z === M) id = 2
    else if (x === -M) id = 3
    else if (y === M) id = 4
    else id = 5 // z === -M
    edgeId[k] = id
  }
  return { corners, edges, edgeId }
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

export function makeGame(N = 6): State {
  const cells = buildCells(N)
  const { corners, edges, edgeId } = classify(N, cells)
  const board: Record<string, Owner> = {}
  for (const k of cells) board[k] = null
  return {
    N, cells, board, corners, edges, edgeId,
    turn: 0, winner: null, winType: null, winGroup: [], last: null,
    log: [{ t: 'sys', x: 'You are Ember and move first. Win by a bridge (2 corners), a fork (3 edges), or a ring.' }],
  }
}

export function legalMoves(s: State): string[] {
  if (s.winner != null) return []
  return s.cells.filter(k => s.board[k] == null)
}

// ---- connected-group helpers -------------------------------------------
const onBoard = (s: State, k: string): boolean => s.board[k] !== undefined

/* Flood the same-colour group containing `start`. */
function groupOf(s: State, start: string, who: Player): string[] {
  const seen = new Set<string>([start])
  const stack = [start]
  const group: string[] = []
  while (stack.length) {
    const k = stack.pop()!
    group.push(k)
    for (const n of neighbors(k)) {
      if (!seen.has(n) && onBoard(s, n) && s.board[n] === who) { seen.add(n); stack.push(n) }
    }
  }
  return group
}

/* RING detection for a connected group: does the group enclose at least one cell?
   We flood the board's EMPTY-of-this-group space starting from every border cell that is NOT
   in the group; any on-board cell not reached by that outside flood is "enclosed" by the group.
   An enclosed cell can be empty, ours, or the opponent's. If any on-board cell is enclosed, the
   group forms a ring. (A group that merely runs along must still surround a real cell — a single
   line or a blob with no hole leaves nothing unreachable.) */
function groupFormsRing(s: State, group: string[]): boolean {
  const inGroup = new Set(group)
  // Outside flood over all cells NOT in the group, seeded from border cells not in the group.
  const outside = new Set<string>()
  const stack: string[] = []
  for (const k of s.cells) {
    if (inGroup.has(k)) continue
    const onB = s.corners.has(k) || s.edges.has(k)
    if (onB) { outside.add(k); stack.push(k) }
  }
  while (stack.length) {
    const k = stack.pop()!
    for (const n of neighbors(k)) {
      if (!onBoard(s, n)) continue
      if (inGroup.has(n) || outside.has(n)) continue
      outside.add(n); stack.push(n)
    }
  }
  // Any on-board, non-group cell never reached from outside -> enclosed -> ring.
  for (const k of s.cells) {
    if (inGroup.has(k)) continue
    if (!outside.has(k)) return true
  }
  return false
}

export interface WinResult { type: WinType; group: string[] }

/* Check whether `who` has won, optionally seeded from a known last cell. Examines connected
   groups; returns the winning type + group, or { type:null, group:[] }. Order: ring/bridge/fork
   are all valid wins — we report whichever the group satisfies (bridge/fork checked first as
   they are cheap; ring last). */
export function checkWin(s: State, who: Player, lastCell?: string | null): WinResult {
  // Determine which group(s) to inspect. With a lastCell we only need its group; otherwise scan.
  const visited = new Set<string>()
  const starts: string[] = []
  if (lastCell != null && s.board[lastCell] === who) {
    starts.push(lastCell)
  } else {
    for (const k of s.cells) if (s.board[k] === who) starts.push(k)
  }
  for (const start of starts) {
    if (visited.has(start)) continue
    if (s.board[start] !== who) continue
    const group = groupOf(s, start, who)
    for (const g of group) visited.add(g)

    // BRIDGE — group touches >= 2 corners.
    let cornerCount = 0
    for (const g of group) if (s.corners.has(g)) cornerCount++
    if (cornerCount >= 2) return { type: 'bridge', group }

    // FORK — group touches >= 3 distinct edges.
    const edgeSet = new Set<number>()
    for (const g of group) { const id = s.edgeId[g]; if (id !== undefined) edgeSet.add(id) }
    if (edgeSet.size >= 3) return { type: 'fork', group }

    // RING — group encloses at least one cell. Only meaningful with >= 6 stones.
    if (group.length >= 6 && groupFormsRing(s, group)) return { type: 'ring', group }
  }
  return { type: null, group: [] }
}

export function place(s: State, player: Player, cell: string): State {
  if (s.winner != null) return s
  if (s.turn !== player) return s
  if (s.board[cell] !== null) return s     // occupied or off-board (undefined !== null)

  const board = { ...s.board, [cell]: player }
  const ns: State = { ...s, board, last: cell }
  const youMoved = player === 0
  let log = push(s.log, youMoved ? 'you' : 'ai', `${youMoved ? 'You' : 'Frost'} placed at ${cell}.`)

  const res = checkWin(ns, player, cell)
  if (res.type != null) {
    const label = res.type === 'bridge' ? 'a bridge between corners'
      : res.type === 'fork' ? 'a fork across three edges'
        : 'a ring'
    log = push(log, youMoved ? 'you' : 'ai',
      `${youMoved ? 'You complete' : 'Frost completes'} ${label} — ${youMoved ? 'you win!' : 'Frost wins.'}`)
    return { ...ns, turn: other(player), winner: player, winType: res.type, winGroup: res.group, log }
  }

  // Draw check — board full with no winner.
  const anyEmpty = s.cells.some(k => board[k] == null)
  if (!anyEmpty) {
    log = push(log, 'sys', 'The board is full — a draw.')
    return { ...ns, turn: other(player), winner: null, winType: null, winGroup: [], log }
  }

  return { ...ns, turn: other(player), log }
}

// ---- AI -----------------------------------------------------------------
/* The AI heads toward a bridge/fork using a Hex-style connection-distance heuristic, with
   immediate-win and immediate-block tactics first. Connection distance for a colour = a 0-1 BFS
   measuring the minimum extra empty cells needed to link a set of targets (e.g. join two corners,
   or reach three edges). Own stones cost 0 to traverse, empty cells cost 1, enemy stones block. */

function bfsDistFrom(s: State, who: Player, sources: string[]): Record<string, number> {
  const opp = other(who)
  const dist: Record<string, number> = {}
  // 0-1 BFS via a simple deque.
  const deque: string[] = []
  for (const k of sources) {
    if (s.board[k] === opp) continue
    const w = s.board[k] === who ? 0 : 1
    if (dist[k] === undefined || w < dist[k]) { dist[k] = w; if (w === 0) deque.unshift(k); else deque.push(k) }
  }
  while (deque.length) {
    const k = deque.shift()!
    const d = dist[k]
    for (const n of neighbors(k)) {
      if (!onBoard(s, n)) continue
      if (s.board[n] === opp) continue
      const nd = d + (s.board[n] === who ? 0 : 1)
      if (dist[n] === undefined || nd < dist[n]) {
        dist[n] = nd
        if (s.board[n] === who) deque.unshift(n); else deque.push(n)
      }
    }
  }
  return dist
}

/* A rough "how close to a bridge/fork" score for `who` (higher = better). We compute, from each
   corner, the connection distance to the nearest other corner (bridge potential) and from the
   three closest edges (fork potential), and reward small distances. */
function connectionScore(s: State, who: Player): number {
  const corners = [...s.corners]
  // Bridge: best (smallest) pairwise corner-to-corner distance.
  let bestBridge = Infinity
  for (const c of corners) {
    if (s.board[c] === other(who)) continue
    const dist = bfsDistFrom(s, who, [c])
    for (const c2 of corners) {
      if (c2 === c) continue
      const d = dist[c2]
      if (d !== undefined && d < bestBridge) bestBridge = d
    }
  }
  // Fork: distance to reach each of the six edges from one source flood seeded at all own stones
  // (or, if none, from board centre). Sum the three smallest edge-reach distances.
  const ownStones = s.cells.filter(k => s.board[k] === who)
  const seed = ownStones.length ? ownStones : [key(0, 0)]
  const dist = bfsDistFrom(s, who, seed)
  const perEdge: number[] = new Array(6).fill(Infinity)
  for (const k of s.edges) {
    const id = s.edgeId[k]
    const d = dist[k]
    if (d !== undefined && d < perEdge[id]) perEdge[id] = d
  }
  const sorted = perEdge.slice().sort((a, b) => a - b)
  const forkDist = sorted[0] + sorted[1] + sorted[2]

  // Lower distances are better; turn into a positive score.
  const bridgeScore = bestBridge === Infinity ? -50 : -bestBridge
  const forkScore = forkDist === Infinity ? -50 : -forkDist * 0.6
  return Math.max(bridgeScore, forkScore) + (bridgeScore + forkScore) * 0.15
}

export function aiTurn(s: State): State {
  if (s.winner != null) return s
  const me = s.turn
  const opp = other(me)
  const empties = legalMoves(s)
  if (!empties.length) return s

  // 1) Immediate win.
  for (const k of empties) {
    const trial: State = { ...s, board: { ...s.board, [k]: me } }
    if (checkWin(trial, me, k).type != null) return place(s, me, k)
  }
  // 2) Block opponent's immediate win.
  for (const k of empties) {
    const trial: State = { ...s, board: { ...s.board, [k]: opp } }
    if (checkWin(trial, opp, k).type != null) return place(s, me, k)
  }

  // 3) Heuristic: maximise (my connection score) and hamper the opponent's.
  // Restrict candidates to empties adjacent to any stone (plus the centre on an empty board)
  // to keep it fast.
  let pool = empties.filter(k => neighbors(k).some(n => onBoard(s, n) && s.board[n] != null))
  if (!pool.length) pool = [key(0, 0)]

  let best = -Infinity
  const scored: { k: string; v: number }[] = []
  for (const k of pool) {
    const trial: State = { ...s, board: { ...s.board, [k]: me } }
    const mine = connectionScore(trial, me)
    const theirs = connectionScore(trial, opp)
    const v = mine - 0.7 * theirs + Math.random() * 0.01
    scored.push({ k, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-9).map(o => o.k)
  const choice = top.length ? top[(Math.random() * top.length) | 0] : pool[0]
  return place(s, me, choice)
}

export const winner = (s: State): Owner => s.winner
