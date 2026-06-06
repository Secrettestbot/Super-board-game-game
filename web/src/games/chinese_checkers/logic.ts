/* CHINESE CHECKERS — pure logic (built for this codebase, not ported).

   The board is the classic six-pointed-star (hexagram) of 121 holes. We use CUBE
   coordinates (x, y, z) with the invariant x + y + z = 0 — the natural fit for a
   triangular/hex grid. The standard star is the set of holes where AT MOST one of the
   three cube axes exceeds the central-hexagon radius (4). Concretely a hole (x,y,z) is
   on the board iff max(|x|,|y|,|z|) <= 8 AND at least two of x,y,z lie in [-4, 4]. That
   carves the central hexagon (side 5 -> the 61-hole hexagon) plus six 10-hole points.

   The six triangular "points" of the star are indexed by the axis/sign that pokes out:
     point N  (top)         : y >= 5  (the +y tip,   "north")
     point S  (bottom)      : y <= -5 (the -y tip,   "south")
   We play TWO players on the two OPPOSITE points N and S. You (player 0) start in the
   SOUTH home and race to the NORTH target; the AI (player 1) starts NORTH, races SOUTH.

   Six step directions are the unit cube moves. A JUMP hops over a single occupied
   neighbour in a straight line into the empty hole two steps out; chains may turn
   between hops (no revisiting a hole within one chain).

   NO React / DOM here. */

export type Player = 0 | 1
export type Occ = Player | null

export interface Hole {
  x: number
  y: number
  z: number
  id: number          // stable index into the holes array
}

export interface State {
  board: Occ[]                 // board[id] = occupant (0 | 1) or null
  turn: Player                 // whose move
  winner: Player | null        // filled target triangle => that player wins
  last: number[] | null        // path (hole ids) of the last move, for highlight
}

/** A move is a path of hole ids: [from, ...to]. length 2 = step or single jump. */
export type Move = number[]

// ---- the six unit step directions in cube coords ----
const DIRS: [number, number, number][] = [
  [1, -1, 0], [1, 0, -1], [0, 1, -1],
  [-1, 1, 0], [-1, 0, 1], [0, -1, 1],
]

const HEX_R = 4   // central-hexagon radius
const STAR_R = 8  // tip reach

function onBoard(x: number, y: number, z: number): boolean {
  if (x + y + z !== 0) return false
  if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > STAR_R) return false
  // at least two axes within the hexagon band => board (hexagon + 6 points)
  let inBand = 0
  if (Math.abs(x) <= HEX_R) inBand++
  if (Math.abs(y) <= HEX_R) inBand++
  if (Math.abs(z) <= HEX_R) inBand++
  return inBand >= 2
}

// ---- build the canonical hole list (deterministic order) ----
function buildHoles(): Hole[] {
  const holes: Hole[] = []
  for (let x = -STAR_R; x <= STAR_R; x++) {
    for (let y = -STAR_R; y <= STAR_R; y++) {
      const z = -x - y
      if (onBoard(x, y, z)) holes.push({ x, y, z, id: 0 })
    }
  }
  // canonical order: top (high y) to bottom, then left->right by x
  holes.sort((a, b) => (b.y - a.y) || (a.x - b.x))
  holes.forEach((h, i) => { h.id = i })
  return holes
}

export const HOLES: Hole[] = buildHoles()
export const HOLE_COUNT = HOLES.length

// id <-> coordinate lookups
const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`
const ID_BY_KEY = new Map<string, number>()
HOLES.forEach(h => ID_BY_KEY.set(keyOf(h.x, h.y, h.z), h.id))
function idAt(x: number, y: number, z: number): number | null {
  const v = ID_BY_KEY.get(keyOf(x, y, z))
  return v == null ? null : v
}

// neighbour ids per hole (index -> 6 neighbour ids, null if off-board), and the
// "beyond" hole for jumps (two steps in the same direction).
interface Adj { step: (number | null)[]; jump: (number | null)[] }
const ADJ: Adj[] = HOLES.map(h => {
  const step: (number | null)[] = []
  const jump: (number | null)[] = []
  for (const [dx, dy, dz] of DIRS) {
    step.push(idAt(h.x + dx, h.y + dy, h.z + dz))
    jump.push(idAt(h.x + 2 * dx, h.y + 2 * dy, h.z + 2 * dz))
  }
  return { step, jump }
})

// ---- the two opposite home / target triangles (the N and S points) ----
// SOUTH point: y <= -5 ; NORTH point: y >= 5. Each has exactly 10 holes.
export const SOUTH_IDS: number[] = HOLES.filter(h => h.y <= -(HEX_R + 1)).map(h => h.id)
export const NORTH_IDS: number[] = HOLES.filter(h => h.y >= HEX_R + 1).map(h => h.id)

// player 0 home = SOUTH, target = NORTH ; player 1 home = NORTH, target = SOUTH.
export const HOME = [SOUTH_IDS, NORTH_IDS] as const
export const TARGET = [NORTH_IDS, SOUTH_IDS] as const

// the "far corner" of a player's target, used for progress scoring (the deepest tip).
// player 0 targets NORTH so the far corner is max y; player 1 targets SOUTH (min y).
const FAR_CORNER: [number, number][] = (() => {
  const north = NORTH_IDS.map(id => HOLES[id]).reduce((a, b) => (b.y > a.y ? b : a))
  const south = SOUTH_IDS.map(id => HOLES[id]).reduce((a, b) => (b.y < a.y ? b : a))
  return [[north.x, north.y], [south.x, south.y]] // player 0 -> north tip, player 1 -> south tip
})()

/** Cube distance between two holes. */
export function dist(a: number, b: number): number {
  const h1 = HOLES[a], h2 = HOLES[b]
  return (Math.abs(h1.x - h2.x) + Math.abs(h1.y - h2.y) + Math.abs(h1.z - h2.z)) / 2
}

/** Distance (in steps) from a hole to a player's target far corner. Lower = closer. */
export function distToTarget(id: number, player: Player): number {
  const h = HOLES[id]
  const [fx, fy] = FAR_CORNER[player]
  const fz = -fx - fy
  return (Math.abs(h.x - fx) + Math.abs(h.y - fy) + Math.abs(h.z - fz)) / 2
}

export function makeGame(): State {
  const board: Occ[] = new Array(HOLE_COUNT).fill(null)
  for (const id of SOUTH_IDS) board[id] = 0
  for (const id of NORTH_IDS) board[id] = 1
  return { board, turn: 0, winner: null, last: null }
}

// ---- move generation ----

/** All on-board step neighbours of a hole (ignoring occupancy) — for drawing the grid. */
export function stepNeighbours(id: number): number[] {
  const out: number[] = []
  for (const n of ADJ[id].step) if (n != null) out.push(n)
  return out
}

/** Single-step destinations from a hole (adjacent empty holes). */
export function stepMoves(board: Occ[], from: number): number[] {
  const out: number[] = []
  const adj = ADJ[from]
  for (const n of adj.step) if (n != null && board[n] == null) out.push(n)
  return out
}

/** All reachable jump-chain endpoints from `from`, as full paths [from, ...hops]. */
export function jumpPaths(board: Occ[], from: number): Move[] {
  const paths: Move[] = []
  const seen = new Set<number>([from]) // holes visited within this chain
  function recurse(at: number, path: number[]) {
    const adj = ADJ[at]
    for (let d = 0; d < DIRS.length; d++) {
      const over = adj.step[d]
      const land = adj.jump[d]
      if (over == null || land == null) continue
      if (board[over] == null) continue       // must hop OVER an occupied hole
      if (board[land] != null) continue        // landing must be empty
      if (seen.has(land)) continue              // no revisits within the chain
      seen.add(land)
      const np = path.concat([land])
      paths.push(np)
      recurse(land, np)
      seen.delete(land)
    }
  }
  recurse(from, [from])
  return paths
}

/** All legal moves for `player`: single steps + jump chains. Each is a path. */
export function legalMoves(s: State, player: Player): Move[] {
  if (s.winner != null) return []
  const out: Move[] = []
  for (let id = 0; id < s.board.length; id++) {
    if (s.board[id] !== player) continue
    for (const to of stepMoves(s.board, id)) out.push([id, to])
    for (const p of jumpPaths(s.board, id)) out.push(p)
  }
  return out
}

/** Legal moves for ONE peg (used by the UI after selecting a peg). */
export function movesForPeg(s: State, from: number): Move[] {
  if (s.winner != null || s.board[from] !== s.turn) return []
  const out: Move[] = []
  for (const to of stepMoves(s.board, from)) out.push([from, to])
  for (const p of jumpPaths(s.board, from)) out.push(p)
  return out
}

/** Is `player`'s target triangle completely filled by `player`'s own pegs? */
export function hasWon(board: Occ[], player: Player): boolean {
  for (const id of TARGET[player]) if (board[id] !== player) return false
  return true
}

/** Apply a move path (assumed legal). Returns a NEW state, flips the turn. */
export function applyMove(s: State, path: Move): State {
  if (s.winner != null || path.length < 2) return s
  const from = path[0], to = path[path.length - 1]
  const player = s.board[from]
  if (player == null) return s
  const board = s.board.slice()
  board[from] = null
  board[to] = player
  const winner = hasWon(board, player) ? player : null
  return {
    board,
    turn: winner != null ? s.turn : ((player === 0 ? 1 : 0) as Player),
    winner,
    last: path,
  }
}

// ---- AI: greedy 1-ply with progress heuristic + anti-stall ----
//
// Score a candidate move by how much TOTAL forward progress (target-distance reduced)
// it yields, with a bonus for landing the moving peg closer and a strong anti-stall
// penalty for pegs left lagging in the player's own home. Long jump chains naturally
// score high (big single-move distance reduction), which the prompt asks us to favour.

function homeLagPenalty(board: Occ[], player: Player): number {
  // pegs still sitting in the player's home triangle are "lagging"; the deeper in home
  // (further from target), the bigger the drag. This guarantees pegs can't be left
  // behind forever and keeps self-play moving toward termination.
  let pen = 0
  for (const id of HOME[player]) if (board[id] === player) pen += distToTarget(id, player)
  return pen
}

function boardScore(board: Occ[], player: Player): number {
  // lower total distance-to-target is better; subtract a lag penalty for home stragglers.
  let totalDist = 0
  for (let id = 0; id < board.length; id++) {
    if (board[id] === player) totalDist += distToTarget(id, player)
  }
  return -(totalDist) - 0.6 * homeLagPenalty(board, player)
}

/** Pick the AI's best move for the side to move. Returns the chosen path, or null. */
export function chooseMove(s: State, player: Player): Move | null {
  const moves = legalMoves(s, player)
  if (moves.length === 0) return null
  let best: Move | null = null
  let bestScore = -Infinity
  for (const m of moves) {
    const from = m[0], to = m[m.length - 1]
    // incremental: progress of the moved peg + the resulting board score.
    const board = s.board.slice()
    board[from] = null
    board[to] = player
    const moveGain = distToTarget(from, player) - distToTarget(to, player) // >0 = forward
    // strongly reward forward moves; mild chain-length sweetener for long jumps.
    const chainBonus = (m.length - 2) * 0.5
    const score = boardScore(board, player) + moveGain * 2 + chainBonus
      + (Math.random() * 0.001) // tiny jitter to break ties / avoid loops
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}

/** Advance the game by the AI's chosen move (no-op if not the AI's turn / game over). */
export function aiTurn(s: State, player: Player = s.turn): State {
  if (s.winner != null) return s
  const m = chooseMove(s, player)
  if (m == null) return s
  return applyMove(s, m)
}
