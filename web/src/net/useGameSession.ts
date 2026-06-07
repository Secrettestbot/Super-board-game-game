/* useGameSession — the one hook every online-capable game uses. A thin React
 * binding over HostSession / GuestSession (net/session.ts).
 *
 *   const { state, mySeat, isMyTurn, dispatch, newGame, net } = useGameSession(adapter)
 *
 * Modes (all behind one API):
 *   - local  (default): a HostSession with no guests — seat 0 is you, rest are AI.
 *   - host   : the same HostSession, now accepting remote guests for the other seats.
 *   - guest  : a GuestSession rendering the host's per-seat view, sending intents up.
 *
 * Only the authority (local/host) runs game logic, so there is no lockstep problem.
 * Hidden info is contained via adapter.redactFor per seat (see session.ts).
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useAITurn } from '../framework/useAITurn'
import { createHostConnection, joinConnection, type HostHandle } from './transport'
import { GuestSession, HostSession } from './session'
import type { GameAdapter, NetStatus, SeatInfo } from './protocol'

export interface OnlineController {
  status: NetStatus
  online: boolean
  amHost: boolean
  seats: SeatInfo[]
  offerCode?: string
  answerCode?: string
  host(): Promise<string>
  acceptAnswer(answerCode: string): Promise<void>
  joinFromOffer(offerCode: string): Promise<string>
  reset(): void
}

export interface GameSession<S, I> {
  state: S
  mySeat: number
  isMyTurn: boolean
  dispatch: (intent: I) => void
  newGame: () => void
  net: OnlineController
}

export function useGameSession<S, I>(adapter: GameAdapter<S, I>): GameSession<S, I> {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [mode, setMode] = useState<'local' | 'host' | 'guest'>('local')
  const [status, setStatus] = useState<NetStatus>('offline')
  const [offerCode, setOfferCode] = useState<string | undefined>()
  const [answerCode, setAnswerCode] = useState<string | undefined>()

  // Lazy-create the authority session. Local play and hosting share one HostSession.
  const hostRef = useRef<HostSession<S, I> | null>(null)
  if (!hostRef.current) hostRef.current = new HostSession(adapter)
  const guestRef = useRef<GuestSession<S, I> | null>(null)
  const pendingHostRef = useRef<HostHandle | null>(null)

  // Subscribe the active session's change events to a re-render.
  useEffect(() => {
    const active = mode === 'guest' ? guestRef.current : hostRef.current
    active?.onChange(force)
    return () => active?.onChange(null)
  }, [mode])

  const amGuest = mode === 'guest'
  // The guest session is created asynchronously inside joinFromOffer (after the WebRTC
  // answer is generated). Between setMode('guest') and that assignment there's a render
  // where guestRef is still null — fall back to the local host session so we never read
  // from null (that would crash the whole page to a blank screen).
  const guestReady = amGuest && guestRef.current != null
  const session = guestReady ? guestRef.current! : hostRef.current!

  // ---- AI driver (authority only — never while we're a guest) ------------------
  const aiSeat = !amGuest ? hostRef.current!.aiSeat() : null
  useAITurn(aiSeat != null, () => hostRef.current!.stepAI(), {
    delayMs: 480,
    tick: session.tickKey(),
  })

  // ---- surface to component ---------------------------------------------------
  const state = session.getState()
  const mySeat = guestReady ? guestRef.current!.mySeat() : 0
  const isMyTurn = session.isMyTurn()

  const dispatch = useCallback((intent: I) => {
    if (guestRef.current && mode === 'guest') guestRef.current.dispatch(intent)
    else hostRef.current!.dispatchLocal(intent)
  }, [mode])

  const newGame = useCallback(() => {
    if (mode === 'guest') return // host controls new games
    hostRef.current!.newGame()
  }, [mode])

  // ---- controller actions -----------------------------------------------------
  const host = useCallback(async (): Promise<string> => {
    setMode('host')
    const handle = await createHostConnection()
    handle.transport.onOpen(() => {
      hostRef.current!.addGuest(handle.transport)
      setStatus('connected')
      force()
    })
    pendingHostRef.current = handle
    setOfferCode(handle.offerCode)
    setStatus('hosting')
    return handle.offerCode
  }, [])

  const acceptAnswer = useCallback(async (code: string) => {
    const h = pendingHostRef.current
    if (!h) return
    try {
      await h.acceptAnswer(code)
    } catch (e) {
      console.info('[net] host failed to accept answer:', String(e))
      throw e // surfaced by OnlineBar so the host sees the paste was bad
    }
    pendingHostRef.current = null
    setOfferCode(undefined) // consumed; host can mint a fresh offer for the next guest
    // No time-based watchdog: a real failure is surfaced by the transport's onClose (ICE
    // 'failed'). The connection is given as long as the peers need.
  }, [])

  const joinFromOffer = useCallback(async (offer: string): Promise<string> => {
    setMode('guest')
    setStatus('joining')
    let handle
    try {
      handle = await joinConnection(offer)
    } catch {
      setStatus('error'); force()
      return ''
    }
    const { answerCode: ans, transport } = handle
    const gs = new GuestSession<S, I>(adapter, transport)
    gs.onChange(force)
    guestRef.current = gs
    // Stay in 'joining' (so the OnlineBar shows the answer code to copy back) until the
    // host accepts it and the data channel actually opens — only then are we connected.
    transport.onOpen(() => { setStatus('guest'); force() })
    transport.onClose(() => { setStatus('error'); force() })
    setAnswerCode(ans)
    force()
    // No time-based watchdog: the answer code stays valid as long as needed; an error is
    // shown only if the connection actually fails (transport.onClose).
    return ans
  }, [adapter])

  const reset = useCallback(() => {
    hostRef.current?.closeAll()
    guestRef.current?.close()
    guestRef.current = null
    pendingHostRef.current = null
    hostRef.current = new HostSession(adapter)
    hostRef.current.onChange(force)
    setMode('local')
    setStatus('offline')
    setOfferCode(undefined)
    setAnswerCode(undefined)
    force()
  }, [adapter])

  // ---- guest auto-join when arriving via a #offer=… URL ------------------------
  const autoJoined = useRef(false)
  useEffect(() => {
    if (autoJoined.current) return
    const offer = new URLSearchParams(location.hash.slice(1)).get('offer')
    if (offer) { autoJoined.current = true; void joinFromOffer(offer) }
  }, [joinFromOffer])

  const net: OnlineController = {
    status,
    online: mode !== 'local',
    amHost: mode !== 'guest',
    seats: session.getSeats(),
    offerCode,
    answerCode,
    host,
    acceptAnswer,
    joinFromOffer,
    reset,
  }

  return { state, mySeat, isMyTurn, dispatch, newGame, net }
}
