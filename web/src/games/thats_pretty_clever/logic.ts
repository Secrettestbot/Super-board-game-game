/* THAT'S PRETTY CLEVER! (Ganz schön clever) — logic (built for this codebase, not ported).
   2-player dice roll-and-write. Six coloured dice: white, yellow, blue, green, orange, purple.
   On your active turn you get 3 PICKS. Each pick: roll all not-yet-used dice, choose ONE die,
   place it into its matching colour track (WHITE is wild — usable as any colour), then set aside
   ALL still-rollable dice with a value STRICTLY LOWER than the chosen die onto the silver platter
   (they're done for this turn), re-roll the rest, pick again. After 3 picks each OPPONENT takes
   ONE die from the platter for a single placement on their own sheet. ~6 rounds (each player
   active once per round). Highest total wins.

   Tracks (simplified but faithful bonus graph):
     YELLOW  — 4x4 grid, cross the cell matching the die value (1..4 per quadrant col by row).
               Completing a column scores points; a full diagonal grants foxes.
     BLUE    — 3x3-ish grid crossed by index; we cross cells left→right; row completion scores.
     GREEN   — left→right row; each placement must be >= a rising threshold; further = more points.
     ORANGE  — row; write the die value; some cells are x2 / x3 multipliers; score = sum.
     PURPLE  — row; each new value must be GREATER than previous (a 6 may follow anything,
               and resets the requirement); score = sum.
   Foxes multiply the LOWEST-scoring track at the end. */

export type Color = 'white' | 'yellow' | 'blue' | 'green' | 'orange' | 'purple'
export const DICE_COLORS: Color[] = ['white', 'yellow', 'blue', 'green', 'orange', 'purple']
export const TRACK_COLORS: Exclude<Color, 'white'>[] = ['yellow', 'blue', 'green', 'orange', 'purple']

export interface LogEntry { t: string; x: string }

// ---- per-track state ----
export interface YellowTrack { cells: boolean[] }                 // 16 cells (4x4), row-major
export interface BlueTrack { cells: boolean[] }                   // 9 cells (3x3), row-major
export interface GreenTrack { count: number }                    // how many cells filled (left→right)
export interface OrangeTrack { values: (number | null)[] }       // 9 cells
export interface PurpleTrack { values: number[] }                // appended values
export interface Sheet {
  yellow: YellowTrack
  blue: BlueTrack
  green: GreenTrack
  orange: OrangeTrack
  purple: PurpleTrack
  foxes: number
}

export type Phase = 'roll' | 'pick' | 'platter' | 'done'

export interface Die { color: Color; value: number }

export interface State {
  sheets: [Sheet, Sheet]          // 0 = You, 1 = Rival
  you: 0 | 1
  active: 0 | 1                   // whose 3-pick active turn it is
  phase: Phase
  roll: Die[]                    // dice currently on the table (rollable), value>=1
  platter: Die[]                 // dice set aside this turn (available to opponents after)
  picksLeft: number              // active-turn picks remaining (3..0)
  // platter-pick bookkeeping: which opponents still owe a platter placement this round-turn
  platterPending: (0 | 1)[]      // players who still must take one platter die
  round: number                  // 1-based
  rounds: number                 // total rounds to play
  winner: 0 | 1 | 'draw' | null
  log: LogEntry[]
}

// ---- track geometry / scoring tables ----
export const YELLOW_COLS = 4
export const YELLOW_ROWS = 4
// the value required to cross each yellow cell (row-major). Within a row, values 1..4 across.
export const YELLOW_VALUES: number[] = [
  1, 2, 3, 4,
  2, 3, 4, 1,
  3, 4, 1, 2,
  4, 1, 2, 3,
]
// completing a column scores; the main diagonal grants foxes.
export const YELLOW_COL_SCORE = [10, 14, 16, 20]   // per completed column
export const BLUE_SIZE = 9
export const BLUE_VALUES: number[] = [             // blue crossed by white+blue sum; 3x3 grid
  2, 3, 4,
  5, 6, 7,
  8, 9, 10,
]
export const BLUE_ROW_SCORE = [6, 10, 14]          // per completed blue row
export const GREEN_LEN = 11
// green: score for having reached `count` cells (cumulative). index = count.
export const GREEN_SCORE = [0, 1, 2, 4, 7, 11, 16, 22, 29, 37, 46, 56]
// rising threshold: the value placed at cell i must be >= GREEN_THRESH[i].
export const GREEN_THRESH = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
export const ORANGE_LEN = 9
// orange multipliers per cell (most ×1, a few ×2/×3).
export const ORANGE_MULT = [1, 1, 1, 2, 1, 2, 1, 3, 3]
export const PURPLE_LEN = 11

function emptySheet(): Sheet {
  return {
    yellow: { cells: new Array(YELLOW_COLS * YELLOW_ROWS).fill(false) },
    blue: { cells: new Array(BLUE_SIZE).fill(false) },
    green: { count: 0 },
    orange: { values: new Array(ORANGE_LEN).fill(null) },
    purple: { values: [] },
    foxes: 0,
  }
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-26)
}

// ---- injectable randomness (deterministic tests) ----
let _rng: () => number = Math.random
export function setRng(fn: () => number) { _rng = fn }
export function resetRng() { _rng = Math.random }
const d6 = () => 1 + ((_rng() * 6) | 0)

export function makeGame(rounds = 6): State {
  return {
    sheets: [emptySheet(), emptySheet()],
    you: 0,
    active: 0,
    phase: 'roll',
    roll: [],
    platter: [],
    picksLeft: 3,
    platterPending: [],
    round: 1,
    rounds,
    winner: null,
    log: [{ t: 'sys', x: 'Your turn first. Roll, pick a die into its colour track, lower dice go to the platter.' }],
  }
}

function cloneSheet(s: Sheet): Sheet {
  return {
    yellow: { cells: s.yellow.cells.slice() },
    blue: { cells: s.blue.cells.slice() },
    green: { count: s.green.count },
    orange: { values: s.orange.values.slice() },
    purple: { values: s.purple.values.slice() },
    foxes: s.foxes,
  }
}
function cloneSheets(s: State): [Sheet, Sheet] { return [cloneSheet(s.sheets[0]), cloneSheet(s.sheets[1])] }

// ============================================================
// ROLLING
// ============================================================

// Roll fresh dice for the active turn: all not-yet-used colours. `used` = colours already
// placed or sent to the platter this turn (derived from picksLeft progression isn't enough,
// so we track explicitly via roll+platter union of colours seen). We roll exactly the colours
// that are neither on the platter nor already placed this turn.
export function rollDice(s: State): State {
  if (s.winner != null || s.phase !== 'roll') return s
  // colours unavailable: those on the platter (set aside). Placed colours are also gone, but a
  // placed colour leaves the table entirely; we model "remaining colours" as DICE_COLORS minus
  // platter colours minus colours already consumed this turn. We reconstruct consumed from the
  // turn's pick count is brittle, so instead we keep remaining colours implicitly: any colour not
  // on the platter and not the just-placed one. To keep it simple & correct, the set of rollable
  // colours is tracked on the state via `roll` being replaced each pick; here we re-roll only the
  // colours currently considered "live" = DICE_COLORS minus platter colours minus already-placed.
  const dead = new Set<Color>(s.platter.map(d => d.color))
  // already-placed colours are those removed from the live pool in pickDie (we stash them on a
  // hidden field). We reconstruct from `placedThisTurn`.
  for (const c of (s as State & { _placed?: Color[] })._placed ?? []) dead.add(c)
  const live = DICE_COLORS.filter(c => !dead.has(c))
  const roll: Die[] = live.map(c => ({ color: c, value: d6() }))
  return Object.assign({}, s, { roll, phase: 'pick' as Phase })
}

// ============================================================
// ACTIVE-TURN PICK
// ============================================================

// Where would placing this die land / is it legal? Returns a description or null if illegal.
export interface Placement { color: Exclude<Color, 'white'>; ok: boolean; gain: number }

// Apply a die `value` to track `color` on a sheet (mutates the cloned sheet). Returns points
// gained from this single placement's immediate cells/bonuses (foxes handled separately).
function placeOnTrack(sheet: Sheet, color: Exclude<Color, 'white'>, value: number, whiteVal: number | null): { ok: boolean } {
  switch (color) {
    case 'yellow': {
      // cross the leftmost matching-value cell that isn't yet crossed, scanning row-major.
      for (let i = 0; i < sheet.yellow.cells.length; i++) {
        if (!sheet.yellow.cells[i] && YELLOW_VALUES[i] === value) { sheet.yellow.cells[i] = true; return { ok: true } }
      }
      return { ok: false }
    }
    case 'blue': {
      // blue is crossed by the SUM of white + blue (clamped to 2..10). Find a matching cell.
      const sum = (whiteVal != null ? whiteVal : 0) + value
      for (let i = 0; i < sheet.blue.cells.length; i++) {
        if (!sheet.blue.cells[i] && BLUE_VALUES[i] === sum) { sheet.blue.cells[i] = true; return { ok: true } }
      }
      return { ok: false }
    }
    case 'green': {
      if (sheet.green.count >= GREEN_LEN) return { ok: false }
      if (value < GREEN_THRESH[sheet.green.count]) return { ok: false }
      sheet.green.count += 1
      return { ok: true }
    }
    case 'orange': {
      for (let i = 0; i < sheet.orange.values.length; i++) {
        if (sheet.orange.values[i] == null) { sheet.orange.values[i] = value; return { ok: true } }
      }
      return { ok: false }
    }
    case 'purple': {
      if (sheet.purple.values.length >= PURPLE_LEN) return { ok: false }
      const prev = sheet.purple.values.length ? sheet.purple.values[sheet.purple.values.length - 1] : 0
      // the effective minimum-to-beat resets to 0 right after a 6 (a 6 may follow anything and
      // clears the requirement); otherwise the new value must strictly exceed the previous one.
      const last = prev === 6 ? 0 : prev
      if (value !== 6 && value <= last) return { ok: false }
      sheet.purple.values.push(value)
      return { ok: true }
    }
  }
}

// Can a die (color/value) legally be placed on `asColor` for this sheet?
export function canPlace(sheet: Sheet, dieColor: Color, asColor: Exclude<Color, 'white'>, value: number, whiteVal: number | null): boolean {
  if (dieColor !== 'white' && dieColor !== asColor) return false
  const test = cloneSheet(sheet)
  return placeOnTrack(test, asColor, value, whiteVal).ok
}

// What is the current white die value on the table (for blue sums)? null if none rollable.
export function whiteOnTable(s: State): number | null {
  const w = s.roll.find(d => d.color === 'white')
  return w ? w.value : null
}

// Pick a die by index in s.roll, optionally as a colour (required for the white wild). Places it,
// sends all STRICTLY-LOWER rollable dice to the platter, decrements picksLeft, and either sets up
// the next roll or moves to the opponent platter phase.
export function pickDie(s: State, dieIndex: number, asColor?: Exclude<Color, 'white'>): State {
  if (s.winner != null || s.phase !== 'pick') return s
  if (dieIndex < 0 || dieIndex >= s.roll.length) return s
  const die = s.roll[dieIndex]
  const target: Exclude<Color, 'white'> = die.color === 'white'
    ? (asColor ?? 'orange')              // white must be assigned; default to a safe sink (orange)
    : (die.color as Exclude<Color, 'white'>)
  const whiteVal = die.color === 'white' ? null : whiteOnTable(s)
  const sheets = cloneSheets(s)
  const sheet = sheets[s.active]
  const res = placeOnTrack(sheet, target, die.value, whiteVal)
  if (!res.ok) return s   // illegal placement — caller should pick a legal die/colour

  // set aside all OTHER rollable dice with value strictly LOWER than the chosen die
  const remaining: Die[] = []
  const toPlatter: Die[] = []
  for (let i = 0; i < s.roll.length; i++) {
    if (i === dieIndex) continue
    if (s.roll[i].value < die.value) toPlatter.push(s.roll[i])
    else remaining.push(s.roll[i])
  }
  const platter = s.platter.concat(toPlatter)
  // track placed colours so re-rolls don't re-spawn them
  const prevPlaced = (s as State & { _placed?: Color[] })._placed ?? []
  const _placed = prevPlaced.concat([die.color])
  const picksLeft = s.picksLeft - 1
  const tag = s.active === s.you ? 'you' : 'ai'
  let log = push(s.log, tag, `${nameOf(s, s.active)} placed ${die.color}=${die.value} → ${target}.`)

  if (picksLeft > 0 && remaining.length > 0) {
    // continue the active turn: re-roll the remaining live dice
    return Object.assign({}, s, {
      sheets, roll: remaining, platter, picksLeft, _placed,
      phase: 'roll' as Phase, log,
    })
  }
  // active turn over (no picks left, or nothing left to roll): leftover rollable dice ALSO join
  // the platter so opponents can use them.
  const fullPlatter = platter.concat(remaining)
  log = push(log, 'sys', `${nameOf(s, s.active)}'s turn ends — opponents take a platter die.`)
  const opp = (s.active === 0 ? 1 : 0) as 0 | 1
  return Object.assign({}, s, {
    sheets, roll: [], platter: fullPlatter, picksLeft: 0, _placed,
    platterPending: [opp],
    phase: 'platter' as Phase, log,
  })
}

function nameOf(s: State, p: 0 | 1): string { return p === s.you ? 'You' : 'Rival' }

// End the active turn early (no legal placement, or the player chooses to stop): all rollable
// dice join the platter and opponents move on to their platter pick.
export function forfeitPick(s: State): State {
  if (s.winner != null || s.phase !== 'pick') return s
  const fullPlatter = s.platter.concat(s.roll)
  const opp = (s.active === 0 ? 1 : 0) as 0 | 1
  const log = push(s.log, 'sys', `${nameOf(s, s.active)} has no legal die — turn ends, opponents take a platter die.`)
  return Object.assign({}, s, {
    roll: [], platter: fullPlatter, picksLeft: 0,
    platterPending: [opp], phase: 'platter' as Phase, log,
  })
}

// Does the active player have ANY legal placement among the current roll?
export function hasLegalPick(s: State): boolean {
  if (s.phase !== 'pick') return false
  return bestActivePick(s) != null
}

// ============================================================
// OPPONENT PLATTER PICK
// ============================================================

// An opponent (player) takes ONE die from the platter (by index) and places it. White is wild.
export function platterPick(s: State, player: 0 | 1, dieIndex: number, asColor?: Exclude<Color, 'white'>): State {
  if (s.winner != null || s.phase !== 'platter') return s
  if (!s.platterPending.includes(player)) return s
  if (dieIndex < 0 || dieIndex >= s.platter.length) return s
  const die = s.platter[dieIndex]
  const target: Exclude<Color, 'white'> = die.color === 'white'
    ? (asColor ?? 'orange')
    : (die.color as Exclude<Color, 'white'>)
  // blue sums on the platter: use the platter's white die value if present, else 0.
  const w = s.platter.find(d => d.color === 'white')
  const whiteVal = die.color === 'white' ? null : (w ? w.value : null)
  const sheets = cloneSheets(s)
  const res = placeOnTrack(sheets[player], target, die.value, whiteVal)
  // if illegal, the opponent simply forfeits the platter placement (skips) — but we still consume.
  const pending = s.platterPending.filter(p => p !== player)
  const tag = player === s.you ? 'you' : 'ai'
  const log = push(s.log, tag, res.ok
    ? `${nameOf(s, player)} took ${die.color}=${die.value} from the platter → ${target}.`
    : `${nameOf(s, player)} found no platter placement.`)
  let ns = Object.assign({}, s, { sheets, platterPending: pending, log })
  if (pending.length === 0) ns = endActiveTurn(ns)
  return ns
}

// ============================================================
// TURN / ROUND ADVANCE
// ============================================================

function endActiveTurn(s: State): State {
  // award foxes & bonuses are computed lazily at scoring time; just advance the turn pointer.
  const wasActive = s.active
  const nextActive = (wasActive === 0 ? 1 : 0) as 0 | 1
  // a round = both players active once. We started each round with player 0 active.
  let round = s.round
  if (nextActive === 0) round += 1   // wrapped back to player 0 -> new round
  let ns = Object.assign({}, s, {
    active: nextActive,
    round,
    phase: 'roll' as Phase,
    roll: [] as Die[],
    platter: [] as Die[],
    picksLeft: 3,
    platterPending: [] as (0 | 1)[],
  })
  // clear the hidden placed-colours tracker for the new turn
  delete (ns as State & { _placed?: Color[] })._placed
  if (ns.round > ns.rounds) return finish(ns)
  return ns
}

function finish(s: State): State {
  const t0 = totalScore(s.sheets[0]), t1 = totalScore(s.sheets[1])
  const winner: 0 | 1 | 'draw' = t0 === t1 ? 'draw' : t0 > t1 ? 0 : 1
  const tag = winner === 'draw' ? 'sys' : winner === s.you ? 'you' : 'ai'
  const msg = winner === 'draw'
    ? `Tied ${t0}–${t1}.`
    : `${winner === s.you ? 'You win' : 'Rival wins'} ${Math.max(t0, t1)}–${Math.min(t0, t1)}.`
  return Object.assign({}, s, { winner, phase: 'done' as Phase, log: push(s.log, tag, msg) })
}

// ============================================================
// SCORING
// ============================================================

export function yellowScore(t: YellowTrack): number {
  let pts = 0
  for (let c = 0; c < YELLOW_COLS; c++) {
    let full = true
    for (let r = 0; r < YELLOW_ROWS; r++) if (!t.cells[r * YELLOW_COLS + c]) { full = false; break }
    if (full) pts += YELLOW_COL_SCORE[c]
  }
  return pts
}
export function yellowFoxes(t: YellowTrack): number {
  // a complete main diagonal grants 1 fox
  let diag = true
  for (let i = 0; i < YELLOW_ROWS; i++) if (!t.cells[i * YELLOW_COLS + i]) { diag = false; break }
  return diag ? 1 : 0
}
export function blueScore(t: BlueTrack): number {
  let pts = 0
  for (let r = 0; r < 3; r++) {
    let full = true
    for (let c = 0; c < 3; c++) if (!t.cells[r * 3 + c]) { full = false; break }
    if (full) pts += BLUE_ROW_SCORE[r]
  }
  // plus 1 point per crossed cell as a base
  pts += t.cells.reduce((a, b) => a + (b ? 1 : 0), 0)
  return pts
}
export function blueFoxes(t: BlueTrack): number {
  return t.cells.every(Boolean) ? 1 : 0
}
export function greenScore(t: GreenTrack): number { return GREEN_SCORE[Math.min(t.count, GREEN_LEN)] }
export function greenFoxes(t: GreenTrack): number { return t.count >= GREEN_LEN ? 1 : 0 }
export function orangeScore(t: OrangeTrack): number {
  let s = 0
  for (let i = 0; i < t.values.length; i++) { const v = t.values[i]; if (v != null) s += v * ORANGE_MULT[i] }
  return s
}
export function orangeFoxes(t: OrangeTrack): number {
  return t.values.every(v => v != null) ? 1 : 0
}
export function purpleScore(t: PurpleTrack): number { return t.values.reduce((a, b) => a + b, 0) }
export function purpleFoxes(t: PurpleTrack): number { return t.values.length >= PURPLE_LEN ? 1 : 0 }

// per-track base scores (no foxes), in a fixed order.
export function trackScores(sheet: Sheet): Record<Exclude<Color, 'white'>, number> {
  return {
    yellow: yellowScore(sheet.yellow),
    blue: blueScore(sheet.blue),
    green: greenScore(sheet.green),
    orange: orangeScore(sheet.orange),
    purple: purpleScore(sheet.purple),
  }
}
// alias used by tests/UI: score for a single track on a sheet
export function trackScore(sheet: Sheet, color: Exclude<Color, 'white'>): number {
  return trackScores(sheet)[color]
}

export function foxCount(sheet: Sheet): number {
  return sheet.foxes
    + yellowFoxes(sheet.yellow) + blueFoxes(sheet.blue) + greenFoxes(sheet.green)
    + orangeFoxes(sheet.orange) + purpleFoxes(sheet.purple)
}

// total = sum of track scores + foxes × (lowest track score). Foxes multiply the lowest track.
export function totalScore(sheet: Sheet): number {
  const ts = trackScores(sheet)
  const vals = TRACK_COLORS.map(c => ts[c])
  const base = vals.reduce((a, b) => a + b, 0)
  const lowest = Math.min(...vals)
  const foxes = foxCount(sheet)
  return base + foxes * lowest
}

export function winner(s: State): 0 | 1 | 'draw' | null { return s.winner }

// ============================================================
// AI — greedy. Maximises immediate track value + completion progress.
// ============================================================

// Marginal value of placing a die of `value` (as `color`) on a sheet right now.
function placementValue(sheet: Sheet, color: Exclude<Color, 'white'>, value: number, whiteVal: number | null): number {
  const before = totalScore(sheet)
  const test = cloneSheet(sheet)
  const res = placeOnTrack(test, color, value, whiteVal)
  if (!res.ok) return -Infinity
  const after = totalScore(test)
  let v = after - before
  // small progress bonus to encourage filling tracks toward completion bonuses
  v += 0.05 * value
  return v
}

// Choose the best (dieIndex, asColor) among the current roll for the active sheet.
export function bestActivePick(s: State): { dieIndex: number; asColor?: Exclude<Color, 'white'> } | null {
  const sheet = s.sheets[s.active]
  const whiteVal = whiteOnTable(s)
  let best: { dieIndex: number; asColor?: Exclude<Color, 'white'>; v: number } | null = null
  for (let i = 0; i < s.roll.length; i++) {
    const die = s.roll[i]
    const colors: Exclude<Color, 'white'>[] = die.color === 'white' ? TRACK_COLORS : [die.color as Exclude<Color, 'white'>]
    for (const c of colors) {
      // for white-as-blue there is no separate white die on table; for normal colours use whiteVal.
      const wv = die.color === 'white' ? null : whiteVal
      const v = placementValue(sheet, c, die.value, wv)
      if (v === -Infinity) continue
      if (best == null || v > best.v) best = { dieIndex: i, asColor: die.color === 'white' ? c : undefined, v }
    }
  }
  if (best == null) return null   // no legal placement anywhere
  return { dieIndex: best.dieIndex, asColor: best.asColor }
}

// Advance the AI's active turn by ONE sub-step (roll OR a single pick). Idempotent / safe.
export function aiActiveTurn(s: State): State {
  if (s.winner != null) return s
  if (s.phase === 'roll') return rollDice(s)
  if (s.phase === 'pick') {
    const pick = bestActivePick(s)
    if (pick == null) return forfeitPick(s)   // no legal die -> end the active turn
    return pickDie(s, pick.dieIndex, pick.asColor)
  }
  return s
}

// AI takes its platter die (when it is a pending opponent). Single placement.
export function aiPlatterPick(s: State, player: 0 | 1): State {
  if (s.winner != null || s.phase !== 'platter') return s
  if (!s.platterPending.includes(player)) return s
  const sheet = s.sheets[player]
  const w = s.platter.find(d => d.color === 'white')
  let best: { dieIndex: number; asColor?: Exclude<Color, 'white'>; v: number } | null = null
  for (let i = 0; i < s.platter.length; i++) {
    const die = s.platter[i]
    const colors: Exclude<Color, 'white'>[] = die.color === 'white' ? TRACK_COLORS : [die.color as Exclude<Color, 'white'>]
    for (const c of colors) {
      const wv = die.color === 'white' ? null : (w ? w.value : null)
      const v = placementValue(sheet, c, die.value, wv)
      if (v === -Infinity) continue
      if (best == null || v > best.v) best = { dieIndex: i, asColor: die.color === 'white' ? c : undefined, v }
    }
  }
  if (best == null) {
    // no legal placement: forfeit by picking die 0 (platterPick handles illegal as a skip)
    return platterPick(s, player, 0)
  }
  return platterPick(s, player, best.dieIndex, best.asColor)
}

// ============================================================
// SELF-PLAY (tests) — drive one full sub-step from whatever state we're in.
// ============================================================
export function autoStep(s: State): State {
  if (s.winner != null) return s
  if (s.phase === 'roll') return rollDice(s)
  if (s.phase === 'pick') return aiActiveTurn(s)
  if (s.phase === 'platter') {
    const p = s.platterPending[0]
    return aiPlatterPick(s, p)
  }
  return s
}
