/* INGENIOUS — hex tile-laying with six colour tracks (pure logic, built for this codebase).

   A hexagonal board (a hexagon of side SIDE) of hex cells in AXIAL coordinates (q, r). A cell is
   on the board iff max(|q|, |r|, |q + r|) <= SIDE - 1. Each cell holds a colour symbol (0..5) or
   null when empty.

   Tiles are domino-shaped: two ADJACENT hexes, each bearing one colour symbol (a random pair,
   possibly equal). Each player has a rack of 6 hidden tiles drawn from a bag. On a turn a player
   places ONE tile onto two empty adjacent cells.

   SCORING: for each of the tile's two ends, look outward in each of the 6 hex DIRECTIONS from that
   end's cell and count consecutive same-colour symbols already on the board, adding that count to
   the player's score TRACK for that colour. An end does NOT score in the direction that points at
   its partner (that cell is the other freshly-placed end). So each end scores its colour over the 5
   directions not pointing at its partner. Tracks cap at 18.

   INGENIOUS: completing a colour to 18 grants an immediate EXTRA TURN.

   The game ends when no legal placement remains (board full) or a player cannot be dealt a tile and
   the active player has an empty rack. A player's FINAL SCORE is their LOWEST colour track; higher
   lowest-track wins, ties broken by next-lowest, and so on. */

export const SIDE = 6
export const NCOLORS = 6
export const RACK = 6
export const MAXTRACK = 18

export type Color = number // 0..5
export type Cell = Color | null
export type Player = 0 | 1

// A tile = an ordered pair of colours; the two ends are placed on two adjacent cells.
export interface Tile { a: Color; b: Color }

export interface Coord { q: number; r: number }

export interface Placement {
  cellA: number // board index for tile.a
  cellB: number // board index for tile.b (adjacent to cellA)
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface IngState {
  board: Cell[] // length CELLS, index from coordToIndex; null = empty
  tracks: number[][] // [player][color] 0..18
  racks: Tile[][] // [player] up to RACK tiles
  bag: Tile[] // remaining undealt tiles (drawn from the front)
  turn: Player // whose turn
  you: Player // always 0
  winner: Player | null // null until game ends
  last: number[] // board indices of the most recently placed ends (for highlight)
  moves: number // total placements made (monotonic tick + guard)
  log: LogEntry[]
}

export const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple']

/* ===== Hex geometry (axial) ===== */

// The six axial directions, in a stable order.
export const DIRS: Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

// Enumerate all cells of the side-SIDE hexagon, building index<->coord maps.
export const COORDS: Coord[] = (() => {
  const out: Coord[] = []
  const lim = SIDE - 1
  for (let q = -lim; q <= lim; q++) {
    for (let r = -lim; r <= lim; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= lim) out.push({ q, r })
    }
  }
  return out
})()

export const CELLS = COORDS.length

const KEY = (q: number, r: number) => q * 1000 + r
const INDEX_OF: Map<number, number> = (() => {
  const m = new Map<number, number>()
  COORDS.forEach((c, i) => m.set(KEY(c.q, c.r), i))
  return m
})()

export function coordToIndex(q: number, r: number): number | null {
  const v = INDEX_OF.get(KEY(q, r))
  return v == null ? null : v
}
export function indexToCoord(i: number): Coord {
  return COORDS[i]
}

// Neighbour index in direction d, or null if off-board.
export function step(i: number, d: number): number | null {
  const c = COORDS[i]
  const dir = DIRS[d]
  return coordToIndex(c.q + dir.q, c.r + dir.r)
}

// All on-board neighbour indices of cell i.
export function neighbors(i: number): number[] {
  const out: number[] = []
  for (let d = 0; d < 6; d++) {
    const n = step(i, d)
    if (n != null) out.push(n)
  }
  return out
}

/* ===== Bag / tiles ===== */

// Deterministic default bag: every unordered colour pair (incl. doubles) repeated, then a fixed
// shuffle from a seeded PRNG so games (and tests) are reproducible without an explicit bag.
function makeDefaultBag(): Tile[] {
  const tiles: Tile[] = []
  for (let rep = 0; rep < 4; rep++) {
    for (let a = 0; a < NCOLORS; a++) {
      for (let b = a; b < NCOLORS; b++) {
        tiles.push({ a, b })
      }
    }
  }
  // seeded shuffle (mulberry32)
  let seed = 0x9e3779b9 >>> 0
  const rnd = () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = tiles[i]
    tiles[i] = tiles[j]
    tiles[j] = tmp
  }
  return tiles
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

export function makeGame(optionalBag?: Tile[]): IngState {
  const bag = (optionalBag ? optionalBag.slice() : makeDefaultBag())
  const racks: Tile[][] = [[], []]
  // Deal initial racks (player 0 then player 1) from the front of the bag.
  for (let p = 0; p < 2; p++) {
    while (racks[p].length < RACK && bag.length) racks[p].push(bag.shift()!)
  }
  return {
    board: new Array(CELLS).fill(null),
    tracks: [new Array(NCOLORS).fill(0), new Array(NCOLORS).fill(0)],
    racks,
    bag,
    turn: 0,
    you: 0,
    winner: null,
    last: [],
    moves: 0,
    log: [{ t: 'sys', x: 'Balance all six colours — your score is your LOWEST track.' }],
  }
}

/* ===== Placements ===== */

// All legal 2-cell placements on the board (ordered cellA,cellB pairs of empty adjacent cells).
// Returns each adjacency ONCE in each orientation only when needed by the caller; here we return
// unordered adjacent empty pairs (cellA < cellB) — callers try both tile orientations.
export function legalPlacements(board: Cell[]): Placement[] {
  const out: Placement[] = []
  for (let i = 0; i < board.length; i++) {
    if (board[i] != null) continue
    for (let d = 0; d < 6; d++) {
      const j = step(i, d)
      if (j == null || j <= i) continue
      if (board[j] != null) continue
      out.push({ cellA: i, cellB: j })
    }
  }
  return out
}

export function hasLegalPlacement(board: Cell[]): boolean {
  for (let i = 0; i < board.length; i++) {
    if (board[i] != null) continue
    for (let d = 0; d < 6; d++) {
      const j = step(i, d)
      if (j != null && board[j] == null) return true
    }
  }
  return false
}

/* ===== Line scoring =====
   For a freshly-placed end at cell `at` bearing `color`, count consecutive same-colour cells
   outward in each of the 6 directions, skipping the direction that points at `partner` (the
   other freshly-placed end). Returns total over the relevant 5 directions. The freshly-placed
   ends themselves are NOT counted as part of the line (we start one step out). */
export function scoreEnd(board: Cell[], at: number, color: Color, partner: number): number {
  let total = 0
  for (let d = 0; d < 6; d++) {
    const first = step(at, d)
    if (first == null) continue
    if (first === partner) continue // direction pointing at our own other end — skip
    let cur: number | null = first
    while (cur != null && board[cur] === color) {
      total++
      cur = step(cur, d)
    }
  }
  return total
}

// Score both freshly-placed ends. `board` must ALREADY contain the placed tile.
// Returns an array of {color, gain} contributions (one per end).
export function scoreLines(
  board: Cell[],
  placedEnds: { at: number; color: Color }[],
): { color: Color; gain: number }[] {
  const out: { color: Color; gain: number }[] = []
  const ends = placedEnds
  for (let k = 0; k < ends.length; k++) {
    const e = ends[k]
    const partner = ends.length === 2 ? ends[1 - k].at : -1
    out.push({ color: e.color, gain: scoreEnd(board, e.at, e.color, partner) })
  }
  return out
}

/* ===== Rack refill ===== */

export function refillRack(s: IngState, player: Player): void {
  while (s.racks[player].length < RACK && s.bag.length) {
    s.racks[player].push(s.bag.shift()!)
  }
}

/* ===== Final scoring / winner ===== */

// A player's ordered track values, ascending — lowest first.
export function sortedTracks(tracks: number[]): number[] {
  return tracks.slice().sort((a, b) => a - b)
}

export function lowestTrack(tracks: number[]): number {
  let m = MAXTRACK + 1
  for (const v of tracks) if (v < m) m = v
  return m
}

// Compare two players: returns 1 if A wins, -1 if B wins, 0 if exactly tied on all tracks.
export function compareScores(a: number[], b: number[]): number {
  const sa = sortedTracks(a)
  const sb = sortedTracks(b)
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i] ? 1 : -1
  }
  return 0
}

// Decide the winner from final tracks. Player 0 wins ties (tie -> you).
export function decideWinner(tracks: number[][]): Player {
  const cmp = compareScores(tracks[0], tracks[1])
  return cmp >= 0 ? 0 : 1
}

/* ===== Apply a tile placement =====
   Places racks[player][tileIndex] with tile.a at cellA and tile.b at cellB (adjacent empties),
   updates score tracks, handles the INGENIOUS extra turn, refills the rack, and advances the
   turn / ends the game. Returns a NEW state (pure). Returns the same state if the move is
   illegal so callers can guard. */
export function placeTile(
  s: IngState,
  player: Player,
  tileIndex: number,
  cellA: number,
  cellB: number,
): IngState {
  if (s.winner != null || s.turn !== player) return s
  const rack = s.racks[player]
  if (tileIndex < 0 || tileIndex >= rack.length) return s
  if (cellA < 0 || cellA >= s.board.length || cellB < 0 || cellB >= s.board.length) return s
  if (cellA === cellB) return s
  if (s.board[cellA] != null || s.board[cellB] != null) return s
  // adjacency check
  let adj = false
  for (let d = 0; d < 6; d++) if (step(cellA, d) === cellB) { adj = true; break }
  if (!adj) return s

  const tile = rack[tileIndex]
  const board = s.board.slice()
  board[cellA] = tile.a
  board[cellB] = tile.b

  const contribs = scoreLines(board, [
    { at: cellA, color: tile.a },
    { at: cellB, color: tile.b },
  ])

  const tracks = s.tracks.map((t) => t.slice())
  let ingenious = false
  for (const c of contribs) {
    const before = tracks[player][c.color]
    const after = Math.min(MAXTRACK, before + c.gain)
    if (before < MAXTRACK && after === MAXTRACK) ingenious = true
    tracks[player][c.color] = after
  }

  // remove the placed tile from the rack
  const racks = s.racks.map((r) => r.slice())
  racks[player].splice(tileIndex, 1)

  const who: LogEntry['t'] = player === s.you ? 'you' : 'ai'
  const name = player === s.you ? 'You' : 'Rival'
  const gained = contribs
    .filter((c) => c.gain > 0)
    .map((c) => `+${c.gain} ${COLOR_NAMES[c.color]}`)
    .join(', ')
  let log = push(s.log, who, `${name} placed a tile${gained ? ` — ${gained}` : ''}.`)
  if (ingenious) log = push(log, who, `INGENIOUS! ${name} reach 18 and take an extra turn.`)

  const next: IngState = {
    board,
    tracks,
    racks,
    bag: s.bag.slice(),
    turn: s.turn,
    you: s.you,
    winner: null,
    last: [cellA, cellB],
    moves: s.moves + 1,
    log,
  }

  // refill the active player's rack first (they used a tile)
  refillRack(next, player)

  // Decide who acts next. INGENIOUS => same player goes again (if they still have a tile & space).
  const nextPlayer: Player = ingenious ? player : (player === 0 ? 1 : 0)

  // Game-over check: ends if the player who is about to act cannot move (no legal board placement)
  // or has no tiles in hand (couldn't be refilled and rack empty).
  const boardHasRoom = hasLegalPlacement(next.board)
  const actorHasTiles = next.racks[nextPlayer].length > 0
  if (!boardHasRoom || !actorHasTiles) {
    next.winner = decideWinner(next.tracks)
    next.turn = nextPlayer
    const youWon = next.winner === next.you
    next.log = push(
      next.log,
      'sys',
      youWon ? 'Game over — you win on your lowest track.' : 'Game over — the rival wins on its lowest track.',
    )
    return next
  }

  next.turn = nextPlayer
  return next
}

/* ===== AI =====
   Greedy: place the rack tile + orientation + board cell maximizing weighted gain to the AI's
   WEAKEST colours (since the lowest track decides the score). Weight each end's gain by how far
   that colour is below the current minimum track — colours at or near the minimum are worth more.
   Fast: iterates rack x legal-placements x 2 orientations. */
export function aiTurn(s: IngState): IngState {
  if (s.winner != null || s.turn === s.you) return s
  const me: Player = s.turn
  const rack = s.racks[me]
  const places = legalPlacements(s.board)
  if (!rack.length || !places.length) {
    // shouldn't happen (placeTile ends the game first), but guard: end the game.
    return Object.assign({}, s, { winner: decideWinner(s.tracks) })
  }

  const tracks = s.tracks[me]
  // urgency weight per colour: lower current track => higher weight. Range ~ [1 .. MAXTRACK+1].
  const minTrack = lowestTrack(tracks)
  const weightOf = (color: Color, gainTo: number): number => {
    const cur = tracks[color]
    // how much this gain helps the *lowest* objective: prioritise raising tracks at/near the min,
    // and never reward overshooting past 18.
    const effective = Math.min(MAXTRACK, cur + gainTo) - cur
    const deficitFromMin = Math.max(0, MAXTRACK - cur)
    // weight emphasises colours that are currently the lowest
    const proximity = cur <= minTrack + 1 ? 3 : cur <= minTrack + 4 ? 1.6 : 1
    return effective * (1 + deficitFromMin * 0.04) * proximity
  }

  let bestScore = -Infinity
  let best: { tileIndex: number; cellA: number; cellB: number } | null = null
  let tie = 0

  for (let ti = 0; ti < rack.length; ti++) {
    const tile = rack[ti]
    for (const pl of places) {
      // two orientations: a@cellA,b@cellB  and  a@cellB,b@cellA
      for (let o = 0; o < 2; o++) {
        const ca = o === 0 ? pl.cellA : pl.cellB
        const cb = o === 0 ? pl.cellB : pl.cellA
        if (tile.a === tile.b && o === 1) continue // identical orientation, skip dup
        const board = s.board.slice()
        board[ca] = tile.a
        board[cb] = tile.b
        const contribs = scoreLines(board, [
          { at: ca, color: tile.a },
          { at: cb, color: tile.b },
        ])
        let v = 0
        for (const c of contribs) v += weightOf(c.color, c.gain)
        // tiny deterministic-ish tie break to avoid always hitting the same cell
        const jitter = (ti * 131 + ca * 17 + cb * 7) % 5 * 0.0001
        const total = v + jitter
        if (total > bestScore) {
          bestScore = total
          best = { tileIndex: ti, cellA: ca, cellB: cb }
          tie = 1
        } else if (total === bestScore) {
          tie++
        }
      }
    }
  }
  void tie
  if (!best) return Object.assign({}, s, { winner: decideWinner(s.tracks) })
  return placeTile(s, me, best.tileIndex, best.cellA, best.cellB)
}

/* Convenience for the UI: a player's display score (lowest track). */
export function displayScore(tracks: number[]): number {
  return lowestTrack(tracks)
}
