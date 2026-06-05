import { describe, it, expect } from 'vitest'
import * as LL from './logic'
import type { LoveLetterState, CardValue, Player } from './logic'

// Pure logic test: no DOM. Asserts the deck composition + each headline card effect,
// the Countess-forced rule, deck-exhaustion resolution, and that full games against the
// real AI terminate fast with a valid winner.

// Build a controlled mid-round state so individual effects can be tested deterministically.
function rig(opts: {
  deck?: CardValue[]
  you: CardValue[]          // current player's 2 cards (you = player 0, to move)
  foe: CardValue[]          // rival's 1 card
  tokens?: [number, number]
  foeProtected?: boolean
}): LoveLetterState {
  return {
    deck: opts.deck ?? [2, 3],          // non-empty by default so turns pass normally
    hands: [opts.you.slice(), opts.foe.slice()],
    out: [false, false],
    protected: [false, opts.foeProtected ?? false],
    discards: [],
    tokens: (opts.tokens ?? [0, 0]).slice(),
    turn: 0 as Player,
    drewExtra: true,
    reveal: true,
    roundOver: false, roundWinner: null, winner: null,
    log: [],
  }
}

describe('love letter — setup', () => {
  it('makeGame deals a valid round: right deck composition, a card each, a current player', () => {
    const s = LL.makeGame()
    // full deck is 16 cards with the canonical composition
    const full = LL.fullDeck()
    expect(full).toHaveLength(16)
    const counts: Record<number, number> = {}
    for (const c of full) counts[c] = (counts[c] ?? 0) + 1
    expect(counts).toEqual({ 1: 5, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 7: 1, 8: 1 })

    // round: one card removed, one dealt to each, starter drew to 2 => deck = 16 - 1 - 2 - 1 = 12
    expect(s.hands[0].length).toBe(2)         // you start and have drawn
    expect(s.hands[1].length).toBe(1)
    expect(s.deck.length).toBe(12)
    expect(s.turn).toBe(0)
    expect(s.winner).toBeNull()

    // every visible card is a legal value, and total card conservation holds
    const seen = [...s.deck, ...s.hands[0], ...s.hands[1]]
    expect(seen.length).toBe(15)              // 16 minus the one set aside
    for (const c of seen) expect(c >= 1 && c <= 8).toBe(true)
  })
})

describe('love letter — card effects', () => {
  it('Guard eliminates a correctly-guessed target and does nothing on a wrong guess', () => {
    // rival holds a Priest (2). Correct guess -> out.
    let s = rig({ you: [1, 6], foe: [2] })
    const hit = LL.play(s, 1, { guardGuess: 2 })
    expect(hit.out[1]).toBe(true)
    expect(hit.roundOver).toBe(true)
    expect(hit.roundWinner).toBe(0)

    // wrong guess -> nobody out, turn passes
    s = rig({ you: [1, 6], foe: [2] })
    const miss = LL.play(s, 1, { guardGuess: 5 })
    expect(miss.out[1]).toBe(false)
    expect(miss.roundOver).toBe(false)
    expect(miss.turn).toBe(1)
  })

  it('Baron compares hands and eliminates the lower', () => {
    // you keep a King (6) after playing Baron; rival has a Guard (1) -> rival out
    let win = LL.play(rig({ you: [3, 6], foe: [1] }), 3)
    expect(win.out[1]).toBe(true)
    expect(win.roundWinner).toBe(0)

    // you keep a Guard (1); rival has a King (6) -> you out
    let lose = LL.play(rig({ you: [3, 1], foe: [6] }), 3)
    expect(lose.out[0]).toBe(true)
    expect(lose.roundWinner).toBe(1)

    // tie -> nobody out
    let tie = LL.play(rig({ you: [3, 4], foe: [4] }), 3)
    expect(tie.out[0]).toBe(false)
    expect(tie.out[1]).toBe(false)
    expect(tie.roundOver).toBe(false)
  })

  it('Countess-forced rule: must play the Countess when also holding the King or Prince', () => {
    expect(LL.legalPlays(rig({ you: [7, 6], foe: [1] }), 0)).toEqual([7])  // with King
    expect(LL.legalPlays(rig({ you: [7, 5], foe: [1] }), 0)).toEqual([7])  // with Prince
    // with any other card, the Countess is NOT forced
    const free = LL.legalPlays(rig({ you: [7, 2], foe: [1] }), 0)
    expect(free).toContain(7)
    expect(free).toContain(2)
    // illegal play is a no-op: trying to play the non-Countess when forced does nothing
    const noop = LL.play(rig({ you: [7, 6], foe: [1] }), 6)
    expect(noop.discards.length).toBe(0)
  })

  it('Princess is fatal when played', () => {
    const s = LL.play(rig({ you: [8, 2], foe: [1] }), 8)
    expect(s.out[0]).toBe(true)
    expect(s.roundWinner).toBe(1)
  })

  it('deck exhaustion resolves to the higher card in hand', () => {
    // empty deck: after playing the Priest the turn passes -> deck empty -> compare held cards.
    // you keep King (6), rival holds Guard (1) -> you win the round.
    const youHigh = LL.play(rig({ deck: [], you: [2, 6], foe: [1] }), 2)
    expect(youHigh.roundOver).toBe(true)
    expect(youHigh.roundWinner).toBe(0)

    const foeHigh = LL.play(rig({ deck: [], you: [2, 1], foe: [6] }), 2)
    expect(foeHigh.roundOver).toBe(true)
    expect(foeHigh.roundWinner).toBe(1)
  })
})

describe('love letter — full games terminate with a valid winner', () => {
  it('plays a few full games (random legal human vs AI) to a winner, no throws, fast', () => {
    for (let game = 0; game < 4; game++) {
      let s = LL.makeGame()
      let guard = 0
      while (s.winner === null && guard++ < 400) {
        if (s.roundOver) { s = LL.nextRound(s); continue }
        if (s.turn === 0) {
          const legal = LL.legalPlays(s, 0)
          expect(legal.length).toBeGreaterThan(0)
          const v = legal[(Math.random() * legal.length) | 0] as CardValue
          // supply required targeting deterministically for human plays
          if (v === 1 && !s.protected[1]) s = LL.play(s, v, { guardGuess: 5 })
          else if (v === 5) s = LL.play(s, v, { princeTarget: 1 as Player })
          else s = LL.play(s, v)
        } else {
          s = LL.aiTurn(s)
        }
      }
      expect(s.winner).not.toBeNull()
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(s.tokens[s.winner as number]).toBeGreaterThanOrEqual(LL.TARGET_TOKENS)
      expect(guard).toBeLessThan(400)        // terminated well within the cap
    }
  })
})
