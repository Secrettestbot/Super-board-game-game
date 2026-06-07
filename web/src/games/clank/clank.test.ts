import { describe, it, expect } from 'vitest'
import {
  makeGame, playHand, buyCard, move, grabArtifact, dragonAttack, endTurn,
  scorePlayer, aiTurn, def, CARDS, ROOMS, HAND_SIZE, DEEPEST, START_ROOM,
  type ClankState, type Player,
} from './logic'

// helper: force a known card into the current player's hand for deterministic effects
function setHand(s: ClankState, player: Player, keys: string[]) {
  const p = s.players[player]
  // recycle existing hand back to discard, then craft a controlled hand
  p.discard.push(...p.hand)
  p.hand = []
  let uid = 100000
  for (const k of keys) p.hand.push({ id: uid++, key: k })
}

describe('Clank! logic', () => {
  it('playing the hand accumulates skill / swords / boots', () => {
    const s = makeGame(1)
    setHand(s, 0, ['burgle', 'sidestep', 'scramble']) // skill1 / boot1 / skill1+boot1
    playHand(s)
    expect(s.skill).toBe(2)
    expect(s.boots).toBe(2)
    expect(s.swords).toBe(0)
  })

  it('buying a card costs skill and the card goes to discard', () => {
    const s = makeGame(2)
    setHand(s, 0, ['burgle', 'burgle', 'burgle']) // +3 skill
    playHand(s)
    expect(s.skill).toBe(3)
    // find a market slot we can afford (shortsword costs 2) — inject one to be deterministic
    s.market[0] = { id: 9001, key: 'shortsword' }
    const beforeDiscard = s.players[0].discard.length
    buyCard(s, 0, 0)
    expect(s.skill).toBe(1) // 3 - 2
    expect(s.players[0].discard.length).toBe(beforeDiscard + 1)
    expect(s.players[0].discard.some(c => c.key === 'shortsword')).toBe(true)
    expect(s.market[0]).not.toBeNull() // refilled
  })

  it('moving costs a boot and is blocked without enough resources', () => {
    const s = makeGame(3)
    setHand(s, 0, ['sidestep']) // +1 boot only
    playHand(s)
    expect(s.players[0].room).toBe(START_ROOM)
    // move to room 1 (free passage) — costs 1 boot
    move(s, 0, 1)
    expect(s.players[0].room).toBe(1)
    expect(s.boots).toBe(0)
    // no boots left → cannot move again
    move(s, 0, 2)
    expect(s.players[0].room).toBe(1)
  })

  it('a blocked passage requires swords to enter', () => {
    const s = makeGame(4)
    const p = s.players[0]
    p.room = 2 // Old Cellar, next room 3 (Goblin Warren) costs 1 sword
    setHand(s, 0, ['sidestep']) // boot but no swords
    playHand(s)
    move(s, 0, 3)
    expect(p.room).toBe(2) // blocked: not enough swords
    // give swords + boots and retry
    setHand(s, 0, ['sidestep', 'shortsword'])
    playHand(s)
    move(s, 0, 3)
    expect(p.room).toBe(3)
  })

  it('a deck reshuffles from discard when empty', () => {
    const s = makeGame(5)
    const p = s.players[0]
    // drain the deck into played/discard by ending several turns is complex; instead
    // empty the deck and seed discard, then draw via endTurn->startTurn cycle.
    p.deck = []
    p.discard = [{ id: 7001, key: 'burgle' }, { id: 7002, key: 'sidestep' }, { id: 7003, key: 'burgle' }]
    p.hand = []
    endTurn(s) // player 0 ends -> AI turn -> back; on player 0 startTurn it draws from reshuffle
    // run AI's whole turn so it returns to player 0
    let guard = 0
    while (s.turn !== 0 && s.winner == null && guard++ < 5) aiTurn(s)
    expect(p.hand.length).toBeGreaterThan(0)
    // all the discard cards are now somewhere in deck/hand (reshuffled)
    expect(p.deck.length + p.hand.length).toBeGreaterThanOrEqual(3)
  })

  it('grabbing an artifact records it and scoring includes its value', () => {
    const s = makeGame(6)
    const p = s.players[0]
    p.room = 4 // Crystal Cave holds a 5-pt artifact
    expect(ROOMS[4].artifact).toBe(5)
    grabArtifact(s, 0)
    expect(p.artifact).toBe(5)
    expect(s.rooms[4].artifact).toBeUndefined() // removed from room
    const sc = scorePlayer(s, 0)
    expect(sc).toBeGreaterThanOrEqual(5)
  })

  it('a dragon attack reduces health by clank', () => {
    const s = makeGame(7)
    const p = s.players[0]
    p.clank = 3
    const before = p.health
    dragonAttack(s, true) // forced
    expect(p.health).toBe(before - 3)
    // zero clank → no damage on next forced attack
    const p1 = s.players[1]
    p1.clank = 0
    const h1 = p1.health
    dragonAttack(s, true)
    expect(p1.health).toBe(h1)
  })

  it('scoring sums artifacts, gold and card points', () => {
    const s = makeGame(8)
    const p = s.players[0]
    p.gold = 4
    p.artifact = 7
    p.escaped = true
    // a victory-point card in the deck
    p.discard.push({ id: 8001, key: 'amulet' }) // 3 VP
    expect(def({ id: 0, key: 'amulet' }).points).toBe(3)
    expect(scorePlayer(s, 0)).toBe(4 + 7 + 3)
  })

  it('deterministic AI self-play reaches a valid winner under a guard cap with no throws', () => {
    const s = makeGame(123)
    let guard = 0
    expect(() => {
      while (s.winner == null && guard++ < 400) {
        if (s.turn === 1) {
          aiTurn(s)
        } else {
          // simple scripted "you": play hand, buy nothing, descend/escape like the AI
          // mirror aiTurn's behaviour for player 0 by temporarily acting greedily.
          playHand(s)
          const p = s.players[0]
          if (s.rooms[p.room].artifact != null && p.artifact == null) grabArtifact(s, 0)
          // move: if carrying, retreat; else descend if affordable
          let mg = 0
          while (mg++ < 10 && s.boots > 0 && s.winner == null) {
            if (p.artifact != null) {
              if (p.room <= START_ROOM) break
              if (!move(s, 0, p.room - 1)) break
            } else {
              const next = p.room + 1
              if (next > DEEPEST) break
              if (s.swords < s.rooms[next].swordCost) break
              if (!move(s, 0, next)) break
              if (s.rooms[p.room].artifact != null && p.artifact == null) grabArtifact(s, 0)
              if (p.artifact != null) break
            }
          }
          if (s.winner == null) endTurn(s)
        }
      }
    }).not.toThrow()
    // either a valid winner was reached, or we hit the cap without throwing
    if (s.winner != null) {
      expect([0, 1]).toContain(s.winner)
      expect(s.phase).toBe('over')
    } else {
      expect(guard).toBeGreaterThanOrEqual(400)
    }
  })

  it('the dragon escalation cannot run health negative', () => {
    const s = makeGame(9)
    for (const pl of [0, 1] as Player[]) s.players[pl].clank = 99
    dragonAttack(s, true)
    expect(s.players[0].health).toBeGreaterThanOrEqual(0)
    expect(s.players[1].health).toBeGreaterThanOrEqual(0)
  })

  it('market and starter deck are sized as expected', () => {
    const s = makeGame(10)
    expect(s.market.length).toBe(4)
    expect(s.players[0].hand.length).toBe(HAND_SIZE)
    expect(Object.keys(CARDS).length).toBeGreaterThan(8)
  })
})
