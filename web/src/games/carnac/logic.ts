/* CARNAC — logic (built for this codebase, not ported).
   A Breton field of standing stones, themed as Domineering on a 6-wide × 7-tall grid.

   ORIENTATION: the board is COLS=6 columns across × ROWS=7 rows tall. Index = r*COLS + c,
   with r = 0 at the TOP row and c = 0 at the LEFT column.

   YOU are the MENHIR player ("standing stones") and place VERTICAL dominoes — a cell and
   the cell directly BELOW it (r and r+1, same column). The AI is the DOLMEN player
   ("lying stones") and places HORIZONTAL dominoes — a cell and the cell directly to its
   RIGHT (c and c+1, same row). A placement is legal only when both target cells are
   in-bounds and empty. The first player who CANNOT place a domino in their orientation
   LOSES — this is Domineering, a clean combinatorial game. The AI searches it with
   alpha-beta over a parity/mobility evaluation. */

export const COLS = 6
export const ROWS = 7

export type Side = 'm' | 'd'            // m = Menhir (you, vertical), d = Dolmen (ai, horizontal)
export type Cell = Side | null
export interface LogEntry { t: string; x: string }

export interface CarnacState {
  board: Cell[]            // length COLS*ROWS, index = r*COLS + c
  turn: Side | null
  you: Side                // always 'm'
  winner: Side | null
  last: [number, number] | null   // the two cells of the most recent placement
  log: LogEntry[]
}

const other = (s: Side): Side => s === 'm' ? 'd' : 'm'
export const idx = (r: number, c: number) => r * COLS + c

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

export function makeGame(): CarnacState {
  const board: Cell[] = new Array(COLS * ROWS).fill(null)
  return {
    board, turn: 'm', you: 'm', winner: null, last: null,
    log: [{ t: 'sys', x: 'Dusk on the Breton field. You raise menhirs (vertical); the rival lays dolmens (horizontal). First who cannot place loses.' }],
  }
}

// Each move is identified by its anchor cell `i`; the partner is i+COLS (menhir, down)
// or i+1 (dolmen, right). Returns the list of legal anchor indices for `who`.
export function legalMoves(board: Cell[], who: Side): number[] {
  const out: number[] = []
  if (who === 'm') {
    // vertical: cell (r,c) + (r+1,c). r from 0..ROWS-2
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idx(r, c)
        if (!board[i] && !board[i + COLS]) out.push(i)
      }
    }
  } else {
    // horizontal: cell (r,c) + (r,c+1). c from 0..COLS-2
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const i = idx(r, c)
        if (!board[i] && !board[i + 1]) out.push(i)
      }
    }
  }
  return out
}

// the two cell indices a domino with anchor `i` occupies for side `who`
export function cellsOf(i: number, who: Side): [number, number] {
  return who === 'm' ? [i, i + COLS] : [i, i + 1]
}

function apply(board: Cell[], i: number, who: Side): Cell[] {
  const nb = board.slice()
  const [a, b] = cellsOf(i, who)
  nb[a] = who; nb[b] = who
  return nb
}

export function place(s: CarnacState, i: number, who: Side): CarnacState {
  if (s.winner || s.turn !== who) return s
  if (!legalMoves(s.board, who).includes(i)) return s
  const [a, b] = cellsOf(i, who)
  const board = s.board.slice(); board[a] = who; board[b] = who
  const ra = Math.floor(a / COLS), ca = a % COLS
  const clabel = `${'ABCDEF'[ca]}${ra + 1}`
  const word = who === s.you ? 'You raise a menhir at' : 'Rival lays a dolmen at'
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${word} ${clabel}.`)
  const opp = other(who)
  if (legalMoves(board, opp).length) {
    return Object.assign({}, s, { board, turn: opp, last: [a, b] as [number, number], log })
  }
  // opponent cannot move — they lose, `who` wins
  const winner = who
  const youWon = winner === s.you
  log = push(log, youWon ? 'you' : 'ai',
    youWon ? 'The rival has no room left to lie down — you win the field.'
           : 'You can raise no more standing stones — the rival wins the field.')
  return Object.assign({}, s, { board, turn: null, winner, last: [a, b] as [number, number], log })
}

// ===== AI: alpha-beta, terminal = side-to-move with no move loses =====
// Eval (from `me`'s view) is a mobility/parity heuristic: more reachable placements
// for me than for the opponent is good. Searched deep enough that endgames are exact.
function evalBoard(board: Cell[], me: Side): number {
  const opp = other(me)
  return legalMoves(board, me).length - legalMoves(board, opp).length
}

function search(board: Cell[], toMove: Side, me: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, toMove)
  if (!moves.length) {
    // side to move cannot place — they lose. Big score from me's perspective.
    return toMove === me ? -100000 : 100000
  }
  if (depth === 0) return evalBoard(board, me)
  if (toMove === me) {
    let best = -Infinity
    for (const i of moves) {
      best = Math.max(best, search(apply(board, i, toMove), other(toMove), me, depth - 1, alpha, beta))
      alpha = Math.max(alpha, best); if (alpha >= beta) break
    }
    return best
  } else {
    let best = Infinity
    for (const i of moves) {
      best = Math.min(best, search(apply(board, i, toMove), other(toMove), me, depth - 1, alpha, beta))
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
}

export function aiMove(s: CarnacState): CarnacState {
  if (s.winner || s.turn !== 'd') return s
  const me: Side = 'd'
  const moves = legalMoves(s.board, me)
  if (!moves.length) return s
  // depth scales up as the board fills (branching shrinks), staying exact late.
  const filled = s.board.filter(v => v).length
  const depth = filled >= COLS * ROWS - 24 ? 8 : 6
  let best = -Infinity
  const scored: { i: number; v: number }[] = []
  for (const i of moves) {
    const v = search(apply(s.board, i, me), other(me), me, depth - 1, -Infinity, Infinity)
    scored.push({ i, v })
    if (v > best) best = v
  }
  const top = scored.filter(o => o.v >= best - 1e-6).map(o => o.i)
  const choice = top[(Math.random() * top.length) | 0]
  return place(s, choice, me)
}
