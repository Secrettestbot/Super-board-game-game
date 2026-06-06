/* SENET — pure logic (built for this codebase, not ported).
   Ancient Egyptian race game. You = player 0; AI = player 1.

   BOARD: 30 squares (indices 0..29 internally; "square 1..30" to the player) laid out as
   3 rows of 10, traversed in a BOUSTROPHEDON path:
     row 0 (top)    left→right  → squares 1..10  (path index 0..9)
     row 1 (mid)    right→left  → squares 11..20 (path index 10..19)
     row 2 (bottom) left→right  → squares 21..30 (path index 20..29)
   Path index === "square number - 1", so the path IS the square ordering. The boustrophedon
   only affects the PHYSICAL row/col rendering, not the linear movement order.

   PAWNS: 5 per player, starting on the first row interleaved
     (player 0 on squares 1,3,5,7,9 ; player 1 on squares 2,4,6,8,10).

   THROW: 4 casting sticks, each shows white(1) or blank(0).
     move = count of white sides, EXCEPT "all blank" (0 white) = 5.
     So move ∈ {1,2,3,4,5}. A throw of 1, 4 or 5 grants an EXTRA throw.

   MOVE: advance ONE pawn forward by the thrown amount onto
     - an EMPTY square, or
     - a square holding a single OPPONENT pawn → SWAP (opponent pawn goes to the mover's
       origin square). You may NOT land on your own pawn.
   BLOCKS: two adjacent opponent pawns (consecutive path squares both opponent-owned) form a
     BLOCK — you cannot land on either, and cannot PASS over them. Three in a row = safe blockade
     (same rule; just more of them).
   SPECIAL SQUARES (square numbers):
     26 House of Beauty — a rest (safe; no special effect needed beyond flavour).
     27 House of Water — landing there sends the pawn back to square 15 (path idx 14); if 15 is
        occupied, to the nearest empty square before it (re-entry).
     28, 29 — require EXACT throws to bear off (you can only leave by an exact throw past 30).
     30 House of Horus — reaching it bears the pawn OFF.
   Bearing off: a pawn on path idx p bears off when p + move === 30 (exact). Overshooting 30 is
     illegal. Square 30 itself (idx 29) bears off on any throw that would move it past (i.e. any
     throw ≥ 1 → exact since 29+1=30). Squares 28/29 (idx 27/28) need throws of exactly 2/1 etc.

   WIN: first player to bear ALL pawns off the board. */

export type Player = 0 | 1

export const SQUARES = 30
export const PAWNS = 5
export const OFF = 30 // path index meaning "borne off"

export const WATER = 26 // square 27 → path idx 26
export const WATER_BACK = 14 // square 15 → path idx 14
export const BEAUTY = 25 // square 26 → path idx 25 (House of Beauty, rest)
export const HORUS = 29 // square 30 → path idx 29 (House of Horus, bear-off)

export type Phase = 'throw' | 'move'

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface SenetState {
  /** board[pathIdx] = owning player (0|1) or null if empty. Length 30. */
  board: (Player | null)[]
  /** pawns borne off, per player. */
  off: [number, number]
  turn: Player
  /** last throw value (1..5) or null before throwing this turn. */
  roll: number | null
  /** the four stick faces (0/1) of the last throw. */
  sticks: [number, number, number, number]
  /** true if the last throw granted an extra throw (1/4/5). */
  extra: boolean
  phase: Phase
  winner: Player | null
  log: LogEntry[]
}

const NAME: Record<Player, string> = { 0: 'You', 1: 'The rival' }
const other = (p: Player): Player => (p === 0 ? 1 : 0)

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

/* ---- Boustrophedon physical layout: path index → [row, col] and back ---- */
export const COLS = 10
export const ROWS = 3
/** Physical [row,col] of a path index (0..29). */
export function cellOf(pathIdx: number): [number, number] {
  const row = Math.floor(pathIdx / COLS)
  const within = pathIdx % COLS
  const col = row === 1 ? COLS - 1 - within : within // middle row runs right→left
  return [row, col]
}
/** Inverse: physical [row,col] → path index. */
export function pathOf(row: number, col: number): number {
  const within = row === 1 ? COLS - 1 - col : col
  return row * COLS + within
}

export function makeGame(): SenetState {
  const board: (Player | null)[] = new Array(SQUARES).fill(null)
  // interleave on first row: you on squares 1,3,5,7,9 (idx 0,2,4,6,8); foe on 2,4,6,8,10 (idx 1,3,5,7,9)
  for (let i = 0; i < PAWNS; i++) {
    board[i * 2] = 0
    board[i * 2 + 1] = 1
  }
  return {
    board,
    off: [0, 0],
    turn: 0,
    roll: null,
    sticks: [0, 0, 0, 0],
    extra: false,
    phase: 'throw',
    winner: null,
    log: [{ t: 'sys', x: 'You are the dark pawns. Cast the four sticks and race your five pawns off the board.' }],
  }
}

/* ---- Throwing the sticks ----
   randFn lets tests inject deterministic faces. Returns the four 0/1 faces. */
export function castSticks(randFn: () => number = Math.random): [number, number, number, number] {
  return [
    randFn() < 0.5 ? 1 : 0,
    randFn() < 0.5 ? 1 : 0,
    randFn() < 0.5 ? 1 : 0,
    randFn() < 0.5 ? 1 : 0,
  ]
}

/** Convert four stick faces to a move value: count of whites, all-blank = 5. */
export function rollFromSticks(sticks: [number, number, number, number]): number {
  const whites = sticks[0] + sticks[1] + sticks[2] + sticks[3]
  return whites === 0 ? 5 : whites
}

/** Does this roll grant an extra throw? (1, 4 or 5.) */
export function grantsExtra(roll: number): boolean {
  return roll === 1 || roll === 4 || roll === 5
}

/**
 * Apply a throw to the state for the current player. Sets sticks/roll/extra and moves to the
 * 'move' phase. If the player has NO legal move with the roll, the turn passes to the opponent
 * (back to 'throw'). `randFn` injectable for tests. Guarded: only valid in 'throw' phase.
 */
export function throwSticks(state: SenetState, randFn: () => number = Math.random): SenetState {
  if (state.winner != null || state.phase !== 'throw') return state
  const sticks = castSticks(randFn)
  const roll = rollFromSticks(sticks)
  const extra = grantsExtra(roll)
  const who = state.turn
  let log = push(state.log, who === 0 ? 'you' : 'ai', `${NAME[who]} cast a ${roll}.`)
  if (legalMoves(state, who, roll).length === 0) {
    log = push(log, 'sys', `No legal move with a ${roll}. Turn passes.`)
    return Object.assign({}, state, { sticks, roll, extra: false, phase: 'throw' as Phase, turn: other(who), log })
  }
  return Object.assign({}, state, { sticks, roll, extra, phase: 'move' as Phase, log })
}

/** Path indices occupied by a given player (not borne off). */
function pawnsOf(state: SenetState, p: Player): number[] {
  const out: number[] = []
  for (let i = 0; i < SQUARES; i++) if (state.board[i] === p) out.push(i)
  return out
}

/**
 * Is path square `idx` blocked for `mover` to LAND on? A square is land-blocked if it's part of a
 * two-or-more consecutive run of opponent pawns. (A lone opponent pawn is capturable via swap.)
 */
function isLandBlocked(state: SenetState, mover: Player, idx: number): boolean {
  const foe = other(mover)
  if (state.board[idx] !== foe) return false
  const leftFoe = idx > 0 && state.board[idx - 1] === foe
  const rightFoe = idx < SQUARES - 1 && state.board[idx + 1] === foe
  return leftFoe || rightFoe
}

/**
 * Can `mover` PASS OVER path square `idx` on the way to its destination? Blocked if `idx` and an
 * adjacent square are both opponent pawns (a block wall).
 */
function isPassBlocked(state: SenetState, mover: Player, idx: number): boolean {
  const foe = other(mover)
  if (state.board[idx] !== foe) return false
  const leftFoe = idx > 0 && state.board[idx - 1] === foe
  const rightFoe = idx < SQUARES - 1 && state.board[idx + 1] === foe
  return leftFoe || rightFoe
}

/** Destination path index (or OFF) for moving the pawn at `from` by `move`, or null if illegal. */
export function destOf(state: SenetState, mover: Player, from: number, move: number): number | OffMarker | null {
  if (move <= 0) return null
  if (state.board[from] !== mover) return null
  const to = from + move
  // bearing off: must be exact (to === SQUARES). Overshoot illegal.
  if (to === SQUARES) {
    // passing-over check for any blocks strictly between from and 30
    for (let i = from + 1; i < SQUARES; i++) if (isPassBlocked(state, mover, i)) return null
    return OFF
  }
  if (to > SQUARES) return null // overshoot: not allowed
  // can't pass a block wall on intermediate squares
  for (let i = from + 1; i < to; i++) if (isPassBlocked(state, mover, i)) return null
  // landing
  if (state.board[to] === mover) return null // own pawn
  if (isLandBlocked(state, mover, to)) return null // 2+ opponent block
  return to // empty OR single opponent (swap)
}

type OffMarker = typeof OFF

/** Path indices of the mover's pawns that have a legal move with this roll. */
export function legalMoves(state: SenetState, mover: Player, move: number): number[] {
  const out: number[] = []
  for (const from of pawnsOf(state, mover)) {
    if (destOf(state, mover, from, move) != null) out.push(from)
  }
  return out
}

/**
 * Move the current player's pawn from path index `fromSquare` by the current roll. Handles swap,
 * water setback, bear-off, win, and extra-throw vs turn-pass. Guarded: only in 'move' phase, only
 * for a pawn that has a legal destination.
 */
export function movePawn(state: SenetState, mover: Player, fromSquare: number): SenetState {
  if (state.winner != null || state.turn !== mover || state.phase !== 'move' || state.roll == null) return state
  const move = state.roll
  const dest = destOf(state, mover, fromSquare, move)
  if (dest == null) return state

  const board = state.board.slice()
  const off: [number, number] = [state.off[0], state.off[1]]
  let log = state.log

  if (dest === OFF) {
    board[fromSquare] = null
    off[mover] += 1
    log = push(log, mover === 0 ? 'you' : 'ai', `${NAME[mover]} bore a pawn off.`)
  } else {
    const to = dest as number
    const occupant = board[to]
    board[fromSquare] = null
    if (occupant != null && occupant !== mover) {
      // swap the lone opponent pawn back to the mover's origin
      board[fromSquare] = occupant
      log = push(log, mover === 0 ? 'you' : 'ai', `${NAME[mover]} swapped a ${NAME[other(mover)].toLowerCase()} pawn back.`)
    }
    board[to] = mover
    // House of Water: landing on square 27 (idx 26) sends pawn back to square 15 (idx 14),
    // or the nearest empty square before it if occupied.
    if (to === WATER) {
      let back = WATER_BACK
      while (back >= 0 && board[back] != null) back -= 1
      board[to] = null
      if (back >= 0) {
        board[back] = mover
        log = push(log, mover === 0 ? 'you' : 'ai', `${NAME[mover]} fell in the House of Water — swept back to square ${back + 1}.`)
      } else {
        // no room: send it off the front (re-enter later) — re-place at origin-most empty; fall back to start search
        let f = 0
        while (f < SQUARES && board[f] != null) f += 1
        if (f < SQUARES) board[f] = mover
        log = push(log, mover === 0 ? 'you' : 'ai', `${NAME[mover]} fell in the House of Water and re-entered at square ${f + 1}.`)
      }
    }
  }

  // win?
  if (off[mover] === PAWNS) {
    log = push(log, mover === 0 ? 'you' : 'ai', `${NAME[mover]} bore the last pawn off — ${mover === 0 ? 'you win' : 'the rival wins'}!`)
    return Object.assign({}, state, { board, off, winner: mover, phase: 'throw' as Phase, roll: null, log })
  }

  // extra throw? mover keeps the turn and throws again.
  if (state.extra) {
    log = push(log, mover === 0 ? 'you' : 'ai', `${NAME[mover]} earned an extra throw.`)
    return Object.assign({}, state, { board, off, phase: 'throw' as Phase, roll: null, extra: false, turn: mover, log })
  }

  return Object.assign({}, state, { board, off, phase: 'throw' as Phase, roll: null, extra: false, turn: other(mover), log })
}

/* ===== AI: progress-biased heuristic ===== */

/** Score a candidate move for the AI — bigger is better. Progress-biased so self-play terminates. */
export function scoreMove(state: SenetState, mover: Player, from: number, move: number): number {
  const dest = destOf(state, mover, from, move)
  if (dest == null) return -Infinity
  let score = 0
  if (dest === OFF) {
    score += 1000 // bearing a pawn off is best
    return score
  }
  const to = dest as number
  // capturing/swapping a lone opponent pawn that's ahead is good
  const occupant = state.board[to]
  if (occupant != null && occupant !== mover) score += 300
  // strongly avoid the water trap
  if (to === WATER) score -= 800
  // advance lead pawns: reward forward progress (path index)
  score += to * 4
  // mild bonus for forming a block with a neighbouring own pawn (defensive)
  const foe = other(mover)
  if ((to > 0 && state.board[to - 1] === mover) || (to < SQUARES - 1 && state.board[to + 1] === mover)) score += 20
  // slight penalty for sitting next to where an opponent could swap us isn't modelled; keep simple/fast
  void foe
  return score
}

/**
 * One AI sub-step: if in 'throw' phase, cast; else play the best legal move. Mirrors the
 * single-sub-move shape of Ur's aiStep so useAITurn can drive it across extra throws.
 * `randFn` injectable for tests.
 */
export function aiStep(state: SenetState, randFn: () => number = Math.random): SenetState {
  if (state.winner != null || state.turn !== 1) return state
  if (state.phase === 'throw') return throwSticks(state, randFn)
  const move = state.roll
  if (move == null) return state
  const moves = legalMoves(state, 1, move)
  if (moves.length === 0) {
    // shouldn't happen (throwSticks passes on dead rolls), but stay safe
    return Object.assign({}, state, { phase: 'throw' as Phase, roll: null, extra: false, turn: 0 })
  }
  let best = moves[0]
  let bestV = -Infinity
  for (const from of moves) {
    const v = scoreMove(state, 1, from, move)
    if (v > bestV) { bestV = v; best = from }
  }
  return movePawn(state, 1, best)
}

/** Convenience: run a full AI turn (throw + move, looping through extra throws) to completion. */
export function aiTurn(state: SenetState, randFn: () => number = Math.random): SenetState {
  let s = state
  let guard = 0
  while (s.winner == null && s.turn === 1 && guard < 64) {
    s = aiStep(s, randFn)
    guard += 1
  }
  return s
}

export const winner = (s: SenetState): Player | null => s.winner
