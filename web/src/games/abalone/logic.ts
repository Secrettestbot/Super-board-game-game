/* ABALONE — logic (built for this codebase, not ported).
   A hexagonal board of 61 cells (hexagon, 5 per side; row lengths 5,6,7,8,9,8,7,6,5).
   You are Black and move first; the AI is White and uses alpha-beta minimax.
   A move pushes an in-line group of 1–3 of your own marbles one hex: in-line into empty,
   broadside into empty, or a SUMITO that shoves a shorter enemy line — ejecting any enemy
   marble forced off the board. First to push SIX of the opponent's marbles off wins.

   Coordinates: axial (q, r). The board is the set of cells with |q|<=4, |r|<=4, |q+r|<=4.
   Six directions; in-line groups lie along one of three axes. */

export type Marble = 'b' | 'w'
export type Cell = Marble | null
export interface LogEntry { t: string; x: string }

export interface Hex { q: number; r: number }
export type Key = string

export interface AbaloneState {
  board: Record<Key, Cell>   // every on-board cell -> marble | null
  turn: Marble | null
  you: Marble
  winner: Marble | null
  off: { b: number; w: number }  // marbles each side has had pushed off (opponent captured them)
  last: Key[]                     // cells touched by the last move (for highlight)
  log: LogEntry[]
}

export const RADIUS = 4
export const WIN_OFF = 6

// The six axial directions, ordered for arrow display: E, W, NE, SW, NW, SE
export const DIRS: Hex[] = [
  { q: 1, r: 0 },   // E
  { q: -1, r: 0 },  // W
  { q: 1, r: -1 },  // NE
  { q: -1, r: 1 },  // SW
  { q: 0, r: -1 },  // NW
  { q: 0, r: 1 },   // SE
]
export const DIR_NAMES = ['E', 'W', 'NE', 'SW', 'NW', 'SE']

export const key = (q: number, r: number): Key => q + ',' + r
export const parseKey = (k: Key): Hex => { const [q, r] = k.split(',').map(Number); return { q, r } }
const onBoard = (q: number, r: number) => Math.abs(q) <= RADIUS && Math.abs(r) <= RADIUS && Math.abs(q + r) <= RADIUS
const other = (m: Marble): Marble => m === 'b' ? 'w' : 'b'

export function allCells(): Hex[] {
  const out: Hex[] = []
  for (let q = -RADIUS; q <= RADIUS; q++)
    for (let r = -RADIUS; r <= RADIUS; r++)
      if (onBoard(q, r)) out.push({ q, r })
  return out
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): AbaloneState {
  const board: Record<Key, Cell> = {}
  for (const { q, r } of allCells()) board[key(q, r)] = null
  // Standard opening. Rows are by axial r. r=-4,-3 are the top two full rows (White home),
  // r=4,3 the bottom two (Black home); plus the centre three of the third row each side.
  // We orient so Black ('b' = you) is at the bottom (large r), White at the top (small r).
  const place = (q: number, r: number, m: Marble) => { board[key(q, r)] = m }

  // White (top): r = -4 (len 5: q from 0..4), r = -3 (len 6: q from -1..4)
  for (let q = 0; q <= 4; q++) place(q, -4, 'w')
  for (let q = -1; q <= 4; q++) place(q, -3, 'w')
  // White centre bulge on r = -2 (len 7: q from -2..4): centre three -> q = 0,1,2
  for (let q = 0; q <= 2; q++) place(q, -2, 'w')

  // Black (bottom): r = 4 (len 5: q from -4..0), r = 3 (len 6: q from -4..1)
  for (let q = -4; q <= 0; q++) place(q, 4, 'b')
  for (let q = -4; q <= 1; q++) place(q, 3, 'b')
  // Black centre bulge on r = 2 (len 7: q from -4..2): centre three -> q = -2,-1,0
  for (let q = -2; q <= 0; q++) place(q, 2, 'b')

  return {
    board, turn: 'b', you: 'b', winner: null, off: { b: 0, w: 0 }, last: [],
    log: [{ t: 'sys', x: 'You are Black and move first. Line up marbles and shove the rival off the rim — six off wins.' }],
  }
}

export function count(board: Record<Key, Cell>): { b: number; w: number } {
  let b = 0, w = 0
  for (const k in board) { const v = board[k]; if (v === 'b') b++; else if (v === 'w') w++ }
  return { b, w }
}

// ---- Move model ----
// A move = an in-line group (1..3 cells along one axis) + a direction index.
export interface Move {
  cells: Key[]        // the selected own marbles, sorted along the axis
  dir: number         // index into DIRS
}

const add = (h: Hex, d: Hex): Hex => ({ q: h.q + d.q, r: h.r + d.r })
const negIdx = (dir: number) => dir % 2 === 0 ? dir + 1 : dir - 1  // E<->W, NE<->SW, NW<->SE

// Are the given cells a contiguous in-line group along one axis? Returns the axis dir index (the
// "forward" of the two opposite dirs) or -1 if not a valid group.
export function lineAxis(cells: Key[]): number {
  if (cells.length === 1) return -2  // single: any axis (sentinel)
  const pts = cells.map(parseKey)
  // try each of the 3 axes (dir 0,2,4 as canonical forward)
  for (const ax of [0, 2, 4]) {
    const d = DIRS[ax]
    // sort cells along axis: project onto direction
    const proj = (h: Hex) => h.q * d.q + h.r * d.r + (h.q + h.r) * (d.q + d.r)
    const sorted = pts.slice().sort((a, b) => proj(a) - proj(b))
    let ok = true
    for (let i = 1; i < sorted.length; i++) {
      const exp = add(sorted[i - 1], d)
      if (exp.q !== sorted[i].q || exp.r !== sorted[i].r) { ok = false; break }
    }
    if (ok) return ax
  }
  return -1
}

// Sort a valid group's cells along axis dir (forward order).
function sortAlong(cells: Key[], dir: number): Key[] {
  const d = DIRS[dir]
  const proj = (h: Hex) => h.q * d.q + h.r * d.r + (h.q + h.r) * (d.q + d.r)
  return cells.slice().sort((a, b) => proj(parseKey(a)) - proj(parseKey(b)))
}

export interface MoveResult { board: Record<Key, Cell>; pushedOff: number; ejected: Marble | null }

// Attempt a move. Returns null if illegal, else the resulting board + how many enemy pushed off.
export function tryMove(board: Record<Key, Cell>, cells: Key[], dir: number, who: Marble): MoveResult | null {
  if (cells.length < 1 || cells.length > 3) return null
  // all selected must be `who`
  for (const c of cells) if (board[c] !== who) return null

  const axis = cells.length === 1 ? -2 : lineAxis(cells)
  if (axis === -1) return null  // not a contiguous line

  const d = DIRS[dir]
  const opp = other(who)
  const isInline = cells.length > 1 && (axis === dir || axis === negIdx(dir))

  if (cells.length === 1 || !isInline) {
    // ---- BROADSIDE (or single) : every destination must be empty & on-board ----
    for (const c of cells) {
      const h = add(parseKey(c), d)
      if (!onBoard(h.q, h.r)) return null
      // destination must be empty, unless it's a cell we're vacating
      const dk = key(h.q, h.r)
      if (board[dk] !== null && !cells.includes(dk)) return null
    }
    const nb = { ...board }
    for (const c of cells) nb[c] = null
    for (const c of cells) { const h = add(parseKey(c), d); nb[key(h.q, h.r)] = who }
    return { board: nb, pushedOff: 0, ejected: null }
  }

  // ---- IN-LINE move / sumito ----
  const sorted = sortAlong(cells, dir)            // last element is the front, moving toward dir
  const front = parseKey(sorted[sorted.length - 1])
  const ahead = add(front, d)

  if (!onBoard(ahead.q, ahead.r)) return null      // can't push your own group off
  const aheadK = key(ahead.q, ahead.r)
  const aheadV = board[aheadK]

  if (aheadV === null) {
    // simple in-line slide into empty
    const nb = { ...board }
    nb[sorted[0]] = null
    nb[aheadK] = who
    // middle cells unchanged (still who)
    return { board: nb, pushedOff: 0, ejected: null }
  }

  if (aheadV === who) return null                  // blocked by own marble

  // aheadV is enemy -> SUMITO. Count the contiguous enemy line in front.
  const enemyLine: Hex[] = []
  let cur = ahead
  while (onBoard(cur.q, cur.r) && board[key(cur.q, cur.r)] === opp) {
    enemyLine.push(cur)
    cur = add(cur, d)
  }
  // cur is now the cell just past the enemy line (or off board)
  if (enemyLine.length >= cells.length) return null  // can only push a strictly shorter line
  // the cell behind the enemy line must be empty or off-board (off => ejection)
  let ejected: Marble | null = null
  let pushedOff = 0
  const behindOnBoard = onBoard(cur.q, cur.r)
  if (behindOnBoard && board[key(cur.q, cur.r)] !== null) return null  // blocked, can't push

  const nb = { ...board }
  // move enemy line forward by one (process from the back so we don't overwrite)
  if (!behindOnBoard) { ejected = opp; pushedOff = 1 }
  for (let i = enemyLine.length - 1; i >= 0; i--) {
    const from = enemyLine[i]
    const to = add(from, d)
    if (onBoard(to.q, to.r)) nb[key(to.q, to.r)] = opp
    // if !onBoard it's the ejected one (already counted)
  }
  // move our group forward
  nb[sorted[0]] = null
  nb[aheadK] = who
  return { board: nb, pushedOff, ejected }
}

export function applyMove(s: AbaloneState, cells: Key[], dir: number, who: Marble): AbaloneState {
  if (s.winner || s.turn !== who) return s
  const res = tryMove(s.board, cells, dir, who)
  if (!res) return s
  const opp = other(who)
  const off = { ...s.off }
  if (res.ejected) off[opp] = off[opp] + res.pushedOff  // opp lost marbles -> off[opp] grows
  const touched = sortAlong(cells, dir).map(c => { const h = add(parseKey(c), DIRS[dir]); return key(h.q, h.r) })
  const name = who === s.you ? 'You' : 'Rival'
  let log = push(s.log, who === s.you ? 'you' : 'ai',
    `${name} pushed ${cells.length} ${DIR_NAMES[dir]}${res.ejected ? ` — ejected a marble! (${off[opp]}/${WIN_OFF})` : ''}.`)
  // win check: off[X] is how many of X's marbles are gone; whoever lost 6 -> the other wins
  let winner: Marble | null = null
  if (off.b >= WIN_OFF) winner = 'w'
  else if (off.w >= WIN_OFF) winner = 'b'
  if (winner) {
    const youWon = winner === s.you
    log = push(log, youWon ? 'you' : 'ai', `${youWon ? 'You win' : 'Rival wins'} — six marbles driven off the board.`)
    return { ...s, board: res.board, turn: null, off, winner, last: touched, log }
  }
  return { ...s, board: res.board, turn: opp, off, last: touched, log }
}

// ---- Move generation ----
// Enumerate all legal moves for `who`. Groups: singles + in-line pairs/triples along the 3 axes.
export function legalMoves(board: Record<Key, Cell>, who: Marble): Move[] {
  const own: Key[] = []
  for (const k in board) if (board[k] === who) own.push(k)
  const ownSet = new Set(own)
  const groups: Key[][] = own.map(c => [c])
  // pairs & triples along the 3 axes
  for (const ax of [0, 2, 4]) {
    const d = DIRS[ax]
    for (const c of own) {
      const h = parseKey(c)
      const h2 = add(h, d), k2 = key(h2.q, h2.r)
      if (ownSet.has(k2)) {
        groups.push([c, k2])
        const h3 = add(h2, d), k3 = key(h3.q, h3.r)
        if (ownSet.has(k3)) groups.push([c, k2, k3])
      }
    }
  }
  const out: Move[] = []
  for (const g of groups) {
    for (let dir = 0; dir < 6; dir++) {
      if (tryMove(board, g, dir, who)) out.push({ cells: g, dir })
    }
  }
  return out
}

// ---- AI: alpha-beta minimax (modest depth) ----
const CENTER = { q: 0, r: 0 }
const distCenter = (h: Hex) => (Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r)) / 2

function evalBoard(board: Record<Key, Cell>, off: { b: number; w: number }, me: Marble): number {
  const opp = other(me)
  // material: opponent pushed off is great, ours pushed off is terrible (heavily weighted)
  let score = (off[opp] - off[me]) * 1000
  let myCohesion = 0, opCohesion = 0
  let myCells: Hex[] = [], opCells: Hex[] = []
  for (const k in board) {
    const v = board[k]; if (!v) continue
    const h = parseKey(k)
    const centreVal = (RADIUS - distCenter(h))  // higher near centre
    if (v === me) { score += centreVal * 6; myCells.push(h) } else { score -= centreVal * 6; opCells.push(h) }
  }
  // grouping: reward own marbles adjacent to own (cohesion)
  const adjCount = (cells: Hex[], set: Set<Key>) => {
    let n = 0
    for (const h of cells) for (const d of DIRS) { const a = add(h, d); if (set.has(key(a.q, a.r))) n++ }
    return n
  }
  const meSet = new Set(myCells.map(h => key(h.q, h.r)))
  const opSet = new Set(opCells.map(h => key(h.q, h.r)))
  myCohesion = adjCount(myCells, meSet)
  opCohesion = adjCount(opCells, opSet)
  score += (myCohesion - opCohesion) * 2
  return score
}

interface Applied { board: Record<Key, Cell>; off: { b: number; w: number } }
function applyRaw(board: Record<Key, Cell>, off: { b: number; w: number }, m: Move, who: Marble): Applied {
  const res = tryMove(board, m.cells, m.dir, who)!
  const opp = other(who)
  const no = { ...off }
  if (res.ejected) no[opp] = no[opp] + res.pushedOff
  return { board: res.board, off: no }
}

function search(board: Record<Key, Cell>, off: { b: number; w: number }, toMove: Marble, me: Marble, depth: number, alpha: number, beta: number): number {
  if (off.b >= WIN_OFF || off.w >= WIN_OFF || depth === 0) return evalBoard(board, off, me)
  const moves = legalMoves(board, toMove)
  if (!moves.length) return evalBoard(board, off, me)
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      const a = applyRaw(board, off, m, toMove)
      best = Math.max(best, search(a.board, a.off, other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      const a = applyRaw(board, off, m, toMove)
      best = Math.min(best, search(a.board, a.off, other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}

export function aiMove(s: AbaloneState, depth = 2): AbaloneState {
  if (s.winner || s.turn !== 'w') return s
  const me: Marble = 'w'
  const moves = legalMoves(s.board, me)
  if (!moves.length) return s
  // Move ordering: try capturing moves first (helps alpha-beta & makes a sharper AI).
  const scored = moves.map(m => {
    const res = tryMove(s.board, m.cells, m.dir, me)!
    return { m, cap: res.pushedOff }
  }).sort((a, b) => b.cap - a.cap)

  let best = -Infinity
  const ranked: { m: Move; v: number }[] = []
  for (const { m } of scored) {
    const a = applyRaw(s.board, s.off, m, me)
    const v = search(a.board, a.off, other(me), me, depth - 1, -Infinity, Infinity)
    ranked.push({ m, v })
    if (v > best) best = v
  }
  const top = ranked.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return applyMove(s, choice.cells, choice.dir, me)
}
