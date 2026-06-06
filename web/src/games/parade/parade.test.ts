import { describe, it, expect } from 'vitest'
import {
  fullDeck, makeGame, capturedIndices, playCard, scores, finishGame,
  aiPick, aiStep, totalCards, hasAllColors, COLORS, NUM_PLAYERS,
} from './logic'
import type { Card, Color, State } from './logic'

function card(color: Color, value: number, id = value): Card {
  return { id, color, value }
}

describe('deck', () => {
  it('has 66 cards, six colors x 0..10, unique ids', () => {
    const d = fullDeck()
    expect(d.length).toBe(66)
    expect(new Set(d.map(c => c.id)).size).toBe(66)
    for (const color of COLORS) {
      const vals = d.filter(c => c.color === color).map(c => c.value).sort((a, b) => a - b)
      expect(vals).toEqual([0,1,2,3,4,5,6,7,8,9,10])
    }
  })

  it('makeGame deals 5 per hand, 6 to the parade, conserves 66', () => {
    const s = makeGame()
    expect(s.hands.length).toBe(NUM_PLAYERS)
    s.hands.forEach(h => expect(h.length).toBe(5))
    expect(s.parade.length).toBe(6)
    expect(totalCards(s)).toBe(66)
  })
})

describe('capture rule', () => {
  it('first N cards are safe; among the rest, same color OR value <= N captured', () => {
    // parade (front -> back): blue3, red5, green2, orange8, red1, teal9
    const parade: Card[] = [
      card('blue', 3, 100), card('red', 5, 101), card('green', 2, 102),
      card('orange', 8, 103), card('red', 1, 104), card('teal', 9, 105),
    ]
    // played: red 3  => N=3 safe (blue3,red5,green2). Among the rest (orange8,red1,teal9):
    //   orange8: not red, value 8 > 3 -> safe
    //   red1: same color -> captured
    //   teal9: not red, 9 > 3 -> safe
    const played = card('red', 3, 106)
    const idx = capturedIndices(parade, played)
    expect(idx).toEqual([4]) // only red1
  })

  it('value 0 played: nothing safe; captures by color or value 0', () => {
    // played value 0 => N=0, so ALL parade cards are candidates.
    // capture if same color OR value <= 0 (i.e. value 0).
    const parade: Card[] = [
      card('blue', 0, 1), card('red', 4, 2), card('green', 0, 3), card('purple', 7, 4),
    ]
    const played = card('blue', 0, 5)
    // blue0: same color -> cap; red4: no; green0: value 0 -> cap; purple7: no
    expect(capturedIndices(parade, played)).toEqual([0, 2])
  })

  it('playCard captures into the collector pile, plays card to end, conserves cards', () => {
    const parade: Card[] = [
      card('blue', 3, 100), card('red', 5, 101), card('green', 2, 102),
      card('orange', 8, 103), card('red', 1, 104), card('teal', 9, 105),
    ]
    // Build a deterministic state directly.
    const s: State = {
      deck: [card('purple', 6, 200)],
      parade,
      hands: [[card('red', 3, 106), card('teal', 0, 107)], [], []],
      collected: [[], [], []],
      turn: 0, you: 0, phase: 'play', finalRemaining: 0,
      triggerSeat: null, winner: null, log: [],
    }
    const before = totalCards(s)
    const ns = playCard(s, 0, 0)
    expect(ns.collected[0].map(c => c.id)).toEqual([104]) // captured red1
    // parade now: blue3,red5,green2,orange8,teal9 + played red3 at end
    expect(ns.parade.map(c => c.id)).toEqual([100, 101, 102, 103, 105, 106])
    // drew the purple6 to refill to 2
    expect(ns.hands[0].some(c => c.id === 200)).toBe(true)
    expect(ns.hands[0].length).toBe(2)
    expect(totalCards(ns)).toBe(before)
    expect(ns.turn).toBe(1)
  })
})

describe('scoring with color-majority', () => {
  it('majority color counts 1 each; others count face value; ties both majority', () => {
    const s: State = {
      deck: [], parade: [], hands: [[], [], []],
      collected: [
        // seat 0: red 8, red 9 (2 reds), blue 10
        [card('red', 8), card('red', 9), card('blue', 10)],
        // seat 1: red 1 (1 red), blue 2, blue 3 (2 blues)
        [card('red', 1), card('blue', 2), card('blue', 3)],
        // seat 2: blue 4, blue 5 (2 blues) -> ties seat1 for blue majority
        [card('blue', 4), card('blue', 5)],
      ],
      turn: null, you: 0, phase: 'over', finalRemaining: 0,
      triggerSeat: null, winner: null, log: [],
    }
    const sc = scores(s)
    // RED: counts s0=2,s1=1,s2=0. max=2 -> s0 majority (2*1=2). s1 not -> face 1.
    // BLUE: counts s0=1,s1=2,s2=2. max=2 -> s1 & s2 BOTH majority (2 each). s0 face 10.
    // seat0 = red 2 + blue 10 = 12
    // seat1 = red 1 + blue 2(majority) = 3
    // seat2 = blue 2(majority) = 2
    expect(sc[0]).toBe(12)
    expect(sc[1]).toBe(3)
    expect(sc[2]).toBe(2)
  })

  it('no holder of a color contributes nothing', () => {
    const s: State = {
      deck: [], parade: [], hands: [[], [], []],
      collected: [[card('green', 7)], [], []],
      turn: null, you: 0, phase: 'over', finalRemaining: 0,
      triggerSeat: null, winner: null, log: [],
    }
    // only seat0 holds green (count 1 -> majority) => 1 point. others 0.
    const sc = scores(s)
    expect(sc).toEqual([1, 0, 0])
  })
})

describe('end-trigger and final lap', () => {
  it('collecting all six colors trips the final lap, then discard-2 + scoring', () => {
    // seat 0 about to capture the 6th color. Give seat0 collected 5 colors already.
    const fiveColors: Card[] = [
      card('red', 1, 1), card('blue', 1, 2), card('green', 1, 3),
      card('purple', 1, 4), card('orange', 1, 5),
    ]
    // parade has a teal card seat0 will capture with a teal play.
    const parade: Card[] = [card('teal', 2, 10)]
    const s: State = {
      deck: [card('red', 0, 20), card('blue', 0, 21)],
      parade,
      hands: [
        [card('teal', 0, 30), card('red', 6, 31), card('blue', 7, 32)],
        [card('green', 4, 40), card('purple', 3, 41)],
        [card('orange', 2, 50), card('teal', 1, 51)],
      ],
      collected: [fiveColors.slice(), [], []],
      turn: 0, you: 0, phase: 'play', finalRemaining: 0,
      triggerSeat: null, winner: null, log: [],
    }
    // teal0 played: N=0, nothing safe; teal2 same color -> captured (6th color).
    const ns = playCard(s, 0, 0)
    expect(hasAllColors(ns.collected[0])).toBe(true)
    expect(ns.phase).toBe('final')
    expect(ns.triggerSeat).toBe(0)
    expect(ns.turn).toBe(1)
    expect(ns.finalRemaining).toBe(2) // other two players
    // play out the final lap
    let s2 = playCard(ns, 1, aiPick(ns, 1))
    expect(s2.phase).toBe('final')
    expect(s2.turn).toBe(2)
    s2 = playCard(s2, 2, aiPick(s2, 2))
    expect(s2.phase).toBe('over')
    expect(s2.winner).not.toBeNull()
    // each player kept exactly 2 in hand (display); rest went to collected
    s2.hands.forEach(h => expect(h.length).toBeLessThanOrEqual(2))
  })

  it('finishGame moves all-but-2 hand cards into collected', () => {
    const s: State = {
      deck: [], parade: [], hands: [
        [card('red', 1, 1), card('red', 2, 2), card('red', 3, 3), card('red', 4, 4)],
        [card('blue', 5, 5), card('blue', 6, 6)],
        [card('green', 7, 7)],
      ],
      collected: [[], [], []],
      turn: 0, you: 0, phase: 'final', finalRemaining: 0,
      triggerSeat: 0, winner: null, log: [],
    }
    const before = totalCards(s)
    const ns = finishGame(s)
    // seat0: had 4, keeps 2 highest (red3,red4), collects red1,red2
    expect(ns.collected[0].map(c => c.value).sort()).toEqual([1, 2])
    expect(ns.hands[0].length).toBe(2)
    // seat1: 2 -> keeps both, collects none
    expect(ns.collected[1].length).toBe(0)
    // seat2: 1 -> keeps 1
    expect(ns.hands[2].length).toBe(1)
    expect(totalCards(ns)).toBe(before)
    expect(ns.phase).toBe('over')
    expect(ns.winner).not.toBeNull()
  })
})

describe('self-play', () => {
  it('runs to a valid lowest-score winner, conserves 66 cards, no throws', () => {
    let s = makeGame()
    let guard = 0
    while (s.phase !== 'over' && guard < 1000) {
      guard++
      const seat = s.turn
      expect(seat).not.toBeNull()
      const idx = aiPick(s, seat as number)
      s = playCard(s, seat as number, idx < 0 ? 0 : idx)
      expect(totalCards(s)).toBe(66)
    }
    expect(guard).toBeLessThan(1000)
    expect(s.phase).toBe('over')
    expect(s.winner).not.toBeNull()
    const sc = scores(s)
    const min = Math.min(...sc)
    expect(sc[s.winner as number]).toBe(min)
    expect(totalCards(s)).toBe(66)
  })

  it('aiStep is a no-op on the human seat / game over', () => {
    const s = makeGame()
    expect(aiStep(s)).toBe(s) // turn 0 is human
  })
})
