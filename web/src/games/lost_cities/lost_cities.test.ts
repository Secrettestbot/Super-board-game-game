import { describe, it, expect } from 'vitest'
import * as LC from './logic'
import type { LostCitiesState, Card, Colour, Player } from './logic'

// Pure logic test (no DOM). Checks deck composition, the ascending/wager play rule, expedition
// scoring, draw-refill, then plays a few full games to a valid terminal state.

const card = (colour: Colour, value: number, id = 0): Card => ({ id, colour, value })

describe('lost cities — setup', () => {
  it('makeGame() deals a valid 60-card game', () => {
    const s = LC.makeGame()
    // 8 + 8 in hands, 44 in deck, 0 discarded/laid => 60 total of the right composition
    expect(s.hands.you).toHaveLength(8)
    expect(s.hands.ai).toHaveLength(8)
    expect(s.deck).toHaveLength(44)

    const all = [...s.hands.you, ...s.hands.ai, ...s.deck]
    expect(all).toHaveLength(60)
    for (const colour of LC.COLOURS) {
      const suit = all.filter(c => c.colour === colour)
      expect(suit).toHaveLength(12)                                  // 9 numbers + 3 wagers
      expect(suit.filter(c => c.value === 0)).toHaveLength(3)        // three wagers
      for (let v = 2; v <= 10; v++) expect(suit.filter(c => c.value === v)).toHaveLength(1)
    }
    expect(new Set(all.map(c => c.id)).size).toBe(60)               // unique ids

    // expeditions + discards start empty; a player is to act
    for (const colour of LC.COLOURS) {
      expect(s.expeditions.you[colour]).toHaveLength(0)
      expect(s.expeditions.ai[colour]).toHaveLength(0)
      expect(s.discards[colour]).toHaveLength(0)
    }
    expect(s.turn).toBe('you')
    expect(s.phase).toBe('play')
    expect(s.winner).toBeNull()
  })
})

describe('lost cities — play rule', () => {
  it('enforces strictly ascending numbers and wagers-before-numbers', () => {
    const col: Card[] = []
    expect(LC.canPlay(col, card('Y', 4))).toBe(true)            // first number is fine
    const col2 = [card('Y', 6)]
    expect(LC.canPlay(col2, card('Y', 8))).toBe(true)           // higher: ok
    expect(LC.canPlay(col2, card('Y', 6))).toBe(false)          // equal: not strictly ascending
    expect(LC.canPlay(col2, card('Y', 3))).toBe(false)          // lower: illegal
    // a wager after a number is illegal
    expect(LC.canPlay(col2, card('Y', 0))).toBe(false)
    // wagers stack before any number
    expect(LC.canPlay([card('Y', 0)], card('Y', 0))).toBe(true)
    expect(LC.canPlay([card('Y', 0)], card('Y', 5))).toBe(true)
  })

  it('playCard rejects an illegal descending placement on real state', () => {
    let s = LC.makeGame()
    s = forceHand(s, 'you', [card('B', 7, 901), card('B', 3, 902)])
    s = LC.playCard(s, 'you', 901)               // lay Blue 7 (then phase=draw)
    expect(s.expeditions.you.B.map(c => c.value)).toEqual([7])
    s = LC.drawDeck(s, 'you')                     // finish turn -> back to you next round
    s = setTurn(s, 'you')
    const before = s
    s = LC.playCard(s, 'you', 902)               // Blue 3 onto a 7 is illegal -> no-op
    expect(s).toBe(before)
  })
})

describe('lost cities — scoring', () => {
  it('scores a started column with wagers, the −20, and the +20 bonus', () => {
    // numbers 2+5+10 = 17, minus 20 = -3
    expect(LC.scoreColumn([card('R', 2), card('R', 5), card('R', 10)])).toBe(-3)
    // two wagers (×3) on numbers 4+9+10 = 23 -> (23-20)*3 = 9
    expect(LC.scoreColumn([card('R', 0), card('R', 0), card('R', 4), card('R', 9), card('R', 10)])).toBe(9)
    // 8+ cards bonus: one wager (×2), numbers 2+3+4+5+6+7+9 = 36 -> (36-20)*2 = 32, +20 bonus = 52
    const big = [card('G', 0), card('G', 2), card('G', 3), card('G', 4), card('G', 5), card('G', 6), card('G', 7), card('G', 9)]
    expect(big).toHaveLength(8)
    expect(LC.scoreColumn(big)).toBe(52)
    // unstarted scores 0
    expect(LC.scoreColumn([])).toBe(0)
  })
})

describe('lost cities — turn flow', () => {
  it('playing a card then drawing refills the hand to its prior size', () => {
    let s = LC.makeGame()
    const handSize = s.hands.you.length
    const cardId = s.hands.you[0].id
    const colour = s.hands.you[0].colour
    s = LC.playCard(s, 'you', cardId)
    expect(s.hands.you).toHaveLength(handSize - 1)               // played one
    expect(s.phase).toBe('draw')
    expect(s.expeditions.you[colour].length + sumElsewhere(s, colour)).toBeGreaterThan(0)
    const deckBefore = s.deck.length
    s = LC.drawDeck(s, 'you')
    expect(s.hands.you).toHaveLength(handSize)                   // refilled
    expect(s.deck).toHaveLength(deckBefore - 1)
    expect(s.turn).toBe('ai')                                    // passed to rival
    expect(s.phase).toBe('play')
  })
})

describe('lost cities — full games terminate with a valid winner', () => {
  it('random legal human + heuristic AI always reach a clean terminal state', () => {
    for (let g = 0; g < 4; g++) {
      let s = LC.makeGame()
      let guard = 0
      while (!s.winner && guard++ < 2000) {
        if (s.turn === 'you') s = randomLegalTurn(s, 'you')
        else s = LC.aiTurn(s)
      }
      expect(s.winner).not.toBeNull()                            // terminated
      expect(s.deck).toHaveLength(0)                             // ended because deck emptied
      expect(['you', 'ai', 'draw']).toContain(s.winner)
      // winner is consistent with the scores
      const y = LC.score(s, 'you'), a = LC.score(s, 'ai')
      if (s.winner === 'you') expect(y).toBeGreaterThan(a)
      else if (s.winner === 'ai') expect(a).toBeGreaterThan(y)
      else expect(y).toBe(a)
      // every laid card obeys the ascending invariant
      for (const p of ['you', 'ai'] as Player[])
        for (const colour of LC.COLOURS) assertAscending(s.expeditions[p][colour])
    }
  })
})

// ---- helpers ----

function randomLegalTurn(s: LostCitiesState, p: Player): LostCitiesState {
  // phase 1: play or discard
  const hand = s.hands[p]
  const playable = hand.filter(c => LC.canPlay(s.expeditions[p][c.colour], c))
  if (playable.length && Math.random() < 0.6) {
    const c = playable[(Math.random() * playable.length) | 0]
    s = LC.playCard(s, p, c.id)
  } else {
    const c = hand[(Math.random() * hand.length) | 0]
    s = LC.discardCard(s, p, c.id)
  }
  if (s.winner) return s
  // phase 2: draw from deck or a non-empty discard
  const piles = LC.COLOURS.filter(col => s.discards[col].length > 0)
  if (piles.length && Math.random() < 0.3) {
    return LC.drawDiscard(s, p, piles[(Math.random() * piles.length) | 0])
  }
  return LC.drawDeck(s, p)
}

function assertAscending(col: Card[]) {
  let seenNumber = false
  let prev = 0
  for (const c of col) {
    if (LC.isWager(c)) {
      expect(seenNumber).toBe(false)            // no wager after a number
    } else {
      expect(c.value).toBeGreaterThan(prev)     // strictly ascending
      prev = c.value
      seenNumber = true
    }
  }
}

// Replace a hand with a constructed one (test-only state surgery — logic stays pure).
function forceHand(s: LostCitiesState, p: Player, cards: Card[]): LostCitiesState {
  return { ...s, hands: { ...s.hands, [p]: cards } }
}
function setTurn(s: LostCitiesState, p: Player): LostCitiesState {
  return { ...s, turn: p, phase: 'play' }
}
function sumElsewhere(s: LostCitiesState, colour: Colour): number {
  return s.discards[colour].length + s.expeditions.ai[colour].length
}
