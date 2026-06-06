/* TIC-TAC-TOE — logic (built for this codebase, not ported).
   Classic 3x3. You are X and move first; the AI is O and plays a perfect minimax game,
   so the best you can force is a draw. Pure, immutable transitions. */

export type Mark = 'x' | 'o'
export type Cell = Mark | null
export interface LogEntry { t: string; x: string }

export interface TTTState {
  board: Cell[]            // length 9, row-major
  turn: Mark | null
  you: Mark
  winner: Mark | 'draw' | null
  line: number[] | null    // winning triple, for highlight
  log: LogEntry[]
}

const WINS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

const other = (m: Mark): Mark => m === 'x' ? 'o' : 'x'

function outcome(board: Cell[]): { winner: Mark | 'draw' | null; line: number[] | null } {
  for (const ln of WINS) {
    const [a, b, c] = ln
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a] as Mark, line: ln }
  }
  if (board.every(Boolean)) return { winner: 'draw', line: null }
  return { winner: null, line: null }
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-20) }

export function makeGame(): TTTState {
  return {
    board: new Array(9).fill(null),
    turn: 'x', you: 'x', winner: null, line: null,
    log: [{ t: 'sys', x: 'You are X and move first. Beat a perfect player — good luck.' }],
  }
}

export function place(s: TTTState, i: number, who: Mark): TTTState {
  if (s.winner || s.turn !== who || s.board[i]) return s
  const board = s.board.slice(); board[i] = who
  const { winner, line } = outcome(board)
  const turn = winner ? null : other(who)
  let log = push(s.log, who === s.you ? 'you' : 'ai', `${who === s.you ? 'You' : 'Rival'} played ${'ABC'[i % 3]}${Math.floor(i / 3) + 1}.`)
  if (winner === 'draw') log = push(log, 'sys', 'A draw — perfectly played.')
  else if (winner) log = push(log, winner === s.you ? 'you' : 'ai', `${winner === s.you ? 'You win' : 'Rival wins'}.`)
  return Object.assign({}, s, { board, turn, winner, line, log })
}

// ===== AI: perfect minimax (O maximises) =====
function score(board: Cell[], depth: number): number {
  const { winner } = outcome(board)
  if (winner === 'o') return 10 - depth
  if (winner === 'x') return depth - 10
  if (winner === 'draw') return 0
  return NaN // not terminal
}
function minimax(board: Cell[], player: Mark, depth: number): number {
  const term = score(board, depth)
  if (!Number.isNaN(term)) return term
  const scores: number[] = []
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue
    const nb = board.slice(); nb[i] = player
    scores.push(minimax(nb, other(player), depth + 1))
  }
  return player === 'o' ? Math.max(...scores) : Math.min(...scores)
}

export function aiMove(s: TTTState): TTTState {
  if (s.winner || s.turn !== 'o') return s
  let best = -Infinity, move = -1
  for (let i = 0; i < 9; i++) {
    if (s.board[i]) continue
    const nb = s.board.slice(); nb[i] = 'o'
    const v = minimax(nb, 'x', 1)
    if (v > best) { best = v; move = i }
  }
  return place(s, move, 'o')
}
