/* MANCALA — Kalah rules (6 pits per side, 4 seeds each). Pure logic + alpha-beta AI.
   Built for this codebase. Immutable; no React/DOM.

   Board indexing (counterclockwise sowing order):
     0..5   = YOUR six pits (bottom row, left→right)
     6      = YOUR store (Kalah, right side)
     7..12  = AI's six pits (top row, in sowing order — i.e. right→left as drawn)
     13     = AI's store (Kalah, left side)
   Sowing always moves index + 1 (mod 14), skipping the OPPONENT's store. */

export type Side = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export const YOUR_STORE = 6
export const AI_STORE = 13
export const YOUR_PITS = [0, 1, 2, 3, 4, 5]
export const AI_PITS = [7, 8, 9, 10, 11, 12]

export interface MancalaState {
  pits: number[]            // length 14
  turn: Side | null
  winner: Side | 'draw' | null
  last: number | null       // last pit a seed landed in
  moveCount: number
  log: LogEntry[]
}

const storeOf = (side: Side) => (side === 'you' ? YOUR_STORE : AI_STORE)
const pitsOf = (side: Side) => (side === 'you' ? YOUR_PITS : AI_PITS)
const ownsPit = (side: Side, i: number) =>
  side === 'you' ? i >= 0 && i <= 5 : i >= 7 && i <= 12
// the pit physically opposite a small pit (for captures)
const opposite = (i: number) => 12 - i

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): MancalaState {
  const pits = new Array(14).fill(0)
  for (const i of [...YOUR_PITS, ...AI_PITS]) pits[i] = 4
  return {
    pits, turn: 'you', winner: null, last: null, moveCount: 0,
    log: [{ t: 'sys', x: 'You own the bottom six pits and the right store. Land in your store for an extra turn.' }],
  }
}

export function legalMoves(pits: number[], side: Side): number[] {
  return pitsOf(side).filter(i => pits[i] > 0)
}

/** The display label of a pit for a given side: pits numbered 1..6 from that
    player's left-most reachable small pit. For YOU that's just index+1. */
export function pitLabel(side: Side, i: number): number {
  return side === 'you' ? i + 1 : 13 - i // ai pits 7..12 -> 6..1
}

/** Core sow. Returns the resulting pits, the pit the last seed landed in, the
    side whose turn is next, and a description of what happened. Does NOT detect
    game end — callers handle that. */
interface SowResult { pits: number[]; last: number; extra: boolean; captured: number }
function sow(pits: number[], from: number, side: Side): SowResult {
  const p = pits.slice()
  let seeds = p[from]
  p[from] = 0
  let i = from
  const oppStore = side === 'you' ? AI_STORE : YOUR_STORE
  while (seeds > 0) {
    i = (i + 1) % 14
    if (i === oppStore) continue // never sow into the opponent's store
    p[i]++
    seeds--
  }
  const myStore = storeOf(side)
  const extra = i === myStore
  let captured = 0
  // capture: last seed in an empty pit (now count 1) on YOUR side, opposite has seeds
  if (!extra && ownsPit(side, i) && p[i] === 1) {
    const opp = opposite(i)
    if (p[opp] > 0) {
      captured = p[opp] + 1
      p[myStore] += captured
      p[opp] = 0
      p[i] = 0
    }
  }
  return { pits: p, last: i, extra, captured }
}

function boardEmpty(pits: number[], side: Side): boolean {
  return pitsOf(side).every(i => pits[i] === 0)
}

/** Sweep remaining seeds into each owner's store (game-end), returning new pits. */
function sweep(pits: number[]): number[] {
  const p = pits.slice()
  for (const i of YOUR_PITS) { p[YOUR_STORE] += p[i]; p[i] = 0 }
  for (const i of AI_PITS) { p[AI_STORE] += p[i]; p[i] = 0 }
  return p
}

function finish(s: MancalaState, pits: number[], log: LogEntry[]): MancalaState {
  const swept = sweep(pits)
  const you = swept[YOUR_STORE], ai = swept[AI_STORE]
  const winner: Side | 'draw' = you === ai ? 'draw' : you > ai ? 'you' : 'ai'
  const msg = winner === 'draw'
    ? `An even split — ${you}–${ai}.`
    : `${winner === 'you' ? 'You win' : 'Rival wins'} ${Math.max(you, ai)}–${Math.min(you, ai)}.`
  return Object.assign({}, s, {
    pits: swept, turn: null, winner, last: s.last,
    log: push(log, winner === 'you' ? 'you' : winner === 'ai' ? 'ai' : 'sys', msg),
  })
}

/** Play side's move from pit index `from`. Handles sowing, capture, extra turns,
    and game end. Returns unchanged state if illegal. */
export function move(s: MancalaState, from: number, side: Side): MancalaState {
  if (s.winner || s.turn !== side) return s
  if (!ownsPit(side, from) || s.pits[from] <= 0) return s

  const res = sow(s.pits, from, side)
  const who = side === 'you' ? 'You' : 'Rival'
  const t = side === 'you' ? 'you' : 'ai'
  const label = pitLabel(side, from)
  let log = s.log
  if (res.captured > 0) {
    log = push(log, t, `${who} sowed pit ${label} and captured ${res.captured}.`)
  } else if (res.extra) {
    log = push(log, t, `${who} sowed pit ${label} — extra turn!`)
  } else {
    log = push(log, t, `${who} sowed pit ${label}.`)
  }

  const base = Object.assign({}, s, { pits: res.pits, last: res.last, moveCount: s.moveCount + 1, log })

  // game-end: either side's pits all empty
  if (boardEmpty(res.pits, 'you') || boardEmpty(res.pits, 'ai')) {
    return finish(base, res.pits, log)
  }

  if (res.extra) {
    // same player goes again — but only if they still have a legal move
    if (legalMoves(res.pits, side).length) return Object.assign({}, base, { turn: side })
    // no legal move despite extra turn -> hand over
    return Object.assign({}, base, { turn: side === 'you' ? 'ai' : 'you' })
  }
  return Object.assign({}, base, { turn: side === 'you' ? 'ai' : 'you' })
}

// ===== AI: minimax with alpha-beta, modelling extra turns & captures =====

const ME: Side = 'ai'
const OPP: Side = 'you'

/** Static evaluation from the AI's perspective. */
function evalBoard(pits: number[]): number {
  const storeDiff = pits[AI_STORE] - pits[YOUR_STORE]
  let mySide = 0, oppSide = 0
  for (const i of AI_PITS) mySide += pits[i]
  for (const i of YOUR_PITS) oppSide += pits[i]
  // primary: store lead. secondary: material hoarded on own side (potential to bank).
  return storeDiff * 6 + (mySide - oppSide) * 0.5
}

/** Apply a move for the AI search: returns {pits, side-to-move, terminal}. */
interface Node { pits: number[]; next: Side; terminal: boolean }
function applyMove(pits: number[], from: number, side: Side): Node {
  const res = sow(pits, from, side)
  if (boardEmpty(res.pits, 'you') || boardEmpty(res.pits, 'ai')) {
    return { pits: sweep(res.pits), next: side, terminal: true }
  }
  if (res.extra && legalMoves(res.pits, side).length) {
    return { pits: res.pits, next: side, terminal: false } // extra turn: same player
  }
  return { pits: res.pits, next: side === 'you' ? 'ai' : 'you', terminal: false }
}

function terminalScore(pits: number[]): number {
  // big multiple so winning the game dominates positional eval
  return (pits[AI_STORE] - pits[YOUR_STORE]) * 1000
}

function search(pits: number[], toMove: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(pits, toMove)
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) return terminalScore(sweep(pits))
    return evalBoard(pits)
  }
  if (toMove === ME) {
    let best = -Infinity
    for (const m of moves) {
      const n = applyMove(pits, m, toMove)
      const v = n.terminal ? terminalScore(n.pits) : search(n.pits, n.next, depth - 1, alpha, beta)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      const n = applyMove(pits, m, toMove)
      const v = n.terminal ? terminalScore(n.pits) : search(n.pits, n.next, depth - 1, alpha, beta)
      if (v < best) best = v
      if (best < beta) beta = best
      if (alpha >= beta) break
    }
    return best
  }
}

const DEPTH = 6

export function aiMove(s: MancalaState): MancalaState {
  if (s.winner || s.turn !== ME) return s
  const moves = legalMoves(s.pits, ME)
  if (!moves.length) return s
  let best = -Infinity
  const scored: { m: number; v: number }[] = []
  for (const m of moves) {
    const n = applyMove(s.pits, m, ME)
    const v = n.terminal ? terminalScore(n.pits) : search(n.pits, n.next, DEPTH - 1, -Infinity, Infinity)
    // tiny random tie-break baked into the score
    const jitter = Math.random() * 0.01
    scored.push({ m, v: v + jitter })
    if (v + jitter > best) best = v + jitter
  }
  const top = scored.filter(o => o.v >= best - 1e-9).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return move(s, choice, ME)
}

export function storeCounts(pits: number[]): { you: number; ai: number } {
  return { you: pits[YOUR_STORE], ai: pits[AI_STORE] }
}
