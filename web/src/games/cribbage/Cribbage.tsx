/* CRIBBAGE — UI (built for this codebase). A warm pub-wood table with a brass pegboard:
   your hand and the AI's, the crib, the cut starter, and the play pile with its running
   count. You discard two to the crib, then peg by tapping legal cards; the AI's discard
   and pegging plays are driven by useAITurn (it acts in several phases per hand). The show
   resolves inside the engine and is surfaced as a breakdown panel. End state shows by default. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as C from './logic'
import type { Card, CribbageState, Side } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3b2415" stroke="#7a4f2e" strokeWidth="1.5" />
    <rect x="9" y="10" width="30" height="28" rx="3" fill="#5a3a22" />
    <circle cx="16" cy="18" r="2.1" fill="#e7b65a" />
    <circle cx="24" cy="18" r="2.1" fill="#e7b65a" />
    <circle cx="32" cy="18" r="2.1" fill="#caa24a" />
    <circle cx="16" cy="26" r="2.1" fill="#caa24a" />
    <circle cx="24" cy="26" r="2.1" fill="#e7b65a" />
    <circle cx="32" cy="26" r="2.1" fill="#caa24a" />
    <circle cx="20" cy="22" r="2.6" fill="#f3d27e" stroke="#8a5a2c" strokeWidth="0.7" />
  </svg>
)

function CardView({ card, faceDown, onClick, disabled, selected, small }: {
  card?: Card; faceDown?: boolean; onClick?: () => void; disabled?: boolean; selected?: boolean; small?: boolean
}) {
  if (faceDown || !card) return <div className={'card back' + (small ? ' small' : '')} aria-label="face-down card" />
  const red = C.isRed(card.s)
  const cls = ['card', red ? 'red' : '', small ? 'small' : '', selected ? 'selected' : '', onClick && !disabled ? 'playable' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ')
  return (
    <button className={cls} onClick={onClick} disabled={disabled || !onClick} type="button">
      <span className="card-corner tl"><b>{C.rankLabel(card.r)}</b><i>{C.suitGlyph(card.s)}</i></span>
      <span className="card-pip">{C.suitGlyph(card.s)}</span>
      <span className="card-corner br"><b>{C.rankLabel(card.r)}</b><i>{C.suitGlyph(card.s)}</i></span>
    </button>
  )
}

export function Cribbage() {
  const [s, setS] = useState<CribbageState>(() => C.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number[]>([]) // selected discard indices
  const [dismissed, setDismissed] = useState(false)

  function newGame() { setS(C.makeGame()); setSel([]); setShowRules(false); setDismissed(false) }

  function toggleSel(i: number) {
    if (s.phase !== 'discard' || s.full.you.length > 0) return
    setSel((cur) => cur.includes(i) ? cur.filter((x) => x !== i) : cur.length < 2 ? cur.concat([i]) : cur)
  }
  function confirmDiscard() {
    if (sel.length !== 2) return
    setS((p) => C.discardToCrib(p, 'you', [sel[0], sel[1]]))
    setSel([])
  }
  function playYour(i: number) {
    if (s.phase !== 'play' || s.turn !== 'you' || s.winner != null) return
    if (s.count + C.pipValue(s.hands.you[i].r) > 31) return
    setS((p) => C.playCard(p, 'you', i))
  }
  function dealNext() { setS((p) => C.nextHand(p)); setDismissed(false) }

  // The AI takes several actions per hand (discard, each pegging play). The tick changes
  // on every engine action via the monotonic ply counter so consecutive AI plays keep firing.
  useAITurn(C.aiActive(s), () => setS((p) => C.aiStep(p)), { delayMs: 640, tick: s.ply })
  // Auto-pass the human when they hold a turn but can't legally play (a forced "go").
  useAITurn(C.youMustPass(s), () => setS((p) => C.passGo(p, 'you')), { delayMs: 520, tick: s.ply })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { setShowRules(false); if (s.phase === 'show' || s.phase === 'done') setDismissed(true) },
    extra: (e) => {
      if (e.key === 'Enter' && s.phase === 'discard' && s.full.you.length === 0 && sel.length === 2) { confirmDiscard(); return true }
      if (e.key === ' ' && s.phase === 'show' && s.winner == null) { e.preventDefault(); dealNext(); return true }
      return false
    },
  })

  // ---- banner ----
  let banner = '', bk = ''
  if (s.winner != null) { banner = s.winner === 'you' ? 'You win — 121!' : 'AI wins — 121.'; bk = s.winner === 'you' ? 'win' : 'lose' }
  else if (s.phase === 'discard') {
    if (s.full.you.length === 0) { banner = `Discard 2 to the ${s.dealer === 'you' ? 'your' : "AI's"} crib`; bk = 'you' }
    else { banner = 'AI is discarding…'; bk = 'foe' }
  } else if (s.phase === 'play') {
    if (C.youMustPass(s)) { banner = 'No card to play — "go"'; bk = '' }
    else if (s.turn === 'you') { banner = `Your play — count ${s.count}`; bk = 'you' }
    else { banner = `AI plays — count ${s.count}`; bk = 'foe' }
  } else if (s.phase === 'show') { banner = 'The show — tap Deal for the next hand'; bk = '' }

  const youDealer = s.dealer === 'you'
  const cribOwner = youDealer ? 'You' : 'AI'
  const showEnd = s.phase === 'show' || s.winner != null

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Cribbage · peg to 121"
        title="Cribbage"
        subtitle="fifteens, pairs, runs and his nobs — race the AI up the brass pegboard"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Hand {s.handNo} · {cribOwner} deal</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>Enter · discard &nbsp; Space · deal &nbsp; N · new</>}
      >
        <div className="crib-table">
          <Pegboard scores={s.scores} />

          <div className="board-mid">
            {/* AI row */}
            <div className="seat foe">
              <div className="seat-head"><span className="who">AI{!youDealer ? ' · dealer' : ''}</span><span className="sc">{s.scores.ai}</span></div>
              <div className="hand">
                {(s.phase === 'discard' ? s.hands.ai : s.full.ai).map((_, i) => (
                  <CardView key={i} faceDown={!showEnd} card={showEnd ? s.full.ai[i] : undefined} small />
                ))}
                {showEnd && s.full.ai.length === 0 && s.hands.ai.map((c, i) => <CardView key={i} card={c} small />)}
              </div>
            </div>

            {/* Center: crib, starter, play pile */}
            <div className="center-rail">
              <div className="cribbox">
                <div className="rail-label">Crib · {cribOwner}</div>
                <div className="hand mini">
                  {[0, 1, 2, 3].map((i) => (
                    s.crib[i]
                      ? <CardView key={i} card={showEnd ? s.crib[i] : undefined} faceDown={!showEnd} small />
                      : <div key={i} className="card empty small" />
                  ))}
                </div>
              </div>

              <div className="starterbox">
                <div className="rail-label">Starter</div>
                {s.starter ? <CardView card={s.starter} /> : <div className="card empty" />}
              </div>

              <div className="pilebox">
                <div className="rail-label">Play · <b className="count">{s.count}</b></div>
                <div className="pile">
                  {s.played.length === 0 && <div className="card empty small" />}
                  {s.played.slice(-10).map((pc, i) => (
                    <div key={i} className={'pile-card ' + pc.by}><CardView card={pc.card} small /></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Your row */}
            <div className="seat you">
              <div className="seat-head"><span className="who">You{youDealer ? ' · dealer' : ''}</span><span className="sc">{s.scores.you}</span></div>
              <div className="hand">
                {(s.phase === 'discard' ? s.hands.you : (s.full.you.length ? s.full.you : s.hands.you)).map((c, i) => {
                  if (s.phase === 'discard' && s.full.you.length === 0) {
                    return <CardView key={i} card={c} onClick={() => toggleSel(i)} selected={sel.includes(i)} />
                  }
                  if (s.phase === 'play' && s.full.you.length > 0) {
                    // map index in full → still-in-hand index
                    const inHand = s.hands.you.findIndex((h) => h === c)
                    const live = inHand >= 0
                    const legal = live && s.turn === 'you' && s.winner == null && s.count + C.pipValue(c.r) <= 31
                    return <CardView key={i} card={c} onClick={live ? () => playYour(inHand) : undefined} disabled={!legal} />
                  }
                  return <CardView key={i} card={c} />
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="side">
          <div className="panel statbox">
            <div className="stat-row"><span className="stat-l">You</span><span className="stat-v you">{s.scores.you}</span></div>
            <div className="stat-row"><span className="stat-l">AI</span><span className="stat-v foe">{s.scores.ai}</span></div>
            <div className="stat-row tiny"><span className="stat-l">Target</span><span className="stat-v">{C.TARGET}</span></div>
          </div>

          {s.phase === 'discard' && s.full.you.length === 0 && (
            <div className="panel actbox">
              <div className="hint">Select 2 cards for the {cribOwner.toLowerCase()} crib.</div>
              <button className="act go" onClick={confirmDiscard} disabled={sel.length !== 2}>
                {sel.length === 2 ? 'Discard to crib' : `Pick ${2 - sel.length} more`}
              </button>
            </div>
          )}
          {s.phase === 'show' && s.winner == null && (
            <div className="panel actbox">
              <button className="act go" onClick={dealNext}>Deal next hand</button>
            </div>
          )}

          {s.show && <ShowPanel s={s} />}

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && !dismissed && (
        <Modal
          eyebrow={s.winner === 'you' ? 'Pegged out' : 'The AI pegged out'}
          title={s.winner === 'you' ? 'You Win' : 'You Lose'}
          closeOnOverlay
          onClose={() => setDismissed(true)}
          actions={<button className="btn-modal" onClick={newGame}>New Game</button>}
        >
          <div className="modal-body">
            <p>Final pegs — <b>You {s.scores.you}</b> · <b>AI {s.scores.ai}</b> (first to {C.TARGET}).</p>
          </div>
        </Modal>
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ShowPanel({ s }: { s: CribbageState }) {
  const r = s.show!
  const block = (title: string, side: Side, b: C.ScoreBreakdown) => (
    <div className="show-block">
      <div className="show-head"><span className={side === 'you' ? 'you' : 'foe'}>{title}</span><b>{b.total}</b></div>
      <div className="show-items">
        {b.items.length === 0 ? <span className="zero">nineteen (no score)</span>
          : b.items.map((it, i) => <span key={i} className="show-item">{it.label} <b>{it.points}</b></span>)}
      </div>
    </div>
  )
  return (
    <div className="panel showbox">
      <div className="rail-label">The Show</div>
      {block(r.nonDealer.side === 'you' ? 'Your hand' : 'AI hand', r.nonDealer.side, r.nonDealer.breakdown)}
      {block(r.dealerHand.side === 'you' ? 'Your hand' : 'AI hand', r.dealerHand.side, r.dealerHand.breakdown)}
      {block(r.cribB.side === 'you' ? 'Your crib' : 'AI crib', r.cribB.side, r.cribB.breakdown)}
    </div>
  )
}

function Pegboard({ scores }: { scores: { you: number; ai: number } }) {
  const pct = (n: number) => Math.min(100, (Math.min(n, C.TARGET) / C.TARGET) * 100)
  return (
    <div className="pegboard" aria-hidden="true">
      <div className="track">
        <div className="track-l">YOU</div>
        <div className="rail">
          <div className="fill you" style={{ width: pct(scores.you) + '%' }} />
          <div className="peg you" style={{ left: pct(scores.you) + '%' }} />
        </div>
        <div className="track-v you">{scores.you}</div>
      </div>
      <div className="track">
        <div className="track-l">AI</div>
        <div className="rail">
          <div className="fill foe" style={{ width: pct(scores.ai) + '%' }} />
          <div className="peg foe" style={{ left: pct(scores.ai) + '%' }} />
        </div>
        <div className="track-v foe">{scores.ai}</div>
      </div>
    </div>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Cribbage" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Deal me in</button>}>
      <div className="modal-body">
        <p>Race the AI to <b>121</b> points up the pegboard. Each hand you both get six cards and <b>discard two to the crib</b> — the crib belongs to that hand's <b>dealer</b> (it alternates).</p>
        <p>A <b>starter</b> card is cut; if it's a <b>Jack</b>, the dealer pegs 2 ("his heels"). In <b>the play</b>, you alternate cards keeping the running count <b>≤ 31</b>: hitting <b>15</b> = 2, a <b>pair</b> = 2 (royal 6, double-royal 12), a <b>run</b> of 3+ = its length, reaching <b>31</b> = 2, and the last card / "<b>go</b>" = 1.</p>
        <p>In <b>the show</b> each player scores their 4 cards + the starter: every combination summing to <b>15</b> (2), <b>pairs</b> (2), <b>runs</b> (length), a <b>flush</b> (4 in hand, 5 with the starter; the crib needs all 5), and <b>nobs</b> — a Jack matching the starter's suit (1). Non-dealer counts first, then the dealer, then the dealer's crib.</p>
        <p><b>Keys:</b> <kbd>Enter</kbd> confirm discard · <kbd>Space</kbd> next hand · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
