/* SPADES — pure game logic (no React/DOM).

   4-player partnership trick-taking. Seats 0..3 around the table; seat 0 is YOU.
   Partnerships: seats {0,2} are team A (you + partner across), seats {1,3} are team B.
   Spades are always trump and may not be led until "broken" (a spade discarded on an
   off-suit trick) unless a player holds only spades.

   Bidding: each seat bids 0..13. A bid of 0 is a NIL (solo bonus/penalty). A team's
   contract is the sum of its two members' non-nil bids. Scoring per hand:
     - made (team tricks >= contract):  10*contract + 1 per overtrick (bag)
     - missed:                          -10*contract
     - 10 accumulated bags → -100 and bags -= 10
     - nil made (that seat took 0 tricks):  +100 ; nil failed: -100   (the seat's
       tricks do NOT count toward the team contract — standard solo-nil treatment).
   Game to 500; higher team total wins (ties broken by fewer bags, then sudden-death
   handled by playing another hand). */

export type Seat = 0 | 1 | 2 | 3
export type Suit = 'C' | 'D' | 'H' | 'S' // Clubs, Diamonds, Hearts, Spades(trump)
export type Team = 0 | 1 // team A = seats {0,2}, team B = seats {1,3}
export type Phase = 'bidding' | 'playing' | 'done'

export interface Card { id: number; suit: Suit; rank: number } // rank 2..14 (14 = Ace)
export interface TrickCard { seat: Seat; card: Card }

export interface HandLogEntry {
  handNo: number
  contract: [number, number]   // [teamA contract, teamB contract]
  tricks: [number, number]     // tricks taken by [teamA, teamB]
  delta: [number, number]      // score change [teamA, teamB]
  nil: (number | null)[]       // per-seat nil result: +100 / -100 / null
}

export interface SpadesState {
  handNo: number
  phase: Phase
  dealer: Seat
  hands: Card[][]              // hands[seat] = cards
  bids: (number | null)[]      // per-seat bid; null = not yet bid
  tricksWon: number[]          // per-seat tricks this hand
  trick: TrickCard[]
  leader: Seat                 // who leads the current trick
  turn: Seat                   // whose turn to act (bid or play)
  spadesBroken: boolean
  scores: [number, number]     // running team totals
  bags: [number, number]       // running team bags
  lastTrick: { cards: TrickCard[]; winner: Seat } | null
  handLog: HandLogEntry[]
  winner: Team | null
  ply: number                  // monotonically increasing action counter (for AI tick)
}

export const SUITS: Suit[] = ['C', 'D', 'H', 'S']
export const SUIT_NAME: Record<Suit, string> = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }
export const SEAT_NAME = ['You', 'West', 'Partner', 'East']
export const TARGET = 500

export function teamOf(seat: Seat): Team { return (seat % 2 === 0 ? 0 : 1) }
export function rankName(r: number): string {
  return r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r)
}
export function cardLabel(c: Card): string { return rankName(c.rank) + SUIT_NAME[c.suit][0] }

let UID = 0
function mk(suit: Suit, rank: number): Card { return { id: ++UID, suit, rank } }

/** A fresh ordered 52-card deck (Clubs 2..A, Diamonds, Hearts, Spades). */
export function orderedDeck(): Card[] {
  const d: Card[] = []
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(mk(s, r))
  return d
}

function shuffle<T>(a: T[]): T[] {
  a = a.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Deal 13 cards to each of 4 seats from the given (or random) deck. */
export function deal(deck?: Card[]): Card[][] {
  const d = deck ? deck.slice() : shuffle(orderedDeck())
  const hands: Card[][] = [[], [], [], []]
  for (let i = 0; i < 52; i++) hands[i % 4].push(d[i])
  return hands
}

const NEXT: Record<number, Seat> = { 0: 1, 1: 2, 2: 3, 3: 0 }
export function nextSeat(s: Seat): Seat { return NEXT[s] }

/** Create a new game. Optional ordered deck → deterministic deal (for tests). */
export function makeGame(deck?: Card[], dealer: Seat = 3): SpadesState {
  return dealHand({
    handNo: 0,
    phase: 'bidding',
    dealer,
    hands: [[], [], [], []],
    bids: [null, null, null, null],
    tricksWon: [0, 0, 0, 0],
    trick: [],
    leader: 0,
    turn: 0,
    spadesBroken: false,
    scores: [0, 0],
    bags: [0, 0],
    lastTrick: null,
    handLog: [],
    winner: null,
    ply: 0,
  }, dealer, deck)
}

function dealHand(s: SpadesState, dealer: Seat, deck?: Card[]): SpadesState {
  const hands = deal(deck)
  const first = nextSeat(dealer)
  return {
    ...s,
    handNo: s.handNo + 1,
    phase: 'bidding',
    dealer,
    hands,
    bids: [null, null, null, null],
    tricksWon: [0, 0, 0, 0],
    trick: [],
    leader: first,
    turn: first,
    spadesBroken: false,
    lastTrick: null,
  }
}

// ===== bidding =====

/** Heuristic bid for one seat: count likely trick winners. */
export function aiBid(s: SpadesState, seat: Seat): number {
  const hand = s.hands[seat]
  const spades = hand.filter(c => c.suit === 'S')
  let exp = 0

  // High spades are near-certain winners.
  for (const c of spades) {
    if (c.rank === 14) exp += 1          // Ace of spades
    else if (c.rank === 13) exp += 0.9   // King
    else if (c.rank === 12) exp += 0.75  // Queen
    else if (c.rank >= 10) exp += 0.45
    else exp += 0.12
  }
  // Length bonus: extra small spades (beyond 3) tend to win late trumping.
  if (spades.length > 3) exp += (spades.length - 3) * 0.45

  // Off-suit aces (and protected kings) win tricks.
  for (const suit of ['C', 'D', 'H'] as Suit[]) {
    const inSuit = hand.filter(c => c.suit === suit)
    const len = inSuit.length
    const hasA = inSuit.some(c => c.rank === 14)
    const hasK = inSuit.some(c => c.rank === 13)
    if (hasA) exp += 0.9
    if (hasK) exp += len >= 2 ? 0.55 : 0.2 // king protected if not singleton
  }

  let bid = Math.round(exp)
  // Consider nil: a hand with no high spades, short spades, and no high off-cards.
  const topSpade = spades.reduce((m, c) => Math.max(m, c.rank), 0)
  const highCards = hand.filter(c => c.rank >= 13).length
  if (bid <= 1 && spades.length <= 2 && topSpade <= 11 && highCards === 0) {
    // partner not in nil danger; go nil occasionally-but-deterministically when very safe
    if (spades.length <= 1 && topSpade <= 10) return 0
  }
  return Math.max(1, Math.min(13, bid))
}

/** Record a seat's bid and advance. */
export function placeBid(s: SpadesState, seat: Seat, bid: number): SpadesState {
  if (s.phase !== 'bidding' || s.turn !== seat || s.bids[seat] != null) return s
  if (bid < 0 || bid > 13) return s
  const bids = s.bids.slice()
  bids[seat] = bid
  const allIn = bids.every(b => b != null)
  if (!allIn) {
    return { ...s, bids, turn: nextSeat(seat), ply: s.ply + 1 }
  }
  // bidding complete → first player (left of dealer) leads
  const first = nextSeat(s.dealer)
  return { ...s, bids, phase: 'playing', leader: first, turn: first, ply: s.ply + 1 }
}

/** Team's combined contract = sum of its members' non-nil bids. */
export function teamContract(s: SpadesState, team: Team): number {
  let total = 0
  for (let seat = 0 as Seat; seat < 4; seat = (seat + 1) as Seat) {
    if (teamOf(seat) !== team) continue
    const b = s.bids[seat]
    if (b != null && b > 0) total += b
  }
  return total
}

// ===== play =====

function leadSuit(trick: TrickCard[]): Suit | null {
  return trick.length > 0 ? trick[0].card.suit : null
}

/** Legal plays for `seat` given current trick & spades-broken state. */
export function legalPlays(s: SpadesState, seat: Seat): Card[] {
  const hand = s.hands[seat]
  const led = leadSuit(s.trick)
  if (led == null) {
    // leading: cannot lead spades until broken, unless only spades remain
    const nonSpades = hand.filter(c => c.suit !== 'S')
    if (!s.spadesBroken && nonSpades.length > 0) return nonSpades
    return hand.slice()
  }
  const inLed = hand.filter(c => c.suit === led)
  if (inLed.length > 0) return inLed
  return hand.slice() // void in led suit → anything (incl. spades)
}

export function isLegal(s: SpadesState, seat: Seat, card: Card): boolean {
  return legalPlays(s, seat).some(c => c.id === card.id)
}

/** Winner index within a completed (or partial) trick. */
export function trickWinnerIndex(trick: TrickCard[]): number {
  const led = trick[0].card.suit
  const spades = trick.filter(t => t.card.suit === 'S')
  const pool = spades.length > 0 ? spades : trick.filter(t => t.card.suit === led)
  let best = pool[0]
  for (const t of pool) if (t.card.rank > best.card.rank) best = t
  return trick.indexOf(best)
}

export function trickWinner(trick: TrickCard[]): Seat {
  return trick[trickWinnerIndex(trick)].seat
}

/** Play a card for `seat`. Resolves the trick & hand as needed. */
export function playCard(s: SpadesState, seat: Seat, card: Card): SpadesState {
  if (s.phase !== 'playing' || s.turn !== seat) return s
  if (!isLegal(s, seat, card)) return s

  const hands = s.hands.map((h, i) => (i === seat ? h.filter(c => c.id !== card.id) : h))
  const trick = s.trick.concat([{ seat, card }])
  const spadesBroken = s.spadesBroken || (card.suit === 'S' && s.trick.length > 0 && s.trick[0].card.suit !== 'S')

  if (trick.length < 4) {
    return { ...s, hands, trick, turn: nextSeat(seat), spadesBroken, ply: s.ply + 1 }
  }

  // trick complete
  const winner = trickWinner(trick)
  const tricksWon = s.tricksWon.slice()
  tricksWon[winner] += 1
  const base: SpadesState = {
    ...s,
    hands,
    trick: [],
    tricksWon,
    leader: winner,
    turn: winner,
    spadesBroken,
    lastTrick: { cards: trick, winner },
    ply: s.ply + 1,
  }

  const empty = hands.every(h => h.length === 0)
  if (!empty) return base
  return scoreHand(base)
}

// ===== scoring =====

function scoreHand(s: SpadesState): SpadesState {
  const contract: [number, number] = [teamContract(s, 0), teamContract(s, 1)]
  const tricks: [number, number] = [0, 0]
  for (let seat = 0 as Seat; seat < 4; seat = (seat + 1) as Seat) tricks[teamOf(seat)] += s.tricksWon[seat]

  const delta: [number, number] = [0, 0]
  const nilResult: (number | null)[] = [null, null, null, null]
  const bags = s.bags.slice() as [number, number]

  // Nil bids first — a nil seat's tricks are removed from the team's "made" tally.
  const teamNilTricks: [number, number] = [0, 0]
  for (let seat = 0 as Seat; seat < 4; seat = (seat + 1) as Seat) {
    if (s.bids[seat] === 0) {
      const t = teamOf(seat)
      const took = s.tricksWon[seat]
      teamNilTricks[t] += took
      if (took === 0) { delta[t] += 100; nilResult[seat] = 100 }
      else { delta[t] -= 100; nilResult[seat] = -100 }
    }
  }

  // Contract scoring per team, using tricks NOT taken by that team's nil bidder(s).
  for (const team of [0, 1] as Team[]) {
    const c = contract[team]
    const effective = tricks[team] - teamNilTricks[team]
    if (c === 0) continue // no contract (both partners nil, or 0+0) — handled by nil only
    if (effective >= c) {
      const over = effective - c
      delta[team] += 10 * c + over
      bags[team] += over
      if (bags[team] >= 10) { delta[team] -= 100; bags[team] -= 10 }
    } else {
      delta[team] -= 10 * c
    }
  }

  const scores: [number, number] = [s.scores[0] + delta[0], s.scores[1] + delta[1]]
  const handLog = s.handLog.concat([{ handNo: s.handNo, contract, tricks, delta, nil: nilResult }])

  // game over? need a team at/over TARGET and a clear leader.
  let winner: Team | null = null
  if (scores[0] >= TARGET || scores[1] >= TARGET) {
    if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1
    // tie at/over target → play another hand (winner stays null)
  }

  const mid: SpadesState = { ...s, scores, bags, handLog, ply: s.ply + 1 }
  if (winner != null) return { ...mid, phase: 'done', winner }
  return dealHand(mid, nextSeat(s.dealer))
}

// ===== AI play =====

function rankSort(a: Card, b: Card) { return a.rank - b.rank }

/** Heuristic card choice for an AI seat. */
export function aiPlay(s: SpadesState, seat: Seat): Card {
  const legal = legalPlays(s, seat)
  if (legal.length === 1) return legal[0]
  const led = leadSuit(s.trick)
  const team = teamOf(seat)
  const partner: Seat = ((seat + 2) % 4) as Seat
  const isNil = s.bids[seat] === 0
  const partnerNil = s.bids[partner] === 0

  const sortedLow = legal.slice().sort(rankSort)
  const sortedHigh = sortedLow.slice().reverse()

  // Nil bidder: dump as low as possible while never winning.
  if (isNil) {
    if (led == null) return sortedLow[0] // lead lowest (legal already excludes unbroken spades)
    const inLed = legal.filter(c => c.suit === led)
    if (inLed.length > 0) {
      // must follow — play the highest card that still stays under the current best, else lowest
      const cur = currentBest(s.trick)
      const safe = inLed.filter(c => !beats(c, cur, led))
      return (safe.length ? safe : inLed).sort(rankSort).reverse()[0] // highest safe / lowest overall throw
    }
    // void: dump highest non-spade junk (avoid wasting trump on a trick we don't want)
    const nonSpade = legal.filter(c => c.suit !== 'S')
    return (nonSpade.length ? nonSpade : legal).sort(rankSort).reverse()[0]
  }

  // Leading a trick.
  if (led == null) {
    // If team still needs tricks, lead a high off-suit ace/king or top spade; else lead low.
    const need = teamContract(s, team) - teamTricks(s, team)
    const offAces = legal.filter(c => c.suit !== 'S' && c.rank === 14)
    if (offAces.length) return offAces[0]
    if (need > 0) {
      const topSpade = legal.filter(c => c.suit === 'S').sort(rankSort).reverse()[0]
      if (topSpade && topSpade.rank >= 12) return topSpade
      return sortedHigh.find(c => c.suit !== 'S') || sortedHigh[0]
    }
    return sortedLow.find(c => c.suit !== 'S') || sortedLow[0]
  }

  const inLed = legal.filter(c => c.suit === led)
  const cur = currentBest(s.trick)
  const partnerWinning = isPartnerWinning(s, seat)
  const need = teamContract(s, team) - teamTricks(s, team)

  if (inLed.length > 0) {
    // must follow suit
    if (partnerWinning && !partnerNil) {
      // partner has it — duck low
      return sortedLow.filter(c => c.suit === led)[0]
    }
    const winners = inLed.filter(c => beats(c, cur, led))
    if (winners.length && (need > 0 || s.trick.length === 3)) {
      // win as cheaply as possible
      return winners.sort(rankSort)[0]
    }
    // can't or shouldn't win → throw lowest
    return inLed.sort(rankSort)[0]
  }

  // void in led suit → trump or discard
  const spades = legal.filter(c => c.suit === 'S')
  if (partnerWinning && !partnerNil) {
    // don't waste a trump; discard lowest non-spade if possible
    const disc = legal.filter(c => c.suit !== 'S').sort(rankSort)
    return disc.length ? disc[0] : spades.sort(rankSort)[0]
  }
  if (spades.length && need > 0) {
    // trump in cheaply enough to beat any spade already played
    const spadeBest = s.trick.filter(t => t.card.suit === 'S').reduce((m, t) => Math.max(m, t.card.rank), 0)
    const overTrumps = spades.filter(c => c.rank > spadeBest).sort(rankSort)
    if (overTrumps.length) return overTrumps[0]
    // can't beat the existing trump → discard junk
    const disc = legal.filter(c => c.suit !== 'S').sort(rankSort)
    return disc.length ? disc[0] : spades.sort(rankSort)[0]
  }
  // discard lowest junk
  const disc = legal.filter(c => c.suit !== 'S').sort(rankSort)
  return disc.length ? disc[0] : spades.sort(rankSort)[0]
}

function teamTricks(s: SpadesState, team: Team): number {
  let t = 0
  for (let seat = 0 as Seat; seat < 4; seat = (seat + 1) as Seat) if (teamOf(seat) === team) t += s.tricksWon[seat]
  return t
}

function currentBest(trick: TrickCard[]): Card | null {
  if (trick.length === 0) return null
  return trick[trickWinnerIndex(trick)].card
}

/** Does playing `c` beat the current best, given the led suit? */
function beats(c: Card, cur: Card | null, led: Suit): boolean {
  if (cur == null) return true
  if (c.suit === 'S' && cur.suit !== 'S') return true
  if (c.suit === 'S' && cur.suit === 'S') return c.rank > cur.rank
  if (cur.suit === 'S') return false
  if (c.suit === led && cur.suit === led) return c.rank > cur.rank
  return false
}

function isPartnerWinning(s: SpadesState, seat: Seat): boolean {
  if (s.trick.length === 0) return false
  const w = s.trick[trickWinnerIndex(s.trick)].seat
  return teamOf(w) === teamOf(seat) && w !== seat
}

/** Advance the game by one AI action (bid or play). No-op if it isn't an AI's turn. */
export function aiStep(s: SpadesState): SpadesState {
  if (s.winner != null) return s
  if (s.phase === 'bidding') {
    return placeBid(s, s.turn, aiBid(s, s.turn))
  }
  if (s.phase === 'playing') {
    return playCard(s, s.turn, aiPlay(s, s.turn))
  }
  return s
}
