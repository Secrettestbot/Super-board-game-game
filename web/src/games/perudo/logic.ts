/* PERUDO / DUDO — pure logic (built for this codebase, not ported).
   4 players (you = 0, AI = 1,2,3). Everyone starts with 5 dice in a cup and rolls secretly each
   round. Players take turns BIDDING "at least N dice show face F" across ALL players' dice. ACES (1s)
   are WILD — they count toward any face, EXCEPT during a "palifico" round (a player at 1 die), when
   aces are NOT wild. Each bid must RAISE the standing one: a higher quantity (any face), or the same
   quantity with a higher face. Switching TO an aces bid: its quantity is ceil(currentQty / 2). Coming
   OFF aces (back to a normal face): quantity must be at least 2*acesQty + 1. Instead of bidding a
   player may call DUDO: reveal all dice, tally face F (+ wild aces unless palifico). If the true count
   is LESS than the bid → the BIDDER loses a die; if it's >= the bid → the CALLER loses a die. A player
   at 0 dice is eliminated; the last player with dice wins. AI is probabilistic (binomial expectation). */

export type Face = 1 | 2 | 3 | 4 | 5 | 6
export interface Bid { quantity: number; face: Face; byPlayer: number }
export interface LogEntry { t: string; x: string }
export type Phase = 'bidding' | 'reveal' | 'over'

export interface RevealInfo {
  bid: Bid
  count: number
  caller: number
  loser: number
  held: boolean        // true = bid held (count >= quantity) → caller loses
}

export interface PerudoState {
  dice: Face[][]            // dice[p] = player p's current roll (hidden from UI for foes)
  counts: number[]         // counts[p] = dice player p owns
  alive: boolean[]         // alive[p] = player p still has dice
  turn: number             // whose action it is (bid or call)
  bid: Bid | null          // standing bid (null = round just opened)
  opener: number           // who opens bidding this round
  palifico: boolean        // this round started with a player at exactly 1 die → aces NOT wild
  phase: Phase
  winner: number | null    // player index, or null
  reveal: RevealInfo | null
  history: Bid[]           // bids this round, in order
  actionSeq: number        // monotonic counter — bumps on EVERY action (AI tick)
  log: LogEntry[]
}

export const NUM_PLAYERS = 4
export const START_DICE = 5
const FACE_ORDER: Face[] = [2, 3, 4, 5, 6]   // wild ace (1) is never a biddable face in a normal round

// ---- injectable randomness (deterministic tests can override) ----
let rng: () => number = Math.random
export function setRng(fn: () => number) { rng = fn }
export function resetRng() { rng = Math.random }

const die = (): Face => (((rng() * 6) | 0) + 1) as Face
const rollN = (n: number): Face[] => Array.from({ length: n }, die)
const push = (log: LogEntry[], t: string, x: string) => log.concat([{ t, x }]).slice(-30)

export function totalDice(s: PerudoState): number {
  let n = 0
  for (let p = 0; p < s.counts.length; p++) n += s.counts[p]
  return n
}

/** Tally how many of `dice` show `face`. Aces (1) are wild unless `palifico`. */
export function tally(dice: Face[], face: Face, palifico: boolean): number {
  let n = 0
  for (const d of dice) {
    if (d === face) n++
    else if (!palifico && d === 1 && face !== 1) n++
  }
  return n
}

/** True wild-inclusive count of `face` across ALL players' dice. */
export function actualCount(s: PerudoState, face: Face): number {
  let n = 0
  for (let p = 0; p < s.dice.length; p++) n += tally(s.dice[p], face, s.palifico)
  return n
}

/** The smallest legal raise over `prev` for a NORMAL (non-aces) bid. */
function minNormalRaise(prev: Bid | null): { quantity: number; face: Face } {
  if (!prev) return { quantity: 1, face: 2 }
  if (prev.face === 1) {
    // coming off aces: quantity must be >= 2*acesQty + 1, lowest face 2
    return { quantity: prev.quantity * 2 + 1, face: 2 }
  }
  if (prev.face < 6) return { quantity: prev.quantity, face: (prev.face + 1) as Face }
  return { quantity: prev.quantity + 1, face: 2 }
}

/** Is `next` a legal raise of `prev`? Encodes the aces-switch quantity rules. */
export function isRaise(prev: Bid | null, next: { quantity: number; face: Face }, palifico: boolean): boolean {
  if (next.quantity < 1 || next.face < 1 || next.face > 6) return false
  // Aces may only be bid normally when wild (i.e. not palifico) OR palifico allows aces too;
  // we permit aces bids in both, but the switch math only applies in non-palifico.
  if (!prev) {
    // opening: any face/qty >= 1 is fine. Opening on aces is allowed (rare) but discourage qty 0.
    return true
  }
  if (palifico) {
    // no wild: simple strict ordering, aces rank as a face between 6 and... treat 1 as highest? Keep
    // classic: in palifico aces are an ordinary face; use plain qty/face ordering with 1 lowest.
    if (next.quantity > prev.quantity) return true
    if (next.quantity === prev.quantity && next.face > prev.face) return true
    return false
  }
  const prevAces = prev.face === 1
  const nextAces = next.face === 1
  if (!prevAces && nextAces) {
    // switching TO aces: quantity must be >= ceil(prev.quantity / 2)
    return next.quantity >= Math.ceil(prev.quantity / 2)
  }
  if (prevAces && !nextAces) {
    // coming OFF aces: quantity must be >= 2*prev.quantity + 1
    return next.quantity >= prev.quantity * 2 + 1
  }
  // same regime (both aces or both normal): plain strict ordering
  if (next.quantity > prev.quantity) return true
  if (next.quantity === prev.quantity && next.face > prev.face) return true
  return false
}

/** Smallest legal raise (used by UI default + AI). Returns a bare bid (no byPlayer). */
export function minRaise(prev: Bid | null, palifico: boolean): { quantity: number; face: Face } {
  if (palifico) {
    if (!prev) return { quantity: 1, face: 2 }
    if (prev.face < 6) return { quantity: prev.quantity, face: (prev.face + 1) as Face }
    return { quantity: prev.quantity + 1, face: 2 }
  }
  return minNormalRaise(prev)
}

/** All legal raises a player may make right now (bounded list for UI/AI). */
export function legalBids(s: PerudoState): { quantity: number; face: Face }[] {
  const out: { quantity: number; face: Face }[] = []
  const max = totalDice(s)
  const faces: Face[] = s.palifico ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6]
  for (let q = 1; q <= max; q++) {
    for (const f of faces) {
      const cand = { quantity: q, face: f as Face }
      if (isRaise(s.bid, cand, s.palifico)) out.push(cand)
    }
  }
  return out
}

function nextAlive(s: PerudoState, from: number): number {
  for (let i = 1; i <= NUM_PLAYERS; i++) {
    const p = (from + i) % NUM_PLAYERS
    if (s.alive[p]) return p
  }
  return from
}

function freshRound(s: PerudoState, opener: number, log: LogEntry[]): PerudoState {
  const dice = s.dice.map((_, p) => (s.alive[p] ? rollN(s.counts[p]) : []))
  const palifico = s.alive.some((a, p) => a && s.counts[p] === 1)
  const live = totalDice(s)
  return Object.assign({}, s, {
    dice,
    turn: opener,
    bid: null,
    opener,
    palifico,
    phase: 'bidding' as Phase,
    reveal: null,
    history: [],
    actionSeq: s.actionSeq + 1,
    log: push(log, 'sys', `New round — ${live} dice on the table${palifico ? ' · PALIFICO (aces not wild)' : ''}. ${opener === 0 ? 'You open.' : `Player ${opener} opens.`}`),
  })
}

export function makeGame(): PerudoState {
  const counts = Array.from({ length: NUM_PLAYERS }, () => START_DICE)
  const base: PerudoState = {
    dice: Array.from({ length: NUM_PLAYERS }, () => [] as Face[]),
    counts,
    alive: Array.from({ length: NUM_PLAYERS }, () => true),
    turn: 0,
    bid: null,
    opener: 0,
    palifico: false,
    phase: 'bidding',
    winner: null,
    reveal: null,
    history: [],
    actionSeq: 0,
    log: [{ t: 'sys', x: 'Bid the count of a face across all dice — aces are wild. Raise or call Dudo.' }],
  }
  return freshRound(base, 0, base.log)
}

/** Roll fresh dice for all alive players (e.g. start of a round). Randomness is guarded via setRng. */
export function rollAll(s: PerudoState): PerudoState {
  const dice = s.dice.map((_, p) => (s.alive[p] ? rollN(s.counts[p]) : []))
  return Object.assign({}, s, { dice })
}

/** Place a bid for `player` (must be to move + a legal raise). */
export function bid(s: PerudoState, player: number, quantity: number, face: Face): PerudoState {
  if (s.phase !== 'bidding' || s.turn !== player) return s
  if (!isRaise(s.bid, { quantity, face }, s.palifico)) return s
  const b: Bid = { quantity, face, byPlayer: player }
  const next = nextAlive(s, player)
  const name = player === 0 ? 'You bid' : `Player ${player} bids`
  const log = push(s.log, player === 0 ? 'you' : 'ai', `${name} ${quantity} × ${faceLabel(face)}.`)
  return Object.assign({}, s, {
    bid: b,
    turn: next,
    history: s.history.concat([b]),
    actionSeq: s.actionSeq + 1,
    log,
  })
}

function faceLabel(f: Face): string { return f === 1 ? "aces" : `${f}'s` }

/** `player` calls DUDO on the standing bid → reveal, assign the lost die, set up next round. */
export function callDudo(s: PerudoState, player: number): PerudoState {
  if (s.phase !== 'bidding' || s.turn !== player || !s.bid) return s
  const b = s.bid
  const count = actualCount(s, b.face)
  const held = count >= b.quantity                 // bid holds → caller loses; else bidder loses
  const loser = held ? player : b.byPlayer
  const counts = s.counts.slice()
  counts[loser] = Math.max(0, counts[loser] - 1)
  const alive = s.alive.slice()
  let log = push(s.log, player === 0 ? 'you' : 'ai', `${player === 0 ? 'You call' : `Player ${player} calls`} DUDO on ${b.quantity} × ${faceLabel(b.face)}.`)
  log = push(log, 'sys', `Reveal: ${count} ${faceLabel(b.face)}${s.palifico ? '' : ' (aces wild)'}. Bid ${held ? 'HELD' : 'FAILED'} — ${loser === 0 ? 'you lose' : `Player ${loser} loses`} a die.`)
  if (counts[loser] === 0 && alive[loser]) {
    alive[loser] = false
    log = push(log, 'sys', `${loser === 0 ? 'You are' : `Player ${loser} is`} OUT — last die lost.`)
  }
  return Object.assign({}, s, {
    counts,
    alive,
    phase: 'reveal' as Phase,
    reveal: { bid: b, count, caller: player, loser, held },
    actionSeq: s.actionSeq + 1,
    log,
  })
}

/** After a reveal, deal the next round (or end the game). The die-loser opens (or next alive if out). */
export function nextRound(s: PerudoState): PerudoState {
  if (s.phase !== 'reveal' || !s.reveal) return s
  const aliveCount = s.alive.filter(Boolean).length
  if (aliveCount <= 1) {
    const w = s.alive.findIndex(Boolean)
    return Object.assign({}, s, {
      phase: 'over' as Phase,
      winner: w,
      actionSeq: s.actionSeq + 1,
      log: push(s.log, w === 0 ? 'you' : 'ai', w === 0 ? 'You are the last cup standing — you win!' : `Player ${w} is the last cup standing.`),
    })
  }
  const loser = s.reveal.loser
  const opener = s.alive[loser] ? loser : nextAlive(s, loser)
  return freshRound(s, opener, s.log)
}

// ===================== AI: probabilistic opponent =====================
// Each die you cannot see matches a given (non-ace) face with prob ~1/3 (1/6 the face + 1/6 a wild
// ace) when aces are wild; in palifico that drops to 1/6. Aces themselves: 1/6 (or 1/3 if... no — an
// ace is always exactly 1/6). P(at least k of n unknown dice match) via the binomial tail.

function matchProb(face: Face, palifico: boolean): number {
  if (face === 1) return 1 / 6
  return palifico ? 1 / 6 : 1 / 3
}

function binomTail(n: number, k: number, p: number): number {
  if (k <= 0) return 1
  if (k > n) return 0
  let tail = 0
  for (let j = k; j <= n; j++) {
    let c = 1
    for (let t = 0; t < j; t++) c = (c * (n - t)) / (t + 1)
    tail += c * Math.pow(p, j) * Math.pow(1 - p, n - j)
  }
  return tail
}

/** Probability the standing bid holds, from `player`'s seat (knows only its own dice). */
export function bidProbability(s: PerudoState, player: number, b: Bid): number {
  const own = tally(s.dice[player], b.face, s.palifico)
  const unknown = totalDice(s) - s.counts[player]
  const need = b.quantity - own
  return binomTail(unknown, need, matchProb(b.face, s.palifico))
}

/** The face the player holds most of (counting wild aces), ties to lower face. */
function bestOwnFace(dice: Face[], palifico: boolean): { face: Face; count: number } {
  let bestFace: Face = 2, bestCount = -1
  for (const f of FACE_ORDER) {
    const c = tally(dice, f, palifico)
    if (c > bestCount) { bestCount = c; bestFace = f }
  }
  return { face: bestFace, count: Math.max(0, bestCount) }
}

/** Decide the AI's action without mutating: returns either a bid or a Dudo call. */
export function aiDecide(s: PerudoState, player: number):
  | { type: 'bid'; quantity: number; face: Face }
  | { type: 'dudo' } {
  // Opening: bid something the player's own dice make comfortable.
  if (!s.bid) {
    const best = bestOwnFace(s.dice[player], s.palifico)
    const quantity = Math.max(1, best.count)
    return { type: 'bid', quantity, face: best.face }
  }
  const total = totalDice(s)
  const p = bidProbability(s, player, s.bid)
  // Call Dudo when the standing bid is unlikely.
  if (p < 0.24) return { type: 'dudo' }

  const min = minRaise(s.bid, s.palifico)
  // Occasionally lean into a strong face (a believable bluff).
  const strong = bestOwnFace(s.dice[player], s.palifico)
  if (rng() < 0.16 && strong.face >= 2) {
    const cand = { quantity: Math.min(total, Math.max(min.quantity, strong.count + 1)), face: strong.face }
    if (isRaise(s.bid, cand, s.palifico) && bidProbability(s, player, { ...cand, byPlayer: player }) >= 0.30) {
      return { type: 'bid', quantity: cand.quantity, face: cand.face }
    }
  }
  // If the minimal raise overflows the table or looks too risky, call instead.
  if (min.quantity > total) return { type: 'dudo' }
  const rp = bidProbability(s, player, { ...min, byPlayer: player })
  if (rp < 0.16) return { type: 'dudo' }
  return { type: 'bid', quantity: min.quantity, face: min.face }
}

/** Apply one AI action for the player to move. No-op if it isn't an AI's turn. */
export function aiTurn(s: PerudoState): PerudoState {
  if (s.phase !== 'bidding' || s.turn === 0 || !s.alive[s.turn]) return s
  const player = s.turn
  const d = aiDecide(s, player)
  if (d.type === 'dudo') return callDudo(s, player)
  return bid(s, player, d.quantity, d.face)
}

export { faceLabel }
