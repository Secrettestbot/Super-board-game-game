/* THE ROYAL GAME OF UR — logic (built for this codebase, not ported).
   Finkel rules. Two players (you = light, foe = dark), 7 pieces each starting OFF the board.
   Each player owns a 14-square TRACK: 4 up their private entry column, across the 8 shared
   middle squares, then up their 2 private exit squares — then bear OFF (the 15th step).
   Dice: four binary (tetrahedral) dice → 0..4 marked corners = how far you move ONE piece.
   Land on an enemy on the shared row to CAPTURE it (back off-board) — except the central
   rosette, which is SAFE. Landing on a rosette grants an EXTRA TURN. Bear all 7 off to win. */

export type Player = 'you' | 'foe'

export interface LogEntry { t: string; x: string }

/** A piece's position along its OWNER's track. -1 = off-board (waiting); 0..13 = on track; 14 = borne off. */
export interface UrState {
  pieces: { you: number[]; foe: number[] } // each length 7, values -1..14
  turn: Player
  dice: number[]            // last four binary dice [0|1 ×4]
  roll: number | null       // sum of dice (0..4), null before first roll this turn
  rolled: boolean           // has the current player rolled and not yet moved/passed
  winner: Player | null
  last: { player: Player; from: number; to: number } | null
  log: LogEntry[]
}

export const TRACK_LEN = 14          // squares 0..13, then 14 = off
export const OFF = -1
export const HOME = 14
export const PIECES = 7

/** Track indices that carry a rosette (extra turn). The shared-centre one (7) is also SAFE. */
export const ROSETTES = new Set([3, 7, 13])
export const SAFE_ROSETTE = 7        // central shared rosette — capture-proof
/** Shared middle row spans track indices 4..11 (the only region where capture is possible). */
export const SHARED_FROM = 4
export const SHARED_TO = 11
export const isShared = (t: number) => t >= SHARED_FROM && t <= SHARED_TO

const other = (p: Player): Player => p === 'you' ? 'foe' : 'you'
const NAME: Record<Player, string> = { you: 'You', foe: 'The rival' }

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

/**
 * Two players' tracks meet only on the shared middle row. A "you" piece at track index `t`
 * and a "foe" piece at track index `t'` occupy the SAME physical square iff both are shared
 * and t === t' (the shared row is traversed in the same order by both). So shared collision
 * is a same-track-index test, which keeps the model simple and symmetric.
 */
export function sharedSquareOfEnemy(state: UrState, mover: Player, t: number): number | null {
  if (!isShared(t)) return null
  const enemy = other(mover)
  const i = state.pieces[enemy].indexOf(t)
  return i >= 0 ? i : null
}

export function makeGame(): UrState {
  return {
    pieces: { you: new Array(PIECES).fill(OFF), foe: new Array(PIECES).fill(OFF) },
    turn: 'you',
    dice: [0, 0, 0, 0],
    roll: null,
    rolled: false,
    winner: null,
    last: null,
    log: [{ t: 'sys', x: 'You are the light stones. Roll the four dice and race your seven pieces home.' }],
  }
}

/** Roll four binary dice; returns the four faces (0/1). Math.random allowed. */
export function rollDice(): number[] {
  return [0, 0, 0, 0].map(() => (Math.random() < 0.5 ? 1 : 0))
}

export const diceSum = (dice: number[]) => dice.reduce((a, b) => a + b, 0)

/** Legal destination for moving piece #idx of `who` by `dist`, or null if illegal. */
export function destOf(state: UrState, who: Player, idx: number, dist: number): number | null {
  if (dist <= 0) return null
  const from = state.pieces[who][idx]
  if (from === HOME) return null                 // already home
  const to = from + dist
  if (to > HOME) return null                     // overshoot: bearing off needs the EXACT count
  if (to === HOME) return HOME                   // exact bear-off
  // can't land on your OWN piece
  if (state.pieces[who].includes(to)) return null
  // can't capture on the SAFE central rosette
  if (to === SAFE_ROSETTE && sharedSquareOfEnemy(state, who, to) != null) return null
  return to
}

/** All legal piece indices the given player can move with `dist`. */
export function legalMoves(state: UrState, who: Player, dist: number): number[] {
  if (dist <= 0) return []
  const out: number[] = []
  for (let i = 0; i < PIECES; i++) if (destOf(state, who, i, dist) != null) out.push(i)
  return out
}

function countHome(arr: number[]) { return arr.filter(v => v === HOME).length }
function countOff(arr: number[]) { return arr.filter(v => v === OFF).length }
function countOn(arr: number[]) { return arr.filter(v => v >= 0 && v < HOME).length }
export const home = (s: UrState, p: Player) => countHome(s.pieces[p])
export const off = (s: UrState, p: Player) => countOff(s.pieces[p])
export const onBoard = (s: UrState, p: Player) => countOn(s.pieces[p])

/** Roll the dice for the current player. Auto-resolves a 0 (no move) by passing the turn. */
export function doRoll(state: UrState): UrState {
  if (state.winner || state.rolled) return state
  const dice = rollDice()
  const r = diceSum(dice)
  const who = state.turn
  let log = push(state.log, who === 'you' ? 'you' : 'ai', `${NAME[who]} rolled a ${r}.`)
  if (r === 0) {
    log = push(log, 'sys', `A zero — ${who === 'you' ? 'you' : 'the rival'} cannot move. Turn passes.`)
    return Object.assign({}, state, { dice, roll: 0, rolled: false, turn: other(who), log })
  }
  if (legalMoves(state, who, r).length === 0) {
    log = push(log, 'sys', `No legal move with a ${r}. Turn passes.`)
    return Object.assign({}, state, { dice, roll: r, rolled: false, turn: other(who), log })
  }
  return Object.assign({}, state, { dice, roll: r, rolled: true, log })
}

/** Move piece #idx of the current player by the current roll. Handles capture / rosette / win. */
export function move(state: UrState, who: Player, idx: number): UrState {
  if (state.winner || state.turn !== who || !state.rolled || state.roll == null) return state
  const dist = state.roll
  const to = destOf(state, who, idx, dist)
  if (to == null) return state
  const from = state.pieces[who][idx]

  const mine = state.pieces[who].slice()
  const enemyArr = state.pieces[other(who)].slice()
  mine[idx] = to

  let log = state.log
  let captured = false
  if (to !== HOME) {
    const cap = sharedSquareOfEnemy(state, who, to)
    if (cap != null) {
      enemyArr[cap] = OFF
      captured = true
      log = push(log, who === 'you' ? 'you' : 'ai', `${NAME[who]} captured a ${NAME[other(who)].toLowerCase()} piece on the shared path!`)
    }
  }

  const pieces = who === 'you'
    ? { you: mine, foe: enemyArr }
    : { you: enemyArr, foe: mine }

  // win?
  if (countHome(mine) === PIECES) {
    log = push(log, who === 'you' ? 'you' : 'ai', `${NAME[who]} bore the last piece off — ${who === 'you' ? 'you win' : 'the rival wins'}!`)
    return Object.assign({}, state, { pieces, winner: who, rolled: false, roll: null, last: { player: who, from, to }, log })
  }

  if (to === HOME) {
    log = push(log, who === 'you' ? 'you' : 'ai', `${NAME[who]} bore a piece off.`)
  } else if (!captured) {
    log = push(log, who === 'you' ? 'you' : 'ai', from === OFF ? `${NAME[who]} entered a new piece.` : `${NAME[who]} advanced a piece.`)
  }

  // rosette → extra turn (turn stays the same player)
  const rosette = to !== HOME && ROSETTES.has(to)
  if (rosette) {
    log = push(log, who === 'you' ? 'you' : 'ai', `${NAME[who]} landed on a rosette — roll again!`)
    return Object.assign({}, state, { pieces, turn: who, rolled: false, roll: null, last: { player: who, from, to }, log })
  }

  return Object.assign({}, state, { pieces, turn: other(who), rolled: false, roll: null, last: { player: who, from, to }, log })
}

/* ===== AI: heuristic priority ordering over the legal moves ===== */

/** How exposed track index `t` is to capture by the enemy (shared squares only). Higher = worse. */
function threat(state: UrState, who: Player, t: number): number {
  if (!isShared(t) || t === SAFE_ROSETTE) return 0
  // an enemy piece up to 4 squares behind on the shared row can hit this square
  const enemy = other(who)
  let n = 0
  for (const ep of state.pieces[enemy]) {
    if (ep < 0 || ep >= HOME) continue
    if (ep < t && isShared(ep) && t - ep <= 4) n++
  }
  return n
}

/** Score a candidate move for the AI — bigger is better. */
export function scoreMove(state: UrState, who: Player, idx: number, dist: number): number {
  const to = destOf(state, who, idx, dist)
  if (to == null) return -Infinity
  const from = state.pieces[who][idx]
  let score = 0
  // 1. bearing a piece off is excellent
  if (to === HOME) score += 1000
  // 2. capturing an enemy
  if (to !== HOME && sharedSquareOfEnemy(state, who, to) != null) score += 600
  // 3. landing on a rosette (extra turn + the centre is safe)
  if (to !== HOME && ROSETTES.has(to)) score += 400
  // 4. escape a threatened square / avoid moving INTO a threatened one
  score += threat(state, who, from) * 60               // reward leaving a threatened square
  if (to !== HOME) score -= threat(state, who, to) * 50 // penalise landing on a threatened one
  // 5. entering a fresh piece keeps pressure on
  if (from === OFF) score += 30
  // 6. otherwise advance the most-advanced piece (progress)
  score += to
  return score
}

/** The AI's single sub-move: roll if it hasn't, else play its best legal move. Same shape as place(). */
export function aiStep(state: UrState): UrState {
  if (state.winner || state.turn !== 'foe') return state
  if (!state.rolled) return doRoll(state)            // roll (auto-passes on 0 / dead roll)
  const dist = state.roll!
  const moves = legalMoves(state, 'foe', dist)
  if (!moves.length) return Object.assign({}, state, { turn: 'you', rolled: false, roll: null })
  let best = moves[0], bestV = -Infinity
  for (const i of moves) {
    const v = scoreMove(state, 'foe', i, dist)
    if (v > bestV) { bestV = v; best = i }
  }
  return move(state, 'foe', best)
}
