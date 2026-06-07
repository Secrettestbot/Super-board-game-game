/* KONANE — Hawaiian Checkers (logic, built for this codebase, not ported).
   8x8 papamu filled in a checkerboard of black basalt + white coral, 32 each.
   You are Black and move first; the AI is White and uses alpha-beta over mobility + material.

   OPENING: black lifts one of its own central stones; white then lifts one of its own stones
   orthogonally adjacent to that hole. PLAY thereafter: every move is a CAPTURING JUMP — a stone
   hops orthogonally over an adjacent enemy into the empty square beyond, removing the jumped
   enemy, and may CONTINUE in the SAME straight line over successive enemies. Non-capturing moves
   are illegal; a player with NO legal capture on their turn LOSES. Mobility is the real currency. */

export const N = 8
export type Stone = 'b' | 'w'
export type Cell = Stone | null
export type Phase = 'open1' | 'open2' | 'play'
export interface LogEntry { t: string; x: string }

/** A full turn for the play phase: a starting square + the ordered list of squares it lands on
    (one entry per hop). For the opening phase, a "move" is a single removal index (path === []). */
export interface Move { from: number; path: number[] }

export interface KonaneState {
  board: Cell[]            // length 64, index = r*8 + c
  turn: Stone | null
  you: Stone
  phase: Phase
  winner: Stone | null
  last: number[]           // squares touched by the last move (for highlight)
  log: LogEntry[]
}

const other = (d: Stone): Stone => d === 'b' ? 'w' : 'b'
export const idx = (r: number, c: number) => r * N + c
export const rc = (i: number) => [Math.floor(i / N), i % N] as const
const inB = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const
const sq = (i: number) => { const [r, c] = rc(i); return `${'ABCDEFGH'[c]}${r + 1}` }

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function counts(board: Cell[]): { b: number; w: number } {
  let b = 0, w = 0
  for (const v of board) { if (v === 'b') b++; else if (v === 'w') w++ }
  return { b, w }
}

export function makeGame(): KonaneState {
  // checkerboard: black on dark squares ((r+c) even), white on light squares
  const board: Cell[] = new Array(N * N).fill(null)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) board[idx(r, c)] = (r + c) % 2 === 0 ? 'b' : 'w'
  return {
    board, turn: 'b', you: 'b', phase: 'open1', winner: null, last: [],
    log: [{ t: 'sys', x: 'You are Black and move first. Lift one of your stones near the centre to open.' }],
  }
}

/** Opening removals legal for `who`. open1: black's own stones in the centre region.
    open2: white's own stones orthogonally adjacent to the (single) opening hole. */
export function openingRemovals(s: KonaneState, who: Stone): number[] {
  if (s.phase === 'open1') {
    // central black stones: prefer the four centre + corners; offer any black stone in the
    // 4x4 core so the human has real choice, but always include the canonical centre pick.
    const out: number[] = []
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) {
      const i = idx(r, c)
      if (s.board[i] === who) out.push(i)
    }
    return out
  }
  if (s.phase === 'open2') {
    const hole = s.board.findIndex(v => v === null)
    if (hole < 0) return []
    const [hr, hc] = rc(hole)
    const out: number[] = []
    for (const [dr, dc] of DIRS) {
      const r = hr + dr, c = hc + dc
      if (inB(r, c) && s.board[idx(r, c)] === who) out.push(idx(r, c))
    }
    return out
  }
  return []
}

/** All landing squares reachable by `who`'s stone at `from` on its FIRST hop (one per direction
    that has an adjacent enemy with an empty square beyond). */
export function jumpsFrom(board: Cell[], from: number, who: Stone): number[] {
  if (board[from] !== who) return []
  const [r0, c0] = rc(from)
  const enemy = other(who)
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const mr = r0 + dr, mc = c0 + dc        // jumped enemy
    const lr = r0 + 2 * dr, lc = c0 + 2 * dc // landing
    if (inB(lr, lc) && board[idx(mr, mc)] === enemy && board[idx(lr, lc)] === null) out.push(idx(lr, lc))
  }
  return out
}

/** Enumerate every complete capturing turn for `who` (a turn may stop after any hop). */
export function legalMoves(board: Cell[], who: Stone): Move[] {
  const out: Move[] = []
  for (let from = 0; from < N * N; from++) {
    if (board[from] !== who) continue
    const firsts = jumpsFrom(board, from, who)
    for (const land of firsts) {
      // walk the straight line from `from` through `land` and beyond, recording stop points
      const [fr, fc] = rc(from), [lr, lc] = rc(land)
      const dr = Math.sign(lr - fr), dc = Math.sign(lc - fc)
      let cur = land
      const path: number[] = [land]
      // simulate captures along the line to test further continuation
      let r = fr, c = fc
      const enemy = other(who)
      // first capture already validated; record and keep extending
      out.push({ from, path: path.slice() })
      // extend while a same-direction capture exists from `cur`
      // Build a working board copy to mark removed enemies / vacated squares.
      const wb = board.slice()
      wb[from] = null
      // mark first hop
      const mr = r + dr, mc = c + dc
      wb[idx(mr, mc)] = null
      wb[cur] = who
      r = lr; c = lc
      while (true) {
        const er = r + dr, ec = c + dc, nr = r + 2 * dr, nc = c + 2 * dc
        if (inB(nr, nc) && wb[idx(er, ec)] === enemy && wb[idx(nr, nc)] === null) {
          wb[idx(er, ec)] = null
          wb[cur] = null
          cur = idx(nr, nc)
          wb[cur] = who
          path.push(cur)
          out.push({ from, path: path.slice() })
          r = nr; c = nc
        } else break
      }
    }
  }
  return out
}

/** Apply a fully-specified move (opening removal when path empty, else a capturing turn). */
function applyMove(board: Cell[], who: Stone, m: Move): Cell[] {
  const nb = board.slice()
  if (m.path.length === 0) { nb[m.from] = null; return nb }
  let cur = m.from
  for (const land of m.path) {
    const [cr, cc] = rc(cur), [lr, lc] = rc(land)
    const dr = Math.sign(lr - cr), dc = Math.sign(lc - cc)
    nb[idx(cr + dr, cc + dc)] = null // captured enemy
    nb[cur] = null
    nb[land] = who
    cur = land
  }
  return nb
}

function finish(s: KonaneState, board: Cell[], log: LogEntry[], winner: Stone): KonaneState {
  const youWon = winner === s.you
  return Object.assign({}, s, {
    board, turn: null, winner,
    log: push(log, youWon ? 'you' : 'ai', youWon ? 'The rival has no capture left — you win.' : 'You have no capture left — the rival wins.'),
  })
}

/** Make a move for `who`. In the opening phase `m.path` is [] and `m.from` is the stone removed. */
export function move(s: KonaneState, who: Stone, m: Move): KonaneState {
  if (s.winner || s.turn !== who) return s
  const opp = other(who)

  if (s.phase === 'open1' || s.phase === 'open2') {
    if (!openingRemovals(s, who).includes(m.from)) return s
    const board = applyMove(s.board, who, { from: m.from, path: [] })
    const nextPhase: Phase = s.phase === 'open1' ? 'open2' : 'play'
    const log = push(s.log, who === s.you ? 'you' : 'ai',
      `${who === s.you ? 'You lift' : 'Rival lifts'} a ${who === 'b' ? 'basalt' : 'coral'} stone at ${sq(m.from)}.`)
    return Object.assign({}, s, { board, turn: opp, phase: nextPhase, last: [m.from], log })
  }

  // play phase — validate against enumerated legal moves
  const legal = legalMoves(s.board, who)
  const ok = legal.find(L => L.from === m.from && L.path.length === m.path.length && L.path.every((p, k) => p === m.path[k]))
  if (!ok) return s
  const board = applyMove(s.board, who, ok)
  const caps = ok.path.length
  const log = push(s.log, who === s.you ? 'you' : 'ai',
    `${who === s.you ? 'You jump' : 'Rival jumps'} ${sq(ok.from)}→${sq(ok.path[ok.path.length - 1])}, capturing ${caps}.`)

  if (!legalMoves(board, opp).length) return finish(Object.assign({}, s, { last: [ok.from, ...ok.path] }), board, log, who)
  return Object.assign({}, s, { board, turn: opp, last: [ok.from, ...ok.path], log })
}

// ===== AI: alpha-beta, eval = mobility (dominant) + material =====
function evalBoard(board: Cell[], me: Stone): number {
  const opp = other(me)
  const myMob = legalMoves(board, me).length, opMob = legalMoves(board, opp).length
  const { b, w } = counts(board)
  const mat = me === 'b' ? b - w : w - b
  return 10 * (myMob - opMob) + mat
}

function search(board: Cell[], toMove: Stone, me: Stone, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, toMove)
  if (!moves.length) {
    // toMove has no capture and loses immediately
    return toMove === me ? -100000 - depth : 100000 + depth
  }
  if (depth === 0) return evalBoard(board, me)
  if (toMove === me) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(board, toMove, m), other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      best = Math.min(best, search(applyMove(board, toMove, m), other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}

export function aiMove(s: KonaneState): KonaneState {
  if (s.winner || s.turn !== 'w') return s
  const me: Stone = 'w'

  // opening removal: pick deterministically-ish among legal removals
  if (s.phase === 'open1' || s.phase === 'open2') {
    const rem = openingRemovals(s, me)
    if (!rem.length) return s
    const choice = rem[(Math.random() * rem.length) | 0]
    return move(s, me, { from: choice, path: [] })
  }

  const moves = legalMoves(s.board, me)
  if (!moves.length) return s // shouldn't happen (move() ends the game first), but be safe
  const depth = 3
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(applyMove(s.board, me, m), other(me), me, depth - 1, -Infinity, Infinity)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return move(s, me, choice)
}
