/* FOX AND HOUNDS — logic (built for this codebase, not ported).
   Played on the 32 dark squares of an 8x8 board (dark = (r+c) odd). Four HOUNDS start on the
   dark squares of the top back row (row 0); the FOX starts on a dark square of the bottom back
   row (row 7). Pieces step one square diagonally to an adjacent empty dark square — no captures,
   no jumps. HOUNDS may only move FORWARD (toward the fox's home, increasing row); the FOX may
   move in ANY of the four diagonal directions. You are the FOX; the AI drives the four hounds.

   FOX WINS if it reaches row 0 (breaks past the hound line) or if the hounds have no legal move.
   HOUNDS WIN if the fox is trapped with no legal move. With perfect play the hounds win, so the
   AI (minimax + alpha-beta) is a tough-but-fair wall; the fox must punish hound mistakes. */

export const N = 8
export type Side = 'fox' | 'hound'
export interface LogEntry { t: string; x: string }

export interface FHState {
  fox: number              // index 0..63 of the fox
  hounds: number[]         // four indices of the hounds
  turn: Side | null        // whose move (null when game over)
  you: Side                // always 'fox'
  winner: Side | null
  last: number | null      // square just moved to (for highlight)
  log: LogEntry[]
}

export const idx = (r: number, c: number) => r * N + c
export const rowOf = (i: number) => Math.floor(i / N)
export const colOf = (i: number) => i % N
export const isDark = (i: number) => ((rowOf(i) + colOf(i)) & 1) === 1

// diagonal offsets as [dr, dc]
const FOX_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]]   // any diagonal
const HOUND_DIRS = [[1, -1], [1, 1]]                    // forward only (toward row 7)

const HOUND_HOME = 0   // row the fox must reach to break through
const FOX_HOME = N - 1 // hounds advance toward this row

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

const FILES = 'ABCDEFGH'
const sq = (i: number) => FILES[colOf(i)] + (N - rowOf(i)) // checkerboard-ish a-h, 8..1

export function makeGame(): FHState {
  // four hounds on the dark squares of row 0: cols 1,3,5,7
  const hounds = [idx(0, 1), idx(0, 3), idx(0, 5), idx(0, 7)]
  // fox on a dark square of the far back row (row 7): pick col 6 (a standard central-ish start)
  const fox = idx(7, 6)
  return {
    fox, hounds, turn: 'fox', you: 'fox', winner: null, last: null,
    log: [{ t: 'sys', x: 'You are the fox. Slip past the four hounds to the top row — they may only advance.' }],
  }
}

function occupied(s: { fox: number; hounds: number[] }): Set<number> {
  return new Set<number>([s.fox, ...s.hounds])
}

// Legal destination squares for the fox, given an occupancy set.
export function foxMoves(fox: number, occ: Set<number>): number[] {
  const r = rowOf(fox), c = colOf(fox), out: number[] = []
  for (const [dr, dc] of FOX_DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    const t = idx(nr, nc)
    if (!occ.has(t)) out.push(t) // already a dark square (diagonal of a dark square is dark)
  }
  return out
}

// Legal destination squares for a single hound at `h` (forward diagonals only).
export function houndMoves(h: number, occ: Set<number>): number[] {
  const r = rowOf(h), c = colOf(h), out: number[] = []
  for (const [dr, dc] of HOUND_DIRS) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue
    const t = idx(nr, nc)
    if (!occ.has(t)) out.push(t)
  }
  return out
}

// All hound (fromIndex, to) moves available to the AI.
export function houndAllMoves(s: { fox: number; hounds: number[] }): { hi: number; to: number }[] {
  const occ = occupied(s), out: { hi: number; to: number }[] = []
  for (let hi = 0; hi < s.hounds.length; hi++) {
    for (const to of houndMoves(s.hounds[hi], occ)) out.push({ hi, to })
  }
  return out
}

/** Unified helper for the UI/tests: legal destination squares for `who`. */
export function legalMoves(s: { fox: number; hounds: number[] }, who: Side): number[] {
  const occ = occupied(s)
  if (who === 'fox') return foxMoves(s.fox, occ)
  const out: number[] = []
  for (const h of s.hounds) for (const to of houndMoves(h, occ)) out.push(to)
  return out
}

function houndsStuck(s: { fox: number; hounds: number[] }): boolean {
  return houndAllMoves(s).length === 0
}

// ===== Move application =====

export function moveFox(s: FHState, to: number): FHState {
  if (s.winner || s.turn !== 'fox') return s
  const occ = occupied(s)
  if (!foxMoves(s.fox, occ).includes(to)) return s
  let log = push(s.log, 'you', `You darted to ${sq(to)}.`)
  const ns: FHState = Object.assign({}, s, { fox: to, last: to, log, turn: 'hound' as Side })
  // fox break-through win
  if (rowOf(to) === HOUND_HOME) {
    return Object.assign({}, ns, { winner: 'fox' as Side, turn: null, log: push(log, 'you', 'You broke through the line — Fox wins!') })
  }
  // hounds with no move => fox wins
  if (houndsStuck(ns)) {
    return Object.assign({}, ns, { winner: 'fox' as Side, turn: null, log: push(log, 'you', 'The hounds are jammed with nowhere to go — Fox wins!') })
  }
  return ns
}

export function moveHound(s: FHState, hi: number, to: number): FHState {
  if (s.winner || s.turn !== 'hound') return s
  const occ = occupied(s)
  if (!houndMoves(s.hounds[hi], occ).includes(to)) return s
  const hounds = s.hounds.slice(); hounds[hi] = to
  let log = push(s.log, 'ai', `A hound advanced to ${sq(to)}.`)
  const ns: FHState = Object.assign({}, s, { hounds, last: to, log, turn: 'fox' as Side })
  // fox trapped => hounds win
  if (foxMoves(ns.fox, occupied(ns)).length === 0) {
    return Object.assign({}, ns, { winner: 'hound' as Side, turn: null, log: push(log, 'ai', 'The fox is cornered with no escape — Rival wins.') })
  }
  return ns
}

// ===== AI: minimax + alpha-beta. The hounds (maximizing player) want to trap the fox:
// keep an advancing unbroken wall and starve the fox of squares + forward progress.
// Score is from the HOUNDS' perspective (higher = better for hounds). =====

const WIN = 1e6

function evalState(s: { fox: number; hounds: number[] }): number {
  // fox distance from breaking through (row 0): bigger = better for hounds.
  const foxRow = rowOf(s.fox)
  const distFromBreak = foxRow - HOUND_HOME            // 0..7, want large
  // hound advancement toward the fox's home (row 7): the further forward, the tighter the net.
  let houndAdvance = 0
  for (const h of s.hounds) houndAdvance += rowOf(h)
  // line integrity: reward hounds occupying every-other column on a shared-ish rank so the fox
  // can't slip between them. Penalise hounds bunched on the same row gaps / lagging behind.
  const rows = s.hounds.map(rowOf)
  const spread = Math.max(...rows) - Math.min(...rows) // smaller = tidier wall
  // fox mobility: fewer fox squares = better for hounds.
  const occ = occupied(s)
  const foxMob = foxMoves(s.fox, occ).length
  // hounds want the fox behind their frontmost hound (contained).
  const frontHound = Math.max(...rows)
  const contained = foxRow >= frontHound ? 6 : 0
  return distFromBreak * 10 + houndAdvance * 4 - spread * 3 - foxMob * 5 + contained
}

// returns score from hounds' perspective; toMove indicates side to move.
function search(state: { fox: number; hounds: number[] }, toMove: Side, depth: number, alpha: number, beta: number): number {
  // terminal checks
  if (rowOf(state.fox) === HOUND_HOME) return -WIN              // fox already broke through
  const occ = occupied(state)
  const fMoves = foxMoves(state.fox, occ)
  if (toMove === 'fox' && fMoves.length === 0) return WIN       // fox trapped -> hounds win
  const hMoves = houndAllMoves(state)
  if (toMove === 'hound' && hMoves.length === 0) return -WIN    // hounds stuck -> fox wins
  if (depth === 0) return evalState(state)

  if (toMove === 'hound') {
    let best = -Infinity
    for (const { hi, to } of hMoves) {
      const nh = state.hounds.slice(); nh[hi] = to
      const v = search({ fox: state.fox, hounds: nh }, 'fox', depth - 1, alpha, beta)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const to of fMoves) {
      const v = search({ fox: to, hounds: state.hounds }, 'hound', depth - 1, alpha, beta)
      if (v < best) best = v
      if (best < beta) beta = best
      if (alpha >= beta) break
    }
    return best
  }
}

const AI_DEPTH = 5

export function aiMove(s: FHState): FHState {
  if (s.winner || s.turn !== 'hound') return s
  const moves = houndAllMoves(s)
  if (!moves.length) return s
  let best = -Infinity
  const scored: { hi: number; to: number; v: number }[] = []
  for (const { hi, to } of moves) {
    const nh = s.hounds.slice(); nh[hi] = to
    const v = search({ fox: s.fox, hounds: nh }, 'fox', AI_DEPTH - 1, -Infinity, Infinity)
    scored.push({ hi, to, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6)
  const choice = top[(Math.random() * top.length) | 0]
  return moveHound(s, choice.hi, choice.to)
}
