/* DEEP SEA ADVENTURE — push-your-luck dice race (built for this codebase).
   Three divers share ONE air supply (starts 25). A linear PATH of treasure tiles
   runs from the submarine (index 0 = sub) downward. Tiles carry a LEVEL 0..3 worth
   roughly 0-3 / 4-7 / 8-11 / 12-15 points, laid out ascending from the sub. Play 3
   ROUNDS. On your turn:
     (1) air -= number of treasures you carry,
     (2) choose DIRECTION (down / up). Once you turn UP (back toward the sub) you may
         not turn back down again this round,
     (3) roll 2 dice (each 1..3), move (sum - treasures carried, min 0) spaces in your
         chosen direction, SKIPPING spaces occupied by other divers,
     (4) on your landing tile you MAY pick up the treasure there (leaves a blank), OR
         drop a held treasure onto a blank, OR do nothing.
   ROUND ENDS when air hits 0 (or every diver has returned to the sub): each diver NOT
   back at the sub DROPS ALL carried treasure (lost — re-laid at the deepest end in
   stacks of 3); divers safely back bank their treasures' points. Refill air to 25,
   remove the deepest now-empty levels, next round. After 3 rounds, most points wins.

   You are player 0; AI players 1, 2. Randomness is injectable (state.seed) so tests
   are deterministic. NO React / DOM here. */

export type Phase = 'choose' | 'rolled' | 'decide' | 'over'
// choose : current diver must pick a direction (and air has been ticked)
// rolled : dice rolled, diver has moved, may pick up / drop / pass
export type Dir = 'down' | 'up'

export interface Tile {
  level: number          // 0..3 (treasure tier) -- meaningless for blanks
  value: number          // point value; a BLANK tile has value = -1
  stack: number[]        // for dropped/lost piles laid at the deep end (values), else []
}

export interface Diver {
  seat: number           // 0 = you, 1 / 2 = AI
  name: string
  pos: number            // index along path; 0 == submarine
  direction: Dir         // current travel direction this round
  turned: boolean        // has already turned UP this round (cannot turn again)
  carrying: number[]     // treasure VALUES currently held (in pickup order)
  banked: number         // points safely banked from previous rounds
  returned: boolean      // made it back to the sub THIS round
}

export interface LogEntry { t: string; x: string }

export interface DeepSeaState {
  air: number                 // shared air (0..25)
  path: Tile[]                // index 0 = SUB (a sentinel), 1..N = treasure tiles
  divers: Diver[]
  round: number               // 1..3
  turn: number                // seat whose turn it is
  chose: boolean              // current diver has committed a direction this turn
  dice: [number, number] | null // last roll (each 1..3) or null
  phase: Phase
  winner: number | null       // seat of winner (can be 0!), or null
  seed: number
  log: LogEntry[]
}

export const START_AIR = 25
export const N_ROUNDS = 3
const SEAT_NAMES = ['You', 'Nemo', 'Marlin']
export { SEAT_NAMES }

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

function rollDie(seed: number): { d: number; seed: number } {
  const r = nextRand(seed)
  return { d: ((r.v * 3) | 0) + 1, seed: r.seed } // 1..3
}

/** Roll 2 dice. Pure given the seed — randomness lives in state.seed so tests are
    deterministic; pass an explicit seed to force a roll. */
export function rollDice(s: DeepSeaState): { dice: [number, number]; seed: number } {
  const a = rollDie(s.seed)
  const b = rollDie(a.seed)
  return { dice: [a.d, b.d], seed: b.seed }
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-30)
}

// ---- deck ----------------------------------------------------------------
/* Build the treasure deck: 8 tiles per level (0..3), ascending values inside each
   level. Level L spans values [L*4 .. L*4+3] roughly → 0-3 / 4-7 / 8-11 / 12-15.
   Returned ascending by level so the path runs easy→valuable from the sub. */
export function defaultDeck(): Tile[] {
  const deck: Tile[] = []
  for (let level = 0; level <= 3; level++) {
    for (let k = 0; k < 8; k++) {
      const value = level * 4 + (k % 4) // 0..3 within the band
      deck.push({ level, value, stack: [] })
    }
  }
  return deck // 32 tiles
}

function blank(): Tile {
  return { level: -1, value: -1, stack: [] }
}

export function isBlank(t: Tile): boolean {
  return t.value < 0 && t.stack.length === 0
}

// total points of a list of treasure values
export function sumValues(vals: number[]): number {
  let s = 0
  for (const v of vals) s += v
  return s
}

// ---- game setup ----------------------------------------------------------
export function makeGame(deck?: Tile[], seed = (Math.random() * 0x7fffffff) | 0): DeepSeaState {
  const tiles = (deck ?? defaultDeck()).map(t => ({ level: t.level, value: t.value, stack: t.stack.slice() }))
  // path[0] is the SUB sentinel; treasure tiles follow.
  const path: Tile[] = [blank(), ...tiles]
  const divers: Diver[] = SEAT_NAMES.map((name, seat) => ({
    seat, name, pos: 0, direction: 'down' as Dir, turned: false,
    carrying: [], banked: 0, returned: false,
  }))
  return {
    air: START_AIR,
    path,
    divers,
    round: 1,
    turn: 0,
    chose: false,
    dice: null,
    phase: 'choose',
    winner: null,
    seed: seed >>> 0,
    log: [{ t: 'sys', x: `Round 1 — air ${START_AIR}. Dive for treasure, but everyone breathes the same tank.` }],
  }
}

// the deepest reachable index (last tile in the path)
export function deepestIndex(s: DeepSeaState): number {
  return s.path.length - 1
}

export function diver(s: DeepSeaState, seat: number): Diver {
  return s.divers[seat]
}

function isOccupied(s: DeepSeaState, idx: number, exceptSeat: number): boolean {
  if (idx <= 0) return false // sub is never "occupied" for skipping
  for (const d of s.divers) {
    if (d.seat === exceptSeat) continue
    if (!d.returned && d.pos === idx) return true
  }
  return false
}

// ---- turn flow -----------------------------------------------------------
/* (1) Air tick at the START of a diver's turn: subtract their carried-treasure
   count. Returns updated state in phase 'choose' (ready to pick direction). If the
   tick drops air to <= 0 the round ends immediately. */
export function startTurnAirTick(s: DeepSeaState): DeepSeaState {
  if (s.phase === 'over') return s
  const d = s.divers[s.turn]
  if (d.returned) {
    // already safe — nothing to breathe, just skip to next diver
    return advanceTurn(s)
  }
  const cost = d.carrying.length
  let air = s.air - cost
  const who = d.name
  let log = cost > 0
    ? push(s.log, s.turn === 0 ? 'you' : 'ai', `${who} breathes ${cost} air (carrying ${cost}).`)
    : s.log
  if (air <= 0) {
    air = 0
    log = push(log, 'sys', 'The tank is empty!')
    return endRound(Object.assign({}, s, { air, log }))
  }
  return Object.assign({}, s, { air, phase: 'choose' as Phase, chose: false, dice: null, log })
}

/* (2) Choose a direction. Turning UP (toward the sub) is a one-way commitment for the
   round. Returns state still in 'choose' so the diver can then roll. */
export function chooseDirection(s: DeepSeaState, dir: Dir): DeepSeaState {
  if (s.phase !== 'choose') return s
  const d = s.divers[s.turn]
  if (d.returned) return s
  // can't turn back down after having turned up
  if (dir === 'down' && d.turned) return s
  let turned = d.turned
  let log = s.log
  if (dir === 'up' && d.direction !== 'up') {
    turned = true
    log = push(s.log, s.turn === 0 ? 'you' : 'ai', `${d.name} turns back toward the sub.`)
  }
  const divers = s.divers.map(x =>
    x.seat === s.turn ? Object.assign({}, x, { direction: dir, turned }) : x)
  return Object.assign({}, s, { divers, chose: true, log })
}

/* (3) Roll 2 dice and MOVE. Net steps = (dice sum - treasures carried), min 0, in the
   chosen direction, skipping occupied spaces. Down is clamped to the deepest tile; up
   stops at the sub (index 0 -> the diver has returned). Lands the diver and enters the
   'rolled' phase for pickup/drop. */
export function move(s: DeepSeaState): DeepSeaState {
  if (s.phase !== 'choose' || !s.chose) return s
  const r = rollDice(s)
  return applyMove(Object.assign({}, s, { seed: r.seed }), r.dice)
}

/* Apply a known dice roll (used by move() and by tests for determinism). */
export function applyMove(s: DeepSeaState, dice: [number, number]): DeepSeaState {
  const d = s.divers[s.turn]
  if (d.returned) return s
  const load = d.carrying.length
  let steps = Math.max(0, dice[0] + dice[1] - load)
  const dir = d.direction
  const deepest = deepestIndex(s)
  let pos = d.pos
  // walk one space at a time, skipping occupied tiles (they don't consume a step)
  while (steps > 0) {
    let next = pos + (dir === 'down' ? 1 : -1)
    if (dir === 'down' && next > deepest) break // can't go past the deepest tile
    if (dir === 'up' && next < 0) { next = 0; pos = 0; break }
    pos = next
    if (pos === 0) break // reached the sub
    if (isOccupied(s, pos, s.turn)) continue // skipped space: doesn't cost a step
    steps--
  }
  const returned = pos === 0 && dir === 'up'
  const who = d.name
  let log = push(s.log, s.turn === 0 ? 'you' : 'ai',
    `${who} rolled ${dice[0]}+${dice[1]} → moves ${dice[0] + dice[1]}−${load} to depth ${pos}.`)
  const divers = s.divers.map(x =>
    x.seat === s.turn ? Object.assign({}, x, { pos, returned }) : x)
  let next = Object.assign({}, s, { divers, dice, phase: 'rolled' as Phase, log })
  if (returned) {
    log = push(log, s.turn === 0 ? 'you' : 'ai',
      `${who} surfaced safely with ${d.carrying.length} treasure (${sumValues(d.carrying)} pts pending).`)
    next = Object.assign({}, next, { log })
    return endTurnAfterAction(next)
  }
  return next
}

/* (4a) Pick up the treasure on the current landing tile (if any). Takes the tile and
   leaves a BLANK. A stack pile (lost-treasure marker) is taken whole. */
export function pickUp(s: DeepSeaState): DeepSeaState {
  if (s.phase !== 'rolled') return s
  const d = s.divers[s.turn]
  if (d.pos <= 0) return s
  const tile = s.path[d.pos]
  let gained: number[] = []
  if (tile.stack.length > 0) gained = tile.stack.slice()
  else if (!isBlank(tile)) gained = [tile.value]
  if (gained.length === 0) return endTurnAfterAction(s) // nothing here
  const path = s.path.slice()
  path[d.pos] = blank()
  const divers = s.divers.map(x =>
    x.seat === s.turn ? Object.assign({}, x, { carrying: x.carrying.concat(gained) }) : x)
  const log = push(s.log, s.turn === 0 ? 'you' : 'ai',
    `${d.name} grabs treasure worth ${sumValues(gained)}.`)
  return endTurnAfterAction(Object.assign({}, s, { path, divers, log }))
}

/* (4b) Drop the most-recently-held treasure onto the current tile if it's blank. */
export function drop(s: DeepSeaState): DeepSeaState {
  if (s.phase !== 'rolled') return s
  const d = s.divers[s.turn]
  if (d.pos <= 0 || d.carrying.length === 0) return s
  const tile = s.path[d.pos]
  if (!isBlank(tile)) return s
  const carrying = d.carrying.slice()
  const v = carrying.pop()!
  const path = s.path.slice()
  path[d.pos] = { level: -1, value: v, stack: [] } // a single dropped treasure (not blank)
  const divers = s.divers.map(x =>
    x.seat === s.turn ? Object.assign({}, x, { carrying }) : x)
  const log = push(s.log, s.turn === 0 ? 'you' : 'ai', `${d.name} drops a treasure (${v}).`)
  return endTurnAfterAction(Object.assign({}, s, { path, divers, log }))
}

/* (4c) Do nothing on the landing tile and end the turn. */
export function pass(s: DeepSeaState): DeepSeaState {
  if (s.phase !== 'rolled') return s
  return endTurnAfterAction(s)
}

// advance to the next diver and tick their air (or end the round if appropriate)
function endTurnAfterAction(s: DeepSeaState): DeepSeaState {
  if (s.phase === 'over') return s
  return advanceTurn(s)
}

/* Move to the next seat. If everyone has returned, end the round. Otherwise tick the
   next diver's air to begin their turn. */
function advanceTurn(s: DeepSeaState): DeepSeaState {
  if (allReturned(s)) {
    return endRound(s)
  }
  const n = s.divers.length
  let next = (s.turn + 1) % n
  // skip divers who already returned (they take no turns), but guard against infinite loop
  let guard = 0
  while (s.divers[next].returned && guard < n) {
    next = (next + 1) % n
    guard++
  }
  const advanced = Object.assign({}, s, { turn: next, phase: 'choose' as Phase, chose: false, dice: null })
  return startTurnAirTick(advanced)
}

export function allReturned(s: DeepSeaState): boolean {
  return s.divers.every(d => d.returned)
}

// ---- end of round --------------------------------------------------------
/* Resolve the round: divers safely back at the sub bank their carried treasure's
   points; divers still out lose ALL carried treasure (re-laid at the deep end in
   stacks of 3). Then refill air, trim deepest empty levels, reset divers, advance the
   round (or finish the game after round 3). */
export function endRound(s: DeepSeaState): DeepSeaState {
  if (s.phase === 'over') return s
  let log = push(s.log, 'sys', `Round ${s.round} ends.`)
  const lostPiles: number[][] = [] // each pile (stack of up to 3) of lost values
  let pile: number[] = []
  const divers = s.divers.map(d => {
    if (d.returned && d.carrying.length > 0) {
      const pts = sumValues(d.carrying)
      log = push(log, d.seat === 0 ? 'you' : 'ai', `${d.name} banks ${pts} pts.`)
      return Object.assign({}, d, { banked: d.banked + pts, carrying: [] })
    }
    if (!d.returned && d.carrying.length > 0) {
      log = push(log, d.seat === 0 ? 'you' : 'ai',
        `${d.name} drowned the dive — ${d.carrying.length} treasure lost.`)
      for (const v of d.carrying) {
        pile.push(v)
        if (pile.length === 3) { lostPiles.push(pile); pile = [] }
      }
    }
    return Object.assign({}, d, { carrying: [] })
  })
  if (pile.length > 0) lostPiles.push(pile)

  // build the next path: keep only non-blank treasure tiles (compact away gaps), then
  // append the lost piles as stacked tiles at the deep end.
  let path: Tile[] = [s.path[0]] // keep the sub sentinel
  for (let i = 1; i < s.path.length; i++) {
    const t = s.path[i]
    if (!isBlank(t)) path.push({ level: t.level, value: t.value, stack: t.stack.slice() })
  }
  for (const p of lostPiles) {
    path.push({ level: 3, value: -1, stack: p.slice() })
  }

  // finish or advance round
  if (s.round >= N_ROUNDS) {
    return finish(Object.assign({}, s, { divers, path, log }))
  }
  const resetDivers = divers.map(d => Object.assign({}, d, {
    pos: 0, direction: 'down' as Dir, turned: false, returned: false, carrying: [],
  }))
  log = push(log, 'sys', `Round ${s.round + 1} — air refilled to ${START_AIR}.`)
  const next = Object.assign({}, s, {
    air: START_AIR,
    path,
    divers: resetDivers,
    round: s.round + 1,
    turn: 0,
    chose: false,
    dice: null,
    phase: 'choose' as Phase,
    log,
  })
  // begin round with player 0's air tick (carrying 0 → no cost, just enters 'choose')
  return startTurnAirTick(next)
}

function finish(s: DeepSeaState): DeepSeaState {
  let winner = 0
  let best = -1
  for (const d of s.divers) {
    if (d.banked > best) { best = d.banked; winner = d.seat }
  }
  const log = push(s.log, 'sys', `Game over — ${s.divers[winner].name} wins with ${best} pts.`)
  return Object.assign({}, s, { phase: 'over' as Phase, winner, dice: null, log })
}

export function winner(s: DeepSeaState): number | null {
  return s.winner
}

// total score = banked (carrying isn't scored until banked)
export function score(s: DeepSeaState, seat: number): number {
  return s.divers[seat].banked
}

// ---- AI ------------------------------------------------------------------
/* One AI sub-step. Push-your-luck policy:
   - If we must choose a direction: keep diving DOWN while it's safe to (air buffer
     covers the round-trip given our load); otherwise turn UP toward the sub. If
     already turned, keep going up.
   - After moving: pick up the tile if it's worth grabbing and we still have air margin;
     near death, just head back (skip grabbing more weight).
   Each call performs exactly ONE action (direction, move, or pickup/drop/pass). */
export function aiStep(s: DeepSeaState): DeepSeaState {
  if (s.phase === 'over' || s.turn === 0) return s
  const d = s.divers[s.turn]
  if (d.returned) return advanceTurn(s)

  if (s.phase === 'choose') {
    if (!s.chose) {
      // sub-step 1: commit a direction
      return chooseDirection(s, aiChooseDir(s, d))
    }
    // sub-step 2: roll + move
    return move(s)
  }
  if (s.phase === 'rolled') {
    // sub-step 3: pick up / drop / pass
    return aiAfterMove(s, d)
  }
  return s
}

function aiChooseDir(s: DeepSeaState, d: Diver): Dir {
  if (d.turned) return 'up'
  // estimate: turns of air left ≈ air / max(1, load). Distance home = pos. If air is
  // getting tight relative to the trip home, turn back. Greedy when light & deep air.
  const load = d.carrying.length
  const airMargin = s.air
  // rough round-trip safety: need ~pos more "diver-turns" to get home, each costs load.
  const turnsToHome = Math.ceil(d.pos / 2) // ~2 net spaces per turn typical
  const airNeeded = turnsToHome * Math.max(1, load) + 2
  if (airMargin <= airNeeded) return 'up'
  // if we already carry a few, and we're fairly deep, start heading back
  if (load >= 3 && d.pos >= deepestIndex(s) - 2) return 'up'
  return 'down'
}

function aiAfterMove(s: DeepSeaState, d: Diver): DeepSeaState {
  const tile = s.path[d.pos]
  const here = tile.stack.length > 0 ? sumValues(tile.stack) : (isBlank(tile) ? -1 : tile.value)
  // grab if there's value AND we have enough air to plausibly get home with the extra load
  if (here >= 0) {
    const newLoad = d.carrying.length + 1
    const turnsToHome = Math.ceil(d.pos / 2) + 1
    const airNeeded = turnsToHome * newLoad
    if (s.air > airNeeded && (here >= 2 || d.carrying.length < 4)) {
      return pickUp(s)
    }
  }
  return pass(s)
}

/* Full single-turn AI used by tests / self-play: runs the AI through its whole turn
   (air already ticked → choose, roll, act) deterministically. Returns once the turn has
   passed to the next diver (or the round/game ended). */
export function aiTurn(s: DeepSeaState): DeepSeaState {
  if (s.phase === 'over' || s.turn === 0) return s
  const startTurn = s.turn
  const startRound = s.round
  let cur = s
  // choose direction
  if (cur.phase === 'choose') {
    cur = chooseDirection(cur, aiChooseDir(cur, cur.divers[cur.turn]))
  }
  // roll + move
  if (cur.phase === 'choose') {
    cur = move(cur)
  }
  // act
  if (cur.phase === 'rolled' && cur.turn === startTurn && cur.round === startRound) {
    cur = aiAfterMove(cur, cur.divers[cur.turn])
  }
  return cur
}

export function isAI(seat: number): boolean {
  return seat !== 0
}
