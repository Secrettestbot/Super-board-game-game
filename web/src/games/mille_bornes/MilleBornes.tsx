/* MILLE BORNES — UI. A retro road-trip race to 1000 km. Two battle areas (rival on top,
   you below) show each car's signal light, active hazards, speed limit and the safeties
   parked in front, plus an odometer bar. Draw a card, then play one or discard. The AI
   rival keeps its Go light lit, lays down distance, and lobs hazards your way. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as MB from './logic'
import type { State, Card, Player, HazardKind, PlayerState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#2c2118" stroke="#7a601f" strokeWidth="1.5" />
    <rect x="17" y="9" width="14" height="30" rx="6" fill="#1a1410" stroke="#5c4630" strokeWidth="1.5" />
    <circle cx="24" cy="16" r="3.4" fill="#e06464" />
    <circle cx="24" cy="24" r="3.4" fill="#d9a441" />
    <circle cx="24" cy="32" r="3.4" fill="#6fc77a" />
  </svg>
)

export function MilleBornes() {
  const [s, setS] = useState<State>(() => MB.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { setS(MB.makeGame()); setSel(null); setShowRules(false) }

  const yourTurn = s.winner === null && s.turn === 0
  const needDraw = yourTurn && !s.drewThisTurn

  // AI takes its full turn in one step; chain turns by ticking on log growth.
  useAITurn(s.winner === null && s.turn === 1, () => setS(p => MB.aiTurn(p)), { delayMs: 650, tick: s.log.length })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSel(null) } })

  const legal = useMemo(
    () => (yourTurn && s.drewThisTurn) ? new Set(MB.legalPlays(s, 0)) : new Set<number>(),
    [yourTurn, s],
  )

  function draw() { if (needDraw) setS(MB.drawCard(s, 0)) }
  function clickCard(c: Card) {
    if (!yourTurn || !s.drewThisTurn) return
    if (!legal.has(c.id)) { setSel(null); return }
    setSel(prev => (prev === c.id ? null : c.id))
  }
  function playSelected() {
    if (sel === null || !legal.has(sel)) return
    setS(MB.play(s, 0, sel)); setSel(null)
  }
  function discardSelected() {
    if (sel === null) return
    setS(MB.discard(s, 0, sel)); setSel(null)
  }

  const you = s.players[0], foe = s.players[1]

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'Checkered flag — you reach 1000 km first!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The rival crosses 1000 km first.' }
  else if (needDraw) { bk = 'you'; banner = 'Your turn — draw a card to begin' }
  else if (yourTurn) { bk = 'you'; banner = 'Play a card or discard' }
  else { bk = 'foe'; banner = 'The rival is driving…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Mille Bornes · 1000 km dash"
        title="Mille Bornes"
        subtitle="keep your Go light lit, lay down the kilometres, and strand the rival on the shoulder"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Race to {MB.TARGET} · {you.distance}–{foe.distance} km</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="mb-wrap">
          <div className="mb-board">
            <Seat ps={foe} who="foe" active={s.turn === 1 && s.winner === null} name="Rival" />
            <Seat ps={you} who="you" active={s.turn === 0 && s.winner === null} name="You" />

            <div className="mb-hand-wrap">
              <div className="mb-hand-head">
                <span className="mb-hand-title">Your hand</span>
                <span className="mb-hand-hint">{needDraw ? 'draw first' : 'tap a card · then play / discard'}</span>
              </div>
              <div className="mb-hand">
                {you.hand.length === 0 && <div className="mb-card-empty" />}
                {you.hand.map(c => {
                  const playable = legal.has(c.id)
                  const cls = ['mb-card', c.kind]
                  if (playable) cls.push('playable')
                  else if (s.drewThisTurn && yourTurn) cls.push('dim')
                  if (sel === c.id) cls.push('selected')
                  return (
                    <button key={c.id} className={cls.join(' ')} onClick={() => clickCard(c)}>
                      <CardFace c={c} />
                    </button>
                  )
                })}
              </div>
              <div className="mb-actions">
                <button className="mb-btn" onClick={draw} disabled={!needDraw}>Draw</button>
                <button className="mb-btn ghost" onClick={playSelected} disabled={sel === null || !legal.has(sel)}>Play</button>
                <button className="mb-btn ghost" onClick={discardSelected} disabled={sel === null || needDraw}>Discard</button>
                <span className="mb-deckcount">deck {s.deck.length}</span>
              </div>
            </div>
          </div>

          <div className="mb-side">
            <div className="panel logbox">
              <div className="panel-l">Road log</div>
              {s.log.slice().reverse().map((l, i) => (
                <div key={i} className={'log-line ' + l.t}>{l.x}</div>
              ))}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner !== null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Seat({ ps, who, active, name }: { ps: PlayerState; who: 'you' | 'foe'; active: boolean; name: string }) {
  const pct = Math.min(100, (ps.distance / MB.TARGET) * 100)
  const rolling = ps.roll && ps.hazard === null
  return (
    <div className={'mb-seat ' + who + (active ? ' active' : '')}>
      <div className="mb-seat-id">
        <span className={'mb-seat-name ' + who}>{name}</span>
        <span className="mb-odo"><b>{ps.distance}</b> / {MB.TARGET} km</span>
        <div className="mb-bar"><i style={{ width: pct + '%' }} /></div>
      </div>

      <div className="mb-status">
        <div className="mb-light">
          <span className={'mb-bulb ' + (rolling ? 'go' : ps.hazard !== null ? 'stop' : '')} />
          <span className="mb-light-label">
            {ps.hazard === 'stop' ? 'Stopped'
              : ps.hazard !== null ? MB.HAZARD_NAME[ps.hazard]
              : rolling ? 'Rolling' : 'Idle'}
          </span>
        </div>
        <div className="mb-chips">
          {ps.hazard !== null && <span className="mb-chip hazard">{MB.HAZARD_NAME[ps.hazard]}</span>}
          {ps.speedLimit && <span className="mb-chip limit">≤ 50 limit</span>}
          {ps.hazard === null && !ps.speedLimit && <span className="mb-chip none">no hazards</span>}
        </div>
      </div>

      <div className="mb-safeties">
        {ps.safeties.length === 0 && <span className="mb-chip none">no safeties</span>}
        {ps.safeties.map((k: HazardKind) => (
          <span key={k} className="mb-safety">{MB.SAFETY_NAME[k as unknown as string]}</span>
        ))}
      </div>
    </div>
  )
}

function CardFace({ c }: { c: Card }) {
  if (c.kind === 'distance') {
    return (
      <>
        <span className="mb-card-kind">distance</span>
        <span className="mb-card-km">{c.km}</span>
        <span className="mb-card-sub">kilometres</span>
      </>
    )
  }
  const kindLabel = c.kind
  return (
    <>
      <span className="mb-card-kind">{kindLabel}</span>
      <span className="mb-card-main">{c.name}</span>
      <span className="mb-card-sub">{cardBlurb(c)}</span>
    </>
  )
}

function cardBlurb(c: Card): string {
  if (c.kind === 'hazard') return 'on rival'
  if (c.kind === 'remedy') {
    const hz = c.hazard!
    return hz === 'stop' ? 'go / start' : hz === 'limit' ? 'lift limit' : 'fix it'
  }
  if (c.kind === 'safety') return 'immune'
  return ''
}

function ResultModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'You take the trophy' : 'The rival wins'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Race again</button>}
    >
      <div className="modal-body">
        <p>Final odometer — <b>You {s.players[0].distance} km</b> · <b>Rival {s.players[1].distance} km</b>.</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Mille Bornes" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start driving</button>}>
      <div className="modal-body">
        <p>Be first to drive exactly <b>{MB.TARGET} km</b>. Each turn, <b>Draw</b> a card, then <b>play</b> one or <b>discard</b> one.</p>
        <p><b>Distance</b> (25–200 km) advances you — but only while your <b>Go</b> light is lit and you have no blocking hazard. A <b>Speed Limit</b> caps each play at ≤ 50 km, and you may lay only {MB.MAX_200} of the 200 cards.</p>
        <p><b>Hazards</b> (Stop, Speed Limit, Out of Gas, Flat Tire, Accident) land on the rival to strand them. <b>Remedies</b> (Go, End of Limit, Gasoline, Spare Tire, Repairs) clear your own hazard — Go also starts you rolling.</p>
        <p><b>Safeties</b> (Right of Way, Extra Tank, Puncture-Proof, Driving Ace) park in front of you for permanent immunity to a matching hazard and clear it instantly. Right of Way covers both Stop and Speed Limit.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
