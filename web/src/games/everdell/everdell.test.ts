import { describe, it, expect } from 'vitest'
import {
  makeGame, placeWorker, canPlaceWorker, playCard, canPlayCard, prepareSeason,
  scoreCity, aiTurn, winner, legalActions, freeSlots, workersAvailable,
  CITY_CAP, LOCATION_BY_ID,
} from './logic'
import type { State } from './logic'

describe('worker placement', () => {
  it('placing a worker grants the location resources and occupies a slot', () => {
    let s = makeGame(1)
    s.turn = 0
    const before = s.players[0].res.twig
    expect(canPlaceWorker(s, 0, 'twigs')).toBe(true)
    s = placeWorker(s, 0, 'twigs')
    expect(s.players[0].res.twig).toBe(before + 3)
    expect(s.players[0].workersUsed).toBe(1)
    expect(s.occ.twigs.includes(0)).toBe(true)
  })

  it('a 1-slot location fills up and blocks further placement', () => {
    let s = makeGame(1)
    s.turn = 0
    expect(LOCATION_BY_ID.pebble.slots).toBe(1)
    s = placeWorker(s, 0, 'pebble')
    expect(freeSlots(s, 'pebble')).toBe(0)
    // now player 1's turn; the pebble quarry is full
    expect(s.turn).toBe(1)
    expect(canPlaceWorker(s, 1, 'pebble')).toBe(false)
  })

  it('cannot place when no workers are available', () => {
    let s = makeGame(1)
    s.turn = 0
    s.players[0].workersUsed = s.players[0].workersTotal // none left
    expect(workersAvailable(s.players[0])).toBe(0)
    expect(canPlaceWorker(s, 0, 'twigs')).toBe(false)
  })
})

describe('playing cards', () => {
  it('playing a card pays its resource cost', () => {
    let s = makeGame(1)
    s.turn = 0
    const p = s.players[0]
    p.hand = ['mine'] // costs twig1 resin1 pebble1
    p.res = { twig: 1, resin: 1, pebble: 1, berry: 0 }
    expect(canPlayCard(s, 0, 'mine', false)).toBe(true)
    s = playCard(s, 0, 'mine', false)
    expect(s.players[0].city).toContain('mine')
    expect(s.players[0].res).toEqual({ twig: 0, resin: 0, pebble: 0, berry: 0 })
  })

  it('a critter plays FREE when its matching construction is in the city', () => {
    let s = makeGame(1)
    s.turn = 0
    const p = s.players[0]
    p.city = ['farm']            // Farm houses Husband
    p.hand = ['husband']         // Husband normally costs 2 berry
    p.res = { twig: 0, resin: 0, pebble: 0, berry: 0 } // cannot afford
    expect(canPlayCard(s, 0, 'husband', false)).toBe(true) // free via Farm
    s = playCard(s, 0, 'husband', false)
    expect(s.players[0].city).toContain('husband')
    expect(s.players[0].res.berry).toBe(0) // nothing paid
  })

  it('cannot afford a card without its housing construction', () => {
    const s = makeGame(1)
    s.turn = 0
    const p = s.players[0]
    p.city = []                  // no Farm
    p.hand = ['husband']
    p.res = { twig: 0, resin: 0, pebble: 0, berry: 0 }
    expect(canPlayCard(s, 0, 'husband', false)).toBe(false)
    expect(playCard(s, 0, 'husband', false)).toBe(s) // unchanged
  })

  it('the 15-card city cap blocks a 16th card', () => {
    let s = makeGame(1)
    s.turn = 0
    const p = s.players[0]
    p.city = Array.from({ length: CITY_CAP }, () => 'wanderer') // 15 cards
    p.hand = ['ranger']
    p.res = { twig: 9, resin: 9, pebble: 9, berry: 9 }
    expect(p.city.length).toBe(CITY_CAP)
    expect(canPlayCard(s, 0, 'ranger', false)).toBe(false)
    expect(playCard(s, 0, 'ranger', false)).toBe(s)
  })
})

describe('prepare season', () => {
  it('recalls workers, gains more, and advances the season', () => {
    let s = makeGame(1)
    s.turn = 0
    s = placeWorker(s, 0, 'twigs') // uses a worker; now player 1's turn
    s.turn = 0
    expect(s.players[0].workersUsed).toBe(1)
    expect(s.players[0].season).toBe('winter')
    s = prepareSeason(s, 0)
    expect(s.players[0].workersUsed).toBe(0)          // recalled
    expect(s.players[0].season).toBe('spring')        // advanced
    expect(s.players[0].workersTotal).toBe(3)         // 2 + 1 for spring
    expect(s.occ.twigs.includes(0)).toBe(false)       // worker removed
  })

  it('both players finishing Autumn ends the game', () => {
    let s = makeGame(1)
    for (const p of s.players) p.season = 'autumn'
    s.turn = 0
    s = prepareSeason(s, 0) // player 0 finishes autumn
    expect(s.players[0].done).toBe(true)
    expect(s.winner).toBeNull()
    s.turn = 1
    s = prepareSeason(s, 1) // player 1 finishes autumn -> game over
    expect(s.players[1].done).toBe(true)
    expect(winner(s) === 0 || winner(s) === 1).toBe(true)
  })
})

describe('scoring', () => {
  it('sums card base points plus per-kind bonuses', () => {
    const s = makeGame(1)
    const p = s.players[0]
    // farm(1) + mine(2) + storehouse(2) = 5 base, all constructions
    p.city = ['farm', 'mine', 'storehouse']
    expect(scoreCity(p)).toBe(5)
    // evertree: 5 base + 1 per OTHER construction (3 others) = 5 + 3 = 8; total 5 + 8 = 13
    p.city = ['farm', 'mine', 'storehouse', 'evertree']
    expect(scoreCity(p)).toBe(13)
  })
})

describe('legal actions', () => {
  it('prepare is always available so there is no deadlock', () => {
    const s = makeGame(1)
    s.turn = 0
    s.players[0].res = { twig: 0, resin: 0, pebble: 0, berry: 0 }
    s.players[0].hand = []
    const acts = legalActions(s, 0)
    expect(acts.some(a => a.type === 'prepare')).toBe(true)
  })
})

describe('ai self-play', () => {
  it('runs to a valid winner under a guard cap with no throws', () => {
    let s: State = makeGame(7)
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 5000) {
        guard++
        if (s.turn === 1) {
          s = aiTurn(s)
        } else if (s.turn === 0) {
          // player 0 greedy mirror: play any legal card, else gather, else prepare.
          const acts = legalActions(s, 0)
          const play = acts.find(a => a.type === 'play')
          const place = acts.find(a => a.type === 'place')
          if (play && play.type === 'play') s = playCard(s, 0, play.cardId, play.fromMeadow)
          else if (place && place.type === 'place') s = placeWorker(s, 0, place.loc)
          else s = prepareSeason(s, 0)
        }
      }
    }).not.toThrow()

    expect(s.winner === 0 || s.winner === 1).toBe(true)
    expect(s.players[0].done && s.players[1].done).toBe(true)
    expect(winner(s)).not.toBeNull()
    expect(guard).toBeLessThan(5000)
  })
})
