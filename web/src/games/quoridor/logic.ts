/* QUORIDOR — logic (built for this codebase, not ported).
   9x9 grid of cells. You are the BOTTOM pawn (start r8,c4) racing to the TOP row (r0); the AI is
   the TOP pawn (start r0,c4) racing to the BOTTOM row (r8). Each side has 10 walls. A turn is
   either a pawn MOVE (one orthogonal step, JUMP over an adjacent opponent) or a WALL PLACE
   (a 2-cell segment on the grid lines that blocks movement and may not overlap/cross — and may
   never seal off either pawn's path to its goal, enforced by a BFS reachability check). The AI
   walks its BFS shortest path, occasionally dropping a legal wall that hurts you most.
   Immutable: every exported transition returns a fresh state; no DOM. */

export const N = 9                 // 9x9 cells
export const WALL_N = N - 1        // 8x8 grid of wall slots
export const START_WALLS = 10

export type Who = 'you' | 'ai'
export type Orient = 'h' | 'v'

export interface Wall { r: number; c: number; o: Orient } // top-left cell of the 2x2 the wall sits in
export interface Pawn { r: number; c: number }
export interface LogEntry { t: string; x: string }

export interface QuoridorState {
  pawns: { you: Pawn; ai: Pawn }
  walls: Wall[]
  left: { you: number; ai: number }   // walls remaining
  turn: Who | null
  winner: Who | null
  last: { kind: 'move' | 'wall'; who: Who } | null
  log: LogEntry[]
}

const other = (w: Who): Who => w === 'you' ? 'ai' : 'you'
const goalRow = (w: Who): number => w === 'you' ? 0 : N - 1
const inBounds = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): QuoridorState {
  return {
    pawns: { you: { r: N - 1, c: 4 }, ai: { r: 0, c: 4 } },
    walls: [],
    left: { you: START_WALLS, ai: START_WALLS },
    turn: 'you',
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'You are the bottom pawn — reach the top row to win. Move, or drop a wall to slow the rival.' }],
  }
}

// ===== wall geometry =====
// A wall sits at (r,c) with r,c in [0, WALL_N). For orient 'h' it spans horizontally across the
// gap below cells (r,c) and (r,c+1) — blocking vertical movement between row r and r+1 at columns
// c and c+1. For 'v' it spans vertically across the gap right of cells (r,c) and (r+1,c) —
// blocking horizontal movement between col c and c+1 at rows r and r+1.

function wallsConflict(a: Wall, b: Wall): boolean {
  if (a.o === b.o) {
    if (a.o === 'h') return a.r === b.r && Math.abs(a.c - b.c) <= 1 // overlapping horizontal segment
    return a.c === b.c && Math.abs(a.r - b.r) <= 1                  // overlapping vertical segment
  }
  // perpendicular: an h and v wall cross only when they share the same (r,c) anchor
  return a.r === b.r && a.c === b.c
}

// does any wall block a step between adjacent cells (r0,c0) -> (r1,c1)?
function blocked(walls: Wall[], r0: number, c0: number, r1: number, c1: number): boolean {
  for (const w of walls) {
    if (r1 === r0 + 1 && c1 === c0) {        // moving DOWN across bottom edge of (r0,c0)
      if (w.o === 'h' && w.r === r0 && (w.c === c0 || w.c === c0 - 1)) return true
    } else if (r1 === r0 - 1 && c1 === c0) { // moving UP
      if (w.o === 'h' && w.r === r0 - 1 && (w.c === c0 || w.c === c0 - 1)) return true
    } else if (c1 === c0 + 1 && r1 === r0) { // moving RIGHT across right edge of (r0,c0)
      if (w.o === 'v' && w.c === c0 && (w.r === r0 || w.r === r0 - 1)) return true
    } else if (c1 === c0 - 1 && r1 === r0) { // moving LEFT
      if (w.o === 'v' && w.c === c0 - 1 && (w.r === r0 || w.r === r0 - 1)) return true
    }
  }
  return false
}

const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

// orthogonal neighbours of (r,c) reachable through the walls (ignores pawns)
function neighbours(walls: Wall[], r: number, c: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const [dr, dc] of STEPS) {
    const nr = r + dr, nc = c + dc
    if (inBounds(nr, nc) && !blocked(walls, r, c, nr, nc)) out.push([nr, nc])
  }
  return out
}

// BFS shortest-path length from a pawn cell to its goal row through walls; null if unreachable.
export function shortestPath(walls: Wall[], from: Pawn, goal: number): number | null {
  const seen = new Set<number>()
  let frontier: Array<[number, number]> = [[from.r, from.c]]
  seen.add(from.r * N + from.c)
  let dist = 0
  while (frontier.length) {
    const next: Array<[number, number]> = []
    for (const [r, c] of frontier) {
      if (r === goal) return dist
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

export function reachable(walls: Wall[], from: Pawn, goal: number): boolean {
  return shortestPath(walls, from, goal) !== null
}

// ===== legal wall placement (geometry + non-overlap + both-pawns-reachable BFS) =====
export function canPlaceWall(s: QuoridorState, w: Wall, who: Who): boolean {
  if (s.winner || s.turn !== who) return false
  if (s.left[who] <= 0) return false
  if (w.r < 0 || w.r >= WALL_N || w.c < 0 || w.c >= WALL_N) return false
  for (const ex of s.walls) if (wallsConflict(ex, w)) return false
  const trial = s.walls.concat([w])
  // CRUCIAL: neither pawn may be fully sealed off from its goal row
  if (!reachable(trial, s.pawns.you, goalRow('you'))) return false
  if (!reachable(trial, s.pawns.ai, goalRow('ai'))) return false
  return true
}

export function legalWalls(s: QuoridorState, who: Who): Wall[] {
  const out: Wall[] = []
  if (s.winner || s.turn !== who || s.left[who] <= 0) return out
  for (let r = 0; r < WALL_N; r++) for (let c = 0; c < WALL_N; c++) {
    for (const o of ['h', 'v'] as Orient[]) {
      const w: Wall = { r, c, o }
      if (canPlaceWall(s, w, who)) out.push(w)
    }
  }
  return out
}

// ===== pawn moves (with jump) =====
// Destination cells the pawn `who` may step to, accounting for walls and the jump-over rule.
export function legalMoves(s: QuoridorState, who: Who): Array<[number, number]> {
  if (s.winner || s.turn !== who) return []
  const me = s.pawns[who], opp = s.pawns[other(who)]
  const out: Array<[number, number]> = []
  for (const [dr, dc] of STEPS) {
    const nr = me.r + dr, nc = me.c + dc
    if (!inBounds(nr, nc) || blocked(s.walls, me.r, me.c, nr, nc)) continue
    if (nr === opp.r && nc === opp.c) {
      // opponent occupies the target — try to jump straight over
      const jr = nr + dr, jc = nc + dc
      if (inBounds(jr, jc) && !blocked(s.walls, nr, nc, jr, jc)) {
        out.push([jr, jc])
      } else {
        // straight jump blocked/off-board — divert diagonally to the two side cells of the opp
        for (const [pr, pc] of STEPS) {
          if (pr === dr && pc === dc) continue          // not back into our own straight axis
          if (pr === -dr && pc === -dc) continue        // not back toward ourselves
          const sr = nr + pr, sc = nc + pc
          if (inBounds(sr, sc) && !blocked(s.walls, nr, nc, sr, sc)) out.push([sr, sc])
        }
      }
    } else {
      out.push([nr, nc])
    }
  }
  return out
}

function finish(s: QuoridorState, pawns: QuoridorState['pawns'], who: Who, log: LogEntry[]): QuoridorState {
  const msg = who === 'you' ? 'You reached the top row — you win!' : 'The rival reached the bottom row — it wins.'
  return Object.assign({}, s, { pawns, turn: null, winner: who, last: { kind: 'move' as const, who }, log: push(log, who === 'you' ? 'you' : 'ai', msg) })
}

const colLabel = (c: number) => 'ABCDEFGHI'[c]

export function move(s: QuoridorState, r: number, c: number, who: Who): QuoridorState {
  if (s.winner || s.turn !== who) return s
  if (!legalMoves(s, who).some(([mr, mc]) => mr === r && mc === c)) return s
  const pawns = { you: { ...s.pawns.you }, ai: { ...s.pawns.ai } }
  pawns[who] = { r, c }
  const log = push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You' : 'Rival'} moved to ${colLabel(c)}${N - r}.`)
  if (r === goalRow(who)) return finish(s, pawns, who, log)
  return Object.assign({}, s, { pawns, turn: other(who), last: { kind: 'move' as const, who }, log })
}

export function placeWall(s: QuoridorState, w: Wall, who: Who): QuoridorState {
  if (!canPlaceWall(s, w, who)) return s
  const walls = s.walls.concat([w])
  const left = { ...s.left, [who]: s.left[who] - 1 }
  const log = push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You' : 'Rival'} placed a ${w.o === 'h' ? 'horizontal' : 'vertical'} wall (${left[who]} left).`)
  return Object.assign({}, s, { walls, left, turn: other(who), last: { kind: 'wall' as const, who }, log })
}

// ===== AI: BFS-greedy =====
// Walk the AI's own shortest path toward the bottom row. When the AI still has walls and a legal
// wall would lengthen YOUR path more than its own, it sometimes drops the best such wall instead.

function nextStepOnPath(s: QuoridorState, who: Who): [number, number] | null {
  const me = s.pawns[who], goal = goalRow(who)
  const moves = legalMoves(s, who)
  let best: [number, number] | null = null, bestDist = Infinity
  for (const [r, c] of moves) {
    if (r === goal) return [r, c]
    const d = shortestPath(s.walls, { r, c }, goal)
    if (d !== null && d < bestDist) { bestDist = d; best = [r, c] }
  }
  if (best) return best
  return moves.length ? moves[0] : null
}

export function aiMove(s: QuoridorState): QuoridorState {
  if (s.winner || s.turn !== 'ai') return s
  const me: Who = 'ai', you: Who = 'you'
  const myGoal = goalRow(me), yourGoal = goalRow(you)

  const myDist = shortestPath(s.walls, s.pawns[me], myGoal) ?? Infinity
  const yourDist = shortestPath(s.walls, s.pawns[you], yourGoal) ?? Infinity

  // Consider a wall only when the AI has walls left and isn't already clearly ahead.
  if (s.left[me] > 0 && yourDist >= myDist) {
    const candidates = legalWalls(s, me)
    let bestWall: Wall | null = null, bestGain = 0
    for (const w of candidates) {
      const trial = s.walls.concat([w])
      const newYour = shortestPath(trial, s.pawns[you], yourGoal) ?? Infinity
      const newMine = shortestPath(trial, s.pawns[me], myGoal) ?? Infinity
      // maximise the rise in YOUR path while minimally raising the AI's own
      const gain = (newYour - yourDist) - (newMine - myDist)
      if (gain > bestGain) { bestGain = gain; bestWall = w }
    }
    // place the wall only if it meaningfully helps (and at random, to vary play)
    if (bestWall && bestGain >= 2 && Math.random() < 0.6) return placeWall(s, bestWall, me)
  }

  const step = nextStepOnPath(s, me)
  if (!step) {
    // no move available (shouldn't happen) — drop any legal wall to keep play going
    const w = legalWalls(s, me)[0]
    if (w) return placeWall(s, w, me)
    return s
  }
  return move(s, step[0], step[1], me)
}
