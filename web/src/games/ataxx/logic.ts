/* ATAXX — logic (built for this codebase, not ported).
   7x7 petri dish. You (cyan) and the AI (magenta) each start with two cells in opposite
   corners. On a turn you pick one of your cells and an empty target within Chebyshev
   distance 2: distance 1 is a CLONE (the source stays, a new cell spawns at the target);
   distance 2 is a JUMP (the source moves to the target). After landing, every opponent
   cell in the 8 squares adjacent to the target is CONVERTED to your colour. No legal move
   means you pass. When the board fills or neither side can move, the larger colony wins. */

export const N = 7
export type Side = 'y' | 'f'          // y = you (player), f = foe (AI)
export type Cell = Side | null
export interface LogEntry { t: string; x: string }

export interface Move { from: number; to: number; clone: boolean }

export interface AtaxxState {
  board: Cell[]                        // length 49, index = r*7 + c
  turn: Side | null
  you: Side
  winner: Side | 'draw' | null
  last: Move | null
  log: LogEntry[]
}

const other = (s: Side): Side => s === 'y' ? 'f' : 'y'
export const idx = (r: number, c: number) => r * N + c
export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]
const cheb = (a: number, b: number) => {
  const [ar, ac] = rc(a), [br, bc] = rc(b)
  return Math.max(Math.abs(ar - br), Math.abs(ac - bc))
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }
function sq(i: number) { const [r, c] = rc(i); return `${'abcdefg'[c]}${r + 1}` }

export function makeGame(): AtaxxState {
  const board: Cell[] = new Array(N * N).fill(null)
  // standard Ataxx start: you on the two left-down / right-up diagonal corners
  board[idx(0, 0)] = 'y'; board[idx(N - 1, N - 1)] = 'y'
  board[idx(0, N - 1)] = 'f'; board[idx(N - 1, 0)] = 'f'
  return {
    board, turn: 'y', you: 'y', winner: null, last: null,
    log: [{ t: 'sys', x: 'Your cyan colony starts in two corners. Clone to grow, jump to leap, and infect every neighbour you touch.' }],
  }
}

export function counts(board: Cell[]): { y: number; f: number; empty: number } {
  let y = 0, f = 0, empty = 0
  for (const v of board) { if (v === 'y') y++; else if (v === 'f') f++; else empty++ }
  return { y, f, empty }
}

// the cells within Chebyshev distance 2 of `i` (the reachable shell), distance >= 1
function ring(i: number, dist: number): number[] {
  const [r0, c0] = rc(i)
  const out: number[] = []
  for (let dr = -dist; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== dist) continue
      const r = r0 + dr, c = c0 + dc
      if (r >= 0 && r < N && c >= 0 && c < N) out.push(idx(r, c))
    }
  }
  return out
}

// the up-to-8 cells orthogonally/diagonally adjacent to `i`
function neighbours(i: number): number[] { return ring(i, 1) }

export function legalMoves(board: Cell[], who: Side): Move[] {
  const out: Move[] = []
  const seenClone = new Set<number>()        // clone targets are interchangeable across sources
  for (let i = 0; i < N * N; i++) {
    if (board[i] !== who) continue
    for (const to of ring(i, 1)) {
      if (board[to] === null && !seenClone.has(to)) { seenClone.add(to); out.push({ from: i, to, clone: true }) }
    }
    for (const to of ring(i, 2)) {
      if (board[to] === null) out.push({ from: i, to, clone: false })
    }
  }
  return out
}

export function hasMove(board: Cell[], who: Side): boolean {
  for (let i = 0; i < N * N; i++) {
    if (board[i] !== who) continue
    for (const to of ring(i, 1)) if (board[to] === null) return true
    for (const to of ring(i, 2)) if (board[to] === null) return true
  }
  return false
}

// apply a move to a fresh board, returning [board, convertedCount]; assumes legal.
function applyMove(board: Cell[], m: Move, who: Side): [Cell[], number] {
  const nb = board.slice()
  nb[m.to] = who
  if (!m.clone) nb[m.from] = null
  let converted = 0
  const opp = other(who)
  for (const nbr of neighbours(m.to)) {
    if (nb[nbr] === opp) { nb[nbr] = who; converted++ }
  }
  return [nb, converted]
}

function finish(s: AtaxxState, board: Cell[], log: LogEntry[]): AtaxxState {
  const { y, f } = counts(board)
  const winner: Side | 'draw' = y === f ? 'draw' : y > f ? 'y' : 'f'
  const youWon = winner === s.you
  const msg = winner === 'draw'
    ? `Stalemate — ${y}–${f}.`
    : `${youWon ? 'You win' : 'Rival wins'} ${Math.max(y, f)}–${Math.min(y, f)}.`
  return Object.assign({}, s, { board, turn: null, winner, log: push(log, winner === s.you ? 'you' : 'ai', msg) })
}

// validate a move is legal for `who` (used by the UI gate)
export function isLegal(board: Cell[], m: Move, who: Side): boolean {
  if (board[m.from] !== who || board[m.to] !== null) return false
  const d = cheb(m.from, m.to)
  if (d < 1 || d > 2) return false
  return m.clone ? d === 1 : d === 2
}

export function play(s: AtaxxState, m: Move, who: Side): AtaxxState {
  if (s.winner || s.turn !== who) return s
  if (!isLegal(s.board, m, who)) return s
  const [board, converted] = applyMove(s.board, m, who)
  const verb = m.clone ? 'cloned to' : 'leapt to'
  let log = push(s.log, who === s.you ? 'you' : 'ai',
    `${who === s.you ? 'You' : 'Rival'} ${verb} ${sq(m.to)}${converted ? `, infecting ${converted}` : ''}.`)
  const opp = other(who)
  // game over if board full
  if (counts(board).empty === 0) return finish(Object.assign({}, s, { last: m }), board, log)
  if (hasMove(board, opp)) return Object.assign({}, s, { board, turn: opp, last: m, log })
  // opponent passes
  if (hasMove(board, who)) {
    log = push(log, 'sys', `${opp === s.you ? 'You have' : 'Rival has'} no move — pass.`)
    return Object.assign({}, s, { board, turn: who, last: m, log })
  }
  // neither can move
  return finish(Object.assign({}, s, { last: m }), board, log)
}

// ===== AI: alpha-beta minimax over piece-difference + clone/capture shaping =====

function evalBoard(board: Cell[], me: Side): number {
  const opp = other(me)
  const { y, f } = counts(board)
  const mine = me === 'y' ? y : f
  const theirs = me === 'y' ? f : y
  if (mine === 0) return -100000
  if (theirs === 0) return 100000
  // material is dominant; a small mobility nudge favours flexible colonies
  const myMob = legalMoves(board, me).length
  const opMob = legalMoves(board, opp).length
  return (mine - theirs) * 100 + (myMob - opMob)
}

// order moves so the AI examines high-yield (cloning + converting) moves first — better pruning
function moveGain(board: Cell[], m: Move, who: Side): number {
  const opp = other(who)
  let convert = 0
  for (const nbr of neighbours(m.to)) if (board[nbr] === opp) convert++
  // clone nets +1 cell; jump nets 0 from the move itself; conversions count double
  return (m.clone ? 1 : 0) + convert * 2
}

function orderedMoves(board: Cell[], who: Side): Move[] {
  return legalMoves(board, who)
    .map(m => ({ m, g: moveGain(board, m, who) }))
    .sort((a, b) => b.g - a.g)
    .map(o => o.m)
}

function search(board: Cell[], toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const { empty } = counts(board)
  if (depth === 0 || empty === 0) return evalBoard(board, me)
  const moves = orderedMoves(board, toMove)
  if (!moves.length) {
    if (!hasMove(board, other(toMove))) return evalBoard(board, me)   // terminal
    return search(board, other(toMove), me, depth, alpha, beta)        // pass
  }
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      const [nb] = applyMove(board, m, toMove)
      best = Math.max(best, search(nb, other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      const [nb] = applyMove(board, m, toMove)
      best = Math.min(best, search(nb, other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best)
      if (alpha >= beta) break
    }
    return best
  }
}

export function bestMove(board: Cell[], me: Side, depth = 4): Move | null {
  const moves = orderedMoves(board, me)
  if (!moves.length) return null
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const [nb] = applyMove(board, m, me)
    // tiny immediate-gain tie-break baked into the eval'd score
    const v = search(nb, other(me), me, depth - 1, -Infinity, Infinity) + moveGain(board, m, me) * 0.01
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  return top[(Math.random() * top.length) | 0]
}

export function aiMove(s: AtaxxState): AtaxxState {
  if (s.winner || s.turn !== 'f') return s
  const m = bestMove(s.board, 'f', 2)
  if (!m) return s
  return play(s, m, 'f')
}
