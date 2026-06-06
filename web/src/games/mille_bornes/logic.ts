/* MILLE BORNES — pure logic (2-player adaptation, immutable, no DOM).
   You (player 0) race the Rival (player 1) to 1000 km. On a turn you DRAW one card,
   then PLAY one (distance / hazard / remedy / safety) or DISCARD one. To play a
   distance card you need an active Roll (green light) and no blocking hazard, and a
   Speed Limit caps a play at <= 50 km. Hazards are dealt onto the opponent; remedies
   cancel your own hazard; safeties sit permanently in front and grant immunity to a
   matching hazard. First to >= 1000 km wins. Deterministic when given a deck. */

export type Player = 0 | 1

export type CardKind = 'distance' | 'hazard' | 'remedy' | 'safety'

// Hazard categories (also used to key remedies / safeties).
export type HazardKind = 'stop' | 'limit' | 'gas' | 'flat' | 'accident'

export interface Card {
  id: number
  kind: CardKind
  // distance
  km?: 25 | 50 | 75 | 100 | 200
  // hazard / remedy / safety category
  hazard?: HazardKind
  name: string
}

export const TARGET = 1000
export const MAX_200 = 2            // a player may play at most this many 200-km cards

export interface PlayerState {
  hand: Card[]
  distance: number                  // km traveled (0..1000)
  roll: boolean                     // green light active (a Go remedy is showing)
  hazard: HazardKind | null         // active blocking hazard (stop counts as a hazard too)
  speedLimit: boolean               // Speed Limit active -> plays capped at <= 50
  safeties: HazardKind[]            // safeties played in front (permanent immunity)
  count200: number                  // number of 200-km cards already played
}

export interface LogEntry { t: string; x: string }   // t: 'you' | 'ai' | 'sys'

export interface State {
  deck: Card[]                      // draw pile, top = last element
  discard: Card[]
  players: [PlayerState, PlayerState]
  turn: Player
  drewThisTurn: boolean             // has the current player drawn yet this turn
  winner: Player | null
  log: LogEntry[]
}

const opp = (p: Player): Player => (p === 0 ? 1 : 0)
const who = (p: Player) => (p === 0 ? 'You' : 'The rival')
const tag = (p: Player) => (p === 0 ? 'you' : 'ai')
function push(log: LogEntry[], t: string, x: string) { return log.concat([{ t, x }]).slice(-40) }

// Which safety neutralizes which hazard. Right of Way ('row') covers BOTH stop and limit.
export const SAFETY_FOR: Record<HazardKind, HazardKind> = {
  stop: 'row', limit: 'row', gas: 'gas-s', flat: 'flat-s', accident: 'acc-s',
} as unknown as Record<HazardKind, HazardKind>

// A player is immune to a hazard if they hold the covering safety.
export function immuneTo(ps: PlayerState, hz: HazardKind): boolean {
  if (hz === 'stop' || hz === 'limit') return ps.safeties.includes('row' as HazardKind)
  return ps.safeties.includes(SAFETY_FOR[hz])
}

export const HAZARD_NAME: Record<HazardKind, string> = {
  stop: 'Stop', limit: 'Speed Limit', gas: 'Out of Gas', flat: 'Flat Tire', accident: 'Accident',
}
export const REMEDY_NAME: Record<HazardKind, string> = {
  stop: 'Go', limit: 'End of Limit', gas: 'Gasoline', flat: 'Spare Tire', accident: 'Repairs',
}
export const SAFETY_NAME: Record<string, string> = {
  row: 'Right of Way', 'gas-s': 'Extra Tank', 'flat-s': 'Puncture-Proof', 'acc-s': 'Driving Ace',
}

/* ---------------- deck construction ---------------- */

// Build the full (deterministic, unshuffled) deck. Counts loosely follow the real game.
export function buildDeck(): Card[] {
  const cards: Card[] = []
  let id = 0
  const add = (n: number, c: Omit<Card, 'id'>) => { for (let i = 0; i < n; i++) cards.push({ ...c, id: id++ }) }

  // distance
  add(10, { kind: 'distance', km: 25, name: '25' })
  add(10, { kind: 'distance', km: 50, name: '50' })
  add(10, { kind: 'distance', km: 75, name: '75' })
  add(12, { kind: 'distance', km: 100, name: '100' })
  add(4,  { kind: 'distance', km: 200, name: '200' })

  // hazards
  add(5, { kind: 'hazard', hazard: 'stop', name: 'Stop' })
  add(4, { kind: 'hazard', hazard: 'limit', name: 'Speed Limit' })
  add(3, { kind: 'hazard', hazard: 'gas', name: 'Out of Gas' })
  add(3, { kind: 'hazard', hazard: 'flat', name: 'Flat Tire' })
  add(3, { kind: 'hazard', hazard: 'accident', name: 'Accident' })

  // remedies (Go is plentiful since it's needed to start and after every Stop)
  add(14, { kind: 'remedy', hazard: 'stop', name: 'Go' })
  add(6,  { kind: 'remedy', hazard: 'limit', name: 'End of Limit' })
  add(6,  { kind: 'remedy', hazard: 'gas', name: 'Gasoline' })
  add(6,  { kind: 'remedy', hazard: 'flat', name: 'Spare Tire' })
  add(6,  { kind: 'remedy', hazard: 'accident', name: 'Repairs' })

  // safeties (4 unique)
  add(1, { kind: 'safety', hazard: 'stop', name: 'Right of Way' })       // covers stop + limit
  add(1, { kind: 'safety', hazard: 'gas', name: 'Extra Tank' })
  add(1, { kind: 'safety', hazard: 'flat', name: 'Puncture-Proof' })
  add(1, { kind: 'safety', hazard: 'accident', name: 'Driving Ace' })

  return cards
}

export function shuffle<T>(a: T[]): T[] {
  const r = a.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function emptyPlayer(): PlayerState {
  return { hand: [], distance: 0, roll: false, hazard: null, speedLimit: false, safeties: [], count200: 0 }
}

const HAND_SIZE = 6

/* Create a game. Pass `optionalDeck` (top = last element) for deterministic tests;
   otherwise a shuffled deck is built. */
export function makeGame(optionalDeck?: Card[]): State {
  const deck = (optionalDeck ? optionalDeck.slice() : shuffle(buildDeck()))
  const players: [PlayerState, PlayerState] = [emptyPlayer(), emptyPlayer()]
  // deal HAND_SIZE each, drawing from the top (end)
  for (let n = 0; n < HAND_SIZE; n++) {
    for (const p of [0, 1] as Player[]) {
      const c = deck.pop()
      if (c) players[p].hand.push(c)
    }
  }
  return {
    deck,
    discard: [],
    players,
    turn: 0,
    drewThisTurn: false,
    winner: null,
    log: push([], 'sys', 'Race to ' + TARGET + ' km. Get a Go light rolling, then lay down distance.'),
  }
}

function clonePlayer(p: PlayerState): PlayerState {
  return { ...p, hand: p.hand.slice(), safeties: p.safeties.slice() }
}
function cloneState(s: State): State {
  return {
    deck: s.deck.slice(),
    discard: s.discard.slice(),
    players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])],
    turn: s.turn,
    drewThisTurn: s.drewThisTurn,
    winner: s.winner,
    log: s.log.slice(),
  }
}

/* ---------------- queries ---------------- */

// Can this player legally lay down a distance card right now?
export function canPlayDistance(s: State, player: Player): boolean {
  const ps = s.players[player]
  if (!ps.roll) return false
  if (ps.hazard !== null) return false
  return true
}

function safetyKey(c: Card): HazardKind {
  // map a safety card to its stored key
  switch (c.hazard) {
    case 'stop': return 'row' as HazardKind            // Right of Way
    case 'gas': return 'gas-s' as HazardKind
    case 'flat': return 'flat-s' as HazardKind
    case 'accident': return 'acc-s' as HazardKind
    default: return 'row' as HazardKind
  }
}

// Is a given card in hand playable for `player` right now (in-turn)?
export function isPlayable(s: State, player: Player, c: Card): boolean {
  const ps = s.players[player]
  const o = s.players[opp(player)]
  switch (c.kind) {
    case 'safety':
      return true                                       // a safety may always be played
    case 'distance': {
      if (!canPlayDistance(s, player)) return false
      const km = c.km!
      if (km === 200 && ps.count200 >= MAX_200) return false
      if (ps.speedLimit && km > 50) return false
      if (ps.distance + km > TARGET) return false       // may not overshoot 1000
      return true
    }
    case 'remedy': {
      const hz = c.hazard!
      if (hz === 'stop') {
        // Go cancels Stop, or starts you rolling when no roll yet.
        if (ps.hazard === 'stop') return true
        if (!ps.roll && ps.hazard === null) return true
        return false
      }
      if (hz === 'limit') return ps.speedLimit
      return ps.hazard === hz                            // gas / flat / accident
    }
    case 'hazard': {
      const hz = c.hazard!
      if (immuneTo(o, hz)) return false                  // opponent immune via safety
      if (hz === 'limit') {
        if (o.speedLimit) return false                   // already limited
        return o.roll                                    // can only limit a moving car
      }
      // stop / gas / flat / accident: opponent must not already be hazarded; needs them rolling
      if (o.hazard !== null) return false
      if (hz === 'stop') return o.roll                   // only stop a rolling car
      return o.roll                                      // gas/flat/accident require a rolling car
    }
  }
}

// All legal play card ids for the player this turn.
export function legalPlays(s: State, player: Player): number[] {
  return s.players[player].hand.filter(c => isPlayable(s, player, c)).map(c => c.id)
}

/* ---------------- mutations ---------------- */

// Draw the top card into the current player's hand (must not have drawn yet this turn).
export function drawCard(s: State, player: Player): State {
  if (s.winner !== null || s.turn !== player || s.drewThisTurn) return s
  const ns = cloneState(s)
  const c = ns.deck.pop()
  if (c) {
    ns.players[player].hand.push(c)
    ns.log = push(ns.log, 'sys', `${who(player)} draw${player === 0 ? '' : 's'} a card.`)
  } else {
    ns.log = push(ns.log, 'sys', 'The deck is empty.')
  }
  ns.drewThisTurn = true
  return ns
}

function findCard(hand: Card[], id: number): Card | undefined { return hand.find(c => c.id === id) }
function removeCard(hand: Card[], id: number): Card[] { return hand.filter(c => c.id !== id) }

function checkWin(ns: State, player: Player): void {
  if (ns.players[player].distance >= TARGET) {
    ns.players[player].distance = TARGET
    ns.winner = player
    ns.log = push(ns.log, tag(player), `${who(player)} reach${player === 0 ? '' : 'es'} ${TARGET} km — race won!`)
  }
}

function endTurn(ns: State): void {
  ns.turn = opp(ns.turn)
  ns.drewThisTurn = false
}

/* Play a card from `player`'s hand. `target` is unused for hazards (always the
   opponent) but kept in the signature per the spec. Out-of-turn safeties (coup
   fourre) are allowed when `player` is not the current turn AND the card is a safety
   that blocks a hazard currently on that player. */
export function play(s: State, player: Player, cardId: number, _target?: Player): State {
  if (s.winner !== null) return s
  const card = findCard(s.players[player].hand, cardId)
  if (!card) return s

  const outOfTurn = s.turn !== player
  if (outOfTurn) {
    // only a safety may be played out of turn (coup fourre defending an incoming hazard)
    if (card.kind !== 'safety') return s
    return playSafety(s, player, card, true)
  }

  if (!isPlayable(s, player, card)) return s

  switch (card.kind) {
    case 'safety':
      return playSafety(s, player, card, false)
    case 'distance': {
      const ns = cloneState(s)
      const ps = ns.players[player]
      ps.hand = removeCard(ps.hand, cardId)
      ps.distance += card.km!
      if (card.km === 200) ps.count200++
      ns.log = push(ns.log, tag(player), `${who(player)} drive${player === 0 ? '' : 's'} ${card.km} km (${ps.distance} total).`)
      checkWin(ns, player)
      if (ns.winner === null) endTurn(ns)
      return ns
    }
    case 'remedy': {
      const ns = cloneState(s)
      const ps = ns.players[player]
      ps.hand = removeCard(ps.hand, cardId)
      const hz = card.hazard!
      if (hz === 'stop') {
        ps.hazard = null
        ps.roll = true
        ns.log = push(ns.log, tag(player), `${who(player)} play${player === 0 ? '' : 's'} Go — rolling.`)
      } else if (hz === 'limit') {
        ps.speedLimit = false
        ns.log = push(ns.log, tag(player), `${who(player)} play${player === 0 ? '' : 's'} End of Limit.`)
      } else {
        ps.hazard = null
        ns.log = push(ns.log, tag(player), `${who(player)} fix${player === 0 ? '' : 'es'} ${HAZARD_NAME[hz]}.`)
      }
      endTurn(ns)
      return ns
    }
    case 'hazard': {
      const ns = cloneState(s)
      const ps = ns.players[player]
      const o = ns.players[opp(player)]
      ps.hand = removeCard(ps.hand, cardId)
      const hz = card.hazard!
      ns.discard.push(card)
      if (hz === 'limit') {
        o.speedLimit = true
      } else {
        o.hazard = hz
        if (hz === 'stop') o.roll = false
        else o.roll = false                              // gas/flat/accident also stop you rolling
      }
      ns.log = push(ns.log, tag(player), `${who(player)} hit${player === 0 ? '' : 's'} the rival with ${HAZARD_NAME[hz]}.`)
      endTurn(ns)
      return ns
    }
  }
}

function playSafety(s: State, player: Player, card: Card, coup: boolean): State {
  const ns = cloneState(s)
  const ps = ns.players[player]
  ps.hand = removeCard(ps.hand, card.id)
  const key = safetyKey(card)
  if (!ps.safeties.includes(key)) ps.safeties.push(key)
  // a safety clears any matching active hazard immediately
  const covers: HazardKind[] = key === ('row' as HazardKind) ? ['stop', 'limit'] : [hazardForSafety(key)]
  if (ps.hazard !== null && covers.includes(ps.hazard)) { ps.hazard = null }
  if (covers.includes('limit') && ps.speedLimit) ps.speedLimit = false
  if (covers.includes('stop')) ps.roll = true              // Right of Way means you never need a Go to roll
  ns.log = push(ns.log, tag(player), `${who(player)} play${player === 0 ? '' : 's'} ${card.name}${coup ? ' — coup fourre!' : ''} (safe).`)
  // playing a safety is a free move on your turn (you don't end your turn); coup is out of turn -> no turn change
  if (!coup) {
    // free move: the player may continue, but to keep the loop simple we still pass the turn.
    endTurn(ns)
  }
  return ns
}

function hazardForSafety(key: HazardKind): HazardKind {
  switch (key as unknown as string) {
    case 'gas-s': return 'gas'
    case 'flat-s': return 'flat'
    case 'acc-s': return 'accident'
    default: return 'stop'
  }
}

// Discard a card (when nothing useful to play). Ends the turn.
export function discard(s: State, player: Player, cardId: number): State {
  if (s.winner !== null || s.turn !== player) return s
  const card = findCard(s.players[player].hand, cardId)
  if (!card) return s
  const ns = cloneState(s)
  ns.players[player].hand = removeCard(ns.players[player].hand, cardId)
  ns.discard.push(card)
  ns.log = push(ns.log, tag(player), `${who(player)} discard${player === 0 ? '' : 's'} ${card.name}.`)
  endTurn(ns)
  return ns
}

/* ---------------- AI ---------------- */

// The AI plays a complete turn (draw, then play or discard). Heuristic & fast.
export function aiTurn(s: State): State {
  if (s.winner !== null || s.turn !== 1) return s
  let ns = s
  if (!ns.drewThisTurn) ns = drawCard(ns, 1)
  if (ns.winner !== null) return ns
  const me: Player = 1
  const ps = ns.players[me]
  const hand = ps.hand

  // 1) Safety: play one only if it cancels an active hazard (otherwise hold).
  const safety = hand.find(c => {
    if (c.kind !== 'safety') return false
    const key = safetyKey(c)
    if (key === ('row' as HazardKind)) return ps.hazard === 'stop' || ps.speedLimit || !ps.roll
    return ps.hazard === hazardForSafety(key)
  })
  if (safety && isPlayable(ns, me, safety)) return play(ns, me, safety.id)

  // 2) Need a roll? play Go.
  if (!ps.roll || ps.hazard === 'stop') {
    const go = hand.find(c => c.kind === 'remedy' && c.hazard === 'stop' && isPlayable(ns, me, c))
    if (go) return play(ns, me, go.id)
  }
  // 3) Fix any other active hazard.
  if (ps.hazard !== null && ps.hazard !== 'stop') {
    const fix = hand.find(c => c.kind === 'remedy' && c.hazard === ps.hazard && isPlayable(ns, me, c))
    if (fix) return play(ns, me, fix.id)
  }
  // 4) Clear a speed limit if we want to play big distance.
  if (ps.speedLimit) {
    const eol = hand.find(c => c.kind === 'remedy' && c.hazard === 'limit' && isPlayable(ns, me, c))
    const bigDist = hand.some(c => c.kind === 'distance' && (c.km! > 50))
    if (eol && bigDist) return play(ns, me, eol.id)
  }
  // 5) Play distance — biggest legal card that doesn't overshoot.
  if (canPlayDistance(ns, me)) {
    const dists = hand.filter(c => c.kind === 'distance' && isPlayable(ns, me, c))
      .sort((a, b) => b.km! - a.km!)
    if (dists.length) return play(ns, me, dists[0].id)
  }
  // 6) Attack: drop a hazard on the opponent.
  const hazards = hand.filter(c => c.kind === 'hazard' && isPlayable(ns, me, c))
  if (hazards.length) {
    // prefer Stop, then others
    const order: HazardKind[] = ['stop', 'gas', 'flat', 'accident', 'limit']
    hazards.sort((a, b) => order.indexOf(a.hazard!) - order.indexOf(b.hazard!))
    return play(ns, me, hazards[0].id)
  }
  // 7) Discard the least useful card. Prefer discarding a hazard we can't use, else lowest distance.
  const discardChoice = pickDiscard(hand)
  return discard(ns, me, discardChoice.id)
}

function pickDiscard(hand: Card[]): Card {
  // never discard a safety; prefer dumping a redundant hazard, then a distance, then a remedy.
  const nonSafety = hand.filter(c => c.kind !== 'safety')
  const pool = nonSafety.length ? nonSafety : hand
  const byPref = pool.slice().sort((a, b) => discardRank(a) - discardRank(b))
  return byPref[0]
}
function discardRank(c: Card): number {
  if (c.kind === 'hazard') return 0
  if (c.kind === 'distance') return 1 + (c.km! / 1000)   // smaller distance preferred to dump
  if (c.kind === 'remedy') return 3
  return 9
}
