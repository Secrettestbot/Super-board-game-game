/* OnlineBar — the lobby/connect control every online-capable game renders.
 *
 * Serverless, manual-signaling flow (no broker):
 *   HOST  clicks "Host online" -> gets a share URL (…#offer=CODE) to send a friend ->
 *         pastes back the friend's answer code -> connected. Repeat "Invite another"
 *         per guest for 3+ player games.
 *   GUEST opens the share URL -> auto-generates an answer code to copy back to the host.
 *
 * Styling uses the .ob-* classes in framework/tokens.css and the game's token contract.
 */

import { useState } from 'react'
import type { OnlineController } from '../net/useGameSession'

function shareUrl(offerCode: string): string {
  return location.origin + location.pathname + '#offer=' + offerCode
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value) } catch { /* fall through to manual select */ }
    setDone(true); setTimeout(() => setDone(false), 1400)
  }
  return (
    <div className="ob-copy">
      <span className="ob-copy-label">{label}</span>
      <input className="ob-copy-input" readOnly value={value} onFocus={e => e.currentTarget.select()} />
      <button className="ob-btn" onClick={copy}>{done ? 'Copied!' : 'Copy'}</button>
    </div>
  )
}

export function OnlineBar({ net }: { net: OnlineController }) {
  const [openPanel, setOpenPanel] = useState(false)
  const [answerInput, setAnswerInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [acceptErr, setAcceptErr] = useState(false)

  const startHost = async () => { setBusy(true); try { await net.host() } finally { setBusy(false); setOpenPanel(true) } }
  const connectGuest = async () => {
    if (!answerInput.trim()) return
    setBusy(true); setAcceptErr(false)
    try { await net.acceptAnswer(answerInput.trim()); setAnswerInput('') }
    catch { setAcceptErr(true) }
    finally { setBusy(false) }
  }

  // ---- guest view -------------------------------------------------------------
  if (net.online && !net.amHost) {
    const connected = net.status === 'guest'
    // Until the P2P channel actually opens, the guest hasn't been assigned a side yet and
    // the board behind this is just a local placeholder — so cover it with an overlay to
    // avoid the "I'm White too?" confusion. It clears automatically once connected.
    return (
      <div className="ob-wrap">
        <div className="ob-status">
          <span className={'ob-dot ' + (connected ? 'ok' : net.status === 'error' ? '' : 'wait')} />
          {connected ? 'Connected to host' : 'Joining…'}
        </div>
        <SeatList net={net} />
        {!connected && (
          <div className="overlay ob-connect-overlay">
            <div className="modal">
              <div className="modal-eye">Online · joining</div>
              <h2 className="modal-title">
                {net.status === 'error' ? 'Connection failed'
                  : net.answerCode ? 'Almost there' : 'Connecting…'}
              </h2>
              <div className="modal-body">
                {net.status === 'error' ? (
                  <p>The invite link was invalid or expired. Ask the host for a fresh "Host online" link and open it again.</p>
                ) : net.answerCode ? (
                  <>
                    <p><b>Send this code back to the host</b> — they paste it into their “answer code” box to connect you:</p>
                    <CopyField label="Your code" value={net.answerCode} />
                    <p>Then keep this tab open — the game starts automatically once the host connects you.</p>
                  </>
                ) : (
                  <p>Generating your connection code…</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- host / offline view ----------------------------------------------------
  return (
    <div className="ob-wrap">
      <div className="ob-status">
        {net.online
          ? <><span className="ob-dot ok" /> Online — {net.seats.filter(s => s.kind === 'guest').length} joined</>
          : <><span className="ob-dot" /> Local play</>}
        {!net.online
          ? <button className="ob-btn primary" disabled={busy} onClick={startHost}>Host online</button>
          : <>
              <button className="ob-btn" onClick={() => setOpenPanel(v => !v)}>{openPanel ? 'Hide' : 'Invite'}</button>
              <button className="ob-btn ghost" onClick={net.reset}>Leave</button>
            </>}
      </div>

      {net.online && openPanel && (
        <div className="ob-panel">
          {net.offerCode ? (
            <>
              <p className="ob-hint"><b>1.</b> Send this link to a friend:</p>
              <CopyField label="Invite link" value={shareUrl(net.offerCode)} />
              <p className="ob-hint"><b>2.</b> Paste the answer code they send back:</p>
              <div className="ob-copy">
                <input className="ob-copy-input" placeholder="answer code…" value={answerInput}
                  onChange={e => setAnswerInput(e.target.value)} />
                <button className="ob-btn primary" disabled={busy || !answerInput.trim()} onClick={connectGuest}>Connect</button>
              </div>
              {acceptErr && <p className="ob-hint" style={{ color: 'var(--warn)' }}>That answer code didn't parse — make sure you copied the whole thing from your friend.</p>}
            </>
          ) : (
            <button className="ob-btn primary" disabled={busy} onClick={startHost}>Invite another player</button>
          )}
          <SeatList net={net} />
        </div>
      )}
    </div>
  )
}

function SeatList({ net }: { net: OnlineController }) {
  if (!net.seats.length) return null
  return (
    <div className="ob-seats">
      {net.seats.map(s => (
        <span key={s.seat} className={'ob-seat ' + s.kind}>{s.label}</span>
      ))}
    </div>
  )
}
