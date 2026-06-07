/* THE MIND — logic (built for this codebase, not ported).
   A COOPERATIVE card game. You are player 0; players 1 and 2 are AI partners.
   Deck is 1..100. Each LEVEL deals every player `level` cards. The team must play
   ALL cards onto one shared pile in ASCENDING order WITHOUT communicating. There are
   no turns — anyone may play their lowest card whenever they sense it is the lowest
   remaining across all hands. If a card is played while a LOWER card is still held by
   anyone, the team LOSES A LIFE and all such lower cards are revealed/discarded.
   The team has LIVES and SHURIKEN (stars); a shuriken makes everyone discard their
   lowest card face-up (no life cost). Clear the final level to WIN; run out of lives
   to LOSE.

   Timing model: this is a real-time-ish game. Each held card has an implicit "play
   time" proportional to its value (higher = waits longer). The AI partners auto-play
   their lowest card when an internal timer fires; the human plays via a button. The
   simulation advances via tick(): each tick increments a clock and each AI fires when
   its threshold is reached. Timing is injectable for deterministic tests. */

export const PLAYERS = [0, 1, 2] as const
export type PlayerId = 0 | 1 | 2
export const DECK_SIZE = 100
export const MAX_LEVEL = 8
export const START_LIVES = 3
export const START_SHURIKEN = 1

export type Phase = 'playing' | 'won' | 'lost'
export type Status = 'playing' | 'won' | 'lost'

export interface LogEntry { t: string; x: string }

export interface MindState {
  /** Each player's hand, kept sorted ascending. Index 0 = you, 1/2 = AI partners. */
  hands: number[][]
  /** Cards already correctly played, in order. */
  pile: number[]
  /** Top value of the pile (0 means nothing played yet — a REAL value, not "empty"). */
  pileTop: number
  level: number
  maxLevel: number
  lives: number
  shuriken: number
  /** Simulation clock (ticks). */
  clock: number
  /**
   * Per-AI next-play threshold (the clock value at which that AI will play its
   * lowest card). Index by player id; index 0 (human) is unused/null.
   */
  thresholds: (number | null)[]
  phase: Phase
  /** Cards revealed/discarded by the most recent mistake (for UI flash). */
  lastRevealed: number[]
  log: LogEntry[]
}

/** Injectable timing config so tests are deterministic. */
export interface Timing {
  /** Deterministic shuffle/deal: returns a permutation of 1..DECK_SIZE. */
  deal: () => number[]
  /**
   * Ticks an AI waits before playing its lowest card, given the card value and the
   * current pile top. Bigger gaps wait proportionally longer. Lower value -> sooner.
   */
  aiDelay: (cardValue: number, pileTop: number, player: PlayerId) => number
}

function push(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-30)
}

/** Fisher–Yates shuffle of 1..DECK_SIZE using Math.random (production default). */
function randomDeck(): number[] {
  const a = Array.from({ length: DECK_SIZE }, (_, i) => i + 1)
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Default timing: AI delay grows with the gap from the pile top to its lowest card. */
export const defaultTiming: Timing = {
  deal: randomDeck,
  aiDelay: (cardValue, pileTop) => {
    const gap = Math.max(1, cardValue - pileTop)
    // Roughly one tick per ~3 points of gap, with a little jitter for personality.
    const base = Math.ceil(gap / 3)
    const jitter = (Math.random() * 2) | 0
    return Math.max(1, base + jitter)
  },
}

/** Deal `level` cards to each of the 3 players from a deck permutation; hands sorted. */
function dealHands(level: number, deck: number[]): number[][] {
  const hands: number[][] = [[], [], []]
  let k = 0
  for (let r = 0; r < level; r++) {
    for (let p = 0; p < 3; p++) {
      hands[p].push(deck[k++])
    }
  }
  for (const h of hands) h.sort((a, b) => a - b)
  return hands
}

/** Compute fresh AI thresholds for the current hands/pile, relative to clock. */
function armThresholds(s: MindState, timing: Timing): (number | null)[] {
  const out: (number | null)[] = [null, null, null]
  for (const p of [1, 2] as PlayerId[]) {
    const hand = s.hands[p]
    if (hand.length === 0) { out[p] = null; continue }
    out[p] = s.clock + timing.aiDelay(hand[0], s.pileTop, p)
  }
  return out
}

/**
 * Create a game at `level`. `optionalDeal` injects a deck permutation (length>=
 * needed) for deterministic tests; otherwise a random deck is used. Timing is
 * injectable so AI thresholds are deterministic in tests.
 */
export function makeGame(level = 1, optionalDeal?: number[], timing: Timing = defaultTiming): MindState {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, level))
  const deck = optionalDeal ?? timing.deal()
  const hands = dealHands(lvl, deck)
  const base: MindState = {
    hands,
    pile: [],
    pileTop: 0,
    level: lvl,
    maxLevel: MAX_LEVEL,
    lives: START_LIVES,
    shuriken: START_SHURIKEN,
    clock: 0,
    thresholds: [null, null, null],
    phase: 'playing',
    lastRevealed: [],
    log: [{ t: 'sys', x: `Level ${lvl} — play every card in ascending order. No talking.` }],
  }
  base.thresholds = armThresholds(base, timing)
  return base
}

export function gameStatus(s: MindState): Status {
  return s.phase
}

export function totalCardsLeft(s: MindState): number {
  return s.hands.reduce((n, h) => n + h.length, 0)
}

/** The single lowest card still held anywhere; null if all hands empty. */
export function lowestOutstanding(s: MindState): { value: number; player: PlayerId } | null {
  let best: { value: number; player: PlayerId } | null = null
  for (const p of PLAYERS) {
    const h = s.hands[p]
    if (h.length === 0) continue
    if (best == null || h[0] < best.value) best = { value: h[0], player: p }
  }
  return best
}

/** Your (player 0) lowest card, or null. */
export function yourLowest(s: MindState): number | null {
  return s.hands[0].length > 0 ? s.hands[0][0] : null
}

/** Tension 0..1: how close the lowest outstanding card is to the pile top (small gap = tense). */
export function tension(s: MindState): number {
  const lo = lowestOutstanding(s)
  if (lo == null) return 0
  const gap = lo.value - s.pileTop
  // A small gap right above the pile means a mistake is unlikely soon; tension here
  // reflects how "imminent" a correct play is — clamp to a friendly 0..1.
  return Math.max(0, Math.min(1, 1 - gap / 40))
}

/**
 * Player `player` plays their single lowest card onto the pile.
 * - If it IS the lowest outstanding across ALL hands -> success, card moves to pile.
 * - Otherwise -> lose a life, and ALL cards still held that are lower than the played
 *   card are revealed and discarded (removed from hands). The played card still lands
 *   on the pile (it advances the pile top).
 * Re-arms AI thresholds afterward.
 */
export function playLowest(s: MindState, player: PlayerId, timing: Timing = defaultTiming): MindState {
  if (s.phase !== 'playing') return s
  const hand = s.hands[player]
  if (hand.length === 0) return s
  const card = hand[0]

  // Gather every strictly-lower card still held by anyone (including this player's? no —
  // this player's lowest IS `card`, so none of their own are lower).
  const lowers: { player: PlayerId; value: number }[] = []
  for (const p of PLAYERS) {
    for (const v of s.hands[p]) {
      if (v < card) lowers.push({ player: p, value: v })
    }
  }

  const who = player === 0 ? 'You' : `Partner ${player}`
  const nextHands = s.hands.map(h => h.slice())
  // Remove the played card from the player's hand.
  nextHands[player].shift()

  let lives = s.lives
  let log = s.log
  let lastRevealed: number[] = []

  if (lowers.length === 0) {
    // Correct play.
    log = push(log, player === 0 ? 'you' : 'ai', `${who} played ${card}.`)
  } else {
    // Mistake: lose a life and discard all lower cards.
    lives -= 1
    lastRevealed = lowers.map(l => l.value).sort((a, b) => a - b)
    for (const l of lowers) {
      const h = nextHands[l.player]
      const idx = h.indexOf(l.value)
      if (idx >= 0) h.splice(idx, 1)
    }
    log = push(log, 'sys', `${who} played ${card} too early — lost a life. Revealed: ${lastRevealed.join(', ')}.`)
  }

  let next: MindState = {
    ...s,
    hands: nextHands,
    pile: s.pile.concat([card]),
    pileTop: card,
    lives,
    lastRevealed,
  }
  next.log = log
  next = resolveOutcome(next, timing)
  return next
}

/**
 * Shuriken (star): every player discards their lowest card FACE UP (revealed),
 * no life lost. Helps the team de-risk. Discarded cards do NOT go on the pile —
 * they are removed; the pile top is unchanged. Standard play: this can only safely
 * be used when all agree, but here it is a free team de-risk action.
 */
export function useShuriken(s: MindState, timing: Timing = defaultTiming): MindState {
  if (s.phase !== 'playing') return s
  if (s.shuriken <= 0) return s
  const nextHands = s.hands.map(h => h.slice())
  const revealed: number[] = []
  for (const p of PLAYERS) {
    if (nextHands[p].length > 0) revealed.push(nextHands[p].shift() as number)
  }
  if (revealed.length === 0) return s
  revealed.sort((a, b) => a - b)
  let log = push(s.log, 'sys', `Shuriken used — each discards lowest: ${revealed.join(', ')}.`)
  let next: MindState = {
    ...s,
    hands: nextHands,
    shuriken: s.shuriken - 1,
    lastRevealed: revealed,
    log,
  }
  next = resolveOutcome(next, timing)
  return next
}

/**
 * After any hand change: check loss (no lives), level completion (no cards left),
 * and win (cleared the final level). Re-arms AI thresholds for whatever remains.
 */
function resolveOutcome(s: MindState, timing: Timing): MindState {
  if (s.lives <= 0) {
    return { ...s, phase: 'lost', thresholds: [null, null, null], log: push(s.log, 'sys', 'Out of lives — the team loses.') }
  }
  if (totalCardsLeft(s) === 0) {
    if (s.level >= s.maxLevel) {
      return { ...s, phase: 'won', thresholds: [null, null, null], log: push(s.log, 'win', `Level ${s.level} cleared — the team wins The Mind!`) }
    }
    // Level complete but not yet advanced; UI/advanceLevel deals the next level.
    const done = { ...s, log: push(s.log, 'good', `Level ${s.level} cleared!`), thresholds: [null, null, null] as (number | null)[] }
    return done
  }
  // Still playing — re-arm AI timers from the new clock.
  return { ...s, thresholds: armThresholds(s, timing) }
}

/** Is the current level finished (all hands empty) but not the final level? */
export function levelComplete(s: MindState): boolean {
  return s.phase === 'playing' && totalCardsLeft(s) === 0 && s.level < s.maxLevel
}

/**
 * Advance to the next level: deal `level+1` cards each, refresh timers, keep lives
 * and shuriken. `optionalDeal` for deterministic tests. No-op unless a level is
 * actually complete (or forced via the optional flag in callers).
 */
export function advanceLevel(s: MindState, optionalDeal?: number[], timing: Timing = defaultTiming): MindState {
  if (s.phase !== 'playing') return s
  if (totalCardsLeft(s) !== 0) return s
  if (s.level >= s.maxLevel) return { ...s, phase: 'won' }
  const nextLevel = s.level + 1
  const deck = optionalDeal ?? timing.deal()
  const hands = dealHands(nextLevel, deck)
  const next: MindState = {
    ...s,
    hands,
    pile: [],
    pileTop: 0,
    level: nextLevel,
    clock: 0,
    lastRevealed: [],
    phase: 'playing',
    thresholds: [null, null, null],
    log: push(s.log, 'sys', `Level ${nextLevel} — ${nextLevel} cards each. Stay calm.`),
  }
  next.thresholds = armThresholds(next, timing)
  return next
}

/** Which AI (1 or 2) is ready to play its lowest at the current clock, if any. Lowest threshold first. */
export function aiReadyToPlay(s: MindState): PlayerId | null {
  if (s.phase !== 'playing') return null
  let pick: PlayerId | null = null
  let pickThr = Infinity
  for (const p of [1, 2] as PlayerId[]) {
    const thr = s.thresholds[p]
    if (thr == null) continue
    if (s.hands[p].length === 0) continue
    if (s.clock >= thr && thr < pickThr) { pick = p; pickThr = thr }
  }
  return pick
}

/**
 * Advance the simulation by one tick. If an AI's threshold has fired, it plays its
 * lowest card (which may be correct or a mistake). Otherwise just advances the clock.
 * Returns the new state; deterministic given injected timing.
 */
export function tick(s: MindState, timing: Timing = defaultTiming): MindState {
  if (s.phase !== 'playing') return s
  const ready = aiReadyToPlay(s)
  if (ready != null) {
    return playLowest(s, ready, timing)
  }
  return { ...s, clock: s.clock + 1 }
}

/**
 * One discrete AI step for the UI driver: advance the clock by one and let any
 * ready AI act. Equivalent to tick(); named for parity with other games' aiStep.
 */
export function aiStep(s: MindState, timing: Timing = defaultTiming): MindState {
  return tick(s, timing)
}
