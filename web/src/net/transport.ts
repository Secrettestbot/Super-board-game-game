/* TRANSPORT — serverless WebRTC data channel with MANUAL signaling encoded in URLs.
 *
 * No signaling server and no broker: the host produces an "offer" code, the guest
 * produces an "answer" code, and the two are exchanged by copy/pasting URLs (see
 * net/useGameSession.ts + framework/OnlineBar.tsx). Each offer/answer is gathered to
 * ICE-completion before encoding, so the single blob is self-contained (non-trickle).
 *
 * Data flows strictly peer-to-peer. We do use public STUN servers purely for NAT
 * discovery (they learn your public ip:port; they never see or relay game data) so the
 * connection works across the internet, not just on one LAN. There is still no server
 * you run, and signaling stays manual. Strict/symmetric NATs that need a TURN *relay*
 * (which would be a server) are out of scope — most home networks connect directly.
 */

/** Public STUN servers (NAT discovery only — no data passes through them). */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/** A minimal duplex message channel over a WebRTC data channel. */
export interface Transport {
  send(msg: unknown): void
  onMessage(cb: (msg: unknown) => void): void
  onOpen(cb: () => void): void
  onClose(cb: () => void): void
  close(): void
  readonly open: boolean
}

class ChannelTransport implements Transport {
  private msgCbs: ((m: unknown) => void)[] = []
  private openCbs: (() => void)[] = []
  private closeCbs: (() => void)[] = []
  open = false

  constructor(
    private pc: RTCPeerConnection,
    private dc: RTCDataChannel,
  ) {
    dc.onopen = () => { this.open = true; this.openCbs.forEach(c => c()) }
    dc.onclose = () => { this.open = false; this.closeCbs.forEach(c => c()) }
    dc.onmessage = e => {
      let parsed: unknown
      try { parsed = JSON.parse(e.data as string) } catch { return }
      this.msgCbs.forEach(c => c(parsed))
    }
    // a sudden teardown of the peer connection also means the channel is gone
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if ((st === 'failed' || st === 'disconnected' || st === 'closed') && this.open) {
        this.open = false
        this.closeCbs.forEach(c => c())
      }
    }
  }

  send(msg: unknown) { if (this.dc.readyState === 'open') this.dc.send(JSON.stringify(msg)) }
  onMessage(cb: (m: unknown) => void) { this.msgCbs.push(cb) }
  onOpen(cb: () => void) { if (this.open) cb(); else this.openCbs.push(cb) }
  onClose(cb: () => void) { this.closeCbs.push(cb) }
  close() { try { this.dc.close() } catch { /* ignore */ } try { this.pc.close() } catch { /* ignore */ } }
}

/** base64url <-> string, so a code rides safely in a URL fragment. */
function encodeDesc(desc: RTCSessionDescription | RTCSessionDescriptionInit): string {
  const payload = JSON.stringify({ t: desc.type, s: desc.sdp })
  // utf8-safe base64url
  const b64 = btoa(unescape(encodeURIComponent(payload)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decodeDesc(code: string): RTCSessionDescriptionInit {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(escape(atob(b64)))
  const { t, s } = JSON.parse(json) as { t: RTCSdpType; s: string }
  return { type: t, sdp: s }
}

/** Resolve once ICE gathering is complete, or after a short cap so we don't hang. */
function iceComplete(pc: RTCPeerConnection, capMs = 2500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise(resolve => {
    let done = false
    const finish = () => { if (done) return; done = true; pc.removeEventListener('icegatheringstatechange', check); resolve() }
    const check = () => { if (pc.iceGatheringState === 'complete') finish() }
    pc.addEventListener('icegatheringstatechange', check)
    // null candidate also signals completion
    pc.addEventListener('icecandidate', e => { if (!e.candidate) finish() })
    setTimeout(finish, capMs)
  })
}

function newPC(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS })
}

/** Result of starting a host-side connection: a code to share + the transport + a way to finish. */
export interface HostHandle {
  offerCode: string
  transport: Transport
  /** Call with the guest's answer code to complete the handshake. */
  acceptAnswer(answerCode: string): Promise<void>
}

/** Host side: create the data channel + an offer code to hand to one guest. */
export async function createHostConnection(): Promise<HostHandle> {
  const pc = newPC()
  const dc = pc.createDataChannel('game', { ordered: true })
  const transport = new ChannelTransport(pc, dc)
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await iceComplete(pc)
  return {
    offerCode: encodeDesc(pc.localDescription!),
    transport,
    async acceptAnswer(answerCode: string) {
      await pc.setRemoteDescription(decodeDesc(answerCode.trim()))
    },
  }
}

export interface GuestHandle {
  answerCode: string
  transport: Transport
}

/** Guest side: consume the host's offer code and produce an answer code to send back. */
export async function joinConnection(offerCode: string): Promise<GuestHandle> {
  const pc = newPC()
  let resolveDC!: (dc: RTCDataChannel) => void
  const dcPromise = new Promise<RTCDataChannel>(r => { resolveDC = r })
  pc.ondatachannel = e => resolveDC(e.channel)
  await pc.setRemoteDescription(decodeDesc(offerCode.trim()))
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  await iceComplete(pc)
  const dc = await dcPromise
  const transport = new ChannelTransport(pc, dc)
  return { answerCode: encodeDesc(pc.localDescription!), transport }
}

// ---- in-memory transport (for tests; no WebRTC) --------------------------------
class MemoryTransport implements Transport {
  open = true
  peer!: MemoryTransport
  private msgCbs: ((m: unknown) => void)[] = []
  private closeCbs: (() => void)[] = []
  send(msg: unknown) {
    if (!this.open || !this.peer.open) return
    // round-trip through JSON to mirror real serialization (catches non-serializable state)
    const clone = JSON.parse(JSON.stringify(msg))
    this.peer.msgCbs.forEach(cb => cb(clone))
  }
  onMessage(cb: (m: unknown) => void) { this.msgCbs.push(cb) }
  onOpen(cb: () => void) { if (this.open) cb() }
  onClose(cb: () => void) { this.closeCbs.push(cb) }
  close() {
    if (!this.open) return
    this.open = false
    this.closeCbs.forEach(c => c())
    if (this.peer.open) this.peer.close()
  }
}

/** Two linked transports for deterministic, browser-free session tests. */
export function memoryPair(): [Transport, Transport] {
  const a = new MemoryTransport()
  const b = new MemoryTransport()
  a.peer = b
  b.peer = a
  return [a, b]
}
