/* MIJNLIEFF — pure logic (built for this codebase).
   2-player abstract placement on a 4x4 board. You are player 0 and move first; the AI is
   player 1. Each player owns 8 pieces: two each of FOUR types whose placed piece dictates
   where the OPPONENT may next play.

   Placement constraints (relative to the just-placed piece's square):
     STRAIGHT — opponent must play on the same ROW or COLUMN (any distance).
     DIAGONAL — opponent must play on a DIAGONAL line (any distance).
     NEAR     — opponent must play on a square king-adjacent (chebyshev distance 1).
     FAR      — opponent must play on a square that is NOT adjacent (chebyshev distance >= 2).
   First move of the game may NOT be on the 4 centre cells; otherwise no constraint applies
   to the very first move. If a player has pieces but no legal square, they PASS; play
   continues until neither side can place (or both are out of pieces).

   Scoring (when placement ends): every maximal-or-sub line of 3+ same-owner pieces in a row
   (orthogonal or diagonal) scores — a line of exactly 3 = 1 pt, a line of 4 = 2 pts. Most
   points wins; equal points is a draw. */

export const N = 4
export const SIZE = N * N

export type Player = 0 | 1
export type PieceType = 'straight' | 'diagonal' | 'near' | 'far'
export const TYPES: PieceType[] = ['straight', 'diagonal', 'near', 'far']

export interface Piece { owner: Player; type: PieceType }
export interface LastPiece { cell: number; type: PieceType; owner: Player }
export interface LogEntry { t: string; x: string }

export interface State {
  board: (Piece | null)[]      // length 16, index = r*4 + c
  turn: Player | null          // whose turn, null when game over
  hands: [Record<PieceType, number>, Record<PieceType, number>] // pieces remaining per type
  last: LastPiece | null       // the opponent's last placed piece (drives the constraint)
  passed: [boolean, boolean]   // whether each player had to pass on their last opportunity
  winner: Player | 'draw' | null
  scores: [number, number]
  lines: number[][] | null     // scoring lines highlighted at the end
  log: LogEntry[]
}

const other = (p: Player): Player => (p === 0 ? 1 : 0)
export const rc = (i: number): [number, number] => [Math.floor(i / N), i % N]
export const idx = (r: number, c: number) => r * N + c
const inb = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N
const CENTERS = new Set([idx(1, 1), idx(1, 2), idx(2, 1), idx(2, 2)])
const cheb = (a: number, b: number) => {
  const [ar, ac] = rc(a), [br, bc] = rc(b)
  return Math.max(Math.abs(ar - br), Math.abs(ac - bc))
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

function emptyHand(): Record<PieceType, number> {
  return { straight: 2, diagonal: 2, near: 2, far: 2 }
}

export function handCount(h: Record<PieceType, number>): number {
  return h.straight + h.diagonal + h.near + h.far
}

export function makeGame(): State {
  return {
    board: new Array(SIZE).fill(null),
    turn: 0,
    hands: [emptyHand(), emptyHand()],
    last: null,
    passed: [false, false],
    winner: null,
    scores: [0, 0],
    lines: null,
    log: [{ t: 'sys', x: 'You move first. Avoid the four centre cells on the opening play.' }],
  }
}

/* Does `cell` satisfy the constraint imposed by `last`?  With no last piece (first move),
   only the centre-ban applies. */
export function satisfiesConstraint(cell: number, last: LastPiece | null): boolean {
  if (last == null) return !CENTERS.has(cell)
  if (cell === last.cell) return false
  const [r, c] = rc(cell), [lr, lc] = rc(last.cell)
  switch (last.type) {
    case 'straight': return r === lr || c === lc
    case 'diagonal': return Math.abs(r - lr) === Math.abs(c - lc)
    case 'near': return cheb(cell, last.cell) === 1
    case 'far': return cheb(cell, last.cell) >= 2
  }
}

/* Legal target cells for the player to move, given the current `last` constraint.
   Does not consider which piece TYPE will be placed (any owned type may go on a legal cell). */
export function legalPlacements(s: State): number[] {
  if (s.turn == null) return []
  if (handCount(s.hands[s.turn]) === 0) return []
  const out: number[] = []
  for (let i = 0; i < SIZE; i++) {
    if (s.board[i] != null) continue
    if (satisfiesConstraint(i, s.last)) out.push(i)
  }
  return out
}

export function hasType(s: State, p: Player, type: PieceType): boolean {
  return s.hands[p][type] > 0
}

/* Place piece `type` for the current player on `cell`. Returns a new state; if the move is
   illegal (wrong cell, no such piece, game over) returns the same state unchanged. */
export function place(s: State, cell: number, type: PieceType): State {
  if (s.winner != null || s.turn == null) return s
  const p = s.turn
  if (s.hands[p][type] <= 0) return s
  if (s.board[cell] != null) return s
  if (!satisfiesConstraint(cell, s.last)) return s

  const board = s.board.slice()
  board[cell] = { owner: p, type }
  const hands: State['hands'] = [{ ...s.hands[0] }, { ...s.hands[1] }]
  hands[p][type] -= 1
  const [r, c] = rc(cell)
  const who = p === 0 ? 'You' : 'AI'
  let log = push(s.log, p === 0 ? 'you' : 'ai', `${who} placed a ${type} piece at r${r + 1}c${c + 1}.`)

  const next: State = {
    ...s,
    board,
    hands,
    last: { cell, type, owner: p },
    passed: [false, false],
    turn: other(p),
    log,
  }
  return advance(next)
}

/* After a placement (or to begin a turn), resolve passes and detect the end of the game.
   The player to move stays as set; if they cannot move we mark a pass and hand to the other,
   ending the game when both sides cannot move. */
function advance(s: State): State {
  let cur = s
  for (let guard = 0; guard < 4; guard++) {
    if (cur.turn == null) break
    const p = cur.turn
    const canPlace = handCount(cur.hands[p]) > 0 && legalPlacements(cur).length > 0
    if (canPlace) {
      // a real turn is available; clear my pass flag and proceed
      const passed: State['passed'] = [cur.passed[0], cur.passed[1]]
      passed[p] = false
      return { ...cur, passed }
    }
    // p cannot move -> pass
    const passed: State['passed'] = [cur.passed[0], cur.passed[1]]
    passed[p] = true
    const reason = handCount(cur.hands[p]) === 0 ? 'is out of pieces' : 'has no legal square'
    const log = push(cur.log, 'sys', `${p === 0 ? 'You' : 'AI'} ${reason} — pass.`)
    if (passed[0] && passed[1]) {
      return finish({ ...cur, passed, log })
    }
    cur = { ...cur, passed, log, turn: other(p) }
  }
  return cur
}

/* Enumerate the scoring lines (length 3 and length 4) for an owner. We collect every window
   of 3 and every window of 4 along each of the 4 orientations, fully owned by `who`. A
   length-3 window scores 1; a length-4 line scores 2 (and we don't also double-count its two
   length-3 sub-windows). */
const DIRS: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]]

export function scoreLines(board: (Piece | null)[], who: Player): { points: number; lines: number[][] } {
  let points = 0
  const lines: number[][] = []
  const counted4 = new Set<string>()
  // length-4 lines first
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (const [dr, dc] of DIRS) {
        const cells: number[] = []
        let ok = true
        for (let k = 0; k < 4; k++) {
          const nr = r + dr * k, nc = c + dc * k
          if (!inb(nr, nc)) { ok = false; break }
          const cell = board[idx(nr, nc)]
          if (cell == null || cell.owner !== who) { ok = false; break }
          cells.push(idx(nr, nc))
        }
        if (ok) {
          points += 2
          lines.push(cells)
          counted4.add(cells.join(','))
          // record both length-3 sub-windows so they're excluded from the 3-scan
          counted4.add(cells.slice(0, 3).join(','))
          counted4.add(cells.slice(1, 4).join(','))
        }
      }
    }
  }
  // length-3 lines not already part of a counted 4
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (const [dr, dc] of DIRS) {
        const cells: number[] = []
        let ok = true
        for (let k = 0; k < 3; k++) {
          const nr = r + dr * k, nc = c + dc * k
          if (!inb(nr, nc)) { ok = false; break }
          const cell = board[idx(nr, nc)]
          if (cell == null || cell.owner !== who) { ok = false; break }
          cells.push(idx(nr, nc))
        }
        if (ok && !counted4.has(cells.join(','))) {
          points += 1
          lines.push(cells)
        }
      }
    }
  }
  return { points, lines }
}

function finish(s: State): State {
  const a = scoreLines(s.board, 0)
  const b = scoreLines(s.board, 1)
  const scores: [number, number] = [a.points, b.points]
  let winner: State['winner']
  if (a.points > b.points) winner = 0
  else if (b.points > a.points) winner = 1
  else winner = 'draw'
  const lines = a.lines.concat(b.lines)
  const log = push(
    s.log,
    'sys',
    `Game over — You ${a.points} · AI ${b.points}. ${winner === 'draw' ? 'A draw.' : winner === 0 ? 'You win!' : 'AI wins.'}`,
  )
  return { ...s, turn: null, winner, scores, lines, log }
}

// ===== AI =====

/* Evaluate the board from player `me`'s perspective: own line potential minus opponent's. */
function evaluate(board: (Piece | null)[], me: Player): number {
  const opp = other(me)
  let score = 0
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (const [dr, dc] of DIRS) {
        let mine = 0, theirs = 0, empty = 0, valid = true
        for (let k = 0; k < 3; k++) {
          const nr = r + dr * k, nc = c + dc * k
          if (!inb(nr, nc)) { valid = false; break }
          const cell = board[idx(nr, nc)]
          if (cell == null) empty++
          else if (cell.owner === me) mine++
          else theirs++
        }
        if (!valid) continue
        // mixed lines are dead; count only single-owner (or empty) windows
        if (mine > 0 && theirs === 0) score += [0, 1, 6, 30][mine]
        if (theirs > 0 && mine === 0) score -= [0, 1, 6, 30][theirs]
      }
    }
  }
  return score
}

/* Count the legal replies the opponent would have after `me` places `type` at `cell`. */
function opponentReplies(s: State, cell: number, type: PieceType, me: Player): number {
  const last: LastPiece = { cell, type, owner: me }
  const opp = other(me)
  if (handCount(s.hands[opp]) === 0) return 0
  let n = 0
  for (let i = 0; i < SIZE; i++) {
    if (i === cell || s.board[i] != null) continue
    if (satisfiesConstraint(i, last)) n++
  }
  return n
}

/* Pick and play the AI's move: for each legal (cell, owned-type) it scores the resulting
   board for itself, strongly rewards leaving the opponent few legal replies (the core tactic),
   and prefers spending the type that restricts the opponent most. Fast — at most 16*4 options. */
export function aiTurn(s: State): State {
  if (s.winner != null || s.turn == null) return s
  const me = s.turn
  const cells = legalPlacements(s)
  if (cells.length === 0) return advance(s) // will register a pass / end

  const owned = TYPES.filter(t => s.hands[me][t] > 0)
  let best = -Infinity
  let bestCell = cells[0]
  let bestType: PieceType = owned[0] ?? 'straight'

  for (const cell of cells) {
    const board = s.board.slice()
    for (const type of owned) {
      board[cell] = { owner: me, type }
      const positional = evaluate(board, me)
      const replies = opponentReplies(s, cell, type, me)
      // fewer opponent replies is better; a forced opponent-pass is very strong
      const restrict = replies === 0 ? 40 : Math.max(0, 14 - replies * 2)
      const v = positional * 3 + restrict + Math.random() * 0.5
      if (v > best) { best = v; bestCell = cell; bestType = type }
    }
    board[cell] = null
  }
  return place(s, bestCell, bestType)
}

export function winner(s: State): State['winner'] {
  return s.winner
}
