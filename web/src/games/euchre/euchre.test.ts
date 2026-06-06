import { describe, it, expect } from 'vitest'
import * as E from './logic'
import type { Card, Suit, Rank } from './logic'

// Pure-logic tests (no DOM). Deck shape, bower-aware ranking + effective suit,
// follow-suit with the left bower, trick winners, hand scoring (1 / march 2 / alone 4 /
// euchred 2), and a self-play full game to a valid winning team under a guard cap.

function c(suit: Suit, rank: Rank): Card { return { id: rank * 10 + E.SUITS.indexOf(suit), suit, rank } }

describe('euchre deck', () => {
  it('builds a 24-card deck of distinct cards (9..A in four suits)', () => {
    const d = E.buildDeck()
    expect(d.length).toBe(24)
    const keys = new Set(d.map(x => x.suit + x.rank))
    expect(keys.size).toBe(24)
    for (const s of E.SUITS) expect(d.filter(x => x.suit === s).length).toBe(6)
    // no 8 or below
    expect(d.every(x => x.rank >= 9 && x.rank <= 14)).toBe(true)
  })
})

describe('bowers', () => {
  it('effectiveSuit: left bower behaves as trump, not its printed suit', () => {
    // trump spades -> left bower is J of clubs (same color black)
    const leftBower = c('clubs', 11)
    expect(E.effectiveSuit(leftBower, 'spades')).toBe('spades')
    expect(E.effectiveSuit(c('clubs', 12), 'spades')).toBe('clubs') // Q clubs stays clubs
    // a non-bower of trump's printed suit is trump
    expect(E.effectiveSuit(c('spades', 14), 'spades')).toBe('spades')
    // right bower printed suit IS trump
    expect(E.effectiveSuit(c('spades', 11), 'spades')).toBe('spades')
  })

  it('left bower ranks 2nd-highest trump, below the right bower, above ace of trump', () => {
    const trump: Suit = 'hearts'
    const right = c('hearts', 11)      // J hearts (right bower)
    const left = c('diamonds', 11)     // J diamonds (left bower, same red color)
    const aceTrump = c('hearts', 14)
    const sr = E.cardStrength(right, trump, trump)
    const sl = E.cardStrength(left, trump, trump)
    const sa = E.cardStrength(aceTrump, trump, trump)
    expect(sr).toBeGreaterThan(sl)
    expect(sl).toBeGreaterThan(sa)
  })

  it('left bower counts as trump for follow-suit', () => {
    const trump: Suit = 'spades'
    // led a spade (trump). Hand holds the left bower (J clubs) and an off-suit heart.
    const hand: Card[] = [c('clubs', 11), c('hearts', 14), c('diamonds', 9)]
    const trick = [{ player: 1, card: c('spades', 10) }]
    const legal = E.legalPlays(hand, trick, trump)
    // must follow trump with the left bower; heart/diamond are NOT legal
    expect(legal.length).toBe(1)
    expect(legal[0].rank).toBe(11)
    expect(legal[0].suit).toBe('clubs')
  })
})

describe('trick winner with bowers', () => {
  it('left bower beats the ace of trump; right beats left', () => {
    const trump: Suit = 'clubs'
    // led clubs. cards: A clubs (p0), left bower J spades (p1), right bower J clubs (p2), 9 clubs (p3)
    const trick = [
      { player: 0, card: c('clubs', 14) },
      { player: 1, card: c('spades', 11) }, // left bower
      { player: 2, card: c('clubs', 11) },  // right bower
      { player: 3, card: c('clubs', 9) },
    ]
    expect(E.trickWinner(trick, trump)).toBe(2)
    // remove right bower -> left bower wins
    expect(E.trickWinner(trick.filter(t => t.player !== 2), trump)).toBe(1)
  })

  it('off-suit cards cannot beat any trump; highest of led suit wins absent trump', () => {
    const trump: Suit = 'hearts'
    const trick = [
      { player: 0, card: c('spades', 10) }, // led spades
      { player: 1, card: c('spades', 14) }, // A spades
      { player: 2, card: c('clubs', 14) },  // off-suit ace, loses
    ]
    expect(E.trickWinner(trick, trump)).toBe(1)
  })
})

// helper: build a deterministic deck that deals known hands.
// makeGame deals 5 each round-robin starting left of dealer, dealer=3 default,
// then deck[20] is the upcard. Layout index for deal: r*4 + s where seat=(dealer+1+s)%4.
function deckFromHands(hands: [Card[], Card[], Card[], Card[]], upcard: Card, dealer = 3): Card[] {
  const deck: Card[] = new Array(21)
  for (let r = 0; r < 5; r++) {
    for (let s = 0; s < 4; s++) {
      const seat = (dealer + 1 + s) % 4
      deck[r * 4 + s] = hands[seat][r]
    }
  }
  deck[20] = upcard
  return deck
}

describe('hand scoring', () => {
  it('deterministic deal: makers march = 2 points (or appropriate)', () => {
    // Give team0 (seats 0,2) an overwhelming trump hand so they sweep.
    const hands: [Card[], Card[], Card[], Card[]] = [
      [c('spades', 11), c('clubs', 11), c('spades', 14), c('spades', 13), c('spades', 12)], // seat0: monster
      [c('hearts', 9), c('hearts', 10), c('hearts', 12), c('diamonds', 9), c('diamonds', 10)], // seat1
      [c('spades', 10), c('spades', 9), c('clubs', 14), c('clubs', 13), c('clubs', 12)],     // seat2
      [c('hearts', 13), c('hearts', 14), c('diamonds', 12), c('diamonds', 13), c('diamonds', 14)], // seat3 dealer
    ]
    const upcard = c('clubs', 9)
    // upcard clubs -> if team0 orders up, trump=clubs. seat0 has J spades(left? no). Let's use spades trump instead.
    // We'll order up nothing; instead set trump spades via round2 from seat0.
    let s = E.makeGame(deckFromHands(hands, upcard, 3), 3)
    expect(s.upcard!.suit).toBe('clubs')
    // round1: everyone passes (clubs not their strength scenario) -> we force passes
    s = E.pass(s, 0); s = E.pass(s, 1); s = E.pass(s, 2); s = E.pass(s, 3)
    expect(s.phase).toBe('round2')
    // seat0 calls spades
    s = E.callSuit(s, 0, 'spades', false)
    expect(s.trump).toBe('spades')
    expect(s.phase).toBe('playing')
    // auto-play to completion using AI for all seats but seat0 also via aiPlayCard
    let guard = 0
    while (s.phase === 'playing' && guard++ < 40) {
      const seat = s.turn!
      const id = E.aiPlayCard(s, seat)
      s = E.playCard(s, seat, id)
    }
    expect(s.handResult).not.toBeNull()
    expect(s.handResult!.makerTeam).toBe(0)
    // team0 should make at least 3
    expect(s.handResult!.makerTricks).toBeGreaterThanOrEqual(3)
    expect([1, 2]).toContain(s.handResult!.points)
  })

  it('euchred: makers fail -> defenders get 2', () => {
    // team1 (seat1,3) makers but team0 holds all trump -> euchre
    const hands: [Card[], Card[], Card[], Card[]] = [
      [c('spades', 11), c('clubs', 11), c('spades', 14), c('spades', 13), c('spades', 12)], // seat0 monster trump=spades
      [c('hearts', 9), c('hearts', 10), c('hearts', 12), c('diamonds', 9), c('diamonds', 10)], // seat1
      [c('spades', 10), c('spades', 9), c('clubs', 14), c('clubs', 13), c('clubs', 12)],     // seat2
      [c('hearts', 13), c('hearts', 14), c('diamonds', 12), c('diamonds', 13), c('diamonds', 14)], // seat3 dealer
    ]
    const upcard = c('clubs', 9)
    let s = E.makeGame(deckFromHands(hands, upcard, 3), 3)
    s = E.pass(s, 0); s = E.pass(s, 1); s = E.pass(s, 2); s = E.pass(s, 3)
    // round2 starts at seat0 (dealer+1). seat0 passes so the turn reaches seat1.
    expect(s.phase).toBe('round2')
    expect(s.turn).toBe(0)
    s = E.pass(s, 0)
    // seat1 (team1) calls spades as trump even though team0 holds it -> they'll be euchred
    s = E.callSuit(s, 1, 'spades', false)
    expect(s.makerTeam).toBe(1)
    let guard = 0
    while (s.phase === 'playing' && guard++ < 40) {
      const seat = s.turn!
      const id = E.aiPlayCard(s, seat)
      s = E.playCard(s, seat, id)
    }
    expect(s.handResult).not.toBeNull()
    expect(s.handResult!.makerTricks).toBeLessThan(3)
    expect(s.handResult!.points).toBe(2)
    expect(s.handResult!.scoringTeam).toBe(0)
  })
})

describe('going alone', () => {
  it('maker alone sweeping all 5 scores 4 points; partner sits out (3 cards per trick)', () => {
    const hands: [Card[], Card[], Card[], Card[]] = [
      [c('spades', 11), c('clubs', 11), c('spades', 14), c('spades', 13), c('spades', 12)], // seat0 monster (trump spades)
      [c('hearts', 9), c('hearts', 10), c('hearts', 12), c('diamonds', 9), c('diamonds', 10)],
      [c('spades', 10), c('spades', 9), c('clubs', 14), c('clubs', 13), c('clubs', 12)],
      [c('hearts', 13), c('hearts', 14), c('diamonds', 12), c('diamonds', 13), c('diamonds', 14)],
    ]
    const upcard = c('clubs', 9)
    let s = E.makeGame(deckFromHands(hands, upcard, 3), 3)
    s = E.pass(s, 0); s = E.pass(s, 1); s = E.pass(s, 2); s = E.pass(s, 3)
    s = E.callSuit(s, 0, 'spades', true) // seat0 alone
    expect(s.alone).toBe(true)
    expect(s.aloneSeat).toBe(2) // partner sits out
    let guard = 0
    while (s.phase === 'playing' && guard++ < 40) {
      // alone -> only 3 active players; partner (seat2) is skipped automatically by turn order
      expect(s.turn).not.toBe(2)
      const seat = s.turn!
      s = E.playCard(s, seat, E.aiPlayCard(s, seat))
    }
    expect(s.handResult).not.toBeNull()
    expect(s.handResult!.makerTricks).toBe(5)
    expect(s.handResult!.alone).toBe(true)
    expect(s.handResult!.points).toBe(4)
  })
})

describe('self-play', () => {
  it('plays full games to 10 with a valid winning team, no throws, terminates', () => {
    for (let trial = 0; trial < 12; trial++) {
      let s = E.makeGame()
      let guard = 0
      while (s.winner == null && guard++ < 5000) {
        if (s.phase === 'handover') { s = E.nextHand(s); continue }
        if (s.turn == null) break
        if (s.turn === 0) {
          // drive seat 0 with the same AI to keep it self-playing
          if (s.phase === 'round1' || s.phase === 'round2') s = E.aiCall(s, 0)
          else s = E.playCard(s, 0, E.aiPlayCard(s, 0))
        } else {
          s = E.aiStep(s)
        }
      }
      expect(guard).toBeLessThan(5000)
      expect(s.winner).not.toBeNull()
      expect([0, 1]).toContain(s.winner)
      expect(s.scores[s.winner!]).toBeGreaterThanOrEqual(10)
    }
  })
})
