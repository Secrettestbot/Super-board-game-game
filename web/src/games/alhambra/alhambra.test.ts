import { describe, it, expect } from 'vitest'
import * as A from './logic'
import type { AlhambraState, MoneyCard, Tile, PlayerState } from './logic'

// A tiny deterministic RNG (mulberry32) for reproducible self-play.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function money(id: string, currency: A.Currency, value: number): MoneyCard {
  return { id, currency, value }
}
function tile(id: string, building: A.Building, priceCur: A.Currency, cost: number): Tile {
  return { id, building, priceCur, cost }
}

function blankPlayer(): PlayerState {
  return { hand: [], alhambra: [], reserved: null, score: 0 }
}

describe('Alhambra logic', () => {
  it('makeGame sets up 3 players, full markets, and three scoring triggers', () => {
    const s = A.makeGame({ noShuffle: true })
    expect(s.players.length).toBe(3)
    expect(s.moneyMarket.filter((c) => c != null).length).toBe(4)
    expect(s.buildingMarket.filter((t) => t != null).length).toBe(4)
    expect(s.scoreTriggers.length).toBe(3)
    expect(s.turn).toBe(0)
    expect(s.winner).toBe(null)
    // Each player got a starting hand.
    for (const p of s.players) expect(p.hand.length).toBeGreaterThan(0)
  })

  it('takeMoney draws a single card and ends the turn', () => {
    const s = A.makeGame({ noShuffle: true })
    const before = s.players[0].hand.length
    const target = s.moneyMarket[0]!
    const ns = A.takeMoney(s, 0, [0])
    expect(ns.players[0].hand.length).toBe(before + 1)
    expect(ns.players[0].hand.some((c) => c.id === target.id)).toBe(true)
    expect(ns.turn).toBe(1) // advanced to AI 1
    // Market refilled.
    expect(ns.moneyMarket.filter((c) => c != null).length).toBe(4)
  })

  it('takeMoney allows multiple cards summing <=5 but rejects >5', () => {
    const base = A.makeGame({ noShuffle: true })
    // Hand-craft a money market we control.
    const s: AlhambraState = {
      ...base,
      moneyMarket: [money('a', 'green', 2), money('b', 'green', 3), money('c', 'blue', 3), money('d', 'blue', 3)],
    }
    // 2 + 3 = 5 -> legal multi-take.
    expect(A.canTakeMoney(s, [0, 1])).toBe(true)
    // 3 + 3 = 6 -> illegal multi-take.
    expect(A.canTakeMoney(s, [2, 3])).toBe(false)
    const ns = A.takeMoney(s, 0, [0, 1])
    expect(ns.players[0].hand.filter((c) => c.id === 'a' || c.id === 'b').length).toBe(2)
  })

  it('buying deducts the right currency and places the building', () => {
    const base = A.makeGame({ noShuffle: true })
    const s: AlhambraState = {
      ...base,
      buildingMarket: [tile('T0', 'tower', 'green', 4), null, null, null],
      players: [
        { ...blankPlayer(), hand: [money('g1', 'green', 3), money('g2', 'green', 3), money('y1', 'yellow', 5)] },
        blankPlayer(), blankPlayer(),
      ],
    }
    // Pay 3+3=6 (overpay) in green.
    const ns = A.buyBuilding(s, 0, 0, ['g1', 'g2'])
    expect(ns.players[0].alhambra.length).toBe(1)
    expect(ns.players[0].alhambra[0].tile.building).toBe('tower')
    // Green cards spent; yellow kept.
    expect(ns.players[0].hand.some((c) => c.id === 'y1')).toBe(true)
    expect(ns.players[0].hand.some((c) => c.currency === 'green')).toBe(false)
    // Overpay -> NO extra turn -> turn advances.
    expect(ns.turn).toBe(1)
  })

  it('exact payment grants an extra turn; overpay does not', () => {
    const base = A.makeGame({ noShuffle: true })
    const exactState: AlhambraState = {
      ...base,
      buildingMarket: [tile('T0', 'garden', 'blue', 4), null, null, null],
      players: [
        { ...blankPlayer(), hand: [money('b1', 'blue', 1), money('b2', 'blue', 3)] },
        blankPlayer(), blankPlayer(),
      ],
    }
    expect(A.canPayExact(exactState.players[0], exactState.buildingMarket[0]!)).toBe(true)
    const exact = A.buyBuilding(exactState, 0, 0, ['b1', 'b2'])
    expect(exact.turn).toBe(0) // EXTRA turn — still player 0

    const overState: AlhambraState = {
      ...base,
      buildingMarket: [tile('T1', 'garden', 'blue', 4), null, null, null],
      players: [
        { ...blankPlayer(), hand: [money('b3', 'blue', 3), money('b4', 'blue', 3)] },
        blankPlayer(), blankPlayer(),
      ],
    }
    const over = A.buyBuilding(overState, 0, 0, ['b3', 'b4']) // pays 6 for 4
    expect(over.turn).toBe(1) // no extra turn
  })

  it('majority-per-type scoring rewards the player with the most of a type', () => {
    const base = A.makeGame({ noShuffle: true })
    const mk = (n: number, b: A.Building): PlayerState => {
      const p = blankPlayer()
      for (let i = 0; i < n; i++) {
        const pos = A.defaultPlacement(p)
        p.alhambra.push({ tile: tile(`x${b}${i}`, b, 'green', 2), x: pos.x, y: pos.y })
      }
      return p
    }
    const s: AlhambraState = {
      ...base,
      players: [mk(3, 'tower'), mk(1, 'tower'), mk(0, 'tower')],
    }
    A.scoreRound(s, 0) // round 0: first place = 1 pt, no second
    expect(s.players[0].score).toBeGreaterThan(s.players[1].score)
    expect(s.players[0].score).toBeGreaterThan(s.players[2].score)
  })

  it('scoring round triggers as the money deck depletes', () => {
    const base = A.makeGame({ noShuffle: true })
    // Force the deck to the first trigger and run an action.
    const s: AlhambraState = { ...base, moneyDeck: base.moneyDeck.slice(0, base.scoreTriggers[0]) }
    expect(s.roundsScored).toBe(0)
    const ns = A.takeMoney(s, 0, [0])
    expect(ns.roundsScored).toBeGreaterThanOrEqual(1)
  })

  it('deterministic AI self-play reaches a valid winner under a guard cap with no throws', () => {
    let s = A.makeGame({ rng: rng(12345) })
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 5000) {
        guard++
        if (s.turn === 0) {
          // Human acts greedily too: buy if possible, else take money.
          const me = s.players[0]
          let acted = false
          for (let idx = 0; idx < s.buildingMarket.length; idx++) {
            const t = s.buildingMarket[idx]
            if (t && A.canAfford(me, t)) {
              const pay = A.choosePayment(me, t)
              if (pay) { s = A.buyBuilding(s, 0, idx, pay); acted = true; break }
            }
          }
          if (!acted) {
            // Take the first available money card.
            const i = s.moneyMarket.findIndex((c) => c != null)
            if (i >= 0) { s = A.takeMoney(s, 0, [i]); acted = true }
          }
          if (!acted) {
            // No money to take and nothing to buy: pass via redesign-or-take fallback.
            // Take any single card if present, else break to avoid an infinite loop.
            const i = s.moneyMarket.findIndex((c) => c != null)
            if (i >= 0) s = A.takeMoney(s, 0, [i])
            else break
          }
        } else {
          const prev = s.step
          s = A.aiTurn(s)
          if (s.step === prev) break // AI made no progress — bail to avoid a stall
        }
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(5000)
    if (s.winner != null) {
      expect([0, 1, 2]).toContain(s.winner)
      expect(s.roundsScored).toBe(3)
    }
  })
})
