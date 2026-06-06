/* RADLANDS — UI. A 2-player post-apocalyptic tableau duel. You (player 0) defend three
   CAMPS, each fronted by up to two PEOPLE; a card is PROTECTED while one of yours stands
   ahead of it in the same column. Spend WATER (3+/turn) to play people, fire abilities
   (Damage / Injure / Restore / Water / Draw), or queue delayed EVENTS. Destroy all three
   enemy camps to win. The AI takes its whole multi-action turn one step at a time. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as R from './logic'
import type { RadlandsState, Player, AbilitySource, AbilityTarget, AbilityKind } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="9" fill="#1d130b" stroke="#9c4f17" strokeWidth="1.5" />
    <path d="M9 34 L18 14 L24 26 L30 12 L39 34 Z" fill="none" stroke="#ff9f4a" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx="24" cy="33" r="2.4" fill="#4fb3c9" />
  </svg>
)

// what the human currently has "in hand to commit": a selected hand card, or a primed ability
type Sel =
  | { mode: 'card'; cardId: string }
  | { mode: 'ability'; source: AbilitySource; kind: AbilityKind }
  | null

export function Radlands() {
  const [s, setS] = useState<RadlandsState>(() => R.makeGame())
  const [sel, setSel] = useState<Sel>(null)
  const [showRules, setShowRules] = useState(false)

  const apply = (fn: (st: RadlandsState) => void) =>
    setS(prev => { const n = structuredClone(prev); fn(n); return n })

  function newGame() { setS(R.makeGame()); setSel(null); setShowRules(false) }

  const yourTurn = s.winner == null && s.turn === 0
  const aiActive = s.winner == null && s.turn === 1
  // The AI takes MULTIPLE actions per turn; re-arm the timer via the monotonic `actions`
  // counter so each sub-step animates. (tick = s.actions — changes on every AI sub-action.)
  useAITurn(aiActive, () => apply(st => R.aiStep(st)), { delayMs: 520, tick: s.actions })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setSel(null); setShowRules(false) } })

  const you = s.players[0], foe = s.players[1]
  const legal = yourTurn ? R.legalActions(s, 0) : []

  // ---- interaction ----
  function clickHandCard(cardId: string) {
    if (!yourTurn) return
    const d = R.def(cardId)
    if (d.kind === 'event') {
      // events fire immediately on click if affordable
      if (legal.some(a => a.type === 'event' && a.cardId === cardId)) {
        apply(st => R.playEvent(st, 0, cardId)); setSel(null)
      }
      return
    }
    setSel(prev => prev && prev.mode === 'card' && prev.cardId === cardId ? null : { mode: 'card', cardId })
  }

  function clickSlot(column: number, slot: number) {
    if (!yourTurn || !sel || sel.mode !== 'card') return
    if (legal.some(a => a.type === 'play' && a.cardId === sel.cardId && a.column === column && a.slot === slot)) {
      apply(st => R.playPerson(st, 0, sel.cardId, column, slot)); setSel(null)
    }
  }

  // prime an ability source (your person/camp that is ready and affordable)
  function clickAbilitySource(source: AbilitySource, kind: AbilityKind) {
    if (!yourTurn) return
    const matches = legal.filter(a => a.type === 'ability' && sameSource(a.source, source))
    if (matches.length === 0) return
    // economy abilities (no target) resolve immediately
    if (kind === 'water' || kind === 'draw' || kind === 'raid') {
      const m = matches[0]
      if (m.type === 'ability') apply(st => R.useAbility(st, 0, m.source, m.target))
      setSel(null)
      return
    }
    setSel(prev => prev && prev.mode === 'ability' && sameSource(prev.source, source) ? null : { mode: 'ability', source, kind })
  }

  // fire the primed ability at a target
  function clickTarget(target: AbilityTarget) {
    if (!yourTurn || !sel || sel.mode !== 'ability') return
    if (legal.some(a => a.type === 'ability' && sameSource(a.source, sel.source) && a.target != null && sameTarget(a.target, target))) {
      apply(st => R.useAbility(st, 0, sel.source, target)); setSel(null)
    }
  }

  function endTurn() { if (yourTurn) { apply(st => R.endTurn(st)); setSel(null) } }

  // ---- target highlighting helpers ----
  const primed = sel && sel.mode === 'ability' ? sel : null
  function isTargetable(player: Player, column: number, slot: number): boolean {
    if (!primed) return false
    return legal.some(a => a.type === 'ability' && sameSource(a.source, primed.source)
      && a.target != null && a.target.player === player && a.target.column === column && a.target.slot === slot)
  }
  function slotIsDrop(column: number, slot: number): boolean {
    if (!sel || sel.mode !== 'card') return false
    return legal.some(a => a.type === 'play' && a.cardId === sel.cardId && a.column === column && a.slot === slot)
  }

  // ---- banner ----
  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'Victory — every enemy camp lies in ruins' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'Defeat — your camps are overrun' }
  else if (yourTurn && primed) { bk = 'you'; banner = `Pick a target for ${primed.kind.toUpperCase()} — click a highlighted card` }
  else if (yourTurn && sel && sel.mode === 'card') { bk = 'you'; banner = 'Click a glowing slot to deploy — or an event to fire it' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — deploy people, fire abilities, then end turn' }
  else { bk = 'foe'; banner = 'The raiders make their move…' }

  const youAlive = you.columns.filter(c => !c.camp.destroyed).length
  const foeAlive = foe.columns.filter(c => !c.camp.destroyed).length

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Radlands · wasteland tableau combat"
        title="Radlands"
        subtitle="defend three camps, raid the enemy's — destroy all three of theirs to take the wasteland"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Camps <span style={{ color: 'var(--you)' }}>{youAlive}</span> – <span style={{ color: 'var(--foe)' }}>{foeAlive}</span> · Round {s.round}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules &nbsp; Esc · cancel</>}
      >
        <div className="rl-wrap">
          {/* foe board */}
          <div className="rl-side-h"><span className="foe">Raiders</span> — enemy camps &amp; people</div>
          <Board s={s} owner={1} foe orientationFoe
            isTargetable={(c, sl) => isTargetable(1, c, sl)}
            onTarget={(c, sl) => clickTarget({ player: 1, column: c, slot: sl })}
          />

          <div className="rl-divider" />

          {/* your board */}
          <div className="rl-side-h"><span className="you">You</span> — your camps &amp; people (click a ready card to use its ability)</div>
          <Board s={s} owner={0}
            yourTurn={yourTurn}
            isTargetable={(c, sl) => isTargetable(0, c, sl)}
            onTarget={(c, sl) => clickTarget({ player: 0, column: c, slot: sl })}
            primedKind={primed?.kind}
            selSource={sel && sel.mode === 'ability' ? sel.source : null}
            onAbility={clickAbilitySource}
            slotIsDrop={slotIsDrop}
            onSlot={clickSlot}
            legal={legal}
          />

          {/* events queue */}
          <div className="rl-side-h">Events queue (fires after countdown)</div>
          <div className="rl-events">
            {you.events.length === 0 && foe.events.length === 0 && <span className="rl-ev-empty">no events queued</span>}
            {you.events.map(ev => (
              <div key={'y' + ev.id} className="rl-ev">
                <div className="rl-evn">{R.def(ev.key).name}</div>
                <div className="rl-evc">fires in {ev.countdown}</div>
              </div>
            ))}
            {foe.events.map(ev => (
              <div key={'f' + ev.id} className="rl-ev foe">
                <div className="rl-evn">{R.def(ev.key).name}</div>
                <div className="rl-evc">fires in {ev.countdown}</div>
              </div>
            ))}
          </div>

          {/* water + hand */}
          <div className="rl-handbar">
            <div className="rl-water">
              <span className="lab">Water</span>
              <span className="drops">
                {Array.from({ length: Math.max(you.water, 0) }).map((_, i) => <span key={i} className="drop" />)}
                {you.water === 0 && <span className="lab">dry</span>}
              </span>
              <span>{you.water}</span>
            </div>
            <div className="rl-hand">
              {you.hand.length === 0 && <span className="rl-hand-empty">empty hand — end your turn</span>}
              {you.hand.map((cardId, i) => {
                const d = R.def(cardId)
                const playable = yourTurn && (
                  d.kind === 'event'
                    ? legal.some(a => a.type === 'event' && a.cardId === cardId)
                    : legal.some(a => a.type === 'play' && a.cardId === cardId)
                )
                const selected = sel != null && sel.mode === 'card' && sel.cardId === cardId
                return (
                  <button key={cardId + i} type="button"
                    className={'rl-card kind-' + d.kind + (selected ? ' selected' : '') + (playable ? '' : ' disabled')}
                    disabled={!playable}
                    onClick={() => clickHandCard(cardId)}>
                    <span className="rl-cost">{d.cost}</span>
                    <span className="rl-ck">{d.kind}</span>
                    <span className="rl-cn">{d.name}</span>
                    <span className="rl-cb">{d.blurb}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rl-actions">
            <button className="rl-btn primary" disabled={!yourTurn} onClick={endTurn}>End turn</button>
            {sel && <button className="rl-btn" onClick={() => setSel(null)}>Cancel</button>}
            {primed
              ? <span className="rl-hint">Firing <b>{primed.kind}</b> — click a highlighted enemy/your card.</span>
              : sel && sel.mode === 'card'
                ? <span className="rl-hint">Deploy <b>{R.def(sel.cardId).name}</b> into a glowing slot.</span>
                : yourTurn
                  ? <span className="rl-hint">Click a hand card to deploy, or a <b>ready</b> person/camp to use its ability.</span>
                  : null}
          </div>
        </div>

        {/* side panel */}
        <div className="side">
          <div className="panel rl-bigcamps">
            <div className="col you"><div className="nm">You</div><div className="v">{youAlive}</div><div className="sub">camps left</div></div>
            <div className="col foe"><div className="nm">AI</div><div className="v">{foeAlive}</div><div className="sub">camps left</div></div>
          </div>
          <div className="panel">
            <div className="panel-l">Supply</div>
            <div className="rl-counts">
              <div className="cr"><span>Your water</span><b>{you.water}</b></div>
              <div className="cr"><span>Your deck</span><b>{you.deck.length}</b></div>
              <div className="cr"><span>Your discard</span><b>{you.discard.length}</b></div>
              <div className="cr"><span>Your hand</span><b>{you.hand.length}</b></div>
              <div className="cr"><span>AI deck</span><b>{foe.deck.length}</b></div>
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

// ---- board (one player's three columns) ----
function Board(props: {
  s: RadlandsState
  owner: Player
  foe?: boolean
  orientationFoe?: boolean
  yourTurn?: boolean
  isTargetable: (column: number, slot: number) => boolean
  onTarget: (column: number, slot: number) => void
  primedKind?: AbilityKind
  selSource?: AbilitySource | null
  onAbility?: (source: AbilitySource, kind: AbilityKind) => void
  slotIsDrop?: (column: number, slot: number) => boolean
  onSlot?: (column: number, slot: number) => void
  legal?: R.LegalAction[]
}) {
  const { s, owner, foe, orientationFoe } = props
  const p = s.players[owner]
  return (
    <div className={'rl-board ' + (foe ? 'foe' : 'you')}>
      <div className="rl-cols">
        {p.columns.map((col, c) => (
          <div key={c} className="rl-col">
            {/* camp */}
            <Camp s={s} owner={owner} column={c}
              targetable={props.isTargetable(c, -1)}
              onTarget={() => props.onTarget(c, -1)}
              selSource={props.selSource ?? null}
              onAbility={props.onAbility}
              yourTurn={props.yourTurn}
              legal={props.legal}
            />
            {/* two person slots: render back (0) then front (1); foe board is column-reversed in CSS */}
            {[0, 1].map(sl => {
              const person = col.people[sl]
              if (person == null) {
                const drop = props.slotIsDrop?.(c, sl) ?? false
                return (
                  <div key={sl} className={'rl-slot empty' + (drop ? ' drop' : '')}
                    onClick={drop ? () => props.onSlot?.(c, sl) : undefined}>
                    <span className="rl-slot-lab">{sl === 1 ? 'front' : 'back'}</span>
                  </div>
                )
              }
              const protectedHere = R.isProtected(s, owner, c, sl)
              const targetable = props.isTargetable(c, sl)
              const isSel = props.selSource != null && props.selSource.column === c && props.selSource.slot === sl && props.selSource.player === owner
              // is this OUR person a usable ability source?
              const usable = !foe && (props.legal?.some(a => a.type === 'ability' && a.source.player === owner && a.source.column === c && a.source.slot === sl) ?? false)
              const d = R.def(person.key)
              return (
                <div key={sl} className="rl-slot">
                  <div
                    className={'rl-person ' + (foe ? 'foe' : 'you')
                      + (person.damaged ? ' dmg' : '')
                      + (person.ready && usable ? ' ready btn' : '')
                      + (targetable ? ' target' : '')
                      + (protectedHere ? ' protected' : '')
                      + (isSel ? ' selected' : '')}
                    onClick={
                      targetable ? () => props.onTarget(c, sl)
                        : (usable && d.ability && props.onAbility) ? () => props.onAbility!({ player: owner, column: c, slot: sl }, d.ability!)
                          : undefined}>
                    <span className="rl-pn">{d.name}</span>
                    <span className="rl-pa">{abilityLabel(d.ability, d.abilityCost)}</span>
                    <span className="rl-pflags">
                      {person.damaged && <span className="rl-flag inj">injured</span>}
                      {!foe && !person.ready && <span className="rl-flag zzz">not ready</span>}
                      {!foe && person.ready && usable && <span className="rl-flag rdy">ready</span>}
                    </span>
                  </div>
                </div>
              )
            })}
            <span className="rl-slot-lab" style={{ opacity: .5, fontSize: 7, textAlign: 'center' }}>
              {orientationFoe ? '↑ toward you' : 'toward enemy ↑'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Camp(props: {
  s: RadlandsState; owner: Player; column: number
  targetable: boolean; onTarget: () => void
  selSource: AbilitySource | null
  onAbility?: (source: AbilitySource, kind: AbilityKind) => void
  yourTurn?: boolean
  legal?: R.LegalAction[]
}) {
  const { s, owner, column } = props
  const camp = s.players[owner].columns[column].camp
  const d = R.def(camp.key)
  const hpClass = camp.destroyed ? '' : camp.health <= 1 ? ' crit' : camp.health <= 2 ? ' low' : ''
  const isMine = owner === 0
  const campUsable = isMine && !camp.destroyed && (props.legal?.some(a =>
    a.type === 'ability' && a.source.player === owner && a.source.column === column && a.source.slot === -1) ?? false)
  return (
    <div className={'rl-camp ' + (owner === 0 ? 'you' : 'foe') + (camp.destroyed ? ' destroyed' : '') + (props.targetable ? ' target' : '')}
      onClick={props.targetable ? props.onTarget : undefined}
      style={props.targetable ? { cursor: 'pointer', boxShadow: '0 0 0 2px var(--foe)' } : undefined}>
      <div className="rl-camp-top">
        <span className="rl-camp-name">{d.name}</span>
        <span className={'rl-camp-hp' + hpClass}>{camp.destroyed ? '✕' : '♥ ' + camp.health}</span>
      </div>
      {d.ability && !camp.destroyed && isMine
        ? <button className="rl-camp-btn" disabled={!campUsable}
            onClick={(e) => { e.stopPropagation(); if (campUsable && props.onAbility) props.onAbility({ player: owner, column, slot: -1 }, d.ability!) }}>
            {abilityLabel(d.ability, d.abilityCost)}
          </button>
        : d.ability
          ? <div className="rl-camp-ability">{abilityLabel(d.ability, d.abilityCost)}</div>
          : <div className="rl-camp-ability">— no ability —</div>}
    </div>
  )
}

function abilityLabel(kind: AbilityKind | undefined, cost: number | undefined): string {
  if (!kind) return '—'
  const c = cost ?? 0
  const w = c === 0 ? 'free' : c + 'W'
  const name = kind.charAt(0).toUpperCase() + kind.slice(1)
  return `${name} · ${w}`
}

function sameSource(a: AbilitySource, b: AbilitySource): boolean {
  return a.player === b.player && a.column === b.column && a.slot === b.slot
}
function sameTarget(a: AbilityTarget, b: AbilityTarget): boolean {
  return a.player === b.player && a.column === b.column && a.slot === b.slot
}

function ResultModal({ s, onNew }: { s: RadlandsState; onNew: () => void }) {
  const won = s.winner === 0
  const youAlive = s.players[0].columns.filter(c => !c.camp.destroyed).length
  const foeAlive = s.players[1].columns.filter(c => !c.camp.destroyed).length
  return (
    <Modal
      eyebrow={won ? 'The wasteland is yours' : 'Your holdfast falls'}
      title={won ? 'You Win' : 'AI Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>New raid</button>}
    >
      <div className="finalsc">
        <span className="you">You · {youAlive} camps</span>
        <span className="foe">AI · {foeAlive} camps</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Radlands"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Hold the line</button>}>
      <div className="modal-body">
        <p>Each side defends <b>3 camps</b>. Destroy <b>all three</b> enemy camps to win. In front of
          every camp you can field up to <b>2 people</b> (a <i>back</i> and a <i>front</i> slot).</p>
        <p>A card is <b>protected</b> while one of your cards stands <i>in front</i> of it (closer to the
          enemy) in the same column — so a camp is shielded by any person before it, and a back person is
          shielded by a front one. <b>Damage can only hit the frontmost / unprotected enemy card</b> in a
          column (or the camp itself if that column is empty).</p>
        <p>Each turn you gain <b>Water</b> (3, plus a slow escalation as the rounds drag on). Draw a card,
          then spend water to <b>deploy people</b>, fire <b>abilities</b> — Damage, Injure, Restore, Water,
          Draw — or queue an <b>Event</b> that fires after a countdown. A person is injured by one hit and
          destroyed by the second.</p>
        <p>Newly-played people are <b>not ready</b> until your next turn. <b>Keys:</b> <kbd>N</kbd> new ·
          <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel selection.</p>
      </div>
    </Modal>
  )
}
