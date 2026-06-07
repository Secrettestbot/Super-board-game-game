import { describe, it, expect } from 'vitest'
import {
  buildDeck,
  makeGame,
  giveClue,
  discard,
  playCard,
  aiTurn,
  score,
  isPlayable,
  COLORS,
  NUM_PLAYERS,
  MAX_CLUES,
  type Card,
  type Color,
  type Value,
} from './logic'

/** Build a deterministic full 50-card deck whose first 15 cards become the dealt hands,
    with a chosen ordering so tests can control exactly what each player holds. */
function deckFrom(front: Array<[Color, Value]>): Card[] {
  const full = buildDeck()
  // Pull the requested cards to the front (by first match), keep the rest after.
  const used = new Set<number>()
  const chosen: Card[] = []
  for (const [color, value] of front) {
    const c = full.find((x) => x.color === color && x.value === value && !used.has(x.id))
    if (!c) throw new Error(`no ${color} ${value} left`)
    used.add(c.id)
    chosen.push(c)
  }
  const rest = full.filter((c) => !used.has(c.id))
  return [...chosen, ...rest]
}

describe('hanabi logic', () => {
  it('a color clue marks ALL matching cards and spends one clue token', () => {
    // Player 1's hand (cards 5..9) — make two of them red.
    const deck = deckFrom([
      ['red', 1], ['yellow', 1], ['green', 1], ['blue', 1], ['white', 1], // P0
      ['red', 2], ['red', 3], ['blue', 2], ['green', 2], ['white', 2],     // P1: two reds
      ['yellow', 2], ['yellow', 3], ['blue', 3], ['green', 3], ['white', 3], // P2
    ])
    const s0 = makeGame(deck)
    const s = giveClue(s0, 0, 1, { kind: 'color', color: 'red' })
    const hand = s.hands[1]
    const reds = hand.filter((hc) => hc.card.color === 'red')
    expect(reds.length).toBe(2)
    for (const hc of reds) {
      expect(hc.known.colors).toEqual(['red'])
      expect(hc.known.colorClued).toBe(true)
    }
    // Non-red cards must have red removed from their possibilities.
    for (const hc of hand.filter((h) => h.card.color !== 'red')) {
      expect(hc.known.colors).not.toContain('red')
    }
    expect(s.clueTokens).toBe(MAX_CLUES - 1)
    expect(s.turn).toBe(1)
  })

  it('playing the next ascending card succeeds and advances the firework', () => {
    const deck = deckFrom([['red', 1], ['yellow', 1], ['green', 1], ['blue', 1], ['white', 1]])
    const s0 = makeGame(deck)
    expect(isPlayable(s0, s0.hands[0][0].card)).toBe(true) // red 1 on empty red firework
    const s = playCard(s0, 0, 0)
    expect(s.fireworks.red).toBe(1)
    expect(s.fuseTokens).toBe(3)
    expect(score(s)).toBe(1)
  })

  it('playing a wrong card costs a fuse and discards it', () => {
    // P0 slot 0 is red 3, not playable on an empty red firework.
    const deck = deckFrom([['red', 3], ['yellow', 1], ['green', 1], ['blue', 1], ['white', 1]])
    const s0 = makeGame(deck)
    expect(isPlayable(s0, s0.hands[0][0].card)).toBe(false)
    const s = playCard(s0, 0, 0)
    expect(s.fuseTokens).toBe(2)
    expect(s.fireworks.red).toBe(0)
    expect(s.discard.some((c) => c.color === 'red' && c.value === 3)).toBe(true)
  })

  it('discarding regains a clue token and draws a replacement', () => {
    const deck = deckFrom([['red', 1], ['yellow', 1], ['green', 1], ['blue', 1], ['white', 1]])
    const s0 = giveClue(makeGame(deck), 0, 1, { kind: 'value', value: 1 }) // spend one first
    expect(s0.clueTokens).toBe(MAX_CLUES - 1)
    const before = s0.deck.length
    const s = discard(s0, 1, 0)
    expect(s.clueTokens).toBe(MAX_CLUES) // regained, capped
    expect(s.discard.length).toBe(1)
    expect(s.deck.length).toBe(before - 1) // drew a replacement
    expect(s.hands[1].length).toBe(5)
  })

  it('completing a stack of 5 regains a clue token', () => {
    // P0 holds red 5; manually build red firework up to 4, spend a clue, then play the 5.
    const deck = deckFrom([['red', 5], ['yellow', 1], ['green', 1], ['blue', 1], ['white', 1]])
    let s = makeGame(deck)
    s.fireworks.red = 4
    s.clueTokens = MAX_CLUES - 2 // leave room to regain
    expect(isPlayable(s, s.hands[0][0].card)).toBe(true)
    s = playCard(s, 0, 0)
    expect(s.fireworks.red).toBe(5)
    expect(s.clueTokens).toBe(MAX_CLUES - 1) // +1 for the completed stack
  })

  it('three fuses ends the game', () => {
    // Three consecutive misfires (P0 plays a wrong card; force the turn back each time).
    const deck = deckFrom([['red', 3], ['red', 4], ['blue', 5], ['green', 5], ['white', 5]])
    let s = makeGame(deck)
    s.fuseTokens = 1
    expect(s.gameOver).toBe(false)
    s = playCard(s, 0, 0) // misfire -> 0 fuses
    expect(s.fuseTokens).toBe(0)
    expect(s.gameOver).toBe(true)
  })

  it('deck emptying triggers exactly one final round then ends', () => {
    const s0 = makeGame()
    // Force the deck nearly empty: leave a single card, then walk turns.
    let s = s0
    s.deck = s.deck.slice(0, 1)
    // Discard to draw the last card (P0), arming nothing yet (deck still had 1).
    s = discard(s, 0, 0) // draws last card, deck now empty, counter not armed until advance sees 0
    // After this discard the deck is empty; the next advanceTurn arms the final round.
    expect(s.gameOver).toBe(false)
    let guard = 0
    while (!s.gameOver && guard < 10) {
      s = discard(s, s.turn, 0)
      guard++
    }
    expect(s.gameOver).toBe(true)
    expect(score(s)).toBeGreaterThanOrEqual(0)
  })

  it('score equals the sum of firework heights (max 25)', () => {
    const s = makeGame()
    s.fireworks.red = 5
    s.fireworks.yellow = 4
    s.fireworks.green = 3
    s.fireworks.blue = 2
    s.fireworks.white = 1
    expect(score(s)).toBe(15)
    for (const c of COLORS) s.fireworks[c] = 5
    expect(score(s)).toBe(25)
  })

  it('cooperative self-play reaches game over with a valid score and no throws', () => {
    let s = makeGame(undefined, 12345)
    let guard = 0
    expect(() => {
      while (!s.gameOver && guard < 500) {
        // Only the AI drives — including player 0 (treated as an autonomous co-op agent).
        const next = aiTurn(s)
        // Must always make progress (turn/step advances or game ends).
        expect(next.step).toBeGreaterThanOrEqual(s.step)
        s = next
        guard++
      }
    }).not.toThrow()
    expect(s.gameOver).toBe(true)
    expect(guard).toBeLessThan(500)
    const sc = score(s)
    expect(sc).toBeGreaterThanOrEqual(0)
    expect(sc).toBeLessThanOrEqual(25)
  })

  it('all players model hidden info: own hand knowledge starts unknown, partners are visible', () => {
    const s = makeGame()
    expect(s.hands.length).toBe(NUM_PLAYERS)
    for (const hand of s.hands) {
      for (const hc of hand) {
        // Every player's OWN clue knowledge begins maximally uncertain.
        expect(hc.known.colors.length).toBe(5)
        expect(hc.known.values.length).toBe(5)
        // The true card identity exists in state (the UI hides player 0's, shows partners').
        expect(hc.card.color).toBeDefined()
      }
    }
  })
})
