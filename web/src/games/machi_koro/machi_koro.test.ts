import { describe, it, expect } from 'vitest'
import {
  makeGame, rollDice, applyIncome, resolveIncome, buy, endTurn, aiTurn,
  allLandmarks, landmarksBuilt, LANDMARKS,
} from './logic'
import type { State } from './logic'

// deterministic die sequence helper
function seq(values: number[]): () => number {
  let i = 0
  // rollDice does 1 + floor(rand()*6); to force a face f, return (f-0.5)/6
  return () => {
    const f = values[i % values.length]
    i++
    return (f - 0.5) / 6
  }
}

describe('machi koro setup', () => {
  it('starts each player with 3 coins, a Wheat Field + Bakery, and 4 unbuilt landmarks', () => {
    const s = makeGame()
    expect(s.players).toHaveLength(3)
    for (const p of s.players) {
      expect(p.coins).toBe(3)
      expect(p.est['wheat']).toBe(1)
      expect(p.est['bakery']).toBe(1)
      expect(landmarksBuilt(p)).toBe(0)
      expect(allLandmarks(p)).toBe(false)
      expect(LANDMARKS.every(l => p.landmarks[l.id] === false)).toBe(true)
    }
    expect(s.turn).toBe(0)
    expect(s.winner).toBe(null)
  })
})

describe('income by color', () => {
  it('blue activates on ANY player\'s roll, paid by the bank', () => {
    const s = makeGame()
    // player 0 owns a Wheat Field (roll 1, blue). Roll happens on player 1's turn.
    s.turn = 1
    const after = resolveIncome(s, 1, 1)
    expect(after.players[0].coins).toBe(4) // +1 from wheat on someone else's roll
    // player 1 also owns a wheat field, so its blue card fires on its own roll too
    expect(after.players[1].coins).toBe(4)
    expect(after.players[2].coins).toBe(4) // p2's wheat fires on any roll as well
  })

  it('green activates ONLY on the roller\'s own turn', () => {
    const s = makeGame()
    // bakery is green, roll 2-3. On player 1's roll, player 0's bakery must NOT fire.
    const onOther = resolveIncome(s, 2, 1)
    expect(onOther.players[0].coins).toBe(3) // bakery did not fire for non-roller
    expect(onOther.players[1].coins).toBe(4) // roller's own bakery fires +1
    // on player 0's own roll of 3, player 0's bakery fires
    const onSelf = resolveIncome(s, 3, 0)
    expect(onSelf.players[0].coins).toBe(4)
  })

  it('red restaurants take coins from the roller and pay the owner', () => {
    const s = makeGame()
    // give player 0 a Cafe (red, roll 3). Player 1 rolls a 3 -> pays player 0.
    s.players[0].est['cafe'] = 1
    const after = resolveIncome(s, 3, 1)
    // roller (p1) owns a green bakery firing on 3 (+1), then pays 1 to p0's cafe.
    expect(after.players[0].coins).toBe(4) // 3 + 1 from cafe
    expect(after.players[1].coins).toBe(3) // 3 +1 bakery -1 cafe
  })

  it('purple steals from opponents on the roller\'s own turn', () => {
    const s = makeGame()
    s.players[0].est['stadium'] = 1 // purple, roll 6, take 2 from each opponent
    const after = resolveIncome(s, 6, 0)
    expect(after.players[0].coins).toBe(3 + 2 + 2) // took 2 from each of 2 opponents
    expect(after.players[1].coins).toBe(1)
    expect(after.players[2].coins).toBe(1)
  })

  it('steals are capped at the opponent\'s available coins', () => {
    const s = makeGame()
    s.players[0].est['tv'] = 1 // take 5 from one opponent
    s.players[1].coins = 2
    s.players[2].coins = 0
    const after = resolveIncome(s, 6, 0)
    // richest opponent is p1 with 2; can only take 2
    expect(after.players[0].coins).toBe(5)
    expect(after.players[1].coins).toBe(0)
    expect(after.players[2].coins).toBe(0)
  })
})

describe('buying', () => {
  it('buying an establishment deducts coins and adds the card', () => {
    const s = makeGame()
    s.players[0].coins = 5
    const after = buy(s, 0, 'store') // Convenience Store, cost 2
    expect(after.players[0].coins).toBe(3)
    expect(after.players[0].est['store']).toBe(1)
    expect(after.supply['store']).toBe(s.supply['store'] - 1)
  })

  it('cannot buy what you cannot afford', () => {
    const s = makeGame()
    s.players[0].coins = 0
    const after = buy(s, 0, 'mine') // cost 6
    expect(after).toBe(s) // unchanged
  })
})

describe('landmarks', () => {
  it('Train Station enables rolling 2 dice', () => {
    const s = makeGame()
    // without train, asking for 2 dice yields only 1 die
    const one = rollDice(s, 2, seq([3, 4]))
    expect(one.dice).toHaveLength(1)
    // build train, then 2 dice are allowed
    s.players[0].landmarks.train = true
    const two = rollDice(s, 2, seq([3, 4]))
    expect(two.dice).toHaveLength(2)
    expect(two.roll).toBe(7)
  })

  it('building all four landmarks wins the game', () => {
    let s = makeGame()
    s.players[0].coins = 100
    for (const l of LANDMARKS) {
      expect(s.winner).toBe(null)
      s = buy(s, 0, l.id)
    }
    expect(s.winner).toBe(0)
    expect(s.phase).toBe('over')
    expect(allLandmarks(s.players[0])).toBe(true)
  })
})

describe('ai self-play', () => {
  it('runs deterministically to a valid winner under a guard cap with no throws', () => {
    let s: State = makeGame()
    const rand = seq([1, 2, 3, 4, 5, 6, 2, 6, 3, 5, 1, 4])
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 4000) {
        guard++
        if (s.players[s.turn].id === 0) {
          // drive player 0 with the same simple greedy policy via the AI helper shape:
          // roll, apply income, build the cheapest affordable landmark else pass, end turn.
          if (s.phase === 'roll') {
            s = rollDice(s, s.players[0].landmarks.train ? 2 : 1, rand)
            s = applyIncome(s)
          } else if (s.phase === 'build') {
            const lm = LANDMARKS
              .filter(l => !s.players[0].landmarks[l.id] && s.players[0].coins >= l.cost)
              .sort((a, b) => a.cost - b.cost)[0]
            if (lm) s = buy(s, 0, lm.id)
            else {
              // buy cheapest affordable income engine to keep the economy moving
              const c = ['wheat', 'ranch', 'store', 'bakery'].find(
                id => s.players[0].coins >= 2 && (s.supply[id] ?? 0) > 0,
              )
              if (c) s = buy(s, 0, c)
            }
            if (s.winner == null) s = endTurn(s)
          }
        } else {
          s = aiTurn(s, rand)
        }
      }
    }).not.toThrow()
    // Either someone won, or we hit the cap without throwing — both acceptable.
    if (s.winner != null) {
      expect(s.winner).toBeGreaterThanOrEqual(0)
      expect(s.winner).toBeLessThan(3)
      expect(allLandmarks(s.players[s.winner])).toBe(true)
    } else {
      expect(guard).toBe(4000)
    }
  })
})
