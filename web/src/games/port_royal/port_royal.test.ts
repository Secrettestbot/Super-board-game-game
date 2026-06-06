import { describe, it, expect } from 'vitest'
import * as PR from './logic'
import type { Card, PortState } from './logic'

// Pure-logic tests, no DOM. Deterministic decks + injected rng where flipping matters.

// Small helpers to build hand-crafted decks. The deck top (next flip) is the LAST element.
function ship(id: number, color: PR.Color, coins = 2, swords = 0): Card {
  return { id, kind: 'ship', color, coins, swords, name: `${color} ship` }
}
function person(id: number, sym: PR.PersonSym, cost: number, influence: number): Card {
  return { id, kind: 'person', sym, cost, influence, name: PR.SYM_NAME[sym] }
}

describe('port royal logic', () => {
  it('makeGame sets up 3 players with starting coins and zero influence', () => {
    const s = PR.makeGame()
    expect(s.players).toHaveLength(3)
    for (const p of s.players) {
      expect(p.coins).toBe(3)
      expect(p.influence).toBe(0)
    }
    expect(s.winner).toBeNull()
    expect(s.discoverer).toBe(0)
    expect(s.phase).toBe('discover')
  })

  it('flipping a second ship of a color already in the harbor busts (harbor discarded, no take)', () => {
    // deck top order (popped from the end): first flip = red, second flip = red again -> bust
    const deck: Card[] = [ship(2, 'blue', 2), ship(1, 'red', 3), ship(0, 'red', 2)]
    let s = PR.makeGame(deck)
    s = PR.flip(s)                       // flips red (id 0)
    expect(s.harbor).toHaveLength(1)
    expect(s.busted).toBe(false)
    s = PR.flip(s)                       // flips red (id 1) -> BUST
    expect(s.busted).toBe(true)
    expect(s.harbor).toHaveLength(0)     // harbor discarded
    // nobody took anything
    for (const p of s.players) {
      expect(p.ships).toHaveLength(0)
      expect(p.persons).toHaveLength(0)
    }
    // turn passed to next discoverer
    expect(s.discoverer).toBe(1)
  })

  it('stop lets the active player take a ship, then rivals take in turn order paying a coin', () => {
    // a clean harbor with 3 distinct-color ships so all three players can take one each
    // (plus a leftover card in the deck so the supply isn't exhausted and the next turn begins)
    const deck: Card[] = [ship(3, 'black', 2), ship(2, 'green', 2), ship(1, 'blue', 2), ship(0, 'red', 2)]
    let s = PR.makeGame(deck)
    s = PR.flip(s); s = PR.flip(s); s = PR.flip(s)   // red, blue, green in harbor (black left in deck)
    expect(s.harbor).toHaveLength(3)
    s = PR.stop(s)
    expect(s.phase).toBe('trade')
    expect(s.current).toBe(0)                        // discoverer decides first

    // player 0 (discoverer) takes a ship: +2 coins, no fee
    s = PR.takeCard(s, 0, 0)
    expect(s.players[0].coins).toBe(3 + 2)           // started 3, +2 ship coins, no fee
    expect(s.players[0].ships).toHaveLength(1)
    expect(s.current).toBe(1)                        // next rival

    // player 1 takes a ship: pays 1 fee to discoverer, gains 2 coins
    const beforeDiscovererCoins = s.players[0].coins
    s = PR.takeCard(s, 1, 0)
    expect(s.players[1].coins).toBe(3 - 1 + 2)       // -1 fee +2 ship coins
    expect(s.players[0].coins).toBe(beforeDiscovererCoins + 1)  // discoverer got the fee
    expect(s.current).toBe(2)

    // player 2 takes the last ship -> turn ends
    s = PR.takeCard(s, 2, 0)
    expect(s.players[2].ships).toHaveLength(1)
    // turn ended: new discoverer, fresh discover phase
    expect(s.phase).toBe('discover')
    expect(s.discoverer).toBe(1)
  })

  it('hiring a person deducts coins and adds influence', () => {
    // single person in harbor; cost 2, influence 1
    const deck: Card[] = [person(0, 'sailor', 2, 1)]
    let s = PR.makeGame(deck)
    s = PR.flip(s)
    expect(s.harbor[0].kind).toBe('person')
    s = PR.stop(s)
    s = PR.takeCard(s, 0, 0)             // discoverer hires the sailor
    expect(s.players[0].coins).toBe(3 - 2)   // paid the cost, no fee
    expect(s.players[0].persons).toHaveLength(1)
    expect(s.players[0].influence).toBe(1)
  })

  it('expedition auto-claims when the required symbols are held', () => {
    // give player 0 two sailors -> should auto-claim the "Trade Run" expedition (needs 2 sailors)
    // hire sailor #1
    let s = PR.makeGame([person(0, 'sailor', 2, 1)])
    s = PR.flip(s); s = PR.stop(s); s = PR.takeCard(s, 0, 0)
    expect(s.players[0].expeditions).toHaveLength(0)   // only one sailor so far

    // Manually craft a state where player 0 has one sailor + harbor has a 2nd cheap sailor.
    const s2: PortState = {
      ...s,
      deck: [person(1, 'sailor', 0, 1)],
      harbor: [],
      discoverer: 0, current: 0, phase: 'discover', busted: false,
    }
    let t = PR.flip(s2); t = PR.stop(t)
    t = PR.takeCard(t, 0, 0)            // hire the 2nd sailor -> auto-claim Trade Run
    const claimed = t.players[0].expeditions.find(e => e.name === 'Trade Run')
    expect(claimed).toBeTruthy()
    // influence = 2 sailors (1 each) + Trade Run (4)
    expect(t.players[0].influence).toBeGreaterThanOrEqual(6)
  })

  it('end-trigger fires at >=12 influence and the round finishes before a winner is set', () => {
    let s = PR.makeGame([person(0, 'governor', 0, 3)])
    // Hand player 0 enough influence to be at the goal already.
    s.players[0].influence = 12
    // Run player 0's turn: stop immediately (empty harbor) ends the turn and trips the trigger.
    s = PR.stop(s)
    expect(s.endTriggered).toBe(true)
    // The round must still finish: not immediately done because discoverer was 0, round ends
    // after player 2 (the one before 0). So winner is not yet set right after player 0's turn.
    expect(s.winner).toBeNull()
    expect(s.phase).toBe('discover')
    expect(s.discoverer).toBe(1)
  })

  it('deterministic AI self-play reaches a valid winner under a guard cap with no throws', () => {
    // seeded LCG rng for full determinism
    let seed = 123456789
    const rng = () => {
      seed = (1103515245 * seed + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    let threw = false
    let s = PR.makeGame(undefined, rng)
    let guard = 0
    try {
      while (s.winner == null && guard++ < 20000) {
        if (s.phase === 'discover' && s.discoverer === 0) {
          // human policy: flip while safe, else stop
          if (PR.bustRisk(s) >= 0.3 || s.harbor.length >= 4) s = PR.stop(s)
          else s = PR.flip(s, rng)
        } else if (s.phase === 'trade' && s.current === 0) {
          // human policy: take the AI's recommended pick, else pass
          const dec = PR.aiTakeDecision(s, 0)
          if (dec && dec.score >= 0.6) s = PR.takeCard(s, 0, dec.index)
          else s = PR.passTake(s)
        } else {
          const next = PR.aiStep(s, rng)
          if (next === s) { s = PR.passTake(s) } // never stall
          else s = next
        }
      }
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(s.winner).not.toBeNull()
    expect(s.winner! >= 0 && s.winner! < PR.PLAYERS).toBe(true)
    // winner should genuinely have the most influence
    const winInf = s.players[s.winner!].influence
    for (const p of s.players) expect(winInf).toBeGreaterThanOrEqual(p.influence)
  })
})
