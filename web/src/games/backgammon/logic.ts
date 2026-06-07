/* BACKGAMMON — logic (built for this codebase, not ported). Standard 24-point board,
   a bar and two bear-off trays, NO doubling cube. You are WHITE, the AI is BLACK.

   Orientation (fixed): points are indexed 0..23.
     - WHITE moves DOWNWARD in index: from a high point to a lower one (point − die).
       White's home board is points 0..5; White bears off past index 0 (off = −1).
     - BLACK moves UPWARD in index: from a low point to a higher one (point + die).
       Black's home board is points 18..23; Black bears off past index 23 (off = 24).
   Standard start (mirrored for the two directions):
     White: 2 on 23, 5 on 12, 3 on 7, 5 on 5.
     Black: 2 on 0,  5 on 11, 3 on 16, 5 on 18.
   The bar holds hit checkers; a player with checkers on the bar must re-enter them into
   the opponent's home board before any other move. White re-enters on points 18..23
   (entry point 24 − die), Black on points 0..5 (entry point die − 1).
   First to bear off all 15 wins. You must use as many dice as legally possible. */

export type Side = 'w' | 'b'
export interface LogEntry { t: string; x: string }

export interface BackgammonState {
  points: number[]          // length 24; >0 = that many White, <0 = that many Black
  barW: number; barB: number
  offW: number; offB: number
  turn: Side | null
  you: Side                 // always 'w'
  dice: number[]            // the two rolled values (or 4 copies on doubles)
  remaining: number[]       // dice values still unused this turn
  rolled: boolean           // has the side-to-move rolled yet?
  winner: Side | null
  last: number | null       // last destination point touched (for highlight); -1/24 = a bear-off
  log: LogEntry[]
}

export const other = (s: Side): Side => (s === 'w' ? 'b' : 'w')
const push = (log: LogEntry[], t: string, x: string) => log.concat([{ t, x }]).slice(-24)
const BAR = -2               // sentinel "from" value meaning "the bar"
export const BAR_FROM = BAR

export function makeGame(): BackgammonState {
  const points = new Array(24).fill(0)
  points[23] = 2; points[12] = 5; points[7] = 3; points[5] = 5         // White (+)
  points[0] = -2; points[11] = -5; points[16] = -3; points[18] = -5    // Black (−)
  return {
    points, barW: 0, barB: 0, offW: 0, offB: 0,
    turn: 'w', you: 'w', dice: [], remaining: [], rolled: false, winner: null, last: null,
    log: [{ t: 'sys', x: 'You are White, moving down toward home (points 1–6). Roll, then move your checkers by the dice.' }],
  }
}

// ----- helpers on a raw board (points/bars), side-relative -----
const barOf = (st: { barW: number; barB: number }, side: Side) => (side === 'w' ? st.barW : st.barB)
const homeRange = (side: Side) => (side === 'w' ? [0, 5] : [18, 23]) as [number, number]
const dir = (side: Side) => (side === 'w' ? -1 : 1)      // index delta sign per pip
const OFF = (side: Side) => (side === 'w' ? -1 : 24)     // "destination" index for a bear-off

// count of a side's checkers on a point (0 if it's the other side or empty)
function own(points: number[], i: number, side: Side): number {
  const v = points[i]
  return side === 'w' ? Math.max(0, v) : Math.max(0, -v)
}
function enemy(points: number[], i: number, side: Side): number {
  const v = points[i]
  return side === 'w' ? Math.max(0, -v) : Math.max(0, v)
}

export function pipCount(st: BackgammonState, side: Side): number {
  let pip = 0
  for (let i = 0; i < 24; i++) {
    const n = own(st.points, i, side)
    if (!n) continue
    // distance to bear off: White point i needs (i+1) pips; Black point i needs (24−i)
    pip += n * (side === 'w' ? i + 1 : 24 - i)
  }
  pip += barOf(st, side) * 25   // a checker on the bar is 25 pips from home
  return pip
}

function allHome(st: BackgammonState, side: Side): boolean {
  if (barOf(st, side) > 0) return false
  const [lo, hi] = homeRange(side)
  for (let i = 0; i < 24; i++) {
    if (i >= lo && i <= hi) continue
    if (own(st.points, i, side) > 0) return false
  }
  return true
}

export interface Move { from: number; to: number; die: number; hit: boolean }

// Can `side` legally play `die` from point `from` (or the bar)? Returns the Move or null.
function tryMove(st: BackgammonState, side: Side, from: number, die: number): Move | null {
  const d = dir(side)
  // must enter from the bar first
  if (barOf(st, side) > 0) {
    if (from !== BAR) return null
    const entry = side === 'w' ? 24 - die : die - 1   // into opponent home board
    if (entry < 0 || entry > 23) return null
    if (enemy(st.points, entry, side) >= 2) return null
    return { from: BAR, to: entry, die, hit: enemy(st.points, entry, side) === 1 }
  }
  if (from === BAR) return null
  if (own(st.points, from, side) <= 0) return null
  const to = from + d * die
  // bearing off (the move ran off the board edge)
  if (to < 0 || to > 23) {
    if (!allHome(st, side)) return null
    const [lo, hi] = homeRange(side)
    const edgeDist = side === 'w' ? from + 1 : 24 - from   // pips this checker needs to come off
    // exact bear-off: die matches the distance to the edge
    if (die === edgeDist) return { from, to: OFF(side), die, hit: false }
    // overshoot: a larger die may bear off only if no checker sits farther from the edge
    if (die > edgeDist) {
      let higher = false
      for (let i = lo; i <= hi; i++) {
        const farther = side === 'w' ? i > from : i < from
        if (farther && own(st.points, i, side) > 0) { higher = true; break }
      }
      if (!higher) return { from, to: OFF(side), die, hit: false }
    }
    return null
  }
  if (enemy(st.points, to, side) >= 2) return null
  return { from, to, die, hit: enemy(st.points, to, side) === 1 }
}

// All legal single moves for `side` with the current remaining dice.
export function legalMoves(st: BackgammonState, side: Side): Move[] {
  const out: Move[] = []
  const seen = new Set<string>()
  const dice = Array.from(new Set(st.remaining))
  const onBar = barOf(st, side) > 0
  for (const die of dice) {
    if (onBar) {
      const m = tryMove(st, side, BAR, die)
      if (m) { const k = `${m.from}>${m.to}:${die}`; if (!seen.has(k)) { seen.add(k); out.push(m) } }
      continue
    }
    for (let from = 0; from < 24; from++) {
      if (own(st.points, from, side) <= 0) continue
      const m = tryMove(st, side, from, die)
      if (m) { const k = `${m.from}>${m.to}:${die}`; if (!seen.has(k)) { seen.add(k); out.push(m) } }
    }
  }
  return out
}

// Apply a single move to a fresh state (does not change turn/remaining bookkeeping logs).
function applyMove(st: BackgammonState, side: Side, m: Move): BackgammonState {
  const points = st.points.slice()
  let { barW, barB, offW, offB } = st
  const inc = side === 'w' ? 1 : -1
  // remove from source
  if (m.from === BAR) { if (side === 'w') barW--; else barB--; }
  else points[m.from] -= inc
  // bear off?
  if (m.to === OFF(side)) { if (side === 'w') offW++; else offB++; }
  else {
    if (m.hit) {
      // send the single enemy checker to the bar
      points[m.to] = 0
      if (side === 'w') barB++; else barW++;
    }
    points[m.to] += inc
  }
  return Object.assign({}, st, { points, barW, barB, offW, offB })
}

// Remove one used die value from `remaining`.
function consume(remaining: number[], die: number): number[] {
  const r = remaining.slice()
  const i = r.indexOf(die)
  if (i >= 0) r.splice(i, 1)
  return r
}

// ----- "must use as many dice as possible" enforcement -----
// Max number of dice that can be played from a given board+remaining for `side`.
function maxPlayable(st: BackgammonState, side: Side, remaining: number[], depth = 0): number {
  if (!remaining.length || depth > 4) return 0
  const probe = Object.assign({}, st, { remaining })
  const moves = legalMoves(probe, side)
  if (!moves.length) return 0
  let best = 0
  for (const m of moves) {
    const ns = applyMove(probe, side, m)
    const nr = consume(remaining, m.die)
    best = Math.max(best, 1 + maxPlayable(ns, side, nr, depth + 1))
    if (best === remaining.length) break
  }
  return best
}

// Legal moves filtered so they don't strand a larger play (standard "use both dice" rule).
export function usableMoves(st: BackgammonState, side: Side): Move[] {
  const all = legalMoves(st, side)
  if (!all.length) return all
  const cap = maxPlayable(st, side, st.remaining)
  if (cap <= 1) {
    // when only one die can be played, and both single dice are individually playable but
    // not together, the larger die must be used if possible.
    if (cap === 1 && st.remaining.length >= 2 && !isDoubles(st)) {
      const big = Math.max(...st.remaining)
      const bigMoves = all.filter(m => m.die === big)
      // only force the big die if playing it still leaves a legal position (it always counts as 1)
      if (bigMoves.length) {
        // ensure choosing big doesn't reduce total below cap (cap is 1, big plays 1) -> ok
        const bigUsable = bigMoves.filter(m => maxPlayable(applyMove(st, side, m), side, consume(st.remaining, m.die)) >= cap - 1)
        if (bigUsable.length) return bigUsable
      }
    }
    return all
  }
  // keep only moves that preserve the ability to reach the max count
  return all.filter(m => 1 + maxPlayable(applyMove(st, side, m), side, consume(st.remaining, m.die)) >= cap)
}

function isDoubles(st: BackgammonState): boolean {
  return st.dice.length === 4
}

// ----- turn flow -----
export function roll(st: BackgammonState, side: Side): BackgammonState {
  if (st.winner || st.turn !== side || st.rolled) return st
  const a = 1 + ((Math.random() * 6) | 0)
  const b = 1 + ((Math.random() * 6) | 0)
  const dice = a === b ? [a, a, a, a] : [a, b]
  let s = Object.assign({}, st, { dice, remaining: dice.slice(), rolled: true })
  const who = side === st.you ? 'You' : 'Rival'
  s = Object.assign({}, s, { log: push(s.log, side === st.you ? 'you' : 'ai', `${who} rolled ${a} & ${b}${a === b ? ' — doubles!' : ''}.`) })
  // no legal move at all → forfeit the turn
  if (!legalMoves(s, side).length) {
    s = Object.assign({}, s, { log: push(s.log, 'sys', `${who === 'You' ? 'You have' : 'Rival has'} no legal move — turn forfeited.`) })
    return endTurn(s, side)
  }
  return s
}

function checkWin(st: BackgammonState, side: Side): BackgammonState {
  const off = side === 'w' ? st.offW : st.offB
  if (off >= 15) {
    const youWon = side === st.you
    return Object.assign({}, st, {
      turn: null, winner: side,
      log: push(st.log, youWon ? 'you' : 'ai', youWon ? 'You bore off all 15 — you win!' : 'Rival bore off all 15 — rival wins.'),
    })
  }
  return st
}

function endTurn(st: BackgammonState, side: Side): BackgammonState {
  const won = checkWin(st, side)
  if (won.winner) return won
  const next = other(side)
  return Object.assign({}, st, { turn: next, rolled: false, dice: [], remaining: [], last: null })
}

// Play one move (human or programmatic). `from` may be BAR_FROM.
export function move(st: BackgammonState, side: Side, from: number, die: number): BackgammonState {
  if (st.winner || st.turn !== side || !st.rolled) return st
  // validate against usable set
  const usable = usableMoves(st, side)
  const m = usable.find(x => x.from === from && x.die === die)
    || usable.find(x => x.from === from && (from + dir(side) * die) === x.to) // tolerate die match by dest
  if (!m) return st
  let s = applyMove(st, side, m)
  const who = side === st.you ? 'You' : 'Rival'
  const fromTxt = m.from === BAR ? 'bar' : `${ptName(m.from)}`
  const toTxt = m.to === OFF(side) ? 'off' : `${ptName(m.to)}`
  let log = push(s.log, side === st.you ? 'you' : 'ai', `${who} moved ${fromTxt}→${toTxt}${m.hit ? ' (hit!)' : ''}.`)
  if (m.hit) log = push(log, 'sys', `A ${side === st.you ? 'rival' : 'your'} blot was sent to the bar.`)
  const remaining = consume(s.remaining, m.die)
  const last = m.to === OFF(side) ? OFF(side) : m.to
  s = Object.assign({}, s, { remaining, log, last })
  // win mid-turn?
  const w = checkWin(s, side)
  if (w.winner) return w
  // no dice left, or no more legal moves → end turn
  if (!remaining.length || !legalMoves(s, side).length) return endTurn(s, side)
  return s
}

function ptName(i: number): string {
  // human-facing point number: White sees its home as 1..6 (index+1); Black as 24..19.
  return `${i + 1}`
}

// ===== AI: 1-ply greedy best move-sequence by a heuristic eval =====
// Enumerate full sequences for the remaining dice, score the resulting board, pick the best.
interface Seq { moves: Move[]; result: BackgammonState }

function enumerateSequences(st: BackgammonState, side: Side): Seq[] {
  const out: Seq[] = []
  function rec(cur: BackgammonState, acc: Move[]) {
    // usableMoves already filters to moves that don't strand a larger play and enforces the
    // "must use the larger die" rule — so the FIRST move of every branch is always playable
    // through move(), which is what aiStep relies on.
    const moves = acc.length === 0 ? usableMoves(cur, side) : legalMoves(cur, side)
    if (!moves.length || acc.length >= 4) {
      if (acc.length) out.push({ moves: acc, result: cur })
      return
    }
    const cap = maxPlayable(cur, side, cur.remaining)
    let advanced = false
    for (const m of moves) {
      const ns = applyMove(cur, side, m)
      const nr = consume(cur.remaining, m.die)
      const ns2 = Object.assign({}, ns, { remaining: nr })
      if (1 + maxPlayable(ns2, side, nr) >= cap) {
        advanced = true
        rec(ns2, acc.concat([m]))
      }
    }
    if (!advanced && acc.length) out.push({ moves: acc, result: cur })
  }
  rec(Object.assign({}, st), [])
  // de-dupe by resulting board signature, keep the one with most dice used
  const bySig = new Map<string, Seq>()
  for (const s of out) {
    const sig = boardSig(s.result)
    const prev = bySig.get(sig)
    if (!prev || s.moves.length > prev.moves.length) bySig.set(sig, s)
  }
  return Array.from(bySig.values())
}

function boardSig(st: BackgammonState): string {
  return st.points.join(',') + `|${st.barW},${st.barB},${st.offW},${st.offB}`
}

// Heuristic evaluation from `side`'s perspective (higher = better for `side`).
export function evaluate(st: BackgammonState, side: Side): number {
  const opp = other(side)
  let score = 0
  // race: lower pip is better
  score += (pipCount(st, opp) - pipCount(st, side)) * 1.0
  // borne off
  score += (side === 'w' ? st.offW : st.offB) * 18
  score -= (side === 'w' ? st.offB : st.offW) * 18
  // on the bar is very bad
  score -= barOf(st, side) * 28
  score += barOf(st, opp) * 16
  // points made (2+ own) build blocks; blots are exposed
  for (let i = 0; i < 24; i++) {
    const mine = own(st.points, i, side)
    if (mine >= 2) score += 6
    if (mine === 1) {
      // blot — penalize, weighted by how reachable it is by the opponent (closer = worse)
      const dist = blotDanger(st, i, side, opp)
      score -= dist
    }
    // home-board points made are extra valuable (priming/anchoring)
    const [lo, hi] = homeRange(side)
    if (mine >= 2 && i >= lo && i <= hi) score += 4
  }
  return score
}

// Rough hit-probability weight for a blot at point `i` owned by `side`.
function blotDanger(st: BackgammonState, i: number, side: Side, opp: Side): number {
  let danger = 4
  const d = dir(opp)
  // an opponent checker exactly 1..6 away (in its travel direction) can hit with a single die
  for (let pips = 1; pips <= 6; pips++) {
    const from = i - d * pips   // opponent at `from` moving +d*pips lands on i
    if (from < 0 || from > 23) continue
    if (own(st.points, from, opp) > 0) danger += 11 - pips   // nearer = more numerous die combos
  }
  return danger
}

// Pick the best full sequence for `side` and return the list of single moves to play.
export function planTurn(st: BackgammonState, side: Side): Move[] {
  const seqs = enumerateSequences(st, side)
  if (!seqs.length) return []
  let best = -Infinity, bestSeq: Seq | null = null
  for (const s of seqs) {
    const v = evaluate(s.result, side)
    if (v > best) { best = v; bestSeq = s }
  }
  return bestSeq ? bestSeq.moves : []
}

// One AI sub-step: if not rolled, roll; otherwise play the single best next move toward the
// best whole-turn plan. Driven by useAITurn with a tick so each checker animates.
export function aiStep(st: BackgammonState): BackgammonState {
  if (st.winner || st.turn !== 'b') return st
  if (!st.rolled) return roll(st, 'b')
  const plan = planTurn(st, 'b')
  if (!plan.length) {
    // nothing playable — end the AI turn
    return endTurn(st, 'b')
  }
  const m = plan[0]
  return move(st, 'b', m.from, m.die)
}
