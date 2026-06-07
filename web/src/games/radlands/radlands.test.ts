import { describe, it, expect } from 'vitest'
import * as R from './logic'
import type { RadlandsState } from './logic'

// Pure-logic tests (no DOM). A fixed deck of people keeps the opening hand predictable.
const PEOPLE_DECK = [
  'raider', 'raider', 'gunner', 'gunner', 'scout', 'scout',
  'medic', 'cutter', 'runner', 'vanguard', 'raider', 'gunner',
]

function fresh(): RadlandsState {
  return R.makeGame(PEOPLE_DECK, 7)
}

describe('radlands logic', () => {
  it('starts: each player has 3 camps, water 3, a hand, you to move, no winner', () => {
    const s = fresh()
    expect(s.players[0].columns.length).toBe(3)
    expect(s.players[1].columns.length).toBe(3)
    expect(s.players[0].columns.every(c => !c.camp.destroyed)).toBe(true)
    expect(s.players[0].water).toBe(3)
    expect(s.players[0].hand.length).toBeGreaterThan(0)
    expect(s.turn).toBe(0)
    expect(s.winner).toBeNull()
  })

  it('playing a person costs water and occupies a slot', () => {
    const s = fresh()
    const card = s.players[0].hand.find(k => R.def(k).kind === 'person')!
    const cost = R.def(card).cost
    const before = s.players[0].water
    const ok = R.playPerson(s, 0, card, 1, 1)
    expect(ok).toBe(true)
    expect(s.players[0].water).toBe(before - cost)
    expect(s.players[0].columns[1].people[1]).not.toBeNull()
    expect(s.players[0].columns[1].people[1]!.key).toBe(card)
  })

  it('isProtected: a back person is protected when a front person stands ahead', () => {
    const s = fresh()
    // put a person in the back (slot 0); not protected with empty front
    s.players[0].columns[0].people[0] = { id: 99, key: 'raider', damaged: false, ready: true }
    expect(R.isProtected(s, 0, 0, 0)).toBe(false)
    // add a front person -> back is now protected; front never protected
    s.players[0].columns[0].people[1] = { id: 98, key: 'gunner', damaged: false, ready: true }
    expect(R.isProtected(s, 0, 0, 0)).toBe(true)
    expect(R.isProtected(s, 0, 0, 1)).toBe(false)
  })

  it('Damage can only hit the FRONT/unprotected enemy person, not a protected one', () => {
    const s = fresh()
    const foe = s.players[1]
    foe.columns[0].people[0] = { id: 50, key: 'raider', damaged: false, ready: true } // back
    foe.columns[0].people[1] = { id: 51, key: 'gunner', damaged: false, ready: true } // front
    const src: R.AbilitySource = { player: 0, column: 0, slot: -1 }
    // give player 0 an Outpost-style damage source: use the camp that has damage
    // ensure actor has water and a damage source — use outpost camp (c_outpost) ability
    s.players[0].water = 5
    // targeting the protected BACK person is illegal
    const badTarget = { player: 1 as const, column: 0, slot: 0 }
    const okBad = R.useAbility(s, 0, src, badTarget)
    expect(okBad).toBe(false)
    expect(foe.columns[0].people[0]).not.toBeNull()
    // targeting the FRONT person is legal and injures it (first hit)
    const goodTarget = { player: 1 as const, column: 0, slot: 1 }
    const okGood = R.useAbility(s, 0, src, goodTarget)
    expect(okGood).toBe(true)
    expect(foe.columns[0].people[1]!.damaged).toBe(true)
  })

  it('a second Damage hit destroys a person and discards it', () => {
    const s = fresh()
    const foe = s.players[1]
    foe.columns[2].people[1] = { id: 60, key: 'gunner', damaged: true, ready: true } // already injured, front
    s.players[0].water = 5
    const src: R.AbilitySource = { player: 0, column: 0, slot: -1 } // outpost camp damage
    const ok = R.useAbility(s, 0, src, { player: 1, column: 2, slot: 1 })
    expect(ok).toBe(true)
    expect(foe.columns[2].people[1]).toBeNull()
    expect(foe.discard.includes('gunner')).toBe(true)
  })

  it('destroying all 3 enemy camps wins the game for the attacker', () => {
    const s = fresh()
    const foe = s.players[1]
    // reduce all foe camps to 1 health, empty columns so the camp is the front target
    for (const c of foe.columns) { c.people = [null, null]; c.camp.health = 1; c.camp.destroyed = false }
    s.players[0].water = 99
    const src: R.AbilitySource = { player: 0, column: 0, slot: -1 } // outpost camp damage (2W)
    // hit each enemy camp once
    expect(R.useAbility(s, 0, src, { player: 1, column: 0, slot: -1 })).toBe(true)
    foe.columns[0].camp.used // ignore
    // camp ability used once/turn — drive directly via a fresh damage each by resetting camp.used
    s.players[0].columns[0].camp.used = false
    expect(R.useAbility(s, 0, src, { player: 1, column: 1, slot: -1 })).toBe(true)
    s.players[0].columns[0].camp.used = false
    expect(R.useAbility(s, 0, src, { player: 1, column: 2, slot: -1 })).toBe(true)
    expect(foe.columns.every(c => c.camp.destroyed)).toBe(true)
    expect(R.winner(s)).toBe(0)
  })

  it('water resets to its per-turn allotment (base 3 early game) at the start of your turn', () => {
    const s = fresh()
    expect(s.round).toBe(0)
    expect(s.players[0].water).toBe(3)
    s.players[0].water = 0     // spend it all
    R.endTurn(s)               // -> AI turn (round still 0)
    R.aiTurn(s)                // AI plays then ends -> back to you, round increments to 1
    // back on your turn early in the game (round < 4): water resets to base 3
    if (s.winner == null && s.turn === 0) {
      expect(s.round).toBeLessThan(4)
      expect(s.players[0].water).toBe(3)
    }
  })

  it('AI self-play reaches a valid winner under a guard cap with no throws', () => {
    const s = R.makeGame(undefined, 2026)
    let guard = 0
    expect(() => {
      while (s.winner == null && guard < 3000) {
        if (s.turn === 0) {
          // simple scripted "you": attack whatever is legal, else end
          const acts = R.legalActions(s, 0).filter(a => a.type !== 'end')
          const dmg = acts.find(a => a.type === 'ability' && a.kind === 'damage')
          const play = acts.find(a => a.type === 'play')
          if (dmg && dmg.type === 'ability') R.useAbility(s, 0, dmg.source, dmg.target)
          else if (play && play.type === 'play') R.playPerson(s, 0, play.cardId, play.column, play.slot)
          else R.endTurn(s)
        } else {
          R.aiTurn(s)
        }
        guard++
      }
    }).not.toThrow()
    expect(guard).toBeLessThan(3000)
    if (s.winner != null) expect([0, 1]).toContain(s.winner)
  })
})
