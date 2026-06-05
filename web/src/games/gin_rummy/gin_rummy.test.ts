import { describe, it, expect } from 'vitest'
import {
  makeCard, freshDeck, cardValue, bestMelds, deadwoodOf, canKnock, isGin,
  resolveKnock, drawStock, drawDiscard, discard, makeGame, aiTurn, nextRound,
  cardCount, GIN_BONUS, UNDERCUT_BONUS, TARGET,
} from './logic'
import type { Card, GinState } from './logic'

// helper: build a hand from "rankSuit" tokens like '7H','TS' (T/10), 'AS','KD'
function H(...toks: string[]): Card[] {
  const rmap: Record<string, number> = { A: 1, T: 10, J: 11, Q: 12, K: 13 }
  return toks.map((t) => {
    const suit = t.slice(-1) as any
    const rtok = t.slice(0, -1)
    const rank = rmap[rtok] ?? Number(rtok)
    return makeCard(rank, suit)
  })
}

describe('card values', () => {
  it('A=1, faces=10, numbers=pip', () => {
    expect(cardValue(makeCard(1, 'S'))).toBe(1)
    expect(cardValue(makeCard(11, 'H'))).toBe(10)
    expect(cardValue(makeCard(12, 'D'))).toBe(10)
    expect(cardValue(makeCard(13, 'C'))).toBe(10)
    expect(cardValue(makeCard(7, 'S'))).toBe(7)
    expect(cardValue(makeCard(10, 'S'))).toBe(10)
  })
})

describe('bestMelds', () => {
  it('partitions a run + a set, computing correct deadwood', () => {
    // run 5-6-7 of hearts, set of three Kings; isolated deadwood: 2C(2) + 9D(9) + AS(1) + 4C(4) = 16
    const hand = H('5H', '6H', '7H', 'KS', 'KD', 'KC', '2C', '9D', 'AS', '4C')
    const r = bestMelds(hand)
    const meldedIds = new Set(r.melds.flatMap((m) => m.cards.map((c) => c.id)))
    expect(r.melds.length).toBe(2)
    expect(meldedIds.size).toBe(6)
    expect(r.deadwoodValue).toBe(2 + 9 + 1 + 4)
  })

  it('finds zero deadwood (gin) for two full melds + a run', () => {
    // run A-2-3-4 spades, run 5-6-7 clubs, set 9x3 -> 10 cards, all melded
    const hand = H('AS', '2S', '3S', '4S', '5C', '6C', '7C', '9H', '9D', '9S')
    const r = bestMelds(hand)
    expect(r.deadwoodValue).toBe(0)
    expect(r.deadwoodCards.length).toBe(0)
  })

  it('prefers the partition that minimises deadwood when a card could go two ways', () => {
    // 9H can serve a 7-8-9H run OR a 9x3 set. The set frees more value:
    // set 9H/9D/9C + run J-Q-K spades -> melded 27+30; deadwood 7H+8H+2D+3D = 20.
    const hand = H('7H', '8H', '9H', '9D', '9C', 'KS', 'QS', 'JS', '2D', '3D')
    const r = bestMelds(hand)
    expect(r.deadwoodValue).toBe(7 + 8 + 2 + 3)
  })
})

describe('knock / gin detection', () => {
  it('canKnock when deadwood <= 10', () => {
    // run 5-6-7H, set Kx3, deadwood 2C+AS+2D+ ... keep <=10
    const hand = H('5H', '6H', '7H', 'KS', 'KD', 'KC', '2C', 'AS', '2D', '3C')
    expect(deadwoodOf(hand)).toBeLessThanOrEqual(10)
    expect(canKnock(hand)).toBe(true)
  })
  it('cannot knock with deadwood > 10', () => {
    const hand = H('5H', '6H', '7H', 'KS', 'KD', 'KC', '9C', '8S', 'QD', 'TD')
    expect(deadwoodOf(hand)).toBeGreaterThan(10)
    expect(canKnock(hand)).toBe(false)
  })
  it('isGin at deadwood 0', () => {
    const hand = H('AS', '2S', '3S', '4S', '5C', '6C', '7C', '9H', '9D', '9S')
    expect(isGin(hand)).toBe(true)
    expect(canKnock(hand)).toBe(true)
  })
})

describe('resolveKnock scoring', () => {
  function st(you: Card[], ai: Card[]): GinState {
    return {
      you, ai, stock: [], discard: [makeCard(13, 'H')], turn: 'you', phase: 'discard',
      scores: { you: 0, ai: 0 }, round: null, winner: null, step: 0, log: [],
    }
  }

  it('plain knock: knocker scores the difference', () => {
    // knocker (you): run 5-6-7H, set Kx3, deadwood 2C+AS+2D = 5
    const you = H('5H', '6H', '7H', 'KS', 'KD', 'KC', '2C', 'AS', '2D', '3H') // 3H not adjacent run? 3H alone
    // opponent: run 4-5-6 clubs, set Qx3, deadwood 8D+9D+TS = 27 (no lay-offs onto K-set/567H run? 8D/9D/TS none fit)
    const ai = H('4C', '5C', '6C', 'QS', 'QD', 'QH', '8D', '9D', 'TS', 'JS') // TS+JS dangle near QS? Q-J-T spades run!
    const s = st(you, ai)
    const r = resolveKnock(s, 'you')
    expect(r.round!.scorer).toBe('you')
    expect(r.round!.kind).toBe('knock')
    expect(r.round!.points).toBe(r.round!.aiDead - r.round!.youDead)
    expect(r.scores.you).toBe(r.round!.points)
  })

  it('gin: knocker scores opp deadwood + 25, no lay-offs', () => {
    const you = H('AS', '2S', '3S', '4S', '5C', '6C', '7C', '9H', '9D', '9S') // gin, 0 deadwood
    const ai = H('4C', '5C', '6C', 'QS', 'QD', 'QH', '8D', '2H', 'TS', 'KC') // some deadwood
    const oDead = deadwoodOf(ai)
    const s = st(you, ai)
    const r = resolveKnock(s, 'you')
    expect(r.round!.kind).toBe('gin')
    expect(r.round!.scorer).toBe('you')
    expect(r.round!.points).toBe(oDead + GIN_BONUS)
    expect(r.round!.layoffs.length).toBe(0)
  })

  it('undercut: opponent ties/beats knocker and scores difference + 25', () => {
    // knocker (you) deadwood ~ 8 (run 5-6-7H, set Kx3, dead 8C? make 8)
    const you = H('5H', '6H', '7H', 'KS', 'KD', 'KC', '8C', 'AS', '2D', '4S') // dead 8+1+2+4=15? too high
    // Build cleaner: knocker dead = 8 (single 8C). melds: 5-6-7H run, K set, plus run 2-3-4 spades
    // knocker melds: K-set, 9-T-J spades run, 5-6-7H run; lone deadwood 3C = 3? need 8.
    const you2 = H('5H', '6H', '7H', 'KS', 'KD', 'KC', '9S', 'TS', 'JS', '8C') // dead = 8C = 8
    // opponent melds Q-set + 4-5-6D run + 7-8-9C run; lone deadwood 4S=4, cannot lay off
    // onto any knocker meld (K-set / 9-T-J♠ / 5-6-7♥), and forms nothing in its own hand.
    const ai = H('4D', '5D', '6D', '7C', '8C', '9C', 'QS', 'QD', 'QH', '4S') // dead=4S=4
    const s = st(you2, ai)
    const r = resolveKnock(s, 'you')
    expect(deadwoodOf(you2)).toBe(8)
    expect(deadwoodOf(ai)).toBe(4)
    expect(r.round!.kind).toBe('undercut')
    expect(r.round!.scorer).toBe('ai')
    expect(r.round!.layoffs.length).toBe(0)
    // opponent remaining (4) < knocker (8): points = (8-4)+25 = 29
    expect(r.round!.points).toBe((8 - 4) + UNDERCUT_BONUS)
    expect(r.scores.ai).toBe(29)
  })

  it('lay-offs reduce opponent deadwood onto knocker melds', () => {
    // knocker melds include a 3-card K set (KS,KD,KC); opponent holds KH as deadwood -> lays off.
    const you = H('5H', '6H', '7H', 'KS', 'KD', 'KC', '2S', '3S', '4S', '9C') // dead 9
    const ai = H('5D', '6D', '7D', 'QS', 'QD', 'QH', '2C', '3C', '4C', 'KH') // KH lays off onto K set -> remaining dead 0
    const s = st(you, ai)
    const r = resolveKnock(s, 'you')
    // KH laid off -> opp remaining deadwood 0 < knocker 9 -> undercut
    expect(r.round!.layoffs.some((c) => c.rank === 13 && c.suit === 'H')).toBe(true)
    expect(r.round!.kind).toBe('undercut')
  })
})

describe('card conservation through draw/discard', () => {
  it('keeps 52 cards across a draw + discard', () => {
    const s = makeGame(freshDeck())
    expect(cardCount(s)).toBe(52)
    const s2 = drawStock(s)
    expect(cardCount(s2)).toBe(52)
    const toDrop = s2.you[s2.you.length - 1]
    const s3 = discard(s2, toDrop.id)
    expect(cardCount(s3)).toBe(52)
    // discard from top is allowed too
    const s4 = drawDiscard(s3) // ai's turn now
    expect(cardCount(s4)).toBe(52)
  })
})

describe('AI self-play terminates with a valid winner', () => {
  it('plays full match to 100, handling stock exhaustion, no throws', () => {
    let s = makeGame(freshDeck(), 12345)
    let guard = 0
    const GUARD = 200000
    let hands = 0
    while (s.winner == null && guard < GUARD) {
      guard++
      if (s.phase === 'gameOver') break
      if (s.phase === 'roundOver') {
        hands++
        expect(hands).toBeLessThan(5000)
        s = nextRound(s, freshDeck(), 1000 + hands)
        continue
      }
      // human seat is also driven by the AI heuristic for the self-play
      if (s.turn === 'you') {
        // mirror aiTurn for the 'you' seat by temporarily flipping turn semantics:
        // simplest: implement an inline greedy turn for 'you'
        s = greedyTurn(s)
      } else {
        s = aiTurn(s)
      }
      // conservation invariant holds every step
      expect(cardCount(s)).toBe(52)
    }
    expect(guard).toBeLessThan(GUARD)
    expect(s.winner === 'you' || s.winner === 'ai').toBe(true)
    expect(Math.max(s.scores.you, s.scores.ai)).toBeGreaterThanOrEqual(TARGET)
  })
})

// A greedy turn for the 'you' seat, reusing the same heuristics as the AI.
function greedyTurn(s: GinState): GinState {
  // temporarily treat as if it's "ai" logic but for 'you': replicate via a tiny driver.
  if (s.phase !== 'draw') return s
  const baseDead = deadwoodOf(s.you)
  const up = s.discard[s.discard.length - 1] ?? null
  let st: GinState
  let drewDiscard = false
  if (up && s.stock.length > 0) {
    const test = s.you.concat([up])
    let bestDead = Infinity
    for (const c of test) { const d = deadwoodOf(test.filter((x) => x.id !== c.id)); if (d < bestDead) bestDead = d }
    if (bestDead < baseDead) { st = drawDiscard(s); drewDiscard = true } else { st = drawStock(s) }
  } else if (s.stock.length > 0) {
    st = drawStock(s)
  } else if (up) {
    st = drawDiscard(s); drewDiscard = true
  } else {
    return s
  }
  const h11 = st.you
  let drop = h11[h11.length - 1]
  let bestDead = Infinity
  for (const c of h11) {
    if (drewDiscard && up && c.id === up.id) continue
    const d = deadwoodOf(h11.filter((x) => x.id !== c.id))
    if (d < bestDead || (d === bestDead && cardValue(c) > cardValue(drop))) { bestDead = d; drop = c }
  }
  return discard(st, drop.id, bestDead <= 10)
}
