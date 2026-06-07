/* PENTE — logic (built for this codebase, not ported).
   13x13 intersections. You are Black and move first; the AI is White. Place a stone on an
   empty crossing. Two ways to win: get FIVE-in-a-row, OR capture FIVE PAIRS (10 stones).
   CUSTODIAL CAPTURE — placing a stone that completes YOU-OPP-OPP-YOU along any line removes
   exactly that flanked pair (only pairs; not 1, not 3) and the placer scores a pair. Moving
   INTO a bracket does NOT self-capture. The AI is a single-ply threat/pattern evaluator
   (Gomoku-style line scoring) extended with capture awareness. */

export const N = 13
export type Stone = 'b' | 'w'
export type Cell = Stone | null
export interface LogEntry { t: string; x: string }

export interface PenteState {
  board: Cell[]                 // length 169, index = r*13 + c
  turn: Stone | null
  you: Stone
  pairs: { b: number; w: number }   // captured-pair counts (5 wins)
  winner: Stone | 'draw' | null
  last: number | null
  captured: number[]            // indices removed by the most recent move (for animation/clear)
  win: number[] | null          // the winning five (highlighted) when game ends by five-in-a-row
  log: LogEntry[]
}

const other = (s: Stone): Stone => s === 'b' ? 'w' : 'b'
const idx = (r: number, c: number) => r * N + c
const inb = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
// the 8 ray directions (capture is directional); 4 line orientations for runs
const RAYS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]
const LINES = [[0, 1], [1, 0], [1, 1], [1, -1]]
const PAIRS_TO_WIN = 5

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

const colName = (c: number) => 'ABCDEFGHJKLMN'[c]   // skip 'I' by convention
const coord = (i: number) => `${colName(i % N)}${N - Math.floor(i / N)}`

export function makeGame(): PenteState {
  const board: Cell[] = new Array(N * N).fill(null)
  return {
    board, turn: 'b', you: 'b', pairs: { b: 0, w: 0 }, winner: null, last: null,
    captured: [], win: null,
    log: [{ t: 'sys', x: 'You are Black and move first. Make five in a row — or capture five pairs.' }],
  }
}

// If `who` has five-or-more in a row through point i, return that exact run of five; else null.
export function winningRun(board: Cell[], i: number, who: Stone): number[] | null {
  const r0 = Math.floor(i / N), c0 = i % N
  for (const [dr, dc] of LINES) {
    const run = [i]
    let r = r0 + dr, c = c0 + dc
    while (inb(r, c) && board[idx(r, c)] === who) { run.push(idx(r, c)); r += dr; c += dc }
    r = r0 - dr; c = c0 - dc
    while (inb(r, c) && board[idx(r, c)] === who) { run.unshift(idx(r, c)); r -= dr; c -= dc }
    if (run.length >= 5) {
      const k = run.indexOf(i)
      const start = Math.min(Math.max(k - 2, 0), run.length - 5)
      return run.slice(start, start + 5)
    }
  }
  return null
}

/* The indices captured if `who` plays at i: for every ray, the pattern OPP-OPP-YOU starting
   from the played stone yields that exact pair. Pure (does not mutate). Assumes board[i] is
   already `who` (or empty — it reads the two next cells, not i itself). */
export function capturesFrom(board: Cell[], i: number, who: Stone): number[] {
  const opp = other(who)
  const r0 = Math.floor(i / N), c0 = i % N
  const out: number[] = []
  for (const [dr, dc] of RAYS) {
    const a = [r0 + dr, c0 + dc], b = [r0 + 2 * dr, c0 + 2 * dc], e = [r0 + 3 * dr, c0 + 3 * dc]
    if (!inb(a[0], a[1]) || !inb(b[0], b[1]) || !inb(e[0], e[1])) continue
    if (board[idx(a[0], a[1])] === opp && board[idx(b[0], b[1])] === opp && board[idx(e[0], e[1])] === who) {
      out.push(idx(a[0], a[1]), idx(b[0], b[1]))
    }
  }
  return out
}

export function isFull(board: Cell[]): boolean {
  for (const v of board) if (!v) return false
  return true
}

export function place(s: PenteState, i: number, who: Stone): PenteState {
  if (s.winner || s.turn !== who || s.board[i]) return s
  const board = s.board.slice(); board[i] = who
  const tag = who === s.you ? 'you' : 'ai'
  const name = who === s.you ? 'You' : 'Rival'

  // resolve custodial captures (pairs only, by construction of capturesFrom)
  const cap = capturesFrom(board, i, who)
  for (const c of cap) board[c] = null
  const pairs = { ...s.pairs }
  const gained = cap.length / 2
  if (gained) pairs[who] += gained

  let log = push(s.log, tag, `${name} played ${coord(i)}.`)
  if (gained) {
    log = push(log, tag, gained === 1
      ? `${name === 'You' ? 'You captured' : 'Rival captured'} a pair! (${pairs[who]}/5)`
      : `${name === 'You' ? 'You captured' : 'Rival captured'} ${gained} pairs! (${pairs[who]}/5)`)
  }

  // win by five captured pairs
  if (pairs[who] >= PAIRS_TO_WIN) {
    log = push(log, tag, `${name === 'You' ? 'You win' : 'Rival wins'} — five pairs captured!`)
    return Object.assign({}, s, { board, turn: null, pairs, winner: who, last: i, captured: cap, win: null, log })
  }
  // win by five in a row (captures resolved first; a captured stone breaks a would-be five)
  const wr = winningRun(board, i, who)
  if (wr) {
    log = push(log, tag, `${name === 'You' ? 'You win' : 'Rival wins'} with five in a row!`)
    return Object.assign({}, s, { board, turn: null, pairs, winner: who, last: i, captured: cap, win: wr, log })
  }
  if (isFull(board)) {
    log = push(log, 'sys', 'The board is full — a draw.')
    return Object.assign({}, s, { board, turn: null, pairs, winner: 'draw', last: i, captured: cap, win: null, log })
  }
  return Object.assign({}, s, { board, turn: other(who), pairs, last: i, captured: cap, win: null, log })
}

// ===== AI: pattern / threat heuristic + capture awareness =====

function candidates(board: Cell[], rad = 2): number[] {
  const seen = new Set<number>()
  let any = false
  for (let i = 0; i < N * N; i++) {
    if (!board[i]) continue
    any = true
    const r0 = Math.floor(i / N), c0 = i % N
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        const r = r0 + dr, c = c0 + dc
        if (inb(r, c) && !board[idx(r, c)]) seen.add(idx(r, c))
      }
  }
  if (!any) return [idx(6, 6)]
  return [...seen]
}

/* Line run value through i for `who` (Gomoku style): for each orientation count the
   contiguous run length and open ends, then weight. */
function lineScore(board: Cell[], i: number, who: Stone): number {
  const r0 = Math.floor(i / N), c0 = i % N
  let total = 0
  for (const [dr, dc] of LINES) {
    let count = 1, open = 0
    let r = r0 + dr, c = c0 + dc
    while (inb(r, c) && board[idx(r, c)] === who) { count++; r += dr; c += dc }
    if (inb(r, c) && !board[idx(r, c)]) open++
    r = r0 - dr; c = c0 - dc
    while (inb(r, c) && board[idx(r, c)] === who) { count++; r -= dr; c -= dc }
    if (inb(r, c) && !board[idx(r, c)]) open++
    total += patternValue(count, open)
  }
  return total
}

function patternValue(count: number, open: number): number {
  if (count >= 5) return 1_000_000
  if (open === 0) return 0
  if (count === 4) return open === 2 ? 100_000 : 12_000
  if (count === 3) return open === 2 ? 8_000 : 800
  if (count === 2) return open === 2 ? 400 : 60
  return open === 2 ? 20 : 6
}

/* Count how many of `victim`'s pairs become flankable by `who` AFTER the given board state —
   i.e. an empty point from which `who` could complete YOU-OPP-OPP-YOU. Used to (a) reward
   capturing now and (b) penalise leaving our own pairs exposed. */
function vulnerablePairs(board: Cell[], victim: Stone): number {
  const cap = other(victim)
  let n = 0
  for (let i = 0; i < N * N; i++) {
    if (board[i] !== cap) continue
    const r0 = Math.floor(i / N), c0 = i % N
    for (const [dr, dc] of RAYS) {
      const a = [r0 + dr, c0 + dc], b = [r0 + 2 * dr, c0 + 2 * dc], e = [r0 + 3 * dr, c0 + 3 * dc]
      if (!inb(e[0], e[1])) continue
      if (board[idx(a[0], a[1])] === victim && board[idx(b[0], b[1])] === victim && board[idx(e[0], e[1])] === null) n++
    }
  }
  return n
}

function withStone(board: Cell[], i: number, who: Stone): Cell[] {
  const nb = board.slice(); nb[i] = who; return nb
}

// Resulting board after `who` plays i (stone placed + captures removed).
function applyMove(board: Cell[], i: number, who: Stone): Cell[] {
  const nb = board.slice(); nb[i] = who
  for (const c of capturesFrom(nb, i, who)) nb[c] = null
  return nb
}

function scorePoint(board: Cell[], i: number, me: Stone, myPairs: number, opPairs: number): number {
  const opp = other(me)
  const off = lineScore(board, i, me)
  const def = lineScore(board, i, opp)
  // capture value of playing here now (each pair is meaningful — 5 ends the game)
  const cap = capturesFrom(withStone(board, i, me), i, me).length / 2
  const capVal = cap * (myPairs + cap >= PAIRS_TO_WIN ? 1_000_000 : 6_000 + myPairs * 1_500)
  // safety: how many of OUR pairs the opponent could capture after our move vs before
  const after = applyMove(board, i, me)
  const myExposed = vulnerablePairs(after, me)
  const opExposed = vulnerablePairs(after, opp)
  const safety = -myExposed * (4_000 + opPairs * 1_200) + opExposed * 700
  return off + def * 0.9 + capVal + safety
}

export function aiMove(s: PenteState): PenteState {
  if (s.winner || s.turn !== 'w') return s
  const me: Stone = 'w'
  const opp = other(me)
  const cands = candidates(s.board, 2)
  if (!cands.length) return s

  // 1) immediate win: five-in-a-row OR a capture taking us to five pairs
  for (const i of cands) {
    const after = applyMove(s.board, i, me)
    const cap = capturesFrom(withStone(s.board, i, me), i, me).length / 2
    if (s.pairs.w + cap >= PAIRS_TO_WIN) return place(s, i, me)
    if (winningRun(after, i, me)) return place(s, i, me)
  }
  // 2) block opponent's immediate win (their five, or their fifth-pair capture)
  const block: number[] = []
  for (const i of cands) {
    const oafter = applyMove(s.board, i, opp)
    const ocap = capturesFrom(withStone(s.board, i, opp), i, opp).length / 2
    if (s.pairs.b + ocap >= PAIRS_TO_WIN || winningRun(oafter, i, opp)) block.push(i)
  }
  if (block.length) {
    // prefer a block that itself captures / is safest
    let best = -Infinity; let pick = block[0]
    for (const i of block) {
      const v = scorePoint(s.board, i, me, s.pairs.w, s.pairs.b) + Math.random() * 0.5
      if (v > best) { best = v; pick = i }
    }
    return place(s, pick, me)
  }

  // 3) highest combined threat + capture score, tiny random tie-break
  let best = -Infinity
  const scored: { i: number; v: number }[] = []
  for (const i of cands) {
    const v = scorePoint(s.board, i, me, s.pairs.w, s.pairs.b) + Math.random() * 0.5
    scored.push({ i, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.i)
  const choice = top[(Math.random() * top.length) | 0]
  return place(s, choice, me)
}
