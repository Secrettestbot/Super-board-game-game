/* PROTOCOL — the contract between a game and the netplay layer, plus the wire
 * messages exchanged host<->guest over a Transport.
 *
 * A game opts into online play by exporting a GameAdapter (see games/<id>/net.ts)
 * that maps its own pure logic onto a uniform, seat-relative surface. The adapter is
 * the ONLY game-specific code the net layer needs; logic.ts stays untouched.
 */

/**
 * Maps one game's pure logic onto the uniform surface the session needs.
 * S = the game's full state object; I = a JSON-serializable move "intent".
 */
export interface GameAdapter<S, I> {
  /** Fresh initial state (same call the solo game already makes). */
  makeGame(): S
  /** Total seats this match has (e.g. chess 2, chinese checkers up to 6). */
  numSeats(s: S): number
  /** Seat index whose turn it is, or null when the game is over / nobody to move. */
  seatToMove(s: S): number | null
  /** Whether the game has ended. */
  isOver(s: S): boolean
  /**
   * Validate + apply an intent submitted *by* `seat`. Must return the input state
   * unchanged if the intent is illegal or not that seat's turn (never throw).
   * Reuses the game's existing pure transition functions.
   */
  applyIntent(s: S, seat: number, intent: I): S
  /** Advance the AI for an unfilled seat (reuses the game's existing aiMove/aiPlay). */
  aiStep(s: S, seat: number): S
  /** A string that changes on every state transition, to re-arm the AI timer. */
  tickKey(s: S): string
  /**
   * Per-seat view for hidden-information games: strip everything `seat` may not see.
   * Defaults to identity (fine for perfect-information games). MUST NOT leak other
   * seats' secrets — guarded by each game's leak test.
   */
  redactFor?(s: S, seat: number): S
}

/** Connection / lobby status surfaced to the OnlineBar UI. */
export type NetStatus =
  | 'offline'      // pure local play (default)
  | 'hosting'      // host has generated an offer, waiting for a guest answer
  | 'connected'    // at least one guest is connected (host) / joined (guest)
  | 'joining'      // guest has an offer, generating an answer
  | 'guest'        // guest is connected to a host
  | 'error'

/** A seat in the lobby/seat table. */
export interface SeatInfo {
  seat: number
  kind: 'host' | 'guest' | 'ai' | 'open'
  label: string
}

// ---- wire messages -------------------------------------------------------------
// Guest -> Host
export interface MsgHello { t: 'hello' }
export interface MsgIntent { t: 'intent'; intent: unknown }
export type GuestMsg = MsgHello | MsgIntent

// Host -> Guest
export interface MsgWelcome { t: 'welcome'; seat: number; numSeats: number; view: unknown; seats: SeatInfo[] }
export interface MsgView { t: 'view'; view: unknown; seats: SeatInfo[] }
export type HostMsg = MsgWelcome | MsgView

export type WireMsg = GuestMsg | HostMsg
