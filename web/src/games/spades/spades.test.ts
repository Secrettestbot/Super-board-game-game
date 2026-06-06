import { describe, it, expect } from 'vitest'
import * as SP from './logic'
import type { Card, Seat, SpadesState, TrickCard } from './logic'

// Build a single card by suit/rank (rank 2..14). Ids are assigned by orderedDeck so
// we instead pull from a fresh ordered deck to get real Card objects.
function findCard(suit: 'C' | 'D' | 'H' | 'S', rank: number): Card {
  const c = SP.orderedDeck().find(x => x.suit === suit && x.rank === rank)
  if (!c) throw new Error('no card')
  return c
}

describe('spades logic', () => {
  it('deals 4 hands of 13 distinct cards covering the whole deck', () => {
    const s = SP.makeGame()
    expect(s.hands.length).toBe(4)
    const ids = new Set<number>()
    for (const h of s.hands) {
      expect(h.length).toBe(13)
      for (const c of h) ids.add(c.id)
    }
    expect(ids.size).toBe(52)
    expect(s.phase).toBe('bidding')
    expect(s.winner).toBeNull()
  })

  it('deterministic ordered deal + bidding flow advances seat-by-seat and starts play left of dealer', () => {
    const s = SP.makeGame(SP.orderedDeck(), 3) // dealer = seat 3 → first to act is seat 0
    expect(s.turn).toBe(0)
    let g = SP.placeBid(s, 0, 3)
    expect(g.turn).toBe(1)
    expect(g.bids[0]).toBe(3)
    g = SP.placeBid(g, 1, 2)
    g = SP.placeBid(g, 2, 4)
    expect(g.phase).toBe('bidding')
    g = SP.placeBid(g, 3, 1)
    expect(g.phase).toBe('playing')
    expect(g.leader).toBe(0) // left of dealer 3
    expect(g.turn).toBe(0)
    // team contracts: A = seats 0+2 = 3+4 = 7 ; B = seats 1+3 = 2+1 = 3
    expect(SP.teamContract(g, 0)).toBe(7)
    expect(SP.teamContract(g, 1)).toBe(3)
  })

  it('nil bid (0) is distinct from no-bid (null) and excluded from team contract', () => {
    let s = SP.makeGame(SP.orderedDeck(), 3)
    s = SP.placeBid(s, 0, 0) // seat 0 nil
    expect(s.bids[0]).toBe(0)
    expect(s.bids[1]).toBeNull()
    s = SP.placeBid(s, 1, 2)
    s = SP.placeBid(s, 2, 5)
    s = SP.placeBid(s, 3, 3)
    expect(SP.teamContract(s, 0)).toBe(5) // seat 0 nil excluded; only seat 2's 5
    expect(SP.teamContract(s, 1)).toBe(5)
  })

  it('legalPlays: must follow led suit, and cannot lead spades until broken', () => {
    // Construct a play-phase state by hand.
    const base = SP.makeGame(SP.orderedDeck(), 3)
    const hand0: Card[] = [findCard('C', 5), findCard('C', 9), findCard('S', 14), findCard('H', 3)]
    const s: SpadesState = {
      ...base, phase: 'playing', spadesBroken: false, leader: 0, turn: 0,
      hands: [hand0, [], [], []], bids: [3, 3, 3, 3], trick: [],
    }
    // leading with spades not broken → spades excluded
    let legal = SP.legalPlays(s, 0)
    expect(legal.some(c => c.suit === 'S')).toBe(false)
    expect(legal.length).toBe(3)

    // following a club lead → only clubs are legal
    const t: SpadesState = { ...s, turn: 0, trick: [{ seat: 3, card: findCard('C', 2) } as TrickCard] }
    legal = SP.legalPlays(t, 0)
    expect(legal.every(c => c.suit === 'C')).toBe(true)
    expect(legal.length).toBe(2)

    // void in led suit (diamonds) → anything incl. spade is legal
    const v: SpadesState = { ...s, turn: 0, trick: [{ seat: 3, card: findCard('D', 2) } as TrickCard] }
    legal = SP.legalPlays(v, 0)
    expect(legal.length).toBe(4)
    expect(legal.some(c => c.suit === 'S')).toBe(true)

    // only spades remain → may lead spades
    const onlyS: SpadesState = { ...s, hands: [[findCard('S', 4), findCard('S', 7)], [], [], []], trick: [] }
    legal = SP.legalPlays(onlyS, 0)
    expect(legal.length).toBe(2)
  })

  it('trick winner: highest spade beats led suit; else highest of led suit', () => {
    // led clubs, no spade → highest club wins
    const t1: TrickCard[] = [
      { seat: 0, card: findCard('C', 10) },
      { seat: 1, card: findCard('C', 13) },
      { seat: 2, card: findCard('H', 14) }, // off-suit, can't win
      { seat: 3, card: findCard('C', 4) },
    ]
    expect(SP.trickWinner(t1)).toBe(1)

    // a spade trumps even a higher led-suit card
    const t2: TrickCard[] = [
      { seat: 0, card: findCard('C', 14) },
      { seat: 1, card: findCard('S', 2) }, // lowest spade trumps the ace of clubs
      { seat: 2, card: findCard('C', 13) },
      { seat: 3, card: findCard('H', 14) },
    ]
    expect(SP.trickWinner(t2)).toBe(1)

    // multiple spades → highest spade
    const t3: TrickCard[] = [
      { seat: 0, card: findCard('D', 9) },
      { seat: 1, card: findCard('S', 7) },
      { seat: 2, card: findCard('S', 12) },
      { seat: 3, card: findCard('S', 5) },
    ]
    expect(SP.trickWinner(t3)).toBe(2)
  })

  it('hand scoring: made = 10*contract + bags; missed = -10*contract; nil ±100; 10 bags = -100', () => {
    // Drive scoreHand via a fully-constructed end-of-hand state by playing out is heavy;
    // instead validate via a state whose tricks/bids we set and step the last play.
    // Simpler: assemble a state right before final trick resolution is awkward, so we test
    // the public scoring through a synthetic full play below in the self-play test. Here we
    // check contract math and bag rollover using a crafted state passed through placeBid/score
    // by simulating tricksWon and reading handLog after the final card.

    // Made-with-overtricks scenario: contract 3, took 5 → 10*3 + 2 bags = 32.
    expect(score(3, 5).deltaA).toBe(32)
    // Missed: contract 4, took 2 → -40.
    expect(score(4, 2).deltaA).toBe(-40)
    // Nil made: seat0 bids nil and takes 0; partner (seat2) bids 3 takes 3 → +100 + 30.
    const r = scoreNil(0, 3, 0, 3)
    expect(r.deltaA).toBe(130)
    // Nil failed: seat0 nil takes 1, partner bids 3 takes 3 (so team has 4, partner alone made 3)
    const r2 = scoreNil(0, 3, 1, 3)
    expect(r2.deltaA).toBe(-100 + 30) // -100 nil, +30 for partner's 3
    // Bag rollover: team-A contract 1 (seat0 bids 1, seat2 nil & takes 0 → +100), seat0 takes 11.
    // → 10 (made) + 10 overtricks; bags 5+10=15 → -100, bags 5; plus seat2 nil +100.
    const rb = scoreWithBags(11, 5)
    expect(rb.deltaA).toBe(10 + 10 - 100 + 100)
    expect(rb.bagsA).toBe(5)
  })

  it('self-play: a full game terminates at a valid winning team under a guard cap, no throws', () => {
    for (let game = 0; game < 5; game++) {
      let s = SP.makeGame()
      let guard = 0
      while (s.winner == null && guard++ < 100000) {
        s = SP.aiStep(s)
      }
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(s.phase).toBe('done')
      // winning team is at/over target and strictly ahead
      expect(s.scores[s.winner!]).toBeGreaterThanOrEqual(SP.TARGET)
      expect(s.scores[s.winner!]).toBeGreaterThan(s.scores[s.winner! === 0 ? 1 : 0])
      // hand log accounts for every hand played
      expect(s.handLog.length).toBe(s.handNo - (s.phase === 'done' ? 0 : 0))
      expect(s.bags[0]).toBeLessThan(10)
      expect(s.bags[1]).toBeLessThan(10)
    }
  })
})

// ---- helpers that exercise scoreHand through a real played-out final trick ----

// Build a state where every seat has exactly the tricks we want, then play the very
// last trick to trigger scoreHand. We do this by constructing a near-empty hand state.
function runFinal(bids: number[], tricksWon: number[], bags: [number, number]): SpadesState {
  // Set up a state with all hands empty except one card each so the final trick resolves.
  // We hand seat 0 leads with a club, others follow with clubs; winner is seat with highest.
  // To control tricksWon precisely we instead inject tricksWon and an already-empty board
  // minus a single trivial trick that adds one trick to seat 0 — then subtract that below.
  const base = SP.makeGame(SP.orderedDeck(), 3)
  // give each seat one club so the last trick is forced & deterministic
  const last: Card[][] = [
    [{ id: 901, suit: 'C', rank: 5 }],
    [{ id: 902, suit: 'C', rank: 4 }],
    [{ id: 903, suit: 'C', rank: 3 }],
    [{ id: 904, suit: 'C', rank: 2 }],
  ]
  const s: SpadesState = {
    ...base,
    phase: 'playing',
    spadesBroken: true,
    leader: 0, turn: 0,
    hands: last,
    bids: bids.slice(),
    tricksWon: tricksWon.slice(), // seat 0 will gain +1 from the forced trick below
    trick: [],
    bags: [bags[0], bags[1]],
    scores: [0, 0],
  }
  let g = s
  g = SP.playCard(g, 0, last[0][0])
  g = SP.playCard(g, 1, last[1][0])
  g = SP.playCard(g, 2, last[2][0])
  g = SP.playCard(g, 3, last[3][0]) // resolves; seat 0 wins (highest club) → +1 trick to seat 0
  return g
}

function lastLog(g: SpadesState) { return g.handLog[g.handLog.length - 1] }

// Team-A contract entirely on seat0; seat2 bids 0 (nil) and takes 0 → +100, which we
// subtract out so the caller sees pure contract math.
function score(contractBid: number, tricksA: number) {
  // seat0 ends with tricksA (the forced final trick gives seat0 +1).
  const tw = [tricksA - 1, 0, 0, 0]
  const g = runFinal([contractBid, 1, 0, 1], tw, [0, 0])
  const l = lastLog(g)
  return { deltaA: l.delta[0] - 100, deltaB: l.delta[1] } // remove seat2's nil-made bonus
}

function scoreNil(nilSeatBid: number, partnerBid: number, nilTricks: number, partnerTricks: number) {
  // seat0 = nil (bid 0), seat2 = partnerBid. seat0 ends with nilTricks, seat2 with partnerTricks.
  // The forced final trick gives seat0 +1, so pre-load seat0 with nilTricks-1.
  const tw = [nilTricks - 1, 0, partnerTricks, 0]
  const g = runFinal([nilSeatBid, 1, partnerBid, 1], tw, [0, 0])
  const l = lastLog(g)
  return { deltaA: l.delta[0], deltaB: l.delta[1] }
}

function scoreWithBags(tricksA: number, startBags: number) {
  // seat0 bids 1 (team-A contract = 1, since seat2 nil is excluded), takes tricksA.
  // seat2 nil and takes 0 tricks (+100). The forced final trick gives seat0 +1.
  const tw = [tricksA - 1, 0, 0, 0]
  const g = runFinal([1, 1, 0, 1], tw, [startBags, 0])
  const l = lastLog(g)
  return { deltaA: l.delta[0], bagsA: g.bags[0] }
}
