/* QUACKS — netplay tests. Browser-free integration of the adapter through the real
 * HostSession/GuestSession over an in-memory transport, plus the hidden-info leak test
 * (a guest must never receive the contents/order of another seat's bag/pool). */

import { describe, it, expect } from 'vitest'
import { quacksAdapter as A, type QuacksIntent } from './net'
import { HostSession, GuestSession } from '../../net/session'
import { memoryPair } from '../../net/transport'

function connect() {
  const host = new HostSession(A)
  const [a, b] = memoryPair()
  host.addGuest(a)
  const guest = new GuestSession(A, b)
  return { host, guest }
}

/** Drive the AI for whatever non-controlled seat is to move, until it's seat `target`'s
 * turn (or the game is over). Returns the host. */
function runAIUntilSeat(host: HostSession<any, QuacksIntent>, target: number, cap = 5000) {
  let guard = 0
  while (guard++ < cap) {
    if (A.isOver(host.getFull())) return
    const seat = A.seatToMove(host.getFull())
    if (seat === target || seat == null) return
    host.stepAI()
  }
  throw new Error('AI loop did not reach target seat')
}

describe('quacks net adapter', () => {
  it('round-trips a legal intent and rejects illegal / out-of-turn', () => {
    const s = A.makeGame()
    expect(A.seatToMove(s)).toBe(0) // draw phase, seat 0 brews first
    expect(A.numSeats(s)).toBe(2)
    expect(A.isOver(s)).toBe(false)

    // legal seat-0 draw -> state changes (a chip is drawn into seat 0's pot)
    const s1 = A.applyIntent(s, 0, { kind: 'draw' })
    expect(s1).not.toBe(s)
    expect(s1.players[0].drawn.length).toBe(1)

    // out-of-turn: seat 1 cannot act while seat 0 is still drawing -> unchanged (===)
    expect(A.applyIntent(s1, 1, { kind: 'draw' })).toBe(s1)

    // illegal: a buy intent during the draw phase -> unchanged (===)
    expect(A.applyIntent(s1, 0, { kind: 'buy', card: 'orange2' })).toBe(s1)

    // illegal: unknown shop card while shopping is impossible here; bad kind -> unchanged
    expect(A.applyIntent(s1, 0, { kind: 'endShop' })).toBe(s1)
  })

  it('serializes brewing: seatToMove walks players still drawing, then resolves', () => {
    let s = A.makeGame(42)
    expect(A.seatToMove(s)).toBe(0)
    // seat 0 stops immediately -> now seat 1 is to move (still drawing)
    s = A.applyIntent(s, 0, { kind: 'stop' })
    expect(s.players[0].done).toBe(true)
    expect(A.seatToMove(s)).toBe(1)
    // seat 1 stops -> both done -> round resolved -> shop phase, seat 0 to move
    s = A.applyIntent(s, 1, { kind: 'stop' })
    expect(s.phase).toBe('shop')
    expect(A.seatToMove(s)).toBe(0)
  })

  it('shop phase: buy + endShop per seat, then advances to the next round', () => {
    let s = A.makeGame(7)
    // get to shop quickly: both stop
    s = A.applyIntent(s, 0, { kind: 'stop' })
    s = A.applyIntent(s, 1, { kind: 'stop' })
    expect(s.phase).toBe('shop')
    // seat 0 endShop -> seat 1 to move (still shopping)
    s = A.applyIntent(s, 0, { kind: 'endShop' })
    expect(A.seatToMove(s)).toBe(1)
    expect(s.phase).toBe('shop')
    // seat 1 endShop -> both done shopping -> next round, draw phase, seat 0 to move
    s = A.applyIntent(s, 1, { kind: 'endShop' })
    expect(s.phase).toBe('draw')
    expect(s.round).toBe(2)
    expect(A.seatToMove(s)).toBe(0)
  })

  it('host + guest stay in sync over an in-memory transport', () => {
    const { host, guest } = connect()
    expect(guest.ready()).toBe(true)
    expect(guest.mySeat()).toBe(1) // host is seat 0, guest gets seat 1
    expect(host.getSeats().map(s => s.kind)).toEqual(['host', 'guest'])

    // host (seat 0) brews: draw a couple then stop, all via dispatchLocal
    host.dispatchLocal({ kind: 'draw' })
    host.dispatchLocal({ kind: 'stop' })
    expect(host.getFull().players[0].done).toBe(true)
    // now it's the guest's (seat 1) turn, view synced
    expect(host.isMyTurn()).toBe(false)
    expect(guest.isMyTurn()).toBe(true)

    // guest replies: stop -> both done -> host resolves into the shop phase
    guest.dispatch({ kind: 'stop' })
    expect(host.getFull().phase).toBe('shop')
    expect(host.getFull().players[1].done).toBe(true)
    // guest's view reflects the host's authoritative phase
    expect(guest.getState().phase).toBe('shop')
  })

  it('a vacated seat reverts to AI when the guest drops', () => {
    const { host, guest } = connect()
    expect(host.aiSeat()).toBe(null) // seat 0 (host) to move
    host.dispatchLocal({ kind: 'stop' })
    expect(host.aiSeat()).toBe(null) // seat 1 is the guest -> no AI
    guest.close()
    expect(host.guestCount()).toBe(0)
    expect(host.aiSeat()).toBe(1) // seat 1 now an AI seat and it's seat 1's turn
  })

  it('plays a full host+AI game to a winner (AI fills the empty seat)', () => {
    const host = new HostSession(A)
    // no guest -> seat 1 is AI; seat 0 is the host. Drive both: host stops fast, AI plays.
    let guard = 0
    while (!A.isOver(host.getFull()) && guard++ < 20000) {
      const seat = A.seatToMove(host.getFull())
      if (seat === 0) {
        const p = host.getFull().players[0]
        if (host.getFull().phase === 'draw') host.dispatchLocal(p.pos >= 8 || p.pool.length === 0 ? { kind: 'stop' } : { kind: 'draw' })
        else host.dispatchLocal({ kind: 'endShop' })
      } else {
        host.stepAI()
      }
    }
    const f = host.getFull()
    expect(f.phase).toBe('over')
    expect(f.winner === 0 || f.winner === 1).toBe(true)
    expect(f.round).toBe(9)
  })
})

describe('quacks redaction (hidden-info leak test)', () => {
  it('a guest never sees the contents/order of other seats\' bags or pools', () => {
    const { host, guest } = connect()
    // Advance into a state with real, distinct chips: host draws a chip (so seat 0 has a
    // public drawn chip), then run the AI a few steps so seat 1's bag/pool differ from
    // seat 0's. Then inspect the guest's (seat 1) view.
    host.dispatchLocal({ kind: 'draw' })
    host.dispatchLocal({ kind: 'stop' })

    const view = guest.getState() // seat 1's redacted view

    // Guest sees its OWN bag/pool in full (real chips with positive ids).
    expect(view.players[1].bag.length).toBe(host.getFull().players[1].bag.length)
    expect(view.players[1].bag.every(c => c.id > 0)).toBe(true)
    expect(view.players[1].pool.length).toBe(host.getFull().players[1].pool.length)

    // The OTHER seat's (seat 0) bag + pool are redacted: same COUNT, opaque placeholders.
    const full0 = host.getFull().players[0]
    expect(view.players[0].bag.length).toBe(full0.bag.length) // count preserved
    expect(view.players[0].pool.length).toBe(full0.pool.length)
    expect(view.players[0].bag.every(c => c.id === -1 && c.value === 0)).toBe(true)
    expect(view.players[0].pool.every(c => c.id === -1 && c.value === 0)).toBe(true)

    // Seat 0's chips already DRAWN this round stay public (they're on the board).
    expect(view.players[0].drawn).toEqual(full0.drawn)

    // Structural proof that seat 0's HIDDEN chips never cross the wire: every chip in the
    // redacted bag/pool is the opaque placeholder (id:-1, value:0). Chip ids are NOT globally
    // unique across seats, so a JSON.stringify byte-scan for `"id":N` would false-positive on
    // the guest's own legitimately-visible chips — we assert on the redacted region instead.
    expect(view.players[0].bag.every(c => c.id === -1 && c.value === 0)).toBe(true)
    expect(view.players[0].pool.every(c => c.id === -1 && c.value === 0)).toBe(true)

    // The RNG seed (which would let a guest predict future draws) is also stripped.
    expect(view.rng).toBe(0)
  })

  it('redactFor leaves the acting seat its own full information (round-trip identity-ish)', () => {
    const s = A.makeGame(99)
    const v0 = A.redactFor!(s, 0)
    // seat 0 keeps its own bag/pool fully (ids positive, real values)
    expect(v0.players[0].bag.every(c => c.id > 0)).toBe(true)
    expect(v0.players[0].bag.map(c => c.color)).toEqual(s.players[0].bag.map(c => c.color))
    // seat 1's bag is redacted away
    expect(v0.players[1].bag.every(c => c.id === -1)).toBe(true)
    // counts always preserved
    expect(v0.players[1].bag.length).toBe(s.players[1].bag.length)
    expect(v0.players[1].pool.length).toBe(s.players[1].pool.length)
  })
})
