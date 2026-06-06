/* SESSION — framework-agnostic host/guest orchestration over a Transport.
 *
 * Split out from the React hook so the whole netplay protocol (seat assignment,
 * intent validation, per-seat redacted broadcasts, AI fill of empty seats, drop ->
 * AI) can be unit-tested deterministically with an in-memory transport pair, with no
 * browser or WebRTC. useGameSession is a thin React binding over these classes.
 *
 * Local solo play IS a HostSession with zero guests: seat 0 is you, the rest are AI.
 * "Hosting online" just opens that same session to remote guests.
 */

import type { GameAdapter, SeatInfo, WireMsg } from './protocol'
import type { Transport } from './transport'

function view<S>(a: GameAdapter<S, unknown>, s: S, seat: number): S {
  return a.redactFor ? a.redactFor(s, seat) : s
}

/** Authority: owns the true state, fills empty seats with AI, serves any guests. */
export class HostSession<S, I> {
  private auth: S
  private guests: { seat: number; transport: Transport }[] = []
  private listener: (() => void) | null = null
  readonly mySeat = 0

  constructor(private adapter: GameAdapter<S, I>) {
    this.auth = adapter.makeGame()
  }

  onChange(cb: (() => void) | null) { this.listener = cb }
  private emit() { this.listener?.() }

  getState(): S { return view(this.adapter, this.auth, this.mySeat) }
  /** Full (un-redacted) authoritative state — host only; never sent to guests as-is. */
  getFull(): S { return this.auth }
  numSeats(): number { return this.adapter.numSeats(this.auth) }
  tickKey(): string { return this.adapter.tickKey(this.auth) }
  isMyTurn(): boolean { return !this.adapter.isOver(this.auth) && this.adapter.seatToMove(this.auth) === this.mySeat }

  private controlled(): Set<number> {
    return new Set<number>([this.mySeat, ...this.guests.map(g => g.seat)])
  }

  getSeats(): SeatInfo[] {
    const n = this.numSeats()
    const g = new Set(this.guests.map(x => x.seat))
    const out: SeatInfo[] = []
    for (let i = 0; i < n; i++) {
      if (i === this.mySeat) out.push({ seat: i, kind: 'host', label: 'You (host)' })
      else if (g.has(i)) out.push({ seat: i, kind: 'guest', label: `Player ${i + 1}` })
      else out.push({ seat: i, kind: 'ai', label: 'AI' })
    }
    return out
  }

  private commit(next: S) {
    this.auth = next
    const seats = this.getSeats()
    for (const g of this.guests) {
      g.transport.send({ t: 'view', view: view(this.adapter, next, g.seat), seats } as WireMsg)
    }
    this.emit()
  }

  newGame() { this.commit(this.adapter.makeGame()) }

  /** Submit an intent for the host's own seat. */
  dispatchLocal(intent: I) {
    if (this.adapter.seatToMove(this.auth) !== this.mySeat) return
    this.commit(this.adapter.applyIntent(this.auth, this.mySeat, intent))
  }

  /** The seat an AI should act for right now, or null (game over / a human's turn). */
  aiSeat(): number | null {
    if (this.adapter.isOver(this.auth)) return null
    const seat = this.adapter.seatToMove(this.auth)
    if (seat == null) return null
    return this.controlled().has(seat) ? null : seat
  }
  /** Advance the AI one step for the current AI seat (driven by an external timer). */
  stepAI() {
    const seat = this.aiSeat()
    if (seat == null) return
    this.commit(this.adapter.aiStep(this.auth, seat))
  }

  private welcomeFor(seat: number): WireMsg {
    return { t: 'welcome', seat, numSeats: this.numSeats(), view: view(this.adapter, this.auth, seat), seats: this.getSeats() }
  }

  /** Attach a guest transport: assign the lowest open seat and start serving it. */
  addGuest(transport: Transport) {
    const n = this.numSeats()
    const taken = this.controlled()
    let seat = -1
    for (let i = 0; i < n; i++) if (!taken.has(i)) { seat = i; break }
    if (seat < 0) { transport.close(); return } // table full
    this.guests.push({ seat, transport })
    transport.onMessage(raw => {
      const m = raw as WireMsg
      if (m.t === 'intent') {
        if (this.adapter.seatToMove(this.auth) !== seat) return // out of turn / cheat -> ignore
        this.commit(this.adapter.applyIntent(this.auth, seat, m.intent as I))
      } else if (m.t === 'hello') {
        transport.send(this.welcomeFor(seat)) // (re)sync a guest that just opened
      }
    })
    transport.onClose(() => {
      this.guests = this.guests.filter(g => g.transport !== transport)
      this.emit() // vacated seat reverts to AI on the next tick
    })
    transport.send(this.welcomeFor(seat))
    this.emit()
  }

  guestCount(): number { return this.guests.length }
  closeAll() { this.guests.forEach(g => g.transport.close()); this.guests = [] }
}

/** Thin client: renders the host's per-seat view, sends intents upstream. */
export class GuestSession<S, I> {
  private state: S | null = null
  private seats: SeatInfo[] = []
  private seat = 0
  private listener: (() => void) | null = null

  constructor(private adapter: GameAdapter<S, I>, private transport: Transport) {
    transport.onMessage(raw => {
      const m = raw as WireMsg
      if (m.t === 'welcome') { this.seat = m.seat; this.state = m.view as S; this.seats = m.seats; this.emit() }
      else if (m.t === 'view') { this.state = m.view as S; this.seats = m.seats; this.emit() }
    })
    transport.onOpen(() => transport.send({ t: 'hello' } as WireMsg))
  }

  onChange(cb: (() => void) | null) { this.listener = cb }
  private emit() { this.listener?.() }

  ready(): boolean { return this.state != null }
  getState(): S { return this.state ?? this.adapter.makeGame() }
  getSeats(): SeatInfo[] { return this.seats }
  mySeat(): number { return this.seat }
  tickKey(): string { return this.adapter.tickKey(this.getState()) }
  isMyTurn(): boolean {
    const s = this.state
    return s != null && !this.adapter.isOver(s) && this.adapter.seatToMove(s) === this.seat
  }
  dispatch(intent: I) { this.transport.send({ t: 'intent', intent } as WireMsg) }
  close() { this.transport.close() }
}
