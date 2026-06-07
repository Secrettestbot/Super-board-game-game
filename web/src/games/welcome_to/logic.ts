/* WELCOME TO... — logic (built for this codebase, not ported).
   2-player flip-and-write neighborhood building. You vs a greedy AI; each fills their OWN sheet.

   Each player has 3 STREETS of houses (10, 11, 12 lots). Every turn the deck flips three
   NUMBER cards and three EFFECT cards, forming three PAIRS (number + effect). Both players
   pick ONE pair, then WRITE that number into an empty lot — numbers within a street must be
   strictly ASCENDING left to right. The chosen EFFECT then resolves:

     Fence   — build a fence on one side of the written lot (splits estates).
     Pool    — fill a pool if the lot has a pool slot (+pool points).
     Park    — advance the park track on the street the number was written into.
     Bis     — instead lets you write a number EQUAL to an adjacent lot (a duplicate),
               relaxing strict-ascending for that one placement; costs an end-game penalty.
     Temp    — apply ±1 or ±2 to the flipped number before writing.
     Estate  — advance the estate-value track (raises what completed estates are worth).

   If a player cannot legally place the chosen number anywhere, they take a PERMIT REFUSAL.
   3 refusals ends the game for everyone (and is a penalty). Game also ends when a player
   fills all their houses, or completes all city plans. Highest score wins.

   NO React / DOM here. Deterministic decks are accepted for tests. */

export type EffectKind = 'fence' | 'pool' | 'park' | 'bis' | 'temp' | 'estate'

export interface Pair {
  number: number
  effect: EffectKind
}

// A street is a row of lots. Some lots have pool slots.
export interface Street {
  values: (number | null)[] // written house numbers, null = empty
  pools: boolean[]          // true = this lot has a pool slot
  poolFilled: boolean[]     // true = pool slot filled
  fencesRight: boolean[]    // fencesRight[i] = a fence to the RIGHT of lot i
  park: number              // park-track progress (number of houses on this street, capped)
}

export interface Sheet {
  streets: Street[]   // length 3, sizes 10/11/12
  estate: number      // estate-value track progress (0..ESTATE_TRACK.length-1)
  bis: number         // count of bis duplications taken
  refusals: number    // count of permit refusals
}

export interface CityPlan {
  id: string
  label: string
  bonus: number
  done: [boolean, boolean] // claimed by [player0, player1]
  check: (sheet: Sheet) => boolean
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface State {
  sheets: [Sheet, Sheet]      // 0 = You, 1 = Rival
  numberDeck: number[]        // remaining numbers (drawn from the front)
  effectDeck: EffectKind[]    // remaining effects (drawn from the front)
  flips: Pair[]               // the 3 current pairs (number + effect)
  picked: [boolean, boolean]  // has each player acted this round?
  plans: CityPlan[]
  scores: [number, number]
  turn: 0 | 1                 // whose input we await (0 = you place, 1 = AI places)
  step: number                // monotonic counter for the AI driver tick
  winner: 0 | 1 | 'draw' | null
  log: LogEntry[]
}

export const STREET_SIZES = [10, 11, 12]
const PARK_MAX = STREET_SIZES // park track caps at street length

// Which lots carry pool slots, per street (fixed layout).
const POOL_LAYOUT: number[][] = [
  [2, 6, 9],
  [0, 4, 7, 10],
  [1, 5, 8, 11],
]

// Estate scoring: points for a completed estate (consecutive houses between fences) by SIZE.
// Index = estate size (1..6). Size 0 / >6 -> 0.
export const ESTATE_VALUE: number[] = [0, 1, 3, 6, 10, 15, 18]

// Estate-value track: a multiplier-ish bonus added per completed estate as the track advances.
export const ESTATE_TRACK: number[] = [0, 1, 2, 3, 5]

// Park track: points awarded for reaching each park level on a street.
export const PARK_VALUE: number[] = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]

const POOL_POINTS = 3
const BIS_PENALTY = 3
const REFUSAL_PENALTY = 2

const EFFECTS: EffectKind[] = ['fence', 'pool', 'park', 'bis', 'temp', 'estate']

// ---- deterministic-ish helpers (Math.random for play, supplied decks for tests) ----
function makeNumberDeck(): number[] {
  // numbers 1..15, several copies, shuffled
  const base: number[] = []
  for (let n = 1; n <= 15; n++) for (let k = 0; k < 6; k++) base.push(n)
  return shuffle(base)
}
function makeEffectDeck(): EffectKind[] {
  const base: EffectKind[] = []
  for (const e of EFFECTS) for (let k = 0; k < 15; k++) base.push(e)
  return shuffle(base)
}
function shuffle<T>(a: T[]): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function emptyStreet(size: number, poolIdx: number[]): Street {
  return {
    values: new Array(size).fill(null),
    pools: Array.from({ length: size }, (_, i) => poolIdx.includes(i)),
    poolFilled: new Array(size).fill(false),
    fencesRight: new Array(size).fill(false),
    park: 0,
  }
}
function emptySheet(): Sheet {
  return {
    streets: STREET_SIZES.map((sz, i) => emptyStreet(sz, POOL_LAYOUT[i])),
    estate: 0,
    bis: 0,
    refusals: 0,
  }
}

function cloneStreet(s: Street): Street {
  return {
    values: s.values.slice(),
    pools: s.pools.slice(),
    poolFilled: s.poolFilled.slice(),
    fencesRight: s.fencesRight.slice(),
    park: s.park,
  }
}
function cloneSheet(s: Sheet): Sheet {
  return { streets: s.streets.map(cloneStreet), estate: s.estate, bis: s.bis, refusals: s.refusals }
}
function clonePlans(ps: CityPlan[]): CityPlan[] {
  return ps.map(p => ({ ...p, done: [p.done[0], p.done[1]] as [boolean, boolean] }))
}

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

// ============================================================
// City plans
// ============================================================

// Count of filled pools across the whole sheet.
function poolCount(sheet: Sheet): number {
  let n = 0
  for (const st of sheet.streets) for (let i = 0; i < st.poolFilled.length; i++) if (st.poolFilled[i]) n++
  return n
}
// Count of completed estates of a given size across the sheet.
function estatesOfSize(sheet: Sheet, size: number): number {
  let n = 0
  for (const st of sheet.streets) for (const e of completedEstates(st)) if (e === size) n++
  return n
}

export function defaultPlans(): CityPlan[] {
  return [
    {
      id: 'three_pools',
      label: 'Fill 3 pools',
      bonus: 10,
      done: [false, false],
      check: (sheet) => poolCount(sheet) >= 3,
    },
    {
      id: 'two_size3',
      label: 'Two estates of size 3',
      bonus: 8,
      done: [false, false],
      check: (sheet) => estatesOfSize(sheet, 3) >= 2,
    },
  ]
}

// ============================================================
// Game construction
// ============================================================

export interface DeckSpec {
  numbers?: number[]
  effects?: EffectKind[]
  plans?: CityPlan[]
}

export function makeGame(decks?: DeckSpec): State {
  const numberDeck = (decks?.numbers ?? makeNumberDeck()).slice()
  const effectDeck = (decks?.effects ?? makeEffectDeck()).slice()
  const plans = decks?.plans ?? defaultPlans()
  const s: State = {
    sheets: [emptySheet(), emptySheet()],
    numberDeck,
    effectDeck,
    flips: [],
    picked: [false, false],
    plans,
    scores: [0, 0],
    turn: 0,
    step: 0,
    winner: null,
    log: [{ t: 'sys', x: 'Welcome to the neighborhood. Pick a number+effect pair and build.' }],
  }
  return flip(s)
}

// Draw the next 3 number+effect pairs into s.flips. Mutates a fresh copy.
function flip(s: State): State {
  const numberDeck = s.numberDeck.slice()
  const effectDeck = s.effectDeck.slice()
  const flips: Pair[] = []
  for (let i = 0; i < 3; i++) {
    let number = numberDeck.shift()
    let effect = effectDeck.shift()
    if (number == null) { numberDeck.push(...makeNumberDeck()); number = numberDeck.shift() }
    if (effect == null) { effectDeck.push(...makeEffectDeck()); effect = effectDeck.shift() }
    flips.push({ number: number as number, effect: effect as EffectKind })
  }
  return Object.assign({}, s, { numberDeck, effectDeck, flips, picked: [false, false] as [boolean, boolean] })
}

// ============================================================
// Placement legality
// ============================================================

// The set of candidate numbers a temp effect could turn `n` into (±1, ±2), incl. n itself.
export function tempCandidates(n: number): number[] {
  const out = new Set<number>()
  for (const d of [-2, -1, 0, 1, 2]) {
    const v = n + d
    if (v >= 1) out.add(v)
  }
  return Array.from(out).sort((a, b) => a - b)
}

export interface Placement {
  streetIndex: number
  lotIndex: number
  number: number     // the number actually written (after temp adjust)
  bis: boolean       // this placement is a bis duplicate (equal-to-neighbor)
}

// For a single street, what numbers are written to the LEFT and RIGHT of lot i (nearest)?
function leftBound(street: Street, i: number): number {
  for (let k = i - 1; k >= 0; k--) { const v = street.values[k]; if (v != null) return v }
  return -Infinity
}
function rightBound(street: Street, i: number): number {
  for (let k = i + 1; k < street.values.length; k++) { const v = street.values[k]; if (v != null) return v }
  return Infinity
}
// Neighbors' values (immediate left/right written) — for bis duplication.
function neighborValues(street: Street, i: number): number[] {
  const out: number[] = []
  if (i > 0 && street.values[i - 1] != null) out.push(street.values[i - 1] as number)
  if (i < street.values.length - 1 && street.values[i + 1] != null) out.push(street.values[i + 1] as number)
  return out
}

// All legal placements of `number` on this sheet for a given effect. If effect is 'temp',
// the number may be adjusted ±1/2. If effect is 'bis', equal-to-neighbor placements are allowed.
export function legalPlacements(sheet: Sheet, number: number, effect: EffectKind): Placement[] {
  const out: Placement[] = []
  const candidates = effect === 'temp' ? tempCandidates(number) : [number]
  for (let si = 0; si < sheet.streets.length; si++) {
    const st = sheet.streets[si]
    for (let li = 0; li < st.values.length; li++) {
      if (st.values[li] != null) continue
      const lo = leftBound(st, li)
      const hi = rightBound(st, li)
      if (effect === 'bis') {
        // bis: must equal an adjacent written neighbor (the duplicate), and still sit
        // within [lo, hi] inclusive so it doesn't break ordering elsewhere.
        for (const nv of neighborValues(st, li)) {
          if (nv >= lo && nv <= hi) {
            if (!out.some(p => p.streetIndex === si && p.lotIndex === li && p.number === nv))
              out.push({ streetIndex: si, lotIndex: li, number: nv, bis: true })
          }
        }
      } else {
        for (const cand of candidates) {
          // strictly ascending: must be > left neighbor and < right neighbor
          if (cand > lo && cand < hi) {
            out.push({ streetIndex: si, lotIndex: li, number: cand, bis: false })
          }
        }
      }
    }
  }
  return out
}

// ============================================================
// Placing + effects
// ============================================================

export interface PlaceOptions {
  number?: number    // the chosen written number (for temp/bis disambiguation)
  fenceSide?: 'left' | 'right' // for the fence effect
}

// Resolve the non-number effects after a number is written at (si, li).
function applyEffect(sheet: Sheet, effect: EffectKind, si: number, li: number, opts: PlaceOptions): void {
  const st = sheet.streets[si]
  switch (effect) {
    case 'pool':
      if (st.pools[li] && !st.poolFilled[li]) st.poolFilled[li] = true
      break
    case 'park':
      if (st.park < PARK_MAX[si]) st.park += 1
      break
    case 'estate':
      if (sheet.estate < ESTATE_TRACK.length - 1) sheet.estate += 1
      break
    case 'fence': {
      const side = opts.fenceSide ?? 'right'
      if (side === 'right') { if (li < st.fencesRight.length - 1) st.fencesRight[li] = true }
      else { if (li > 0) st.fencesRight[li - 1] = true }
      break
    }
    case 'bis':
      sheet.bis += 1
      break
    case 'temp':
      // temp's effect (the ±adjust) is already baked into the chosen number
      break
  }
}

// Place the chosen pair for `player`. Writes the number, resolves the effect. Returns new state.
// Validates against legalPlacements; an illegal request is a no-op (returns the same state).
export function place(
  s: State,
  player: 0 | 1,
  pairIndex: number,
  streetIndex: number,
  lotIndex: number,
  opts: PlaceOptions = {},
): State {
  if (s.winner != null) return s
  if (s.picked[player]) return s
  const pair = s.flips[pairIndex]
  if (pair == null) return s

  const sheet = s.sheets[player]
  const legal = legalPlacements(sheet, pair.number, pair.effect)
  const wanted = opts.number
  const match = legal.find(p =>
    p.streetIndex === streetIndex && p.lotIndex === lotIndex &&
    (wanted == null || p.number === wanted))
  if (match == null) return s

  const sheets = s.sheets.map(cloneSheet) as [Sheet, Sheet]
  const ns = sheets[player]
  const st = ns.streets[streetIndex]
  st.values[lotIndex] = match.number
  applyEffect(ns, pair.effect, streetIndex, lotIndex, opts)

  const picked = s.picked.slice() as [boolean, boolean]
  picked[player] = true
  const tag = player === 0 ? 'you' : 'ai'
  const who = player === 0 ? 'You' : 'Rival'
  let log = push(s.log, tag,
    `${who} wrote ${match.number} on street ${streetIndex + 1}${match.bis ? ' (bis)' : ''} — ${pair.effect}.`)

  let next = Object.assign({}, s, { sheets, picked, log })
  next = recomputeScores(next)
  next = claimPlans(next, player)
  return advance(next)
}

// A player cannot place ANY of the three flipped numbers -> permit refusal.
export function refuse(s: State, player: 0 | 1): State {
  if (s.winner != null || s.picked[player]) return s
  const sheets = s.sheets.map(cloneSheet) as [Sheet, Sheet]
  sheets[player].refusals += 1
  const picked = s.picked.slice() as [boolean, boolean]
  picked[player] = true
  const tag = player === 0 ? 'you' : 'ai'
  const who = player === 0 ? 'You' : 'Rival'
  const log = push(s.log, tag, `${who} could not build — permit refusal (${sheets[player].refusals}/3).`)
  let next = Object.assign({}, s, { sheets, picked, log })
  next = recomputeScores(next)
  return advance(next)
}

// Does this player have any legal placement among the three flipped pairs?
export function canPlaceAny(sheet: Sheet, flips: Pair[]): boolean {
  return flips.some(p => legalPlacements(sheet, p.number, p.effect).length > 0)
}

// All houses on a sheet are filled?
export function sheetFull(sheet: Sheet): boolean {
  return sheet.streets.every(st => st.values.every(v => v != null))
}

// Advance turn / round. After both players have acted, flip new pairs (or end the game).
function advance(s: State): State {
  // If it was player 0's action and player 1 hasn't acted, hand off to AI.
  if (s.picked[0] && !s.picked[1]) return Object.assign({}, s, { turn: 1 as 0 | 1, step: s.step + 1 })
  if (s.picked[1] && !s.picked[0]) return Object.assign({}, s, { turn: 0 as 0 | 1, step: s.step + 1 })
  // both acted -> check end, else flip a fresh round
  const ended = checkEnd(s)
  if (ended.winner != null) return ended
  let next = flip(ended)
  next = Object.assign({}, next, { turn: 0 as 0 | 1, step: ended.step + 1 })
  return next
}

// ============================================================
// Estate detection + scoring
// ============================================================

// Sizes of all COMPLETED estates on a street. An estate is a maximal run of consecutive
// filled lots bounded by a fence (or the street edge) on each side — and it's "completed"
// only when every lot in the run is filled AND both ends are closed (fence or edge).
export function completedEstates(st: Street): number[] {
  const n = st.values.length
  const out: number[] = []
  let i = 0
  while (i < n) {
    if (st.values[i] == null) { i++; continue }
    // start of a run of filled lots; a run ends at a fence-right or last filled-before-empty
    let j = i
    let closed = true
    while (j < n) {
      if (st.values[j] == null) { closed = false; break } // run hit an empty lot -> not closed
      if (st.fencesRight[j]) { break } // fence closes the run after j
      if (j === n - 1) break // street edge closes it
      // if the next lot is empty we'll detect it on next iter
      if (st.values[j + 1] == null) { closed = false; break }
      j++
    }
    const size = j - i + 1
    // closed on the left iff i===0 or there's a fence to the right of i-1, or lot i-1 empty-edge.
    const leftClosed = i === 0 || st.fencesRight[i - 1] || st.values[i - 1] == null
    if (closed && leftClosed) out.push(size)
    i = j + 1
  }
  return out
}

// Full sheet score.
export function scoreSheet(sheet: Sheet): number {
  let total = 0
  const estBonus = ESTATE_TRACK[sheet.estate]
  for (const st of sheet.streets) {
    // estates
    for (const size of completedEstates(st)) {
      const base = size >= 1 && size < ESTATE_VALUE.length ? ESTATE_VALUE[size] : 0
      total += base + (base > 0 ? estBonus : 0)
    }
    // park
    total += PARK_VALUE[Math.min(st.park, PARK_VALUE.length - 1)]
    // pools
    for (let i = 0; i < st.poolFilled.length; i++) if (st.poolFilled[i]) total += POOL_POINTS
  }
  total -= sheet.bis * BIS_PENALTY
  total -= sheet.refusals * REFUSAL_PENALTY
  return total
}

function recomputeScores(s: State): State {
  const scores: [number, number] = [scoreSheet(s.sheets[0]), scoreSheet(s.sheets[1])]
  // add claimed plan bonuses
  for (const p of s.plans) {
    if (p.done[0]) scores[0] += p.bonus
    if (p.done[1]) scores[1] += p.bonus
  }
  return Object.assign({}, s, { scores })
}

// Award any newly-completed city plans to `player` (first to complete claims).
function claimPlans(s: State, player: 0 | 1): State {
  const plans = clonePlans(s.plans)
  let changed = false
  for (const p of plans) {
    if (!p.done[0] && !p.done[1] && p.check(s.sheets[player])) {
      p.done[player] = true
      changed = true
    }
  }
  if (!changed) return s
  let next = Object.assign({}, s, { plans })
  next = recomputeScores(next)
  return next
}

// ============================================================
// End conditions
// ============================================================

export function checkEnd(s: State): State {
  if (s.winner != null) return s
  const refusedOut = s.sheets.some(sh => sh.refusals >= 3)
  const filled = s.sheets.some(sheetFull)
  const allPlans = s.plans.length > 0 && s.plans.every(p => p.done[0] || p.done[1])
  if (refusedOut || filled || allPlans) {
    const recomputed = recomputeScores(s)
    const [a, b] = recomputed.scores
    const winner: 0 | 1 | 'draw' = a === b ? 'draw' : a > b ? 0 : 1
    const reason = refusedOut ? '3 permit refusals' : filled ? 'a full neighborhood' : 'all city plans claimed'
    const tag = winner === 'draw' ? 'sys' : winner === 0 ? 'you' : 'ai'
    const msg = winner === 'draw'
      ? `Tied ${a}–${b} (${reason}).`
      : `${winner === 0 ? 'You win' : 'Rival wins'} ${Math.max(a, b)}–${Math.min(a, b)} (${reason}).`
    return Object.assign({}, recomputed, { winner, log: push(recomputed.log, tag, msg) })
  }
  return s
}

// ============================================================
// AI — greedy. Evaluates each (pair, placement) and picks the highest-scoring one,
// favoring choices that keep streets fillable and progress plans/estates/tracks.
// ============================================================

// Heuristic value of placing for the AI: resulting score delta + structural bonuses.
function evalPlacement(sheet: Sheet, pair: Pair, p: Placement): number {
  const before = scoreSheet(sheet)
  const trial = cloneSheet(sheet)
  const st = trial.streets[p.streetIndex]
  st.values[p.lotIndex] = p.number
  applyEffect(trial, pair.effect, p.streetIndex, p.lotIndex, { fenceSide: 'right' })
  let v = scoreSheet(trial) - before
  // structural: penalize big gaps left/right that strand lots (harder to fill ascending)
  const lo = leftBound(st, p.lotIndex)
  const hi = rightBound(st, p.lotIndex)
  const room = (hi === Infinity ? 16 : hi) - (lo === -Infinity ? 0 : lo)
  v += Math.min(room, 6) * 0.05
  // prefer pool/park/estate-advancing effects slightly for long-term value
  if (pair.effect === 'estate' || pair.effect === 'park' || pair.effect === 'pool') v += 0.4
  if (pair.effect === 'bis') v -= 0.6 // bis costs a penalty; only if it scores well
  return v
}

export interface AIChoice {
  pairIndex: number
  placement: Placement
}

// Best move for the AI on the current flips (or null if no legal placement -> refuse).
export function aiChoose(s: State, player: 0 | 1 = 1): AIChoice | null {
  const sheet = s.sheets[player]
  let best: AIChoice | null = null
  let bestV = -Infinity
  for (let pi = 0; pi < s.flips.length; pi++) {
    const pair = s.flips[pi]
    for (const pl of legalPlacements(sheet, pair.number, pair.effect)) {
      const v = evalPlacement(sheet, pair, pl)
      if (v > bestV) { bestV = v; best = { pairIndex: pi, placement: pl } }
    }
  }
  return best
}

// Advance the AI by ONE action (place or refuse). Used by the UI driver and tests.
export function aiTurn(s: State, player: 0 | 1 = 1): State {
  if (s.winner != null || s.picked[player]) return s
  const choice = aiChoose(s, player)
  if (choice == null) return refuse(s, player)
  const { pairIndex, placement } = choice
  return place(s, player, pairIndex, placement.streetIndex, placement.lotIndex, {
    number: placement.number,
    fenceSide: 'right',
  })
}

// Convenience for tests: advance the human (player 0) greedily too.
export function autoStep(s: State, player: 0 | 1): State {
  if (s.winner != null || s.picked[player]) return s
  const choice = aiChoose(s, player)
  if (choice == null) return refuse(s, player)
  const { pairIndex, placement } = choice
  return place(s, player, pairIndex, placement.streetIndex, placement.lotIndex, {
    number: placement.number,
    fenceSide: 'right',
  })
}

export function winner(s: State): 0 | 1 | 'draw' | null { return s.winner }
