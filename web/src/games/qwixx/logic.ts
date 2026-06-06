/* QWIXX — logic (built for this codebase, not ported).
   2-player roll-and-write. Each player has four coloured rows: red & yellow run 2..12
   left→right, green & blue run 12..2 left→right (descending). Six dice: 2 white + one each
   colour. On a turn the ACTIVE player rolls all six; then BOTH players may cross the white
   sum in any one row, and the active player may ALSO cross a white+colour sum in one row.
   Within a row you cross strictly to the right of your rightmost mark; the final cell locks
   the row but only once 5+ marks already sit in it. Game ends at 2 locked rows or a 4th
   penalty. Triangular scoring per row, minus 5 per penalty; highest total wins. */

export type Color = 'red' | 'yellow' | 'green' | 'blue'
export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue']
export const ASC: Color[] = ['red', 'yellow']           // values 2..12
export const DESC: Color[] = ['green', 'blue']           // values 12..2
export const NCOLS = 11                                  // cells per row (2..12)

export interface LogEntry { t: string; x: string }

export interface Row {
  marks: boolean[]   // length NCOLS, true = crossed
  locked: boolean    // this row has been locked (end cell crossed) by this player
}

export interface Player {
  name: string
  rows: Record<Color, Row>
  penalties: number
}

export type Phase = 'roll' | 'act'

export interface QwixxState {
  players: [Player, Player]      // 0 = You, 1 = Rival
  active: 0 | 1                  // whose turn it is to roll / take the bonus combo
  you: 0 | 1
  phase: Phase                  // 'roll' = dice not yet rolled; 'act' = choose crosses
  dice: number[] | null         // [w1, w2, red, yellow, green, blue] or null before a roll
  acted: { white: boolean; color: boolean } // what the active player has done this turn
  whiteTakenBy: boolean[]       // [p0 took white-sum?, p1 took white-sum?] this turn
  locks: number                 // count of rows locked across both players
  winner: 0 | 1 | 'draw' | null
  turnNo: number
  log: LogEntry[]
}

// ---- table of values down each row, left to right ----
export const ROW_VALUES: Record<Color, number[]> = {
  red:    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  yellow: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  green:  [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  blue:   [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
}

// triangular: crosses -> points (index = number of crosses)
const TRI = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66, 78]
export function triPoints(crosses: number): number { return TRI[Math.min(crosses, 12)] }

function emptyRow(): Row { return { marks: new Array(NCOLS).fill(false), locked: false } }
function emptyPlayer(name: string): Player {
  return { name, rows: { red: emptyRow(), yellow: emptyRow(), green: emptyRow(), blue: emptyRow() }, penalties: 0 }
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

const d6 = () => 1 + ((Math.random() * 6) | 0)

export function makeGame(): QwixxState {
  return {
    players: [emptyPlayer('You'), emptyPlayer('Rival')],
    active: 0,
    you: 0,
    phase: 'roll',
    dice: null,
    acted: { white: false, color: false },
    whiteTakenBy: [false, false],
    locks: 0,
    winner: null,
    turnNo: 1,
    log: [{ t: 'sys', x: 'You roll first. Both may take the white-dice sum; the roller also gets a white+colour.' }],
  }
}

export function rollDice(s: QwixxState): QwixxState {
  if (s.winner != null || s.phase !== 'roll') return s
  const dice = [d6(), d6(), d6(), d6(), d6(), d6()]
  const log = push(s.log, s.active === s.you ? 'you' : 'ai',
    `${s.players[s.active].name} rolled — white ${dice[0]}+${dice[1]}=${dice[0] + dice[1]}.`)
  return Object.assign({}, s, {
    dice, phase: 'act' as Phase,
    acted: { white: false, color: false },
    whiteTakenBy: [false, false] as boolean[],
    log,
  })
}

export const whiteSum = (dice: number[]) => dice[0] + dice[1]
// the two white+colour sums available for a colour (white1+colour, white2+colour)
function colorSums(dice: number[], c: Color): number[] {
  const ci = 2 + COLORS.indexOf(c)
  return [dice[0] + dice[ci], dice[1] + dice[ci]]
}

const rightmostIndex = (row: Row): number => {
  for (let i = NCOLS - 1; i >= 0; i--) if (row.marks[i]) return i
  return -1
}
const crossCount = (row: Row): number => row.marks.reduce((a, b) => a + (b ? 1 : 0), 0)

// Is value `v` crossable in this colour row right now (ignores whose turn / dice)?
// Returns the cell index, or -1 if illegal.
export function cellFor(row: Row, color: Color, v: number): number {
  if (row.locked) return -1
  const vals = ROW_VALUES[color]
  const i = vals.indexOf(v)
  if (i < 0 || row.marks[i]) return -1
  if (i <= rightmostIndex(row)) return -1            // must be to the right of rightmost mark
  if (i === NCOLS - 1 && crossCount(row) < 5) return -1 // end cell needs 5+ prior crosses
  return i
}

// All legal crosses for player p given the current dice & phase.
// kind 'white' = white-sum (both players); 'color' = white+colour (active only).
export interface Option { color: Color; index: number; value: number; kind: 'white' | 'color' }
export function options(s: QwixxState, p: 0 | 1): Option[] {
  if (!s.dice || s.phase !== 'act' || s.winner != null) return []
  const out: Option[] = []
  const pl = s.players[p]
  const ws = whiteSum(s.dice)
  // white-sum (available to both unless they already took it this turn)
  if (!s.whiteTakenBy[p]) {
    for (const c of COLORS) {
      const i = cellFor(pl.rows[c], c, ws)
      if (i >= 0) out.push({ color: c, index: i, value: ws, kind: 'white' })
    }
  }
  // white+colour (active player only, once per turn)
  if (p === s.active && !s.acted.color) {
    for (const c of COLORS) {
      for (const v of colorSums(s.dice, c)) {
        const i = cellFor(pl.rows[c], c, v)
        if (i >= 0 && !out.some(o => o.color === c && o.index === i && o.kind === 'color'))
          out.push({ color: c, index: i, value: v, kind: 'color' })
      }
    }
  }
  return out
}

function lockRowIfEnd(row: Row, index: number, s: QwixxState): QwixxState {
  if (index === NCOLS - 1) { row.locked = true; return Object.assign({}, s, { locks: s.locks + 1 }) }
  return s
}

// Cross a cell for player p. kind must match what they're allowed to do.
export function cross(s: QwixxState, p: 0 | 1, color: Color, index: number, kind: 'white' | 'color'): QwixxState {
  if (s.winner != null || s.phase !== 'act' || !s.dice) return s
  const legal = options(s, p).some(o => o.color === color && o.index === index && o.kind === kind)
  if (!legal) return s
  const players = s.players.map(cloneP) as [Player, Player]
  const row = players[p].rows[color]
  row.marks[index] = true
  let ns = Object.assign({}, s, { players })
  ns = lockRowIfEnd(row, index, ns)
  const val = ROW_VALUES[color][index]
  const tag = p === s.you ? 'you' : 'ai'
  ns.log = push(ns.log, tag, `${players[p].name} crossed ${color} ${val}${index === NCOLS - 1 ? ' — LOCKED' : ''}.`)
  if (kind === 'white') {
    const wt = ns.whiteTakenBy.slice(); wt[p] = true; ns.whiteTakenBy = wt
    if (p === s.active) ns.acted = Object.assign({}, ns.acted, { white: true })
  } else {
    ns.acted = Object.assign({}, ns.acted, { color: true })
  }
  return checkEnd(ns)
}

function cloneRow(r: Row): Row { return { marks: r.marks.slice(), locked: r.locked } }
function cloneP(p: Player): Player {
  return { name: p.name, penalties: p.penalties, rows: { red: cloneRow(p.rows.red), yellow: cloneRow(p.rows.yellow), green: cloneRow(p.rows.green), blue: cloneRow(p.rows.blue) } }
}

// End the active player's turn: if they crossed nothing, take a penalty. Pass to next player.
export function endTurn(s: QwixxState): QwixxState {
  if (s.winner != null || s.phase !== 'act') return s
  const players = s.players.map(cloneP) as [Player, Player]
  let ns = Object.assign({}, s, { players })
  const a = s.active
  const tookSomething = s.acted.white || s.acted.color
  if (!tookSomething) {
    players[a].penalties += 1
    ns.log = push(ns.log, a === s.you ? 'you' : 'ai', `${players[a].name} crossed nothing — penalty (−5). ${players[a].penalties}/4.`)
  }
  ns = checkEnd(ns)
  if (ns.winner != null) return ns
  ns.active = (a === 0 ? 1 : 0) as 0 | 1
  ns.phase = 'roll'
  ns.dice = null
  ns.acted = { white: false, color: false }
  ns.whiteTakenBy = [false, false]
  ns.turnNo = s.turnNo + 1
  return ns
}

// "Pass / take penalty" — the active player declines all crosses and ends their turn.
export function passPenalty(s: QwixxState): QwixxState {
  if (s.winner != null || s.phase !== 'act') return s
  // force the no-cross path: clear acted then end
  const ns = Object.assign({}, s, { acted: { white: false, color: false } })
  return endTurn(ns)
}

export function lockedCount(s: QwixxState): number { return s.locks }

export function checkEnd(s: QwixxState): QwixxState {
  if (s.winner != null) return s
  const fourPen = s.players.some(p => p.penalties >= 4)
  if (s.locks >= 2 || fourPen) {
    const t0 = scoreTotal(s.players[0]), t1 = scoreTotal(s.players[1])
    const winner: 0 | 1 | 'draw' = t0 === t1 ? 'draw' : t0 > t1 ? 0 : 1
    const reason = fourPen ? 'a 4th penalty' : 'two locked rows'
    const tag = winner === 'draw' ? 'sys' : winner === s.you ? 'you' : 'ai'
    const msg = winner === 'draw' ? `Tied ${t0}–${t1} (${reason}).` :
      `${s.players[winner].name} wins ${Math.max(t0, t1)}–${Math.min(t0, t1)} (${reason}).`
    return Object.assign({}, s, { winner, log: push(s.log, tag, msg) })
  }
  return s
}

// ---- scoring ----
export function rowScore(row: Row): number {
  // a locked row counts its lock mark as one of its crosses (already in marks[])
  return triPoints(crossCount(row))
}
export function scoreTotal(p: Player): number {
  let s = 0
  for (const c of COLORS) s += rowScore(p.rows[c])
  return s - 5 * p.penalties
}

// ============================================================
// AI — sensible greedy. Decides the active player's crosses & end-of-turn, and the
// passive player's white-sum reaction. Driven via aiStep (one decision per call).
// ============================================================

// Value of taking option o for player p: points gained minus a penalty for cells skipped
// (each skipped cell in the row is wasted future scoring; weight rises near the end).
function optionValue(s: QwixxState, p: 0 | 1, o: Option): number {
  const row = s.players[p].rows[o.color]
  const before = crossCount(row)
  const gain = triPoints(before + 1) - triPoints(before)
  // cells skipped between current rightmost and the chosen index
  const rm = rightmostIndex(row)
  const skipped = o.index - rm - 1
  let v = gain - skipped * 1.4
  if (o.index === NCOLS - 1) v += 4               // locking is worth grabbing
  if (o.kind === 'white') v += 0.5                // white-sum is "free", slight preference
  return v
}

// One AI decision step. Covers: rolling (active), passive white-sum reaction, active
// white-sum + colour crosses, and ending the turn (with penalty if nothing taken).
export function aiStep(s: QwixxState): QwixxState {
  if (s.winner != null) return s
  // aiStep drives the ACTIVE player's whole turn one decision at a time (roll → white →
  // colour → end). The passive player's white reaction is handled by passiveWhite.
  if (s.phase === 'roll') return rollDice(s)
  if (s.phase === 'act') {
    const a = s.active
    // active AI: first take a white-sum if worthwhile and not yet taken
    if (!s.whiteTakenBy[a]) {
      const w = bestWhite(s, a, 1.0)
      if (w) return cross(s, a, w.color, w.index, 'white')
    }
    // then take a colour combo if worthwhile and not yet taken
    if (!s.acted.color) {
      const c = bestColor(s, a, 1.0)
      if (c) return cross(s, a, c.color, c.index, 'color')
    }
    // nothing left worth doing -> end the turn
    return endTurn(s)
  }
  return s
}

function bestWhite(s: QwixxState, p: 0 | 1, threshold: number): Option | null {
  const opts = options(s, p).filter(o => o.kind === 'white')
  return pickBest(s, p, opts, threshold)
}
function bestColor(s: QwixxState, p: 0 | 1, threshold: number): Option | null {
  const opts = options(s, p).filter(o => o.kind === 'color')
  return pickBest(s, p, opts, threshold)
}
function pickBest(s: QwixxState, p: 0 | 1, opts: Option[], threshold: number): Option | null {
  let best: Option | null = null, bestV = -Infinity
  for (const o of opts) { const v = optionValue(s, p, o); if (v > bestV) { bestV = v; best = o } }
  return best && bestV >= threshold ? best : null
}

// Passive reaction for a non-active player (used by the UI to auto-play the passive AI,
// and exposed for tests). Returns a new state after the passive player optionally takes
// the white-sum. Only crosses if clearly worthwhile.
export function passiveWhite(s: QwixxState, p: 0 | 1): QwixxState {
  if (s.winner != null || s.phase !== 'act' || p === s.active || s.whiteTakenBy[p]) return s
  const w = bestWhite(s, p, 1.0)
  if (w) return cross(s, p, w.color, w.index, 'white')
  return s
}

// Greedy auto-strategy for BOTH roles, for tests. Advances the game by one full turn:
// active rolls, both players take sensible white-sums, active takes a colour, turn ends.
export function autoTurn(s: QwixxState): QwixxState {
  let ns = s
  if (ns.winner != null) return ns
  if (ns.phase === 'roll') ns = rollDice(ns)
  if (ns.winner != null) return ns
  const a = ns.active, passive = (a === 0 ? 1 : 0) as 0 | 1
  // active white-sum
  if (!ns.whiteTakenBy[a]) { const w = bestWhite(ns, a, 1.0); if (w) ns = cross(ns, a, w.color, w.index, 'white') }
  if (ns.winner != null) return ns
  // passive white-sum
  if (!ns.whiteTakenBy[passive]) { const w = bestWhite(ns, passive, 1.0); if (w) ns = cross(ns, passive, w.color, w.index, 'white') }
  if (ns.winner != null) return ns
  // active colour combo
  if (!ns.acted.color) { const c = bestColor(ns, a, 1.0); if (c) ns = cross(ns, a, c.color, c.index, 'color') }
  if (ns.winner != null) return ns
  return endTurn(ns)
}
