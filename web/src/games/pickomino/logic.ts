/* PICKOMINO / HECKMECK — push-your-luck dice (built for this codebase).
   A central row of domino tiles 21..36, each worth WORMS (21-24=1, 25-28=2,
   29-32=3, 33-36=4). 8 dice, faces 1..5 + WORM (worm sums as 5). On your turn:
   roll all dice not yet set aside; pick ONE showing value and set aside ALL dice
   of that value (you may not re-pick a value already taken this turn). Re-roll the
   rest. STOP when set-aside sum >= 21 AND includes >= 1 worm: take the highest tile
   <= your sum from the row, OR steal the top tile of an opponent whose number == sum.
   BUST = can't set aside a new value / stop without a worm or < 21 / can't take any
   tile -> return your top tile to the row + flip out the row's highest tile.
   Game ends when the row is empty; most worms wins. 3 players: you (0) + AI 1,2.

   Randomness is injectable (state.seed) so tests are deterministic. */

export type Face = 1 | 2 | 3 | 4 | 5 | 6 // 6 == WORM
export const WORM: Face = 6

export type Phase = 'rolling' | 'over'

export interface Tile {
  n: number      // 21..36
  worms: number  // 1..4
}

export interface PlayerState {
  seat: number       // 0 = you, 1/2 = AI
  name: string
  stack: Tile[]      // captured tiles; last element is the TOP (most recently taken)
}

export interface LogEntry { t: string; x: string }

export interface PickominoState {
  row: Tile[]                 // tiles still available, ascending by n
  players: PlayerState[]
  turn: number                // seat whose turn it is
  roll: Face[]                // dice currently showing (not yet set aside)
  aside: Face[]               // dice set aside this turn
  takenValues: Face[]         // values already set aside this turn (cannot re-take)
  hasRolled: boolean          // a roll happened this turn (roll[] is live)
  phase: Phase
  winner: number | null       // seat of winner (can be 0!), or null
  seed: number                // PRNG state for deterministic dice
  log: LogEntry[]
}

export const N_DICE = 8
export const MIN_SUM = 21
const SEAT_NAMES = ['You', 'Hen', 'Magpie']

export function tileWorms(n: number): number {
  if (n >= 33) return 4
  if (n >= 29) return 3
  if (n >= 25) return 2
  return 1 // 21..24
}

function freshRow(): Tile[] {
  const row: Tile[] = []
  for (let n = 21; n <= 36; n++) row.push({ n, worms: tileWorms(n) })
  return row
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// ---- deterministic PRNG (mulberry32) -------------------------------------
function nextRand(seed: number): { v: number; seed: number } {
  let a = seed >>> 0
  a = (a + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { v, seed: a }
}

function rollFace(seed: number): { face: Face; seed: number } {
  const r = nextRand(seed)
  const face = ((r.v * 6) | 0) + 1 // 1..6, 6 == WORM
  return { face: face as Face, seed: r.seed }
}

export function faceValue(f: Face): number {
  return f === WORM ? 5 : f
}

export function sumOf(dice: Face[]): number {
  let s = 0
  for (const d of dice) s += faceValue(d)
  return s
}

export function hasWorm(dice: Face[]): boolean {
  return dice.includes(WORM)
}

export function makeGame(seed = (Math.random() * 0x7fffffff) | 0): PickominoState {
  return {
    row: freshRow(),
    players: SEAT_NAMES.map((name, seat) => ({ seat, name, stack: [] })),
    turn: 0,
    roll: [],
    aside: [],
    takenValues: [],
    hasRolled: false,
    phase: 'rolling',
    winner: null,
    seed: seed >>> 0,
    log: [{ t: 'sys', x: 'Roll the worm dice. Set aside one value each roll, then grab a tile worth at least 21 with a worm.' }],
  }
}

function nextSeat(seat: number, n: number): number {
  return (seat + 1) % n
}

// total worms a player currently holds
export function playerWorms(p: PlayerState): number {
  let w = 0
  for (const t of p.stack) w += t.worms
  return w
}

export function topTile(p: PlayerState): Tile | null {
  return p.stack.length ? p.stack[p.stack.length - 1] : null
}

// dice in `roll` left over after setting aside a value
function diceLeftAfter(roll: Face[], value: Face): number {
  return roll.filter(d => d !== value).length
}

// how many dice are currently "in play" (not yet set aside)
export function diceInHand(s: PickominoState): number {
  return N_DICE - s.aside.length
}

// values in the current roll that are NOT already taken this turn
export function availableValues(s: PickominoState): Face[] {
  const out: Face[] = []
  const seen = new Set<Face>()
  for (const d of s.roll) {
    if (!s.takenValues.includes(d) && !seen.has(d)) { out.push(d); seen.add(d) }
  }
  return out
}

// ---- rolling -------------------------------------------------------------
/* Roll all dice not yet set aside. Pure given s.seed. After rolling, if no value
   can be newly set aside the player BUSTS. */
export function rollDice(s: PickominoState): PickominoState {
  if (s.phase === 'over') return s
  const n = diceInHand(s)
  let seed = s.seed
  const roll: Face[] = []
  for (let i = 0; i < n; i++) {
    const r = rollFace(seed)
    roll.push(r.face)
    seed = r.seed
  }
  const who = s.players[s.turn].name
  let log = push(s.log, s.turn === 0 ? 'you' : 'ai', `${who} rolled ${roll.map(faceLabel).join(' ')}.`)
  const base = Object.assign({}, s, { roll, seed, hasRolled: true, log })

  // bust check: no available (non-taken) value present
  if (availableValues(base).length === 0) {
    log = push(base.log, s.turn === 0 ? 'you' : 'ai', `${who} has no new value to set aside — bust!`)
    return resolveBust(Object.assign({}, base, { log }))
  }
  return base
}

// ---- setting aside -------------------------------------------------------
/* Set aside ALL dice showing `value`. Blocks values already taken this turn or not
   present in the current roll. */
export function setAside(s: PickominoState, value: Face): PickominoState {
  if (s.phase === 'over' || !s.hasRolled) return s
  if (s.takenValues.includes(value)) return s
  const matched = s.roll.filter(d => d === value)
  if (matched.length === 0) return s
  const left = s.roll.filter(d => d !== value)
  const aside = s.aside.concat(matched)
  const takenValues = s.takenValues.concat([value])
  const who = s.players[s.turn].name
  const log = push(s.log, s.turn === 0 ? 'you' : 'ai',
    `${who} set aside ${matched.length}× ${faceLabel(value)} (sum ${sumOf(aside)}).`)
  return Object.assign({}, s, { roll: left, aside, takenValues, hasRolled: false, log })
}

// ---- stopping ------------------------------------------------------------
export function canStop(s: PickominoState): boolean {
  return s.phase !== 'over' && sumOf(s.aside) >= MIN_SUM && hasWorm(s.aside)
}

// the tile (if any) the current sum would take from the row
export function takeableRowTile(row: Tile[], sum: number): Tile | null {
  let best: Tile | null = null
  for (const t of row) if (t.n <= sum && (best === null || t.n > best.n)) best = t
  return best
}

// an opponent whose TOP tile number exactly equals sum (steal target)
export function stealTarget(s: PickominoState, sum: number): PlayerState | null {
  for (const p of s.players) {
    if (p.seat === s.turn) continue
    const top = topTile(p)
    if (top && top.n === sum) return p
  }
  return null
}

/* Stop the turn: resolve a take or steal, or bust if neither is possible. */
export function stop(s: PickominoState): PickominoState {
  if (s.phase === 'over') return s
  const sum = sumOf(s.aside)
  const who = s.players[s.turn].name
  if (sum < MIN_SUM || !hasWorm(s.aside)) {
    const log = push(s.log, s.turn === 0 ? 'you' : 'ai', `${who} stopped short (sum ${sum}${hasWorm(s.aside) ? '' : ', no worm'}) — bust!`)
    return resolveBust(Object.assign({}, s, { log }))
  }

  // prefer an exact steal; else take the highest row tile <= sum
  const steal = stealTarget(s, sum)
  if (steal) {
    const tile = topTile(steal)!
    const victim = s.players.map(p =>
      p.seat === steal.seat ? Object.assign({}, p, { stack: p.stack.slice(0, -1) }) : p)
    const players = victim.map(p =>
      p.seat === s.turn ? Object.assign({}, p, { stack: p.stack.concat([tile]) }) : p)
    const log = push(s.log, s.turn === 0 ? 'you' : 'ai',
      `${who} stole tile ${tile.n} (${tile.worms}🐛) from ${steal.name}!`)
    return endTurn(Object.assign({}, s, { players, log }))
  }

  const rowTile = takeableRowTile(s.row, sum)
  if (rowTile) {
    const row = s.row.filter(t => t.n !== rowTile.n)
    const players = s.players.map(p =>
      p.seat === s.turn ? Object.assign({}, p, { stack: p.stack.concat([rowTile]) }) : p)
    const log = push(s.log, s.turn === 0 ? 'you' : 'ai',
      `${who} took tile ${rowTile.n} (${rowTile.worms}🐛).`)
    return endTurn(Object.assign({}, s, { row, players, log }))
  }

  // sum valid but no tile available at all -> bust
  const log = push(s.log, s.turn === 0 ? 'you' : 'ai', `${who} could take no tile (sum ${sum}) — bust!`)
  return resolveBust(Object.assign({}, s, { log }))
}

/* Bust: return the current player's top tile to the row (if any), then flip out
   (remove) the highest tile in the row. */
export function resolveBust(s: PickominoState): PickominoState {
  let row = s.row.slice()
  const players = s.players.slice()
  const me = players[s.turn]
  const returned = topTile(me)
  if (returned) {
    players[s.turn] = Object.assign({}, me, { stack: me.stack.slice(0, -1) })
    row = row.concat([returned]).sort((a, b) => a.n - b.n)
  }
  // flip out the highest tile currently in the row
  let log = s.log
  if (row.length) {
    let hiIdx = 0
    for (let i = 1; i < row.length; i++) if (row[i].n > row[hiIdx].n) hiIdx = i
    const flipped = row[hiIdx]
    row = row.filter((_, i) => i !== hiIdx)
    log = push(log, 'sys', `Tile ${flipped.n} flipped out of play.`)
  }
  return endTurn(Object.assign({}, s, { row, players, log }))
}

/* End the current turn: clear this-turn state, advance to next seat. If the row is
   empty the game ends and the most-worms player wins. */
function endTurn(s: PickominoState): PickominoState {
  if (s.row.length === 0) {
    return finish(s)
  }
  const turn = nextSeat(s.turn, s.players.length)
  return Object.assign({}, s, {
    turn, roll: [], aside: [], takenValues: [], hasRolled: false, phase: 'rolling' as Phase,
  })
}

function finish(s: PickominoState): PickominoState {
  let winner = 0
  let best = -1
  for (const p of s.players) {
    const w = playerWorms(p)
    if (w > best) { best = w; winner = p.seat }
  }
  const log = push(s.log, 'sys', `Row empty — ${s.players[winner].name} wins with ${best} worms.`)
  return Object.assign({}, s, {
    phase: 'over' as Phase, winner, turn: -1, roll: [], aside: [], takenValues: [], hasRolled: false, log,
  })
}

// ---- AI ------------------------------------------------------------------
/* One AI sub-step. Push-your-luck policy:
   - On a fresh roll, set aside the value that maximizes (greedy) value*count, but
     always prefer locking a WORM if none is set aside yet and a worm shows.
   - Stop when canStop AND a worthwhile tile is reachable (exact steal, or a row tile
     whose worms are worth banking and few dice remain / expected gain is thin).
   Returns the state after exactly one action (roll OR setAside OR stop). */
export function aiStep(s: PickominoState): PickominoState {
  if (s.phase === 'over' || s.turn === 0) return s

  // need to roll first
  if (!s.hasRolled) {
    if (s.aside.length === N_DICE) {
      // all dice set aside: must stop (or bust)
      return stop(s)
    }
    // decide BEFORE rolling whether to stop on what we already have
    if (canStop(s) && aiShouldStop(s)) return stop(s)
    return rollDice(s)
  }

  // we have a live roll: choose a value to set aside
  const avail = availableValues(s)
  if (avail.length === 0) {
    // shouldn't happen (rollDice busts), but guard
    return resolveBust(s)
  }
  const value = aiPickValue(s, avail)
  return setAside(s, value)
}

function aiPickValue(s: PickominoState, avail: Face[]): Face {
  const needWorm = !hasWorm(s.aside)
  const wormShowing = avail.includes(WORM)
  // If we still need a worm and one is available, grab worms now (don't risk losing them).
  if (needWorm && wormShowing) return WORM

  // Otherwise greedily maximize the points gained = faceValue * count.
  let best: Face = avail[0]
  let bestScore = -1
  for (const v of avail) {
    const count = s.roll.filter(d => d === v).length
    const score = faceValue(v) * count
    if (score > bestScore) { bestScore = score; best = v }
  }
  return best
}

/* Should the AI stop now (given canStop is already true)? */
function aiShouldStop(s: PickominoState): boolean {
  const sum = sumOf(s.aside)
  // Always take an exact steal — strictly good.
  if (stealTarget(s, sum)) return true
  const rowTile = takeableRowTile(s.row, sum)
  if (!rowTile) return false // nothing to take; pressing is forced anyway, don't stop into a bust
  const left = diceInHand(s)
  if (left <= 1) return true // almost no dice left: bank it
  // If we can already grab a high-worm tile, bank rather than risk a bust.
  if (rowTile.worms >= 3) return true
  // With a worm locked and a decent sum, stop once dice get scarce.
  if (left <= 2 && rowTile.worms >= 2) return true
  // If the very top of the row is already reachable, no upside to continuing.
  const rowMax = s.row.reduce((m, t) => Math.max(m, t.n), 0)
  if (sum >= rowMax) return true
  return false
}

// ---- labels --------------------------------------------------------------
export function faceLabel(f: Face): string {
  return f === WORM ? '🐛' : String(f)
}

export function isAI(seat: number): boolean {
  return seat !== 0
}

export { SEAT_NAMES }
