/* SKULL — pure logic (built for this codebase, not ported).
   4 players (player 0 = you, 1..3 = AI). Each owns 4 discs: 3 ROSES + 1 SKULL.
   A round runs in phases:
     'place'     — going around the table each active player places exactly ONE disc onto
                   their face-down stack per pass. After the first full go-around any player
                   may, on their turn, instead START THE BIDDING (declaring a number N). We
                   keep it simple: on a player's placement turn they either place one disc or
                   (if they already have at least one placed) open the bid.
     'bid'       — going around, each player either RAISES the bid (a strictly higher N, capped
                   at the total discs placed on the table) or PASSES. When all but one have
                   passed, the highest bidder must make good on the challenge.
     'challenge' — the highest bidder flips discs one at a time: their OWN stack first (top
                   down), then they choose any other player's top disc. Reaching N roses with no
                   skull WINS the round (+1 point). Hitting a skull FAILS — the challenger loses
                   one disc (a skull if able to keep the threat honest? we remove a RANDOM disc)
                   and the round resets with that player opening.
     'reveal'    — momentary state holding the flip outcome for the UI; advance() moves on.
     'done'      — a player reached the target points (2) → winner set.
   A player who loses all 4 discs is ELIMINATED and skipped.
   All randomness goes through an injectable RNG so tests are deterministic & always terminate. */

export type Disc = 'rose' | 'skull'
export type Phase = 'place' | 'bid' | 'challenge' | 'reveal' | 'done'
export type Rng = () => number   // returns [0,1)

export interface Player {
  hand: { roses: number; skulls: number }  // discs still IN HAND (not on the table)
  stack: Disc[]                              // face-down placed discs, index 0 = BOTTOM, last = TOP
  points: number
  eliminated: boolean
}

export interface FlipRecord { player: number; disc: Disc; fromOwn: boolean }

export interface SkullState {
  players: Player[]
  phase: Phase
  turn: number                 // whose action it is
  starter: number             // who opens placement / bidding this round
  placedFirstPass: boolean    // has every active player placed at least one disc?
  bid: number | null          // current highest bid (null = no bid yet)
  bidder: number | null       // who owns the current highest bid
  passed: boolean[]           // who has passed during the bid phase
  round: number
  flips: FlipRecord[]          // discs revealed so far in the active challenge
  challengeTarget: number      // N the challenger must reach (= bid) during 'challenge'
  outcome: { player: number; success: boolean } | null  // set in 'reveal'
  winner: number | null
  log: { t: string; x: string }[]
  actions: number              // monotonic action counter (drives the AI tick)
}

export const TARGET_POINTS = 2
export const START_ROSES = 3
export const START_SKULLS = 1

const defaultRng: Rng = Math.random
const push = (log: { t: string; x: string }[], t: string, x: string) =>
  log.concat([{ t, x }]).slice(-30)

function freshPlayer(): Player {
  return { hand: { roses: START_ROSES, skulls: START_SKULLS }, stack: [], points: 0, eliminated: false }
}

export function makeGame(): SkullState {
  return {
    players: [freshPlayer(), freshPlayer(), freshPlayer(), freshPlayer()],
    phase: 'place',
    turn: 0,
    starter: 0,
    placedFirstPass: false,
    bid: null,
    bidder: null,
    passed: [false, false, false, false],
    round: 1,
    flips: [],
    challengeTarget: 0,
    outcome: null,
    winner: null,
    log: [{ t: 'sys', x: 'Place a disc, then bid how many roses you can flip without hitting a skull.' }],
    actions: 0,
  }
}

// ---------- helpers ----------

export const handSize = (p: Player) => p.hand.roses + p.hand.skulls
export const discCount = (p: Player) => handSize(p) + p.stack.length
export const totalPlaced = (s: SkullState) => s.players.reduce((n, p) => n + p.stack.length, 0)

/** Active = in the game (not eliminated). */
export const activePlayers = (s: SkullState) => s.players.filter(p => !p.eliminated).length

/** Next non-eliminated seat after `from` (wraps). Returns `from` if it's the only one left. */
export function nextActive(s: SkullState, from: number): number {
  for (let step = 1; step <= s.players.length; step++) {
    const i = (from + step) % s.players.length
    if (!s.players[i].eliminated) return i
  }
  return from
}

/** During bidding, the next seat that has NOT passed and is active (or `from` if none). */
function nextBidder(s: SkullState, from: number): number {
  for (let step = 1; step <= s.players.length; step++) {
    const i = (from + step) % s.players.length
    if (!s.players[i].eliminated && !s.passed[i]) return i
  }
  return from
}

function liveBidders(s: SkullState): number[] {
  const out: number[] = []
  for (let i = 0; i < s.players.length; i++) if (!s.players[i].eliminated && !s.passed[i]) out.push(i)
  return out
}

// ---------- placement ----------

/** Place a face-down disc of `discType` onto player's stack. Advances the placement turn,
 *  flipping to the bid phase only when a player chooses to open (see openBid). */
export function place(s: SkullState, player: number, discType: Disc, _rng: Rng = defaultRng): SkullState {
  if (s.phase !== 'place' || s.turn !== player) return s
  const p = s.players[player]
  if (p.eliminated) return s
  if (discType === 'rose' && p.hand.roses <= 0) return s
  if (discType === 'skull' && p.hand.skulls <= 0) return s

  const players = s.players.map((pl, i) => {
    if (i !== player) return pl
    return {
      ...pl,
      hand: {
        roses: pl.hand.roses - (discType === 'rose' ? 1 : 0),
        skulls: pl.hand.skulls - (discType === 'skull' ? 1 : 0),
      },
      stack: pl.stack.concat([discType]),
    }
  })

  const next = nextActive(s, player)
  // First pass completes once we wrap back around to the starter.
  const firstPassDone = s.placedFirstPass || next === s.starter
  const log = push(s.log, player === 0 ? 'you' : 'ai',
    `${player === 0 ? 'You place' : `P${player + 1} places`} a disc.`)
  return { ...s, players, turn: next, placedFirstPass: firstPassDone, log, actions: s.actions + 1 }
}

/** A player chooses to STOP placing and OPEN the bid at N (>=1, <= total placed). Only legal
 *  once the first go-around has completed and that player has at least one disc placed. */
export function openBid(s: SkullState, player: number, n: number): SkullState {
  if (s.phase !== 'place' || s.turn !== player) return s
  if (!s.placedFirstPass) return s
  const p = s.players[player]
  if (p.eliminated || p.stack.length === 0) return s
  const max = totalPlaced(s)
  if (n < 1 || n > max) return s

  const passed = s.players.map(() => false)
  const log = push(s.log, player === 0 ? 'you' : 'ai',
    `${player === 0 ? 'You open' : `P${player + 1} opens`} the bid at ${n}.`)
  return {
    ...s,
    phase: 'bid',
    bid: n,
    bidder: player,
    passed,
    turn: nextBidder({ ...s, passed }, player),
    log,
    actions: s.actions + 1,
  }
}

// ---------- bidding ----------

/** Raise the bid to `n` (must be strictly higher than current, <= total placed). */
export function bid(s: SkullState, player: number, n: number): SkullState {
  if (s.phase !== 'bid' || s.turn !== player) return s
  if (s.players[player].eliminated || s.passed[player]) return s
  const max = totalPlaced(s)
  if (s.bid == null) return s
  if (n <= s.bid || n > max) return s

  const log = push(s.log, player === 0 ? 'you' : 'ai',
    `${player === 0 ? 'You raise' : `P${player + 1} raises`} to ${n}.`)
  const mid = { ...s, bid: n, bidder: player, log, actions: s.actions + 1 }
  return { ...mid, turn: nextBidder(mid, player) }
}

/** Pass during bidding. When only the highest bidder remains, advance to the challenge. */
export function pass(s: SkullState, player: number): SkullState {
  if (s.phase !== 'bid' || s.turn !== player) return s
  if (s.players[player].eliminated || s.passed[player]) return s

  const passed = s.passed.slice()
  passed[player] = true
  let mid: SkullState = {
    ...s,
    passed,
    log: push(s.log, player === 0 ? 'you' : 'ai', `${player === 0 ? 'You pass' : `P${player + 1} passes`}.`),
    actions: s.actions + 1,
  }

  const live = liveBidders(mid)
  if (live.length <= 1 && mid.bid != null && mid.bidder != null) {
    // Everyone but the highest bidder has passed → that player must flip.
    return {
      ...mid,
      phase: 'challenge',
      turn: mid.bidder,
      challengeTarget: mid.bid,
      flips: [],
      log: push(mid.log, 'sys', `P${mid.bidder + 1} must flip ${mid.bid} rose${mid.bid === 1 ? '' : 's'}.`),
    }
  }
  return { ...mid, turn: nextBidder(mid, player) }
}

// ---------- challenge / flipping ----------

/** The challenger must flip their OWN stack (top-down) before any other stack. Returns the
 *  list of seats whose TOP disc may legally be flipped next. */
export function flipTargets(s: SkullState): number[] {
  if (s.phase !== 'challenge') return []
  const challenger = s.bidder
  if (challenger == null) return []
  const ownFlipped = s.flips.filter(f => f.player === challenger).length
  const own = s.players[challenger]
  // Must exhaust own stack first.
  if (ownFlipped < own.stack.length) return [challenger]
  // Then any other player's stack that still has an unflipped disc.
  const out: number[] = []
  for (let i = 0; i < s.players.length; i++) {
    if (i === challenger) continue
    if (s.players[i].eliminated) continue
    const flipped = s.flips.filter(f => f.player === i).length
    if (flipped < s.players[i].stack.length) out.push(i)
  }
  return out
}

/** Flip the top unflipped disc of `target`'s stack. Resolves the round on skull (fail) or on
 *  reaching the target count of roses (win). Returns a state in 'challenge', 'reveal', or 'done'. */
export function flip(s: SkullState, target: number, rng: Rng = defaultRng): SkullState {
  if (s.phase !== 'challenge') return s
  const legal = flipTargets(s)
  if (!legal.includes(target)) return s
  const challenger = s.bidder!
  const flippedHere = s.flips.filter(f => f.player === target).length
  // index from TOP: stack[len-1] is top, so the k-th flip reveals stack[len-1-k].
  const idx = s.players[target].stack.length - 1 - flippedHere
  const disc = s.players[target].stack[idx]
  const flips = s.flips.concat([{ player: target, disc, fromOwn: target === challenger }])

  if (disc === 'skull') {
    return resolveFail({ ...s, flips }, rng)
  }
  const roses = flips.length // every flip so far is a rose if we got here without failing
  if (roses >= s.challengeTarget) {
    return resolveWin({ ...s, flips })
  }
  // keep flipping
  const log = push(s.log, 'sys', `Flip ${flips.length}: a rose (P${target + 1}).`)
  return { ...s, flips, log, actions: s.actions + 1 }
}

function resolveWin(s: SkullState): SkullState {
  const challenger = s.bidder!
  const players = s.players.map((p, i) => i === challenger ? { ...p, points: p.points + 1 } : p)
  const won = players[challenger].points >= TARGET_POINTS
  const log = push(s.log, challenger === 0 ? 'you' : 'ai',
    `P${challenger + 1} flips ${s.challengeTarget} roses — scores a point!`)
  const mid: SkullState = {
    ...s,
    players,
    phase: 'reveal',
    outcome: { player: challenger, success: true },
    log,
    actions: s.actions + 1,
  }
  if (won) {
    return { ...mid, phase: 'done', winner: challenger, log: push(log, 'win', `P${challenger + 1} wins the game!`) }
  }
  return mid
}

/** A skull was hit. The challenger loses ONE RANDOM disc and the round resets. */
function resolveFail(s: SkullState, rng: Rng): SkullState {
  const challenger = s.bidder!
  // collect every disc the challenger owns (hand + stack), pick one at random to destroy.
  const owned: Disc[] = []
  const p = s.players[challenger]
  for (let i = 0; i < p.hand.roses; i++) owned.push('rose')
  for (let i = 0; i < p.hand.skulls; i++) owned.push('skull')
  for (const d of p.stack) owned.push(d)
  let players = s.players
  let log = push(s.log, challenger === 0 ? 'you' : 'ai',
    `P${challenger + 1} hits a skull — challenge fails, loses a disc.`)
  if (owned.length > 0) {
    const removeIdx = Math.min(owned.length - 1, Math.floor(rng() * owned.length))
    const removed = owned[removeIdx]
    // Rebuild the challenger's discs minus the removed one; return all OTHER placed discs to hands.
    const rebuilt = rebuildAfterLoss(s.players, challenger, removed)
    players = rebuilt
    log = push(log, 'sys', `P${challenger + 1} loses a ${removed}.`)
  }
  const mid: SkullState = {
    ...s,
    players,
    outcome: { player: challenger, success: false },
    phase: 'reveal',
    log,
    actions: s.actions + 1,
  }
  return mid
}

/** Remove one `removed` disc from `loser`'s total holdings, return everyone's placed discs to
 *  their hands, and mark elimination. Used at round-reset time. */
function rebuildAfterLoss(players: Player[], loser: number, removed: Disc): Player[] {
  return players.map((p, i) => {
    // First, fold the stack back into the hand counts.
    let roses = p.hand.roses + p.stack.filter(d => d === 'rose').length
    let skulls = p.hand.skulls + p.stack.filter(d => d === 'skull').length
    if (i === loser) {
      if (removed === 'rose' && roses > 0) roses--
      else if (removed === 'skull' && skulls > 0) skulls--
      else if (roses > 0) roses--          // fall back to dropping a rose if the exact type is gone
      else if (skulls > 0) skulls--
    }
    const eliminated = p.eliminated || (roses + skulls) <= 0
    return { ...p, hand: { roses, skulls }, stack: [], eliminated }
  })
}

/** Fold every placed stack back into hands without losing any disc (used after a WIN reset). */
function returnAllStacks(players: Player[]): Player[] {
  return players.map(p => {
    const roses = p.hand.roses + p.stack.filter(d => d === 'rose').length
    const skulls = p.hand.skulls + p.stack.filter(d => d === 'skull').length
    const eliminated = p.eliminated || (roses + skulls) <= 0
    return { ...p, hand: { roses, skulls }, stack: [], eliminated }
  })
}

/** Advance out of the 'reveal' phase into the next round (or stay 'done'). The starter of the
 *  next round is the challenger if still active, otherwise the next active seat. */
export function nextRound(s: SkullState): SkullState {
  if (s.phase !== 'reveal' || s.outcome == null) return s
  const challenger = s.outcome.player
  // On a WIN the discs were never destroyed — fold stacks back. On a FAIL rebuildAfterLoss
  // already folded stacks AND removed one disc, so don't fold again.
  const players = s.outcome.success ? returnAllStacks(s.players) : s.players

  // pick the next starter: prefer the challenger, else next active seat.
  let starter = challenger
  if (players[starter].eliminated) starter = nextActiveIn(players, challenger)

  // If only one player remains, they win by elimination.
  const aliveCount = players.filter(p => !p.eliminated).length
  if (aliveCount <= 1) {
    const winner = players.findIndex(p => !p.eliminated)
    return {
      ...s,
      players,
      phase: 'done',
      winner: winner >= 0 ? winner : challenger,
      log: push(s.log, 'win', `Only one player left standing — P${(winner >= 0 ? winner : challenger) + 1} wins!`),
      actions: s.actions + 1,
    }
  }

  return {
    ...s,
    players,
    phase: 'place',
    turn: starter,
    starter,
    placedFirstPass: false,
    bid: null,
    bidder: null,
    passed: players.map(() => false),
    flips: [],
    challengeTarget: 0,
    outcome: null,
    round: s.round + 1,
    log: push(s.log, 'sys', `Round ${s.round + 1} — P${starter + 1} starts placing.`),
    actions: s.actions + 1,
  }
}

function nextActiveIn(players: Player[], from: number): number {
  for (let step = 1; step <= players.length; step++) {
    const i = (from + step) % players.length
    if (!players[i].eliminated) return i
  }
  return from
}

// ===================== AI =====================
// Heuristic, deterministic given the RNG. The AI knows its OWN stack contents (it placed them)
// but NOT other players' disc types — it only knows their placed COUNTS.

/** How many of the challenger's OWN top discs are guaranteed roses (it knows its own stack)? */
function ownReachableRoses(s: SkullState, player: number): number {
  // The AI reads its own stack from the top down, counting roses until it would hit its skull.
  const st = s.players[player].stack
  let count = 0
  for (let k = st.length - 1; k >= 0; k--) {
    if (st[k] === 'skull') break
    count++
  }
  return count
}

/** AI placement choice: place a SKULL when it expects to be challenged into others' stacks, but
 *  keep it simple & non-degenerate — bias toward roses, occasionally seed a skull as a trap. */
function aiPlaceChoice(s: SkullState, player: number, rng: Rng): Disc {
  const p = s.players[player]
  if (p.hand.skulls <= 0) return 'rose'
  if (p.hand.roses <= 0) return 'skull'
  const alreadyHasSkull = p.stack.includes('skull')
  // Lay the skull early-ish as a trap, but only one, and not as the very first disc (so the AI
  // can sometimes safely satisfy its own small bids). ~35% to drop the skull on a clean stack.
  if (!alreadyHasSkull && p.stack.length >= 1 && rng() < 0.35) return 'skull'
  return 'rose'
}

/** One AI action for whatever phase the game is in. Always makes legal progress. */
export function aiAct(s: SkullState, player: number, rng: Rng = defaultRng): SkullState {
  if (s.winner != null) return s
  if (s.turn !== player) return s
  const p = s.players[player]
  if (p.eliminated) return s

  if (s.phase === 'place') {
    // Open the bid if we already have a comfortable rose run; otherwise place another disc.
    const reachable = ownReachableRoses(s, player)
    const placed = totalPlaced(s)
    if (s.placedFirstPass && p.stack.length >= 1) {
      // Open a bid roughly equal to our own safe roses, sometimes nudged up by 1 as a bluff.
      const bluff = rng() < 0.3 ? 1 : 0
      const want = Math.min(placed, Math.max(1, reachable + bluff))
      // Only open if we'd be making a meaningful claim, else keep placing (until forced).
      const mustOpen = handSize(p) === 0 // nothing left to place → must open
      if (mustOpen || (reachable >= 1 && rng() < 0.6)) {
        return openBid(s, player, want)
      }
    }
    // place another disc (prefer rose, sometimes a single skull trap)
    const choice = aiPlaceChoice(s, player, rng)
    return place(s, player, choice, rng)
  }

  if (s.phase === 'bid') {
    if (s.bid == null) return pass(s, player) // shouldn't happen, stay safe
    const max = totalPlaced(s)
    const reachable = ownReachableRoses(s, player)
    // Roses I can be confident about: my own safe run + a fraction of OTHER stacks (each other
    // top disc is a rose with prob ~ (roses left)/(discs left) ≈ 0.7 early).
    const others = max - s.players[player].stack.length
    const estReachable = reachable + Math.floor(others * 0.5)
    // Raise only if the next number is still plausibly within my estimate.
    const want = s.bid + 1
    if (want <= max && want <= estReachable && rng() < 0.5) {
      return bid(s, player, want)
    }
    return pass(s, player)
  }

  if (s.phase === 'challenge') {
    const targets = flipTargets(s)
    if (targets.length === 0) return s
    // Prefer own stack first (engine already enforces). Among others, flip the player with the
    // most placed discs (more likely to have a rose on top early). Deterministic tie-break: lowest seat.
    let pick = targets[0]
    let bestScore = -1
    for (const t of targets) {
      const remaining = s.players[t].stack.length - s.flips.filter(f => f.player === t).length
      if (remaining > bestScore) { bestScore = remaining; pick = t }
    }
    return flip(s, pick, rng)
  }

  if (s.phase === 'reveal') {
    return nextRound(s)
  }
  return s
}
