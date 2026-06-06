/* LIAR'S DICE / PERUDO — logic (built for this codebase, not ported).
   2-player, "ones wild". You and the AI each start with 5 dice in a cup. Each round both
   sides secretly roll; you see yours, not the rival's. Players alternate BIDS — a quantity +
   face claiming there are AT LEAST that many of that face among ALL dice (1s count as any
   face). A raise must be strictly higher: more quantity, or same quantity with a higher face.
   Instead of bidding a player may CHALLENGE; all dice reveal and the true count (incl. wild 1s)
   is tallied. If it is LESS than the bid the bidder loses a die, else the challenger loses one.
   The die-loser opens the next round. Reach zero dice and you're out — the other player wins.
   The AI is probability-based: it estimates P(bid holds) from its own dice + the hidden dice
   (~1/3 chance each matches a face counting wilds), challenges when that's low, else min-raises. */

export type Face = 1 | 2 | 3 | 4 | 5 | 6
export type Player = 'you' | 'foe'
export interface Bid { qty: number; face: Face }   // face is the claimed face (2..6 by ordering); 1 is wild, never bid as a face
export interface LogEntry { t: string; x: string }
export type Phase = 'bidding' | 'reveal' | 'over'

export interface LiarsState {
  youDice: Face[]          // your current roll (length = youCount)
  foeDice: Face[]          // the rival's current roll (hidden from UI until reveal)
  youCount: number         // dice remaining you own
  foeCount: number         // dice remaining the rival owns
  turn: Player             // whose action it is (bid or challenge)
  bid: Bid | null          // current standing bid (null = round just opened, must bid)
  opener: Player           // who opens bidding this round
  phase: Phase
  winner: Player | null
  // reveal bookkeeping (set during 'reveal')
  reveal: { bid: Bid; count: number; loser: Player; held: boolean } | null
  history: Bid[]           // bids this round, in order
  log: LogEntry[]
}

export const START_DICE = 5
const FACE_ORDER: Face[] = [2, 3, 4, 5, 6]   // wild 1 is never a biddable face

const die = (): Face => ((Math.random() * 6) | 0) + 1 as Face
const rollN = (n: number): Face[] => Array.from({ length: n }, die)
const push = (log: LogEntry[], t: string, x: string) => log.concat([{ t, x }]).slice(-24)

/** Tally how many dice show `face`, counting every 1 as wild (a 1 also counts toward face 1). */
export function tally(dice: Face[], face: Face): number {
  let n = 0
  for (const d of dice) { if (d === face || (face !== 1 && d === 1)) n++ }
  return n
}

/** Total wild-inclusive count of `face` across both players' dice. */
export function trueCount(s: LiarsState, face: Face): number {
  return tally(s.youDice, face) + tally(s.foeDice, face)
}

/** Strict ordering: higher quantity always wins; same quantity needs a higher face. */
export function bidRank(b: Bid): number { return b.qty * 10 + b.face }
export function isRaise(prev: Bid | null, next: Bid): boolean {
  if (next.qty < 1 || next.face < 2 || next.face > 6) return false
  if (!prev) return true
  return bidRank(next) > bidRank(prev)
}

/** The smallest legal raise over `prev` (or the opening bid if none). */
export function minRaise(prev: Bid | null): Bid {
  if (!prev) return { qty: 1, face: 2 }
  if (prev.face < 6) return { qty: prev.qty, face: (prev.face + 1) as Face }
  return { qty: prev.qty + 1, face: 2 }
}

function freshRound(s: LiarsState, opener: Player, log: LogEntry[]): LiarsState {
  return Object.assign({}, s, {
    youDice: rollN(s.youCount),
    foeDice: rollN(s.foeCount),
    turn: opener,
    bid: null,
    opener,
    phase: 'bidding' as Phase,
    reveal: null,
    history: [],
    log: push(log, 'sys', `New round — ${s.youCount + s.foeCount} dice on the table. ${opener === 'you' ? 'You open.' : 'The rival opens.'}`),
  })
}

export function makeGame(): LiarsState {
  const base: LiarsState = {
    youDice: [], foeDice: [], youCount: START_DICE, foeCount: START_DICE,
    turn: 'you', bid: null, opener: 'you', phase: 'bidding', winner: null,
    reveal: null, history: [],
    log: [{ t: 'sys', x: 'Bid the count of a face across all dice — ones are wild. Raise or cry "Liar!".' }],
  }
  return freshRound(base, 'you', base.log)
}

/** Place a bid for `who` (must be the side to move and a legal raise). */
export function makeBid(s: LiarsState, who: Player, bid: Bid): LiarsState {
  if (s.phase !== 'bidding' || s.turn !== who) return s
  if (!isRaise(s.bid, bid)) return s
  const other: Player = who === 'you' ? 'foe' : 'you'
  const log = push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You bid' : 'Rival bids'} ${bid.qty} × ${bid.face}'s.`)
  return Object.assign({}, s, { bid, turn: other, history: s.history.concat([bid]), log })
}

/** `who` challenges the standing bid → reveal + assign the lost die. */
export function challenge(s: LiarsState, who: Player): LiarsState {
  if (s.phase !== 'bidding' || s.turn !== who || !s.bid) return s
  const other: Player = who === 'you' ? 'foe' : 'you'   // the bidder
  const bid = s.bid
  const count = trueCount(s, bid.face)
  const held = count >= bid.qty                          // bid holds → challenger loses
  const loser: Player = held ? who : other
  let log = push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You call' : 'Rival calls'} "Liar!" on ${bid.qty} × ${bid.face}'s.`)
  log = push(log, 'sys', `Reveal: ${count} ${bid.face}'s (with wild 1's). The bid ${held ? 'held' : 'failed'} — ${loser === 'you' ? 'you lose' : 'the rival loses'} a die.`)
  const youCount = loser === 'you' ? s.youCount - 1 : s.youCount
  const foeCount = loser === 'foe' ? s.foeCount - 1 : s.foeCount
  return Object.assign({}, s, {
    phase: 'reveal' as Phase, reveal: { bid, count, loser, held },
    youCount, foeCount, turn: loser, log,
  })
}

/** After a reveal, deal the next round (or end the game). The die-loser opens. */
export function nextRound(s: LiarsState): LiarsState {
  if (s.phase !== 'reveal' || !s.reveal) return s
  if (s.youCount <= 0) return Object.assign({}, s, { phase: 'over' as Phase, winner: 'foe' as Player, turn: 'foe' as Player, log: push(s.log, 'ai', 'You are out of dice — the rival wins.') })
  if (s.foeCount <= 0) return Object.assign({}, s, { phase: 'over' as Phase, winner: 'you' as Player, turn: 'you' as Player, log: push(s.log, 'you', 'The rival is out of dice — you win!') })
  return freshRound(s, s.reveal.loser, s.log)
}

// ===== AI: probability-based opponent =====
// Each hidden (your) die independently matches a given face with prob ~1/3 (1/6 the face
// itself + 1/6 a wild 1). P(at least k of n hidden dice match) via the binomial tail.
const P_MATCH = 1 / 3

function binomTail(n: number, k: number, p: number): number {
  if (k <= 0) return 1
  if (k > n) return 0
  let tail = 0
  // P(X >= k) = sum_{j=k}^{n} C(n,j) p^j (1-p)^(n-j)
  for (let j = k; j <= n; j++) {
    let c = 1
    for (let t = 0; t < j; t++) c = c * (n - t) / (t + 1)
    tail += c * Math.pow(p, j) * Math.pow(1 - p, n - j)
  }
  return tail
}

/** Probability the standing bid holds, from the AI's seat (knows foeDice, not youDice). */
export function bidProbability(s: LiarsState, bid: Bid): number {
  const own = tally(s.foeDice, bid.face)        // the AI's own contribution (it sees its dice)
  const need = bid.qty - own                    // how many more must come from your hidden dice
  return binomTail(s.youCount, need, P_MATCH)
}

/** One AI action: challenge if the standing bid is implausible, else a min/credible raise. */
export function aiStep(s: LiarsState): LiarsState {
  if (s.phase !== 'bidding' || s.turn !== 'foe') return s
  const who: Player = 'foe'

  // Opening the round: bid something the AI's own dice make comfortable.
  if (!s.bid) {
    const best = bestOwnFace(s.foeDice)
    const qty = Math.max(1, best.count)          // claim what it already holds (with a wild cushion)
    return makeBid(s, who, { qty, face: best.face })
  }

  const p = bidProbability(s, s.bid)
  // Challenge when the bid is unlikely to be true.
  if (p < 0.28) return challenge(s, who)

  // Otherwise raise. Prefer the minimal legal raise; consider bumping toward the AI's strong face.
  const min = minRaise(s.bid)
  const total = s.youCount + s.foeCount
  // A believable bluff: occasionally bump quantity on a face the AI is strong in.
  const strong = bestOwnFace(s.foeDice)
  if (Math.random() < 0.18 && strong.face >= 2) {
    const bluff: Bid = { qty: Math.min(total, Math.max(min.qty, strong.count + 1)), face: strong.face }
    if (isRaise(s.bid, bluff)) return makeBid(s, who, bluff)
  }
  // If even the minimal raise looks too risky (bid already near the table size), challenge.
  if (min.qty > total) return challenge(s, who)
  const rp = bidProbability(s, min)
  if (rp < 0.18) return challenge(s, who)
  return makeBid(s, who, min)
}

/** The face (2..6) the holder has the most of, counting wild 1s; ties favour the lower face. */
function bestOwnFace(dice: Face[]): { face: Face; count: number } {
  let bestFace: Face = 2, bestCount = -1
  for (const f of FACE_ORDER) {
    const c = tally(dice, f)
    if (c > bestCount) { bestCount = c; bestFace = f }
  }
  return { face: bestFace, count: Math.max(0, bestCount) }
}
