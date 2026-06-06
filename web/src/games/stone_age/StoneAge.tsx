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
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as SA from './logic'
import type { State, Player, SpaceId, ResourceId, Building } from './logic'

const { makeGame, RESOURCE_SPACES, RESOURCES, BUILDING_SLOTS, SLOTS } = SA

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
  const [s, setS] = useState<State>(() => makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(makeGame()); setShowRules(false) }

  const you = s.players[0]
  const ai = s.players[1]
  const yourPlace = s.winner == null && s.phase === 'place' && s.turn === 0
  const yourResolve = s.winner == null && s.phase === 'resolve' && s.turn === 0
  const yourFeed = s.winner == null && s.phase === 'feed' && s.turn === 0

  function clickSpace(space: SpaceId) {
    setS(p => {
      if (p.phase !== 'place' || p.turn !== 0 || p.winner != null) return p
      // count for this space: hut needs 2; field/toolmaker/building need 1; gather spaces
      // place as many as you have left (capped to free slots), min 1.
      let count = 1
      if (space === 'hut') count = 2
      else if (space === SA.FIELD || space === SA.TOOLMAKER || BUILDING_SLOTS.includes(space)) count = 1
      else count = Math.min(p.toPlace[0], SA.freeSlots(p, space))
      if (count < 1) return p
      return SA.canPlace(p, 0, space, count) ? SA.placeWorker(p, 0, space, count) : p
    })
  }
  function doResolve() { setS(p => (p.phase === 'resolve' && p.turn === 0 ? SA.resolvePlacements(p) : p)) }
  function doFeed() { setS(p => (p.phase === 'feed' && p.turn === 0 ? SA.feedPhase(p, 0) : p)) }

  // AI driver — one sub-step per call; tick changes every AI mutation so it never stalls.
  const aiActive =
    s.winner == null &&
    ((s.phase === 'place' && s.turn === 1) ||
      (s.phase === 'resolve' && s.turn === 1) ||
      (s.phase === 'feed' && s.turn === 1))
  const tick = `${s.round}-${s.phase}-${s.turn}-${s.toPlace.join('.')}-${s.resolveIdx}-${s.log.length}`
  useAITurn(aiActive, () => setS(p => (p.turn === 1 && p.winner == null ? SA.aiTurn(p) : p)), { delayMs: 560, tick })

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

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `Your clan thrives — you win ${you.points} to ${ai.points}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `${ai.name} prospered — you lose ${you.points} to ${ai.points}.` }
  else if (yourPlace) { bk = 'you'; banner = `Your turn — place a worker (${s.toPlace[0]} left)` }
  else if (yourResolve) { bk = 'you'; banner = 'Resolve your workers — roll for spoils' }
  else if (yourFeed) { bk = 'you'; banner = 'Feed your tribe — 1 food each' }
  else { bk = 'foe'; banner = `${ai.name} is taking their turn…` }

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
                ? <>Workers to place — You <b>{s.toPlace[0]}</b> · {ai.name} <b>{s.toPlace[1]}</b></>
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
            {s.toPlace[0] >= 2 ? 'workers' : 'a worker'} there. Hut takes 2; field/toolmaker/buildings take 1.</div>}

          <div className="sa-board">
            <Space s={s} id="hunting" glyph="🦴" name="Hunting Ground" meta="food · ÷2" wide
              onClick={clickSpace} can={yourPlace} />
            {RESOURCE_SPACES.map(def => (
              <Space key={def.id} s={s} id={def.id} glyph={RES_GLYPH[def.resource]}
                name={def.name} meta={`${def.resource} · ÷${def.divisor}`} onClick={clickSpace} can={yourPlace} />
            ))}
            <Space s={s} id="field" glyph="🌾" name="Field" meta="+1 farm" onClick={clickSpace} can={yourPlace} />
            <Space s={s} id="hut" glyph="🛖" name="Love Shack" meta="+1 worker · needs 2" onClick={clickSpace} can={yourPlace} />
            <Space s={s} id="toolmaker" glyph="🔨" name="Toolmaker" meta="+1 tool" onClick={clickSpace} can={yourPlace} />

            {BUILDING_SLOTS.map((slot) => {
              const idx = BUILDING_SLOTS.indexOf(slot)
              const b = s.market[idx]
              return <BuildingSpace key={slot} s={s} id={slot} b={b} onClick={clickSpace} can={yourPlace} you={you} />
            })}
          </div>
        </div>

        <div className="side">
          <div className="sa-players">
            <PlayerCard p={you} you active={s.turn === 0 && s.winner == null} />
            <PlayerCard p={ai} you={false} active={s.turn === 1 && s.winner == null} />
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
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

function Cubes({ s, id }: { s: State; id: SpaceId }) {
  return (
    <div className="sa-cubes">
      {s.occ[id].map((pl, i) => <span key={i} className={'sa-cube ' + (pl === 0 ? 'you' : 'foe')} />)}
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
  s, id, glyph, name, meta, wide, onClick, can,
}: {
  s: State; id: SpaceId; glyph: string; name: string; meta: string
  wide?: boolean; onClick: (id: SpaceId) => void; can: boolean
}) {
  const full = id !== 'hunting' && SA.freeSlots(s, id) <= 0
  const selectable = can && SA.canPlaceAny(s, 0, id)
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
      <Cubes s={s} id={id} />
      <Slots s={s} id={id} />
    </div>
  )
}

function BuildingSpace({
  s, id, b, onClick, can, you,
}: {
  s: State; id: SpaceId; b: Building | null; onClick: (id: SpaceId) => void; can: boolean; you: Player
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
  const selectable = can && SA.canPlaceAny(s, 0, id)
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
      <Cubes s={s} id={id} />
      <div className="sa-sp-meta">{afford ? 'affordable' : 'need more'}</div>
    </div>
  )
}

function PlayerCard({ p, you, active }: { p: Player; you: boolean; active: boolean }) {
  return (
    <div className={`sa-player ${you ? 'you-p' : ''} ${active ? 'active' : ''}`}>
      <div className="sa-p-head">
        <span className={'sa-p-name ' + (you ? 'you' : 'foe')}>{p.name}</span>
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

function ResultModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Age of Plenty' : 'Out-built'}
      title={won ? 'You Win' : `${s.players[1].name} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'Your tribe gathered, grew, and raised great works across the ages — the finest clan of the stone age.'
          : 'The rival clan stacked more monuments. Gather faster and keep your people fed next time.'}</p>
      </div>
      <div className="finalsc">
        <span className="you">You {s.players[0].points}</span>
        <span className="foe">{s.players[1].name} {s.players[1].points}</span>
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
