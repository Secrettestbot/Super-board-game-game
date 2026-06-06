/* HEARTS — pure trick-taking logic (no React/DOM).
   4 players (0 = You/South, 1 = West, 2 = North, 3 = East). Standard 52-card deck,
   13 cards each. Optional passing rotates by hand number (left, right, across, hold).
   Holder of 2♣ leads the first trick. Follow suit; no points on the first trick; hearts
   can't be led until "broken". Hearts = 1 pt each, Q♠ = 13 pts (points are bad). Shooting
   the moon (all 26) scores the shooter 0 and everyone else 26. Game ends at 100; lowest
   score wins. */

export type Suit = 'C' | 'D' | 'S' | 'H'
export interface Card { id: number; suit: Suit; rank: number } // rank 2..14 (J=11,Q=12,K=13,A=14)
export interface TrickCard { seat: number; card: Card }
export type PassDir = 'left' | 'right' | 'across' | 'hold'

export interface State {
  handNo: number                 // 1-based hand counter
  hands: Card[][]                // 4 hands
  trick: TrickCard[]             // cards played in the current trick
  played: number                 // tricks completed this hand (0..13)
  scores: number[]               // cumulative game scores (4)
  handPoints: number[]           // points taken this hand (4)
  passDir: PassDir
  phase: 'passing' | 'playing' | 'handover' | 'gameover'
  pending: (number[])            // selected card ids for human pass (kept in UI; logic uses applyPass)
  turn: number | null            // seat to act, null when no one acts
  leader: number                 // who leads the current trick
  heartsBroken: boolean
  lastTrick: { cards: TrickCard[]; winner: number } | null
  winner: number | null          // game winner seat
}

export const NAMES = ['You', 'West', 'North', 'East']
export const SUITS: Suit[] = ['C', 'D', 'S', 'H']
export const SUIT_SYM: Record<Suit, string> = { C: '♣', D: '♦', S: '♠', H: '♥' }
export const TARGET = 100

let UID = 0
function mkCard(suit: Suit, rank: number): Card { return { id: ++UID, suit, rank } }

export function buildDeck(): Card[] {
  const d: Card[] = []
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(mkCard(s, r))
  return d
}

function shuffle<T>(a: T[]): T[] {
  a = a.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] }
  return a
}

export function rankLabel(r: number): string {
  if (r === 14) return 'A'; if (r === 13) return 'K'; if (r === 12) return 'Q'; if (r === 11) return 'J'
  return String(r)
}
export function cardLabel(c: Card): string { return rankLabel(c.rank) + SUIT_SYM[c.suit] }
export function isRed(s: Suit): boolean { return s === 'H' || s === 'D' }

const QSPADES = (c: Card) => c.suit === 'S' && c.rank === 12
export function cardPoints(c: Card): number { return c.suit === 'H' ? 1 : QSPADES(c) ? 13 : 0 }

export function sortHand(h: Card[]): Card[] {
  const order: Record<Suit, number> = { C: 0, D: 1, S: 2, H: 3 }
  return h.slice().sort((a, b) => order[a.suit] - order[b.suit] || a.rank - b.rank)
}

export function passDirForHand(handNo: number): PassDir {
  const m = (handNo - 1) % 4
  return m === 0 ? 'left' : m === 1 ? 'right' : m === 2 ? 'across' : 'hold'
}

// receiver of seat's pass for a given direction (seats clockwise 0->1->2->3)
export function passTarget(seat: number, dir: PassDir): number {
  if (dir === 'left') return (seat + 1) % 4
  if (dir === 'right') return (seat + 3) % 4
  if (dir === 'across') return (seat + 2) % 4
  return seat
}

function findSeatWith2C(hands: Card[][]): number {
  for (let i = 0; i < 4; i++) if (hands[i].some(c => c.suit === 'C' && c.rank === 2)) return i
  return 0
}

/** makeGame() — optionally pass an ordered 52-card deck (for deterministic tests),
    and an optional starting hand number / carried scores. */
export function makeGame(orderedDeck?: Card[], handNo = 1, scores?: number[]): State {
  const deck = orderedDeck ? orderedDeck.slice() : shuffle(buildDeck())
  const hands = [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)].map(sortHand)
  const passDir = passDirForHand(handNo)
  const sc = scores ? scores.slice() : [0, 0, 0, 0]
  const base: State = {
    handNo, hands, trick: [], played: 0,
    scores: sc, handPoints: [0, 0, 0, 0],
    passDir, phase: passDir === 'hold' ? 'playing' : 'passing', pending: [],
    turn: null, leader: 0, heartsBroken: false, lastTrick: null, winner: null,
  }
  if (passDir === 'hold') startPlay(base)
  return base
}

function startPlay(s: State): State {
  const leader = findSeatWith2C(s.hands)
  s.leader = leader
  s.turn = leader
  s.phase = 'playing'
  return s
}

// ===== passing =====
/** apply all four players' chosen cards at once. picks[seat] = array of 3 card ids. */
export function applyPass(s: State, picks: number[][]): State {
  if (s.phase !== 'passing') return s
  const dir = s.passDir
  const removed: Card[][] = [[], [], [], []]
  const hands = s.hands.map((h, seat) => {
    const ids = new Set(picks[seat])
    const keep: Card[] = []
    for (const c of h) { if (ids.has(c.id)) removed[seat].push(c); else keep.push(c) }
    return keep
  })
  for (let seat = 0; seat < 4; seat++) {
    const tgt = passTarget(seat, dir)
    for (const c of removed[seat]) hands[tgt].push(c)
  }
  const ns: State = Object.assign({}, s, { hands: hands.map(sortHand), pending: [] })
  return startPlay(ns)
}

// ===== legal plays =====
function ledSuit(trick: TrickCard[]): Suit | null { return trick.length ? trick[0].card.suit : null }

export function legalPlays(s: State, seat: number): Card[] {
  const hand = s.hands[seat]
  const isFirstTrick = s.played === 0
  const ls = ledSuit(s.trick)

  if (ls != null) {
    const inSuit = hand.filter(c => c.suit === ls)
    if (inSuit.length) {
      // first trick: can't drop points even when following suit (only matters if led suit had points; harmless filter)
      if (isFirstTrick) {
        const safe = inSuit.filter(c => cardPoints(c) === 0)
        return safe.length ? safe : inSuit
      }
      return inSuit
    }
    // void in led suit — can play anything, except no points on the first trick (if possible)
    if (isFirstTrick) {
      const safe = hand.filter(c => cardPoints(c) === 0)
      return safe.length ? safe : hand.slice()
    }
    return hand.slice()
  }

  // leading a trick
  if (isFirstTrick) {
    // first card of the game must be the 2 of clubs
    const twoC = hand.filter(c => c.suit === 'C' && c.rank === 2)
    if (twoC.length) return twoC
  }
  if (!s.heartsBroken) {
    const nonHearts = hand.filter(c => c.suit !== 'H')
    if (nonHearts.length) return nonHearts
    // only hearts left — allowed to lead hearts
  }
  return hand.slice()
}

// ===== trick resolution =====
export function trickWinner(trick: TrickCard[]): number {
  const ls = trick[0].card.suit
  let best = trick[0]
  for (const e of trick) if (e.card.suit === ls && e.card.rank > best.card.rank) best = e
  return best.seat
}

export function playCard(s: State, seat: number, cardId: number): State {
  if (s.phase !== 'playing' || s.turn !== seat || s.winner != null) return s
  const hand = s.hands[seat]
  const c = hand.find(x => x.id === cardId)
  if (!c) return s
  if (!legalPlays(s, seat).some(x => x.id === cardId)) return s

  const hands = s.hands.map((h, i) => i === seat ? h.filter(x => x.id !== cardId) : h)
  const trick = s.trick.concat([{ seat, card: c }])
  const heartsBroken = s.heartsBroken || c.suit === 'H'

  if (trick.length < 4) {
    return Object.assign({}, s, { hands, trick, heartsBroken, turn: (seat + 1) % 4 })
  }

  // resolve the trick
  const winner = trickWinner(trick)
  const pts = trick.reduce((a, e) => a + cardPoints(e.card), 0)
  const handPoints = s.handPoints.slice()
  handPoints[winner] += pts
  const played = s.played + 1

  let ns: State = Object.assign({}, s, {
    hands, trick: [], played, handPoints, heartsBroken,
    leader: winner, turn: winner,
    lastTrick: { cards: trick, winner },
  })

  if (played === 13) ns = finishHand(ns)
  return ns
}

// ===== hand scoring incl. shoot-the-moon =====
function finishHand(s: State): State {
  let hp = s.handPoints.slice()
  // shoot-the-moon: someone took all 26
  const shooter = hp.findIndex(p => p === 26)
  if (shooter !== -1) hp = hp.map((_, i) => (i === shooter ? 0 : 26))

  const scores = s.scores.map((v, i) => v + hp[i])
  const maxed = scores.some(v => v >= TARGET)

  if (maxed) {
    let min = Infinity, winner = 0
    for (let i = 0; i < 4; i++) if (scores[i] < min) { min = scores[i]; winner = i }
    return Object.assign({}, s, { handPoints: hp, scores, phase: 'gameover', turn: null, winner })
  }
  return Object.assign({}, s, { handPoints: hp, scores, phase: 'handover', turn: null })
}

/** Start the next hand after a 'handover' state. */
export function nextHand(s: State): State {
  if (s.phase !== 'handover') return s
  return makeGame(undefined, s.handNo + 1, s.scores)
}

// ===== AI =====
/** AI passing: pass the 3 most dangerous cards — A/K/Q of spades, then high hearts, then
    high cards, preferring to void short non-heart suits. */
export function aiPass(s: State, seat: number): number[] {
  const hand = s.hands[seat]
  const danger = (c: Card): number => {
    let d = 0
    if (c.suit === 'S' && c.rank >= 12) d += 100 + c.rank      // Q/K/A spades: shed
    if (c.suit === 'H') d += 30 + c.rank                        // high hearts risky
    d += c.rank                                                 // generally shed high cards
    return d
  }
  const ranked = hand.slice().sort((a, b) => danger(b) - danger(a))
  return ranked.slice(0, 3).map(c => c.id)
}

function aiChooseLead(s: State, seat: number, legal: Card[]): Card {
  // lead a low card; prefer suits where we're not holding the high cards. avoid leading the
  // Q-spade danger suit if we still hold Q♠. prefer voiding short suits with low cards.
  const byRank = legal.slice().sort((a, b) => a.rank - b.rank)
  // prefer leading lowest non-heart, non-spade-above-J card
  const safe = byRank.filter(c => !(c.suit === 'S' && c.rank >= 12))
  return (safe.length ? safe : byRank)[0]
}

function aiChooseFollow(s: State, seat: number, legal: Card[]): Card {
  const ls = ledSuit(s.trick)!
  const inSuit = legal.filter(c => c.suit === ls)
  const pointsInTrick = s.trick.reduce((a, e) => a + cardPoints(e.card), 0)

  if (inSuit.length) {
    // must follow suit. find the current winning rank of led suit.
    const ledCards = s.trick.filter(e => e.card.suit === ls).map(e => e.card.rank)
    const highSoFar = Math.max(...ledCards)
    const isLast = s.trick.length === 3
    const losing = inSuit.filter(c => c.rank < highSoFar).sort((a, b) => b.rank - a.rank)
    if (losing.length) {
      // duck under: play the highest card that still loses (sheds high cards safely)
      return losing[0]
    }
    // all our cards would win the trick. if there are points to take, minimise damage by
    // playing the lowest (least likely to win on later seats); if we're last we must take it.
    const asc = inSuit.slice().sort((a, b) => a.rank - b.rank)
    if (pointsInTrick > 0 || isLast) return asc[0]
    return asc[0]
  }

  // void in led suit — discard. dump Q♠ first, then high spades (A/K), then high hearts,
  // then highest off-suit junk.
  const qs = legal.find(QSPADES)
  if (qs) return qs
  const highSpade = legal.filter(c => c.suit === 'S' && c.rank >= 12).sort((a, b) => b.rank - a.rank)[0]
  if (highSpade) return highSpade
  const hearts = legal.filter(c => c.suit === 'H').sort((a, b) => b.rank - a.rank)
  if (hearts.length) return hearts[0]
  // dump highest card overall (try to void a suit otherwise)
  return legal.slice().sort((a, b) => b.rank - a.rank)[0]
}

export function aiChoose(s: State, seat: number): Card {
  const legal = legalPlays(s, seat)
  if (legal.length === 1) return legal[0]
  if (s.trick.length === 0) return aiChooseLead(s, seat, legal)
  return aiChooseFollow(s, seat, legal)
}

export function aiPlay(s: State, seat: number): State {
  if (s.phase !== 'playing' || s.turn !== seat || s.winner != null) return s
  return playCard(s, seat, aiChoose(s, seat).id)
}

// ===== convenience for self-play / tests =====
/** Run AI passing for all four seats at once (used in self-play). */
export function aiPassAll(s: State): State {
  if (s.phase !== 'passing') return s
  const picks = [0, 1, 2, 3].map(seat => aiPass(s, seat))
  return applyPass(s, picks)
}
