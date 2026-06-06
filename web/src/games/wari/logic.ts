/* WARI / OWARE — Abapa capture rules. Pure logic + alpha-beta AI.
   Two rows of six pits, four seeds each. No stores during play — captured seeds
   are tracked as a per-player score. Immutable; no React/DOM.

   Board indexing (counterclockwise sowing order, index + 1 mod 12):
     0..5   = YOUR six pits (bottom row, left→right as drawn)
     6..11  = AI's six pits (top row, continuing counterclockwise — i.e. drawn right→left)

   Sowing wraps 0→1→…→11→0. On a full lap (12+ seeds) the ORIGIN pit is skipped.
   Capture: last seed lands in an OPPONENT pit making it 2 or 3 → capture, then walk
   backward in sowing order capturing further opponent pits that are 2 or 3, stopping
   at the first that isn't (or that leaves the opponent's row). Grand-slam (abapa):
   a capture that would take ALL of the opponent's seeds is forbidden — sow, capture
   nothing. Feeding: if the opponent has no seeds you MUST play a move that gives them
   seeds, when one exists. */

export type Side = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export const YOUR_PITS = [0, 1, 2, 3, 4, 5]
export const AI_PITS = [6, 7, 8, 9, 10, 11]

export interface WariState {
  pits: number[]                 // length 12
  captured: { you: number; ai: number }
  turn: Side | null
  winner: Side | 'draw' | null
  last: number | null            // last pit a seed landed in
  capturedPits: number[]         // pits emptied by the most recent capture (for UI flash)
  moveCount: number
  log: LogEntry[]
}

const ownsPit = (side: Side, i: number) =>
  side === 'you' ? i >= 0 && i <= 5 : i >= 6 && i <= 11

const pitsOf = (side: Side) => (side === 'you' ? YOUR_PITS : AI_PITS)
const other = (side: Side): Side => (side === 'you' ? 'ai' : 'you')

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): WariState {
  const pits = new Array(12).fill(4)
  return {
    pits,
    captured: { you: 0, ai: 0 },
    turn: 'you', winner: null, last: null, capturedPits: [],
    moveCount: 0,
    log: [{ t: 'sys', x: 'You own the bottom six pits. Sow counterclockwise; land your last seed in a rival pit making it 2 or 3 to capture.' }],
  }
}

/** The display label of a pit for a side: 1..6 from that player's leftmost pit. */
export function pitLabel(side: Side, i: number): number {
  return side === 'you' ? i + 1 : i - 5 // ai pits 6..11 -> 1..6
}

/* ----- core sow + capture -----
   Returns the post-sow pits, the captured count, the pit list emptied by capture,
   and the index the last seed landed in. Pure: does NOT mutate or detect game end. */
interface SowResult { pits: number[]; captured: number; capturedPits: number[]; last: number }

function rawSow(pits: number[], from: number): { pits: number[]; last: number } {
  const p = pits.slice()
  let seeds = p[from]
  p[from] = 0
  let i = from
  while (seeds > 0) {
    i = (i + 1) % 12
    if (i === from) continue // skip origin pit on a full lap (12+ seeds)
    p[i]++
    seeds--
  }
  return { pits: p, last: i }
}

/** Capture chain from `last` walking backward in sowing order. Returns the captured
    total and the list of pits emptied. Does NOT apply grand-slam guard. */
function captureChain(p: number[], last: number, side: Side): { total: number; pits: number[] } {
  const opp = other(side)
  let total = 0
  const emptied: number[] = []
  let i = last
  while (ownsPit(opp, i) && (p[i] === 2 || p[i] === 3)) {
    total += p[i]
    emptied.push(i)
    i = (i + 11) % 12 // previous pit in sowing order
  }
  return { total, pits: emptied }
}

function sideSeeds(pits: number[], side: Side): number {
  let n = 0
  for (const i of pitsOf(side)) n += pits[i]
  return n
}

function sow(pits: number[], from: number, side: Side): SowResult {
  const { pits: p, last } = rawSow(pits, from)
  const chain = captureChain(p, last, side)
  // Grand-slam (abapa): a capture taking ALL the opponent's seeds is forbidden.
  if (chain.total > 0 && chain.total < sideSeeds(p, other(side))) {
    for (const idx of chain.pits) p[idx] = 0
    return { pits: p, captured: chain.total, capturedPits: chain.pits, last }
  }
  return { pits: p, captured: 0, capturedPits: [], last }
}

/** True if playing `from` for `side` would deliver at least one seed into the
    opponent's row (used for the feeding rule). */
function feeds(pits: number[], from: number, side: Side): boolean {
  const { pits: p } = rawSow(pits, from)
  return sideSeeds(p, other(side)) > 0
}

/** Legal moves for `side`. Non-empty pits, plus the feeding restriction: if the
    opponent has no seeds, only moves that feed them are legal (when any exist). */
export function legalMoves(pits: number[], side: Side): number[] {
  let moves = pitsOf(side).filter(i => pits[i] > 0)
  if (sideSeeds(pits, other(side)) === 0) {
    const feeding = moves.filter(i => feeds(pits, i, side))
    if (feeding.length) moves = feeding
  }
  return moves
}

/** Sweep remaining seeds to whoever still has seeds (game-end / stalemate). When a
    player can't move, the other player collects all the seeds left on the board. */
function sweep(pits: number[], captured: { you: number; ai: number }) {
  const cap = { you: captured.you, ai: captured.ai }
  const yourSeeds = sideSeeds(pits, 'you')
  const aiSeeds = sideSeeds(pits, 'ai')
  cap.you += yourSeeds
  cap.ai += aiSeeds
  const swept = pits.slice().fill(0)
  return { pits: swept, captured: cap }
}

function decide(captured: { you: number; ai: number }): Side | 'draw' {
  if (captured.you === captured.ai) return 'draw'
  return captured.you > captured.ai ? 'you' : 'ai'
}

function finish(s: WariState, pits: number[], captured: { you: number; ai: number }, log: LogEntry[]): WariState {
  const sw = sweep(pits, captured)
  const winner = decide(sw.captured)
  const { you, ai } = sw.captured
  const msg = winner === 'draw'
    ? `An even split — ${you}–${ai}.`
    : `${winner === 'you' ? 'You win' : 'Rival wins'} ${Math.max(you, ai)}–${Math.min(you, ai)}.`
  return Object.assign({}, s, {
    pits: sw.pits, captured: sw.captured, turn: null, winner, capturedPits: [],
    log: push(log, winner === 'you' ? 'you' : winner === 'ai' ? 'ai' : 'sys', msg),
  })
}

/** Play side's move from pit `from`. Returns unchanged state if illegal. */
export function applyMove(s: WariState, from: number, side?: Side): WariState {
  const who: Side | null = side ?? s.turn
  if (who == null || s.winner != null || s.turn !== who) return s
  const legal = legalMoves(s.pits, who)
  if (!legal.includes(from)) return s

  const res = sow(s.pits, from, who)
  const captured = {
    you: s.captured.you + (who === 'you' ? res.captured : 0),
    ai: s.captured.ai + (who === 'ai' ? res.captured : 0),
  }
  const label = pitLabel(who, from)
  const tag = who === 'you' ? 'you' : 'ai'
  const name = who === 'you' ? 'You' : 'Rival'
  let log = res.captured > 0
    ? push(s.log, tag, `${name} sowed pit ${label} and captured ${res.captured}.`)
    : push(s.log, tag, `${name} sowed pit ${label}.`)

  const base = Object.assign({}, s, {
    pits: res.pits, captured, last: res.last, capturedPits: res.capturedPits,
    moveCount: s.moveCount + 1, log,
  })

  // Game ends if total captured reaches a majority, or the next player can't move.
  const next = other(who)
  if (captured.you >= 25 || captured.ai >= 25) {
    return finish(base, res.pits, captured, log)
  }
  if (legalMoves(res.pits, next).length === 0) {
    return finish(base, res.pits, captured, log)
  }
  return Object.assign({}, base, { turn: next })
}

// ===== AI: minimax with alpha-beta =====

const ME: Side = 'ai'

/** Static evaluation from the AI's perspective (captured = ME - YOU plus position). */
function evalBoard(pits: number[], captured: { you: number; ai: number }): number {
  let score = (captured.ai - captured.you) * 10
  // Positional: hoard seeds on your right (pits 11,10 for AI — far end of own row,
  // hardest for the opponent to reach), and prefer the opponent's pits be sparse
  // (2/3 seeds = capturable threats). AI pits are 6..11; "right" = high index.
  let aiSeeds = 0, youSeeds = 0
  for (let k = 0; k < 6; k++) {
    aiSeeds += pits[6 + k] * (1 + k * 0.15) // weight toward high-index (right) pits
    youSeeds += pits[k]
  }
  score += (aiSeeds - youSeeds) * 0.5
  // reward keeping opponent pits vulnerable (==1 or 2, on the edge of capture)
  let vuln = 0
  for (const i of YOUR_PITS) if (pits[i] === 1 || pits[i] === 2) vuln++
  score += vuln * 0.3
  return score
}

interface Node { pits: number[]; captured: { you: number; ai: number }; next: Side; terminal: boolean }
function aiApply(pits: number[], captured: { you: number; ai: number }, from: number, side: Side): Node {
  const res = sow(pits, from, side)
  const cap = {
    you: captured.you + (side === 'you' ? res.captured : 0),
    ai: captured.ai + (side === 'ai' ? res.captured : 0),
  }
  const next = other(side)
  if (cap.you >= 25 || cap.ai >= 25 || legalMoves(res.pits, next).length === 0) {
    const sw = sweep(res.pits, cap)
    return { pits: sw.pits, captured: sw.captured, next, terminal: true }
  }
  return { pits: res.pits, captured: cap, next, terminal: false }
}

function terminalScore(captured: { you: number; ai: number }): number {
  return (captured.ai - captured.you) * 1000
}

function search(
  pits: number[], captured: { you: number; ai: number }, toMove: Side,
  depth: number, alpha: number, beta: number,
): number {
  const moves = legalMoves(pits, toMove)
  if (moves.length === 0) {
    const sw = sweep(pits, captured)
    return terminalScore(sw.captured)
  }
  if (depth === 0) return evalBoard(pits, captured)
  if (toMove === ME) {
    let best = -Infinity
    for (const m of moves) {
      const n = aiApply(pits, captured, m, toMove)
      const v = n.terminal ? terminalScore(n.captured) : search(n.pits, n.captured, n.next, depth - 1, alpha, beta)
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      const n = aiApply(pits, captured, m, toMove)
      const v = n.terminal ? terminalScore(n.captured) : search(n.pits, n.captured, n.next, depth - 1, alpha, beta)
      if (v < best) best = v
      if (best < beta) beta = best
      if (alpha >= beta) break
    }
    return best
  }
}

const DEPTH = 7

/** Choose and play the AI's move. */
export function aiTurn(s: WariState): WariState {
  if (s.winner != null || s.turn !== ME) return s
  const moves = legalMoves(s.pits, ME)
  if (!moves.length) return s
  let best = -Infinity
  const scored: { m: number; v: number }[] = []
  for (const m of moves) {
    const n = aiApply(s.pits, s.captured, m, ME)
    const v = n.terminal ? terminalScore(n.captured) : search(n.pits, n.captured, n.next, DEPTH - 1, -Infinity, Infinity)
    const jitter = Math.random() * 0.01
    scored.push({ m, v: v + jitter })
    if (v + jitter > best) best = v + jitter
  }
  const top = scored.filter(o => o.v >= best - 1e-9).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return applyMove(s, choice, ME)
}

/** Convenience for the UI / tests: current winner ('you'|'ai'|'draw'|null). */
export function winner(s: WariState): Side | 'draw' | null {
  return s.winner
}

export function capturedCounts(s: WariState): { you: number; ai: number } {
  return { you: s.captured.you, ai: s.captured.ai }
}
