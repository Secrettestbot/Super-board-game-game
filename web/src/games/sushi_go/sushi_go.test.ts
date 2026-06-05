import { describe, it, expect } from 'vitest'
import * as SG from './logic'
import type { Card, SushiState } from './logic'

// Pure-logic tests for Sushi Go!: each scoring rule with a KNOWN collection, the
// draft-and-pass conservation invariant, and a 3-game AI self-play to a valid winner
// under a hard guard cap with no throws.

let _id = 1000
function card(kind: Card['kind'], val?: number): Card {
  return val == null ? { id: _id++, kind } : { id: _id++, kind, val }
}

describe('sushi go — round (local) scoring', () => {
  it('tempura: each PAIR = 5, a single = 0', () => {
    expect(SG.scoreCollectionLocal([card('tempura')])).toBe(0)
    expect(SG.scoreCollectionLocal([card('tempura'), card('tempura')])).toBe(5)
    expect(SG.scoreCollectionLocal([card('tempura'), card('tempura'), card('tempura')])).toBe(5)
    expect(SG.scoreCollectionLocal([card('tempura'), card('tempura'), card('tempura'), card('tempura')])).toBe(10)
  })

  it('sashimi: each SET OF 3 = 10, 1 or 2 = 0', () => {
    expect(SG.scoreCollectionLocal([card('sashimi'), card('sashimi')])).toBe(0)
    expect(SG.scoreCollectionLocal([card('sashimi'), card('sashimi'), card('sashimi')])).toBe(10)
    expect(SG.scoreCollectionLocal(Array.from({ length: 6 }, () => card('sashimi')))).toBe(20)
  })

  it('dumpling ladder: 1/2/3/4/5+ = 1/3/6/10/15', () => {
    const ladder = [1, 3, 6, 10, 15, 15]
    for (let n = 1; n <= 6; n++) {
      const coll = Array.from({ length: n }, () => card('dumpling'))
      expect(SG.scoreCollectionLocal(coll)).toBe(ladder[n - 1])
    }
    expect(SG.dumplingPoints(0)).toBe(0)
  })

  it('nigiri base + wasabi triples the NEXT nigiri only', () => {
    // egg=1, salmon=2, squid=3
    expect(SG.scoreCollectionLocal([card('nigiri', 1), card('nigiri', 2), card('nigiri', 3)])).toBe(6)
    // wasabi then squid(3) -> 9; a second squid with no wasabi -> +3 => 12
    expect(SG.scoreCollectionLocal([card('wasabi'), card('nigiri', 3), card('nigiri', 3)])).toBe(12)
    // wasabi with no following nigiri scores nothing
    expect(SG.scoreCollectionLocal([card('wasabi')])).toBe(0)
    // nigiri BEFORE wasabi is not boosted
    expect(SG.scoreCollectionLocal([card('nigiri', 2), card('wasabi')])).toBe(2)
  })

  it('maki: most = 6, second = 3 (3-player), with tie splitting', () => {
    // seat0 = 4 icons (most), seat1 = 2 (second), seat2 = 0
    const m1 = SG.scoreMaki([
      [card('maki', 3), card('maki', 1)],
      [card('maki', 2)],
      [],
    ])
    expect(m1).toEqual([6, 3, 0])
    // tie for most: 6 split -> 3 each, no second place awarded below them
    const m2 = SG.scoreMaki([
      [card('maki', 3)],
      [card('maki', 3)],
      [card('maki', 1)],
    ])
    expect(m2[0]).toBe(3)
    expect(m2[1]).toBe(3)
    expect(m2[2]).toBe(3) // second place: only seat2 below the max
    // nobody has maki -> all zero
    expect(SG.scoreMaki([[], [], []])).toEqual([0, 0, 0])
  })
})

describe('sushi go — game-end pudding scoring', () => {
  it('most puddings +6, fewest -6 in 3-player (split on ties)', () => {
    const base: SushiState = SG.makeGame()
    const s: SushiState = { ...base, round: SG.ROUNDS, scores: [10, 10, 10], puddings: [3, 1, 0], collected: [[], [], []], log: [] }
    const e = SG.endGame(s)
    // seat0 most (+6), seat2 fewest (-6)
    expect(e.scores).toEqual([16, 10, 4])
    expect(e.phase).toBe('gameEnd')
    expect(e.winner).toBe('You')
  })

  it('pudding tie for most splits +6; all-equal puddings: no swing', () => {
    const base: SushiState = SG.makeGame()
    const tie: SushiState = { ...base, round: SG.ROUNDS, scores: [10, 10, 5], puddings: [2, 2, 0], collected: [[], [], []], log: [] }
    const e = SG.endGame(tie)
    // seats 0,1 split +6 -> +3 each ; seat2 fewest -> -6
    expect(e.scores).toEqual([13, 13, -1])
    // all tie for most with a positive count: split +6 (=+2 each), no -6 since max===min
    const allEq: SushiState = { ...base, round: SG.ROUNDS, scores: [4, 5, 6], puddings: [1, 1, 1], collected: [[], [], []], log: [] }
    const e2 = SG.endGame(allEq)
    expect(e2.scores).toEqual([6, 7, 8])
    expect(e2.winner).toBe('AI 2')
    // nobody has any pudding: no swing at all
    const noPud: SushiState = { ...base, round: SG.ROUNDS, scores: [4, 5, 6], puddings: [0, 0, 0], collected: [[], [], []], log: [] }
    const e3 = SG.endGame(noPud)
    expect(e3.scores).toEqual([4, 5, 6])
  })
})

describe('sushi go — draft & pass mechanic', () => {
  it('keeps exactly one card each, passes the rest LEFT, conserving total cards', () => {
    const s0 = SG.makeGame()
    const totalBefore = s0.hands.reduce((n, h) => n + h.length, 0)
    expect(totalBefore).toBe(SG.NPLAYERS * SG.HAND_SIZE)

    // every seat picks its first card
    let s = s0
    for (let seat = 0; seat < SG.NPLAYERS; seat++) s = SG.setPick(s, seat, s.hands[seat][0].id)
    expect(SG.allPicked(s)).toBe(true)
    s = SG.reveal(s)

    const handTotal = s.hands.reduce((n, h) => n + h.length, 0)
    const collTotal = s.collected.reduce((n, c) => n + c.length, 0)
    expect(collTotal).toBe(SG.NPLAYERS)               // one kept each
    expect(handTotal).toBe(totalBefore - SG.NPLAYERS) // rest still in play
    // each hand shrank by one and rotated (now length HAND_SIZE-1)
    expect(s.hands.every(h => h.length === SG.HAND_SIZE - 1)).toBe(true)
  })

  it('chopsticks double-pick: keeps 2, returns a chopsticks to hand', () => {
    // craft a deterministic deck where seat0 starts with chopsticks + two tempura up front
    const deck: Card[] = []
    let id = 1
    deck.push({ id: id++, kind: 'chopsticks' })
    deck.push({ id: id++, kind: 'tempura' })
    deck.push({ id: id++, kind: 'tempura' })
    while (deck.length < SG.NPLAYERS * SG.HAND_SIZE) deck.push({ id: id++, kind: 'pudding' })
    let s = SG.makeGame(deck)
    // seat0 first keeps chopsticks (so it's in collection); others keep anything
    s = SG.setPick(s, 0, s.hands[0][0].id) // chopsticks
    s = SG.setPick(s, 1, s.hands[1][0].id)
    s = SG.setPick(s, 2, s.hands[2][0].id)
    s = SG.reveal(s)
    expect(SG.hasChopsticks(s, 0)).toBe(true)
    // now seat0 has chopsticks in front; double-pick two cards from current hand
    const [a, b] = s.hands[0]
    const before = s.hands[0].length
    s = SG.setPick(s, 0, a.id, b.id)
    s = SG.setPick(s, 1, s.hands[1][0].id)
    s = SG.setPick(s, 2, s.hands[2][0].id)
    const collBefore = s.collected[0].length
    s = SG.reveal(s)
    // seat0 took two cards but a chopsticks returned to its (now passed) hands; net +1 collected
    expect(s.collected[0].length).toBe(collBefore + 1)
    // total cards conserved across the whole table
    const total = s.hands.reduce((n, h) => n + h.length, 0) + s.collected.reduce((n, c) => n + c.length, 0)
    expect(total).toBe(SG.NPLAYERS * SG.HAND_SIZE)
    expect(before).toBeGreaterThanOrEqual(2)
  })
})

describe('sushi go — AI self-play', () => {
  it('plays 3 full games to a valid winner under a guard cap with no throws', () => {
    for (let g = 0; g < 3; g++) {
      let s = SG.makeGame()
      let guard = 0
      expect(() => {
        while (s.winner == null && guard < 500) {
          s = SG.autoStep(s, true)
          guard++
        }
      }).not.toThrow()
      expect(guard).toBeLessThan(500)        // terminated fast
      expect(s.phase).toBe('gameEnd')
      expect(s.winner).not.toBeNull()
      expect(['You', 'AI 1', 'AI 2', 'Tie']).toContain(s.winner)
      // a 3-round game of 9-card hands is ~27 reveals; far under the cap
      expect(guard).toBeLessThan(120)
    }
  })

  it('aiPick always returns a card that exists in the seat hand', () => {
    let s = SG.makeGame()
    for (let seat = 0; seat < SG.NPLAYERS; seat++) {
      const { cardId } = SG.aiPick(s, seat)
      expect(s.hands[seat].some(c => c.id === cardId)).toBe(true)
    }
  })
})
