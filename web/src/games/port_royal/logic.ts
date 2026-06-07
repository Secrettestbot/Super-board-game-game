/* PORT ROYAL — push-your-luck card logic (built for this codebase, not ported).
   Three players (you = 0, AI = 1, 2). A harbor deck of cards:
     SHIPS  — one of 5 colors, each worth some COINS, some carry a SWORD value.
     PERSONS — cost coins to HIRE, give INFLUENCE points + a person SYMBOL (used by expeditions).
     EXPEDITIONS — sit in a face-up row; claim by holding the required person symbols, big influence.
   The active player ("discoverer") flips cards one at a time into the HARBOR; they may STOP
   anytime. BUST if a flipped ship matches the color of a ship already in the harbor — the turn
   ends, the harbor is discarded, nobody takes anything. On a clean STOP the discoverer takes
   ONE harbor card (ship for coins / hire a person paying coins). Then, in turn order, each OTHER
   player may take ONE harbor card too, paying the discoverer 1 coin for the privilege. Leftover
   harbor cards are discarded. Game-end trigger: a player reaches >= 12 INFLUENCE — finish the
   round (every player after the discoverer still gets their turn), then most influence wins.

   Randomness is injectable: flip(s, rng?) takes an optional 0..1 source so tests are deterministic. */

export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'black'
export type Kind = 'ship' | 'person' | 'expedition'
export type PersonSym = 'sailor' | 'captain' | 'priest' | 'jester' | 'settler' | 'governor'

export interface Card {
  id: number
  kind: Kind
  // ship
  color?: Color
  coins?: number        // coins a ship is worth (when taken as a ship)
  swords?: number       // sword/attack value on a ship
  // person
  cost?: number         // coins to hire a person
  influence?: number    // victory influence the card grants
  sym?: PersonSym       // the person symbol this card provides
  // expedition
  needs?: PersonSym[]   // symbols required to claim
  name: string
}

export type Phase =
  | 'discover'   // discoverer is flipping / may stop
  | 'trade'      // discoverer took their card; other players take in turn order
  | 'done'       // game over

export interface PlayerState {
  coins: number          // coin cards in hand (we track a count, plus a few ship-coin reserves)
  ships: Card[]          // ships taken (for swords / flavour)
  persons: Card[]        // persons hired (give influence + symbols)
  expeditions: Card[]    // expeditions claimed
  influence: number      // total victory influence (persons + expeditions + ship trophies)
}

export interface LogEntry { t: string; x: string }

export interface PortState {
  deck: Card[]                 // face-down draw pile (next flip is deck[deck.length-1])
  harbor: Card[]               // face-up cards flipped this turn
  discard: Card[]              // discarded cards (reshuffled into the deck when it runs dry)
  expeditionRow: Card[]        // face-up expeditions available to claim
  players: PlayerState[]       // index 0 = you, 1 & 2 = AI
  discoverer: number           // whose turn it is to flip / lead
  current: number              // in trade phase: which player is currently deciding
  phase: Phase
  busted: boolean              // the just-finished discovery busted
  endTriggered: boolean        // someone hit the goal; finish the round
  roundEndsAfter: number       // discoverer index whose completed turn ends the game
  winner: number | null        // 0..2 once decided
  log: LogEntry[]
}

export const GOAL = 12
export const PLAYERS = 3
export const HARBOR_CAP = 12          // safety cap; harbor can't grow past the deck anyway
const COLORS: Color[] = ['red', 'blue', 'green', 'yellow', 'black']

export const COLOR_NAME: Record<Color, string> = {
  red: 'red', blue: 'blue', green: 'green', yellow: 'yellow', black: 'black',
}
export const SYM_NAME: Record<PersonSym, string> = {
  sailor: 'Sailor', captain: 'Captain', priest: 'Priest', jester: 'Jester',
  settler: 'Settler', governor: 'Governor',
}

function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-30) }

function shuffle<T>(a: T[], rng: () => number): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0;[r[i], r[j]] = [r[j], r[i]] }
  return r
}

/* ---------- default deck ---------- */
export function defaultDeck(): Card[] {
  const cards: Card[] = []
  let id = 0
  // SHIPS: ~6 of each color, coin values 1..4, some with swords.
  for (const color of COLORS) {
    const coinVals = [1, 2, 2, 3, 3, 4]
    for (let k = 0; k < coinVals.length; k++) {
      const coins = coinVals[k]
      const swords = k >= 4 ? 1 : 0   // the richer ships carry a sword
      cards.push({ id: id++, kind: 'ship', color, coins, swords, name: `${COLOR_NAME[color]} ship` })
    }
  }
  // PERSONS: cost coins, give influence + a symbol. Mix of cheap/low and pricey/high.
  const persons: Array<[PersonSym, number, number, number]> = [
    // [symbol, count, cost, influence]
    ['sailor', 3, 2, 1],
    ['captain', 3, 4, 1],
    ['priest', 2, 3, 2],
    ['jester', 2, 3, 1],
    ['settler', 3, 4, 2],
    ['governor', 2, 6, 3],
  ]
  for (const [sym, count, cost, influence] of persons) {
    for (let k = 0; k < count; k++) {
      cards.push({ id: id++, kind: 'person', sym, cost, influence, name: SYM_NAME[sym] })
    }
  }
  return cards
}

/* ---------- expeditions (kept in a separate face-up row) ---------- */
export function defaultExpeditions(): Card[] {
  let id = 1000
  const exps: Array<[PersonSym[], number, string]> = [
    [['sailor', 'sailor'], 4, 'Trade Run'],
    [['captain', 'priest'], 5, 'Mission'],
    [['settler', 'governor'], 6, 'New Colony'],
    [['jester', 'sailor', 'captain'], 7, 'Grand Voyage'],
  ]
  return exps.map(([needs, influence, name]) => ({
    id: id++, kind: 'expedition' as Kind, needs, influence, name,
  }))
}

function freshPlayer(coins: number): PlayerState {
  return { coins, ships: [], persons: [], expeditions: [], influence: 0 }
}

export function makeGame(optionalDeck?: Card[], rng: () => number = Math.random): PortState {
  const base = optionalDeck ? optionalDeck.map(c => ({ ...c })) : defaultDeck()
  const deck = optionalDeck ? base : shuffle(base, rng)
  const players: PlayerState[] = [
    freshPlayer(3), freshPlayer(3), freshPlayer(3),
  ]
  return {
    deck,
    harbor: [],
    discard: [],
    expeditionRow: defaultExpeditions(),
    players,
    discoverer: 0,
    current: 0,
    phase: 'discover',
    busted: false,
    endTriggered: false,
    roundEndsAfter: -1,
    winner: null,
    log: [{ t: 'sys', x: 'Flip harbor cards. A second ship of a color already in the harbor busts you. Stop to take a card; rivals then take, paying you a coin.' }],
  }
}

const pname = (p: number) => (p === 0 ? 'You' : `AI ${p}`)
const nextPlayer = (p: number) => (p + 1) % PLAYERS

/* ---------- helpers ---------- */
export function harborColors(harbor: Card[]): Record<Color, number> {
  const c: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0, black: 0 }
  for (const card of harbor) if (card.kind === 'ship' && card.color) c[card.color]++
  return c
}

/** Probability the NEXT flip busts: fraction of remaining ships whose color is already present. */
export function bustRisk(s: PortState): number {
  if (s.deck.length === 0) return 0
  const present = new Set<Color>()
  for (const card of s.harbor) if (card.kind === 'ship' && card.color) present.add(card.color)
  if (present.size === 0) return 0
  let bad = 0
  for (const card of s.deck) if (card.kind === 'ship' && card.color && present.has(card.color)) bad++
  return bad / s.deck.length
}

/** Recompute a player's influence from their tableau. */
function recomputeInfluence(p: PlayerState): number {
  let inf = 0
  for (const c of p.persons) inf += c.influence ?? 0
  for (const c of p.expeditions) inf += c.influence ?? 0
  return inf
}

/** All person symbols a player currently holds (as a multiset count). */
export function symbolCounts(p: PlayerState): Record<PersonSym, number> {
  const c: Record<PersonSym, number> = { sailor: 0, captain: 0, priest: 0, jester: 0, settler: 0, governor: 0 }
  for (const card of p.persons) if (card.sym) c[card.sym]++
  return c
}

/** Can player `pi` claim expedition `exp`? (has all required symbols). */
export function canClaim(p: PlayerState, exp: Card): boolean {
  if (!exp.needs) return false
  const have = symbolCounts(p)
  const used: Record<PersonSym, number> = { ...have }
  for (const need of exp.needs) {
    if (used[need] <= 0) return false
    used[need]--
  }
  return true
}

/* ---------- the deck flip ---------- */
function drawCount(s: PortState): number { return s.deck.length + s.discard.length }

/** Reshuffle discard into the deck if the deck is empty (keeps long games from stalling). */
function refillDeck(s: PortState, rng: () => number): { deck: Card[]; discard: Card[] } {
  if (s.deck.length > 0 || s.discard.length === 0) return { deck: s.deck.slice(), discard: s.discard.slice() }
  return { deck: shuffle(s.discard, rng), discard: [] }
}

/** Flip one card into the harbor. BUST if it duplicates a harbor ship color.
    `rng` only matters for the (rare) discard reshuffle; the flip itself is the deck top. */
export function flip(s: PortState, rng: () => number = Math.random): PortState {
  if (s.winner != null || s.phase !== 'discover') return s
  let { deck, discard } = refillDeck(s, rng)
  if (deck.length === 0) {
    // No cards left to flip. If the harbor already has cards, go take them; otherwise the
    // whole supply is exhausted — finish the game now (no one can gain more influence).
    if (s.harbor.length > 0) return beginTrade(Object.assign({}, s, { deck, discard }))
    return finishGame(Object.assign({}, s, { deck, discard }))
  }
  deck = deck.slice()
  const card = deck.pop()!
  const present = harborColors(s.harbor)
  const dupe = card.kind === 'ship' && card.color != null && present[card.color] > 0

  if (dupe) {
    // BUST: discard the whole harbor + the flipped card, take nothing, pass the turn.
    const newDiscard = discard.concat(s.harbor, [card])
    const log = push(s.log, s.discoverer === 0 ? 'you' : 'foe',
      `${pname(s.discoverer)} flipped a second ${COLOR_NAME[card.color!]} ship — BUST! Harbor discarded, nothing taken.`)
    const busted = Object.assign({}, s, { deck, discard: newDiscard, harbor: [], busted: true, log })
    return endTurn(busted)
  }

  const harbor = s.harbor.concat([card])
  const desc = card.kind === 'ship'
    ? `${COLOR_NAME[card.color!]} ship (${card.coins}🪙${card.swords ? ` ${card.swords}⚔` : ''})`
    : `${card.name} (hire ${card.cost}🪙, +${card.influence}★)`
  const log = push(s.log, s.discoverer === 0 ? 'you' : 'foe', `${pname(s.discoverer)} flipped ${desc}.`)
  return Object.assign({}, s, { deck, discard, harbor, busted: false, log })
}

/* ---------- stop -> trade ---------- */
function beginTrade(s: PortState): PortState {
  // The discoverer takes first; then each other player in turn order.
  return Object.assign({}, s, { phase: 'trade' as Phase, current: s.discoverer })
}

/** Stop discovering (cleanly). Move to the trade phase where players take harbor cards. */
export function stop(s: PortState): PortState {
  if (s.winner != null || s.phase !== 'discover') return s
  if (s.harbor.length === 0) {
    // nothing flipped — nothing to take; just end the turn.
    const log = push(s.log, s.discoverer === 0 ? 'you' : 'foe', `${pname(s.discoverer)} stopped with an empty harbor.`)
    return endTurn(Object.assign({}, s, { log }))
  }
  const log = push(s.log, s.discoverer === 0 ? 'you' : 'foe', `${pname(s.discoverer)} stopped — time to take cards.`)
  return beginTrade(Object.assign({}, s, { log }))
}

/* ---------- taking a card ---------- */

/** Whether `player` can afford to take harbor[harborIndex] (with the trade fee if not discoverer). */
export function canTake(s: PortState, player: number, harborIndex: number): boolean {
  if (s.phase !== 'trade') return false
  const card = s.harbor[harborIndex]
  if (card == null) return false
  const isDiscoverer = player === s.discoverer
  const fee = isDiscoverer ? 0 : 1
  if (card.kind === 'ship') {
    // taking a ship costs only the fee (you gain its coins)
    return s.players[player].coins >= fee
  }
  // hiring a person: pay the cost + fee
  const cost = (card.cost ?? 0) + fee
  return s.players[player].coins >= cost
}

/** The current decider (discoverer in trade, or each rival) takes harbor[harborIndex].
    A ship gives coins; a person is hired (pay cost) for influence. Non-discoverers pay the
    discoverer 1 coin. After a take, advance to the next rival (or end the turn). */
export function takeCard(s: PortState, player: number, harborIndex: number): PortState {
  if (s.winner != null || s.phase !== 'trade') return s
  if (player !== s.current) return s
  const card = s.harbor[harborIndex]
  if (card == null) return s
  if (!canTake(s, player, harborIndex)) return s

  const isDiscoverer = player === s.discoverer
  const fee = isDiscoverer ? 0 : 1
  const players = s.players.map(p => ({ ...p, ships: p.ships.slice(), persons: p.persons.slice(), expeditions: p.expeditions.slice() }))
  let log = s.log

  // pay the fee to the discoverer
  if (fee > 0) {
    players[player].coins -= fee
    players[s.discoverer].coins += fee
  }

  if (card.kind === 'ship') {
    players[player].coins += card.coins ?? 0
    players[player].ships.push(card)
    log = push(log, player === 0 ? 'you' : 'foe',
      `${pname(player)} took the ${COLOR_NAME[card.color!]} ship (+${card.coins}🪙${fee ? ', paid 1🪙 fee' : ''}).`)
  } else {
    players[player].coins -= card.cost ?? 0
    players[player].persons.push(card)
    players[player].influence = recomputeInfluence(players[player])
    log = push(log, player === 0 ? 'you' : 'foe',
      `${pname(player)} hired the ${card.name} (−${card.cost}🪙${fee ? '+1 fee' : ''}, +${card.influence}★).`)
  }

  // remove that harbor card; the rest stay for the remaining players
  const harbor = s.harbor.slice()
  harbor.splice(harborIndex, 1)

  let ns = Object.assign({}, s, { players, harbor, log })
  // auto-claim any newly available expeditions for this player
  ns = autoClaim(ns, player)
  return advanceTrade(ns)
}

/** The current decider passes (takes nothing). Advance to the next player. */
export function passTake(s: PortState): PortState {
  if (s.winner != null || s.phase !== 'trade') return s
  const log = push(s.log, s.current === 0 ? 'you' : 'foe', `${pname(s.current)} took no card.`)
  return advanceTrade(Object.assign({}, s, { log }))
}

/** Try to auto-claim expeditions a player now qualifies for (greedy, one per call is fine; loop). */
function autoClaim(s: PortState, player: number): PortState {
  let row = s.expeditionRow.slice()
  const players = s.players.map(p => ({ ...p, expeditions: p.expeditions.slice() }))
  let log = s.log
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < row.length; i++) {
      if (canClaim(players[player], row[i])) {
        const exp = row[i]
        players[player].expeditions.push(exp)
        players[player].influence = recomputeInfluence(players[player])
        row.splice(i, 1)
        log = push(log, player === 0 ? 'you' : 'foe',
          `${pname(player)} claimed the ${exp.name} expedition (+${exp.influence}★)!`)
        changed = true
        break
      }
    }
  }
  return Object.assign({}, s, { expeditionRow: row, players, log })
}

/** Advance the trade phase: next player in turn order takes a card, until we loop back. */
function advanceTrade(s: PortState): PortState {
  // find the next player after current who is NOT the discoverer (rivals trade once each)
  let nxt = nextPlayer(s.current)
  // the discoverer already took first; rivals go in order; when we reach the discoverer again, done.
  if (s.current === s.discoverer) {
    // discoverer just acted -> first rival
    return Object.assign({}, s, { current: nxt })
  }
  if (nxt === s.discoverer) {
    // all rivals have acted -> end the turn
    return endTurn(s)
  }
  return Object.assign({}, s, { current: nxt })
}

/* ---------- end of a turn ---------- */
function endTurn(s: PortState): PortState {
  // discard whatever remains in the harbor
  const discard = s.discard.concat(s.harbor)
  // Supply fully exhausted (no cards anywhere) — no one can gain influence; finish now.
  if (s.deck.length === 0 && discard.length === 0) {
    return finishGame(Object.assign({}, s, { discard: [], harbor: [] }))
  }
  let players = s.players
  // check end trigger
  const triggered = s.endTriggered || players.some(p => p.influence >= GOAL)
  let endTriggered = s.endTriggered
  let roundEndsAfter = s.roundEndsAfter
  let log = s.log

  if (triggered && !s.endTriggered) {
    endTriggered = true
    // finish the round: the game ends after the player BEFORE the current discoverer has led.
    // i.e. everyone gets equal number of discoveries — round ends after discoverer (PLAYERS-1) before start.
    roundEndsAfter = (s.discoverer + PLAYERS - 1) % PLAYERS
    const who = players.findIndex(p => p.influence >= GOAL)
    log = push(log, 'sys', `${pname(who)} reached ${GOAL}★ — finishing the round.`)
  }

  // if the round-end condition is met (this discoverer was the last to lead), end the game
  if (endTriggered && s.discoverer === roundEndsAfter) {
    return finishGame(Object.assign({}, s, { discard, harbor: [], endTriggered, roundEndsAfter, log }))
  }

  const nextD = nextPlayer(s.discoverer)
  return Object.assign({}, s, {
    discard, harbor: [], discoverer: nextD, current: nextD,
    phase: 'discover' as Phase, busted: s.busted, endTriggered, roundEndsAfter, log,
  })
}

function finishGame(s: PortState): PortState {
  // winner = most influence; tie broken by most coins, then lowest index.
  let best = 0
  for (let i = 1; i < PLAYERS; i++) {
    const a = s.players[i], b = s.players[best]
    if (a.influence > b.influence || (a.influence === b.influence && a.coins > b.coins)) best = i
  }
  const log = push(s.log, best === 0 ? 'you' : 'foe',
    `Game over — ${pname(best)} wins with ${s.players[best].influence}★!`)
  return Object.assign({}, s, { phase: 'done' as Phase, winner: best, log })
}

/* ---------- AI ===========================================================
   Discovery: a push-your-luck policy. Keep flipping while bust risk is low and the
   harbor doesn't yet hold something worth taking; stop when a good buy/hire is present
   or the risk of busting climbs. Trade: take the most influence-advancing affordable card. */

/** Score how much the AI "wants" a card right now (higher = better). */
function wantScore(s: PortState, player: number, card: Card, isDiscoverer: boolean): number {
  const fee = isDiscoverer ? 0 : 1
  const p = s.players[player]
  if (card.kind === 'ship') {
    if (p.coins < fee) return -Infinity
    // ships give coins (fuel for hiring) — modest value, scaled by current poverty.
    const coinVal = card.coins ?? 0
    return 0.5 + coinVal * 0.25 - (isDiscoverer ? 0 : 0.4)   // rivals pay a fee, value it less
  }
  // person
  const cost = (card.cost ?? 0) + fee
  if (p.coins < cost) return -Infinity
  let v = (card.influence ?? 0) * 2.0          // influence is the goal
  // bonus if this person helps complete an expedition
  if (card.sym) {
    for (const exp of s.expeditionRow) {
      if (exp.needs && exp.needs.includes(card.sym)) v += 0.8
    }
  }
  v -= (card.cost ?? 0) * 0.15                  // mild cost penalty
  return v
}

/** Best affordable harbor pick for `player` in the current trade phase: {index, score} or null. */
export function aiTakeDecision(s: PortState, player: number): { index: number; score: number } | null {
  if (s.phase !== 'trade') return null
  const isDiscoverer = player === s.discoverer
  let best: { index: number; score: number } | null = null
  for (let i = 0; i < s.harbor.length; i++) {
    if (!canTake(s, player, i)) continue
    const sc = wantScore(s, player, s.harbor[i], isDiscoverer)
    if (sc === -Infinity) continue
    if (best == null || sc > best.score) best = { index: i, score: sc }
  }
  return best
}

/** One AI sub-step. Drives both discovery (flip/stop) and trade (take/pass) for AI players.
    Returns a new state; designed to be called repeatedly via useAITurn with a changing tick. */
export function aiStep(s: PortState, rng: () => number = Math.random): PortState {
  if (s.winner != null) return s

  if (s.phase === 'discover') {
    if (s.discoverer === 0) return s   // human leads
    const risk = bustRisk(s)
    const pick = bestDiscoverPick(s, s.discoverer)
    // Stop if we already have something good and the risk isn't trivial,
    // or if the risk is high regardless.
    if (s.harbor.length >= 1 && pick && pick.score >= 3 && risk >= 0.18) return stop(s)
    if (risk >= 0.42) return stop(s)
    if (s.harbor.length >= 5) return stop(s)   // don't overstay
    if (s.deck.length === 0 && s.discard.length === 0) return stop(s)
    return flip(s, rng)
  }

  if (s.phase === 'trade') {
    if (s.current === 0) return s     // human's take decision
    const dec = aiTakeDecision(s, s.current)
    // Take only if the pick is genuinely worth it; rivals are stingier (they pay a fee).
    const threshold = s.current === s.discoverer ? 0.6 : 1.2
    if (dec && dec.score >= threshold) return takeCard(s, s.current, dec.index)
    return passTake(s)
  }

  return s
}

/** What the AI could grab if it stopped now (used to decide whether to keep flipping). */
function bestDiscoverPick(s: PortState, player: number): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null
  for (let i = 0; i < s.harbor.length; i++) {
    const card = s.harbor[i]
    const sc = wantScore(s, player, card, true)
    if (sc === -Infinity) continue
    if (best == null || sc > best.score) best = { index: i, score: sc }
  }
  return best
}

/** Convenience: is it an AI's turn to act right now (discover or take)? */
export function aiActive(s: PortState): boolean {
  if (s.winner != null || s.phase === 'done') return false
  if (s.phase === 'discover') return s.discoverer !== 0
  if (s.phase === 'trade') return s.current !== 0
  return false
}

/** A monotonic tick that changes on every AI-observable sub-step (so useAITurn re-arms). */
export function aiTick(s: PortState): string {
  const inf = s.players.map(p => p.influence).join(',')
  const coins = s.players.map(p => p.coins).join(',')
  return `${s.phase}|${s.discoverer}|${s.current}|${s.harbor.length}|${s.deck.length}|${inf}|${coins}|${s.winner}`
}

/** Run a whole AI discovery+trade where applicable until it's the human's decision or game over.
    Provided for completeness; the UI normally steps via aiStep. Guard-capped. */
export function aiTurn(s: PortState, rng: () => number = Math.random): PortState {
  let cur = s
  let guard = 0
  while (aiActive(cur) && guard++ < 200) {
    const next = aiStep(cur, rng)
    if (next === cur) break
    cur = next
  }
  return cur
}

export { drawCount }
