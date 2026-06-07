import { describe, it, expect } from 'vitest'
import * as SR from './logic'
import type { StarRealmsState, CardInst } from './logic'

// Pure-logic tests (no DOM). Deterministic via seeded makeGame(seed).

function findInHandByKey(s: StarRealmsState, key: string): CardInst | undefined {
  return s.players[s.turn].hand.find(c => SR.def(c).key === key)
}

describe('star realms logic', () => {
  it('starts both players at 50 authority with an 8 Scout + 2 Viper deck', () => {
    const s = SR.makeGame(1)
    expect(s.players[0].authority).toBe(SR.START_AUTHORITY)
    expect(s.players[1].authority).toBe(50)
    // player 0 has been dealt an opening hand; deck+hand = the 10 starter cards
    const owned0 = s.players[0].deck.length + s.players[0].hand.length + s.players[0].discard.length
    expect(owned0).toBe(10)
    // count Scouts / Vipers across player 0's whole deck
    const all0 = [...s.players[0].deck, ...s.players[0].hand, ...s.players[0].discard]
    expect(all0.filter(c => SR.def(c).key === 'scout').length).toBe(8)
    expect(all0.filter(c => SR.def(c).key === 'viper').length).toBe(2)
    expect(s.tradeRow.length).toBe(SR.TRADE_ROW_SIZE)
    expect(s.tradeRow.every(c => c != null)).toBe(true)
    expect(s.winner).toBe(null)
  })

  it('playing a Scout gives 1 trade and a Viper gives 1 combat', () => {
    // Build a controlled state: force a Scout then a Viper into hand.
    let s = SR.makeGame(2)
    // ensure the active player's hand contains at least a scout and viper by stacking the hand
    const p = s.players[s.turn]
    // remove existing hand back to deck irrelevant; directly set a known hand
    p.hand = [...p.deck.filter(c => SR.def(c).key === 'scout').slice(0, 1),
              ...p.deck.filter(c => SR.def(c).key === 'viper').slice(0, 1)]
    // make sure those ids are unique entries (they are distinct instances)
    expect(p.hand.length).toBe(2)
    const scout = p.hand.find(c => SR.def(c).key === 'scout')!
    const viper = p.hand.find(c => SR.def(c).key === 'viper')!
    s.trade = 0; s.combat = 0
    SR.playCard(s, scout.id)
    expect(s.trade).toBe(1)
    SR.playCard(s, viper.id)
    expect(s.combat).toBe(1)
  })

  it('buying a card spends trade, sends it to discard, and refills the trade row', () => {
    const s = SR.makeGame(3)
    // pick a cheap card in the row we can afford; give ourselves trade
    const idx = s.tradeRow.findIndex(c => c != null && SR.def(c).cost <= 3)
    expect(idx).toBeGreaterThanOrEqual(0)
    const bought = s.tradeRow[idx]!
    const cost = SR.def(bought).cost
    s.trade = cost
    const discBefore = s.players[s.turn].discard.length
    SR.buyCard(s, idx)
    expect(s.trade).toBe(0)
    expect(s.players[s.turn].discard.length).toBe(discBefore + 1)
    expect(s.players[s.turn].discard.some(c => c.id === bought.id)).toBe(true)
    // row refilled (no permanent hole) as long as the trade deck had cards
    expect(s.tradeRow[idx] != null).toBe(true)
    expect(s.tradeRow.length).toBe(SR.TRADE_ROW_SIZE)
  })

  it('ally ability triggers when 2+ of the same faction are played', () => {
    const s = SR.makeGame(4)
    const p = s.players[s.turn]
    // two Star Empire ships: Imperial Fighter gives +2 combat, ally +2 combat.
    // Playing one alone: +2 combat. Playing a second star ship triggers ally on both.
    const a: CardInst = { id: 9001, key: 'star_corvette' }
    const b: CardInst = { id: 9002, key: 'star_corvette' }
    p.hand = [a, b]
    s.trade = 0; s.combat = 0
    SR.playCard(s, a.id)
    // first star ship: just its +2 combat (draw may pull more star cards from deck, so capture delta carefully)
    const afterFirst = s.combat
    expect(afterFirst).toBeGreaterThanOrEqual(2)
    SR.playCard(s, b.id)
    // second triggers ally on BOTH: +2 (b base) +2 (b ally) +2 (a retro ally) on top of afterFirst
    expect(s.combat).toBeGreaterThanOrEqual(afterFirst + 6)
  })

  it('an outpost must be destroyed before authority can be damaged', () => {
    const s = SR.makeGame(5)
    s.turn = 0
    const foe = s.players[1]
    // give the foe an outpost (Trading Post, defense 4, outpost)
    const op: CardInst = { id: 8001, key: 'fed_outpost' }
    foe.bases = [op]
    const authBefore = foe.authority
    s.combat = 3
    // can't hit face while outpost stands
    SR.attack(s, 'face')
    expect(foe.authority).toBe(authBefore)
    // can't break outpost with only 3 combat (defense 4)
    SR.attack(s, op.id)
    expect(foe.bases.length).toBe(1)
    // now give enough combat to break it
    s.combat = 6
    SR.attack(s, op.id)
    expect(foe.bases.length).toBe(0)
    // remaining 2 combat may now hit face
    SR.attack(s, 'face')
    expect(foe.authority).toBe(authBefore - 2)
  })

  it('reducing the opponent to 0 authority wins the game', () => {
    const s = SR.makeGame(6)
    s.turn = 0
    s.players[1].authority = 5
    s.players[1].bases = []
    s.combat = 9
    SR.attack(s, 'face')
    expect(s.players[1].authority).toBe(0)
    expect(s.winner).toBe(0)
  })

  it('the draw deck reshuffles from discard when it empties', () => {
    const s = SR.makeGame(7)
    const p = s.players[s.turn]
    // pile everything into discard, empty the deck, then draw
    p.discard = [...p.deck, ...p.hand, ...p.discard]
    p.deck = []
    p.hand = []
    const total = p.discard.length
    expect(total).toBeGreaterThan(0)
    // draw the whole pile + 1; should reshuffle and never crash, capping at total
    let drawn = 0
    // use endTurn->startTurn path indirectly by calling startTurn after setting turn
    // simpler: directly exercise via playAll/draw by simulating a hand draw through startTurn
    s.turn = s.turn === 0 ? 1 : 0          // flip so startTurn draws for the other; reset back
    s.turn = s.turn === 0 ? 1 : 0
    SR.startTurn(s)
    // after startTurn the active player drew a hand (<= total) and deck+hand+discard preserved
    const after = p.deck.length + p.hand.length + p.discard.length
    expect(after).toBe(total)
    expect(p.hand.length).toBeGreaterThan(0)
    void drawn
  })

  it('deterministic AI self-play reaches a valid winner under a guard cap with no throws', () => {
    const s = SR.makeGame(42)
    let cap = 0
    expect(() => {
      while (s.winner == null && cap < 400) {
        cap++
        if (s.turn === 0) {
          // mimic a simple "you" turn: play all, buy best affordable, attack, end
          SR.playAll(s)
          // greedy-ish buy until broke
          let g = 0
          while (g++ < 20) {
            const i = s.tradeRow.findIndex(c => c != null && SR.def(c).cost <= s.trade)
            if (i < 0) break
            SR.buyCard(s, i)
          }
          // attack: break outposts then face
          let a = 0
          while (a++ < 20 && s.combat > 0) {
            const foe = s.players[1]
            const op = foe.bases.find(b => SR.def(b).outpost && (SR.def(b).defense ?? 0) <= s.combat)
            if (op) { SR.attack(s, op.id); continue }
            if (foe.bases.some(b => SR.def(b).outpost)) break
            SR.attack(s, 'face')
            break
          }
          if (s.winner != null) break
          SR.endTurn(s)
        } else {
          SR.aiTurn(s)
        }
      }
    }).not.toThrow()
    // either someone won, or we hit the cap without crashing — both acceptable
    if (s.winner != null) {
      expect([0, 1]).toContain(s.winner)
      const loser = s.winner === 0 ? 1 : 0
      expect(s.players[loser].authority).toBe(0)
    } else {
      expect(cap).toBe(400)
    }
    // sanity: authority is bounded
    expect(s.players[0].authority).toBeGreaterThanOrEqual(0)
    expect(s.players[1].authority).toBeGreaterThanOrEqual(0)
  })
})
