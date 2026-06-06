/* DEEP SEA ADVENTURE — UI (built for this codebase). Push-your-luck dice race: three
   divers share one air tank, racing down a treasure path and back. Two AI divers each
   take MULTIPLE sub-steps per turn (choose direction → roll/move → pick up/drop/pass),
   so useAITurn re-arms on a tick that changes on every AI sub-step (a monotonic action
   counter). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as D from './logic'
import type { DeepSeaState, Tile, Diver } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#0a1a2b" stroke="#1f9bd6" strokeWidth="1.5" />
    <circle cx="18" cy="18" r="7" fill="none" stroke="#f5c542" strokeWidth="2" />
    <path d="M23 23 L33 33" stroke="#f5c542" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M9 38 q6 -4 12 0 q6 4 12 0" fill="none" stroke="#56c2f0" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <circle cx="33" cy="13" r="1.6" fill="#56c2f0" />
    <circle cx="37" cy="18" r="1.1" fill="#56c2f0" />
  </svg>
)

function diverGlyph(seat: number) {
  return seat === 0 ? 'Y' : seat === 1 ? 'N' : 'M'
}

function PathCell({ tile, idx, divers, land }: { tile: Tile; idx: number; divers: Diver[]; land: boolean }) {
  const here = divers.filter(d => !d.returned && d.pos === idx)
  const isSub = idx === 0
  const lvl = tile.level >= 0 ? tile.level : 3
  const stack = tile.stack.length > 0
  const treasure = !isSub && (stack || !D.isBlank(tile))
  return (
    <div className={'ds-cell lvl' + lvl + (isSub ? ' sub' : '') + (land ? ' land' : '')}>
      {!isSub && <div className="ds-cell-depth">{idx}</div>}
      {isSub ? (
        <div className="ds-cell-tre" title="submarine"><span className="ds-cell-val">SUB</span></div>
      ) : treasure ? (
        <div className={'ds-cell-tre' + (stack ? ' ds-cell-stack' : '')} title={stack ? `lost pile (${D.sumValues(tile.stack)})` : `treasure ${tile.value}`}>
          <span className="ds-cell-val">{stack ? D.sumValues(tile.stack) : tile.value}</span>
          <span className="ds-cell-lv">{stack ? 'L' + tile.stack.length : 'L' + tile.level}</span>
        </div>
      ) : (
        <span className="ds-cell-blank">·</span>
      )}
      <div className="ds-cell-divers">
        {here.map(d => (
          <span key={d.seat} className={'ds-diver-pin d' + d.seat} title={d.name}>{diverGlyph(d.seat)}</span>
        ))}
      </div>
    </div>
  )
}

export function DeepSeaAdventure() {
  const [s, setS] = useState<DeepSeaState>(() => D.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [acts, setActs] = useState(0) // monotonic action counter -> AI tick
  const logRef = useRef<HTMLDivElement>(null)

  function bump(fn: (p: DeepSeaState) => DeepSeaState) {
    setS(fn)
    setActs(a => a + 1)
  }

  function newGame() {
    setS(D.makeGame())
    setActs(0)
    setShowRules(false)
  }

  const over = s.phase === 'over'
  const me = s.divers[0]
  const yourTurn = !over && s.turn === 0 && !me.returned
  const canChoose = yourTurn && s.phase === 'choose' && !s.chose
  const canRoll = yourTurn && s.phase === 'choose' && s.chose
  const canAct = yourTurn && s.phase === 'rolled'
  const onTile = canAct ? s.path[me.pos] : null
  const tileHasTreasure = !!onTile && me.pos > 0 && (onTile.stack.length > 0 || !D.isBlank(onTile))
  const tileBlank = !!onTile && me.pos > 0 && D.isBlank(onTile)
  const canDrop = canAct && me.carrying.length > 0 && !!tileBlank

  function doDir(dir: D.Dir) { if (canChoose) bump(p => D.chooseDirection(p, dir)) }
  function doRoll() { if (canRoll) bump(D.move) }
  function doPickUp() { if (canAct) bump(D.pickUp) }
  function doDrop() { if (canDrop) bump(D.drop) }
  function doPass() { if (canAct) bump(D.pass) }

  // Two AIs, each taking several sub-steps per turn; re-arm the timer on every action.
  useAITurn(!over && s.turn !== 0, () => bump(D.aiStep), { delayMs: 620, tick: acts })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      const k = e.key.toLowerCase()
      if (canChoose && k === 'd') { doDir('down'); return true }
      if (canChoose && (k === 'u' || k === 'w')) { doDir('up'); return true }
      if (canRoll && (k === ' ' || k === 'spacebar' || e.key === ' ')) { doRoll(); return true }
      if (canAct && (k === 'g' || e.key === 'Enter')) { doPickUp(); return true }
      if (canDrop && k === 'x') { doDrop(); return true }
      if (canAct && k === 'p') { doPass(); return true }
      return false
    },
  })

  let banner: string, bk = ''
  if (over) {
    const won = s.winner === 0
    bk = won ? 'win' : 'lose'
    const w = s.winner ?? 1
    banner = won
      ? `You win — ${D.score(s, 0)} pts of treasure banked!`
      : `${s.divers[w].name} wins with ${D.score(s, w)} pts.`
  } else if (yourTurn) {
    bk = 'you'
    if (canChoose) banner = me.turned ? 'Heading up — roll to surface' : 'Your turn — dive deeper or turn back?'
    else if (canRoll) banner = `Roll to move ${me.direction === 'up' ? 'up' : 'down'} (load ${me.carrying.length})`
    else if (canAct) banner = tileHasTreasure ? 'Grab the treasure, or move on' : 'Drop a treasure here, or move on'
    else banner = 'Your turn'
  } else if (!over && s.divers[0].returned && s.turn === 0) {
    bk = 'you'
    banner = 'You are safely aboard — waiting on the others'
  } else {
    bk = 'foe'
    banner = `${s.divers[s.turn].name} is diving…`
  }

  const airPct = Math.max(0, Math.min(100, (s.air / D.START_AIR) * 100))
  const landIdx = canAct ? me.pos : -1

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Deep Sea Adventure · push your luck"
        title="Deep Sea Adventure"
        subtitle="one shared tank — dive for treasure, but surface before the air runs out"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} / ${D.N_ROUNDS}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>D/U · dive/up &nbsp; space · roll &nbsp; G · grab &nbsp; X · drop &nbsp; P · pass &nbsp; N · new</>}
      >
        <div className="ds-main">
          {/* Air gauge */}
          <div className="panel ds-air-panel">
            <div className="ds-air-head">
              <div className="panel-l">Shared air supply</div>
              <div className="ds-air-val"><b>{s.air}</b> / {D.START_AIR}</div>
            </div>
            <div className="ds-air-bar">
              <div className={'ds-air-fill' + (s.air <= 6 ? ' low' : '')} style={{ width: airPct + '%' }} />
            </div>
          </div>

          {/* The path */}
          <div className="panel ds-path-panel">
            <div className="panel-l">The descent · sub → abyss</div>
            <div className="ds-path">
              {s.path.map((t, i) => (
                <PathCell key={i} tile={t} idx={i} divers={s.divers} land={i === landIdx && i > 0} />
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="panel ds-controls">
            <div className="ds-ctl-head">
              <div className="panel-l">{yourTurn ? 'your move' : over ? 'game over' : `${s.divers[s.turn].name}'s dive`}</div>
              <div className="ds-dice">
                <span className={'ds-die' + (s.dice ? '' : ' empty')}>{s.dice ? s.dice[0] : '?'}</span>
                <span className={'ds-die' + (s.dice ? '' : ' empty')}>{s.dice ? s.dice[1] : '?'}</span>
              </div>
            </div>

            <div className="ds-carry">
              <div className="ds-carry-label">your treasure (held — lost if you don't surface)</div>
              <div className="ds-carry-row">
                {me.carrying.length
                  ? me.carrying.map((v, i) => <span key={i} className="ds-carry-chip">{v}</span>)
                  : <span className="ds-carry-empty">— carrying nothing —</span>}
                <span className="ds-carry-sum">pending <b>{D.sumValues(me.carrying)}</b></span>
              </div>
            </div>

            <div className="ds-actions">
              <button className="ds-btn alt" onClick={() => doDir('down')} disabled={!canChoose || me.turned}>Dive deeper ↓</button>
              <button className="ds-btn ghost" onClick={() => doDir('up')} disabled={!canChoose}>Turn back ↑</button>
              <button className="ds-btn" onClick={doRoll} disabled={!canRoll}>Roll &amp; move</button>
              <button className="ds-btn" onClick={doPickUp} disabled={!canAct || !tileHasTreasure}>Grab treasure</button>
              <button className="ds-btn ghost" onClick={doDrop} disabled={!canDrop}>Drop here</button>
              <button className="ds-btn ghost" onClick={doPass} disabled={!canAct}>Move on</button>
            </div>
          </div>
        </div>

        <div className="ds-side">
          <div className="panel ds-scores">
            {s.divers.map(d => (
              <DiverCard key={d.seat} d={d} active={!over && s.turn === d.seat} />
            ))}
            <div className="ds-goal">most banked points after 3 rounds wins</div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function DiverCard({ d, active }: { d: Diver; active: boolean }) {
  return (
    <div className={'ds-pc' + (d.seat === 0 ? ' you' : ' ai') + (active ? ' on' : '')}>
      <div className="ds-pc-head">
        <span className={'ds-pc-pin d' + d.seat}>{diverGlyph(d.seat)}</span>
        <span className="ds-pc-name">{d.name}</span>
        <span className="ds-pc-bank">{d.banked}</span>
      </div>
      <div className="ds-pc-stat">
        <span>depth {d.pos}</span>
        <span>holding {d.carrying.length}</span>
        {d.returned ? <span className="safe">aboard</span> : <span className="out">{d.direction === 'up' ? 'ascending' : 'descending'}</span>}
      </div>
    </div>
  )
}

function ResultModal({ s, onNew }: { s: DeepSeaState; onNew: () => void }) {
  const won = s.winner === 0
  const w = s.winner ?? 1
  const ranked = s.divers.slice().sort((a, b) => b.banked - a.banked)
  return (
    <Modal
      eyebrow={won ? 'Treasure secured' : 'Out-dived'}
      title={won ? 'You Win' : `${s.divers[w].name} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Dive again</button>}
    >
      <div className="ds-final">
        {ranked.map(d => (
          <span key={d.seat} className={'ds-final-row' + (d.seat === s.winner ? ' win' : '')}>
            <b>{d.name}</b> <span className="pts">{d.banked} pts</span>
          </span>
        ))}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Deep Sea Adventure" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Dive in</button>}>
      <div className="modal-body">
        <p>Three divers share <b>one air tank</b> (starts at <b>{D.START_AIR}</b>). A path of treasure tiles runs from the submarine down into the abyss — deeper tiles are worth more (<b>0–3 / 4–7 / 8–11 / 12–15</b> pts).</p>
        <p>On your turn: (1) the tank loses <b>1 air per treasure you carry</b>; (2) choose to <b>dive deeper</b> or <b>turn back</b> — once you turn back you can't turn around again this round; (3) roll <b>2 dice</b> and move their sum <b>minus your load</b> (skipping over other divers); (4) <b>grab</b> the treasure you land on, <b>drop</b> one onto a blank, or move on.</p>
        <p>When the air hits <b>0</b>, every diver not back at the sub <b>drops all their treasure</b> (it sinks to the abyss in stacks). Divers safely aboard <b>bank</b> their haul.</p>
        <p>Air refills, the empty deep tiles are trimmed, and you play <b>3 rounds</b> total. Most banked points wins — but a heavy load slows you and burns air fast, so know when to surface.</p>
        <p><b>Keys:</b> <kbd>D</kbd> dive · <kbd>U</kbd> turn back · <kbd>Space</kbd> roll · <kbd>G</kbd> grab · <kbd>X</kbd> drop · <kbd>P</kbd> move on · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
