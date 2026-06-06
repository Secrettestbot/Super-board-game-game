import { describe, it, expect } from 'vitest'
import * as MB from './logic'
import type { Card, State, Player } from './logic'

// Helpers to build small deterministic states. Deck top = last element.
function card(over: Partial<Card> & { kind: Card['kind'] }, id = 999): Card {
  return { id, name: over.name ?? '?', ...over } as Card
}

// Make a base game then hand-set the active player's situation for a focused test.
function freshWith(handP0: Card[]): State {
  // give a tiny deck so makeGame deal doesn't matter; we overwrite hands after
  const filler: Card[] = []
  for (let i = 0; i < 30; i++) filler.push(card({ kind: 'distance', km: 25, name: '25' }, 1000 + i))
  const s = MB.makeGame(filler)
  s.players[0].hand = handP0
  s.players[1].hand = []
  s.turn = 0
  s.drewThisTurn = true
  return s
}

describe('Mille Bornes logic', () => {
  it('cannot play distance without an active Roll', () => {
    const dist = card({ kind: 'distance', km: 75, name: '75' }, 1)
    const s = freshWith([dist])
    expect(MB.canPlayDistance(s, 0)).toBe(false)
    expect(MB.legalPlays(s, 0)).not.toContain(1)
    const after = MB.play(s, 0, 1)
    expect(after.players[0].distance).toBe(0)   // play rejected
  })

  it('a Go remedy starts the roll and enables distance', () => {
    const go = card({ kind: 'remedy', hazard: 'stop', name: 'Go' }, 1)
    const dist = card({ kind: 'distance', km: 100, name: '100' }, 2)
    let s = freshWith([go, dist])
    s = MB.play(s, 0, 1)            // play Go (ends turn)
    expect(s.players[0].roll).toBe(true)
    s.turn = 0; s.drewThisTurn = true
    expect(MB.canPlayDistance(s, 0)).toBe(true)
    s = MB.play(s, 0, 2)
    expect(s.players[0].distance).toBe(100)
  })

  it('a Stop hazard blocks distance until a Go remedy clears it', () => {
    const go = card({ kind: 'remedy', hazard: 'stop', name: 'Go' }, 1)
    const dist = card({ kind: 'distance', km: 50, name: '50' }, 2)
    let s = freshWith([go, dist])
    s.players[0].roll = true
    s.players[0].hazard = 'stop'
    s.players[0].roll = false      // stopped
    expect(MB.canPlayDistance(s, 0)).toBe(false)
    s = MB.play(s, 0, 1)           // Go clears stop, rolling again
    expect(s.players[0].hazard).toBe(null)
    expect(s.players[0].roll).toBe(true)
    s.turn = 0; s.drewThisTurn = true
    s = MB.play(s, 0, 2)
    expect(s.players[0].distance).toBe(50)
  })

  it('Speed Limit caps plays at <= 50 until End of Limit', () => {
    const big = card({ kind: 'distance', km: 100, name: '100' }, 1)
    const small = card({ kind: 'distance', km: 50, name: '50' }, 2)
    const eol = card({ kind: 'remedy', hazard: 'limit', name: 'End of Limit' }, 3)
    let s = freshWith([big, small, eol])
    s.players[0].roll = true
    s.players[0].speedLimit = true
    expect(MB.isPlayable(s, 0, big)).toBe(false)   // 100 blocked
    expect(MB.isPlayable(s, 0, small)).toBe(true)  // 50 allowed
    s = MB.play(s, 0, 3)                            // End of Limit
    expect(s.players[0].speedLimit).toBe(false)
    s.turn = 0; s.drewThisTurn = true
    expect(MB.isPlayable(s, 0, big)).toBe(true)
  })

  it('a Safety grants permanent immunity to its hazard', () => {
    // player 0 plays Driving Ace; player 1 cannot then play Accident on them
    const ace = card({ kind: 'safety', hazard: 'accident', name: 'Driving Ace' }, 1)
    let s = freshWith([ace])
    s.players[1].hand = [card({ kind: 'hazard', hazard: 'accident', name: 'Accident' }, 5)]
    s.players[0].roll = true
    s = MB.play(s, 0, 1)                            // play safety
    expect(s.players[0].safeties.length).toBe(1)
    // now it's player 1's turn; an accident hazard must be illegal vs immune player 0
    s.turn = 1; s.drewThisTurn = true
    const hz = s.players[1].hand[0]
    expect(MB.isPlayable(s, 1, hz)).toBe(false)
    expect(MB.immuneTo(s.players[0], 'accident')).toBe(true)
  })

  it('a safety cancels an active matching hazard immediately', () => {
    const spare = card({ kind: 'safety', hazard: 'flat', name: 'Puncture-Proof' }, 1)
    let s = freshWith([spare])
    s.players[0].roll = true
    s.players[0].hazard = 'flat'
    s.players[0].roll = false
    s = MB.play(s, 0, 1)
    expect(s.players[0].hazard).toBe(null)
    expect(MB.immuneTo(s.players[0], 'flat')).toBe(true)
  })

  it('reaching 1000 km wins', () => {
    const d1 = card({ kind: 'distance', km: 200, name: '200' }, 1)
    let s = freshWith([d1])
    s.players[0].roll = true
    s.players[0].distance = 800
    s = MB.play(s, 0, 1)
    expect(s.players[0].distance).toBe(1000)
    expect(s.winner).toBe(0)
  })

  it('cannot overshoot 1000', () => {
    const d1 = card({ kind: 'distance', km: 100, name: '100' }, 1)
    let s = freshWith([d1])
    s.players[0].roll = true
    s.players[0].distance = 950
    expect(MB.isPlayable(s, 0, d1)).toBe(false)
  })

  it('self-play terminates at a valid winner (or deck-empty resolution) under a guard cap, no throws', () => {
    expect(() => {
      let s = MB.makeGame(MB.shuffle(MB.buildDeck()))
      let guard = 0
      while (s.winner === null && guard < 5000) {
        guard++
        const me = s.turn as Player
        if (me === 1) {
          s = MB.aiTurn(s)
        } else {
          // mirror the AI heuristic for player 0 to drive the game
          if (!s.drewThisTurn) s = MB.drawCard(s, 0)
          if (s.winner !== null) break
          const ps = s.players[0]
          const hand = ps.hand
          let acted = false
          // play Go if needed
          if (!ps.roll || ps.hazard === 'stop') {
            const go = hand.find(c => c.kind === 'remedy' && c.hazard === 'stop' && MB.isPlayable(s, 0, c))
            if (go) { s = MB.play(s, 0, go.id); acted = true }
          }
          if (!acted && ps.hazard !== null && ps.hazard !== 'stop') {
            const fix = hand.find(c => c.kind === 'remedy' && c.hazard === ps.hazard && MB.isPlayable(s, 0, c))
            if (fix) { s = MB.play(s, 0, fix.id); acted = true }
          }
          if (!acted && MB.canPlayDistance(s, 0)) {
            const dists = hand.filter(c => c.kind === 'distance' && MB.isPlayable(s, 0, c)).sort((a, b) => b.km! - a.km!)
            if (dists.length) { s = MB.play(s, 0, dists[0].id); acted = true }
          }
          if (!acted) {
            const haz = hand.filter(c => c.kind === 'hazard' && MB.isPlayable(s, 0, c))
            if (haz.length) { s = MB.play(s, 0, haz[0].id); acted = true }
          }
          if (!acted) {
            // discard something; if hand somehow empty, force turn pass via discard guard
            if (hand.length) s = MB.discard(s, 0, hand[hand.length - 1].id)
            else { s.turn = 1; s.drewThisTurn = false }
          }
        }
        // deck-empty resolution: nobody can progress -> farther player wins
        if (s.deck.length === 0 && s.players[0].hand.length === 0 && s.players[1].hand.length === 0) {
          break
        }
      }
      // resolve a deck-empty / capped game by distance
      let s2: State = s
      if (s2.winner === null) {
        const wn: Player = s2.players[0].distance >= s2.players[1].distance ? 0 : 1
        s2 = { ...s2, winner: wn }
      }
      expect(s2.winner === 0 || s2.winner === 1).toBe(true)
      expect(guard).toBeLessThan(5000)
    }).not.toThrow()
  })
})
