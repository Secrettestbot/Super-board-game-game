/* CAN'T STOP — logic (built for this codebase, not ported).
   A push-your-luck race up eleven numbered columns (2..12). You are the human and the
   AI is the rival. Each turn you roll 4 dice, split them into two pairs, and advance
   runners up the columns those pair-sums name. You may hold runners in at most THREE
   columns per turn. If no pairing lets you make a legal advance, you BUST and lose this
   turn's runner progress. Stop to commit runners to permanent markers. Top a column to
   claim it; claim THREE columns to win. */

export type Player = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

/** Column numbers 2..12. */
export const COLS: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** Track height per column = how many dice combinations roll that sum (classic pyramid). */
export function colHeight(n: number): number {
  return 13 - 2 * Math.abs(7 - n) // 7→13, 6/8→11, 5/9→9, 4/10→7, 3/11→5, 2/12→3
}

export const HEIGHTS: Record<number, number> = (() => {
  const h: Record<number, number> = {}
  for (const c of COLS) h[c] = colHeight(c)
  return h
})()

export interface CantStopState {
  /** Permanent markers: how far each player has banked in each column (0..height). */
  perm: { you: Record<number, number>; ai: Record<number, number> }
  /** Claimed columns by player. */
  claimed: Record<number, Player>
  /** Temporary runner positions this turn (the active player's), keyed by column. */
  runners: Record<number, number>
  turn: Player
  /** Current 4 dice (empty until rolled), and the three pairings derived from them. */
  dice: number[]
  pairings: Pairing[]
  /** 'preroll' = about to roll; 'choose' = a roll landed, pick a pairing or stop. */
  phase: 'preroll' | 'choose'
  winner: Player | null
  /** Increments every roll/decision so the AI driver re-arms. */
  step: number
  log: LogEntry[]
}

/** One way to split 4 dice into two pairs; each pair yields a column sum. */
export interface Pairing {
  sums: [number, number]
  /** Whether this pairing can legally advance under the current runner set. */
  usable: boolean
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }
const blankCols = (): Record<number, number> => { const o: Record<number, number> = {}; for (const c of COLS) o[c] = 0; return o }

export function makeGame(): CantStopState {
  return {
    perm: { you: blankCols(), ai: blankCols() },
    claimed: {},
    runners: {},
    turn: 'you',
    dice: [],
    pairings: [],
    phase: 'preroll',
    winner: null,
    step: 0,
    log: [{ t: 'sys', x: 'Roll four dice, pair them to climb up to three columns. Stop to bank, bust and lose it all. Claim three columns to win.' }],
  }
}

export function claimedCount(s: CantStopState, p: Player): number {
  return Object.values(s.claimed).filter(o => o === p).length
}
export function claimedCols(s: CantStopState, p: Player): number[] {
  return COLS.filter(c => s.claimed[c] === p)
}

/** The position a player currently effectively has in a column (runner overrides perm for the active player). */
export function effective(s: CantStopState, p: Player, c: number): number {
  if (p === s.turn && s.runners[c] != null) return s.runners[c]
  return s.perm[p][c]
}

function roll4(): number[] {
  return [0, 0, 0, 0].map(() => 1 + ((Math.random() * 6) | 0))
}

/** The three ways to pair 4 dice (indices 01|23, 02|13, 03|12) → two column sums each. */
export function pairSums(dice: number[]): [number, number][] {
  const [a, b, c, d] = dice
  return [
    [a + b, c + d],
    [a + c, b + d],
    [a + d, b + c],
  ]
}

/** How many distinct columns the active player currently holds runners in. */
function runnerCols(runners: Record<number, number>): number[] {
  return Object.keys(runners).map(Number)
}

/**
 * Can the active player advance column `c` by one right now?
 * No if the column is already claimed, or already at its top (perm/runner), or
 * starting it would exceed the 3-runner limit.
 */
function canAdvanceCol(s: CantStopState, c: number, runners: Record<number, number>): boolean {
  if (s.claimed[c]) return false
  const has = runners[c] != null
  if (!has && runnerCols(runners).length >= 3) return false
  const cur = has ? runners[c] : s.perm[s.turn][c]
  return cur < HEIGHTS[c]
}

/** Is at least one of the two columns in this pairing advanceable? Considers using both
 *  sums (if both are new columns and only one runner slot is free, the pairing is still
 *  usable for the one it can place). */
function pairingUsable(s: CantStopState, sums: [number, number], runners: Record<number, number>): boolean {
  // Try the columns independently; a pairing is usable if applying it advances ≥1 column.
  const sim = { ...runners }
  let advanced = false
  for (const c of sums) {
    if (canAdvanceCol(s, c, sim)) {
      sim[c] = (sim[c] != null ? sim[c] : s.perm[s.turn][c]) + 1
      advanced = true
    }
  }
  return advanced
}

function buildPairings(s: CantStopState, dice: number[], runners: Record<number, number>): Pairing[] {
  return pairSums(dice).map(sums => ({ sums, usable: pairingUsable(s, sums, runners) }))
}

/** Roll the dice for the active player; sets up the choosable pairings or busts. */
export function roll(s: CantStopState): CantStopState {
  if (s.winner || s.phase !== 'preroll') return s
  const dice = roll4()
  const pairings = buildPairings(s, dice, s.runners)
  const step = s.step + 1
  const who = s.turn === 'you' ? 'You' : 'Rival'
  let log = push(s.log, s.turn, `${who} rolled ${dice.join(' ')}.`)
  if (!pairings.some(p => p.usable)) {
    // Bust: no legal pairing.
    log = push(log, 'sys', `${who} busted — no legal pairing. Runners lost.`)
    return endTurn({ ...s, dice, pairings, step, log }, false)
  }
  return { ...s, dice, pairings, phase: 'choose', step, log }
}

/** Apply a chosen pairing (advance one or both of its sum-columns). */
export function choose(s: CantStopState, which: number): CantStopState {
  if (s.winner || s.phase !== 'choose') return s
  const p = s.pairings[which]
  if (!p || !p.usable) return s
  const runners = { ...s.runners }
  const advanced: number[] = []
  for (const c of p.sums) {
    if (canAdvanceCol(s, c, runners)) {
      runners[c] = (runners[c] != null ? runners[c] : s.perm[s.turn][c]) + 1
      advanced.push(c)
    }
  }
  const who = s.turn === 'you' ? 'You' : 'Rival'
  const log = push(s.log, s.turn, `${who} advanced ${advanced.join(' and ')}.`)
  return { ...s, runners, pairings: [], dice: s.dice, phase: 'preroll', step: s.step + 1, log }
}

/** Stop: commit runner positions to permanent markers, claim any topped columns, end turn. */
export function stop(s: CantStopState): CantStopState {
  if (s.winner || s.phase !== 'preroll' || Object.keys(s.runners).length === 0) return s
  return endTurn(s, true)
}

/** Shared turn closer. commit=true banks runners; false discards them (bust). */
function endTurn(s: CantStopState, commit: boolean): CantStopState {
  const turn = s.turn
  let perm = s.perm
  let claimed = s.claimed
  let log = s.log
  if (commit) {
    const mine = { ...s.perm[turn] }
    const nextClaimed = { ...s.claimed }
    const claimedNow: number[] = []
    for (const cStr of Object.keys(s.runners)) {
      const c = Number(cStr)
      mine[c] = s.runners[c]
      if (mine[c] >= HEIGHTS[c] && !nextClaimed[c]) { nextClaimed[c] = turn; claimedNow.push(c) }
    }
    perm = { ...s.perm, [turn]: mine }
    claimed = nextClaimed
    const who = turn === 'you' ? 'You' : 'Rival'
    log = push(log, turn, `${who} banked progress${claimedNow.length ? ` and claimed ${claimedNow.join(', ')}` : ''}.`)
  }
  // Win check.
  const winner = countClaimed(claimed, turn) >= 3 ? turn : null
  if (winner) {
    const who = winner === 'you' ? 'You' : 'Rival'
    log = push(log, winner, `${who} claimed a third column — ${who === 'You' ? 'you win' : 'rival wins'}!`)
    return { ...s, perm, claimed, runners: {}, dice: [], pairings: [], phase: 'preroll', winner, step: s.step + 1, log }
  }
  const next: Player = turn === 'you' ? 'ai' : 'you'
  return { ...s, perm, claimed, runners: {}, dice: [], pairings: [], phase: 'preroll', turn: next, step: s.step + 1, log }
}

function countClaimed(claimed: Record<number, Player>, p: Player): number {
  return Object.values(claimed).filter(o => o === p).length
}

// ===================== AI: push-your-luck heuristic =====================

/** Probability that a fresh 4-dice roll busts given the active runner set — exact over 1296. */
export function bustProb(s: CantStopState): number {
  const runners = s.runners
  let bust = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) for (let d = 1; d <= 6; d++) {
    const dice = [a, b, c, d]
    const pairs = pairSums(dice)
    if (!pairs.some(sm => pairingUsable(s, sm as [number, number], runners))) bust++
  }
  return bust / 1296
}

/** Total runner steps taken this turn (how much would be lost on a bust). */
function runnerProgress(s: CantStopState): number {
  let total = 0
  for (const cStr of Object.keys(s.runners)) {
    const c = Number(cStr)
    total += s.runners[c] - s.perm.ai[c]
  }
  return total
}

/** Centrality weight — middle columns (6,7,8) are safest/longest, so worth more. */
function colWeight(c: number): number {
  return HEIGHTS[c] // taller central columns naturally score higher
}

/** Pick the best usable pairing for the AI: prefer advancing toward claims and central columns. */
function aiPickPairing(s: CantStopState): number {
  let best = -1, bestScore = -Infinity
  s.pairings.forEach((p, i) => {
    if (!p.usable) return
    // Simulate the advance to score it.
    const runners = { ...s.runners }
    let score = 0
    for (const c of p.sums) {
      if (canAdvanceCol(s, c, runners)) {
        const cur = runners[c] != null ? runners[c] : s.perm.ai[c]
        runners[c] = cur + 1
        score += colWeight(c)
        if (runners[c] >= HEIGHTS[c]) score += 40 // finishing a column is huge
      }
    }
    // Prefer keeping runner count low (more flexibility) — penalise opening a 3rd column lightly.
    score -= runnerCols(runners).length
    if (score > bestScore) { bestScore = score; best = i }
  })
  return best
}

/** One AI step: rolls when preroll, then either commits (stop) or keeps a chosen pairing. */
export function aiStep(s: CantStopState): CantStopState {
  if (s.winner || s.turn !== 'ai') return s
  if (s.phase === 'preroll') {
    // Decide stop vs roll-again before rolling (only if we have something to bank).
    const haveRunners = Object.keys(s.runners).length > 0
    if (haveRunners) {
      const risk = bustProb(s)
      const banked = runnerProgress(s)
      // Stop when risk is meaningful and we've made progress, or when risk is high.
      // Estimate expected loss vs expected gain: if risk*banked is large, lock it in.
      const aiClaims = countClaimed(s.claimed, 'ai')
      const greedy = aiClaims >= 2 ? 0.55 : 0.42 // when one claim from winning, push a bit harder
      if (risk >= greedy || (banked >= 4 && risk >= 0.25)) {
        return stop(s)
      }
    }
    return roll(s)
  }
  // phase === 'choose'
  const which = aiPickPairing(s)
  if (which < 0) return endTurn(s, false) // shouldn't happen (roll guarantees a usable pairing)
  return choose(s, which)
}
