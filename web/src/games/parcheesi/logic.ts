/* PARCHEESI — pure logic (built for this codebase, not ported). Cross-and-circle dice race.
   4 players (you = 0, AI = 1,2,3), 4 pawns each.

   --- Coordinate model ---
   Each pawn is a single PROGRESS integer measured along the OWNER's path:
     START (= -1)  : pawn still in its START circle (not yet released)
     1..63         : on the shared 68-square loop, 1 = the player's ENTRY square,
                     63 = the last loop square before turning into the home path.
     64..68        : the 5 private HOME PATH cells (64 = first, 68 = last cell of the path)
     HOME (= 69)   : reached the CENTER (finished). Exact count required.

   ABSOLUTE loop square (0..67) of a pawn on the loop:
     absSquare = (entryOffset(player) + (progress - 1)) % 68,  entryOffset = player * 17.
   Two pawns of different players share a physical loop square iff their absSquare match.
   Home-path cells (64..68) and START are PRIVATE — never collide across players.

   --- Rules implemented ---
   * Roll TWO dice. Each die is consumed SEPARATELY (move one pawn by die A, another by die B,
     or one pawn by both, in either order).
   * RELEASE: a die showing 5, OR the two dice summing to 5, brings a pawn out of START onto
     the ENTRY square. (We model "a 5" as: a single die value of 5 releases; the sum-to-5 case
     is offered as a special combined move that consumes BOTH dice.)
   * CAPTURE: landing on a loop square holding exactly ONE opponent pawn sends it to START and
     grants the mover a +20 BONUS move.
   * HOME: bringing a pawn to the CENTER with the exact count grants a +10 BONUS move.
   * BLOCKADE: two of your own pawns on one loop square form a blockade. Opponents can neither
     LAND on nor PASS THROUGH it (and you can't pass your own blockade with a third pawn either).
   * SAFE squares: entry squares + the marked stars. Pawns on a safe square cannot be captured.
   * DOUBLES: rolling two equal dice grants an EXTRA turn. Three doubles in a row = penalty:
     your FURTHEST pawn is sent back to START and the turn ends.
   * WIN: first player to bring all 4 pawns HOME (to the center) wins. */

export type Phase = 'roll' | 'move' | 'over'

export interface ParState {
  /** pawns[player][i] = progress for the 4 pawns of that player. START(-1)..HOME(69). */
  pawns: number[][]
  turn: number               // 0..3 whose turn it is
  you: number                // always 0
  dice: [number, number] | null   // the two rolled faces, null before a roll
  usedDice: [boolean, boolean]     // which of the two dice have been consumed this roll
  bonus: number              // pending BONUS move value (+20 capture / +10 home), 0 if none
  doublesCount: number       // consecutive doubles rolled this turn-chain
  rolled: boolean            // has the current player rolled (and not finished the move phase)?
  phase: Phase
  winner: number | null
  last: { player: number; pawn: number; to: number } | null
  step: number               // monotonic counter — bumped on EVERY action (drives the AI tick)
  log: LogEntry[]
}

export interface LogEntry { t: string; x: string }

export const PLAYERS = 4
export const PAWNS = 4
export const LOOP = 68               // shared loop squares 0..67
export const ENTRY_GAP = 17          // each player's entry is 17 squares apart (68/4)
export const PATH_FIRST = 64         // first home-path progress value
export const HOME = 69               // progress value meaning "reached the center / finished"
export const START = -1              // progress value meaning "in the start circle"

/** Absolute loop square (0..67) for a player's entry / start square. */
export const entryOffset = (player: number) => (player * ENTRY_GAP) % LOOP

/** Global safe loop squares (0..67): every player's entry square + the four mid-arm stars. */
export const SAFE_SQUARES = new Set<number>([
  ...Array.from({ length: PLAYERS }, (_, p) => entryOffset(p)),   // 0, 17, 34, 51 (entries)
  ...Array.from({ length: PLAYERS }, (_, p) => (entryOffset(p) + 12) % LOOP), // 12, 29, 46, 63 (stars)
])

const NAMES = ['You', 'Coral', 'Teal', 'Amber']

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

export function makeGame(): ParState {
  return {
    pawns: Array.from({ length: PLAYERS }, () => new Array(PAWNS).fill(START)),
    turn: 0,
    you: 0,
    dice: null,
    usedDice: [false, false],
    bonus: 0,
    doublesCount: 0,
    rolled: false,
    phase: 'roll',
    winner: null,
    last: null,
    step: 0,
    log: [{ t: 'sys', x: 'You are violet. Roll a 5 to release a pawn, then race all four to the center.' }],
  }
}

/** Default randomness; injectable/guarded for tests. Returns 1..6. */
export function rollDie(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6)
}

/** Absolute loop square (0..67) for a pawn, or -1 if it isn't on the shared loop. */
export function absSquare(player: number, progress: number): number {
  if (progress < 1 || progress > 63) return -1
  return (entryOffset(player) + (progress - 1)) % LOOP
}

export const isHome = (progress: number) => progress === HOME
export const inStart = (progress: number) => progress === START

/** How many of `player`'s pawns have reached HOME. */
export function homeCount(s: ParState, player: number): number {
  let n = 0
  for (const p of s.pawns[player]) if (p === HOME) n++
  return n
}

/** Is there an opponent BLOCKADE (2 same-owner pawns) on absolute loop square `abs`? */
function blockadeAt(s: ParState, mover: number, abs: number): boolean {
  for (let p = 0; p < PLAYERS; p++) {
    let n = 0
    for (const prog of s.pawns[p]) if (absSquare(p, prog) === abs) n++
    if (n >= 2) return true   // any 2-stack (own or enemy) blocks passage / landing
  }
  return false
}

/** Would moving `player`'s pawn from `cur` by `die` pass through ANY blockade en route?
    Only matters for movement on the loop (1..63). Each intermediate loop square is checked. */
function passesBlockade(s: ParState, player: number, cur: number, to: number): boolean {
  const from = Math.max(cur, 1)
  for (let prog = from + 1; prog <= Math.min(to, 63); prog++) {
    const abs = absSquare(player, prog)
    if (abs < 0) continue
    if (prog === to) {
      // landing square: a blockade there blocks landing (handled as well below)
      if (blockadeAt(s, player, abs)) return true
    } else if (blockadeAt(s, player, abs)) {
      return true
    }
  }
  return false
}

/** Destination progress for moving pawn #i of `player` by `die`, or null if illegal. */
export function destOf(s: ParState, player: number, i: number, die: number): number | null {
  if (die < 1 || die > 6) return null
  const cur = s.pawns[player][i]
  if (cur === HOME) return null
  if (cur === START) {
    // only a 5 (single die) releases a pawn; it lands on the ENTRY square (progress 1).
    if (die !== 5) return null
    const to = 1
    const abs = absSquare(player, to)
    if (blockadeAt(s, player, abs)) return null   // can't release onto a blockaded entry
    return to
  }
  const to = cur + die
  if (to > HOME) return null               // overshooting the center is illegal (need exact count)
  if (to <= 63) {
    if (passesBlockade(s, player, cur, to)) return null
    return to
  }
  // home-path (64..68) or HOME (69) — private, only the loop-exit passage check applies
  if (cur <= 63 && passesBlockade(s, player, cur, 63)) return null
  return to
}

/** Combined RELEASE move using BOTH dice summing to 5 (e.g. 2+3, 1+4). Returns ENTRY or null. */
export function canReleaseWithSum(s: ParState, player: number, i: number): boolean {
  if (s.dice == null) return false
  if (s.usedDice[0] || s.usedDice[1]) return false   // both dice must be unused
  if (s.dice[0] + s.dice[1] !== 5) return false
  if (s.pawns[player][i] !== START) return false
  const abs = absSquare(player, 1)
  if (blockadeAt(s, player, abs)) return false
  return true
}

/** All legal pawn indices `player` can move with a specific `die` value. */
export function legalMoves(s: ParState, player: number, die: number): number[] {
  const out: number[] = []
  for (let i = 0; i < PAWNS; i++) if (destOf(s, player, i, die) != null) out.push(i)
  return out
}

/** Find a lone capturable enemy pawn on the same physical loop square as `to`. */
function captureAt(s: ParState, mover: number, to: number): { player: number; pawn: number } | null {
  if (to < 1 || to > 63) return null
  const abs = absSquare(mover, to)
  if (SAFE_SQUARES.has(abs)) return null      // safe squares are immune
  for (let p = 0; p < PLAYERS; p++) {
    if (p === mover) continue
    const here: number[] = []
    s.pawns[p].forEach((prog, idx) => { if (absSquare(p, prog) === abs) here.push(idx) })
    if (here.length === 1) return { player: p, pawn: here[0] }
    // a blockade (2+) of the same enemy is immune AND blocks landing (destOf prevents it).
  }
  return null
}

/* --- which die slot to consume for a given die value --- */
function dieSlot(s: ParState, die: number): number {
  if (s.dice == null) return -1
  if (!s.usedDice[0] && s.dice[0] === die) return 0
  if (!s.usedDice[1] && s.dice[1] === die) return 1
  return -1
}

/** Are both dice used up (move phase exhausted)? */
function diceExhausted(s: ParState): boolean {
  return s.usedDice[0] && s.usedDice[1] && s.bonus === 0
}

/** Apply the shared landing effects (capture / home / win / log) and bookkeeping. */
function applyLanding(s: ParState, player: number, i: number, to: number, released: boolean): ParState {
  const pawns = s.pawns.map(row => row.slice())
  pawns[player][i] = to
  let log = s.log
  let bonusGain = 0

  const cap = captureAt(s, player, to)
  if (cap) {
    pawns[cap.player][cap.pawn] = START
    bonusGain = 20
    log = push(log, player === 0 ? 'you' : 'ai',
      `${NAMES[player]} captured ${NAMES[cap.player]} — sent home, +20 bonus!`)
  } else if (to === HOME) {
    bonusGain = 10
    log = push(log, player === 0 ? 'you' : 'ai', `${NAMES[player]} reached the center — +10 bonus!`)
  } else if (released) {
    log = push(log, player === 0 ? 'you' : 'ai', `${NAMES[player]} released a pawn (rolled a 5).`)
  } else {
    log = push(log, player === 0 ? 'you' : 'ai', `${NAMES[player]} advanced a pawn.`)
  }

  let st: ParState = Object.assign({}, s, {
    pawns, log, last: { player, pawn: i, to }, step: s.step + 1,
    bonus: s.bonus + bonusGain,
  })

  if (homeCount(st, player) === PAWNS) {
    log = push(st.log, player === 0 ? 'you' : 'ai',
      player === 0 ? 'You brought all four pawns home — you win!' : `${NAMES[player]} got all four home — ${NAMES[player]} wins.`)
    return Object.assign({}, st, { winner: player, phase: 'over' as Phase, rolled: false, log })
  }
  return st
}

/** Move pawn #i of `player` by `die`. Consumes the matching die (or the bonus pool). */
export function movePawn(s: ParState, player: number, i: number, die: number): ParState {
  if (s.winner != null || s.turn !== player || !s.rolled || s.phase !== 'move') return s

  // Is this die value covered by a pending BONUS pool? (bonus moves are a single lump value)
  let consumeBonus = false
  let slot = -1
  if (s.bonus > 0 && die === s.bonus) {
    consumeBonus = true
  } else {
    slot = dieSlot(s, die)
    if (slot < 0) return s
  }

  const to = destOf(s, player, i, die)
  if (to == null) return s

  const released = s.pawns[player][i] === START
  let st = applyLanding(s, player, i, to, released)
  if (st.winner != null) return st

  if (consumeBonus) {
    st = Object.assign({}, st, { bonus: 0 })
  } else {
    const used: [boolean, boolean] = [st.usedDice[0], st.usedDice[1]]
    used[slot] = true
    st = Object.assign({}, st, { usedDice: used })
  }

  // If nothing left to do this roll, end the move phase (doubles / next player).
  if (diceExhausted(st) && st.bonus === 0) return finishMovePhase(st)
  return st
}

/** Combined RELEASE consuming BOTH dice when they sum to 5. */
export function releaseWithSum(s: ParState, player: number, i: number): ParState {
  if (s.winner != null || s.turn !== player || !s.rolled || s.phase !== 'move') return s
  if (!canReleaseWithSum(s, player, i)) return s
  let st = applyLanding(s, player, i, 1, true)
  if (st.winner != null) return st
  st = Object.assign({}, st, { usedDice: [true, true] as [boolean, boolean] })
  if (st.bonus === 0) return finishMovePhase(st)
  return st
}

/** A pending bonus move can still be spent — does the current player have ANY legal bonus move? */
function hasBonusMove(s: ParState): boolean {
  if (s.bonus === 0) return false
  return legalMoves(s, s.turn, s.bonus).length > 0
}

/** Are there any legal moves left this roll (unused dice OR a spendable bonus)? */
export function anyMoveLeft(s: ParState): boolean {
  if (s.bonus > 0 && hasBonusMove(s)) return true
  if (s.dice == null) return false
  if (!s.usedDice[0] && legalMoves(s, s.turn, s.dice[0]).length > 0) return true
  if (!s.usedDice[1] && legalMoves(s, s.turn, s.dice[1]).length > 0) return true
  // sum-to-5 release (both dice unused)
  if (!s.usedDice[0] && !s.usedDice[1] && s.dice[0] + s.dice[1] === 5) {
    for (let i = 0; i < PAWNS; i++) if (canReleaseWithSum(s, s.turn, i)) return true
  }
  return false
}

/** End the move phase: forfeit unspendable bonus, then doubles extra-turn or pass. */
export function finishMovePhase(s: ParState): ParState {
  if (s.winner != null) return s
  // If a bonus remains but cannot be spent, drop it.
  let st = s
  if (st.bonus > 0 && !hasBonusMove(st)) st = Object.assign({}, st, { bonus: 0 })
  // If there are still legal moves left, the phase is not over.
  if (anyMoveLeft(st)) return st

  const wasDoubles = st.dice != null && st.dice[0] === st.dice[1]
  if (wasDoubles && st.doublesCount < 3) {
    // extra turn for the same player — roll again.
    return Object.assign({}, st, {
      phase: 'roll' as Phase, rolled: false, dice: null, usedDice: [false, false] as [boolean, boolean],
      bonus: 0, step: st.step + 1,
    })
  }
  return endTurn(st)
}

/** Advance the turn to the next player; resets roll bookkeeping. */
export function endTurn(s: ParState): ParState {
  if (s.winner != null) return s
  const next = (s.turn + 1) % PLAYERS
  return Object.assign({}, s, {
    turn: next, phase: 'roll' as Phase, rolled: false, dice: null,
    usedDice: [false, false] as [boolean, boolean], bonus: 0, doublesCount: 0,
    step: s.step + 1,
  })
}

/** Index of the FURTHEST-progressed pawn of `player` (for the 3-doubles penalty). */
function furthestPawn(s: ParState, player: number): number {
  let best = 0, bestV = -Infinity
  s.pawns[player].forEach((prog, i) => {
    const v = prog === HOME ? 1000 : prog
    if (v > bestV) { bestV = v; best = i }
  })
  return best
}

/** Roll the two dice for the current player. Handles the 3-doubles penalty and no-move pass. */
export function roll(s: ParState, rng: () => number = Math.random): ParState {
  if (s.winner != null || s.rolled || s.phase !== 'roll') return s
  const player = s.turn
  const d0 = rollDie(rng), d1 = rollDie(rng)
  const doubles = d0 === d1
  const dCount = doubles ? s.doublesCount + 1 : 0

  let log = push(s.log, player === 0 ? 'you' : 'ai', `${NAMES[player]} rolled ${d0} and ${d1}${doubles ? ' (doubles!)' : ''}.`)

  // THREE doubles in a row → penalty: furthest pawn back to START, turn ends.
  if (doubles && dCount >= 3) {
    const fp = furthestPawn(s, player)
    const pawns = s.pawns.map(row => row.slice())
    const sent = pawns[player][fp]
    if (sent !== START) pawns[player][fp] = START
    log = push(log, 'sys', `${NAMES[player]} rolled a third double — furthest pawn goes back to start!`)
    const penal: ParState = Object.assign({}, s, {
      pawns, dice: [d0, d1] as [number, number], log, step: s.step + 1, doublesCount: 0,
    })
    return endTurn(penal)
  }

  let st: ParState = Object.assign({}, s, {
    dice: [d0, d1] as [number, number], usedDice: [false, false] as [boolean, boolean],
    bonus: 0, rolled: true, phase: 'move' as Phase, doublesCount: dCount, step: s.step + 1, log,
  })

  if (!anyMoveLeft(st)) {
    log = push(st.log, 'sys', `${NAMES[player]} has no legal move. Turn passes.`)
    st = Object.assign({}, st, { log })
    // doubles with no move still grants the extra turn re-roll
    if (doubles && dCount < 3) {
      return Object.assign({}, st, {
        phase: 'roll' as Phase, rolled: false, dice: null,
        usedDice: [false, false] as [boolean, boolean], bonus: 0, step: st.step + 1,
      })
    }
    return endTurn(st)
  }
  return st
}

/* ===================== AI (heuristic, fast) ===================== */

/** Score moving pawn #i by `die` for `player` — bigger is better. */
export function scoreMove(s: ParState, player: number, i: number, die: number): number {
  const to = destOf(s, player, i, die)
  if (to == null) return -Infinity
  const cur = s.pawns[player][i]
  let score = 0
  if (to === HOME) score += 1000                 // finishing a pawn (also nets +10 bonus)
  const cap = captureAt(s, player, to)
  if (cap) { score += 600 + s.pawns[cap.player][cap.pawn] }  // capture → +20 bonus; prefer advanced
  if (cur === START) score += 220                // release a pawn when possible
  if (to >= PATH_FIRST && to < HOME) score += 130 // entering the safe home path
  const abs = absSquare(player, to)
  if (abs >= 0 && SAFE_SQUARES.has(abs)) score += 45 // landing on a safe square
  // form a blockade: landing where exactly one of our own pawns already sits
  if (abs >= 0) {
    let mine = 0
    s.pawns[player].forEach((prog, idx) => { if (idx !== i && absSquare(player, prog) === abs) mine++ })
    if (mine === 1) score += 70
  }
  // exposure: penalize landing where an enemy 1..6 behind could hit next turn (non-safe only)
  if (to >= 1 && to <= 63 && !(abs >= 0 && SAFE_SQUARES.has(abs))) {
    score -= exposure(s, player, abs) * 12
  }
  score += to                                    // otherwise advance the lead pawn
  return score
}

function exposure(s: ParState, player: number, abs: number): number {
  if (abs < 0) return 0
  let n = 0
  for (let p = 0; p < PLAYERS; p++) {
    if (p === player) continue
    for (const prog of s.pawns[p]) {
      const ea = absSquare(p, prog)
      if (ea < 0) continue
      const d = (abs - ea + LOOP) % LOOP
      if (d >= 1 && d <= 6) n++
    }
  }
  return n
}

/** One AI sub-step: roll if it hasn't, else play its single best legal (die or bonus) move. */
export function aiStep(s: ParState): ParState {
  if (s.winner != null) return s
  if (s.turn === 0) return s              // never auto-play the human
  if (s.phase === 'roll' && !s.rolled) return roll(s)
  if (s.phase === 'move' && s.rolled) {
    // candidate (pawn, die) actions across the unused dice + bonus pool + sum-release.
    type Cand = { i: number; die: number; sum?: boolean; v: number }
    const cands: Cand[] = []
    const dieVals = new Set<number>()
    if (s.bonus > 0 && hasBonusMove(s)) dieVals.add(s.bonus)
    if (s.dice != null) {
      if (!s.usedDice[0]) dieVals.add(s.dice[0])
      if (!s.usedDice[1]) dieVals.add(s.dice[1])
    }
    for (const die of dieVals) {
      for (const i of legalMoves(s, s.turn, die)) cands.push({ i, die, v: scoreMove(s, s.turn, i, die) })
    }
    // sum-to-5 combined release
    if (s.dice != null && !s.usedDice[0] && !s.usedDice[1] && s.dice[0] + s.dice[1] === 5) {
      for (let i = 0; i < PAWNS; i++) if (canReleaseWithSum(s, s.turn, i)) cands.push({ i, die: 5, sum: true, v: 240 })
    }
    if (cands.length === 0) return finishMovePhase(s)
    let best = cands[0]
    for (const c of cands) if (c.v > best.v) best = c
    if (best.sum) return releaseWithSum(s, s.turn, best.i)
    return movePawn(s, s.turn, best.i, best.die)
  }
  return s
}

/** Run a full AI turn in one shot (used by callers wanting a single-shot turn). */
export function aiTurn(s: ParState): ParState {
  let st = s
  let guard = 0
  const me = s.turn
  while (st.winner == null && st.turn === me && guard++ < 60) {
    const before = st.step
    st = aiStep(st)
    if (st.step === before) break
  }
  return st
}

export { NAMES }
