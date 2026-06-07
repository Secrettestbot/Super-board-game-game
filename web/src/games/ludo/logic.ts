/* LUDO — pure logic (built for this codebase, not ported).
   4 players (you = 0, AI = 1,2,3), 4 tokens each. Classic cross board:
   a 52-square shared loop + a 6-square private HOME COLUMN per player leading to the
   centre FINISH.

   --- Coordinate model ---
   We track each token as a single PROGRESS integer 0..57 measured along the OWNER's path:
     0           = in the home YARD (not yet released)
     1..51       = on the shared loop, 1 = the player's START square, 51 = the square just
                   before turning into the home column
     52..57       = the 6 home-column squares (52 = first column cell … 57 = FINISH/centre)
   FINISHED = progress === 57.
   To find the ABSOLUTE shared-loop square (0..51) of a token on the loop, add the player's
   entry offset:  absSquare = (player.entry + (progress-1)) % 52, where entry = player*13.
   Two tokens of different players share a physical loop square iff their absSquare match.
   Home-column cells (progress 52..57) are PRIVATE — never collide across players.
   START squares (progress 1) are SAFE: a token sitting on its own start can't be captured.
   We also mark the 4 entry squares of every player as global safe squares (classic stars). */

export type Phase = 'roll' | 'move' | 'over'

export interface LudoState {
  /** tokens[player][i] = progress 0..57 for the 4 tokens of that player. */
  tokens: number[][]
  turn: number              // 0..3 whose turn
  you: number               // always 0
  die: number | null        // current rolled face 1..6, null before a roll
  rolled: boolean           // has the current player rolled and not yet moved?
  rolledSix: boolean        // was the last roll a 6 (grants an extra turn after the move)
  phase: Phase
  winner: number | null
  last: { player: number; token: number; to: number } | null
  step: number              // monotonic counter — bumped on EVERY action (drives the AI tick)
  log: LogEntry[]
}

export interface LogEntry { t: string; x: string }

export const PLAYERS = 4
export const TOKENS = 4
export const LOOP = 52              // shared squares 0..51
export const ENTRY_GAP = 13         // each player's start is 13 squares apart
export const COL_FIRST = 52         // first home-column progress value
export const FINISH = 57            // progress value meaning "home / finished"
export const YARD = 0               // progress value meaning "in the yard"

/** Absolute loop square (0..51) for a player's entry / start square. */
export const entryOffset = (player: number) => (player * ENTRY_GAP) % LOOP
/** Global safe loop squares = every player's start square (classic coloured/star squares). */
export const SAFE_SQUARES = new Set<number>(
  Array.from({ length: PLAYERS }, (_, p) => entryOffset(p)),
)

const NAMES = ['You', 'Red', 'Blue', 'Green']

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

export function makeGame(): LudoState {
  return {
    tokens: Array.from({ length: PLAYERS }, () => new Array(TOKENS).fill(YARD)),
    turn: 0,
    you: 0,
    die: null,
    rolled: false,
    rolledSix: false,
    phase: 'roll',
    winner: null,
    last: null,
    step: 0,
    log: [{ t: 'sys', x: 'You are yellow. Roll a 6 to release a token, then race all four home.' }],
  }
}

/** Default randomness; injectable/guarded for tests. Returns 1..6. */
export function rollDie(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6)
}

/** Absolute loop square (0..51) for a token, or -1 if it isn't on the shared loop. */
export function absSquare(player: number, progress: number): number {
  if (progress < 1 || progress > 51) return -1
  return (entryOffset(player) + (progress - 1)) % LOOP
}

export const isFinished = (progress: number) => progress === FINISH
export const inYard = (progress: number) => progress === YARD

/** How many of `player`'s tokens have finished. */
export function finishedCount(s: LudoState, player: number): number {
  let n = 0
  for (const p of s.tokens[player]) if (p === FINISH) n++
  return n
}

/** Destination progress for moving token #i of `player` by `die`, or null if illegal. */
export function destOf(s: LudoState, player: number, i: number, die: number): number | null {
  if (die < 1 || die > 6) return null
  const cur = s.tokens[player][i]
  if (cur === FINISH) return null
  if (cur === YARD) {
    // only a 6 releases a token; it lands on the START square (progress 1)
    if (die !== 6) return null
    const to = 1
    if (ownBlockAt(s, player, to, i)) return null
    return to
  }
  const to = cur + die
  if (to > FINISH) return null            // overshoot the finish is illegal (need exact count)
  if (to <= 51) {
    // landing on a shared-loop square; can't land where 2+ of your OWN already sit (block),
    // but stacking onto exactly one of your own is allowed (forms a block).
    if (ownBlockAt(s, player, to, i)) return null
    // can't pass... (no blocking-passage rule — simplified: blocks only block landing)
    return to
  }
  // home-column or finish — private, only own-token block applies
  if (ownBlockAt(s, player, to, i)) return null
  return to
}

/** Would landing on progress `to` collide with a BLOCK (2+) of the player's own tokens? */
function ownBlockAt(s: LudoState, player: number, to: number, exclude: number): boolean {
  if (to === FINISH) return false // many tokens may finish on the same centre
  let n = 0
  s.tokens[player].forEach((p, idx) => { if (idx !== exclude && p === to) n++ })
  return n >= 2
}

/** All legal token indices `player` can move with `die`. */
export function legalMoves(s: LudoState, player: number, die: number): number[] {
  const out: number[] = []
  for (let i = 0; i < TOKENS; i++) if (destOf(s, player, i, die) != null) out.push(i)
  return out
}

/** Find a lone capturable enemy token on the same physical loop square as `to`. */
function captureAt(s: LudoState, mover: number, to: number): { player: number; token: number } | null {
  if (to < 1 || to > 51) return null            // home column / finish never captures
  const abs = absSquare(mover, to)
  if (SAFE_SQUARES.has(abs)) return null         // safe squares are immune
  for (let p = 0; p < PLAYERS; p++) {
    if (p === mover) continue
    // count enemy tokens of player p on this physical square
    const here: number[] = []
    s.tokens[p].forEach((prog, idx) => { if (absSquare(p, prog) === abs) here.push(idx) })
    if (here.length === 1) return { player: p, token: here[0] }
    // a block (2+) of the same enemy is immune; >1 different enemies handled per-player so
    // only a LONE enemy token is ever captured.
  }
  return null
}

/** Move token #i of `player` by the current die. Handles capture, finish, extra-turn, end-of-turn. */
export function moveToken(s: LudoState, player: number, i: number): LudoState {
  if (s.winner != null || s.turn !== player || !s.rolled || s.die == null || s.phase !== 'move') return s
  const die = s.die
  const to = destOf(s, player, i, die)
  if (to == null) return s

  const tokens = s.tokens.map(row => row.slice())
  tokens[player][i] = to
  let log = s.log

  // capture?
  const cap = captureAt(s, player, to)
  if (cap) {
    tokens[cap.player][cap.token] = YARD
    log = push(log, player === 0 ? 'you' : 'ai',
      `${NAMES[player]} captured ${NAMES[cap.player]} — sent home!`)
  } else if (to === FINISH) {
    log = push(log, player === 0 ? 'you' : 'ai', `${NAMES[player]} brought a token home.`)
  } else if (s.tokens[player][i] === YARD) {
    log = push(log, player === 0 ? 'you' : 'ai', `${NAMES[player]} released a token onto the board.`)
  } else {
    log = push(log, player === 0 ? 'you' : 'ai', `${NAMES[player]} advanced a token.`)
  }

  let st: LudoState = Object.assign({}, s, {
    tokens, log, last: { player, token: i, to }, step: s.step + 1,
  })

  // win? (all four finished)
  if (finishedCount(st, player) === TOKENS) {
    log = push(log, player === 0 ? 'you' : 'ai',
      player === 0 ? 'You got all four tokens home — you win!' : `${NAMES[player]} got all four home — ${NAMES[player]} wins.`)
    return Object.assign({}, st, { winner: player, phase: 'over' as Phase, log, rolled: false })
  }

  // a 6 grants an extra roll (same player rolls again)
  if (s.rolledSix) {
    return Object.assign({}, st, { phase: 'roll' as Phase, rolled: false, die: null, rolledSix: false })
  }
  return endTurn(st)
}

/** Advance the turn to the next player; resets roll bookkeeping. */
export function endTurn(s: LudoState): LudoState {
  if (s.winner != null) return s
  const next = (s.turn + 1) % PLAYERS
  return Object.assign({}, s, {
    turn: next, phase: 'roll' as Phase, rolled: false, die: null, rolledSix: false,
    step: s.step + 1,
  })
}

/** Roll for the current player. Auto-passes the turn if there is no legal move
    (and the roll was not a 6 — a 6 with no move still ends the turn). */
export function roll(s: LudoState, rng: () => number = Math.random): LudoState {
  if (s.winner != null || s.rolled || s.phase !== 'roll') return s
  const die = rollDie(rng)
  const player = s.turn
  const six = die === 6
  let log = push(s.log, player === 0 ? 'you' : 'ai', `${NAMES[player]} rolled a ${die}.`)
  const moves = legalMoves(s, player, die)
  let st: LudoState = Object.assign({}, s, {
    die, rolled: true, rolledSix: six, phase: 'move' as Phase, step: s.step + 1, log,
  })
  if (moves.length === 0) {
    log = push(st.log, 'sys', `${NAMES[player]} has no legal move${six ? ' even with a 6' : ''}. ${six ? 'Turn passes.' : 'Turn passes.'}`)
    // No move at all: even a 6 cannot grant a useful extra turn here → pass the turn.
    st = Object.assign({}, st, { log })
    return endTurn(st)
  }
  return st
}

/* ===================== AI (heuristic, fast) ===================== */

/** Score a candidate move for `player` — bigger is better. */
export function scoreMove(s: LudoState, player: number, i: number, die: number): number {
  const to = destOf(s, player, i, die)
  if (to == null) return -Infinity
  const cur = s.tokens[player][i]
  let score = 0
  // 1. finishing a token is best
  if (to === FINISH) score += 1000
  // 2. capturing a lone opponent
  const cap = captureAt(s, player, to)
  if (cap) {
    score += 600
    // capturing a more-advanced enemy is worth a bit more
    score += s.tokens[cap.player][cap.token]
  }
  // 3. release a token from the yard on a 6 (keeps tokens in play)
  if (cur === YARD) score += 200
  // 4. reaching the safety of the home column
  if (to >= COL_FIRST && to < FINISH) score += 120
  // 5. landing on a safe loop square
  const abs = absSquare(player, to)
  if (abs >= 0 && SAFE_SQUARES.has(abs)) score += 40
  // 6. avoid leaving a token exposed just behind enemies (rough): penalize landing where an
  //    enemy 1..6 behind on the loop could hit next turn
  if (to >= 1 && to <= 51 && !(abs >= 0 && SAFE_SQUARES.has(abs))) {
    score -= exposure(s, player, abs) * 12
  }
  // 7. otherwise advance the lead token (more progress = better)
  score += to
  return score
}

/** How many enemy tokens sit 1..6 squares BEHIND absolute loop square `abs`. */
function exposure(s: LudoState, player: number, abs: number): number {
  if (abs < 0) return 0
  let n = 0
  for (let p = 0; p < PLAYERS; p++) {
    if (p === player) continue
    for (const prog of s.tokens[p]) {
      const ea = absSquare(p, prog)
      if (ea < 0) continue
      let d = (abs - ea + LOOP) % LOOP
      if (d >= 1 && d <= 6) n++
    }
  }
  return n
}

/** One AI sub-step: roll if it hasn't yet, else play its best legal move. Driven by useAITurn. */
export function aiStep(s: LudoState): LudoState {
  if (s.winner != null) return s
  if (s.turn === 0) return s            // never auto-play the human
  if (s.phase === 'roll' && !s.rolled) return roll(s)
  if (s.phase === 'move' && s.rolled && s.die != null) {
    const die = s.die
    const moves = legalMoves(s, s.turn, die)
    if (moves.length === 0) return endTurn(s)
    let best = moves[0], bestV = -Infinity
    for (const idx of moves) {
      const v = scoreMove(s, s.turn, idx, die)
      if (v > bestV) { bestV = v; best = idx }
    }
    return moveToken(s, s.turn, best)
  }
  return s
}

/** Run a full AI turn (used by callers that want a single-shot turn). */
export function aiTurn(s: LudoState): LudoState {
  let st = s
  let guard = 0
  // resolve sub-steps until it is no longer this AI's pending action
  const me = s.turn
  while (st.winner == null && st.turn === me && guard++ < 40) {
    const before = st.step
    st = aiStep(st)
    if (st.step === before) break       // no progress — avoid an infinite loop
  }
  return st
}

export { NAMES }
