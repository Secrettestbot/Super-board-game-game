/* GOMOKU / FIVE IN A ROW — logic (built for this codebase, not ported).
   15x15 intersections. You are Black and move first; the AI is White. Place a stone on an
   empty intersection; first to FIVE-in-a-row (horizontal, vertical, or either diagonal) wins.
   The AI is a pattern/threat evaluator: it always takes a win, always blocks an opponent four
   or open three, and otherwise plays the highest-scoring point near existing stones. */

export const N = 15
export type Stone = 'b' | 'w'
export type Cell = Stone | null
export interface LogEntry { t: string; x: string }

export interface GomokuState {
  board: Cell[]                 // length 225, index = r*15 + c
  turn: Stone | null
  you: Stone
  winner: Stone | 'draw' | null
  last: number | null
  win: number[] | null          // the winning five (highlighted) when game ends
  log: LogEntry[]
}

const other = (s: Stone): Stone => s === 'b' ? 'w' : 'b'
const idx = (r: number, c: number) => r * N + c
const inb = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
// the 4 line orientations
const LINES = [[0, 1], [1, 0], [1, 1], [1, -1]]

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

const colName = (c: number) => 'ABCDEFGHJKLMNOP'[c]  // skip 'I' by convention
const coord = (i: number) => `${colName(i % N)}${N - Math.floor(i / N)}`

export function makeGame(): GomokuState {
  const board: Cell[] = new Array(N * N).fill(null)
  return {
    board, turn: 'b', you: 'b', winner: null, last: null, win: null,
    log: [{ t: 'sys', x: 'You are Black and move first. Line up five stones in a row to win.' }],
  }
}

// If `who` has five-or-more in a row through point i, return that exact run of five; else null.
function winningRun(board: Cell[], i: number, who: Stone): number[] | null {
  const r0 = Math.floor(i / N), c0 = i % N
  for (const [dr, dc] of LINES) {
    const run = [i]
    let r = r0 + dr, c = c0 + dc
    while (inb(r, c) && board[idx(r, c)] === who) { run.push(idx(r, c)); r += dr; c += dc }
    r = r0 - dr; c = c0 - dc
    while (inb(r, c) && board[idx(r, c)] === who) { run.unshift(idx(r, c)); r -= dr; c -= dc }
    if (run.length >= 5) {
      // centre the five on i for a tidy highlight
      const k = run.indexOf(i)
      const start = Math.min(Math.max(k - 2, 0), run.length - 5)
      return run.slice(start, start + 5)
    }
  }
  return null
}

export function isFull(board: Cell[]): boolean {
  for (const v of board) if (!v) return false
  return true
}

export function place(s: GomokuState, i: number, who: Stone): GomokuState {
  if (s.winner || s.turn !== who || s.board[i]) return s
  const board = s.board.slice(); board[i] = who
  const tag = who === s.you ? 'you' : 'ai'
  const name = who === s.you ? 'You' : 'Rival'
  let log = push(s.log, tag, `${name} played ${coord(i)}.`)
  const wr = winningRun(board, i, who)
  if (wr) {
    log = push(log, tag, `${name === 'You' ? 'You win' : 'Rival wins'} with five in a row!`)
    return Object.assign({}, s, { board, turn: null, winner: who, last: i, win: wr, log })
  }
  if (isFull(board)) {
    log = push(log, 'sys', 'The board is full — a draw.')
    return Object.assign({}, s, { board, turn: null, winner: 'draw', last: i, win: null, log })
  }
  return Object.assign({}, s, { board, turn: other(who), last: i, log })
}

// ===== AI: pattern / threat heuristic =====

// Candidate points: empty intersections within `rad` of any stone (whole board empty -> centre).
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
  if (!any) return [idx(7, 7)]
  return [...seen]
}

/* Score the line pattern formed for `who` through point i (assuming i is played by `who`).
   For each of the 4 directions we count the contiguous run length and whether the ends are
   open, then translate (length, openEnds) into a threat value. Summed over directions. */
function lineScore(board: Cell[], i: number, who: Stone): number {
  const r0 = Math.floor(i / N), c0 = i % N
  let total = 0
  for (const [dr, dc] of LINES) {
    let count = 1
    let open = 0
    // forward
    let r = r0 + dr, c = c0 + dc
    while (inb(r, c) && board[idx(r, c)] === who) { count++; r += dr; c += dc }
    if (inb(r, c) && !board[idx(r, c)]) open++
    // backward
    r = r0 - dr; c = c0 - dc
    while (inb(r, c) && board[idx(r, c)] === who) { count++; r -= dr; c -= dc }
    if (inb(r, c) && !board[idx(r, c)]) open++
    total += patternValue(count, open)
  }
  return total
}

// (run length including the played stone, number of open ends) -> threat weight
function patternValue(count: number, open: number): number {
  if (count >= 5) return 1_000_000          // makes five
  if (open === 0) return 0                   // blocked on both ends, dead unless it's already 5
  if (count === 4) return open === 2 ? 100_000 : 12_000   // open four (win next) / simple four
  if (count === 3) return open === 2 ? 8_000 : 800        // open three / blocked three
  if (count === 2) return open === 2 ? 400 : 60
  return open === 2 ? 20 : 6                  // lone stone, by openness
}

// Combined heuristic value of playing point i for `me`: own-threat creation + blocking the
// opponent's threat at that same point (defensive weight slightly discounted).
function scorePoint(board: Cell[], i: number, me: Stone): number {
  const opp = other(me)
  const off = lineScore(board, i, me)
  const def = lineScore(board, i, opp)
  // Taking our own win dominates; otherwise blocking a strong enemy threat is near-as-urgent.
  return off + def * 0.9
}

export function aiMove(s: GomokuState): GomokuState {
  if (s.winner || s.turn !== 'w') return s
  const me: Stone = 'w'
  const cands = candidates(s.board, 2)
  if (!cands.length) return s

  // 1) immediate win for us
  for (const i of cands) if (winningRun(withStone(s.board, i, me), i, me)) return place(s, i, me)
  // 2) block opponent's immediate win
  const opp = other(me)
  const block: number[] = []
  for (const i of cands) if (winningRun(withStone(s.board, i, opp), i, opp)) block.push(i)
  if (block.length) return place(s, block[(Math.random() * block.length) | 0], me)

  // 3) otherwise highest combined threat score, tiny random tie-break
  let best = -Infinity
  const scored: { i: number; v: number }[] = []
  for (const i of cands) {
    const v = scorePoint(s.board, i, me) + Math.random() * 0.5
    scored.push({ i, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.i)
  const choice = top[(Math.random() * top.length) | 0]
  return place(s, choice, me)
}

function withStone(board: Cell[], i: number, who: Stone): Cell[] {
  const nb = board.slice(); nb[i] = who; return nb
}
