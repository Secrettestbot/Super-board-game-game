/* STAR REALMS — UI. A 2-player deckbuilding duel in deep space. You play your whole hand to
   build TRADE and COMBAT, buy ships/bases from the shared trade row, then spend combat to break
   the foe's outposts and burn their authority from 50 to 0. The AI takes its full turn greedily. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as SR from './logic'
import type { StarRealmsState, CardInst, CardDef } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="9" fill="#0b1426" stroke="#1c8f87" strokeWidth="1.5" />
    <path d="M24 9 L27.6 19.8 L39 19.8 L29.7 26.4 L33.3 37.2 L24 30.6 L14.7 37.2 L18.3 26.4 L9 19.8 L20.4 19.8 Z"
      fill="none" stroke="#7df5ec" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="24" cy="24" r="3" fill="#38e0d4" />
  </svg>
)

export function StarRealms() {
  const [s, setS] = useState<StarRealmsState>(() => SR.makeGame())
  const [showRules, setShowRules] = useState(false)
  const apply = (fn: (st: StarRealmsState) => void) =>
    setS(prev => { const n = structuredClone(prev); fn(n); return n })

  function newGame() { setS(SR.makeGame()); setShowRules(false) }

  const yourTurn = s.winner == null && s.turn === 0
  const aiActive = s.winner == null && s.turn === 1
  // The AI runs its WHOLE turn in one call; re-arm via the monotonic action counter.
  useAITurn(aiActive, () => apply(st => SR.aiTurn(st)), { delayMs: 650, tick: s.actions })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const you = s.players[0], foe = s.players[1]
  const foeHasOutpost = foe.bases.some(b => SR.def(b).outpost)

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'Victory — the foe is reduced to nothing' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'Defeat — your fleet is undone' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — play cards, buy, then attack' }
  else { bk = 'foe'; banner = 'The AI marshals its fleet…' }

  function play(id: number) { if (yourTurn) apply(st => SR.playCard(st, id)) }
  function playAll() { if (yourTurn) apply(st => SR.playAll(st)) }
  function buy(t: number | 'explorer') { if (yourTurn) apply(st => SR.buyCard(st, t)) }
  function attack(t: 'face' | number) { if (yourTurn) apply(st => SR.attack(st, t)) }
  function endTurn() { if (yourTurn) apply(st => SR.endTurn(st)) }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Star Realms · deckbuilding duel"
        title="Star Realms"
        subtitle="build a galactic fleet from a shared market and burn the rival's authority to zero"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Auth <span style={{ color: 'var(--you)' }}>{you.authority}</span> – <span style={{ color: 'var(--foe)' }}>{foe.authority}</span></>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="sr-wrap">
          {/* foe line */}
          <div className="sr-foeline">
            <div className="sr-auth foe"><span className="lab">AI</span><span className="val">{foe.authority}</span></div>
            <span className="sr-sect-h">deck {foe.deck.length} · discard {foe.discard.length}</span>
            <div className="sr-row" style={{ marginLeft: 'auto' }}>
              {foe.bases.length === 0 && <span className="sr-empty-note">no bases</span>}
              {foe.bases.map(b => {
                const d = SR.def(b)
                const targetable = yourTurn && (foeHasOutpost ? d.outpost : true) && s.combat >= (d.defense ?? 0) && s.combat > 0
                return (
                  <Card key={b.id} d={d} variant="tiny"
                    className={'attackable' + (targetable ? ' btn' : ' disabled')}
                    onClick={targetable ? () => attack(b.id) : undefined} />
                )
              })}
            </div>
          </div>

          {/* trade row */}
          <div className="sr-sect-h">Trade row — buy with Trade</div>
          <div className="sr-row">
            {s.tradeRow.map((c, i) => {
              if (c == null) return <div key={'e' + i} className="sr-card disabled" style={{ width: 124 }} />
              const d = SR.def(c)
              const can = yourTurn && s.trade >= d.cost
              return <Card key={c.id} d={d} cost={d.cost}
                className={'buyable' + (can ? ' btn' : ' disabled')}
                onClick={can ? () => buy(i) : undefined} />
            })}
            {/* explorer */}
            <Card d={SR.CARDS.explorer} cost={SR.CARDS.explorer.cost} variant="explorer"
              badge={'×' + s.explorerCount}
              className={'sr-explorer buyable' + (yourTurn && s.trade >= SR.CARDS.explorer.cost && s.explorerCount > 0 ? ' btn' : ' disabled')}
              onClick={yourTurn && s.trade >= SR.CARDS.explorer.cost && s.explorerCount > 0 ? () => buy('explorer') : undefined} />
          </div>

          {/* your bases */}
          {you.bases.length > 0 && <>
            <div className="sr-sect-h">Your bases (persist)</div>
            <div className="sr-row">{you.bases.map(b => <Card key={b.id} d={SR.def(b)} variant="tiny" />)}</div>
          </>}

          {/* your hand */}
          <div className="sr-youline">
            <div className="sr-auth you"><span className="lab">You</span><span className="val">{you.authority}</span></div>
            <div className="sr-pools">
              <span className="sr-pool trade"><span className="pk">Trade</span>{s.trade}</span>
              <span className="sr-pool combat"><span className="pk">Combat</span>{s.combat}</span>
            </div>
          </div>

          <div className="sr-sect-h">Your hand</div>
          <div className="sr-row">
            {you.hand.length === 0 && <span className="sr-empty-note">hand empty — buy &amp; attack, then end turn</span>}
            {you.hand.map(c => (
              <Card key={c.id} d={SR.def(c)} variant="small"
                className={yourTurn ? ' btn' : ' disabled'}
                onClick={yourTurn ? () => play(c.id) : undefined} />
            ))}
          </div>

          <div className="sr-actions">
            <button className="sr-btn primary" disabled={!yourTurn || you.hand.length === 0} onClick={playAll}>Play all</button>
            <button className="sr-btn attack" disabled={!yourTurn || s.combat <= 0 || foeHasOutpost} onClick={() => attack('face')}>
              Attack face ({s.combat})
            </button>
            <button className="sr-btn" disabled={!yourTurn} onClick={endTurn}>End turn</button>
            {foeHasOutpost && s.combat > 0 && <span className="sr-empty-note">break the outpost(s) first</span>}
          </div>
        </div>

        {/* side panel */}
        <div className="side">
          <div className="panel sr-bigauth">
            <div className="col you"><div className="nm">You</div><div className="v">{you.authority}</div></div>
            <div className="col foe"><div className="nm">AI</div><div className="v">{foe.authority}</div></div>
          </div>
          <div className="panel">
            <div className="panel-l">Fleet</div>
            <div className="sr-counts">
              <div className="cr"><span>Your deck</span><b>{you.deck.length}</b></div>
              <div className="cr"><span>Your discard</span><b>{you.discard.length}</b></div>
              <div className="cr"><span>Trade deck</span><b>{s.tradeDeck.length}</b></div>
              <div className="cr"><span>Explorers</span><b>{s.explorerCount}</b></div>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Card({ d, cost, badge, className = '', variant, onClick }: {
  d: CardDef; cost?: number; badge?: string; className?: string
  variant?: 'small' | 'tiny' | 'explorer'; onClick?: () => void
}) {
  const tags: Array<[string, string]> = []
  if (d.trade) tags.push(['t', '+' + d.trade + ' T'])
  if (d.combat) tags.push(['c', '+' + d.combat + ' C'])
  if (d.authority) tags.push(['a', '+' + d.authority + ' A'])
  if (d.draw) tags.push(['d', 'draw ' + d.draw])
  const v = variant === 'small' ? ' small' : variant === 'tiny' ? ' tiny' : ''
  return (
    <button type="button" className={'sr-card fac-' + d.faction + v + ' ' + className}
      disabled={!onClick} onClick={onClick}>
      {cost != null && <span className="sr-cost">{cost}</span>}
      {d.type === 'base' && <span className={'sr-deftag' + (d.outpost ? ' outpost' : '')}>{d.outpost ? 'OP ' : ''}{d.defense}</span>}
      <div className="cf">{factionShort(d.faction)}{badge ? ' · ' + badge : ''}</div>
      <div className="cn">{d.name}</div>
      {variant !== 'tiny' && <div className="cb">{d.blurb}</div>}
      {variant !== 'tiny' && tags.length > 0 &&
        <div className="ctags">{tags.map(([cl, tx], i) => <span key={i} className={'sr-tag ' + cl}>{tx}</span>)}</div>}
    </button>
  )
}

function factionShort(f: CardDef['faction']) {
  return f === 'trade' ? 'TRADE FED' : f === 'blob' ? 'BLOB' : f === 'star' ? 'STAR EMP' : f === 'machine' ? 'MACHINE' : 'UNALIGNED'
}

function ResultModal({ s, onNew }: { s: StarRealmsState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'The void is yours' : 'Your fleet falls'}
      title={won ? 'You Win' : 'AI Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>New duel</button>}
    >
      <div className="finalsc">
        <span className="you">You {s.players[0].authority}</span>
        <span className="foe">AI {s.players[1].authority}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Star Realms"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Engage</button>}>
      <div className="modal-body">
        <p>Both commanders start at <b>50 Authority</b> with a 10-card deck (8 Scout, 2 Viper). Each turn,
          <b> play your whole hand</b> to pool <b>Trade</b> (gold) and <b>Combat</b> (damage).</p>
        <p>Spend Trade to <b>buy</b> ships and bases from the shared trade row (or the always-available
          Explorer); purchases go to your discard. Spend Combat to destroy enemy <b>bases</b> — an
          <i> outpost</i> must fall before you can hit Authority — then burn the foe to <b>0</b> to win.</p>
        <p>Cards belong to four factions — <span style={{ color: 'var(--fac-trade)' }}>Trade Federation</span>,
          <span style={{ color: 'var(--fac-blob)' }}> Blob</span>,
          <span style={{ color: 'var(--fac-star)' }}> Star Empire</span>,
          <span style={{ color: 'var(--fac-machine)' }}> Machine Cult</span>. Playing <b>2+ of one faction</b> a
          turn triggers their <b>ally</b> bonuses.</p>
        <p>Ships return to your discard at end of turn; bases stay. When your deck empties it reshuffles
          from the discard. <b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
