/* CRIBBAGE — pure logic (built for this codebase, not ported).
   Classic 2-player Cribbage to 121: you vs a heuristic AI. Each hand deals 6 cards
   apiece; both players discard 2 to the CRIB (the dealer's). A starter card is cut
   (Jack → dealer pegs 2, "his heels"). THE PLAY (pegging): alternate cards keeping the
   running count ≤ 31, scoring 15s, pairs, runs, 31, and the last-card "go". THE SHOW:
   non-dealer counts, then dealer, then dealer counts the crib — fifteens, pairs, runs,
   flush, nobs. First to 121 wins; on a tie of progress the non-dealer pegs out first.
   Deterministic deals when a deck is supplied (for tests). No React/DOM; every action
   returns a fresh state. */

export type Suit = 'S' | 'H' | 'D' | 'C'
export interface Card { r: number; s: Suit } // r: 1 (Ace) .. 13 (King)
export type Side = 'you' | 'ai'
export type Phase = 'discard' | 'play' | 'show' | 'done'

export interface ScoreItem { label: string; points: number }
export interface ScoreBreakdown { total: number; items: ScoreItem[] }

export interface PlayedCard { card: Card; by: Side }

export interface CribbageState {
  deck: Card[]              // remaining undealt cards (unused after deal, kept for determinism)
  hands: { you: Card[]; ai: Card[] }      // current cards still in hand (shrinks during play)
  full: { you: Card[]; ai: Card[] }       // the kept 4 cards for the show (set after discard)
  crib: Card[]
  starter: Card | null
  dealer: Side
  turn: Side                // whose action it is (discard: ignored / play: whose card)
  // pegging
  pile: PlayedCard[]        // cards on the table this "count" sequence (resets after 31/go)
  played: PlayedCard[]      // full play history (for display)
  count: number             // running total of the current sequence
  goPlayers: Record<Side, boolean> // who has said "go" this sequence
  lastPlayer: Side | null   // who played the last card (gets the go/last-card point)
  // scoring
  scores: { you: number; ai: number }
  phase: Phase
  winner: Side | null
  handNo: number
  show: ShowResult | null   // populated when entering the show
  ply: number               // monotonic action counter — drives the AI tick
  log: LogEntry[]
}

export interface ShowResult {
  // computed breakdowns, in counting order: non-dealer hand, dealer hand, crib
  nonDealer: { side: Side; breakdown: ScoreBreakdown }
  dealerHand: { side: Side; breakdown: ScoreBreakdown }
  cribB: { side: Side; breakdown: ScoreBreakdown }
}

export interface LogEntry { t: string; x: string }

export const TARGET = 121
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUITS: Suit[] = ['S', 'H', 'D', 'C']

export const rankLabel = (r: number) => RANKS[r]
export const isRed = (s: Suit) => s === 'H' || s === 'D'
export const suitGlyph = (s: Suit) => ({ S: '♠', H: '♥', D: '♦', C: '♣' }[s])
/** Pegging / counting value: face cards are 10, ace is 1. */
export const pipValue = (r: number) => (r >= 10 ? 10 : r)
export const other = (s: Side): Side => (s === 'you' ? 'ai' : 'you')

function pushLog(log: LogEntry[], t: string, x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-40)
}

export function freshDeck(): Card[] {
  const d: Card[] = []
  for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ r, s })
  return d
}

export function shuffle(deck: Card[]): Card[] {
  const d = deck.slice()
  for (let i = d.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    const t = d[i]; d[i] = d[j]; d[j] = t
  }
  return d
}

// ---------------------------------------------------------------------------
// SCORING — the show
// ---------------------------------------------------------------------------

/** All non-empty subsets of `cards` whose pip-values sum to exactly 15 (each = 2 points). */
function fifteens(cards: Card[]): number {
  let count = 0
  const n = cards.length
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += pipValue(cards[i].r)
    if (sum === 15) count++
  }
  return count
}

/** Pairs: every unordered pair of equal RANK scores 2. */
function pairs(cards: Card[]): number {
  let pts = 0
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      if (cards[i].r === cards[j].r) pts += 2
  return pts
}

/**
 * Runs with multiplicity. Group by rank, find every maximal consecutive span of
 * length ≥ 3 with no gap; each such run scores (length × product-of-rank-multiplicities).
 * This handles double/triple runs correctly (e.g. 4,5,5,6 → two runs of 3 = 6).
 */
function runs(cards: Card[]): number {
  const mult: Record<number, number> = {}
  for (const c of cards) mult[c.r] = (mult[c.r] || 0) + 1
  const present = Object.keys(mult).map(Number).sort((a, b) => a - b)
  let pts = 0
  let i = 0
  while (i < present.length) {
    let j = i
    while (j + 1 < present.length && present[j + 1] === present[j] + 1) j++
    const len = j - i + 1
    if (len >= 3) {
      let prod = 1
      for (let k = i; k <= j; k++) prod *= mult[present[k]]
      pts += len * prod
    }
    i = j + 1
  }
  return pts
}

/**
 * Flush: in a hand, 4 of one suit (the 4 kept cards) = 4; +1 if the starter matches.
 * In the CRIB all 5 must match (no 4-card flush). `hand4` = the 4 hand/crib cards.
 */
function flush(hand4: Card[], starter: Card | null, isCrib: boolean): number {
  if (hand4.length < 4) return 0
  const s0 = hand4[0].s
  const allFour = hand4.every((c) => c.s === s0)
  if (!allFour) return 0
  const withStarter = starter != null && starter.s === s0
  if (isCrib) return withStarter ? 5 : 0
  return withStarter ? 5 : 4
}

/** Nobs: a Jack in hand whose suit matches the starter = 1. */
function nobs(hand4: Card[], starter: Card | null): number {
  if (starter == null) return 0
  for (const c of hand4) if (c.r === 11 && c.s === starter.s) return 1
  return 0
}

/**
 * Score a 4-card hand (or crib) plus the starter. `isCrib` toggles the strict 5-card
 * flush rule. Returns total + a labelled breakdown. A legitimately scoreless hand
 * returns { total: 0, items: [] } — callers MUST NOT truthiness-test the total.
 */
export function scoreHand(hand4: Card[], starter: Card | null, isCrib = false): ScoreBreakdown {
  const all = starter != null ? hand4.concat([starter]) : hand4.slice()
  const items: ScoreItem[] = []
  const f15 = fifteens(all)
  if (f15 > 0) items.push({ label: `Fifteens ×${f15}`, points: f15 * 2 })
  const pr = pairs(all)
  if (pr > 0) items.push({ label: `Pairs`, points: pr })
  const rn = runs(all)
  if (rn > 0) items.push({ label: `Runs`, points: rn })
  const fl = flush(hand4, starter, isCrib)
  if (fl > 0) items.push({ label: `Flush (${fl})`, points: fl })
  const nb = nobs(hand4, starter)
  if (nb > 0) items.push({ label: `Nobs`, points: nb })
  const total = items.reduce((a, b) => a + b.points, 0)
  return { total, items }
}

// ---------------------------------------------------------------------------
// SCORING — the play (pegging)
// ---------------------------------------------------------------------------

/**
 * Points earned by the just-played card given the current pile (which ALREADY includes
 * the new card) and the running count. Scores 15, 31, pairs (of the trailing equal-rank
 * cards), and the longest run ending at the new card.
 */
export function pegPoints(pile: PlayedCard[], count: number): ScoreBreakdown {
  const items: ScoreItem[] = []
  if (count === 15) items.push({ label: 'Fifteen', points: 2 })
  if (count === 31) items.push({ label: 'Thirty-one', points: 2 })

  // Pairs: count trailing cards of equal rank to the last card.
  const n = pile.length
  if (n >= 2) {
    const lastR = pile[n - 1].card.r
    let same = 1
    for (let i = n - 2; i >= 0; i--) {
      if (pile[i].card.r === lastR) same++
      else break
    }
    if (same === 2) items.push({ label: 'Pair', points: 2 })
    else if (same === 3) items.push({ label: 'Pair royal', points: 6 })
    else if (same >= 4) items.push({ label: 'Double pair royal', points: 12 })
  }

  // Runs: longest suffix (length ≥ 3) of the pile whose ranks form a consecutive set.
  for (let len = n; len >= 3; len--) {
    const seg = pile.slice(n - len).map((p) => p.card.r)
    const set = new Set(seg)
    if (set.size !== seg.length) continue // duplicates can't be a run
    const mn = Math.min(...seg), mx = Math.max(...seg)
    if (mx - mn === len - 1) {
      items.push({ label: `Run of ${len}`, points: len })
      break
    }
  }

  const total = items.reduce((a, b) => a + b.points, 0)
  return { total, items }
}

// ---------------------------------------------------------------------------
// GAME SETUP
// ---------------------------------------------------------------------------

export function makeGame(deck?: Card[], dealer: Side = 'ai'): CribbageState {
  const d = deck ? deck.slice() : shuffle(freshDeck())
  const you = d.slice(0, 6)
  const ai = d.slice(6, 12)
  const rest = d.slice(12)
  return {
    deck: rest,
    hands: { you, ai },
    full: { you: [], ai: [] },
    crib: [],
    starter: null,
    dealer,
    turn: 'you',
    pile: [],
    played: [],
    count: 0,
    goPlayers: { you: false, ai: false },
    lastPlayer: null,
    scores: { you: 0, ai: 0 },
    phase: 'discard',
    winner: null,
    handNo: 1,
    show: null,
    ply: 0,
    log: [{ t: 'sys', x: `Hand 1 — ${dealer === 'you' ? 'you deal' : 'AI deals'}. Discard 2 to the crib.` }],
  }
}

/** Award points to a side, clamping the game at TARGET and recording the winner. */
function award(s: CribbageState, side: Side, pts: number, reason: string): CribbageState {
  if (pts <= 0) return s
  const cur = s.scores[side]
  const next = Math.min(TARGET, cur + pts)
  const scores = Object.assign({}, s.scores, { [side]: next })
  let winner = s.winner
  let phase = s.phase
  if (next >= TARGET && winner == null) { winner = side; phase = 'done' }
  const who = side === 'you' ? 'you' : 'ai'
  return Object.assign({}, s, {
    scores, winner, phase,
    log: pushLog(s.log, who, `${side === 'you' ? 'You' : 'AI'} peg ${pts} — ${reason}.`),
  })
}

// ---------------------------------------------------------------------------
// DISCARD → CRIB
// ---------------------------------------------------------------------------

/**
 * Move two of `side`'s cards (by index into their current hand) to the crib. When both
 * players have discarded (crib has 4), cut the starter and advance to the play phase.
 */
export function discardToCrib(s: CribbageState, side: Side, idx: [number, number]): CribbageState {
  if (s.phase !== 'discard') return s
  if (s.full[side].length > 0) return s // already discarded
  const hand = s.hands[side]
  const [a, b] = idx
  if (a === b || hand[a] == null || hand[b] == null) return s
  const discarded = [hand[a], hand[b]]
  const kept = hand.filter((_, i) => i !== a && i !== b)
  const crib = s.crib.concat(discarded)
  const full = Object.assign({}, s.full, { [side]: kept })
  const hands = Object.assign({}, s.hands, { [side]: kept })
  let ns: CribbageState = Object.assign({}, s, { crib, full, hands, ply: s.ply + 1 })
  if (crib.length === 4) ns = startPlay(ns)
  return ns
}

/** Cut the starter card, handle "his heels", and begin the pegging phase. */
function startPlay(s: CribbageState): CribbageState {
  // Cut the starter from the remaining deck (deterministic: first remaining card).
  const starter = s.deck[0] ?? null
  let ns: CribbageState = Object.assign({}, s, {
    starter,
    phase: 'play' as Phase,
    turn: other(s.dealer), // non-dealer leads the play
    pile: [], played: [], count: 0,
    goPlayers: { you: false, ai: false },
    lastPlayer: null,
    log: pushLog(s.log, 'sys', `Starter cut: ${starter ? cardName(starter) : '—'}. ${other(s.dealer) === 'you' ? 'You' : 'AI'} lead the play.`),
  })
  if (starter && starter.r === 11) {
    ns = award(ns, s.dealer, 2, 'his heels (Jack cut)')
  }
  return ns
}

export const cardName = (c: Card) => `${rankLabel(c.r)}${suitGlyph(c.s)}`

// ---------------------------------------------------------------------------
// THE PLAY (pegging)
// ---------------------------------------------------------------------------

/** Can `side` legally play any of their remaining cards without busting 31? */
export function canPlay(s: CribbageState, side: Side): boolean {
  return s.hands[side].some((c) => s.count + pipValue(c.r) <= 31)
}

/** Both players have exhausted their hands for this deal. */
function playOver(s: CribbageState): boolean {
  return s.hands.you.length === 0 && s.hands.ai.length === 0
}

/**
 * Play one card (index into the side's current hand). Scores pegging points, then resolves
 * any forced "go"/reset and turn passing. If neither side can continue and all cards are
 * gone, advances to the show.
 */
export function playCard(s: CribbageState, side: Side, idx: number): CribbageState {
  if (s.phase !== 'play' || s.turn !== side) return s
  const hand = s.hands[side]
  const card = hand[idx]
  if (card == null) return s
  if (s.count + pipValue(card.r) > 31) return s // illegal

  const pile = s.pile.concat([{ card, by: side }])
  const count = s.count + pipValue(card.r)
  const played = s.played.concat([{ card, by: side }])
  const newHand = hand.filter((_, i) => i !== idx)
  let ns: CribbageState = Object.assign({}, s, {
    hands: Object.assign({}, s.hands, { [side]: newHand }),
    pile, played, count,
    lastPlayer: side,
    goPlayers: { you: false, ai: false }, // a card resets outstanding "go" claims
    ply: s.ply + 1,
    log: pushLog(s.log, side === 'you' ? 'you' : 'ai', `${side === 'you' ? 'You' : 'AI'} play ${cardName(card)} (count ${count}).`),
  })

  const peg = pegPoints(pile, count)
  if (peg.total > 0) ns = award(ns, side, peg.total, peg.items.map((i) => i.label).join(', '))
  if (ns.winner != null) return ns

  // Exactly 31 → reset the count, last player keeps the lead's opponent on turn.
  if (count === 31) {
    ns = resetCount(ns, side)
  } else {
    ns = Object.assign({}, ns, { turn: other(side) })
  }
  return resolveGoOrAdvance(ns)
}

/** Reset the running count after a 31 or a closed-out "go". */
function resetCount(s: CribbageState, lastScorer: Side): CribbageState {
  return Object.assign({}, s, {
    pile: [], count: 0, goPlayers: { you: false, ai: false },
    lastPlayer: null,
    turn: other(lastScorer), // opponent of the last scorer leads the next sub-count
  })
}

/**
 * After a card or a "go", check whether the player now on turn can act. If neither
 * player can play, award the last-card point and reset; when all cards are exhausted,
 * proceed to the show.
 */
function resolveGoOrAdvance(s: CribbageState): CribbageState {
  let ns = s
  if (playOver(ns)) {
    // Last card of the deal already pegged the "go" via the 31 / go path below if needed.
    if (ns.lastPlayer != null && ns.count !== 0 && ns.count !== 31) {
      ns = award(ns, ns.lastPlayer, 1, 'last card')
      if (ns.winner != null) return ns
    }
    return enterShow(ns)
  }
  // If the player on turn can't play, see if anyone can; otherwise it's a "go".
  if (!canPlay(ns, ns.turn)) {
    const opp = other(ns.turn)
    if (canPlay(ns, opp)) {
      // current player can't, opponent can → turn passes to opponent (implicit go).
      return Object.assign({}, ns, { turn: opp })
    }
    // Neither can play and count isn't 31 → last player pegs the "go" (1), reset.
    if (ns.lastPlayer != null && ns.count !== 31) {
      ns = award(ns, ns.lastPlayer, 1, 'go')
      if (ns.winner != null) return ns
    }
    ns = resetCount(ns, ns.lastPlayer ?? ns.turn)
    // After reset, if play is over, go to show.
    if (playOver(ns)) return enterShow(ns)
    // Ensure the player now on turn can actually play; if not, pass.
    if (!canPlay(ns, ns.turn) && canPlay(ns, other(ns.turn))) {
      ns = Object.assign({}, ns, { turn: other(ns.turn) })
    }
  }
  return ns
}

// ---------------------------------------------------------------------------
// THE SHOW
// ---------------------------------------------------------------------------

function enterShow(s: CribbageState): CribbageState {
  const nd = other(s.dealer)
  const ndB = scoreHand(s.full[nd], s.starter, false)
  const dlB = scoreHand(s.full[s.dealer], s.starter, false)
  const cbB = scoreHand(s.crib, s.starter, true)
  const show: ShowResult = {
    nonDealer: { side: nd, breakdown: ndB },
    dealerHand: { side: s.dealer, breakdown: dlB },
    cribB: { side: s.dealer, breakdown: cbB },
  }
  // Award in counting order: non-dealer, dealer hand, dealer crib (respecting pegout).
  let ns: CribbageState = Object.assign({}, s, { phase: 'show' as Phase, show })
  ns = award(ns, nd, ndB.total, `${ndB.total === 0 ? 'show (nineteen)' : 'the show'}`)
  if (ns.winner != null) return ns
  ns = award(ns, s.dealer, dlB.total, `${dlB.total === 0 ? 'show (nineteen)' : 'the show'}`)
  if (ns.winner != null) return ns
  ns = award(ns, s.dealer, cbB.total, 'the crib')
  return ns
}

/** Deal the next hand (dealer alternates). Returns a 'discard'-phase state. */
export function nextHand(s: CribbageState): CribbageState {
  if (s.winner != null) return s
  const dealer = other(s.dealer)
  const d = shuffle(freshDeck())
  const you = d.slice(0, 6)
  const ai = d.slice(6, 12)
  const rest = d.slice(12)
  return Object.assign({}, s, {
    deck: rest,
    hands: { you, ai },
    full: { you: [], ai: [] },
    crib: [],
    starter: null,
    dealer,
    turn: 'you' as Side,
    pile: [], played: [], count: 0,
    goPlayers: { you: false, ai: false },
    lastPlayer: null,
    phase: 'discard' as Phase,
    show: null,
    handNo: s.handNo + 1,
    ply: s.ply + 1,
    log: pushLog(s.log, 'sys', `Hand ${s.handNo + 1} — ${dealer === 'you' ? 'you deal' : 'AI deals'}. Discard 2.`),
  })
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** Average expected value of the crib's two discards isn't simulated fully; we use a
 *  lightweight heuristic: score the kept-4 hand standalone (no starter), and bias the
 *  discard quality by whose crib it is. */
function comb2(n: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j])
  return out
}

/** A quick standalone score of 4 cards with no starter (fifteens + pairs + runs). */
function bareScore(cards: Card[]): number {
  return fifteens(cards) * 2 + pairs(cards) + runs(cards)
}

/** Crib-friendliness of two discarded cards (for the dealer, higher = better to dump
 *  into your own crib; for the non-dealer, we want LOW). Fives and adjacent/equal
 *  ranks and 15-sums help the crib. */
function cribValue(d0: Card, d1: Card): number {
  let v = 0
  if (d0.r === 5) v += 2
  if (d1.r === 5) v += 2
  if (pipValue(d0.r) + pipValue(d1.r) === 15) v += 2
  if (d0.r === d1.r) v += 2 // pair in the crib
  if (Math.abs(d0.r - d1.r) === 1) v += 1 // run potential
  if (pipValue(d0.r) === 10 || pipValue(d1.r) === 10) v += 0.5 // 10s pair with 5s for 15
  return v
}

/**
 * Heuristic discard: choose the keep-4 that maximises (expected hand score) adjusted by
 * crib ownership. Dealer slightly favours loading their own crib; non-dealer starves it.
 * Returns the two indices to discard (into the side's current 6-card hand).
 */
export function aiDiscard(s: CribbageState, side: Side): [number, number] {
  const hand = s.hands[side]
  if (hand.length < 6) return [0, 1]
  const dealerIsSide = s.dealer === side
  let best: [number, number] = [0, 1]
  let bestScore = -Infinity
  for (const [a, b] of comb2(hand.length)) {
    const keep = hand.filter((_, i) => i !== a && i !== b)
    const handPts = bareScore(keep)
    const cv = cribValue(hand[a], hand[b])
    // Dealer keeps the crib so good crib cards are a bonus; non-dealer it's the enemy's.
    const cribTerm = dealerIsSide ? cv * 0.5 : -cv * 0.5
    const score = handPts + cribTerm
    if (score > bestScore) { bestScore = score; best = [a, b] }
  }
  return best
}

/**
 * Heuristic pegging: among legal cards, prefer the play that scores the most pegging
 * points now; break ties by avoiding leaving the count at a value the opponent can
 * easily hit 15/31 from, and by saving low cards to reach 31 later. Returns the index
 * of the card to play, or -1 if the AI cannot play (a "go").
 */
export function aiPlay(s: CribbageState, side: Side): number {
  const hand = s.hands[side]
  let bestIdx = -1
  let bestVal = -Infinity
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i]
    const nc = s.count + pipValue(c.r)
    if (nc > 31) continue
    const peg = pegPoints(s.pile.concat([{ card: c, by: side }]), nc).total
    // Penalise leaving a count of 5 or 21 (opponent makes 15/31 cheaply); reward landing
    // on 31 or making 15. Slight reward for leading low cards (saving 10s for 31).
    let val = peg * 10
    if (nc === 31 || nc === 15) val += 4
    if (nc === 5 || nc === 21) val -= 3
    if (s.count === 0) val -= pipValue(c.r) * 0.1 // lead a smallish card, hold tens
    val -= pipValue(c.r) * 0.01 // tiny tiebreak: dump higher cards slightly sooner
    if (val > bestVal) { bestVal = val; bestIdx = i }
  }
  return bestIdx
}

/**
 * Single AI action step (drives useAITurn). Performs whatever the AI owes right now:
 * its discard, or its pegging card, or — when the human can't act but the AI still
 * holds turn — its plays. Returns a fresh state (or the same state if nothing to do).
 */
export function aiStep(s: CribbageState): CribbageState {
  if (s.winner != null) return s
  if (s.phase === 'discard') {
    if (s.full.ai.length === 0) {
      const idx = aiDiscard(s, 'ai')
      return discardToCrib(s, 'ai', idx)
    }
    return s
  }
  if (s.phase === 'play' && s.turn === 'ai') {
    const idx = aiPlay(s, 'ai')
    if (idx < 0) {
      // AI cannot play — register a go by advancing the engine.
      return passGo(s, 'ai')
    }
    return playCard(s, 'ai', idx)
  }
  return s
}

/** A side declares "go" (cannot play). Resolves the go/reset machinery. */
export function passGo(s: CribbageState, side: Side): CribbageState {
  if (s.phase !== 'play' || s.turn !== side) return s
  if (canPlay(s, side)) return s // not allowed to pass if a legal card exists
  // Mark and let resolve handle it: pass turn to opponent if they can play, else go.
  const goPlayers = Object.assign({}, s.goPlayers, { [side]: true })
  let ns: CribbageState = Object.assign({}, s, { goPlayers, ply: s.ply + 1, turn: other(side) })
  return resolveGoOrAdvance(ns)
}

// ---------------------------------------------------------------------------
// Helpers for the UI / driver
// ---------------------------------------------------------------------------

/** Is the AI owed an action right now (used to arm useAITurn)? */
export function aiActive(s: CribbageState): boolean {
  if (s.winner != null) return false
  if (s.phase === 'discard') return s.full.ai.length === 0
  if (s.phase === 'play') {
    if (s.turn !== 'ai') return false
    return true // either plays a card or passes a go
  }
  return false
}

/** Is the human currently blocked (can't play) so the engine should auto-pass them? */
export function youMustPass(s: CribbageState): boolean {
  return s.phase === 'play' && s.turn === 'you' && s.hands.you.length > 0 && !canPlay(s, 'you')
}
