/* BLOCKADE — logic (built for this codebase, not ported).
   An 11x11 grid. Each player owns TWO pawns. Player 0 ("you") starts on the BOTTOM row at cols
   3 and 7; player 1 ("ai") starts on the TOP row at cols 3 and 7. Your GOAL is to land either of
   your pawns on either of the opponent's two START cells (and vice-versa).

   A turn is move-THEN-wall: you MUST move one of your pawns one orthogonal step (or jump over an
   adjacent pawn, Quoridor-style) into an empty cell, AND THEN — if you have any walls left — you
   place exactly one wall. A wall is a 2-cell segment on the grid lines that blocks movement and may
   neither overlap/cross an existing wall nor completely seal ANY pawn off from ALL of its goals
   (enforced by a BFS reachability check).

   The AI advances the pawn with the shortest path to a goal and drops the wall that lengthens the
   opponent's best path the most.

   Immutable: every exported transition returns a fresh state; no DOM. Players/indices can be 0, so
   this file NEVER truthiness-tests a player/pawn-index/winner — it uses `== null` / `=== 0`. */

export const N = 11                 // 11x11 cells
export const WALL_N = N - 1         // 10x10 grid of wall slots
export const START_WALLS = 9

export type Player = 0 | 1          // 0 = you (bottom), 1 = ai (top)
export type Orient = 'h' | 'v'

export interface Wall { r: number; c: number; o: Orient } // top-left cell of the 2x2 the wall sits in
export interface Cell { r: number; c: number }
export interface LogEntry { t: string; x: string }

export interface BlockadeState {
  pawns: [Cell, Cell][]            // pawns[player] = [pawnA, pawnB]
  walls: Wall[]
  left: [number, number]           // walls remaining per player
  turn: Player | null
  winner: Player | null
  last: { kind: 'move' | 'wall'; who: Player } | null
  log: LogEntry[]
}

// Start cells (also serve as the opponent's goal set).
export const STARTS: [Cell, Cell][] = [
  [{ r: N - 1, c: 3 }, { r: N - 1, c: 7 }], // player 0
  [{ r: 0, c: 3 }, { r: 0, c: 7 }],         // player 1
]

const other = (p: Player): Player => (p === 0 ? 1 : 0)
// player p's goals are the OPPONENT's start cells
export const goalsOf = (p: Player): [Cell, Cell] => STARTS[other(p)]
const inBounds = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): BlockadeState {
  return {
    pawns: [
      [{ ...STARTS[0][0] }, { ...STARTS[0][1] }],
      [{ ...STARTS[1][0] }, { ...STARTS[1][1] }],
    ],
    walls: [],
    left: [START_WALLS, START_WALLS],
    turn: 0,
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'Move a pawn one step, then drop a wall. Land a pawn on a rival START to win.' }],
  }
}

// ===== wall geometry (identical convention to a Quoridor groove) =====
// A wall sits at (r,c), r,c in [0, WALL_N). 'h' spans horizontally across the gap below cells
// (r,c) and (r,c+1), blocking vertical movement between rows r and r+1 at columns c and c+1.
// 'v' spans vertically across the gap right of cells (r,c) and (r+1,c), blocking horizontal
// movement between cols c and c+1 at rows r and r+1.

function wallsConflict(a: Wall, b: Wall): boolean {
  if (a.o === b.o) {
    if (a.o === 'h') return a.r === b.r && Math.abs(a.c - b.c) <= 1
    return a.c === b.c && Math.abs(a.r - b.r) <= 1
  }
  return a.r === b.r && a.c === b.c // perpendicular walls cross only when anchored at same (r,c)
}

// does any wall block a step between adjacent cells (r0,c0) -> (r1,c1)?
function blocked(walls: Wall[], r0: number, c0: number, r1: number, c1: number): boolean {
  for (const w of walls) {
    if (r1 === r0 + 1 && c1 === c0) {        // DOWN across bottom edge of (r0,c0)
      if (w.o === 'h' && w.r === r0 && (w.c === c0 || w.c === c0 - 1)) return true
    } else if (r1 === r0 - 1 && c1 === c0) { // UP
      if (w.o === 'h' && w.r === r0 - 1 && (w.c === c0 || w.c === c0 - 1)) return true
    } else if (c1 === c0 + 1 && r1 === r0) { // RIGHT across right edge of (r0,c0)
      if (w.o === 'v' && w.c === c0 && (w.r === r0 || w.r === r0 - 1)) return true
    } else if (c1 === c0 - 1 && r1 === r0) { // LEFT
      if (w.o === 'v' && w.c === c0 - 1 && (w.r === r0 || w.r === r0 - 1)) return true
    }
  }
  return false
}

const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

function neighbours(walls: Wall[], r: number, c: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const [dr, dc] of STEPS) {
    const nr = r + dr, nc = c + dc
    if (inBounds(nr, nc) && !blocked(walls, r, c, nr, nc)) out.push([nr, nc])
  }
  return out
}

// ===== shortest path (BFS) from a cell to the NEAREST of a set of goal cells =====
// Returns the step count to the closest reachable goal, or null if none are reachable.
export function shortestPath(walls: Wall[], from: Cell, goals: Cell[]): number | null {
  const goalKeys = new Set(goals.map(g => g.r * N + g.c))
  const seen = new Set<number>()
  let frontier: Array<[number, number]> = [[from.r, from.c]]
  seen.add(from.r * N + from.c)
  let dist = 0
  while (frontier.length) {
    const next: Array<[number, number]> = []
    for (const [r, c] of frontier) {
      if (goalKeys.has(r * N + c)) return dist
      for (const [nr, nc] of neighbours(walls, r, c)) {
        const k = nr * N + nc
        if (!seen.has(k)) { seen.add(k); next.push([nr, nc]) }
      }
    }
    frontier = next
    dist++
  }
  return null
}

export function reachable(walls: Wall[], from: Cell, goals: Cell[]): boolean {
  return shortestPath(walls, from, goals) != null
}

// every pawn must still be able to reach at least one of its own goals under `walls`
function allPawnsReachable(walls: Wall[], pawns: BlockadeState['pawns']): boolean {
  for (const p of [0, 1] as Player[]) {
    const goals = goalsOf(p)
    for (const pawn of pawns[p]) if (!reachable(walls, pawn, goals)) return false
  }
  return true
}

// ===== legal wall placement (geometry + non-overlap + every-pawn-reachable BFS) =====
export function canPlaceWall(s: BlockadeState, w: Wall, who: Player): boolean {
  if (s.winner != null || s.turn !== who) return false
  if (s.left[who] <= 0) return false
  if (w.r < 0 || w.r >= WALL_N || w.c < 0 || w.c >= WALL_N) return false
  for (const ex of s.walls) if (wallsConflict(ex, w)) return false
  const trial = s.walls.concat([w])
  return allPawnsReachable(trial, s.pawns)
}

export function legalWalls(s: BlockadeState, who: Player): Wall[] {
  const out: Wall[] = []
  if (s.winner != null || s.turn !== who || s.left[who] <= 0) return out
  for (let r = 0; r < WALL_N; r++) for (let c = 0; c < WALL_N; c++) {
    for (const o of ['h', 'v'] as Orient[]) {
      const w: Wall = { r, c, o }
      if (canPlaceWall(s, w, who)) out.push(w)
    }
  }
  return out
}

const sameCell = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c

// All other pawns on the board (used as obstacles + jump targets).
function occupants(s: BlockadeState): Cell[] {
  return [s.pawns[0][0], s.pawns[0][1], s.pawns[1][0], s.pawns[1][1]]
}

// ===== pawn moves (with jump) =====
// Destination cells the pawn `who`/`idx` may step to, accounting for walls, other pawns and jumps.
export function legalMoves(s: BlockadeState, who: Player, idx: number): Array<[number, number]> {
  if (s.winner != null || s.turn !== who) return []
  if (idx !== 0 && idx !== 1) return []
  const me = s.pawns[who][idx]
  const others = occupants(s).filter(p => !sameCell(p, me))
  const occupied = (r: number, c: number) => others.some(p => p.r === r && p.c === c)
  const out: Array<[number, number]> = []
  for (const [dr, dc] of STEPS) {
    const nr = me.r + dr, nc = me.c + dc
    if (!inBounds(nr, nc) || blocked(s.walls, me.r, me.c, nr, nc)) continue
    if (occupied(nr, nc)) {
      // another pawn occupies the target — try to jump straight over it
      const jr = nr + dr, jc = nc + dc
      if (inBounds(jr, jc) && !blocked(s.walls, nr, nc, jr, jc) && !occupied(jr, jc)) {
        out.push([jr, jc])
      } else {
        // straight jump blocked/off-board/occupied — divert to the two side cells of that pawn
        for (const [pr, pc] of STEPS) {
          if (pr === dr && pc === dc) continue
          if (pr === -dr && pc === -dc) continue
          const sr = nr + pr, sc = nc + pc
          if (inBounds(sr, sc) && !blocked(s.walls, nr, nc, sr, sc) && !occupied(sr, sc)) out.push([sr, sc])
        }
      }
    } else {
      out.push([nr, nc])
    }
  }
  return out
}

// is `cell` one of player `who`'s goal cells?
function isGoal(who: Player, r: number, c: number): boolean {
  return goalsOf(who).some(g => g.r === r && g.c === c)
}

function clonePawns(pawns: BlockadeState['pawns']): BlockadeState['pawns'] {
  return [
    [{ ...pawns[0][0] }, { ...pawns[0][1] }],
    [{ ...pawns[1][0] }, { ...pawns[1][1] }],
  ]
}

const colLabel = (c: number) => 'ABCDEFGHIJK'[c]
const cellName = (r: number, c: number) => `${colLabel(c)}${N - r}`

function finish(s: BlockadeState, pawns: BlockadeState['pawns'], who: Player, log: LogEntry[]): BlockadeState {
  const msg = who === 0 ? 'You stormed a rival start — you win!' : 'The rival stormed your start — it wins.'
  return Object.assign({}, s, {
    pawns, turn: null, winner: who,
    last: { kind: 'move' as const, who },
    log: push(log, who === 0 ? 'you' : 'ai', msg),
  })
}

// MOVE one pawn. Does NOT end the turn unless it wins or the mover has no walls left — after a
// non-winning move the same player must place a wall (turn stays with them, last.kind='move').
// If the player has no walls remaining, the move alone completes the turn.
export function move(s: BlockadeState, who: Player, idx: number, r: number, c: number): BlockadeState {
  if (s.winner != null || s.turn !== who) return s
  if (!legalMoves(s, who, idx).some(([mr, mc]) => mr === r && mc === c)) return s
  const pawns = clonePawns(s.pawns)
  pawns[who][idx] = { r, c }
  const tag = who === 0 ? 'you' : 'ai'
  const name = who === 0 ? 'You' : 'Rival'
  const log = push(s.log, tag, `${name} moved a pawn to ${cellName(r, c)}.`)
  if (isGoal(who, r, c)) return finish(s, pawns, who, log)
  if (s.left[who] <= 0) {
    // no walls to place — the move completes the turn
    return Object.assign({}, s, { pawns, turn: other(who), last: { kind: 'move' as const, who }, log })
  }
  // turn stays with the mover; they must now place a wall
  return Object.assign({}, s, { pawns, turn: who, last: { kind: 'move' as const, who }, log })
}

// Whether the player is in the "must place a wall now" phase (already moved this turn, has walls).
export function awaitingWall(s: BlockadeState, who: Player): boolean {
  return s.winner == null && s.turn === who && s.last?.kind === 'move' && s.last.who === who && s.left[who] > 0
}

export function placeWall(s: BlockadeState, w: Wall, who: Player): BlockadeState {
  if (!canPlaceWall(s, w, who)) return s
  const walls = s.walls.concat([w])
  const left: [number, number] = [s.left[0], s.left[1]]
  left[who] = left[who] - 1
  const tag = who === 0 ? 'you' : 'ai'
  const name = who === 0 ? 'You' : 'Rival'
  const log = push(s.log, tag, `${name} placed a ${w.o === 'h' ? 'horizontal' : 'vertical'} wall (${left[who]} left).`)
  return Object.assign({}, s, { walls, left, turn: other(who), last: { kind: 'wall' as const, who }, log })
}

// ===== AI: BFS-greedy, advance + lengthen-opponent wall =====

// best (pawnIdx, target, resulting distance) toward a goal for player `who`
function bestAdvance(s: BlockadeState, who: Player): { idx: number; to: [number, number] } | null {
  const goals = goalsOf(who)
  let best: { idx: number; to: [number, number] } | null = null
  let bestD = Infinity
  for (const idx of [0, 1]) {
    const moves = legalMoves(s, who, idx)
    for (const [r, c] of moves) {
      if (isGoal(who, r, c)) return { idx, to: [r, c] }   // winning step — take it now
      const d = shortestPath(s.walls, { r, c }, goals)
      if (d != null && d < bestD) { bestD = d; best = { idx, to: [r, c] } }
    }
  }
  if (best) return best
  // no path-improving move — take any legal move to keep the game progressing
  for (const idx of [0, 1]) {
    const moves = legalMoves(s, who, idx)
    if (moves.length) return { idx, to: moves[0] }
  }
  return null
}

// shortest of the opponent's TWO pawns' distances to their goals
function oppBestDist(walls: Wall[], pawns: BlockadeState['pawns'], opp: Player): number {
  const goals = goalsOf(opp)
  let d = Infinity
  for (const pawn of pawns[opp]) {
    const x = shortestPath(walls, pawn, goals)
    if (x != null && x < d) d = x
  }
  return d
}

// Pick the wall that raises the opponent's best path the most while barely raising the AI's own.
function bestWall(s: BlockadeState, who: Player): Wall | null {
  const opp = other(who)
  const baseOpp = oppBestDist(s.walls, s.pawns, opp)
  const baseMine = oppBestDist(s.walls, s.pawns, who)
  let best: Wall | null = null, bestGain = -Infinity
  for (const w of legalWalls(s, who)) {
    const trial = s.walls.concat([w])
    const newOpp = oppBestDist(trial, s.pawns, opp)
    const newMine = oppBestDist(trial, s.pawns, who)
    const gain = (newOpp - baseOpp) - (newMine - baseMine)
    if (gain > bestGain) { bestGain = gain; best = w }
  }
  return bestGain > 0 ? best : null
}

// One whole AI turn: MOVE the most-advanced pawn, then (if useful) PLACE a wall.
export function aiTurn(s0: BlockadeState): BlockadeState {
  if (s0.winner != null || s0.turn !== 1) return s0
  const who: Player = 1

  // 1) MOVE
  const adv = bestAdvance(s0, who)
  let s = s0
  if (adv) s = move(s0, who, adv.idx, adv.to[0], adv.to[1])
  else return s0 // no legal move at all (shouldn't happen) — leave state untouched

  // move may have won, or may have consumed the whole turn (no walls left / turn passed)
  if (s.winner != null || s.turn !== who) return s

  // 2) PLACE a wall (we're in the awaiting-wall phase)
  const w = bestWall(s, who)
  if (w) return placeWall(s, w, who)
  // no helpful wall — but the turn still requires a wall when one exists; pass the turn by playing
  // the least-harmful legal wall if any. If none is even legal, end the turn by burning nothing.
  const any = legalWalls(s, who)
  if (any.length) return placeWall(s, any[Math.floor(Math.random() * any.length)], who)
  // genuinely no legal wall — pass the turn to keep play going
  return Object.assign({}, s, { turn: other(who), last: { kind: 'wall' as const, who } })
}
