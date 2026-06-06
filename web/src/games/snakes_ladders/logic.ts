/* SNAKES & LADDERS — pure logic (built for this codebase, not ported).
   4 players (you = 0, AI = 1,2,3), one token each. A 10x10 board numbered 1..100 in
   BOUSTROPHEDON order (row 0 = squares 1..10 left→right along the bottom, row 1 = 20..11
   right→left, …). Positions are 0..100, where 0 means "off-board at the start".

   On a turn the current player rolls one d6 and advances. If the destination is the BOTTOM
   of a ladder, climb to its top; if it is the HEAD of a snake, slide down to its tail.
   Win rule: REACH-OR-OVERSHOOT 100 wins (simple + consistent — any roll that lands on or
   past 100 finishes; we clamp the stored position to 100). Rolling a 6 grants an extra turn.

   No React / DOM here. Randomness is injectable + guarded for tests. */

export type LogEntry = { t: string; x: string }

export interface SLState {
  /** positions[player] = 0..100 (0 = off-board start, 100 = finished). */
  positions: number[]
  /** Snake/ladder transitions, keyed by the landing square → its destination square. */
  jumps: Record<number, number>
  turn: number              // 0..3 whose turn it is
  you: number               // always 0
  die: number | null        // last rolled face 1..6, null before any roll
  rolledSix: boolean         // was the last roll a 6 (grants an extra turn)
  extraTurn: boolean         // does the current player get to roll again (a 6, no win)?
  winner: number | null
  last: { player: number; from: number; via: number; to: number; jump: 'snake' | 'ladder' | null } | null
  step: number              // monotonic counter — bumped on EVERY action (drives the AI tick)
  log: LogEntry[]
}

export const PLAYERS = 4
export const SIZE = 10              // 10x10 board
export const GOAL = 100

export const NAMES = ['You', 'Coral', 'Indigo', 'Olive']

/** Default board: classic-style snakes (head→tail, head > tail) + ladders (bottom→top). */
export const DEFAULT_LADDERS: Record<number, number> = {
  1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100,
}
export const DEFAULT_SNAKES: Record<number, number> = {
  16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78,
}

/** Combine ladders + snakes into a single landing→destination map. */
export function defaultJumps(): Record<number, number> {
  return Object.assign({}, DEFAULT_LADDERS, DEFAULT_SNAKES)
}

/** Whether a jump at square `from`→`to` is a ladder (up) or a snake (down). */
export function jumpKind(from: number, to: number): 'snake' | 'ladder' {
  return to > from ? 'ladder' : 'snake'
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

/* ---- Boustrophedon geometry ---------------------------------------------------------
   Square N (1..100) → { row, col } where row 0 is the BOTTOM row. Even rows run left→right,
   odd rows run right→left. col 0 is the leftmost column. */
export function squareToRC(n: number): { row: number; col: number } {
  const idx = n - 1                       // 0-based index along the path
  const row = Math.floor(idx / SIZE)      // 0 = bottom row
  const within = idx % SIZE
  const col = row % 2 === 0 ? within : SIZE - 1 - within
  return { row, col }
}

/** Inverse: { row, col } (row 0 = bottom) → square number 1..100. */
export function rcToSquare(row: number, col: number): number {
  const within = row % 2 === 0 ? col : SIZE - 1 - col
  return row * SIZE + within + 1
}

export function makeGame(layout?: Record<number, number>): SLState {
  return {
    positions: new Array(PLAYERS).fill(0),
    jumps: layout ? Object.assign({}, layout) : defaultJumps(),
    turn: 0,
    you: 0,
    die: null,
    rolledSix: false,
    extraTurn: false,
    winner: null,
    last: null,
    step: 0,
    log: [{ t: 'sys', x: 'Roll the die and race to 100. Ladders lift you, snakes drag you back. A 6 rolls again.' }],
  }
}

/** Default randomness; injectable / guarded for tests. Returns 1..6. */
export function rollDie(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6)
}

/** Resolve a landing square through any snake/ladder. Returns final square + jump kind. */
export function resolveJump(s: SLState, square: number): { to: number; jump: 'snake' | 'ladder' | null } {
  const dest = s.jumps[square]
  if (dest == null) return { to: square, jump: null }
  return { to: dest, jump: jumpKind(square, dest) }
}

/**
 * Advance the given player's token by the current die, applying snakes/ladders + win check.
 * Reach-or-overshoot 100 wins (position clamped to 100). A 6 (without winning) sets extraTurn.
 */
export function moveToken(s: SLState, player: number): SLState {
  if (s.winner != null || s.turn !== player || s.die == null) return s
  const die = s.die
  const from = s.positions[player]
  let via = from + die

  const positions = s.positions.slice()
  let jump: 'snake' | 'ladder' | null = null
  let to: number

  if (via >= GOAL) {
    // reach-or-overshoot wins — clamp to 100, no jump applies at the finish
    via = via > GOAL ? GOAL : via
    to = GOAL
  } else {
    const r = resolveJump(s, via)
    to = r.to
    jump = r.jump
  }

  positions[player] = to
  const tag = player === 0 ? 'you' : 'ai'
  const nm = NAMES[player]
  let log = push(s.log, tag, `${nm} rolled ${die} → square ${via}.`)
  if (jump === 'ladder') log = push(log, tag, `${nm} climbed a ladder ${via} → ${to}!`)
  else if (jump === 'snake') log = push(log, tag, `${nm} hit a snake ${via} → ${to}.`)

  let st: SLState = Object.assign({}, s, {
    positions,
    last: { player, from, via, to, jump },
    step: s.step + 1,
    log,
  })

  if (to >= GOAL) {
    log = push(log, tag, player === 0 ? 'You reached 100 — you win!' : `${nm} reached 100 — ${nm} wins.`)
    return Object.assign({}, st, { winner: player, extraTurn: false, rolledSix: false, log })
  }

  // a 6 grants an extra turn (same player rolls again)
  if (s.rolledSix) {
    return Object.assign({}, st, { extraTurn: true })
  }
  return st
}

/** Roll for the current player and immediately move (one combined action). */
export function roll(s: SLState, rng: () => number = Math.random): SLState {
  if (s.winner != null) return s
  const die = rollDie(rng)
  const player = s.turn
  const six = die === 6
  const st: SLState = Object.assign({}, s, { die, rolledSix: six, extraTurn: false, step: s.step + 1 })
  return moveToken(st, player)
}

/** Advance the turn to the next player; resets per-turn roll bookkeeping. */
export function endTurn(s: SLState): SLState {
  if (s.winner != null) return s
  // if the current player earned an extra turn, they keep the turn (just re-arm the roll)
  if (s.extraTurn) {
    return Object.assign({}, s, { die: null, rolledSix: false, extraTurn: false, step: s.step + 1 })
  }
  const next = (s.turn + 1) % PLAYERS
  return Object.assign({}, s, {
    turn: next, die: null, rolledSix: false, extraTurn: false, step: s.step + 1,
  })
}

/* ===================== AI (minimal — it just rolls) ===================== */

/** One AI sub-step: roll+move, then end the turn (unless an extra turn was earned). Driven by useAITurn. */
export function aiStep(s: SLState, rng: () => number = Math.random): SLState {
  if (s.winner != null) return s
  if (s.turn === 0) return s            // never auto-play the human
  // if the AI hasn't rolled this turn (or just earned an extra turn), roll; otherwise end the turn
  if (s.die == null) return roll(s, rng)
  return endTurn(s)
}

/** Run a full AI turn (single-shot): keep rolling through extra turns until the turn passes. */
export function aiTurn(s: SLState, rng: () => number = Math.random): SLState {
  if (s.winner != null || s.turn === 0) return s
  let st = s
  let guard = 0
  const me = s.turn
  while (st.winner == null && st.turn === me && guard++ < 200) {
    st = roll(st, rng)
    if (st.winner != null) break
    if (st.extraTurn) { st = endTurn(st); continue }  // earned a 6 → re-arm and loop again
    st = endTurn(st)                                   // pass to next player
    break
  }
  return st
}

export function winner(s: SLState): number | null {
  return s.winner
}
