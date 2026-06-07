/* PONG HAU K'I — logic (built for this codebase, not ported).
   A tiny blocking game on the classic 5-point board: a square with ONE diagonal running
   through the centre. Points: TL TR BL BR + the CENTRE C. You are Red and move first; the
   AI is Blue and plays PERFECTLY via minimax searched to terminal (the state space is tiny).
   Each side has 2 pieces; on a turn you SLIDE a piece along an edge into the single adjacent
   empty point. You WIN by blocking the rival so that on their turn they have no legal move.

   Note on the board graph: the authentic Pong Hau K'i board connects the centre to only the
   TL and BR corners (a single diagonal), not all four. Connecting the centre to all four
   corners makes the empty point always reachable by every side, so a player can NEVER be
   trapped and the game can never end — provably no terminal position exists. The single
   diagonal is what makes the game playable and winnable (6 distinct trap positions exist). */

export type Disc = 'r' | 'b'
export type Cell = Disc | null
export interface LogEntry { t: string; x: string }

// Points: 0=TL 1=TR 2=BL 3=BR 4=C
export const PT = { TL: 0, TR: 1, BL: 2, BR: 3, C: 4 } as const
export const NAMES = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right', 'Centre']

// Adjacency: the four square sides, plus ONE diagonal TL-C-BR through the centre.
// (TR and BL are corner-only; the centre bridges TL and BR.)
export const ADJ: number[][] = [
  /* TL */ [PT.TR, PT.BL, PT.C],
  /* TR */ [PT.TL, PT.BR],
  /* BL */ [PT.TL, PT.BR],
  /* BR */ [PT.TR, PT.BL, PT.C],
  /* C  */ [PT.TL, PT.BR],
]

export interface PHKState {
  board: Cell[]            // length 5, index by PT
  turn: Disc | null
  you: Disc
  winner: Disc | null
  last: number | null      // destination of the last slide
  log: LogEntry[]
}

const other = (d: Disc): Disc => d === 'r' ? 'b' : 'r'
function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): PHKState {
  const board: Cell[] = [null, null, null, null, null]
  board[PT.TL] = 'r'; board[PT.TR] = 'r'   // You (Red) on top
  board[PT.BL] = 'b'; board[PT.BR] = 'b'   // Rival (Blue) on bottom
  // centre empty
  return {
    board, turn: 'r', you: 'r', winner: null, last: null,
    log: [{ t: 'sys', x: "You are Red and move first. Slide into the empty point — and trap the rival so it can't move." }],
  }
}

export interface Move { from: number; to: number }

// A move slides a piece of `who` into THE adjacent empty point.
export function legalMoves(board: Cell[], who: Disc): Move[] {
  const out: Move[] = []
  for (let from = 0; from < board.length; from++) {
    if (board[from] !== who) continue
    for (const to of ADJ[from]) if (board[to] === null) out.push({ from, to })
  }
  return out
}

export function apply(board: Cell[], m: Move): Cell[] {
  const nb = board.slice()
  nb[m.to] = nb[m.from]; nb[m.from] = null
  return nb
}

// The side to move loses when it has no legal slide (boxed in).
export function isLoss(board: Cell[], toMove: Disc): boolean {
  return legalMoves(board, toMove).length === 0
}

function finish(s: PHKState, board: Cell[], log: LogEntry[], winner: Disc, last: number): PHKState {
  const youWon = winner === s.you
  const msg = `${youWon ? 'You boxed the rival in — you win.' : 'You were boxed in — the rival wins.'}`
  return Object.assign({}, s, { board, turn: null, winner, last, log: push(log, youWon ? 'you' : 'ai', msg) })
}

export function move(s: PHKState, m: Move, who: Disc): PHKState {
  if (s.winner || s.turn !== who) return s
  // validate
  if (s.board[m.from] !== who || s.board[m.to] !== null || !ADJ[m.from].includes(m.to)) return s
  const board = apply(s.board, m)
  const opp = other(who)
  const log = push(s.log, who === s.you ? 'you' : 'ai',
    `${who === s.you ? 'You' : 'Rival'} slid to ${NAMES[m.to]}.`)
  if (isLoss(board, opp)) return finish(Object.assign({}, s, {}), board, log, who, m.to)
  return Object.assign({}, s, { board, turn: opp, last: m.to, log })
}

// ===== AI: perfect minimax to terminal with a visited set to handle repeats =====
// Returns a score from `me`'s perspective: positive = me wins, magnitude rewards speed.
const WIN = 1000
function key(board: Cell[], toMove: Disc): string { return board.map(c => c ?? '.').join('') + toMove }

function search(board: Cell[], toMove: Disc, me: Disc, depth: number, seen: Set<string>): number {
  if (isLoss(board, toMove)) {
    // side to move can't move -> the OTHER side wins
    return toMove === me ? -(WIN - depth) : (WIN - depth)
  }
  if (depth >= 30) return 0 // depth cap: treat deep repetition as a draw-ish neutral
  const k = key(board, toMove)
  if (seen.has(k)) return 0 // repetition along this path: neutral, avoids infinite loops
  seen.add(k)
  const moves = legalMoves(board, toMove)
  let best = toMove === me ? -Infinity : Infinity
  for (const m of moves) {
    const v = search(apply(board, m), other(toMove), me, depth + 1, seen)
    if (toMove === me) { if (v > best) best = v }
    else { if (v < best) best = v }
  }
  seen.delete(k)
  return best
}

export function aiMove(s: PHKState): PHKState {
  if (s.winner || s.turn !== 'b') return s
  const me: Disc = 'b'
  const moves = legalMoves(s.board, me)
  if (!moves.length) return s
  let best = -Infinity
  const scored: { m: Move; v: number }[] = []
  for (const m of moves) {
    const v = search(apply(s.board, m), other(me), me, 0, new Set([key(s.board, me)]))
    scored.push({ m, v })
    if (v > best) best = v
  }
  // pick among the best; prefer the fastest win / slowest loss (search already encodes speed)
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.m)
  const choice = top[(Math.random() * top.length) | 0]
  return move(s, choice, me)
}
