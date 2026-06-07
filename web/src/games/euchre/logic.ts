/* EUCHRE — pure partnership trick-taking logic. No React/DOM.
   24-card deck (9,10,J,Q,K,A in four suits). 4 players, partnerships: seats 0&2 vs 1&3.
   Trump selection: round 1 order up the upcard's suit; round 2 name a suit (not the
   turned-down suit). Stick-the-dealer: in round 2 the dealer MUST call a suit.
   RIGHT BOWER = J of trump (highest trump). LEFT BOWER = J of same colour as trump
   (2nd-highest trump; counts AS trump for follow-suit and ranking, not its printed suit). */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type Rank = 9 | 10 | 11 | 12 | 13 | 14   // J=11 Q=12 K=13 A=14
export interface Card { id: number; suit: Suit; rank: Rank }
export interface TrickCard { player: number; card: Card }
export type Phase = 'round1' | 'round2' | 'playing' | 'handover' | 'gameover'

export interface HandResult {
  makerTeam: number          // 0 = seats 0&2, 1 = seats 1&3
  alone: boolean
  makerTricks: number
  text: string
  points: number             // points awarded
  scoringTeam: number        // team that scored
}

export interface EuchreState {
  hands: Card[][]            // 4 hands
  dealer: number
  upcard: Card | null        // null after picked up / turned down
  trump: Suit | null
  maker: number | null       // seat that called trump (null until decided)
  makerTeam: number | null   // team of the maker
  alone: boolean             // maker going alone
  aloneSeat: number | null   // the player sitting out (maker's partner) when alone, else null
  phase: Phase
  turn: number | null        // seat to act (calling) or to play
  passes: number             // passes counted in current calling round
  trick: TrickCard[]
  leader: number
  tricksPlayed: number
  tricksWon: number[]        // per-seat tricks won this hand
  lastTrick: { cards: TrickCard[]; winner: number } | null
  scores: number[]           // [team0, team1] to 10
  handResult: HandResult | null
  winner: number | null      // winning team (0 or 1), null while playing
  ply: number                // monotonic action counter (for AI tick)
  log: { t: string; x: string }[]
}

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
export const NAMES = ['You', 'West', 'North', 'East']
export const SEAT_TEAM = [0, 1, 0, 1]

let UID = 0
function card(suit: Suit, rank: Rank): Card { return { id: ++UID, suit, rank } }

export function buildDeck(): Card[] {
  const d: Card[] = []
  for (const s of SUITS) for (const r of [9, 10, 11, 12, 13, 14] as Rank[]) d.push(card(s, r))
  return d
}
function shuffle<T>(a: T[]): T[] {
  a = a.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] }
  return a
}

export function sameColor(a: Suit, b: Suit): boolean {
  const red = (s: Suit) => s === 'hearts' || s === 'diamonds'
  return red(a) === red(b)
}
export function colorPartner(s: Suit): Suit {
  switch (s) {
    case 'spades': return 'clubs'
    case 'clubs': return 'spades'
    case 'hearts': return 'diamonds'
    case 'diamonds': return 'hearts'
  }
}

/** The suit a card BEHAVES as, given trump (left bower behaves as trump). */
export function effectiveSuit(c: Card, trump: Suit | null): Suit {
  if (trump != null && c.rank === 11 && c.suit === colorPartner(trump)) return trump
  return c.suit
}

export function isRightBower(c: Card, trump: Suit): boolean { return c.rank === 11 && c.suit === trump }
export function isLeftBower(c: Card, trump: Suit): boolean { return c.rank === 11 && c.suit === colorPartner(trump) }

/** Rank of a card for comparison within a trick. Higher = stronger. Trump cards
    (including bowers) always beat non-trump. Right bower highest, then left bower. */
export function cardStrength(c: Card, trump: Suit, ledEff: Suit): number {
  const eff = effectiveSuit(c, trump)
  if (eff === trump) {
    if (isRightBower(c, trump)) return 1000
    if (isLeftBower(c, trump)) return 900
    return 800 + c.rank          // other trump 9..A -> 809..814
  }
  if (eff === ledEff) return 100 + c.rank
  return c.rank                  // off-suit, can't win
}

/** Compute trick winner given trump. */
export function trickWinner(trick: TrickCard[], trump: Suit): number {
  const ledEff = effectiveSuit(trick[0].card, trump)
  let best = trick[0], bestS = cardStrength(trick[0].card, trump, ledEff)
  for (let i = 1; i < trick.length; i++) {
    const s = cardStrength(trick[i].card, trump, ledEff)
    if (s > bestS) { bestS = s; best = trick[i] }
  }
  return best.player
}

/** Legal plays: must follow the effective led suit if able. */
export function legalPlays(hand: Card[], trick: TrickCard[], trump: Suit): Card[] {
  if (trick.length === 0) return hand.slice()
  const ledEff = effectiveSuit(trick[0].card, trump)
  const follow = hand.filter(c => effectiveSuit(c, trump) === ledEff)
  return follow.length ? follow : hand.slice()
}

function push(log: EuchreState['log'], t: string, x: string) { return log.concat([{ t, x }]).slice(-60) }

export function sortHand(h: Card[], trump: Suit | null): Card[] {
  // group: trump block first (by strength), then other suits ascending
  return h.slice().sort((a, b) => {
    if (trump != null) {
      const at = effectiveSuit(a, trump) === trump, bt = effectiveSuit(b, trump) === trump
      if (at && bt) return cardStrength(b, trump, trump) - cardStrength(a, trump, trump)
      if (at) return -1
      if (bt) return 1
    }
    const ea = effectiveSuit(a, trump), eb = effectiveSuit(b, trump)
    if (ea !== eb) return SUITS.indexOf(ea) - SUITS.indexOf(eb)
    return a.rank - b.rank
  })
}

/** Deal a hand. Pass a deck (24 cards) for deterministic tests; else shuffled. */
export function makeGame(optionalDeck?: Card[], dealer = 3, scores: number[] = [0, 0]): EuchreState {
  const deck = optionalDeck ? optionalDeck.slice() : shuffle(buildDeck())
  const hands: Card[][] = [[], [], [], []]
  // deal 5 each (simple round-robin starting left of dealer)
  let k = 0
  for (let r = 0; r < 5; r++) {
    for (let s = 0; s < 4; s++) {
      const seat = (dealer + 1 + s) % 4
      hands[seat].push(deck[k++])
    }
  }
  const upcard = deck[20]
  return {
    hands,
    dealer,
    upcard,
    trump: null,
    maker: null,
    makerTeam: null,
    alone: false,
    aloneSeat: null,
    phase: 'round1',
    turn: (dealer + 1) % 4,
    passes: 0,
    trick: [],
    leader: (dealer + 1) % 4,
    tricksPlayed: 0,
    tricksWon: [0, 0, 0, 0],
    lastTrick: null,
    scores: scores.slice(),
    handResult: null,
    winner: null,
    ply: 0,
    log: [{ t: 'sys', x: `${NAMES[dealer]} deals; upcard is ${cardLabel(upcard)}.` }],
  }
}

function nextActive(s: EuchreState, seat: number): number {
  // skip the seat that is sitting out when going alone
  let n = (seat + 1) % 4
  if (s.alone && s.aloneSeat != null && n === s.aloneSeat) n = (n + 1) % 4
  return n
}

// ===== CALLING ACTIONS =====

/** Round 1: order up the upcard suit (alone optional). */
export function orderUp(s: EuchreState, seat: number, alone = false): EuchreState {
  if (s.phase !== 'round1' || s.turn !== seat || s.upcard == null) return s
  const trump = s.upcard.suit
  const maker = seat
  const makerTeam = SEAT_TEAM[seat]
  // dealer picks up upcard and discards
  const hands = s.hands.map(h => h.slice())
  hands[s.dealer].push(s.upcard)
  let log = push(s.log, seat === 0 ? 'you' : 'ai', `${NAMES[seat]} orders up ${suitName(trump)}${alone ? ' (alone)' : ''}.`)
  // dealer discards weakest non-trump (or weakest trump if all trump)
  hands[s.dealer] = dealerDiscard(hands[s.dealer], trump)
  const aloneSeat = alone ? partnerOf(seat) : null
  const leader = startLeader(s.dealer, alone, aloneSeat)
  log = push(log, 'sys', `${suitName(trump)} is trump. ${NAMES[maker]}'s team are makers.`)
  return Object.assign({}, s, {
    hands, trump, maker, makerTeam, alone, aloneSeat,
    upcard: null, phase: 'playing' as Phase,
    turn: leader, leader, passes: 0, ply: s.ply + 1, log,
  })
}

/** Round 1 or 2: pass. */
export function pass(s: EuchreState, seat: number): EuchreState {
  if ((s.phase !== 'round1' && s.phase !== 'round2') || s.turn !== seat) return s
  const passes = s.passes + 1
  let log = push(s.log, seat === 0 ? 'you' : 'ai', `${NAMES[seat]} passes.`)
  if (s.phase === 'round1') {
    if (passes >= 4) {
      // turn the upcard down; move to round 2
      log = push(log, 'sys', `All pass. ${s.upcard ? cardLabel(s.upcard) + ' turned down.' : ''}`)
      return Object.assign({}, s, {
        phase: 'round2' as Phase, passes: 0, turn: (s.dealer + 1) % 4,
        ply: s.ply + 1, log,
      })
    }
    return Object.assign({}, s, { passes, turn: (seat + 1) % 4, ply: s.ply + 1, log })
  }
  // round 2 — stick the dealer: dealer cannot pass (the 4th to act). passes 0..2 then dealer must call.
  return Object.assign({}, s, { passes, turn: (seat + 1) % 4, ply: s.ply + 1, log })
}

/** Round 2: call a suit as trump (must differ from the turned-down suit). */
export function callSuit(s: EuchreState, seat: number, trump: Suit, alone = false): EuchreState {
  if (s.phase !== 'round2' || s.turn !== seat) return s
  const turnedDown = s.upcard ? s.upcard.suit : null
  if (turnedDown != null && trump === turnedDown) return s
  const maker = seat
  const makerTeam = SEAT_TEAM[seat]
  const aloneSeat = alone ? partnerOf(seat) : null
  const leader = startLeader(s.dealer, alone, aloneSeat)
  let log = push(s.log, seat === 0 ? 'you' : 'ai', `${NAMES[seat]} calls ${suitName(trump)}${alone ? ' (alone)' : ''}.`)
  log = push(log, 'sys', `${suitName(trump)} is trump. ${NAMES[maker]}'s team are makers.`)
  return Object.assign({}, s, {
    trump, maker, makerTeam, alone, aloneSeat,
    upcard: null, phase: 'playing' as Phase,
    turn: leader, leader, passes: 0, ply: s.ply + 1, log,
  })
}

function partnerOf(seat: number): number { return (seat + 2) % 4 }
function startLeader(dealer: number, alone: boolean, aloneSeat: number | null): number {
  let l = (dealer + 1) % 4
  if (alone && aloneSeat != null && l === aloneSeat) l = (l + 1) % 4
  return l
}

function dealerDiscard(hand: Card[], trump: Suit): Card[] {
  // discard the weakest card; never discard a trump unless hand is all trump
  const nonTrump = hand.filter(c => effectiveSuit(c, trump) !== trump)
  const pool = nonTrump.length ? nonTrump : hand
  let worst = pool[0]
  for (const c of pool) if (cardStrength(c, trump, trump) < cardStrength(worst, trump, trump)) worst = c
  return hand.filter(c => c.id !== worst.id)
}

// ===== PLAY =====

export function playCard(s: EuchreState, seat: number, cardId: number): EuchreState {
  if (s.phase !== 'playing' || s.turn !== seat || s.trump == null) return s
  const hand = s.hands[seat]
  const c = hand.find(x => x.id === cardId)
  if (!c) return s
  if (!legalPlays(hand, s.trick, s.trump).some(x => x.id === cardId)) return s

  const hands = s.hands.map((h, i) => i === seat ? h.filter(x => x.id !== cardId) : h)
  const trick = s.trick.concat([{ player: seat, card: c }])
  let log = push(s.log, seat === 0 ? 'you' : 'ai', `${NAMES[seat]} plays ${cardLabel(c)}.`)

  const playersInTrick = s.alone ? 3 : 4
  if (trick.length < playersInTrick) {
    return Object.assign({}, s, { hands, trick, turn: nextActive(s, seat), ply: s.ply + 1, log })
  }

  // resolve trick
  const winner = trickWinner(trick, s.trump)
  const tricksWon = s.tricksWon.slice()
  tricksWon[winner]++
  log = push(log, winner === 0 ? 'you' : 'ai', `${NAMES[winner]} wins trick ${s.tricksPlayed + 1}.`)
  const tricksPlayed = s.tricksPlayed + 1
  let s2: EuchreState = Object.assign({}, s, {
    hands, trick: [], turn: winner, leader: winner, tricksPlayed, tricksWon,
    lastTrick: { cards: trick, winner }, ply: s.ply + 1, log,
  })
  if (tricksPlayed >= 5) return resolveHand(s2)
  return s2
}

function resolveHand(s: EuchreState): EuchreState {
  const trump = s.trump!
  const makerTeam = s.makerTeam!
  const makerTricks = s.tricksWon.reduce((acc, t, seat) => acc + (SEAT_TEAM[seat] === makerTeam ? t : 0), 0)
  let points = 0, scoringTeam: number, text: string
  if (makerTricks >= 3) {
    scoringTeam = makerTeam
    if (makerTricks === 5) {
      if (s.alone) { points = 4; text = `${teamName(makerTeam)} go alone and sweep all 5 — 4 points!` }
      else { points = 2; text = `${teamName(makerTeam)} take all 5 (march) — 2 points.` }
    } else { points = 1; text = `${teamName(makerTeam)} make it (${makerTricks} tricks) — 1 point.` }
  } else {
    scoringTeam = makerTeam === 0 ? 1 : 0
    points = 2
    text = `${teamName(makerTeam)} are euchred — ${teamName(scoringTeam)} score 2 points.`
  }
  const scores = s.scores.slice()
  scores[scoringTeam] += points
  const winner = scores[0] >= 10 ? 0 : scores[1] >= 10 ? 1 : null
  const handResult: HandResult = { makerTeam, alone: s.alone, makerTricks, text, points, scoringTeam }
  return Object.assign({}, s, {
    scores, phase: (winner != null ? 'gameover' : 'handover') as Phase,
    turn: null, handResult, winner, trump,
    log: push(s.log, 'res', text + (winner != null ? `  ${teamName(winner)} win the game!` : '')),
  })
}

/** Start the next hand (rotate dealer), preserving scores. */
export function nextHand(s: EuchreState): EuchreState {
  if (s.winner != null) return s
  return makeGame(undefined, (s.dealer + 1) % 4, s.scores)
}

// ===== AI =====

function trumpStrengthCount(hand: Card[], trump: Suit, upcard?: Card | null, isDealer = false): number {
  // weighted strength of trump holdings (incl. bowers), plus off-suit aces
  let pts = 0
  const h = hand.slice()
  if (isDealer && upcard) h.push(upcard) // dealer will have the upcard
  for (const c of h) {
    if (isRightBower(c, trump)) pts += 4
    else if (isLeftBower(c, trump)) pts += 3
    else if (effectiveSuit(c, trump) === trump) pts += 1 + (c.rank - 9) * 0.25
    else if (c.rank === 14) pts += 0.5 // off-ace
  }
  return pts
}
function countVoidableSuits(hand: Card[], trump: Suit): number {
  const suits = new Set<Suit>()
  for (const c of hand) if (effectiveSuit(c, trump) !== trump) suits.add(effectiveSuit(c, trump))
  return suits.size
}

/** AI calling decision. Returns an action to apply, or null if it should pass. */
export function aiCall(s: EuchreState, seat: number): EuchreState {
  if (s.phase === 'round1' && s.upcard != null) {
    const trump = s.upcard.suit
    const dealerIsPartnerOrSelf = s.dealer === seat || partnerOf(s.dealer) === seat
    // factor: ordering up gives the upcard to the dealer (good if dealer is your team)
    let pts = trumpStrengthCount(s.hands[seat], trump, null, false)
    if (s.dealer === seat) pts = trumpStrengthCount(s.hands[seat], trump, s.upcard, true)
    else if (partnerOf(s.dealer) === seat) pts += 0.6 // partner gets the trump card
    else pts -= 0.4 // giving opponent a trump
    const voids = countVoidableSuits(s.hands[seat], trump)
    if (pts >= 4.2 && trumpStrengthCount(s.hands[seat], trump, s.dealer === seat ? s.upcard : null, s.dealer === seat) >= 5.5 && voids <= 1) {
      return orderUp(s, seat, true)
    }
    if (pts >= 3.3) return orderUp(s, seat, false)
    void dealerIsPartnerOrSelf
    return pass(s, seat)
  }
  if (s.phase === 'round2') {
    const turnedDown = s.upcard ? s.upcard.suit : null
    // evaluate best callable suit
    let bestSuit: Suit | null = null, bestPts = -Infinity
    for (const suit of SUITS) {
      if (turnedDown != null && suit === turnedDown) continue
      let pts = trumpStrengthCount(s.hands[seat], suit, null, false)
      if (s.dealer === seat) pts = trumpStrengthCount(s.hands[seat], suit, null, false)
      if (pts > bestPts) { bestPts = pts; bestSuit = suit }
    }
    const mustCall = seat === s.dealer // stick the dealer
    if (bestSuit != null && (bestPts >= 3.3 || mustCall)) {
      const voids = countVoidableSuits(s.hands[seat], bestSuit)
      const alone = bestPts >= 6 && voids <= 1
      return callSuit(s, seat, bestSuit, alone)
    }
    return pass(s, seat)
  }
  return s
}

/** AI play decision: pick a card id. */
export function aiPlayCard(s: EuchreState, seat: number): number {
  const trump = s.trump!
  const hand = s.hands[seat]
  const legal = legalPlays(hand, s.trick, trump)
  if (legal.length === 1) return legal[0].id

  const partner = partnerOf(seat)
  const myTeam = SEAT_TEAM[seat]

  if (s.trick.length === 0) {
    // leading: if we have the right bower or strong trump, lead trump to draw out
    const trumps = legal.filter(c => effectiveSuit(c, trump) === trump)
        .sort((a, b) => cardStrength(b, trump, trump) - cardStrength(a, trump, trump))
    if (trumps.length >= 2 && cardStrength(trumps[0], trump, trump) >= 1000) return trumps[0].id
    // else lead an off-suit ace if we have one
    const offAce = legal.filter(c => c.rank === 14 && effectiveSuit(c, trump) !== trump)
        .sort((a, b) => b.rank - a.rank)[0]
    if (offAce) return offAce.id
    // else lead lowest non-trump
    const nonTrump = legal.filter(c => effectiveSuit(c, trump) !== trump).sort((a, b) => a.rank - b.rank)
    if (nonTrump.length) return nonTrump[0].id
    return legal.sort((a, b) => cardStrength(a, trump, trump) - cardStrength(b, trump, trump))[0].id
  }

  // following: figure out who's currently winning
  const ledEff = effectiveSuit(s.trick[0].card, trump)
  const curWinner = trickWinner(s.trick, trump)
  const partnerWinning = SEAT_TEAM[curWinner] === myTeam && curWinner !== seat || (curWinner === partner)
  const winningCard = s.trick.find(e => e.player === curWinner)!.card
  const isLast = s.trick.length === (s.alone ? 2 : 3)

  // cards that would win the trick
  const wins = legal.filter(c => {
    const prosp = s.trick.concat([{ player: seat, card: c }])
    return trickWinner(prosp, trump) === seat
  }).sort((a, b) => cardStrength(a, trump, ledEff) - cardStrength(b, trump, ledEff))

  if (partnerWinning && SEAT_TEAM[curWinner] === myTeam) {
    // partner winning: don't waste a winner unless we can't avoid; play lowest card
    // but if partner's card is weak and an opponent could still beat it and we're last, secure it
    const partnerSafe = isLast || cardStrength(winningCard, trump, ledEff) >= 800
    if (partnerSafe) {
      return legal.sort((a, b) => cardStrength(a, trump, ledEff) - cardStrength(b, trump, ledEff))[0].id
    }
  }
  if (wins.length) {
    // win as cheaply as possible
    return wins[0].id
  }
  // can't win — dump lowest
  return legal.sort((a, b) => cardStrength(a, trump, ledEff) - cardStrength(b, trump, ledEff))[0].id
}

/** Single AI step (calling or playing). */
export function aiStep(s: EuchreState): EuchreState {
  if (s.turn == null || s.turn === 0 || s.winner != null) return s
  if (s.phase === 'round1' || s.phase === 'round2') return aiCall(s, s.turn)
  if (s.phase === 'playing') return playCard(s, s.turn, aiPlayCard(s, s.turn))
  return s
}

// ===== labels =====
const RANK_LABEL: Record<number, string> = { 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }
export function rankLabel(r: Rank): string { return RANK_LABEL[r] }
export function suitName(s: Suit): string { return s.charAt(0).toUpperCase() + s.slice(1) }
export const SUIT_GLYPH: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
export function isRed(s: Suit): boolean { return s === 'hearts' || s === 'diamonds' }
export function cardLabel(c: Card): string { return `${RANK_LABEL[c.rank]}${SUIT_GLYPH[c.suit]}` }
export function teamName(team: number): string { return team === 0 ? 'Your team' : 'Opponents' }
