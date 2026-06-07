import { describe, it, expect } from 'vitest'
import {
  makeGame, buyPlant, canBuyPlant, buyResource, buildCity, canBuildCity,
  powerCities, endResources, endBuild, passAuction, aiTurn,
  resourcePrice, resourceBuyCost, buildCost, payout, bestPowered,
  scorePlayer, winner,
  CITY_TARGET, SUPPLY_CAP,
} from './logic'
import type { State, Plant } from './logic'

describe('plant auction', () => {
  it('buying a plant deducts money and adds it to the player', () => {
    let s = makeGame(1)
    const plant = s.market[0]
    const before = s.players[0].money
    s = buyPlant(s, 0, 0)
    expect(s.players[0].money).toBe(before - plant.cost)
    expect(s.players[0].plants.some(p => p.cost === plant.cost && p.capacity === plant.capacity)).toBe(true)
  })

  it('a player can hold at most 3 plants', () => {
    let s = makeGame(1)
    s.phase = 'auction'; s.turn = 0; s.order = [0, 1]; s.orderIdx = 0; s.done = [false, false]
    s.players[0].money = 1000
    // give the player 3 plants directly
    const mk = (id: number, cap: number): Plant => ({ id, cost: 5, fuel: 'wind', burn: 0, capacity: cap })
    s.players[0].plants = [mk(101, 1), mk(102, 1), mk(103, 1)]
    // market plant has same capacity as weakest -> not allowed (no room, no upgrade)
    expect(canBuyPlant(s, 0, 0)).toBe(false)
  })
})

describe('resource market prices rise as supply drops', () => {
  it('price increases as remaining supply shrinks', () => {
    const full = resourcePrice('coal', SUPPLY_CAP.coal)
    const low = resourcePrice('coal', 2)
    expect(low).toBeGreaterThan(full)
  })

  it('buying drains supply and a later buy of the same resource costs at least as much per unit', () => {
    let s = makeGame(1)
    s.phase = 'resources'; s.turn = 0; s.order = [0, 1]; s.orderIdx = 0; s.done = [false, false]
    s.players[0].money = 1000
    // give the player a coal plant so it has fuel capacity to store coal
    s.players[0].plants = [{ id: 1, cost: 8, fuel: 'coal', burn: 4, capacity: 2 }]
    const cap0 = SUPPLY_CAP.coal
    const firstUnit = resourcePrice('coal', cap0)
    s = buyResource(s, 0, 'coal', 4)
    expect(s.supply.coal).toBe(cap0 - 4)
    const laterUnit = resourcePrice('coal', s.supply.coal)
    expect(laterUnit).toBeGreaterThanOrEqual(firstUnit)
    // cumulative cost helper matches manual sum at full supply
    expect(resourceBuyCost('coal', cap0, 1)).toBe(firstUnit)
  })
})

describe('building cities', () => {
  it('building deducts connection + slot cost and adds the city to the network', () => {
    let s = makeGame(1)
    s.phase = 'build'; s.turn = 0; s.order = [0, 1]; s.orderIdx = 0; s.done = [false, false]
    s.players[0].money = 100
    // first city is free connection (0) + slot cost (10 at step 1)
    const firstCity = s.cities[0].id
    const cost1 = buildCost(s, 0, firstCity)!
    expect(cost1).toBe(10)
    const m0 = s.players[0].money
    s = buildCity(s, 0, firstCity)
    expect(s.players[0].network).toContain(firstCity)
    expect(s.players[0].money).toBe(m0 - cost1)
    // a second adjacent city now costs link + slot (link > 0)
    let adjacent: string | null = null
    for (const c of s.cities) {
      if (canBuildCity(s, 0, c.id)) { adjacent = c.id; break }
    }
    expect(adjacent).not.toBeNull()
    const cost2 = buildCost(s, 0, adjacent!)!
    expect(cost2).toBeGreaterThan(10) // includes a positive connection cost
  })
})

describe('powering cities (bureau)', () => {
  it('burns the right resources and pays from the payout table', () => {
    let s = makeGame(1)
    s.phase = 'bureau'; s.turn = 0; s.order = [0, 1]; s.orderIdx = 0; s.done = [false, false]
    const plant: Plant = { id: 7, cost: 8, fuel: 'coal', burn: 3, capacity: 3 }
    s.players[0].plants = [plant]
    s.players[0].res.coal = 5
    s.players[0].network = ['AME', 'BRN', 'CDR'] // 3 cities
    s.players[0].money = 0
    s.players[1].network = []                    // keep AI from ending things weirdly
    const after = powerCities(s, 0, [7])
    // burned 3 coal, powered min(capacity 3, network 3) = 3 cities
    expect(after.players[0].res.coal).toBe(2)
    expect(after.players[0].money).toBe(payout(3))
  })

  it('cannot power more cities than fuel allows', () => {
    const p = {
      id: 0, name: 'X', money: 0,
      plants: [{ id: 1, cost: 8, fuel: 'coal' as const, burn: 3, capacity: 3 }],
      res: { coal: 1, oil: 0, garbage: 0, uranium: 0 }, // not enough coal (need 3)
      network: ['AME', 'BRN', 'CDR'], powered: 0,
    }
    expect(bestPowered(p)).toBe(0) // can't run the plant
  })
})

describe('end trigger and winner', () => {
  it('reaching the city target ends the game at round end', () => {
    let s = makeGame(1)
    // Player 0 has the target number of cities; bureau then end-round triggers finish.
    s.players[0].network = s.cities.slice(0, CITY_TARGET).map(c => c.id)
    s.players[0].plants = [{ id: 1, cost: 8, fuel: 'wind', burn: 0, capacity: 6 }]
    s.players[1].network = ['AME', 'BRN']
    s.players[1].plants = [{ id: 2, cost: 5, fuel: 'wind', burn: 0, capacity: 2 }]
    s.phase = 'bureau'; s.turn = 0; s.order = [0, 1]; s.orderIdx = 0; s.done = [false, false]
    s = powerCities(s, 0, [1]) // p0 powers, advances to p1
    s = powerCities(s, 1, [2]) // p1 powers -> end round -> finish
    expect(s.phase).toBe('over')
    expect(s.winner).not.toBeNull()
    expect(s.winner).toBe(0) // p0 powers 6 cities vs p1's 2
  })

  it('winner is most cities powered; tie breaks on money', () => {
    let s = makeGame(1)
    // Both can power 2 cities; player 1 has more money -> wins the tie.
    s.players[0].network = s.cities.slice(0, CITY_TARGET).map(c => c.id)
    s.players[0].plants = [{ id: 1, cost: 5, fuel: 'wind', burn: 0, capacity: 2 }]
    s.players[0].money = 10
    s.players[1].network = ['AME', 'BRN']
    s.players[1].plants = [{ id: 2, cost: 5, fuel: 'wind', burn: 0, capacity: 2 }]
    s.players[1].money = 99
    s.phase = 'bureau'; s.turn = 0; s.order = [0, 1]; s.orderIdx = 0; s.done = [false, false]
    s = powerCities(s, 0, [1])
    s = powerCities(s, 1, [2])
    expect(s.phase).toBe('over')
    // both powered 2 -> tie -> player 1 has more money
    expect(s.players[0].powered).toBe(2)
    expect(s.players[1].powered).toBe(2)
    expect(s.winner).toBe(1)
    expect(scorePlayer(s.players[1])).toBeGreaterThan(0)
  })
})

describe('ai self-play', () => {
  it('runs to a valid winner under a guard cap with no throws', () => {
    let s: State = makeGame(7)
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 8000) {
        guard++
        if (s.turn === 1) { s = aiTurn(s); continue }
        // Player 0 greedy mirror of the AI policy.
        if (s.phase === 'auction') {
          // buy cheapest affordable plant if we have <3, else pass
          let bought = false
          if (s.players[0].plants.length < 3) {
            for (let i = 0; i < s.market.length; i++) {
              if (canBuyPlant(s, 0, i) && s.players[0].money >= s.market[i].cost + 10) {
                s = buyPlant(s, 0, i); bought = true; break
              }
            }
          }
          if (!bought) s = passAuction(s, 0)
        } else if (s.phase === 'resources') {
          // buy a little coal/oil if a plant needs it, else end
          let did = false
          for (const r of ['coal', 'oil', 'garbage', 'uranium'] as const) {
            const wants = s.players[0].plants.some(pl => pl.fuel === r)
            if (wants && s.supply[r] > 0) {
              const need = Math.max(0, 3 - s.players[0].res[r])
              if (need > 0 && canBuyResource0(s, r, Math.min(need, s.supply[r]))) {
                s = buyResource(s, 0, r, Math.min(need, s.supply[r])); did = true; break
              }
            }
          }
          if (!did) s = endResources(s, 0)
        } else if (s.phase === 'build') {
          let built = false
          for (const c of s.cities) {
            if (canBuildCity(s, 0, c.id) && s.players[0].money >= (buildCost(s, 0, c.id) ?? 1e9) + 5) {
              s = buildCity(s, 0, c.id); built = true; break
            }
          }
          if (!built) s = endBuild(s, 0)
        } else if (s.phase === 'bureau') {
          s = powerCities(s, 0, s.players[0].plants.map(p => p.id))
        }
      }
    }).not.toThrow()

    if (s.winner != null) {
      expect(s.winner === 0 || s.winner === 1).toBe(true)
      expect(s.phase).toBe('over')
      expect(winner(s)).not.toBeNull()
      // someone reached the target
      expect(s.players.some(p => p.network.length >= CITY_TARGET)).toBe(true)
    } else {
      expect(guard).toBe(8000)
    }
  })
})

// local helper mirroring canBuyResource for player 0 inside the self-play loop
function canBuyResource0(s: State, r: 'coal' | 'oil' | 'garbage' | 'uranium', qty: number): boolean {
  if (s.supply[r] < qty || qty <= 0) return false
  const cost = resourceBuyCost(r, s.supply[r], qty)
  if (s.players[0].money < cost) return false
  let cap = 0
  for (const pl of s.players[0].plants) if (pl.fuel === r) cap += pl.burn * 2
  return s.players[0].res[r] + qty <= cap
}
