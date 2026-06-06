/* SANTORINI — logic (built for this codebase, base game, no god powers).
   5x5 board. Each cell has a building level 0..4 (0 ground, 1/2/3 tiers, 4 = dome, impassable).
   Each player has 2 workers. You are Azure ('you'); the AI is Terracotta ('ai').
   A turn: pick one of your workers, MOVE to an adjacent empty non-dome cell whose level is at
   most one higher than the worker's current level (step down freely, up by ≤1), THEN that same
   worker BUILDS on an adjacent empty non-dome cell, raising it by 1 (level 3 -> level-4 dome).
   WIN: move a worker onto a level-3 cell. LOSE: a side that cannot make a legal move+build. */

export const N = 5
export type Side = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export interface Worker { side: Side; pos: number }
export interface SantoriniState {
  levels: number[]              // length 25, building level 0..4
  workers: Worker[]             // 4 workers: [you, you, ai, ai] order not guaranteed after play
  turn: Side | null
  you: Side
  winner: Side | null
  last: number | null           // last cell touched (built/moved-to), for highlight
  log: LogEntry[]
}

export const idx = (r: number, c: number) => r * N + c
export const rc = (i: number) => [Math.floor(i / N), i % N] as const
const other = (s: Side): Side => s === 'you' ? 'ai' : 'you'

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function neighbours(i: number): number[] {
  const [r, c] = rc(i)
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < N && nc >= 0 && nc < N) out.push(idx(nr, nc))
  }
  return out
}

// sensible symmetric starting spots (auto-placed): your two then the AI's two.
export function makeGame(): SantoriniState {
  const levels = new Array(N * N).fill(0)
  const workers: Worker[] = [
    { side: 'you', pos: idx(1, 1) },
    { side: 'you', pos: idx(3, 3) },
    { side: 'ai', pos: idx(1, 3) },
    { side: 'ai', pos: idx(3, 1) },
  ]
  return {
    levels, workers, turn: 'you', you: 'you', winner: null, last: null,
    log: [{ t: 'sys', x: 'Workers auto-placed. Move up one level at a time, then build — reach level 3 to win.' }],
  }
}

export function workerAt(s: SantoriniState, i: number): Worker | undefined {
  return s.workers.find(w => w.pos === i)
}
const occupied = (workers: Worker[], i: number) => workers.some(w => w.pos === i)

// indices of your/ai workers (by reference position in array)
export function workerIndices(s: SantoriniState, side: Side): number[] {
  const out: number[] = []
  s.workers.forEach((w, k) => { if (w.side === side) out.push(k) })
  return out
}

// legal MOVE destinations for the worker at array index `wi`
export function legalMoves(s: SantoriniState, wi: number): number[] {
  const w = s.workers[wi]
  if (!w) return []
  const from = w.pos, lvl = s.levels[from]
  const out: number[] = []
  for (const n of neighbours(from)) {
    if (s.levels[n] >= 4) continue              // dome
    if (occupied(s.workers, n)) continue        // someone there
    if (s.levels[n] > lvl + 1) continue         // climb at most +1
    out.push(n)
  }
  return out
}

// legal BUILD cells from a worker standing at `pos`, given workers list (excluding none — the
// mover already sits at pos so its own cell is occupied and won't be offered)
export function legalBuilds(levels: number[], workers: Worker[], pos: number): number[] {
  const out: number[] = []
  for (const n of neighbours(pos)) {
    if (levels[n] >= 4) continue
    if (occupied(workers, n)) continue
    out.push(n)
  }
  return out
}

// Does `side` have any legal move+build available?
export function hasLegalTurn(s: SantoriniState, side: Side): boolean {
  for (const wi of workerIndices(s, side)) {
    const moves = legalMoves(s, wi)
    if (!moves.length) continue
    // a move always wins onto level 3, OR allows a build (a move onto lvl<3 always has a build:
    // the vacated origin is itself a legal build cell). So any move means a legal turn exists.
    return true
  }
  return false
}

const climbWord = (lvl: number) => lvl === 0 ? 'the ground' : `level ${lvl}`

// Apply a full turn (move worker `wi` to `to`, then build at `build`). build may be -1 if the
// move is an immediate win (level-3 landing). Returns new state; ignores illegal input.
export function applyTurn(s: SantoriniState, wi: number, to: number, build: number, side: Side): SantoriniState {
  if (s.winner || s.turn !== side) return s
  const w = s.workers[wi]
  if (!w || w.side !== side) return s
  if (!legalMoves(s, wi).includes(to)) return s

  const workers = s.workers.map((x, k) => k === wi ? { side: x.side, pos: to } : { side: x.side, pos: x.pos })
  const landedLevel = s.levels[to]
  const who = side === s.you ? 'You' : 'The rival'

  // WIN: stepped onto a level-3 cell
  if (landedLevel === 3) {
    const log = push(s.log, side === s.you ? 'you' : 'ai', `${who} climbed onto level 3 — ${side === s.you ? 'you win' : 'rival wins'}!`)
    return Object.assign({}, s, { workers, turn: null, winner: side, last: to, log })
  }

  // BUILD
  const builds = legalBuilds(s.levels, workers, to)
  if (!builds.length) return s            // shouldn't happen (origin is always buildable)
  const b = builds.includes(build) ? build : builds[0]
  const levels = s.levels.slice()
  levels[b] += 1
  const built = levels[b] === 4 ? 'a dome' : `level ${levels[b]}`
  let log = push(s.log, side === s.you ? 'you' : 'ai', `${who} ${landedLevel ? `climbed to ${climbWord(landedLevel)}` : 'stepped'} and built ${built}.`)

  const opp = other(side)
  const next = Object.assign({}, s, { levels, workers, turn: opp, last: b, log })

  // LOSE check: if opponent has no legal turn, current side wins
  if (!hasLegalTurn(next, opp)) {
    log = push(log, opp === s.you ? 'you' : 'ai', `${opp === s.you ? 'You are' : 'The rival is'} trapped — no legal move. ${side === s.you ? 'You win' : 'Rival wins'}!`)
    return Object.assign({}, next, { turn: null, winner: side, log })
  }
  return next
}

// ===== AI: minimax with alpha-beta =====
interface Move { wi: number; to: number; build: number; win: boolean }

function genMoves(s: SantoriniState, side: Side): Move[] {
  const out: Move[] = []
  for (const wi of workerIndices(s, side)) {
    for (const to of legalMoves(s, wi)) {
      if (s.levels[to] === 3) { out.push({ wi, to, build: -1, win: true }); continue }
      const workers = s.workers.map((x, k) => k === wi ? { side: x.side, pos: to } : { side: x.side, pos: x.pos })
      for (const b of legalBuilds(s.levels, workers, to)) out.push({ wi, to, build: b, win: false })
    }
  }
  return out
}

// lightweight apply for search (no logs)
function step(s: SantoriniState, m: Move, side: Side): SantoriniState {
  const workers = s.workers.map((x, k) => k === m.wi ? { side: x.side, pos: m.to } : { side: x.side, pos: x.pos })
  if (m.win) return Object.assign({}, s, { workers, turn: null, winner: side, last: m.to })
  const levels = s.levels.slice(); levels[m.build] += 1
  const opp = other(side)
  const next = Object.assign({}, s, { levels, workers, turn: opp, last: m.build })
  if (!hasLegalTurn(next, opp)) return Object.assign({}, next, { turn: null, winner: side })
  return next
}

const WIN = 100000

// height + reachable potential for one side
function sideScore(s: SantoriniState, side: Side): number {
  let h = 0, reach = 0, mob = 0
  for (const wi of workerIndices(s, side)) {
    const w = s.workers[wi]
    const lvl = s.levels[w.pos]
    h += lvl * lvl * 3                       // standing high is good (quadratic — level 2 >> level 1)
    const moves = legalMoves(s, wi)
    mob += moves.length
    for (const n of moves) {
      if (s.levels[n] === 3) reach += 40     // adjacent to a winning step
      reach += s.levels[n]                   // potential to climb
    }
  }
  return h + reach + mob
}

function evalState(s: SantoriniState, me: Side): number {
  if (s.winner === me) return WIN
  if (s.winner) return -WIN
  return sideScore(s, me) - sideScore(s, other(me))
}

function search(s: SantoriniState, toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  if (s.winner) return s.winner === me ? WIN + depth : -WIN - depth
  if (depth === 0) return evalState(s, me)
  const moves = genMoves(s, toMove)
  if (!moves.length) return toMove === me ? -WIN - depth : WIN + depth   // toMove is trapped -> loses
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(step(s, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(step(s, m, toMove), other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}

export function aiMove(s: SantoriniState): SantoriniState {
  if (s.winner || s.turn !== 'ai') return s
  const me: Side = 'ai'
  const moves = genMoves(s, me)
  if (!moves.length) {
    // trapped — opponent wins
    const log = push(s.log, 'you', 'The rival is trapped — you win!')
    return Object.assign({}, s, { turn: null, winner: 'you', log })
  }
  // always take an immediate win
  const winning = moves.find(m => m.win)
  if (winning) return applyTurn(s, winning.wi, winning.to, winning.build, me)

  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(step(s, m, me), other(me), me, 2, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return applyTurn(s, choice.wi, choice.to, choice.build, me)
}
