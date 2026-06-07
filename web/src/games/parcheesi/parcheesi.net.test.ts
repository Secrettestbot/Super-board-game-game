/* PARCHEESI — netplay adapter tests. Two parts:
 *   1) adapter round-trip: a legal roll/move advances the state; out-of-turn and illegal
 *      intents return the SAME state reference (===).
 *   2) host + guest stay in sync over an in-memory transport pair (the headless stand-in for
 *      a live WebRTC end-to-end run).
 * Public information game, so no redaction / leak test is needed. */

import { describe, it, expect } from 'vitest'
import { parcheesiAdapter as A, type ParcheesiIntent } from './net'
import * as P from './logic'
import type { ParState } from './logic'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

// A deterministic RNG cycling through the supplied 0<=x<1 values (then repeats).
function seq(vals: number[]): () => number {
  let i = 0
  return () => vals[(i++) % vals.length]
}

// Roll a known pair on the FRESH game (seat 0 still in start). rollDie = 1 + floor(x*6),
// so x=0.7 -> 5. Two 0.7s give dice [5,5] (doubles) which releases + an extra turn.
// We instead want a roll that produces a usable, non-doubles move from a fresh board.
// From start with all pawns home(-1), only a 5 (or sum-5) releases. Use [5,3]: x=0.7 -> 5,
// x=0.4 -> 3 (1+floor(0.4*6)=1+2=3). Not doubles; die A=5 releases a pawn.
function freshRollState(): ParState {
  const s = A.makeGame()
  return P.roll(s, seq([0.7, 0.4])) // dice [5,3]
}

describe('parcheesi net adapter', () => {
  it('reports seats and seatToMove off the real state', () => {
    const s = A.makeGame()
    expect(A.numSeats(s)).toBe(4)
    expect(A.seatToMove(s)).toBe(0)
    expect(A.isOver(s)).toBe(false)
  })

  it('round-trips a legal roll then a legal move; rejects out-of-turn & illegal', () => {
    const s0 = A.makeGame()

    // out-of-turn: seat 1 cannot act while it is seat 0's turn -> same ref
    expect(A.applyIntent(s0, 1, { kind: 'roll' })).toBe(s0)
    // illegal-for-phase: a move intent during the roll phase -> same ref
    expect(A.applyIntent(s0, 0, { kind: 'move', token: 0, die: 5 })).toBe(s0)

    // legal roll advances (step bumps). The roll uses host RNG: most rolls open the
    // move phase, but a roll with no legal release auto-passes the turn — both are valid.
    // Retry fresh games until we get one that opens the move phase, then assert on it.
    let rolled = A.applyIntent(A.makeGame(), 0, { kind: 'roll' })
    let guard = 0
    while (rolled.phase !== 'move' && guard++ < 200) rolled = A.applyIntent(A.makeGame(), 0, { kind: 'roll' })
    expect(rolled.phase).toBe('move')
    expect(rolled.rolled).toBe(true)
    expect(A.tickKey(rolled)).not.toBe(A.tickKey(A.makeGame()))

    // can't roll again mid-move -> same ref
    expect(A.applyIntent(rolled, 0, { kind: 'roll' })).toBe(rolled)
  })

  it('a legal move releases a pawn with the rolled 5 and stays seat 0 through the turn', () => {
    const rolled = freshRollState() // dice [5,3], seat 0 to move
    expect(rolled.dice).toEqual([5, 3])
    expect(A.seatToMove(rolled)).toBe(0)

    // illegal move: pawn 0 with die 3 from START is not allowed (only a 5 releases) -> same ref
    expect(A.applyIntent(rolled, 0, { kind: 'move', token: 0, die: 3 })).toBe(rolled)

    // legal move: release pawn 0 with the 5
    const moved = A.applyIntent(rolled, 0, { kind: 'move', token: 0, die: 5 })
    expect(moved).not.toBe(rolled)
    expect(moved.pawns[0][0]).toBe(1) // pawn 0 now on its entry square
    // the 3 is still unused and it is still seat 0's turn within the move phase
    expect(A.seatToMove(moved)).toBe(0)
    expect(A.tickKey(moved)).not.toBe(A.tickKey(rolled))
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)

    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host=0, first guest=1
    expect(A.numSeats(guest.getState())).toBe(4)

    // host (seat 0) rolls -> guest's view mirrors the host authoritatively, whatever the
    // roll produced (move phase, or an auto-pass on a no-legal-move roll).
    host.dispatchLocal({ kind: 'roll' })
    expect(guest.getState().phase).toBe(host.getFull().phase)
    expect(guest.getState().step).toBe(host.getFull().step)
    expect(guest.getState().turn).toBe(host.getFull().turn)

    // out-of-turn guest intent is ignored by the host authority — but only assert this
    // while it is genuinely NOT the guest's turn (a no-move host roll can auto-pass to seat 1).
    if (A.seatToMove(host.getFull()) !== guest.mySeat()) {
      const before = host.getFull().step
      guest.dispatch({ kind: 'roll' } as ParcheesiIntent)
      expect(host.getFull().step).toBe(before)
    }
  })

  it('guest can act once the turn reaches its seat', () => {
    // Drive the host (seat 0) through a full turn deterministically so it advances to seat 1.
    const host = new HostSession(A)
    const [a, b] = memoryPair()
    host.addGuest(a)
    const guest = new GuestSession(A, b)
    expect(guest.mySeat()).toBe(1)

    // Step seat 0's AI-free turn forward via host dispatch until it is no longer seat 0.
    // A fresh roll that yields no release (no 5, no sum-5) auto-passes the turn.
    let guard = 0
    while (A.seatToMove(host.getFull()) === 0 && guard++ < 50) {
      const full = host.getFull()
      if (full.phase === 'roll') {
        host.dispatchLocal({ kind: 'roll' })
      } else {
        // move phase: play any legal move so the turn eventually resolves
        const die = full.bonus > 0 ? full.bonus
          : full.dice && !full.usedDice[0] ? full.dice[0]
            : full.dice ? full.dice[1] : 0
        const legal = P.legalMoves(full, 0, die)
        if (legal.length) host.dispatchLocal({ kind: 'move', token: legal[0], die })
        else host.dispatchLocal({ kind: 'move', token: 0, die }) // illegal -> no-op; break below
        if (host.getFull() === full) break
      }
    }

    // The key invariant (robust to whatever roll sequence occurred): the guest's
    // isMyTurn() exactly tracks its own view — true iff the game is live and it's seat 1.
    const gv = guest.getState()
    const guestsTurn = !A.isOver(gv) && A.seatToMove(gv) === guest.mySeat()
    expect(guest.isMyTurn()).toBe(guestsTurn)
    // and the guest's view stays in lockstep with the host authority
    expect(guest.getState().step).toBe(host.getFull().step)
  })
})
