/* HANAMIKOJI — pure logic (immutable, no DOM).
   You (player 0) and the AI (player 1) court the favor of 7 geisha by playing item cards.
   7 geisha with charm 2,2,2,3,3,4,5 (one each). 21 item cards: for each geisha, a number of
   item cards equal to its charm (2+2+2+3+3+4+5 = 21). Each ROUND: shuffle the 21 items, REMOVE
   one face-down (unseen), deal 6 to each player. Each player has FOUR action markers used once
   each per round, alternating turns:
     - SECRET    : place 1 card face-down; revealed & applied to your side at round end.
     - TRADEOFF  : discard 2 cards face-down (removed from the round).
     - GIFT      : reveal 3 cards; opponent keeps 1 (their side), other 2 go to your side.
     - COMPETITION: reveal 2 pairs (4 cards); opponent keeps 1 pair, the other pair is yours.
   After both players spend all 4 markers, each geisha compares placed cards: more cards wins the
   favor (charm) token; a tie leaves the token where it was (carry / unowned). WIN immediately on
   4+ geisha or 11+ charm. Otherwise play more rounds (alternate starter), carrying favors. */

export type Player = 0 | 1               // 0 = you, 1 = AI
export type Geisha = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type Marker = 'secret' | 'tradeoff' | 'gift' | 'competition'

export const MARKERS: Marker[] = ['secret', 'tradeoff', 'gift', 'competition']
export const GEISHA_COUNT = 7
// charm value of each geisha (also = number of item cards of that geisha's type)
export const CHARM: number[] = [2, 2, 2, 3, 3, 4, 5]
export const TOTAL_CHARM = CHARM.reduce((a, b) => a + b, 0)   // 21 — also the number of item cards
export const WIN_GEISHA = 4
export const WIN_CHARM = 11

// Geisha display names (cohesive Kyoto theme).
export const GEISHA_NAMES = ['Tea', 'Sake', 'Koto', 'Fan', 'Umbrella', 'Brush', 'Crane']

export interface PendingChoice {
  kind: 'gift' | 'competition'
  by: Player                  // the player who revealed (the giver)
  chooser: Player             // the player who must choose (the opponent of `by`)
  // gift: three single cards (geisha ids). competition: two pairs (each pair an array of geisha ids).
  options: Geisha[][]         // gift -> [[g],[g],[g]]; competition -> [[g,g],[g,g]]
}

export interface LogEntry { t: string; x: string }   // t: 'you' | 'ai' | 'sys'

export interface HanamikojiState {
  hands: Geisha[][]                  // hands[0] = you, hands[1] = AI
  deck: Geisha[]                     // draw pile (8 cards) — each player draws 1 at the start of each turn
  // placed[player][geisha] = count of that player's item cards on that geisha this round
  placed: number[][]                 // [2][7]
  secret: (Geisha | null)[]          // secret[player] = the card hidden under the secret marker (null = none/unused)
  used: Record<Marker, boolean>[]    // used[player][marker]
  favor: (Player | null)[]           // favor[geisha] = current owner (carries across rounds), null = unowned
  removed: Geisha | null             // the face-down removed card this round (unseen by players)
  turn: Player | null                // whose turn to take an action (null when a choice pends or round/game over)
  pending: PendingChoice | null      // an opponent-choice awaiting resolution
  round: number
  starter: Player                    // who started this round
  roundOver: boolean
  winner: Player | null              // game winner
  log: LogEntry[]
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-40) }
const who = (p: Player) => p === 0 ? 'You' : 'The AI'
const tag = (p: Player) => p === 0 ? 'you' : 'ai'
const opp = (p: Player): Player => (p === 0 ? 1 : 0) as Player

export function fullDeck(): Geisha[] {
  const d: Geisha[] = []
  for (let g = 0 as Geisha; g < GEISHA_COUNT; g = (g + 1) as Geisha) {
    for (let i = 0; i < CHARM[g]; i++) d.push(g)
  }
  return d
}

export function shuffle<T>(a: T[]): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function freshUsed(): Record<Marker, boolean> {
  return { secret: false, tradeoff: false, gift: false, competition: false }
}

// The player whose turn it now is (s.turn) draws 1 card from the draw pile (if any remain).
// Called at the start of every turn so 6 dealt + 4 drawn = 10 cards covers 1+2+3+4 placements.
function drawForTurn(s: HanamikojiState): HanamikojiState {
  if (s.turn == null || s.deck.length === 0) return s
  const deck = s.deck.slice()
  const card = deck.pop()!
  const hands = s.hands.map(h => h.slice())
  hands[s.turn].push(card)
  return Object.assign({}, s, { deck, hands })
}

// Begin a fresh round from a deck (already 21 cards). `starter` acts first.
function startRound(
  deck: Geisha[],
  favor: (Player | null)[],
  starter: Player,
  round: number,
  log: LogEntry[],
): HanamikojiState {
  const d = deck.slice()
  const removed = d.pop()!                       // ONE card removed face-down, unseen
  const hands: Geisha[][] = [d.slice(0, 6), d.slice(6, 12)]
  const draw = d.slice(12)                        // remaining 8 cards — drawn 1/turn over the round
  const base: HanamikojiState = {
    hands,
    deck: draw,
    placed: [Array(GEISHA_COUNT).fill(0), Array(GEISHA_COUNT).fill(0)],
    secret: [null, null],
    used: [freshUsed(), freshUsed()],
    favor: favor.slice(),
    removed,
    turn: starter,
    pending: null,
    round,
    starter,
    roundOver: false,
    winner: null,
    log: push(log, 'sys', `Round ${round} — ${starter === 0 ? 'you act' : 'the AI acts'} first.`),
  }
  return drawForTurn(base)                        // starter draws their first card
}

/** Create a new game. Pass an optional 21-card deck for deterministic tests. */
export function makeGame(deck?: Geisha[]): HanamikojiState {
  const d = deck ? deck.slice() : shuffle(fullDeck())
  const log = push([], 'sys', 'Win the favor of the geisha — control 4 of them or 11 charm.')
  return startRound(d, Array(GEISHA_COUNT).fill(null), 0, 1, log)
}

// Remove one instance of value v from arr; returns a new array.
function removeOne<T>(arr: T[], v: T): T[] {
  const i = arr.indexOf(v)
  const r = arr.slice()
  if (i >= 0) r.splice(i, 1)
  return r
}

function allMarkersUsed(s: HanamikojiState): boolean {
  for (const p of [0, 1] as Player[]) for (const m of MARKERS) if (!s.used[p][m]) return false
  return true
}

// Advance the turn to the other player after an action fully resolves (no pending choice).
function nextTurn(s: HanamikojiState): HanamikojiState {
  if (allMarkersUsed(s)) return resolveRound(s)
  // The other player acts next and draws a card for their turn.
  const next = opp(s.turn as Player)
  return drawForTurn(Object.assign({}, s, { turn: next }))
}

/* ---------------- actions ---------------- */
// Each returns a new state. The acting player is always s.turn.

export function secret(s: HanamikojiState, card: Geisha): HanamikojiState {
  if (s.winner !== null || s.roundOver || s.pending !== null || s.turn === null) return s
  const p = s.turn
  if (s.used[p].secret || !s.hands[p].includes(card)) return s
  const hands = s.hands.map(h => h.slice()); hands[p] = removeOne(hands[p], card)
  const used = s.used.map(u => ({ ...u })); used[p].secret = true
  const sec = s.secret.slice(); sec[p] = card
  const log = push(s.log, tag(p), `${who(p)} hide${p === 0 ? '' : 's'} a card in secret.`)
  return nextTurn(Object.assign({}, s, { hands, used, secret: sec, log }))
}

export function tradeoff(s: HanamikojiState, cards: Geisha[]): HanamikojiState {
  if (s.winner !== null || s.roundOver || s.pending !== null || s.turn === null) return s
  const p = s.turn
  if (s.used[p].tradeoff || cards.length !== 2) return s
  let hand = s.hands[p].slice()
  for (const c of cards) {
    if (!hand.includes(c)) return s
    hand = removeOne(hand, c)
  }
  const hands = s.hands.map(h => h.slice()); hands[p] = hand
  const used = s.used.map(u => ({ ...u })); used[p].tradeoff = true
  const log = push(s.log, tag(p), `${who(p)} discard${p === 0 ? '' : 's'} 2 cards from the round.`)
  return nextTurn(Object.assign({}, s, { hands, used, log }))
}

export function gift(s: HanamikojiState, cards: Geisha[]): HanamikojiState {
  if (s.winner !== null || s.roundOver || s.pending !== null || s.turn === null) return s
  const p = s.turn
  if (s.used[p].gift || cards.length !== 3) return s
  let hand = s.hands[p].slice()
  for (const c of cards) { if (!hand.includes(c)) return s; hand = removeOne(hand, c) }
  const hands = s.hands.map(h => h.slice()); hands[p] = hand
  const used = s.used.map(u => ({ ...u })); used[p].gift = true
  const log = push(s.log, tag(p), `${who(p)} offer${p === 0 ? '' : 's'} 3 cards as a gift.`)
  const pending: PendingChoice = { kind: 'gift', by: p, chooser: opp(p), options: cards.map(c => [c]) }
  return Object.assign({}, s, { hands, used, log, pending, turn: null })
}

export function competition(s: HanamikojiState, pairs: Geisha[][]): HanamikojiState {
  if (s.winner !== null || s.roundOver || s.pending !== null || s.turn === null) return s
  const p = s.turn
  if (s.used[p].competition || pairs.length !== 2 || pairs.some(pr => pr.length !== 2)) return s
  let hand = s.hands[p].slice()
  for (const pr of pairs) for (const c of pr) { if (!hand.includes(c)) return s; hand = removeOne(hand, c) }
  const hands = s.hands.map(h => h.slice()); hands[p] = hand
  const used = s.used.map(u => ({ ...u })); used[p].competition = true
  const log = push(s.log, tag(p), `${who(p)} stage${p === 0 ? '' : 's'} a competition of 2 pairs.`)
  const pending: PendingChoice = { kind: 'competition', by: p, chooser: opp(p), options: pairs.map(pr => pr.slice()) }
  return Object.assign({}, s, { hands, used, log, pending, turn: null })
}

/* opponent resolves the pending gift/competition.
   choiceIndex selects which option (in s.pending.options) the CHOOSER takes for THEIR side.
   The remaining option(s) go to the giver's side. */
export function opponentChoose(s: HanamikojiState, choiceIndex: number): HanamikojiState {
  const pc = s.pending
  if (pc == null || s.winner !== null || s.roundOver) return s
  if (choiceIndex < 0 || choiceIndex >= pc.options.length) return s
  const chooser = pc.chooser, giver = pc.by
  const placed = s.placed.map(row => row.slice())
  pc.options.forEach((opt, i) => {
    const dest = i === choiceIndex ? chooser : giver
    for (const g of opt) placed[dest][g]++
  })
  const tookCards = pc.options[choiceIndex]
  const log = push(
    s.log,
    tag(chooser),
    `${who(chooser)} take${chooser === 0 ? '' : 's'} ${pc.kind === 'gift' ? '1 card' : 'a pair'} (${tookCards.map(g => GEISHA_NAMES[g]).join(', ')}).`,
  )
  // After a reveal resolves, it's the GIVER's opponent's... no: turn passes to the giver's opponent
  // i.e. the chooser becomes the actor IF they still have markers; alternation: next actor = chooser.
  const base = Object.assign({}, s, { placed, pending: null, log, turn: null as Player | null })
  if (allMarkersUsed(base)) return resolveRound(base)
  // Standard alternation: the giver just took their turn, so the chooser acts next and draws.
  return drawForTurn(Object.assign({}, base, { turn: chooser }))
}

/* ---------------- round resolution & win check ---------------- */

// Apply secrets, compare each geisha, update favor, check win.
export function resolveRound(s: HanamikojiState): HanamikojiState {
  const placed = s.placed.map(row => row.slice())
  for (const p of [0, 1] as Player[]) {
    const sec = s.secret[p]
    if (sec != null) placed[p][sec]++
  }
  const favor = s.favor.slice()
  let log = push(s.log, 'sys', 'Round end — secrets revealed; comparing favor.')
  for (let g = 0 as Geisha; g < GEISHA_COUNT; g = (g + 1) as Geisha) {
    const a = placed[0][g], b = placed[1][g]
    if (a > b) favor[g] = 0
    else if (b > a) favor[g] = 1
    // tie: favor[g] unchanged (carries / stays unowned)
  }
  const w = checkWinner(favor)
  let st = Object.assign({}, s, { placed, favor, roundOver: true, turn: null as Player | null, log })
  if (w != null) {
    log = push(st.log, tag(w), `${who(w)} win${w === 0 ? '' : 's'} the game!`)
    st = Object.assign({}, st, { winner: w, log })
  }
  return st
}

// Tally charm & geisha controlled for a player given favor ownership.
export function tally(favor: (Player | null)[], p: Player): { geisha: number; charm: number } {
  let geisha = 0, charm = 0
  for (let g = 0; g < GEISHA_COUNT; g++) {
    if (favor[g] === p) { geisha++; charm += CHARM[g] }
  }
  return { geisha, charm }
}

// Win if a player controls >=4 geisha or >=11 charm. Returns the player or null.
export function checkWinner(favor: (Player | null)[]): Player | null {
  for (const p of [0, 1] as Player[]) {
    const t = tally(favor, p)
    if (t.geisha >= WIN_GEISHA || t.charm >= WIN_CHARM) return p
  }
  return null
}

// Start the next round (loser of geisha-count, or alternate starter). Carries favor.
export function nextRound(s: HanamikojiState): HanamikojiState {
  if (s.winner !== null) return s
  const starter = opp(s.starter)
  const deck = shuffle(fullDeck())
  return startRound(deck, s.favor, starter, s.round + 1, s.log)
}

/* ===================== AI ===================== */
// Heuristic value of a geisha: higher charm and ones the AI can flip/secure are worth more.
function geishaWeight(s: HanamikojiState, me: Player, g: Geisha): number {
  // base = charm. Bonus if currently not owned by me (contestable / gain), small bonus near control.
  let w = CHARM[g] * 10
  if (s.favor[g] === me) w += 4           // defend what we hold
  else if (s.favor[g] === null) w += 6    // unowned is easiest to grab
  else w += 2                             // contested
  return w
}

// Group the AI's hand by geisha.
function groupHand(hand: Geisha[]): Map<Geisha, number> {
  const m = new Map<Geisha, number>()
  for (const c of hand) m.set(c, (m.get(c) ?? 0) + 1)
  return m
}

/** The AI takes ONE action (uses one unused marker). Returns a new state.
    Strategy: secure high-charm geisha; secret a key card; trade off low-value duplicates;
    gift/competition splits revealed so the worse half is what the opponent is steered toward. */
export function aiAction(s: HanamikojiState): HanamikojiState {
  if (s.winner !== null || s.roundOver || s.pending !== null || s.turn !== 1) return s
  const me: Player = 1
  const hand = s.hands[me]
  const u = s.used[me]
  const grp = groupHand(hand)
  // Sort the AI's distinct geisha by weight (desc).
  const distinct = Array.from(grp.keys()).sort((a, b) => geishaWeight(s, me, b) - geishaWeight(s, me, a))
  const low = (g: Geisha) => CHARM[g]   // smaller charm = lower value

  // Card-budget rule: cards needed by still-unused markers must not exceed what's left after this
  // action. The cheapest safe schedule spends the BIGGEST requirement first (competition 4, gift 3,
  // tradeoff 2, secret 1) while the hand is largest. We pick the costliest affordable marker so the
  // remaining markers always fit. Strategy lives in WHICH cards we choose for that marker.
  const pick = chooseMarker(u, hand.length)

  if (pick === 'competition') {
    // Pair our cards so whichever pair the opponent takes, we keep a useful one. Sort by value and
    // pair best+worst / 2nd-best+3rd so the two pairs are balanced (we win value either way).
    const sorted = hand.slice().sort((a, b) => geishaWeight(s, me, b) - geishaWeight(s, me, a))
    const pairA: Geisha[] = [sorted[0], sorted[3]]
    const pairB: Geisha[] = [sorted[1], sorted[2]]
    return competition(s, [pairA, pairB])
  }
  if (pick === 'gift') {
    // Reveal our 3 LEAST valuable; opponent grabs the best of these, we keep 2 — minimal loss.
    const sorted = hand.slice().sort((a, b) => geishaWeight(s, me, a) - geishaWeight(s, me, b))
    return gift(s, [sorted[0], sorted[1], sorted[2]])
  }
  if (pick === 'tradeoff') {
    // Discard our two lowest-charm cards (least useful to keep).
    const byLow = hand.slice().sort((a, b) => low(a) - low(b))
    return tradeoff(s, [byLow[0], byLow[1]])
  }
  // secret: lock in our single most valuable card (highest-charm geisha we want to win).
  return secret(s, distinct[0])
}

// Cards each marker costs.
export const MARKER_COST: Record<Marker, number> = { competition: 4, gift: 3, tradeoff: 2, secret: 1 }

// Decide which unused marker to spend now. Each turn a player draws 1 card, so over 4 turns they
// have exactly 6+4 = 10 cards for the 1+2+3+4 = 10 marker costs. Spending the costliest AFFORDABLE
// marker first (while the hand is largest) keeps the schedule feasible for the remaining turns.
export function chooseMarker(u: Record<Marker, boolean>, handLen: number): Marker {
  const order: Marker[] = ['competition', 'gift', 'tradeoff', 'secret']  // costliest first
  const unused = order.filter(m => !u[m])
  for (const m of unused) if (handLen >= MARKER_COST[m]) return m
  return unused[unused.length - 1]
}

/** The AI resolves a pending choice on YOUR gift/competition — picks the option better for it. */
export function aiChoose(s: HanamikojiState): HanamikojiState {
  const pc = s.pending
  if (pc == null || pc.chooser !== 1 || s.winner !== null) return s
  const me: Player = 1
  // Value each option as a target for OUR side; pick the most valuable to take.
  let best = 0, bestVal = -Infinity
  pc.options.forEach((opt, i) => {
    let v = 0
    for (const g of opt) v += geishaWeight(s, me, g)
    if (v > bestVal) { bestVal = v; best = i }
  })
  return opponentChoose(s, best)
}
