/* EVERDELL — UI. You (player 0) vs one greedy AI (player 1).

   On your turn do ONE: place a worker on a forest location (gain resources/cards),
   play a card from your hand or the meadow into your city (pay cost — or FREE if its
   housing construction is already built), or prepare for the next season (recall all
   workers + gain more, advancing Winter -> Spring -> Summer -> Autumn). When both
   players finish Autumn the game ends; most city points wins.

   The AI takes one action per call across many turns; useAITurn re-arms on a `tick`
   that CHANGES every AI mutation (turn · log length · both players' city/worker/season
   state) so it never stalls. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as EV from './logic'
import type { State, Player, LocationId, ResourceId, CardDef } from './logic'

const { makeGame, LOCATIONS, RESOURCES, SEASON_ORDER, CARD_BY_ID, CITY_CAP } = EV

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="12" fill="#1f3326" stroke="#e7b75a" strokeWidth="1.5" />
    <path d="M24 9 C18 16 14 22 14 29 a10 10 0 0 0 20 0 C34 22 30 16 24 9 Z" fill="#5fa771" />
    <path d="M24 12 C20 18 17 23 17 28 a7 7 0 0 0 14 0 C31 23 28 18 24 12 Z" fill="#7cc78a" />
    <rect x="22.6" y="27" width="2.8" height="13" rx="1.2" fill="#7a5230" />
    <circle cx="18" cy="20" r="2" fill="#e7b75a" />
    <circle cx="31" cy="23" r="1.7" fill="#e88a5a" />
  </svg>
)

const RES_GLYPH: Record<ResourceId, string> = { twig: '🪵', resin: '🟠', pebble: '⬜', berry: '🫐' }
const RES_LABEL: Record<ResourceId, string> = { twig: 'twig', resin: 'resin', pebble: 'pebble', berry: 'berry' }

function ResPip({ r, n }: { r: ResourceId; n: number }) {
  return <span className={`ev-respip ${r}`}><span className="dot" />{RES_GLYPH[r]} {n}</span>
}

function costString(card: CardDef): { r: ResourceId; n: number }[] {
  return RESOURCES.filter(r => (card.cost[r] ?? 0) > 0).map(r => ({ r, n: card.cost[r] ?? 0 }))
}

export function Everdell() {
  const [s, setS] = useState<State>(() => makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(makeGame()); setShowRules(false) }

  const you = s.players[0]
  const ai = s.players[1]
  const yourTurn = s.winner == null && s.turn === 0 && !you.done

  function clickLocation(loc: LocationId) {
    setS(p => (p.turn === 0 && p.winner == null && EV.canPlaceWorker(p, 0, loc) ? EV.placeWorker(p, 0, loc) : p))
  }
  function clickPlay(cardId: string, fromMeadow: boolean) {
    setS(p => (p.turn === 0 && p.winner == null && EV.canPlayCard(p, 0, cardId, fromMeadow)
      ? EV.playCard(p, 0, cardId, fromMeadow) : p))
  }
  function doPrepare() {
    setS(p => (p.turn === 0 && p.winner == null && !p.players[0].done ? EV.prepareSeason(p, 0) : p))
  }

  // AI driver — one action per call. tick changes on every AI mutation so it never stalls.
  const aiActive = s.winner == null && s.turn === 1 && !ai.done
  const tick =
    `${s.turn}-${s.log.length}-${ai.city.length}-${ai.workersUsed}-${ai.season}-${ai.done}` +
    `-${you.city.length}-${you.done}`
  useAITurn(aiActive, () => setS(p => (p.turn === 1 && p.winner == null && !p.players[1].done ? EV.aiTurn(p) : p)),
    { delayMs: 560, tick })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Spacebar') && yourTurn) { doPrepare(); return true }
      return false
    },
  })

  const youScore = EV.scoreCity(you)
  const aiScore = EV.scoreCity(ai)

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `Your city shines — you win ${youScore} to ${aiScore}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `${ai.name} out-built you — you lose ${youScore} to ${aiScore}.` }
  else if (yourTurn) { bk = 'you'; banner = `Your turn — place a worker, play a card, or prepare (${EV.workersAvailable(you)} workers left)` }
  else { bk = 'foe'; banner = `${ai.name} is pondering the forest…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Everdell · worker placement"
        title="Everdell"
        subtitle="gather from the forest, build a woodland city of critters & constructions, and out-score the Owl Sage across four seasons"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>You · {cap(you.season)} &nbsp;·&nbsp; {ai.name} · {cap(ai.season)}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · place/play &nbsp; space · prepare &nbsp; N · new</>}
      >
        <div className="ev-main">
          {/* forest locations */}
          <section className="ev-section">
            <div className="ev-sec-title">The Forest <span>— place a worker</span></div>
            <div className="ev-forest">
              {LOCATIONS.map(l => {
                const filled = s.occ[l.id]
                const sel = yourTurn && EV.canPlaceWorker(s, 0, l.id)
                const full = EV.freeSlots(s, l.id) <= 0
                return (
                  <div key={l.id}
                    className={`ev-loc${sel ? ' selectable' : ''}${full ? ' full' : ''}`}
                    role={sel ? 'button' : undefined}
                    onClick={() => sel && clickLocation(l.id)}>
                    <div className="ev-loc-head">
                      <span className="ev-loc-glyph">{l.short}</span>
                      <span className="ev-loc-name">{l.name}</span>
                      <span className="ev-loc-slots">{l.slots > 20 ? '∞' : `${filled.length}/${l.slots}`}</span>
                    </div>
                    <div className="ev-loc-gain">{gainText(l)}</div>
                    <div className="ev-cubes">
                      {filled.map((pl, i) => <span key={i} className={'ev-cube ' + (pl === 0 ? 'you' : 'foe')} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* meadow market */}
          <section className="ev-section">
            <div className="ev-sec-title">The Meadow <span>— play a card from here</span></div>
            <div className="ev-cardrow">
              {s.meadow.map((id, i) => {
                const card = CARD_BY_ID[id]
                const free = EV.isHousedFree(you, card)
                const sel = yourTurn && EV.canPlayCard(s, 0, id, true)
                return <CardTile key={i} card={card} free={free} selectable={sel}
                  onClick={() => sel && clickPlay(id, true)} />
              })}
            </div>
          </section>

          {/* your hand */}
          <section className="ev-section">
            <div className="ev-sec-title">Your Hand <span>— play into your city</span></div>
            <div className="ev-cardrow">
              {you.hand.length === 0 && <div className="ev-empty">no cards in hand</div>}
              {you.hand.map((id, i) => {
                const card = CARD_BY_ID[id]
                const free = EV.isHousedFree(you, card)
                const sel = yourTurn && EV.canPlayCard(s, 0, id, false)
                return <CardTile key={i} card={card} free={free} selectable={sel}
                  onClick={() => sel && clickPlay(id, false)} />
              })}
            </div>
            <div className="ev-actions">
              <button className="ev-btn" onClick={doPrepare} disabled={!yourTurn}>
                Prepare for {you.season === 'autumn' ? 'End' : cap(SEASON_ORDER[SEASON_ORDER.indexOf(you.season) + 1])}
              </button>
            </div>
          </section>
        </div>

        <div className="side">
          <PlayerPanel p={you} you score={youScore} active={s.turn === 0 && s.winner == null} />
          <PlayerPanel p={ai} you={false} score={aiScore} active={s.turn === 1 && s.winner == null} />
          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} youScore={youScore} aiScore={aiScore} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

function gainText(l: EV.LocationDef): string {
  const parts: string[] = []
  for (const r of RESOURCES) if (l.gain[r]) parts.push(`+${l.gain[r]} ${RES_LABEL[r]}`)
  if (l.cards) parts.push(`+${l.cards} card${l.cards > 1 ? 's' : ''}`)
  return parts.join(' · ') || '—'
}

function CardTile({ card, free, selectable, onClick }: {
  card: CardDef; free: boolean; selectable: boolean; onClick: () => void
}) {
  const cost = costString(card)
  return (
    <div className={`ev-card ${card.kind}${selectable ? ' selectable' : ''}${free ? ' free' : ''}`}
      role={selectable ? 'button' : undefined} onClick={onClick}
      title={card.kind === 'critter' && card.housedBy ? `Housed free by ${card.housedBy}` : undefined}>
      <div className="ev-card-top">
        <span className="ev-card-glyph">{card.short}</span>
        <span className="ev-card-pts">{card.points}<small>pt</small></span>
      </div>
      <div className="ev-card-name">{card.name}</div>
      <div className="ev-card-kind">{card.kind === 'construction' ? '◆ construction' : '✦ critter'}</div>
      <div className="ev-card-cost">
        {free ? <span className="ev-free">FREE · housed</span>
          : cost.length ? cost.map(c => <ResPip key={c.r} r={c.r} n={c.n} />)
            : <span className="ev-free">free</span>}
      </div>
      {card.bonus && <div className="ev-card-bonus">+{card.bonus.points}/{card.bonus.per === 'construction' ? 'constr.' : 'critter'}</div>}
    </div>
  )
}

function PlayerPanel({ p, you, score, active }: { p: Player; you: boolean; score: number; active: boolean }) {
  const constructions = p.city.filter(id => CARD_BY_ID[id]?.kind === 'construction')
  const critters = p.city.filter(id => CARD_BY_ID[id]?.kind === 'critter')
  return (
    <div className={`ev-player ${you ? 'you-p' : ''} ${active ? 'active' : ''}`}>
      <div className="ev-p-head">
        <span className={'ev-p-name ' + (you ? 'you' : 'foe')}>{p.name}</span>
        <span className="ev-p-score">{score}<small>pts</small></span>
      </div>
      <div className="ev-p-meta">
        <span className="ev-tag season">{cap(p.season)}{p.done ? ' · done' : ''}</span>
        <span className="ev-tag workers">👷 {EV.workersAvailable(p)}/{p.workersTotal}</span>
        <span className="ev-tag city">🏙️ {p.city.length}/{CITY_CAP}</span>
      </div>
      <div className="ev-p-res">
        {RESOURCES.map(r => <ResPip key={r} r={r} n={p.res[r]} />)}
      </div>
      <div className="ev-city">
        <div className="ev-city-row">
          {constructions.length ? constructions.map((id, i) =>
            <span key={i} className="ev-chip construction" title={CARD_BY_ID[id]?.name}>{CARD_BY_ID[id]?.short}</span>)
            : <span className="ev-city-empty">no constructions</span>}
        </div>
        <div className="ev-city-row">
          {critters.length ? critters.map((id, i) =>
            <span key={i} className="ev-chip critter" title={CARD_BY_ID[id]?.name}>{CARD_BY_ID[id]?.short}</span>)
            : <span className="ev-city-empty">no critters</span>}
        </div>
      </div>
    </div>
  )
}

function ResultModal({ s, youScore, aiScore, onNew }: {
  s: State; youScore: number; aiScore: number; onNew: () => void
}) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'A flourishing city' : 'Out-built'}
      title={won ? 'You Win' : `${s.players[1].name} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}>
      <div className="modal-body">
        <p>{won
          ? 'Your woodland city grew tall with critters and constructions across all four seasons — the pride of Everdell.'
          : 'The Owl Sage raised a grander city this time. House more critters for free and play higher-value cards next round.'}</p>
      </div>
      <div className="finalsc">
        <span className="you">You {youScore}</span>
        <span className="foe">{s.players[1].name} {aiScore}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Everdell" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin!</button>}>
      <div className="modal-body">
        <p>Build a <b>city</b> of up to 15 cards — <b>constructions</b> and <b>critters</b> — and score the most points across four seasons.</p>
        <p>On your turn do <b>ONE</b>:</p>
        <p><b>Place a worker</b> on a forest location to gain resources (twig, resin, pebble, berry) and/or cards. Some spots have limited slots.</p>
        <p><b>Play a card</b> from your hand or the meadow into your city, paying its resource cost — <b>or for FREE</b> if you already have the matching <b>construction</b> that houses that critter (e.g. build the <i>Farm</i>, then play the <i>Husband</i> free).</p>
        <p><b>Prepare for the next season</b> to recall all your workers and gain more, advancing Winter → Spring → Summer → Autumn.</p>
        <p>When <b>both</b> players finish Autumn the game ends. Score = card points + bonuses (some cards score per other construction/critter). Most points wins.</p>
        <p><b>Keys:</b> <kbd>click</kbd> place/play · <kbd>Space</kbd> prepare · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
