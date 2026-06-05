/* PICKOMINO / HECKMECK — UI (built for this codebase). Push-your-luck worm-roasting
   dice vs two greedy AIs on the framework shell. Each AI takes MANY sub-steps per turn
   (roll, set aside, roll, … stop), and there are two of them — so useAITurn re-arms on a
   tick that changes on every AI sub-step (a monotonic action counter). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as P from './logic'
import type { PickominoState, Face, Tile, PlayerState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#3a1d10" stroke="#e0892f" strokeWidth="1.5" />
    <rect x="11" y="11" width="11" height="11" rx="3" fill="#f4e7c8" />
    <circle cx="16.5" cy="16.5" r="2" fill="#3a1d10" />
    <rect x="26" y="26" width="11" height="11" rx="3" fill="#f4e7c8" />
    <path d="M28 34 q3.5 -5 7 0" fill="none" stroke="#c0563a" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 30 q4 6 9 3 q5 -3 9 1" fill="none" stroke="#e0892f" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

function faceGlyph(f: Face) {
  return f === P.WORM ? '🐛' : String(f)
}

function DieFace({ f, aside, pick, onClick }: { f: Face; aside?: boolean; pick?: boolean; onClick?: () => void }) {
  return (
    <button
      className={'pk-die' + (f === P.WORM ? ' worm' : '') + (aside ? ' aside' : '') + (pick ? ' pick' : '')}
      onClick={onClick}
      disabled={!onClick}
      title={f === P.WORM ? 'worm (counts as 5)' : `value ${f}`}
    >
      <span className="pk-die-face">{faceGlyph(f)}</span>
    </button>
  )
}

function TileChip({ t, dim, hot }: { t: Tile; dim?: boolean; hot?: boolean }) {
  return (
    <div className={'pk-tile w' + t.worms + (dim ? ' dim' : '') + (hot ? ' hot' : '')} title={`tile ${t.n} · ${t.worms} worm${t.worms === 1 ? '' : 's'}`}>
      <span className="pk-tile-n">{t.n}</span>
      <span className="pk-tile-worms">{'🐛'.repeat(t.worms)}</span>
    </div>
  )
}

export function Pickomino() {
  const [s, setS] = useState<PickominoState>(() => P.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [acts, setActs] = useState(0) // monotonic action counter -> AI tick
  const logRef = useRef<HTMLDivElement>(null)

  function bump(fn: (p: PickominoState) => PickominoState) {
    setS(fn)
    setActs(a => a + 1)
  }

  function newGame() {
    setS(P.makeGame())
    setActs(0)
    setShowRules(false)
  }

  const over = s.phase === 'over'
  const yourTurn = !over && s.turn === 0
  const avail = yourTurn ? P.availableValues(s) : []
  const sum = P.sumOf(s.aside)
  const canStopNow = yourTurn && P.canStop(s)
  const canRoll = yourTurn && !s.hasRolled && s.aside.length < P.N_DICE

  function doRoll() { if (canRoll) bump(P.rollDice) }
  function doStop() { if (yourTurn && (P.canStop(s) || s.aside.length > 0)) bump(P.stop) }
  function doSetAside(v: Face) { if (yourTurn && s.hasRolled && avail.includes(v)) bump(p => P.setAside(p, v)) }

  // Two AIs, each taking many sub-steps; re-arm the timer on every action via the counter.
  useAITurn(!over && s.turn !== 0, () => bump(P.aiStep), { delayMs: 560, tick: acts })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === ' ' || e.key === 'Spacebar') { doRoll(); return true }
      if (e.key === 's' || e.key === 'S') { doStop(); return true }
      const num = Number(e.key)
      if (num >= 1 && num <= 5) { doSetAside(num as Face); return true }
      if (e.key === 'w' || e.key === 'W') { doSetAside(P.WORM); return true }
      return false
    },
  })

  let banner: string, bk = ''
  if (over) {
    const won = s.winner === 0
    bk = won ? 'win' : 'lose'
    banner = won
      ? `You win — ${P.playerWorms(s.players[0])} worms roasted!`
      : `${s.players[s.winner ?? 1].name} wins with ${P.playerWorms(s.players[s.winner ?? 1])} worms.`
  } else if (yourTurn) {
    bk = 'you'
    if (!s.hasRolled && s.aside.length === 0) banner = 'Your turn — roll the worm dice'
    else if (s.hasRolled) banner = 'Pick a value to set aside'
    else if (canStopNow) banner = `Roll again, or stop to grab a tile (sum ${sum})`
    else banner = `Roll again — need ${P.MIN_SUM}+${P.hasWorm(s.aside) ? '' : ' and a 🐛'} (sum ${sum})`
  } else {
    bk = 'foe'
    banner = `${s.players[s.turn].name} is rolling…`
  }

  const reachTile = P.takeableRowTile(s.row, sum)
  const steal = P.stealTarget(s, sum)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Pickomino · push your luck"
        title="Pickomino"
        subtitle="grab fat worm tiles — but bust and you cough one back up off the grill"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${s.row.length} tiles on the grill`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; 1-5/W · set aside &nbsp; S · stop &nbsp; N · new</>}
      >
        <div className="pk-main">
          {/* Tile row */}
          <div className="panel pk-row-panel">
            <div className="panel-l">The grill · tiles 21–36</div>
            <div className="pk-row">
              {s.row.length
                ? s.row.map(t => (
                    <TileChip key={t.n} t={t} hot={yourTurn && canStopNow && reachTile?.n === t.n} />
                  ))
                : <span className="pk-empty">the grill is bare — game over</span>}
            </div>
          </div>

          {/* Dice table */}
          <div className="panel pk-table">
            <div className="pk-table-head">
              <div className="panel-l">{yourTurn ? 'your dice' : `${s.players[s.turn === -1 ? 0 : s.turn].name}'s dice`}</div>
              <div className="pk-sum">
                sum <b>{sum}</b>{P.hasWorm(s.aside) ? <span className="pk-worm-ok"> · 🐛 locked</span> : <span className="pk-worm-no"> · no 🐛 yet</span>}
              </div>
            </div>

            <div className="pk-roll-area">
              <div className="pk-roll-label">the roll</div>
              <div className={'pk-roll' + (s.roll.length ? '' : ' empty')}>
                {s.roll.length
                  ? s.roll.map((f, i) => {
                      const pickable = yourTurn && s.hasRolled && avail.includes(f)
                      return <DieFace key={i} f={f} pick={pickable} onClick={pickable ? () => doSetAside(f) : undefined} />
                    })
                  : <span className="pk-hint">{s.aside.length >= P.N_DICE ? 'all dice set aside' : 'press ROLL'}</span>}
              </div>
            </div>

            <div className="pk-aside-area">
              <div className="pk-roll-label">set aside this turn</div>
              <div className={'pk-aside' + (s.aside.length ? '' : ' empty')}>
                {s.aside.length
                  ? s.aside.map((f, i) => <DieFace key={i} f={f} aside />)
                  : <span className="pk-hint">— none —</span>}
              </div>
            </div>

            <div className="pk-actions">
              <button className="pk-btn" onClick={doRoll} disabled={!canRoll}>
                {s.aside.length === 0 ? 'Roll 8 Dice' : 'Roll Again'}
              </button>
              <button className="pk-btn stop" onClick={doStop} disabled={!yourTurn || !canStopNow}>
                Stop &amp; Take
                {canStopNow && (steal ? ` ${steal.name}'s ${sum}` : reachTile ? ` ${reachTile.n}` : '')}
              </button>
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel pk-scores">
            {s.players.map(p => (
              <PlayerCard key={p.seat} p={p} active={!over && s.turn === p.seat} worms={P.playerWorms(p)} />
            ))}
            <div className="pk-goal">most worms when the grill empties wins</div>
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

function PlayerCard({ p, active, worms }: { p: PlayerState; active: boolean; worms: number }) {
  const top = P.topTile(p)
  return (
    <div className={'pk-pc' + (p.seat === 0 ? ' you' : ' ai') + (active ? ' on' : '')}>
      <div className="pk-pc-head">
        <span className="pk-pc-ic">{p.seat === 0 ? '🍖' : p.seat === 1 ? '🐔' : '🐦'}</span>
        <span className="pk-pc-name">{p.name}</span>
        <span className="pk-pc-w">{worms} 🐛</span>
      </div>
      <div className="pk-pc-stack">
        {p.stack.length
          ? p.stack.map((t, i) => <TileChip key={t.n} t={t} dim={i !== p.stack.length - 1} />)
          : <span className="pk-pc-empty">no tiles yet</span>}
      </div>
      {top && <div className="pk-pc-top">top: {top.n} (steal on exact)</div>}
    </div>
  )
}

function ResultModal({ s, onNew }: { s: PickominoState; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Worms roasted' : 'Out-foraged'}
      title={won ? 'You Win' : `${s.players[s.winner ?? 1].name} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="pk-final">
        {s.players.map(p => (
          <span key={p.seat} className={'pk-final-row' + (p.seat === s.winner ? ' win' : '')}>
            <b>{p.name}</b> {P.playerWorms(p)} 🐛 · {p.stack.length} tiles
          </span>
        ))}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Pickomino" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Grill on</button>}>
      <div className="modal-body">
        <p>Tiles <b>21–36</b> sit on the grill, each worth <b>worms</b> (21–24 → 1, 25–28 → 2, 29–32 → 3, 33–36 → 4). Roll <b>8 dice</b> with faces 1–5 and a <b>🐛 worm</b> (the worm counts as <b>5</b> when summing).</p>
        <p>Each roll, pick <b>one value</b> showing and set aside <b>every</b> die of that value — but you can't pick a value you've already set aside this turn. Re-roll the rest and repeat.</p>
        <p><b>Stop</b> once your set-aside dice sum to <b>≥ 21</b> and include at least one <b>🐛</b>: take the highest tile ≤ your sum, or <b>steal</b> the top tile of a rival whose number exactly equals your sum.</p>
        <p><i>Bust</i> if you can't set aside a new value, stop without a worm or below 21, or can take no tile. On a bust you return your top tile and the grill's <b>highest</b> tile is flipped out of play.</p>
        <p>When the grill empties, the player with the <b>most worms</b> wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>1–5</kbd>/<kbd>W</kbd> set aside · <kbd>S</kbd> stop · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
