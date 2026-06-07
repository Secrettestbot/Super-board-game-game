/* CATAN DICE — pure logic (built for this codebase, not ported).
   A 2-player roll-and-write settler game. Each player owns their OWN sheet: a fixed linear
   BUILD TRACK of road/settlement/city slots plus a side KNIGHT track. On your turn you roll
   all six RESOURCE DICE (wood/brick/wheat/sheep/ore/gold), keep any, and re-roll the rest up
   to two more times (3 rolls total, Yahtzee-style). Then you SPEND resource combinations to
   build the NEXT structure on your track (strict order) and/or knights. Gold is a wild —
   1 gold counts as any one resource. After ~15 rounds the higher score wins.

   No React/DOM here. Randomness is injectable (rollDice takes an optional rng) so tests
   are deterministic. */

export type Player = 0 | 1
export type Resource = 'wood' | 'brick' | 'wheat' | 'sheep' | 'ore' | 'gold'
export type Structure = 'road' | 'settlement' | 'city' | 'knight'
export type Phase = 'roll' | 'build'
export type Winner = Player | 'tie' | null

export const RESOURCES: Resource[] = ['wood', 'brick', 'wheat', 'sheep', 'ore', 'gold']
/** The six die faces (each die has these faces; gold is the wild face). */
export const DIE_FACES: Resource[] = ['wood', 'brick', 'wheat', 'sheep', 'ore', 'gold']
export const NDICE = 6
export const MAX_ROLLS = 3
export const ROUNDS = 15

export interface LogEntry { t: string; x: string }

/** Resource cost as a partial map (gold not allowed as a cost key — gold only ever PAYS). */
export type Cost = Partial<Record<Exclude<Resource, 'gold'>, number>>

export const COSTS: Record<Structure, Cost> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  knight: { sheep: 2, ore: 1 },
}

export const POINTS: Record<Structure, number> = {
  road: 0,        // roads earn nothing directly; they feed the longest-road bonus
  settlement: 1,
  city: 2,        // a city REPLACES a settlement; net +1 over the settlement it upgrades
  knight: 0,      // knights score via the knight-track bonus, not per-piece
}

export const LONGEST_ROAD_BONUS = 2  // most roads built
export const KNIGHT_BONUS = 2        // most knights deployed
export const UNBUILT_PENALTY = 1     // -1 per settlement slot left empty at game end

/* ---------------- The build track ----------------
   A fixed linear sequence the player advances through IN ORDER. Each slot is a structure
   that must be built before the next. Roads gate settlements; settlements can later be
   upgraded to cities (handled separately, not as track slots). Knights are a side track. */
export type Slot = 'road' | 'settlement'
export const TRACK: Slot[] = [
  'road', 'settlement',
  'road', 'settlement',
  'road', 'settlement',
  'road', 'settlement',
  'road', 'settlement',
]
export const KNIGHT_SLOTS = 4

export interface Sheet {
  /** How many track slots have been built (index into TRACK). */
  trackBuilt: number
  /** Of the settlements built, how many have been upgraded to cities. */
  cities: number
  /** Knights deployed on the side track (0..KNIGHT_SLOTS). */
  knights: number
}

export interface CatanState {
  sheets: [Sheet, Sheet]
  you: Player
  turn: Player
  phase: Phase
  /** Current six dice as resources; empty array before the first roll of a turn. */
  dice: Resource[]
  /** Which dice are kept across a re-roll (length NDICE). */
  kept: boolean[]
  rollsLeft: number
  round: number          // 1..ROUNDS
  winner: Winner
  /** Monotonic counter bumped on every transition — the AI driver's tick. */
  step: number
  log: LogEntry[]
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

function blankSheet(): Sheet {
  return { trackBuilt: 0, cities: 0, knights: 0 }
}

export function makeGame(you: Player = 0): CatanState {
  return {
    sheets: [blankSheet(), blankSheet()],
    you,
    turn: 0,
    phase: 'roll',
    dice: [],
    kept: Array(NDICE).fill(false),
    rollsLeft: MAX_ROLLS,
    round: 1,
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Roll the six resource dice, keep what you need, then build along your track. Highest score after 15 rounds wins.' }],
  }
}

// ===================== Dice =====================

export type Rng = () => number
const defaultRng: Rng = Math.random
function randFace(rng: Rng): Resource { return DIE_FACES[(rng() * DIE_FACES.length) | 0] }

/**
 * Roll the dice. On the FIRST roll of a turn (rollsLeft === MAX_ROLLS) all six are rolled
 * fresh. On a re-roll, only un-kept dice change. Guarded: does nothing with no rolls left,
 * a winner, or outside the roll phase. rng is injectable for tests.
 */
export function rollDice(s: CatanState, rng: Rng = defaultRng): CatanState {
  if (s.winner != null || s.phase !== 'roll' || s.rollsLeft <= 0) return s
  const fresh = s.rollsLeft === MAX_ROLLS || s.dice.length === 0
  const dice = fresh
    ? Array.from({ length: NDICE }, () => randFace(rng))
    : s.dice.map((d, i) => (s.kept[i] ? d : randFace(rng)))
  const rollsLeft = s.rollsLeft - 1
  const phase: Phase = rollsLeft <= 0 ? 'build' : 'roll'
  const who = s.turn === s.you ? 'You' : 'Rival'
  const log = push(s.log, s.turn === s.you ? 'you' : 'foe', `${who} rolled ${dice.join(' ')}.`)
  return { ...s, dice, rollsLeft, phase, step: s.step + 1, log }
}

/** Toggle whether die `i` is kept across the next re-roll. Only meaningful in the roll phase. */
export function toggleKeep(s: CatanState, i: number): CatanState {
  if (s.winner != null || s.phase !== 'roll' || s.dice.length === 0) return s
  if (i < 0 || i >= NDICE) return s
  const kept = s.kept.slice()
  kept[i] = !kept[i]
  return { ...s, kept, step: s.step + 1 }
}

/** Stop re-rolling early and move to the build phase (with rolls still in hand). */
export function stopRolling(s: CatanState): CatanState {
  if (s.winner != null || s.phase !== 'roll' || s.dice.length === 0) return s
  const who = s.turn === s.you ? 'You' : 'Rival'
  const log = push(s.log, 'sys', `${who} stops rolling to build.`)
  return { ...s, phase: 'build', step: s.step + 1, log }
}

// ===================== Resources / paying =====================

/** Count the current dice into a resource pool. */
export function pool(dice: Resource[]): Record<Resource, number> {
  const p: Record<Resource, number> = { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0, gold: 0 }
  for (const d of dice) p[d]++
  return p
}

/**
 * Can `cost` be paid from `p`? Each non-gold shortfall may be covered by gold (1 gold = any
 * one resource). Returns true iff total shortfall across resources ≤ available gold.
 */
export function canAfford(p: Record<Resource, number>, cost: Cost): boolean {
  let shortfall = 0
  for (const k of Object.keys(cost) as (keyof Cost)[]) {
    const need = cost[k] ?? 0
    const have = p[k]
    if (have < need) shortfall += need - have
  }
  return shortfall <= p.gold
}

/** Deduct `cost` from a pool, spending real resources first then gold for any shortfall.
 *  Assumes canAfford(p, cost) is true. Returns the new pool. */
function payFrom(p: Record<Resource, number>, cost: Cost): Record<Resource, number> {
  const n = { ...p }
  let goldNeeded = 0
  for (const k of Object.keys(cost) as (keyof Cost)[]) {
    const need = cost[k] ?? 0
    const use = Math.min(n[k], need)
    n[k] -= use
    goldNeeded += need - use
  }
  n.gold -= goldNeeded
  return n
}

/** What structure (if any) can be built NEXT on this sheet's track? */
export function nextTrackSlot(sheet: Sheet): Slot | null {
  if (sheet.trackBuilt >= TRACK.length) return null
  return TRACK[sheet.trackBuilt]
}

/** How many settlements are currently built (and thus upgradable to cities). */
export function settlementsBuilt(sheet: Sheet): number {
  let n = 0
  for (let i = 0; i < sheet.trackBuilt; i++) if (TRACK[i] === 'settlement') n++
  return n
}

/** How many roads are currently built (for the longest-road race). */
export function roadsBuilt(sheet: Sheet): number {
  let n = 0
  for (let i = 0; i < sheet.trackBuilt; i++) if (TRACK[i] === 'road') n++
  return n
}

/**
 * Can the given player build `type` right now, given current dice and sheet state?
 * Enforces BUILD ORDER: road/settlement must be the next track slot; a city needs an
 * un-upgraded settlement; a knight needs a free knight slot. Also checks resource cost.
 */
export function canBuild(s: CatanState, player: Player, type: Structure): boolean {
  if (s.winner != null) return false
  const sheet = s.sheets[player]
  const p = pool(s.dice)
  if (type === 'road' || type === 'settlement') {
    if (nextTrackSlot(sheet) !== type) return false
  } else if (type === 'city') {
    if (sheet.cities >= settlementsBuilt(sheet)) return false  // no plain settlement left to upgrade
  } else if (type === 'knight') {
    if (sheet.knights >= KNIGHT_SLOTS) return false
  }
  return canAfford(p, COSTS[type])
}

/**
 * Build `type` for `player`: deduct the cost from the dice (consuming them) and advance the
 * sheet. Roads/settlements advance the track; cities upgrade a settlement; knights add to the
 * side track. Guarded — a no-op (returns s) if not buildable. Buildable only during the
 * active player's build phase.
 */
export function build(s: CatanState, player: Player, type: Structure): CatanState {
  if (s.phase !== 'build' || s.turn !== player) return s
  if (!canBuild(s, player, type)) return s
  const remaining = payFrom(pool(s.dice), COSTS[type])
  // Rebuild the dice array from the remaining pool so leftover resources can fund more builds.
  const dice: Resource[] = []
  for (const r of RESOURCES) for (let k = 0; k < remaining[r]; k++) dice.push(r)
  const sheets = s.sheets.slice() as [Sheet, Sheet]
  const sheet = { ...sheets[player] }
  if (type === 'road' || type === 'settlement') sheet.trackBuilt += 1
  else if (type === 'city') sheet.cities += 1
  else if (type === 'knight') sheet.knights += 1
  sheets[player] = sheet
  const who = player === s.you ? 'You' : 'Rival'
  const log = push(s.log, player === s.you ? 'you' : 'foe', `${who} built a ${type}.`)
  return { ...s, sheets, dice, log, step: s.step + 1 }
}

// ===================== Scoring =====================

/** Raw piece points for one sheet (no longest-road/knight bonuses, no penalty). */
function piecePoints(sheet: Sheet): number {
  const settlements = settlementsBuilt(sheet)
  const plainSettlements = settlements - sheet.cities
  return plainSettlements * POINTS.settlement + sheet.cities * (POINTS.settlement + 1)
  //         ^ each city is a settlement upgraded: settlement(1) + 1 = 2 points total
}

export interface ScoreBreakdown {
  pieces: number
  longestRoad: number
  knightBonus: number
  penalty: number
  total: number
}

/**
 * Full score for `player`, including the longest-road and most-knights bonuses (which depend
 * on BOTH sheets) and the unbuilt-settlement penalty. Ties on a race award the bonus to
 * NEITHER player.
 */
export function scoreSheet(s: CatanState, player: Player): ScoreBreakdown {
  const me = s.sheets[player]
  const them = s.sheets[player === 0 ? 1 : 0]
  const pieces = piecePoints(me)

  const myRoads = roadsBuilt(me), theirRoads = roadsBuilt(them)
  const longestRoad = myRoads > theirRoads && myRoads > 0 ? LONGEST_ROAD_BONUS : 0

  const knightBonus = me.knights > them.knights && me.knights > 0 ? KNIGHT_BONUS : 0

  const emptySettlementSlots = TRACK.slice(me.trackBuilt).filter(x => x === 'settlement').length
  const penalty = emptySettlementSlots * UNBUILT_PENALTY

  const total = pieces + longestRoad + knightBonus - penalty
  return { pieces, longestRoad, knightBonus, penalty, total }
}

export function totalScore(s: CatanState, player: Player): number {
  return scoreSheet(s, player).total
}

// ===================== Turn flow / winner =====================

/** End the active player's turn: hand off, or advance the round, or finish the game. */
export function endTurn(s: CatanState): CatanState {
  if (s.winner != null) return s
  const next: Player = s.turn === 0 ? 1 : 0
  // A full round = both players have taken a turn. Round advances when play returns to P0.
  const round = next === 0 ? s.round + 1 : s.round
  const base: CatanState = {
    ...s,
    turn: next,
    phase: 'roll',
    dice: [],
    kept: Array(NDICE).fill(false),
    rollsLeft: MAX_ROLLS,
    round,
    step: s.step + 1,
  }
  if (round > ROUNDS) return finish(base)
  return base
}

function finish(s: CatanState): CatanState {
  const a = totalScore(s, 0), b = totalScore(s, 1)
  const winner: Winner = a > b ? 0 : b > a ? 1 : 'tie'
  const youScore = totalScore(s, s.you)
  const foeScore = totalScore(s, s.you === 0 ? 1 : 0)
  const msg = winner === 'tie'
    ? `Game over — a tie at ${youScore}.`
    : winner === s.you
      ? `Game over — you win ${youScore} to ${foeScore}!`
      : `Game over — the rival wins ${foeScore} to ${youScore}.`
  const log = push(s.log, 'sys', msg)
  return { ...s, winner, log, dice: [], phase: 'roll' }
}

export function winner(s: CatanState): Winner {
  return s.winner
}

// ===================== AI =====================

/** The build options in greedy priority order — highest value / cheapest-progress first. */
const AI_BUILD_PRIORITY: Structure[] = ['city', 'settlement', 'knight', 'road']

/** Best single structure the AI can build right now, by priority, or null. */
function aiBestBuild(s: CatanState, p: Player): Structure | null {
  for (const t of AI_BUILD_PRIORITY) if (canBuild(s, p, t)) return t
  return null
}

/** The structure the AI is currently saving toward (its next track slot, or a city upgrade,
 *  or a knight) — used to decide which dice to keep. */
function aiTargets(s: CatanState, p: Player): Structure[] {
  const sheet = s.sheets[p]
  const targets: Structure[] = []
  const slot = nextTrackSlot(sheet)
  if (slot) targets.push(slot)
  if (sheet.cities < settlementsBuilt(sheet)) targets.push('city')
  if (sheet.knights < KNIGHT_SLOTS) targets.push('knight')
  return targets
}

/**
 * Greedy keep decision: keep any die whose resource is still needed by one of the targets
 * (after accounting for what earlier targets already claim). Gold is always kept (universal).
 * Pure — returns the keep mask for the current dice.
 */
export function aiKeepMask(s: CatanState, p: Player): boolean[] {
  const dice = s.dice
  const targets = aiTargets(s, p)
  // Accumulate total demand per resource across all targets (so we keep toward several goals).
  const demand: Record<Exclude<Resource, 'gold'>, number> = { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 }
  for (const t of targets) {
    const c = COSTS[t]
    for (const k of Object.keys(c) as (keyof Cost)[]) demand[k] += c[k] ?? 0
  }
  const kept = Array(dice.length).fill(false)
  const used: Record<Exclude<Resource, 'gold'>, number> = { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 }
  for (let i = 0; i < dice.length; i++) {
    const d = dice[i]
    if (d === 'gold') { kept[i] = true; continue }
    if (used[d] < demand[d]) { kept[i] = true; used[d]++ }
  }
  return kept
}

/**
 * Run the AI player's ENTIRE turn in one call (used by tests / fast self-play). Rolls up to
 * MAX_ROLLS times, keeping greedily between rolls, then builds everything affordable in
 * priority order, then ends the turn. Returns the post-turn state.
 */
export function aiTurn(s: CatanState, rng: Rng = defaultRng): CatanState {
  if (s.winner != null) return s
  const p = s.turn
  let st = s
  // Roll phase: roll, then keep-and-reroll while rolls remain and we still want resources.
  st = rollDice(st, rng)
  while (st.phase === 'roll' && st.rollsLeft > 0) {
    const mask = aiKeepMask(st, p)
    // If everything is already kept (all useful), stop early.
    if (mask.every(Boolean)) { st = stopRolling(st); break }
    // Apply the keep mask, then reroll.
    st = { ...st, kept: mask }
    st = rollDice(st, rng)
  }
  if (st.phase === 'roll') st = stopRolling(st)
  // Build phase: build the best affordable structure repeatedly until none remain.
  let guard = 0
  while (guard++ < 12) {
    const best = aiBestBuild(st, p)
    if (best == null) break
    st = build(st, p, best)
  }
  return endTurn(st)
}

/**
 * One AI SUB-STEP for the UI driver (so the rival visibly rolls/keeps/builds). Advances the
 * AI turn by a single observable action and returns the new state. Idempotent-ish: safe to
 * call repeatedly; it walks roll → keep/reroll → build → endTurn. Only acts on the AI's turn.
 */
export function aiStep(s: CatanState, rng: Rng = defaultRng): CatanState {
  if (s.winner != null || s.turn === s.you) return s
  const p = s.turn
  if (s.phase === 'roll') {
    if (s.dice.length === 0) return rollDice(s, rng)          // first roll
    if (s.rollsLeft <= 0) return stopRolling(s)
    const mask = aiKeepMask(s, p)
    if (mask.every(Boolean)) return stopRolling(s)            // nothing more worth chasing
    // Decide: if we can already build our best target, stop and build; else keep + reroll.
    if (aiBestBuild(s, p) != null && s.rollsLeft < MAX_ROLLS) return stopRolling(s)
    return rollDice({ ...s, kept: mask }, rng)
  }
  // build phase
  const best = aiBestBuild(s, p)
  if (best != null) return build(s, p, best)
  return endTurn(s)
}
