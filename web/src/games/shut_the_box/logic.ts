/* SHUT THE BOX — logic (built for this codebase, not ported).
   Nine tiles numbered 1..9 start UP. A turn: roll two dice (one die allowed once 7,8,9 are all
   shut), then flip down any subset of up-tiles summing EXACTLY to the dice total. Keep rolling
   until either all tiles are shut (score 0, an instant round win) or no subset can match the
   roll (turn ends; SCORE = sum of the tiles still up — lower is better). You and the AI each
   play one round from a fresh box; the lower score wins (0 is unbeatable, equal scores draw). */

export type Player = 'you' | 'ai'
export interface LogEntry { t: string; x: string }

export interface ShutBoxState {
  tiles: boolean[]          // length 9, index 0 => tile "1"; true = UP (open)
  turn: Player              // whose round is being played
  dice: [number, number]    // last roll; [0,0] = not yet rolled this turn
  oneDie: boolean           // the most recent roll used a single die
  rolled: boolean           // a roll is on the table awaiting a shut
  stuck: boolean            // the current player can't match the roll — turn is over
  scores: { you: number | null; ai: number | null }
  winner: Player | 'draw' | null
  log: LogEntry[]
}

export const TILES = 9
const ALL = Array.from({ length: TILES }, (_, i) => i + 1)

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-24) }

/** Numbers (1..9) currently up. */
export function upNumbers(tiles: boolean[]): number[] {
  return ALL.filter(n => tiles[n - 1])
}

/** Sum of the up tiles — the live score for the player at the table. */
export function upSum(tiles: boolean[]): number {
  return upNumbers(tiles).reduce((a, b) => a + b, 0)
}

/** Are tiles 7,8,9 all already shut? (the classic single-die condition). */
export function canRollOne(tiles: boolean[]): boolean {
  return !tiles[6] && !tiles[7] && !tiles[8]
}

/** Does any subset of `up` sum exactly to `target`? */
export function hasSubset(up: number[], target: number): boolean {
  if (target < 0) return false
  if (target === 0) return true
  // classic subset-sum DP over distinct small numbers
  const reach = new Set<number>([0])
  for (const n of up) {
    for (const s of Array.from(reach)) {
      const v = s + n
      if (v === target) return true
      if (v < target) reach.add(v)
    }
  }
  return reach.has(target)
}

/** Is `subset` a valid shut for `target` given the up tiles? (all up, distinct, sums exactly). */
export function isValidSubset(up: number[], subset: number[], target: number): boolean {
  if (!subset.length) return false
  const seen = new Set<number>()
  let sum = 0
  for (const n of subset) {
    if (seen.has(n)) return false        // no repeats
    if (!up.includes(n)) return false     // must be currently up
    seen.add(n); sum += n
  }
  return sum === target
}

export function makeGame(): ShutBoxState {
  return {
    tiles: new Array(TILES).fill(true),
    turn: 'you',
    dice: [0, 0],
    oneDie: false,
    rolled: false,
    stuck: false,
    scores: { you: null, ai: null },
    winner: null,
    log: [{ t: 'sys', x: 'Roll the dice, then flip tiles summing to the total. Lowest leftover wins.' }],
  }
}

const d6 = (rng: () => number) => 1 + ((rng() * 6) | 0)

/** Roll for the player at the table. `useOne` rolls a single die (only when allowed). */
export function roll(s: ShutBoxState, useOne = false, rng: () => number = Math.random): ShutBoxState {
  if (s.winner || s.rolled || s.stuck) return s
  const one = useOne && canRollOne(s.tiles)
  const a = d6(rng)
  const b = one ? 0 : d6(rng)
  const total = a + b
  const up = upNumbers(s.tiles)
  const who = s.turn === 'you' ? 'You' : 'Rival'
  const rollTxt = one ? `${a}` : `${a}+${b} = ${total}`
  if (!hasSubset(up, total)) {
    // dead roll — turn ends immediately
    const score = upSum(s.tiles)
    let log = push(s.log, s.turn, `${who} rolled ${rollTxt} — no tiles can make ${total}.`)
    log = push(log, 'sys', `${who} stuck with ${score} left.`)
    return finishTurn(Object.assign({}, s, { dice: [a, b] as [number, number], oneDie: one, rolled: false, stuck: true, log }), score)
  }
  return Object.assign({}, s, {
    dice: [a, b] as [number, number], oneDie: one, rolled: true, stuck: false,
    log: push(s.log, s.turn, `${who} rolled ${rollTxt}.`),
  })
}

/** Shut a chosen subset (must be valid for the current roll). Returns to the awaiting-roll state. */
export function shut(s: ShutBoxState, subset: number[]): ShutBoxState {
  if (s.winner || !s.rolled) return s
  const total = s.dice[0] + s.dice[1]
  const up = upNumbers(s.tiles)
  if (!isValidSubset(up, subset, total)) return s
  const tiles = s.tiles.slice()
  for (const n of subset) tiles[n - 1] = false
  const who = s.turn === 'you' ? 'You' : 'Rival'
  let log = push(s.log, s.turn, `${who} shut ${[...subset].sort((a, b) => a - b).join('+')}.`)
  if (upNumbers(tiles).length === 0) {
    // shut the box — a perfect 0, instant round win
    log = push(log, s.turn, `${who} SHUT THE BOX! Score 0.`)
    return finishTurn(Object.assign({}, s, { tiles, rolled: false, log }), 0)
  }
  return Object.assign({}, s, { tiles, rolled: false, log })
}

/** End the current player's round with `score`, then either hand off or decide the game. */
function finishTurn(s: ShutBoxState, score: number): ShutBoxState {
  const scores = Object.assign({}, s.scores, { [s.turn]: score })
  if (s.turn === 'you') {
    // hand the fresh box to the AI
    return Object.assign({}, s, {
      scores, turn: 'ai' as Player, tiles: new Array(TILES).fill(true),
      dice: [0, 0] as [number, number], oneDie: false, rolled: false, stuck: false,
      log: push(s.log, 'sys', `Your round done — ${score} left. Rival rolls next.`),
    })
  }
  // both have played — decide
  const ys = scores.you ?? 0, as = score
  let winner: Player | 'draw'
  if (ys < as) winner = 'you'
  else if (as < ys) winner = 'ai'
  else winner = 'draw'
  const msg = winner === 'draw'
    ? `Both stuck on ${ys} — a draw.`
    : `${winner === 'you' ? 'You win' : 'Rival wins'} — ${Math.min(ys, as)} beats ${Math.max(ys, as)}.`
  return Object.assign({}, s, { scores, winner, turn: 'ai' as Player, log: push(s.log, winner === 'you' ? 'you' : 'ai', msg) })
}

// ===== AI: greedy "shut the largest tiles" heuristic =====

/** Among all subsets that sum to `target`, pick the one whose largest tile is biggest
    (shutting big tiles first leaves a lower leftover sum). Returns null if none. */
export function bestSubset(up: number[], target: number): number[] | null {
  let best: number[] | null = null
  const sorted = up.slice().sort((a, b) => b - a)   // try big tiles first
  const dfs = (i: number, acc: number[], sum: number): boolean => {
    if (sum === target) { best = acc.slice(); return true }
    if (sum > target || i >= sorted.length) return false
    // include sorted[i]
    if (dfs(i + 1, acc.concat(sorted[i]), sum + sorted[i])) return true
    return dfs(i + 1, acc, sum)
  }
  dfs(0, [], 0)
  return best
}

/** Drive one AI sub-step: roll if no roll is on the table, else shut the greedy subset. */
export function aiStep(s: ShutBoxState, rng: () => number = Math.random): ShutBoxState {
  if (s.winner || s.turn !== 'ai' || s.stuck) return s
  if (!s.rolled) {
    // prefer a single die when it's allowed and the remaining sum is small
    const useOne = canRollOne(s.tiles) && upSum(s.tiles) <= 6
    return roll(s, useOne, rng)
  }
  const total = s.dice[0] + s.dice[1]
  const pick = bestSubset(upNumbers(s.tiles), total)
  if (!pick) return s
  return shut(s, pick)
}
