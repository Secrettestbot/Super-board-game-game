/* BATTLE LINE — logic (built for this codebase, not ported).
   A 2-player tactical card game. Nine flags stand in a line between two players. The troop
   deck is 60 cards: 6 colours × values 1..10. Each player holds 7 troop cards. A turn = PLAY
   one troop card to your side of any flag whose side isn't already full (each flag holds 3
   cards per side — a "formation"), then DRAW a card while the deck lasts.

   A flag may be CLAIMED by whoever's formation is stronger once BOTH sides are complete, OR
   once your side is complete and you can PROVE the opponent cannot beat it with the cards still
   unseen. FORMATION RANK (high→low): Wedge (3 consecutive same colour) > Phalanx (three same
   value) > Battalion (3 same colour) > Skirmish (3 consecutive any colour) > Host (anything
   else, compare sum). Ties break by sum, then by whoever completed first.

   WIN: claim 3 ADJACENT flags (a "breakthrough") OR 5 flags total.

   Seats are 0 (you) and 1 (the AI). NOTE: seat 0 and flag index 0 are valid — never truthiness
   -test them. Immutable updates, no DOM. */

export const COLOURS = ['R', 'O', 'Y', 'G', 'B', 'P'] as const
export type Colour = typeof COLOURS[number]
export type Seat = 0 | 1
export const FLAGS = 9

export interface Card { id: number; colour: Colour; value: number } // value 1..10

export interface Flag {
  you: Card[]   // seat 0's formation (max 3)
  foe: Card[]   // seat 1's formation (max 3)
  claimedBy: Seat | null
  completed: Record<'you' | 'foe', number | null> // turn-counter when that side filled (tie-break)
}

export interface LogEntry { t: 'you' | 'ai' | 'sys'; x: string }

export interface BattleLineState {
  flags: Flag[]                 // length 9
  deck: Card[]                  // draw pile (top = end of array)
  hands: [Card[], Card[]]       // seat 0 and seat 1 hands
  turn: Seat | null
  phase: 'play' | 'draw'
  tick: number                  // monotonic action counter (drives the AI timer & tie-breaks)
  winner: Seat | null
  log: LogEntry[]
}

const sideKey = (seat: Seat): 'you' | 'foe' => (seat === 0 ? 'you' : 'foe')
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0)
const HAND_SIZE = 7

function push(log: LogEntry[], t: LogEntry['t'], x: string): LogEntry[] {
  return log.concat([{ t, x }]).slice(-24)
}

export function buildDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const colour of COLOURS) {
    for (let v = 1; v <= 10; v++) deck.push({ id: id++, colour, value: v })
  }
  return deck
}

function shuffle<T>(a: T[]): T[] {
  const arr = a.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function emptyFlags(): Flag[] {
  const flags: Flag[] = []
  for (let i = 0; i < FLAGS; i++) {
    flags.push({ you: [], foe: [], claimedBy: null, completed: { you: null, foe: null } })
  }
  return flags
}

/** makeGame(optionalDeck?) — optionalDeck is the full 60-card draw order (top = end). */
export function makeGame(optionalDeck?: Card[]): BattleLineState {
  const full = optionalDeck ? optionalDeck.slice() : shuffle(buildDeck())
  // Deal 7 to each from the top (end) of the pile so a supplied deck is read intuitively.
  const youHand = full.slice(0, HAND_SIZE)
  const aiHand = full.slice(HAND_SIZE, HAND_SIZE * 2)
  const deck = full.slice(HAND_SIZE * 2)
  return {
    flags: emptyFlags(),
    deck,
    hands: [youHand, aiHand],
    turn: 0,
    phase: 'play',
    tick: 0,
    winner: null,
    log: [{ t: 'sys', x: 'Play a troop to a flag, then draw. Claim three adjacent flags — or five total — to break the line.' }],
  }
}

// ===== Formation ranking =====
// Category: 5 = Wedge (straight flush), 4 = Phalanx (trips), 3 = Battalion (flush),
//           2 = Skirmish (straight), 1 = Host (nothing). Compare category, then sum.

export const CATEGORY_NAME = ['—', 'Host', 'Skirmish', 'Battalion', 'Phalanx', 'Wedge'] as const

function sortVals(cards: Card[]): number[] {
  return cards.map(c => c.value).sort((a, b) => a - b)
}
function isSameColour(cards: Card[]): boolean {
  return cards.every(c => c.colour === cards[0].colour)
}
function isConsecutive(vals: number[]): boolean {
  // vals already sorted ascending, length 3, distinct & contiguous
  return vals[0] + 1 === vals[1] && vals[1] + 1 === vals[2]
}
function isSameValue(vals: number[]): boolean {
  return vals[0] === vals[1] && vals[1] === vals[2]
}

export function formationSum(cards: Card[]): number {
  let n = 0
  for (const c of cards) n += c.value
  return n
}

/** Category 1..5 for a COMPLETE three-card formation. */
export function formationCategory(cards: Card[]): number {
  const vals = sortVals(cards)
  const flush = isSameColour(cards)
  const run = isConsecutive(vals)
  if (flush && run) return 5  // Wedge
  if (isSameValue(vals)) return 4  // Phalanx
  if (flush) return 3  // Battalion
  if (run) return 2  // Skirmish
  return 1  // Host
}

export interface Rank { category: number; sum: number }

/** formationRank(threeCards): comparable rank for a complete formation. */
export function formationRank(cards: Card[]): Rank {
  return { category: formationCategory(cards), sum: formationSum(cards) }
}

/** Compare two complete formations ignoring tie-break-by-completion. >0 means a beats b. */
export function compareRank(a: Rank, b: Rank): number {
  if (a.category !== b.category) return a.category - b.category
  return a.sum - b.sum
}

// ===== Legal plays =====

export function flagSideFull(flag: Flag, seat: Seat): boolean {
  return flag[sideKey(seat)].length >= 3
}

/** Flag indices where `seat` can legally play (side not full, flag unclaimed). */
export function legalPlays(s: BattleLineState, seat: Seat): number[] {
  const out: number[] = []
  for (let i = 0; i < s.flags.length; i++) {
    const f = s.flags[i]
    if (f.claimedBy == null && !flagSideFull(f, seat)) out.push(i)
  }
  return out
}

// ===== Actions ===== (all return a new state; illegal => unchanged)

function replaceFlag(flags: Flag[], idx: number, flag: Flag): Flag[] {
  const out = flags.slice()
  out[idx] = flag
  return out
}

const COLNAME: Record<Colour, string> = { R: 'Red', O: 'Orange', Y: 'Yellow', G: 'Green', B: 'Blue', P: 'Purple' }
const label = (c: Card) => `${COLNAME[c.colour]} ${c.value}`
const who = (seat: Seat) => (seat === 0 ? 'You' : 'The enemy')

/** playCard(s, seat, card, flagIndex) — place one troop on a flag's side, then enter draw phase. */
export function playCard(s: BattleLineState, seat: Seat, card: Card, flagIndex: number): BattleLineState {
  if (s.winner != null || s.turn !== seat || s.phase !== 'play') return s
  if (flagIndex < 0 || flagIndex >= s.flags.length) return s
  const flag = s.flags[flagIndex]
  if (flag.claimedBy != null || flagSideFull(flag, seat)) return s
  const hand = s.hands[seat]
  const inHand = hand.find(c => c.id === card.id)
  if (!inHand) return s

  const key = sideKey(seat)
  const newSide = flag[key].concat([inHand])
  const completed = { ...flag.completed }
  if (newSide.length === 3 && completed[key] == null) completed[key] = s.tick
  const newFlag: Flag = { ...flag, [key]: newSide, completed }

  const flags = replaceFlag(s.flags, flagIndex, newFlag)
  const newHand = hand.filter(c => c.id !== card.id)
  const hands: [Card[], Card[]] = seat === 0 ? [newHand, s.hands[1]] : [s.hands[0], newHand]
  const log = push(s.log, seat === 0 ? 'you' : 'ai', `${who(seat)} played ${label(inHand)} to flag ${flagIndex + 1}.`)
  return { ...s, flags, hands, phase: 'draw', tick: s.tick + 1, log }
}

/** drawCard(s, seat) — draw if the deck has cards (hand may exceed 7 only transiently? no: draw
   refills to keep play going), then pass the turn. If the deck is empty, just pass the turn. */
export function drawCard(s: BattleLineState, seat: Seat): BattleLineState {
  if (s.winner != null || s.turn !== seat) return s
  // Normally draw follows a play. But if it's still the play phase and the seat has NO legal
  // play (every unclaimed flag-side is full), the play step is forfeit and we draw anyway so the
  // turn can't deadlock.
  if (s.phase === 'play' && legalPlays(s, seat).length > 0) return s
  let deck = s.deck
  let hands = s.hands
  let log = s.log
  if (deck.length > 0) {
    deck = deck.slice()
    const card = deck.pop()!
    const newHand = s.hands[seat].concat([card])
    hands = seat === 0 ? [newHand, s.hands[1]] : [s.hands[0], newHand]
    log = push(log, 'sys', `${who(seat)} drew a card.`)
  }
  const t: BattleLineState = { ...s, deck, hands, turn: other(seat), phase: 'play', tick: s.tick + 1, log }
  return endIfStuck(t)
}

// ===== Claiming =====

// All 60 cards minus everything visible (on flags) minus the claimant's known hand are the
// cards the OPPONENT could still draw/hold. We use those to test whether the opponent could
// possibly complete a formation that beats ours on the contested flag.

function seenCardKeys(s: BattleLineState): Set<number> {
  const seen = new Set<number>()
  for (const f of s.flags) {
    for (const c of f.you) seen.add(c.id)
    for (const c of f.foe) seen.add(c.id)
  }
  return seen
}

/** Cards the OPPONENT of `seat` could still place: full deck minus all cards on the table minus
   the cards in `seat`'s own hand (the claimant knows their own hand; the rest are unseen). */
function unseenForOpponent(s: BattleLineState, seat: Seat): Card[] {
  const seen = seenCardKeys(s)
  for (const c of s.hands[seat]) seen.add(c.id)
  return buildDeck().filter(c => !seen.has(c.id))
}

/** Best complete formation rank reachable by extending `partial` (0..3 cards) with `need` cards
   drawn from `pool` (no repeats). Returns the maximal Rank, or null if impossible. */
function bestReachableRank(partial: Card[], pool: Card[]): Rank | null {
  const need = 3 - partial.length
  if (need <= 0) return formationRank(partial)
  if (pool.length < need) return null
  let best: Rank | null = null
  // Enumerate combinations of `need` cards from pool. Pools here are <= ~40, need <= 3 —
  // bounded and small enough; but to stay cheap we prune: the max sum / category come from a
  // modest search. We do a full combination search (n choose k, k<=3) which is fine.
  const n = pool.length
  if (need === 1) {
    for (let i = 0; i < n; i++) {
      const r = formationRank(partial.concat([pool[i]]))
      if (best == null || compareRank(r, best) > 0) best = r
    }
  } else if (need === 2) {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const r = formationRank(partial.concat([pool[i], pool[j]]))
        if (best == null || compareRank(r, best) > 0) best = r
      }
  } else {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) {
          const r = formationRank(partial.concat([pool[i], pool[j], pool[k]]))
          if (best == null || compareRank(r, best) > 0) best = r
        }
  }
  return best
}

/**
 * canClaim(s, flagIndex, seat): may `seat` claim this flag now?
 *  - Flag must be unclaimed and the claimant's side must be COMPLETE (3 cards).
 *  - If the opponent's side is also complete: claimant wins iff their formation beats the
 *    opponent's (compareRank > 0, or equal-rank-and-claimant-completed-no-later).
 *  - If the opponent's side is incomplete: claimant may claim ONLY if the opponent CANNOT, with
 *    any combination of still-unseen cards, build a formation that beats the claimant's.
 */
export function canClaim(s: BattleLineState, flagIndex: number, seat: Seat): boolean {
  if (flagIndex < 0 || flagIndex >= s.flags.length) return false
  const flag = s.flags[flagIndex]
  if (flag.claimedBy != null) return false
  const myKey = sideKey(seat)
  const oppSeat = other(seat)
  const oppKey = sideKey(oppSeat)
  const mine = flag[myKey]
  if (mine.length !== 3) return false
  const myRank = formationRank(mine)
  const opp = flag[oppKey]

  if (opp.length === 3) {
    const oppRank = formationRank(opp)
    const cmp = compareRank(myRank, oppRank)
    if (cmp > 0) return true
    if (cmp < 0) return false
    // exact tie on category+sum -> whoever completed first wins; null completed sorts last.
    const myC = flag.completed[myKey]
    const opC = flag.completed[oppKey]
    if (myC == null) return false
    if (opC == null) return true
    return myC <= opC
  }

  // Opponent incomplete: prove they can't beat us with unseen cards.
  const pool = unseenForOpponent(s, seat)
  const oppBest = bestReachableRank(opp, pool)
  if (oppBest == null) return true // opponent literally cannot complete -> we win
  // Opponent's best possible must NOT beat us. On an exact tie of best-possible vs ours, the
  // opponent hasn't completed yet, so we (already complete) win the tie -> still claimable.
  return compareRank(oppBest, myRank) <= 0
}

/** claimFlag(s, flagIndex, seat): claim if legal; recompute winner. */
export function claimFlag(s: BattleLineState, flagIndex: number, seat: Seat): BattleLineState {
  if (s.winner != null) return s
  if (!canClaim(s, flagIndex, seat)) return s
  const flag = { ...s.flags[flagIndex], claimedBy: seat }
  const flags = replaceFlag(s.flags, flagIndex, flag)
  const log = push(s.log, seat === 0 ? 'you' : 'ai', `${who(seat)} claimed flag ${flagIndex + 1}.`)
  const t: BattleLineState = { ...s, flags, log }
  return checkWin(t)
}

// ===== Win detection =====

/** checkWin: 3 ADJACENT claimed flags, or 5 total, by a seat. Sets winner if found. */
export function checkWin(s: BattleLineState): BattleLineState {
  if (s.winner != null) return s
  for (const seat of [0, 1] as Seat[]) {
    let total = 0
    let run = 0
    let breakthrough = false
    for (let i = 0; i < s.flags.length; i++) {
      if (s.flags[i].claimedBy === seat) {
        total++
        run++
        if (run >= 3) breakthrough = true
      } else {
        run = 0
      }
    }
    if (breakthrough || total >= 5) {
      const reason = breakthrough ? 'a three-flag breakthrough' : 'five flags'
      return { ...s, winner: seat, turn: null, log: push(s.log, seat === 0 ? 'you' : 'ai', `${who(seat)} wins with ${reason}!`) }
    }
  }
  return s
}

// If the deck is empty and NO legal play remains for either side (so the game can no longer
// progress), force-resolve every claimable flag then settle remaining decided flags so the game
// can't deadlock. Note: remaining hand cards can be unplayable when every open flag-side is full.
function endIfStuck(s: BattleLineState): BattleLineState {
  if (s.deck.length > 0) return s
  if (legalPlays(s, 0).length > 0 || legalPlays(s, 1).length > 0) return s
  let t = s
  // Repeatedly resolve any flag that is now provably claimable by either side.
  let progressed = true
  while (progressed && t.winner == null) {
    progressed = false
    for (let i = 0; i < t.flags.length; i++) {
      if (t.flags[i].claimedBy != null) continue
      for (const seat of [0, 1] as Seat[]) {
        if (canClaim(t, i, seat)) {
          t = claimFlag(t, i, seat)
          progressed = true
          break
        }
      }
      if (t.winner != null) break
    }
  }
  return t
}

// ===== AI ===== (seat 1; heuristic — fast)
// Strategy:
//  1. If any flag is claimable right now, claim the most valuable (prefer ones that complete a
//     breakthrough / reach 5).
//  2. Otherwise PLAY: for every (card, flag) pair, score how much it strengthens a non-full
//     flag, preferring flags adjacent to ones it already leads / has claimed (build runs of 3),
//     and preferring to contest flags where the opponent is close to a strong formation.
//  3. DRAW from the deck.

// Heuristic "strength" of a (possibly partial) own formation: rewards same-colour, runs and
// pairs so the AI funnels matching cards together; adds the raw sum.
function partialStrength(cards: Card[]): number {
  if (cards.length === 0) return 0
  const sum = formationSum(cards)
  let bonus = 0
  const flush = isSameColour(cards)
  if (flush) bonus += 14
  const vals = cards.map(c => c.value).sort((a, b) => a - b)
  // run-ish: distinct & spanning a window of <=2 between neighbours
  let runish = true
  const distinct = new Set(vals).size === vals.length
  for (let i = 1; i < vals.length; i++) if (vals[i] - vals[i - 1] > 2) runish = false
  if (distinct && runish && vals.length >= 2) bonus += 10
  // pair / trips of equal value
  const counts: Record<number, number> = {}
  let maxSame = 1
  for (const v of vals) { counts[v] = (counts[v] || 0) + 1; if (counts[v] > maxSame) maxSame = counts[v] }
  if (maxSame >= 2) bonus += 8 * (maxSame - 1)
  if (flush && distinct && runish) bonus += 16 // wedge potential
  return sum + bonus
}

function aiBestClaim(s: BattleLineState): number | null {
  const claimable: number[] = []
  for (let i = 0; i < s.flags.length; i++) {
    if (s.flags[i].claimedBy == null && canClaim(s, i, 1)) claimable.push(i)
  }
  if (claimable.length === 0) return null
  // Prefer a claim that wins the game, then one that extends a run of AI flags.
  let best = claimable[0]
  let bestScore = -1
  for (const i of claimable) {
    const probe = claimFlag(s, i, 1)
    let score = 0
    if (probe.winner === 1) score += 1000
    // adjacency bonus: neighbours already AI-claimed
    if (i > 0 && s.flags[i - 1].claimedBy === 1) score += 10
    if (i < s.flags.length - 1 && s.flags[i + 1].claimedBy === 1) score += 10
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

interface AIMove { card: Card; flag: number; score: number }

function aiBestPlay(s: BattleLineState): AIMove | null {
  const seat: Seat = 1
  const hand = s.hands[seat]
  const targets = legalPlays(s, seat)
  if (hand.length === 0 || targets.length === 0) return null
  let best: AIMove | null = null
  for (const card of hand) {
    for (const fi of targets) {
      const flag = s.flags[fi]
      const before = partialStrength(flag.foe)
      const after = partialStrength(flag.foe.concat([card]))
      let score = after - before
      // Bias toward flags adjacent to flags the AI already leads/claims (build breakthroughs).
      if (fi > 0 && (s.flags[fi - 1].claimedBy === 1)) score += 6
      if (fi < s.flags.length - 1 && (s.flags[fi + 1].claimedBy === 1)) score += 6
      // Block: if the opponent's side here is strong and near-complete, value adding pressure.
      if (flag.you.length === 2) score += partialStrength(flag.you) * 0.15
      // Finishing a formation (reaching 3) is worth more.
      if (flag.foe.length === 2) score += 12
      if (best == null || score > best.score) best = { card, flag: fi, score }
    }
  }
  return best
}

/** aiTurn(s): performs ONE atomic AI action (claim, or play+draw) and returns the new state.
   It does NOT loop the whole turn — the UI drives it via tick so each action animates. */
export function aiTurn(s: BattleLineState): BattleLineState {
  if (s.winner != null) return s
  // The AI may claim on either phase of its turn; allow a claim whenever it's seat 1's turn.
  if (s.turn !== 1) return s

  // 1. Claim if profitable (only during the play phase so we don't stall the draw).
  if (s.phase === 'play') {
    const claimIdx = aiBestClaim(s)
    if (claimIdx != null) return claimFlag(s, claimIdx, 1)

    // 2. Otherwise play a card.
    const move = aiBestPlay(s)
    if (move != null) return playCard(s, 1, move.card, move.flag)

    // No legal play (all flags full / hand empty): just draw to pass the turn.
    return drawCard(s, 1)
  }

  // 3. Draw phase: draw and pass.
  if (s.phase === 'draw') return drawCard(s, 1)
  return s
}

// ===== Convenience for UI =====

export function flagCount(s: BattleLineState, seat: Seat): number {
  let n = 0
  for (const f of s.flags) if (f.claimedBy === seat) n++
  return n
}

export { COLNAME, sideKey, other }
