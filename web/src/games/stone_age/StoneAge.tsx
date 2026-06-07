/* STONE AGE — UI. You (player 0) vs one greedy AI (player 1).

   Each ROUND: PLACE (alternate placing all workers onto action spaces, respecting
   slot limits) -> RESOLVE (roll dice for resources/food, grow the tribe, craft tools,
   advance the farm, claim buildings) -> FEED (1 food per worker; shortfall costs points).
   Game ends when the building market depletes; most points wins.

   The AI places multiple worker-batches, then resolves, then feeds — several sub-steps
   while it's still "its action". useAITurn re-arms on a `tick` that CHANGES on every AI
   sub-step (phase · turn · toPlace · log length · round) so it never stalls. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { stoneAgeAdapter } from './net'
import * as SA from './logic'
import type { State, Player, SpaceId, ResourceId, Building } from './logic'

const { RESOURCE_SPACES, RESOURCES, BUILDING_SLOTS, SLOTS } = SA

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#352519" stroke="#e0a23c" strokeWidth="1.5" />
    <path d="M10 34 L18 16 L26 34 Z" fill="#9c6b3f" />
    <path d="M22 34 L30 14 L38 34 Z" fill="#8c93a0" />
    <circle cx="30" cy="14" r="3" fill="#e0b13c" stroke="#b07816" strokeWidth="1" />
    <rect x="9" y="33" width="30" height="3.4" rx="1.2" fill="#4a3526" />
    <circle cx="14.5" cy="22" r="2" fill="#97c46a" />
    <circle cx="33" cy="24" r="2" fill="#e08a52" />
  </svg>
)

const RES_GLYPH: Record<ResourceId, string> = { wood: '🪵', clay: '🧱', stone: '🪨', gold: '🟡' }

function ResPip({ r, n }: { r: ResourceId; n: number }) {
  return (
    <span className={`sa-pip ${r}`}><span className="dot" />{n}</span>
  )
}

export function StoneAge() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(stoneAgeAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  // Seat-relative: "you" is your own seat, the opponent is the other seat.
  const oppSeat = mySeat === 0 ? 1 : 0
  const you = s.players[mySeat]
  const ai = s.players[oppSeat]
  const oppLabel = net.online ? 'Opponent' : ai.name
  const yourPlace = s.winner == null && s.phase === 'place' && isMyTurn
  const yourResolve = s.winner == null && s.phase === 'resolve' && isMyTurn
  const yourFeed = s.winner == null && s.phase === 'feed' && isMyTurn

  function clickSpace(space: SpaceId) {
    if (s.phase !== 'place' || !isMyTurn || s.winner != null) return
    // count for this space: hut needs 2; field/toolmaker/building need 1; gather spaces
    // place as many as you have left (capped to free slots), min 1.
    let count = 1
    if (space === 'hut') count = 2
    else if (space === SA.FIELD || space === SA.TOOLMAKER || BUILDING_SLOTS.includes(space)) count = 1
    else count = Math.min(s.toPlace[mySeat], SA.freeSlots(s, space))
    if (count < 1) return
    if (SA.canPlace(s, mySeat, space, count)) dispatch({ kind: 'place', space, count })
  }
  function doResolve() { if (yourResolve) dispatch({ kind: 'resolve' }) }
  function doFeed() { if (yourFeed) dispatch({ kind: 'feed' }) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Spacebar')) {
        if (yourResolve) { doResolve(); return true }
        if (yourFeed) { doFeed(); return true }
      }
      return false
    },
  })

  const youWin = s.winner === mySeat
  let banner: string, bk = ''
  if (s.winner != null && youWin) { bk = 'win'; banner = `Your clan thrives — you win ${you.points} to ${ai.points}!` }
  else if (s.winner != null) { bk = 'lose'; banner = `${oppLabel} prospered — you lose ${you.points} to ${ai.points}.` }
  else if (yourPlace) { bk = 'you'; banner = `Your turn — place a worker (${s.toPlace[mySeat]} left)` }
  else if (yourResolve) { bk = 'you'; banner = 'Resolve your workers — roll for spoils' }
  else if (yourFeed) { bk = 'you'; banner = 'Feed your tribe — 1 food each' }
  else { bk = 'foe'; banner = `${oppLabel} is taking their turn…` }

  const phaseLabel = s.phase === 'place' ? 'Placement' : s.phase === 'resolve' ? 'Resolve' : s.phase === 'feed' ? 'Feeding' : 'Game Over'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Stone Age · worker placement"
        title="Stone Age"
        subtitle="send your tribe to gather, grow, craft, and build — feed everyone and out-score the rival clan"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Round {s.round} · {phaseLabel}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · place &nbsp; space · resolve/feed &nbsp; N · new</>}
      >
        <div className="sa-main">
          <div className="sa-control">
            <div className="sa-dice">
              {s.lastDice.length
                ? s.lastDice.slice(0, 8).map((d, i) => <div key={i} className="sa-die">{d}</div>)
                : <div className="sa-die empty">?</div>}
            </div>
            <div className="sa-ctl-info">
              {s.phase === 'place'
                ? <>Workers to place — You <b>{s.toPlace[mySeat]}</b> · {oppLabel} <b>{s.toPlace[oppSeat]}</b></>
                : s.lastSpace
                  ? <>last roll at <b>{spaceTitle(s.lastSpace, s)}</b></>
                  : <>&nbsp;</>}
            </div>
            <div className="sa-spacer" />
            <div className="sa-btns">
              <button className="sa-btn" onClick={doResolve} disabled={!yourResolve}>Resolve</button>
              <button className="sa-btn" onClick={doFeed} disabled={!yourFeed}>Feed Tribe</button>
            </div>
          </div>

          {yourPlace && <div className="sa-selhint">Click an action space to send {' '}
            {s.toPlace[mySeat] >= 2 ? 'workers' : 'a worker'} there. Hut takes 2; field/toolmaker/buildings take 1.</div>}

          <div className="sa-board">
            <Space s={s} seat={mySeat} id="hunting" glyph="🦴" name="Hunting Ground" meta="food · ÷2" wide
              onClick={clickSpace} can={yourPlace} />
            {RESOURCE_SPACES.map(def => (
              <Space key={def.id} s={s} seat={mySeat} id={def.id} glyph={RES_GLYPH[def.resource]}
                name={def.name} meta={`${def.resource} · ÷${def.divisor}`} onClick={clickSpace} can={yourPlace} />
            ))}
            <Space s={s} seat={mySeat} id="field" glyph="🌾" name="Field" meta="+1 farm" onClick={clickSpace} can={yourPlace} />
            <Space s={s} seat={mySeat} id="hut" glyph="🛖" name="Love Shack" meta="+1 worker · needs 2" onClick={clickSpace} can={yourPlace} />
            <Space s={s} seat={mySeat} id="toolmaker" glyph="🔨" name="Toolmaker" meta="+1 tool" onClick={clickSpace} can={yourPlace} />

            {BUILDING_SLOTS.map((slot) => {
              const idx = BUILDING_SLOTS.indexOf(slot)
              const b = s.market[idx]
              return <BuildingSpace key={slot} s={s} seat={mySeat} id={slot} b={b} onClick={clickSpace} can={yourPlace} you={you} />
            })}
          </div>
        </div>

        <div className="side">
          <div className="ch-panel">
            <OnlineBar net={net} />
          </div>
          <div className="sa-players">
            <PlayerCard p={you} you active={s.turn === mySeat && s.winner == null} label="You" />
            <PlayerCard p={ai} you={false} active={s.turn === oppSeat && s.winner == null} label={oppLabel} />
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={youWin} you={you} opp={ai} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function spaceTitle(id: SpaceId, s: State): string {
  if (id === 'hunting') return 'Hunting Ground'
  if (id === 'field') return 'Field'
  if (id === 'hut') return 'Love Shack'
  if (id === 'toolmaker') return 'Toolmaker'
  if (BUILDING_SLOTS.includes(id)) {
    const b = s.market[BUILDING_SLOTS.indexOf(id)]
    return b ? b.name : 'Building'
  }
  return RESOURCE_SPACES.find(d => d.id === id)?.name ?? id
}

function Cubes({ s, id, seat }: { s: State; id: SpaceId; seat: number }) {
  return (
    <div className="sa-cubes">
      {s.occ[id].map((pl, i) => <span key={i} className={'sa-cube ' + (pl === seat ? 'you' : 'foe')} />)}
    </div>
  )
}

function Slots({ s, id }: { s: State; id: SpaceId }) {
  const cap = SLOTS[id]
  if (cap > 20) return null // unlimited (hunting) — no dots
  const filled = s.occ[id].length
  return (
    <div className="sa-slotdots">
      {Array.from({ length: cap }).map((_, i) => (
        <span key={i} className={'sa-slotdot ' + (i < filled ? 'filled' : '')} />
      ))}
    </div>
  )
}

function Space({
  s, seat, id, glyph, name, meta, wide, onClick, can,
}: {
  s: State; seat: number; id: SpaceId; glyph: string; name: string; meta: string
  wide?: boolean; onClick: (id: SpaceId) => void; can: boolean
}) {
  const full = id !== 'hunting' && SA.freeSlots(s, id) <= 0
  const selectable = can && SA.canPlaceAny(s, seat, id)
  return (
    <div
      className={`sa-space${wide ? ' wide' : ''}${full ? ' full' : ''}${selectable ? ' selectable' : ''}`}
      onClick={() => selectable && onClick(id)}
      role={selectable ? 'button' : undefined}
    >
      <div className="sa-sp-head">
        <span className="sa-sp-glyph">{glyph}</span>
        <span className="sa-sp-name">{name}</span>
        <span className="sa-sp-slots">{id === 'hunting' ? '∞' : `${s.occ[id].length}/${SLOTS[id]}`}</span>
      </div>
      <div className="sa-sp-meta">{meta}</div>
      <Cubes s={s} id={id} seat={seat} />
      <Slots s={s} id={id} />
    </div>
  )
}

function BuildingSpace({
  s, seat, id, b, onClick, can, you,
}: {
  s: State; seat: number; id: SpaceId; b: Building | null; onClick: (id: SpaceId) => void; can: boolean; you: Player
}) {
  if (!b) {
    return (
      <div className="sa-space full">
        <div className="sa-sp-head"><span className="sa-sp-glyph">🏗️</span><span className="sa-sp-name">—</span></div>
        <div className="sa-bclaimed">claimed</div>
      </div>
    )
  }
  const afford = RESOURCES.every(r => you.res[r] >= (b.cost[r] ?? 0))
  const selectable = can && SA.canPlaceAny(s, seat, id)
  return (
    <div
      className={`sa-space${selectable ? ' selectable' : ''}`}
      onClick={() => selectable && onClick(id)}
      role={selectable ? 'button' : undefined}
      title={afford ? 'You can afford this — place a worker to build it' : 'Place a worker; built only if affordable on resolve'}
    >
      <div className="sa-sp-head">
        <span className="sa-sp-glyph">{b.short}</span>
        <span className="sa-sp-name">{b.name}</span>
        <span className="sa-bpts">{b.points}p</span>
      </div>
      <div className="sa-bcost">
        {RESOURCES.filter(r => (b.cost[r] ?? 0) > 0).map(r => <ResPip key={r} r={r} n={b.cost[r] ?? 0} />)}
      </div>
      <Cubes s={s} id={id} seat={seat} />
      <div className="sa-sp-meta">{afford ? 'affordable' : 'need more'}</div>
    </div>
  )
}

function PlayerCard({ p, you, active, label }: { p: Player; you: boolean; active: boolean; label: string }) {
  return (
    <div className={`sa-player ${you ? 'you-p' : ''} ${active ? 'active' : ''}`}>
      <div className="sa-p-head">
        <span className={'sa-p-name ' + (you ? 'you' : 'foe')}>{label}</span>
        <span className="sa-p-pts">{p.points}<small>points</small></span>
      </div>
      <div className="sa-stock">
        <Stat cls="workers" k="tribe" v={p.workers} />
        <Stat cls="food" k="food" v={p.food} />
        <Stat cls="farm" k="farm" v={p.farm} />
        <Stat cls="tools" k="tools" v={p.tools} />
        <Stat cls="wood" k="wood" v={p.res.wood} />
        <Stat cls="clay" k="clay" v={p.res.clay} />
        <Stat cls="stone" k="stone" v={p.res.stone} />
        <Stat cls="gold" k="gold" v={p.res.gold} />
        <Stat cls="" k="builds" v={p.buildings.length} />
      </div>
      <div className="sa-blds">
        {p.buildings.length
          ? p.buildings.map((id, i) => {
              const b = SA.BUILDINGS_BY_ID[id]
              return <span key={i} className="sa-bld-chip" title={b?.name}>{b?.short ?? '🏠'}</span>
            })
          : <span className="sa-blds-empty">no buildings yet</span>}
      </div>
    </div>
  )
}

function Stat({ cls, k, v }: { cls: string; k: string; v: number }) {
  return (
    <div className={'sa-stat ' + cls}>
      <span className="v">{v}</span>
      <span className="k">{k}</span>
    </div>
  )
}

function ResultModal({ won, you, opp, oppLabel, onNew }: { won: boolean; you: Player; opp: Player; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Age of Plenty' : 'Out-built'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'Your tribe gathered, grew, and raised great works across the ages — the finest clan of the stone age.'
          : 'The rival clan stacked more monuments. Gather faster and keep your people fed next time.'}</p>
      </div>
      <div className="finalsc">
        <span className="you">You {you.points}</span>
        <span className="foe">{oppLabel} {opp.points}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Stone Age" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin!</button>}>
      <div className="modal-body">
        <p>Each round has three phases. In <b>Placement</b> you and the rival clan alternate sending workers to action spaces (respecting slot limits). In <b>Resolve</b> your placed workers act. In <b>Feeding</b> every worker eats 1 food.</p>
        <p><b>Hunting Ground</b> (any number) — roll dice for food (÷2). <b>Forest / Clay Pit / Quarry / River</b> (limited slots) — roll dice for wood/clay/stone/gold; yield = floor((dice + tools) ÷ 3/4/5/6).</p>
        <p><b>Field</b> raises your farm (+1 passive food each round). <b>Love Shack</b> (needs 2 workers) grows your tribe by 1. <b>Toolmaker</b> grants a tool (+1 to future gather rolls).</p>
        <p><b>Buildings</b> — place 1 worker on a market building; on resolve you build it if you can pay its resource cost, banking its points.</p>
        <p><b>Feeding:</b> the farm feeds first, then your food stock; any shortfall costs 1 point per missing food.</p>
        <p>The game ends when the <b>building market</b> empties. Final score adds leftover resources (by value). Most points wins.</p>
        <p><b>Keys:</b> <kbd>click</kbd> place · <kbd>Space</kbd> resolve/feed · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
