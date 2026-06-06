import { describe, it, expect } from 'vitest'
import * as FX from './logic'
import type { Card, FoxState, Player, TrickCard } from './logic'

// Pure logic test (no DOM). Verifies the deal, trick resolution, the win-the-middle
// scoring table + 7-bonus, an odd-card power, then plays a few full games against the
// real AI asserting no throws + a valid winner. Each hand is a fixed 13 tricks, so it
// terminates fast.

const C = (suit: Card['suit'], rank: number, id = rank): Card => ({ id, suit, rank })
const tc = (player: Player, card: Card): TrickCard => ({ player, card })

describe('the fox in the forest — setup', () => {
  it('deals 13-card hands, a decree/trump, a leader, and a deck remainder', () => {
    const s = FX.makeGame()
    expect(s.hands.you).toHaveLength(FX.HAND_SIZE)
    expect(s.hands.ai).toHaveLength(FX.HAND_SIZE)
    expect(s.decree).toBeTruthy()
    expect(s.trump).toBe(s.decree.suit)
    expect(s.leader === 'you' || s.leader === 'ai').toBe(true)
    expect(s.turn).toBe(s.leader)
    // 33 cards total - 26 dealt - 1 decree = 6 in the draw pile
    expect(s.draw).toHaveLength(33 - 26 - 1)
    // no duplicate card ids across hands + decree + draw
    const all = [...s.hands.you, ...s.hands.ai, s.decree, ...s.draw]
    expect(all).toHaveLength(33)
    expect(new Set(all.map(c => c.id)).size).toBe(33)
  })

  it('a fresh deck is 3 suits × 11 = 33 distinct cards', () => {
    const d = FX.buildDeck()
    expect(d).toHaveLength(33)
    expect(new Set(d.map(c => c.suit)).size).toBe(3)
    for (const s of FX.SUITS) expect(d.filter(c => c.suit === s).map(c => c.rank).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })
})

describe('the fox in the forest — trick resolution', () => {
  it('highest trump beats the led suit', () => {
    // trump = moons. you lead bells 10, fox plays moons 2 (trump) → fox wins.
    const r = FX.resolveTrick([tc('you', C('bells', 10)), tc('ai', C('moons', 2))], 'moons')
    expect(r.winner).toBe('ai')
  })

  it('without trump, the highest card of the led suit wins; off-suit cannot win', () => {
    // trump = moons (not in play). you lead bells 4, fox plays keys 11 (off-suit) → you win.
    const r1 = FX.resolveTrick([tc('you', C('bells', 4)), tc('ai', C('keys', 11))], 'moons')
    expect(r1.winner).toBe('you')
    // both follow bells: 6 vs 8 → fox's 8 wins
    const r2 = FX.resolveTrick([tc('you', C('bells', 6)), tc('ai', C('bells', 8))], 'moons')
    expect(r2.winner).toBe('ai')
  })

  it('higher trump beats lower trump', () => {
    const r = FX.resolveTrick([tc('you', C('moons', 5)), tc('ai', C('moons', 9, 99))], 'moons')
    expect(r.winner).toBe('ai')
  })

  it('follow-suit is enforced when the follower holds the led suit', () => {
    const hand: Card[] = [C('bells', 2, 1), C('bells', 7, 2), C('keys', 9, 3)]
    const legal = FX.legalPlays(hand, C('bells', 4), 'moons')
    expect(legal.map(c => c.id).sort()).toEqual([1, 2]) // only the bells are legal
  })

  it('a follower with none of the led suit may play anything', () => {
    const hand: Card[] = [C('keys', 4, 1), C('moons', 8, 2)]
    const legal = FX.legalPlays(hand, C('bells', 4), 'moons')
    expect(legal).toHaveLength(2)
  })
})

describe('the fox in the forest — scoring', () => {
  it('the win-the-middle band table is correct', () => {
    expect(FX.bandPoints(0)).toBe(6)
    expect(FX.bandPoints(2)).toBe(3)   // 1-3 → 3
    expect(FX.bandPoints(5)).toBe(6)   // 4-6 → 6
    expect(FX.bandPoints(8)).toBe(1)   // 7-9 → 1
    expect(FX.bandPoints(12)).toBe(0)  // 10-13 → 0
    // exhaustive band check
    const expected = [6, 3, 3, 3, 6, 6, 6, 1, 1, 1, 0, 0, 0, 0]
    for (let t = 0; t <= 13; t++) expect(FX.bandPoints(t)).toBe(expected[t])
  })

  it('adds +1 per collected 7 (treasure) on top of the band', () => {
    const won: Card[] = [C('bells', 7, 1), C('keys', 7, 2), C('moons', 3, 3)]
    // 5 tricks → band 6, plus two 7s → 8
    const r = FX.handPoints(won, 5)
    expect(r.sevens).toBe(2)
    expect(r.pts).toBe(8)
  })
})

describe('the fox in the forest — odd-card powers', () => {
  it('the 3 (Witch) is treated as trump for its trick', () => {
    // trump = moons. you lead bells 10; fox plays keys 3 → the 3 counts as trump → fox wins.
    const r = FX.resolveTrick([tc('you', C('bells', 10)), tc('ai', C('keys', 3))], 'moons')
    expect(r.winner).toBe('ai')
    expect(FX.effectiveSuit(C('keys', 3), 'moons')).toBe('moons')
    expect(FX.isTrump(C('keys', 3), 'moons')).toBe(true)
  })

  it('the 9 (Charm) flips a same-suit trick so the lower card wins', () => {
    // trump = moons (not in play). both follow bells: 9 vs 5 → the Charm hands it to the 5.
    const r = FX.resolveTrick([tc('you', C('bells', 9)), tc('ai', C('bells', 5))], 'moons')
    expect(r.charm).toBe(true)
    expect(r.winner).toBe('ai')
  })

  it('the 1 (Swan) swaps the decree, changing trump', () => {
    let s = FX.makeGame()
    // force a known decree + a hand card of a different suit
    const oldTrump = s.trump
    const swapCard = s.hands.you.find(c => c.suit !== oldTrump) ?? s.hands.you[0]
    s = FX.swapDecree(s, 'you', swapCard.id)
    expect(s.trump).toBe(swapCard.suit)
    expect(s.decree.id).toBe(swapCard.id)
    expect(s.hands.you.some(c => c.id === swapCard.id)).toBe(false) // it left the hand
  })

  it('the 11 (Monarch) lead forces the follower to play their highest or lowest of the suit', () => {
    const hand: Card[] = [C('bells', 2, 1), C('bells', 6, 2), C('bells', 10, 3), C('keys', 4, 4)]
    const legal = FX.legalPlays(hand, C('bells', 11), 'moons')
    // only the lowest (2) and highest (10) bells are legal
    expect(legal.map(c => c.id).sort()).toEqual([1, 3])
  })
})

describe('the fox in the forest — full games vs the AI', () => {
  function randomLegalPlay(s: FoxState): FoxState {
    const led = s.trick.length ? s.trick[0].card : null
    const legal = FX.legalPlays(s.hands.you, led, s.trump)
    const pick = legal[(Math.random() * legal.length) | 0]
    return FX.playCard(s, 'you', pick.id)
  }

  it('plays a few full games to a valid winner without throwing, and terminates fast', () => {
    for (let game = 0; game < 4; game++) {
      let s = FX.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 5000) {
        if (s.pending) { s = FX.collectTrick(s); continue }
        if (s.phase === 'handEnd') { s = FX.nextHand(s); continue }
        if (s.phase === 'play') {
          if (s.turn === 'you') s = randomLegalPlay(s)
          else s = FX.aiStep(s)
          continue
        }
        break
      }
      expect(guard).toBeLessThan(5000)            // terminated well under the cap
      expect(s.winner).not.toBeNull()             // a winner was reached
      expect(['you', 'ai', 'tie']).toContain(s.winner)
      expect(s.scores.you >= FX.TARGET || s.scores.ai >= FX.TARGET).toBe(true)
    }
  })
})
