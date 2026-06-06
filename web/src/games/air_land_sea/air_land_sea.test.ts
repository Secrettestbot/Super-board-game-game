import { describe, it, expect } from 'vitest'
import * as ALS from './logic'
import type { State, Seat, Card } from './logic'

// Pure-logic tests (no DOM). Exercises the face-up/face-down placement rules, face-down strength,
// theater control + tie rule, majority win, withdrawal VP, the war win at 12 VP, and a full
// self-play game to a valid winner under a guard cap with no throws.

const find = (s: State, seat: Seat, theater: 'air' | 'land' | 'sea', value: number): Card => {
  const c = s.hands[seat].find(c => c.theater === theater && c.value === value)
  if (!c) throw new Error('card not in hand')
  return c
}

describe('air land sea — placement rules', () => {
  it('a face-up card must go to its own theater; mismatched face-up is rejected', () => {
    const s = ALS.makeGame(ALS.buildDeck())
    // With buildDeck order, seat 0's hand is the first 6 cards = all six AIR cards (values 1..6).
    const air3 = find(s, 0, 'air', 3)
    // Face-up AIR card to LAND (index 1) is illegal -> unchanged.
    const bad = ALS.play(s, 0, air3, 1, false)
    expect(bad).toBe(s)
    // Face-up AIR card to AIR (index 0) is legal.
    const good = ALS.play(s, 0, air3, 0, false)
    expect(good).not.toBe(s)
    expect(good.theaters[0][0].length).toBe(1)
    expect(good.theaters[0][0][0].faceDown).toBe(false)
  })

  it('a face-down card is strength 2 in ANY theater', () => {
    const s = ALS.makeGame(ALS.buildDeck())
    const air6 = find(s, 0, 'air', 6) // printed value 6
    // Play it face-down into SEA (index 2) — legal even though it's an air card.
    const t = ALS.play(s, 0, air6, 2, true)
    expect(t).not.toBe(s)
    expect(t.theaters[2][0][0].faceDown).toBe(true)
    // Strength contributed is 2, not 6.
    expect(ALS.theaterStrength(t, 0, 2)).toBe(2)
  })
})

describe('air land sea — control & tie rule', () => {
  it('theater control goes to strictly-greater strength; a tie goes to the defender', () => {
    const s = ALS.makeGame(ALS.buildDeck())
    // Build a controlled SEA theater (index 2) by direct stacking. Both sides strength 2 (one
    // face-down card each) -> tie. Defender keeps it.
    const fd = (c: Card): ALS.Placed => ({ card: c, faceDown: true })
    const c0 = s.hands[0][0]
    const c1 = s.hands[1][0]
    const staged: State = {
      ...s,
      theaters: s.theaters.map((t, i) => (i === 2 ? { 0: [fd(c0)], 1: [fd(c1)] } : t)),
    }
    expect(ALS.theaterStrength(staged, 0, 2)).toBe(2)
    expect(ALS.theaterStrength(staged, 1, 2)).toBe(2)
    // Tie -> defender. Defender = 0 means seat 0 keeps it; defender = 1 means seat 1 keeps it.
    expect(ALS.theaterControl(staged, 2, 0)).toBe(0)
    expect(ALS.theaterControl(staged, 2, 1)).toBe(1)
  })
})

describe('air land sea — battle resolution', () => {
  it('controlling 2 of 3 theaters wins the battle', () => {
    const s = ALS.makeGame(ALS.buildDeck())
    const up = (c: Card): ALS.Placed => ({ card: c, faceDown: false })
    // Give seat 0 a strong face-up card in AIR and LAND, seat 1 strong in SEA only.
    const airBig = find(s, 0, 'air', 6)
    const landBig = s.hands[1].find(c => c.theater === 'land' && c.value === 6)! // seat1 hand = LAND cards
    // Put seat 0 ahead in AIR (6 vs 0) and SEA (give seat 0 a face-down 2 vs nothing), seat 1
    // ahead in LAND only.
    const fd0 = (c: Card): ALS.Placed => ({ card: c, faceDown: true })
    const seaFiller = find(s, 0, 'air', 5) // any seat-0 card, placed face-down in SEA
    const staged: State = {
      ...s,
      theaters: [
        { 0: [up(airBig)], 1: [] },     // AIR: seat 0 wins
        { 0: [], 1: [up(landBig)] },    // LAND: seat 1 wins
        { 0: [fd0(seaFiller)], 1: [] }, // SEA: seat 0 wins (2 vs 0)
      ],
    }
    const res = ALS.resolveBattle(staged, 1) // defender = 1; ties to 1 (none here)
    expect(res.control.filter(c => c === 0).length).toBe(2)
    expect(res.winner).toBe(0)
  })
})

describe('air land sea — withdrawal & VP', () => {
  it('withdrawing awards the opponent VP scaled by cards left, and adds to the VP track', () => {
    const s = ALS.makeGame(ALS.buildDeck())
    // It's seat 0's turn; seat 0 withdraws immediately with a full hand (6 cards) -> opponent
    // gets the minimum (2 VP).
    expect(s.turn).toBe(0)
    const t = ALS.withdraw(s, 0)
    expect(t.battleResult).not.toBeNull()
    expect(t.battleResult!.winner).toBe(1)
    expect(t.battleResult!.byWithdrawal).toBe(true)
    expect(t.battleResult!.vpAwarded).toBe(2)
    expect(t.vp[1]).toBe(2)
    expect(t.vp[0]).toBe(0)
    expect(t.phase).toBe('battleOver')
  })

  it('first to 12 VP wins the war', () => {
    let s = ALS.makeGame(ALS.buildDeck())
    // Force the VP near the threshold, then a fought-out battle (6 VP) should push past 12.
    s = { ...s, vp: [7, 0] }
    // Empty both hands so the next play ends the battle; easiest: simulate a withdrawal by seat 1
    // with few cards isn't deterministic, so directly drive a fought end via emptying hands.
    // Instead: set seat 0 clearly winning then have seat 1 withdraw late for 4 VP? We need seat 0
    // to gain >=5. Use a fought battle: stage a board where seat 0 controls all, empty hands.
    const up = (c: Card): ALS.Placed => ({ card: c, faceDown: false })
    const a = s.hands[0][0], b = s.hands[0][1], c = s.hands[0][2]
    s = {
      ...s,
      hands: [[s.hands[0][3]], []], // seat 0 has one card, seat 1 empty
      theaters: [
        { 0: [up({ ...a, ability: 'reinforce' })], 1: [] },
        { 0: [up({ ...b, ability: 'reinforce' })], 1: [] },
        { 0: [up({ ...c, ability: 'reinforce' })], 1: [] },
      ],
    }
    // Seat 0 plays its last card face-down -> both hands empty -> battle resolves. Seat 0 controls
    // all three theaters -> wins 6 VP -> 13 -> war over.
    const last = s.hands[0][0]
    s = ALS.play(s, 0, last, 0, true)
    expect(s.phase).toBe('warOver')
    expect(s.winner).toBe(0)
    expect(s.vp[0]).toBeGreaterThanOrEqual(12)
  })
})

describe('air land sea — self play', () => {
  it('plays a full war to a valid winner under a guard cap with no throws', () => {
    let s = ALS.makeGame()
    let guard = 0
    const CAP = 20000

    while (s.winner == null && guard < CAP) {
      guard++
      if (s.phase === 'battleOver') {
        s = ALS.nextBattle(s)
        continue
      }
      if (s.phase === 'warOver') break
      if (s.turn === 1) {
        s = ALS.aiTurn(s)
        continue
      }
      // seat 0 (human) — simple greedy policy: take the first legal play, never withdraw.
      const opts = ALS.legalPlays(s, 0)
      if (opts.length === 0) {
        // No plays available (empty hand mid-battle shouldn't occur) — withdraw to progress.
        s = ALS.withdraw(s, 0)
        continue
      }
      const o = opts[0]
      s = ALS.play(s, 0, o.card, o.theater, o.faceDown)
    }

    expect(guard).toBeLessThan(CAP)
    expect(s.winner).not.toBeNull()
    expect([0, 1]).toContain(s.winner)
    expect(s.vp[s.winner as Seat]).toBeGreaterThanOrEqual(12)
  })
})
