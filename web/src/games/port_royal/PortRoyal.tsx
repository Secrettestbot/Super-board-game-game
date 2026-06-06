/* PORT ROYAL — UI. Push-your-luck harbor cards vs two AI captains on the shared shell.
   The AI takes MANY sub-steps per turn (flip, flip, …, stop, take) AND the two AI players
   each take a card in the trade phase, so useAITurn re-arms on a tick that changes on every
   AI-observable sub-step (PR.aiTick). active = an AI must act (discover or take) and no winner
   and we're not waiting on the human. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as PR from './logic'
import type { PortState, Card } from './logic'

const { GOAL } = PR

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#0f262d" stroke="#f0915a" strokeWidth="1.5" />
    <path d="M24 9 L24 34" stroke="#e8c172" strokeWidth="2" strokeLinecap="round" />
    <path d="M24 12 L36 18 L24 20 Z" fill="#f0915a" />
    <path d="M24 22 L14 27 L24 28 Z" fill="#66d3c4" />
    <path d="M11 34 q13 8 26 0 l-3 6 q-10 4 -20 0 Z" fill="#4a8fd6" />
  </svg>
)

function CardView({
  card, dup, takeable, onTake,
}: { card: Card; dup?: boolean; takeable?: boolean; onTake?: () => void }) {
  const cls =
    card.kind === 'ship' ? `pr-card ship ${card.color}` :
    card.kind === 'person' ? 'pr-card person' : 'pr-card expedition'
  return (
    <div
      className={cls + (dup ? ' dup' : '') + (takeable ? ' takeable' : '')}
      onClick={takeable ? onTake : undefined}
      title={card.name}
    >
      <div className="pr-kind">{card.kind}</div>
      <div className="pr-title">{card.kind === 'ship' ? PR.COLOR_NAME[card.color!] : card.name}</div>
      <div className="pr-stat">
        {card.kind === 'ship' && <span>{card.coins}🪙</span>}
        {card.kind === 'ship' && (card.swords ?? 0) > 0 && <span>{card.swords}⚔</span>}
        {card.kind === 'person' && <span>−{card.cost}🪙</span>}
        {card.kind === 'person' && <span>+{card.influence}★</span>}
        {card.kind === 'expedition' && <span>+{card.influence}★</span>}
      </div>
      {card.kind === 'person' && card.sym && <div className="pr-sym">{PR.SYM_NAME[card.sym]}</div>}
      {card.kind === 'expedition' && card.needs && (
        <div className="pr-sym">{card.needs.map(n => PR.SYM_NAME[n]).join(' + ')}</div>
      )}
    </div>
  )
}

function PlayerPanel({ s, pi }: { s: PortState; pi: number }) {
  const p = s.players[pi]
  const isDisc = s.discoverer === pi
  const acting =
    (s.phase === 'discover' && s.discoverer === pi) ||
    (s.phase === 'trade' && s.current === pi)
  const syms = PR.symbolCounts(p)
  const symList = (Object.keys(syms) as PR.PersonSym[]).filter(k => syms[k] > 0)
  return (
    <div className={'pr-pl ' + (pi === 0 ? 'you' : 'ai') + (acting && s.winner == null ? ' on' : '')}>
      <div className="pr-pl-head">
        <span className="pr-pl-name">{pi === 0 ? 'You' : `AI ${pi}`}</span>
        <span className="pr-pl-inf">{p.influence}<small> ★</small></span>
      </div>
      <div className="pr-pl-row">
        <span className="tag">{p.coins}🪙</span>
        <span className="tag">{p.ships.length}⛵</span>
        <span className="tag">{p.persons.length}☻</span>
        <span className="tag">{p.expeditions.length}⚑</span>
        {isDisc && s.winner == null && <span className="pr-disc-badge">discoverer</span>}
      </div>
      {symList.length > 0 && (
        <div className="pr-syms">
          {symList.map(k => <span key={k} className="pr-sympill">{PR.SYM_NAME[k]}×{syms[k]}</span>)}
        </div>
      )}
    </div>
  )
}

export function PortRoyal() {
  const [s, setS] = useState<PortState>(() => PR.makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(PR.makeGame()); setShowRules(false) }

  const youDiscover = s.winner == null && s.phase === 'discover' && s.discoverer === 0
  const youTrade = s.winner == null && s.phase === 'trade' && s.current === 0

  function doFlip() { if (youDiscover) setS(p => PR.flip(p)) }
  function doStop() { if (youDiscover) setS(p => PR.stop(p)) }
  function doTake(i: number) { if (youTrade && PR.canTake(s, 0, i)) setS(p => PR.takeCard(p, 0, i)) }
  function doPass() { if (youTrade) setS(p => PR.passTake(p)) }

  // The AI drives itself: an AI must act (discover OR take), no winner, not waiting on human.
  useAITurn(PR.aiActive(s), () => setS(p => PR.aiStep(p)), { delayMs: 560, tick: PR.aiTick(s) })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (youDiscover) {
        if (e.key === ' ' || e.key === 'Spacebar') { doFlip(); return true }
        if (e.key === 's' || e.key === 'S') { doStop(); return true }
      }
      if (youTrade && (e.key === 'p' || e.key === 'P')) { doPass(); return true }
      return false
    },
  })

  // which harbor colors are already present (to flag a card as a would-be / actual dup)
  const present = PR.harborColors(s.harbor)
  const risk = PR.bustRisk(s)

  let banner: string, bk = ''
  if (s.winner != null) {
    if (s.winner === 0) { bk = 'win'; banner = `You win with ${s.players[0].influence}★!` }
    else { bk = 'lose'; banner = `AI ${s.winner} wins with ${s.players[s.winner].influence}★.` }
  } else if (youDiscover) {
    bk = 'you'; banner = s.harbor.length ? 'Your turn — flip again or stop & take' : 'Your turn — flip a harbor card'
  } else if (youTrade) {
    bk = 'you'; banner = s.discoverer === 0 ? 'Take a harbor card (or pass)' : 'You may take a harbor card — pay AI ' + s.discoverer + ' a coin (or pass)'
  } else if (s.phase === 'discover') {
    bk = 'foe'; banner = `AI ${s.discoverer} is discovering…`
  } else {
    bk = 'foe'; banner = `AI ${s.current} is choosing a card…`
  }

  const canFlip = youDiscover
  const canStop = youDiscover && s.harbor.length > 0

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Port Royal · push your luck"
        title="Port Royal"
        subtitle="flip harbor cards, dodge the duplicate-ship bust, hire crew toward 12 influence"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`First to ${GOAL}★ triggers the end`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · flip &nbsp; S · stop &nbsp; P · pass &nbsp; N · new</>}
      >
        <div className="pr-wrap">
          <div className="pr-deckrow">
            <div className="pr-pile"><b>{s.deck.length}</b><span>deck</span></div>
            <div className="pr-pile"><b>{s.discard.length}</b><span>discard</span></div>
            <div className="pr-riskbox">
              <div className="pr-risk-l"><span>bust risk</span><b>{Math.round(risk * 100)}%</b></div>
              <div className="pr-risk-bar"><div className="pr-risk-fill" style={{ width: `${Math.round(risk * 100)}%` }} /></div>
            </div>
          </div>

          <div className="pr-harbor-label">The Harbor {s.busted && s.harbor.length === 0 ? '· last flip busted!' : ''}</div>
          <div className={'pr-harbor' + (s.harbor.length ? '' : ' empty')}>
            {s.harbor.length === 0
              ? <span>flip cards into the harbor — a 2nd ship of a color here busts you</span>
              : s.harbor.map((c, i) => {
                  const dup = c.kind === 'ship' && c.color != null && present[c.color] > 1
                  const takeable = youTrade && PR.canTake(s, 0, i)
                  return <CardView key={c.id} card={c} dup={dup} takeable={takeable} onTake={() => doTake(i)} />
                })}
          </div>

          <div className="pr-actions">
            <button className="pr-btn" onClick={doFlip} disabled={!canFlip}>Flip</button>
            <button className="pr-btn stop" onClick={doStop} disabled={!canStop}>Stop &amp; Take</button>
            {youTrade && <button className="pr-btn stop" onClick={doPass}>Pass</button>}
            {youTrade && <span className="pr-hint">click a harbor card to take it</span>}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <div className="panel-l">Captains</div>
            <div className="pr-players">
              {[0, 1, 2].map(pi => <PlayerPanel key={pi} s={s} pi={pi} />)}
            </div>
          </div>

          <div className="panel">
            <div className="panel-l">Expeditions</div>
            <div className="pr-exped">
              {s.expeditionRow.length === 0 && <span className="pr-hint">all claimed</span>}
              {s.expeditionRow.map(e => (
                <div key={e.id} className="pr-exped-row">
                  <span>{e.name}<br /><span className="needs">{e.needs!.map(n => PR.SYM_NAME[n]).join(' + ')}</span></span>
                  <b>+{e.influence}★</b>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-l">Log</div>
            <div className="pr-logbox" ref={logRef}>
              {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: PortState; onNew: () => void }) {
  const won = s.winner === 0
  const order = [0, 1, 2].slice().sort((a, b) => s.players[b].influence - s.players[a].influence)
  return (
    <Modal
      eyebrow={won ? 'Harbor master' : 'Out-sailed'}
      title={won ? 'You Win' : `AI ${s.winner} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="pr-final">
        {order.map(pi => (
          <div key={pi} className={'pr-final-row' + (pi === s.winner ? ' win' : '')}>
            <span className={pi === 0 ? 'you' : 'foe'}>{pi === 0 ? 'You' : `AI ${pi}`}</span>
            <span>{s.players[pi].influence}★ · {s.players[pi].coins}🪙</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Port Royal" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Set sail</button>}>
      <div className="modal-body">
        <p>On your turn you are the <b>discoverer</b>: flip harbor cards one at a time. You may <b>stop</b> whenever you like — but if you flip a <b>second ship of a color already in the harbor</b>, you <i>BUST</i>: the harbor is discarded and you take nothing.</p>
        <p>When you stop cleanly you take <b>one</b> harbor card — a <b>ship</b> for its coins, or <b>hire a person</b> by paying coins. Then each rival, in turn, may take one card too, paying you <b>1 coin</b> for the privilege.</p>
        <p>Persons grant <b>influence ★</b> and carry symbols. Collect the right symbols and you automatically claim an <b>expedition</b> for a big influence bonus.</p>
        <p>The moment a captain reaches <b>{GOAL}★</b>, the round is finished out and the <b>most influence wins</b>.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> flip · <kbd>S</kbd> stop · <kbd>P</kbd> pass · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
