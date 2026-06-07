/* THE FOX IN THE FOREST — game logic (built for this codebase, not ported).

   A two-player trick-taking duel. The deck has 3 suits — Bells, Keys, Moons — each
   numbered 1..11 (33 cards). ODD cards carry storybook powers. Each HAND deals 13
   cards to each player and flips the next card as the DECREE, whose suit is trump for
   the hand; the rest of the deck is the small draw pile (the "5" power feeds from it).
   Thirteen tricks are played: the leader plays, the follower must follow the led suit
   if able, else plays anything. Highest trump wins, else the highest card of the led
   suit. You score not by greed but by landing in the MIDDLE band of tricks won.

   ODD-CARD POWERS (the consistent subset implemented here):
     1  (Swan)     — when you LEAD a 1, you swap the decree card with a card from hand,
                     changing trump for the rest of the hand.
     3  (Witch)    — counts as the trump suit for the trick it is played in, whatever
                     its printed suit.
     5  (Treasure) — when you play a 5, you draw the top card of the draw pile, then
                     discard one card from hand (here: auto draw + discard the worst).
     7  (Treasure) — each 7 you collect in won tricks is worth +1 bonus point at scoring.
     9  (Charm)    — if BOTH players follow the led suit (no trump in play), the SECOND
                     highest of the led suit wins instead of the highest.
    11  (Monarch)  — when an 11 LEADS, the follower must play their HIGHEST or LOWEST
                     card of the led suit (if they hold the led suit at all).

   SCORING per hand by tricks won (official "win the middle" table):
     0 -> 6,  1-3 -> 3,  4-6 -> 6,  7-9 -> 1,  10-13 -> 0,  plus +1 per 7 collected.
   First player to reach the target (21) over multiple hands wins the game. */

export type Player = 'you' | 'ai'
export type Suit = 'bells' | 'keys' | 'moons'

export interface Card { id: number; suit: Suit; rank: number }
export interface TrickCard { player: Player; card: Card }
export interface LogEntry { t: string; x: string }
export type Phase = 'play' | 'handEnd' | 'gameOver'

export interface HandResult {
  hand: number
  you: { tricks: number; sevens: number; pts: number }
  ai: { tricks: number; sevens: number; pts: number }
}

export interface FoxState {
  hand: number                                   // which deal (1-based)
  phase: Phase
  hands: { you: Card[]; ai: Card[] }
  draw: Card[]                                    // remaining deck (for the 5 power)
  decree: Card                                    // flipped card; its suit is trump
  trump: Suit
  won: { you: Card[]; ai: Card[] }               // cards captured this hand
  tricksWon: { you: number; ai: number }
  scores: { you: number; ai: number }
  leader: Player
  turn: Player
  trick: TrickCard[]
  pending: { winner: Player; ledSuit: Suit } | null   // a completed trick awaiting collect
  handLog: HandResult[]
  log: LogEntry[]
  winner: Player | 'tie' | null
}

export const SUITS: Suit[] = ['bells', 'keys', 'moons']
export const SUIT_NAME: Record<Suit, string> = { bells: 'Bells', keys: 'Keys', moons: 'Moons' }
export const TARGET = 21
export const HAND_SIZE = 13

const other = (p: Player): Player => p === 'you' ? 'ai' : 'you'
function push(log: LogEntry[], t: string, x: string): LogEntry[] { return log.concat([{ t, x }]).slice(-24) }

let UID = 0
function shuffle<T>(a: T[]): T[] {
  a = a.slice()
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] }
  return a
}

export function buildDeck(): Card[] {
  const d: Card[] = []
  for (const s of SUITS) for (let r = 1; r <= 11; r++) d.push({ id: ++UID, suit: s, rank: r })
  return d
}

// ===== dealing =====
export function dealHand(prev: Pick<FoxState, 'hand' | 'scores' | 'handLog' | 'leader'> & { log: LogEntry[] }): FoxState {
  const deck = shuffle(buildDeck())
  const you = deck.slice(0, HAND_SIZE)
  const ai = deck.slice(HAND_SIZE, HAND_SIZE * 2)
  const decree = deck[HAND_SIZE * 2]
  const draw = deck.slice(HAND_SIZE * 2 + 1)
  const leader = prev.leader
  return {
    hand: prev.hand,
    phase: 'play',
    hands: { you, ai },
    draw,
    decree,
    trump: decree.suit,
    won: { you: [], ai: [] },
    tricksWon: { you: 0, ai: 0 },
    scores: prev.scores,
    leader,
    turn: leader,
    trick: [],
    pending: null,
    handLog: prev.handLog,
    log: push(prev.log, 'sys', `Hand ${prev.hand}: trump is ${SUIT_NAME[decree.suit]} (decree ${decree.rank}). ${leader === 'you' ? 'You' : 'The fox'} lead${leader === 'you' ? '' : 's'}.`),
    winner: null,
  }
}

export function makeGame(): FoxState {
  return dealHand({ hand: 1, scores: { you: 0, ai: 0 }, handLog: [], leader: 'you', log: [] })
}

// ===== trick resolution =====
// The witch (3) is treated as trump regardless of printed suit.
export function effectiveSuit(c: Card, trump: Suit): Suit { return c.rank === 3 ? trump : c.suit }
export function isTrump(c: Card, trump: Suit): boolean { return effectiveSuit(c, trump) === trump }

/** Legal plays for the follower given the led card and current hand. */
export function legalPlays(hand: Card[], led: Card | null, trump: Suit): Card[] {
  if (!led) return hand.slice()
  const ledSuit = effectiveSuit(led, trump)
  const sameSuit = hand.filter(c => effectiveSuit(c, trump) === ledSuit)
  if (sameSuit.length === 0) return hand.slice()
  // 11-lead Monarch power: must play highest or lowest of the led suit.
  if (led.rank === 11) {
    const sorted = sameSuit.slice().sort((a, b) => a.rank - b.rank)
    const lowest = sorted[0], highest = sorted[sorted.length - 1]
    const set = new Set([lowest.id, highest.id])
    return sameSuit.filter(c => set.has(c.id))
  }
  return sameSuit
}

/**
 * Decide who wins a completed two-card trick. `cards[0]` is the lead.
 * Highest trump wins; else highest of the led suit. The 9 "Charm" twist: if both
 * cards follow the led suit and neither is trump, the LOWER card wins instead.
 */
export function resolveTrick(cards: TrickCard[], trump: Suit): { winner: Player; ledSuit: Suit; charm: boolean } {
  const led = cards[0].card
  const ledSuit = effectiveSuit(led, trump)
  const a = cards[0], b = cards[1]
  const at = isTrump(a.card, trump), bt = isTrump(b.card, trump)

  // trump beats non-trump
  if (at && !bt) return { winner: a.player, ledSuit, charm: false }
  if (bt && !at) return { winner: b.player, ledSuit, charm: false }
  if (at && bt) return { winner: a.card.rank > b.card.rank ? a.player : b.player, ledSuit, charm: false }

  // neither trump — only cards following the led suit can win
  const aFollows = effectiveSuit(a.card, trump) === ledSuit
  const bFollows = effectiveSuit(b.card, trump) === ledSuit
  if (aFollows && !bFollows) return { winner: a.player, ledSuit, charm: false }
  if (bFollows && !aFollows) return { winner: b.player, ledSuit, charm: false }

  // both follow the led suit, neither trump — 9 Charm flips the comparison
  const charm = a.card.rank === 9 || b.card.rank === 9
  const aWinsHigh = a.card.rank > b.card.rank
  const aWins = charm ? !aWinsHigh : aWinsHigh
  return { winner: aWins ? a.player : b.player, ledSuit, charm }
}

// ===== 5 Treasure: draw one then discard worst =====
function drawAndDiscard(s: FoxState, who: Player): FoxState {
  if (s.draw.length === 0) return s
  const draw = s.draw.slice()
  const drawn = draw.shift()!
  const hand = s.hands[who].concat([drawn])
  // discard the "worst": lowest non-trump, else lowest overall
  const nonTrump = hand.filter(c => !isTrump(c, s.trump))
  const pool = nonTrump.length ? nonTrump : hand
  let worst = pool[0]
  for (const c of pool) if (c.rank < worst.rank) worst = c
  const newHand = hand.filter(c => c.id !== worst.id)
  return Object.assign({}, s, {
    draw,
    hands: Object.assign({}, s.hands, { [who]: newHand }),
    log: push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You' : 'The fox'} played a 5 — drew a card and discarded ${SUIT_NAME[worst.suit]} ${worst.rank}.`),
  })
}

// ===== 1 Swan: when LEADING a 1, swap the decree with a hand card =====
/** Swap the decree card for `cardId` from `who`'s hand (changes trump). Used by the 1 power. */
export function swapDecree(s: FoxState, who: Player, cardId: number): FoxState {
  const hand = s.hands[who]
  const give = hand.find(c => c.id === cardId)
  if (!give) return s
  const newHand = hand.filter(c => c.id !== cardId).concat([s.decree])
  const decree = give
  return Object.assign({}, s, {
    hands: Object.assign({}, s.hands, { [who]: newHand }),
    decree,
    trump: decree.suit,
    log: push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You' : 'The fox'} swapped the decree — trump is now ${SUIT_NAME[decree.suit]}.`),
  })
}

// ===== playing a card =====
export function playCard(s: FoxState, who: Player, cardId: number): FoxState {
  if (s.winner || s.phase !== 'play' || s.pending || s.turn !== who) return s
  const led = s.trick.length ? s.trick[0].card : null
  const legal = legalPlays(s.hands[who], led, s.trump)
  if (!legal.some(c => c.id === cardId)) return s
  const card = s.hands[who].find(c => c.id === cardId)!

  let ns: FoxState = Object.assign({}, s, {
    hands: Object.assign({}, s.hands, { [who]: s.hands[who].filter(c => c.id !== cardId) }),
    trick: s.trick.concat([{ player: who, card }]),
    log: push(s.log, who === 'you' ? 'you' : 'ai', `${who === 'you' ? 'You' : 'The fox'} played ${SUIT_NAME[card.suit]} ${card.rank}.`),
  })

  // 5 Treasure power resolves immediately on play
  if (card.rank === 5) ns = drawAndDiscard(ns, who)

  if (ns.trick.length === 1) {
    // leader played — follower to act
    return Object.assign({}, ns, { turn: other(who) })
  }

  // trick complete — resolve. Phase stays 'play'; `pending` gates collection so the
  // UI can reveal both cards before collectTrick advances (or ends the hand).
  const { winner, ledSuit, charm } = resolveTrick(ns.trick, ns.trump)
  let log = ns.log
  if (charm) log = push(log, 'sys', `The Charm (9) turns the trick — the lower card takes it.`)
  log = push(log, winner === 'you' ? 'you' : 'ai', `${winner === 'you' ? 'You take' : 'The fox takes'} the trick.`)
  return Object.assign({}, ns, { turn: winner, pending: { winner, ledSuit }, log })
}

/** After a completed trick is shown, collect it and either lead the next trick or end the hand. */
export function collectTrick(s: FoxState): FoxState {
  if (!s.pending) return s
  const winner = s.pending.winner
  const cards = s.trick.map(t => t.card)
  const won = Object.assign({}, s.won, { [winner]: s.won[winner].concat(cards) })
  const tricksWon = Object.assign({}, s.tricksWon, { [winner]: s.tricksWon[winner] + 1 })

  const handOver = s.hands.you.length === 0 && s.hands.ai.length === 0
  if (handOver) {
    return endHand(Object.assign({}, s, { won, tricksWon, trick: [], pending: null }))
  }
  return Object.assign({}, s, {
    won, tricksWon,
    trick: [],
    pending: null,
    phase: 'play' as Phase,
    leader: winner,
    turn: winner,
    log: push(s.log, 'sys', `${winner === 'you' ? 'You' : 'The fox'} lead${winner === 'you' ? '' : 's'} the next trick.`),
  })
}

// ===== scoring =====
export function bandPoints(tricks: number): number {
  if (tricks === 0) return 6
  if (tricks <= 3) return 3
  if (tricks <= 6) return 6
  if (tricks <= 9) return 1
  return 0 // 10..13
}
export function countSevens(cards: Card[]): number { return cards.filter(c => c.rank === 7).length }
export function handPoints(won: Card[], tricks: number): { pts: number; sevens: number } {
  const sevens = countSevens(won)
  return { pts: bandPoints(tricks) + sevens, sevens }
}

function endHand(s: FoxState): FoxState {
  const yr = handPoints(s.won.you, s.tricksWon.you)
  const ar = handPoints(s.won.ai, s.tricksWon.ai)
  const scores = { you: s.scores.you + yr.pts, ai: s.scores.ai + ar.pts }
  const entry: HandResult = {
    hand: s.hand,
    you: { tricks: s.tricksWon.you, sevens: yr.sevens, pts: yr.pts },
    ai: { tricks: s.tricksWon.ai, sevens: ar.sevens, pts: ar.pts },
  }
  let log = push(s.log, 'sys', `Hand ${s.hand} scored — you +${yr.pts} (${s.tricksWon.you} tricks), fox +${ar.pts} (${s.tricksWon.ai} tricks).`)

  const reached = scores.you >= TARGET || scores.ai >= TARGET
  let winner: Player | 'tie' | null = null
  if (reached) {
    if (scores.you > scores.ai) winner = 'you'
    else if (scores.ai > scores.you) winner = 'ai'
    else winner = 'tie'
    log = push(log, winner === 'you' ? 'you' : 'ai', winner === 'tie' ? `Both reach ${TARGET} — a tie.` : `${winner === 'you' ? 'You' : 'The fox'} reach ${TARGET} and win the game.`)
  }
  return Object.assign({}, s, {
    scores,
    handLog: s.handLog.concat([entry]),
    phase: (winner ? 'gameOver' : 'handEnd') as Phase,
    winner,
    log,
  })
}

/** Begin the next hand after a settled (non-final) hand. The deal alternates the leader. */
export function nextHand(s: FoxState): FoxState {
  if (s.winner) return s
  return dealHand({
    hand: s.hand + 1,
    scores: s.scores,
    handLog: s.handLog,
    leader: other(s.leader),
    log: s.log,
  })
}

// ===== AI =====
/**
 * A reasonable trick-taking fox. It follows suit (always picks from legalPlays),
 * and steers toward a comfortable middle band: if it has already won "enough"
 * tricks it tries to duck (shed low / lose the trick); otherwise it tries to take
 * tricks it can win cheaply and otherwise dumps its weakest legal card. It plays
 * odd powers as a natural consequence of which card it chooses.
 */
export function aiStep(s: FoxState): FoxState {
  if (s.winner || s.phase !== 'play' || s.pending || s.turn !== 'ai') return s
  const led = s.trick.length ? s.trick[0].card : null
  const legal = legalPlays(s.hands.ai, led, s.trump)
  if (!legal.length) return s

  const low = (cs: Card[]) => cs.slice().sort((a, b) => a.rank - b.rank)[0]
  const high = (cs: Card[]) => cs.slice().sort((a, b) => b.rank - a.rank)[0]

  // how greedy is the fox? aim to land in the 4..6 band; duck once at/over the band.
  const greedy = s.tricksWon.ai < 4

  let choice: Card

  if (!led) {
    // leading
    if (greedy) {
      // lead a strong trump or a high card to try to take the trick
      const trumps = legal.filter(c => isTrump(c, s.trump))
      choice = trumps.length ? high(trumps) : high(legal)
    } else {
      // ducking — lead a low non-trump
      const nonTrump = legal.filter(c => !isTrump(c, s.trump))
      choice = nonTrump.length ? low(nonTrump) : low(legal)
    }
  } else {
    // following — would each legal card win?
    const wins = (c: Card) => resolveTrick([{ player: 'you', card: led }, { player: 'ai', card: c }], s.trump).winner === 'ai'
    const winners = legal.filter(wins)
    const losers = legal.filter(c => !wins(c))
    if (greedy && winners.length) {
      // win as cheaply as possible
      choice = low(winners)
    } else if (!greedy && losers.length) {
      // duck — lose with the highest card we can safely shed
      choice = high(losers)
    } else {
      // forced outcome — minimise card value spent
      choice = low(legal)
    }
  }

  return playCard(s, 'ai', choice.id)
}

/** Convenience: should the human be prompted to swap the decree (led a 1)? */
export function canSwapDecree(s: FoxState, who: Player): boolean {
  // available immediately after leading a 1 (the 1 is now in the trick as the lead)
  return s.trick.length === 1 && s.trick[0].player === who && s.trick[0].card.rank === 1 && s.hands[who].length > 0
}
