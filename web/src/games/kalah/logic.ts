/* KALAH (6, 4) — the standard modern Mancala. Pure, immutable logic plus an
   alpha-beta AI. No React/DOM.

   Board indexing (counterclockwise sowing order, index + 1 each step):
     0..5   = YOUR six pits   (bottom row, drawn left -> right)
     6      = YOUR store / kalah (right side)
     7..12  = AI's six pits    (top row, in sowing order)
     13     = AI's store / kalah (left side)
   Sowing advances (i + 1) % 14, but NEVER drops a seed into the opponent's store. */

export type Side = 'you' | 'ai'
export type Winner = Side | 'draw' | null
export interface LogEntry { t: string; x: string }

export const YOUR_STORE = 6
export const AI_STORE = 13
export const YOUR_PITS = [0, 1, 2, 3, 4, 5]
export const AI_PITS = [7, 8, 9, 10, 11, 12]
export const TOTAL_SEEDS = 48

export interface State {
  pits: number[]        // length 14 — twelve pits + two stores
  turn: Side | null     // whose move; null only at game end
  winner: Winner        // 'you' | 'ai' | 'draw' | null  (string ids — never falsy-0)
  last: number | null   // last pit a seed landed in (for highlighting)
  moveCount: number     // number of sub-moves played (drives the AI tick)
  log: LogEntry[]
}

const storeOf = (side: Side) => (side === 'you' ? YOUR_STORE : AI_STORE)
const oppStoreOf = (side: Side) => (side === 'you' ? AI_STORE : YOUR_STORE)
const pitsOf = (side: Side) => (side === 'you' ? YOUR_PITS : AI_PITS)
const other = (side: Side): Side => (side === 'you' ? 'ai' : 'you')
const ownsPit = (side: Side, i: number) =>
  side === 'you' ? i >= 0 && i <= 5 : i >= 7 && i <= 12
// the small pit physically opposite a small pit (used for captures)
const opposite = (i: number) => 12 - i

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

export function makeGame(): State {
  const pits = new Array(14).fill(0)
  for (const i of [...YOUR_PITS, ...AI_PITS]) pits[i] = 4
  return {
    pits,
    turn: 'you',
    winner: null,
    last: null,
    moveCount: 0,
    log: [{ t: 'sys', x: 'You own the bottom six pits and the store on the right. Land your last seed in your store for an extra turn.' }],
  }
}

/** Indices of the moving side's non-empty pits. */
export function legalMoves(s: State, side: Side = s.turn ?? 'you'): number[] {
  return pitsOf(side).filter(i => s.pits[i] > 0)
}

function legalFor(pits: number[], side: Side): number[] {
  return pitsOf(side).filter(i => pits[i] > 0)
}

/** Display label of a pit for a side: 1..6 from that player's nearest pit.
    For YOU that's index+1; AI pits 7..12 map to 6..1 (drawn right->left). */
export function pitLabel(side: Side, i: number): number {
  return side === 'you' ? i + 1 : 13 - i
}

/* ---- core sow ------------------------------------------------------------ */

interface SowResult { pits: number[]; last: number; extra: boolean; captured: number }

/** Sow the seeds from `from` for `side`. Includes the player's own store,
    skips the opponent's store, then applies the Kalah capture rule. Pure —
    returns fresh arrays; does NOT decide game end (callers do that). */
function sow(pits: number[], from: number, side: Side): SowResult {
  const p = pits.slice()
  let seeds = p[from]
  p[from] = 0
  let i = from
  const skip = oppStoreOf(side)
  while (seeds > 0) {
    i = (i + 1) % 14
    if (i === skip) continue            // never sow into the opponent's store
    p[i]++
    seeds--
  }
  const myStore = storeOf(side)
  const extra = i === myStore
  let captured = 0
  // capture: last seed landed in an empty pit (now holding exactly 1) on YOUR
  // side and the opposite pit has seeds -> grab that seed plus the opposite pile.
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

/** Endgame sweep: each player banks every seed left on their own side. */
function sweep(pits: number[]): number[] {
  const p = pits.slice()
  for (const i of YOUR_PITS) { p[YOUR_STORE] += p[i]; p[i] = 0 }
  for (const i of AI_PITS) { p[AI_STORE] += p[i]; p[i] = 0 }
  return p
}

function finish(s: State, pits: number[], log: LogEntry[], last: number): State {
  const swept = sweep(pits)
  const you = swept[YOUR_STORE], ai = swept[AI_STORE]
  const winner: Winner = you === ai ? 'draw' : you > ai ? 'you' : 'ai'
  const msg =
    winner === 'draw'
      ? `An even split — ${you}–${ai}.`
      : `${winner === 'you' ? 'You win' : 'Rival wins'} ${Math.max(you, ai)}–${Math.min(you, ai)}.`
  return {
    ...s,
    pits: swept,
    turn: null,
    winner,
    last,
    log: push(log, winner === 'you' ? 'you' : winner === 'ai' ? 'ai' : 'sys', msg),
  }
}

/** Play `side`'s move from pit `pit`: sow, capture, extra-turn, and game end.
    Returns the state unchanged if the move is illegal. */
export function applyMove(s: State, pit: number, side: Side = s.turn ?? 'you'): State {
  if (s.winner != null || s.turn !== side) return s
  if (!ownsPit(side, pit) || s.pits[pit] <= 0) return s

  const res = sow(s.pits, pit, side)
  const who = side === 'you' ? 'You' : 'Rival'
  const t = side === 'you' ? 'you' : 'ai'
  const label = pitLabel(side, pit)
  let log = s.log
  if (res.captured > 0) log = push(log, t, `${who} sowed pit ${label} and captured ${res.captured}.`)
  else if (res.extra) log = push(log, t, `${who} sowed pit ${label} — extra turn!`)
  else log = push(log, t, `${who} sowed pit ${label}.`)

  const base: State = { ...s, pits: res.pits, last: res.last, moveCount: s.moveCount + 1, log }

  // game ends the moment either side's pits are all empty
  if (boardEmpty(res.pits, 'you') || boardEmpty(res.pits, 'ai')) {
    return finish(base, res.pits, log, res.last)
  }

  if (res.extra) {
    // same player moves again, provided they still have a legal pit
    if (legalFor(res.pits, side).length > 0) return { ...base, turn: side }
    return { ...base, turn: other(side) }
  }
  return { ...base, turn: other(side) }
}

export function storeCounts(pits: number[]): { you: number; ai: number } {
  return { you: pits[YOUR_STORE], ai: pits[AI_STORE] }
}

export function seedTotal(pits: number[]): number {
  return pits.reduce((a, b) => a + b, 0)
}

/* ===== AI — alpha-beta, modelling extra turns, captures & sweeps =========== */

const ME: Side = 'ai'

/** Static evaluation from the AI's perspective. Store lead dominates; a small
    term rewards seeds hoarded on the AI's own side (closer to banking). */
function evalBoard(pits: number[]): number {
  const storeDiff = pits[AI_STORE] - pits[YOUR_STORE]
  let mySide = 0, oppSide = 0
  for (const i of AI_PITS) mySide += pits[i]
  for (const i of YOUR_PITS) oppSide += pits[i]
  return storeDiff * 6 + (mySide - oppSide) * 0.5
}

function terminalScore(pits: number[]): number {
  // a swept board: store lead, scaled large so winning dominates positional eval
  return (pits[AI_STORE] - pits[YOUR_STORE]) * 1000
}

interface Node { pits: number[]; next: Side; terminal: boolean }
function step(pits: number[], from: number, side: Side): Node {
  const res = sow(pits, from, side)
  if (boardEmpty(res.pits, 'you') || boardEmpty(res.pits, 'ai')) {
    return { pits: sweep(res.pits), next: side, terminal: true }
  }
  if (res.extra && legalFor(res.pits, side).length > 0) {
    return { pits: res.pits, next: side, terminal: false } // extra turn: same player
  }
  return { pits: res.pits, next: other(side), terminal: false }
}

function search(pits: number[], toMove: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalFor(pits, toMove)
  if (moves.length === 0) return terminalScore(sweep(pits))
  if (depth === 0) return evalBoard(pits)

  if (toMove === ME) {
    let best = -Infinity
    for (const m of moves) {
      const n = step(pits, m, toMove)
      const v = n.terminal ? terminalScore(n.pits) : search(n.pits, n.next, depth - 1, alpha, beta)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      const n = step(pits, m, toMove)
      const v = n.terminal ? terminalScore(n.pits) : search(n.pits, n.next, depth - 1, alpha, beta)
      if (v < best) best = v
      if (best < beta) beta = best
      if (alpha >= beta) break
    }
    return best
  }
}

const DEPTH = 6

/** The AI plays ONE sub-move (its turn may continue via extra-turn — call again
    while `turn === 'ai'`). Picks the best root move by alpha-beta search. */
export function aiTurn(s: State): State {
  if (s.winner != null || s.turn !== ME) return s
  const moves = legalFor(s.pits, ME)
  if (moves.length === 0) return s

  let best = -Infinity
  const scored: { m: number; v: number }[] = []
  for (const m of moves) {
    const n = step(s.pits, m, ME)
    const v = n.terminal ? terminalScore(n.pits) : search(n.pits, n.next, DEPTH - 1, -Infinity, Infinity)
    const jitter = Math.random() * 0.01 // break ties without distorting real gaps
    scored.push({ m, v: v + jitter })
    if (v + jitter > best) best = v + jitter
  }
  const top = scored.filter(o => o.v >= best - 1e-9).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return applyMove(s, choice, ME)
}

/** Winner of a state, or null if still in play. */
export function winner(s: State): Winner {
  return s.winner
}
