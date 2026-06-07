/* PICKOMINO / HECKMECK — UI (built for this codebase). Push-your-luck worm-roasting
   dice on the framework shell. Online-capable via useGameSession: the host runs the real
   logic and AI fills any empty seat; the view is seat-relative so a guest can play seat 1
   or 2. Each turn is MANY sub-steps (roll, set aside, roll, … stop), and the active seat
   keeps rolling/keeping until it claims a tile or busts — the hook re-arms the AI on a
   tickKey that changes on every action. Seats: 0 = You, 1/2 = the rivals. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { pickominoAdapter } from './net'
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
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(pickominoAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() {
    netNew()
    setShowRules(false)
  }

  const over = s.phase === 'over'
  const yourTurn = !over && isMyTurn
  // The seat currently rolling (may be you, an AI, or a remote opponent).
  const activeSeat = over ? mySeat : s.turn
  const avail = yourTurn ? P.availableValues(s) : []
  const sum = P.sumOf(s.aside)
  const canStopNow = yourTurn && P.canStop(s)
  const canRoll = yourTurn && !s.hasRolled && s.aside.length < P.N_DICE

  // Name a non-you seat relative to whether we're online.
  function seatLabel(seat: number): string {
    if (seat === mySeat) return 'You'
    return net.online ? 'Opponent' : s.players[seat]?.name ?? `Player ${seat + 1}`
  }

  function doRoll() { if (canRoll) dispatch({ kind: 'roll' }) }
  function doStop() { if (yourTurn && !s.hasRolled && canStopNow) dispatch({ kind: 'stop' }) }
  function doSetAside(v: Face) { if (yourTurn && s.hasRolled && avail.includes(v)) dispatch({ kind: 'keep', face: v }) }

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
    const won = s.winner === mySeat
    bk = won ? 'win' : 'lose'
    banner = won
      ? `You win — ${P.playerWorms(s.players[mySeat])} worms roasted!`
      : `${seatLabel(s.winner ?? 0)} wins with ${P.playerWorms(s.players[s.winner ?? 0])} worms.`
  } else if (yourTurn) {
    bk = 'you'
    if (!s.hasRolled && s.aside.length === 0) banner = 'Your turn — roll the worm dice'
    else if (s.hasRolled) banner = 'Pick a value to set aside'
    else if (canStopNow) banner = `Roll again, or stop to grab a tile (sum ${sum})`
    else banner = `Roll again — need ${P.MIN_SUM}+${P.hasWorm(s.aside) ? '' : ' and a 🐛'} (sum ${sum})`
  } else {
    bk = 'foe'
    banner = `${seatLabel(activeSeat)} is rolling…`
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
              <div className="panel-l">{yourTurn ? 'your dice' : `${seatLabel(activeSeat)}'s dice`}</div>
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
              <button className="pk-btn stop" onClick={doStop} disabled={!yourTurn || s.hasRolled || !canStopNow}>
                Stop &amp; Take
                {canStopNow && (steal ? ` ${seatLabel(steal.seat)}'s ${sum}` : reachTile ? ` ${reachTile.n}` : '')}
              </button>
            </div>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />

          <div className="panel pk-scores">
            {s.players.map(p => (
              <PlayerCard
                key={p.seat}
                p={p}
                you={p.seat === mySeat}
                label={seatLabel(p.seat)}
                active={!over && s.turn === p.seat}
                worms={P.playerWorms(p)}
              />
            ))}
            <div className="pk-goal">most worms when the grill empties wins</div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && <ResultModal s={s} mySeat={mySeat} seatLabel={seatLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerCard({ p, you, label, active, worms }: { p: PlayerState; you: boolean; label: string; active: boolean; worms: number }) {
  const top = P.topTile(p)
  return (
    <div className={'pk-pc' + (you ? ' you' : ' ai') + (active ? ' on' : '')}>
      <div className="pk-pc-head">
        <span className="pk-pc-ic">{you ? '🍖' : p.seat === 1 ? '🐔' : '🐦'}</span>
        <span className="pk-pc-name">{label}</span>
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

function ResultModal({ s, mySeat, seatLabel, onNew }: { s: PickominoState; mySeat: number; seatLabel: (seat: number) => string; onNew: () => void }) {
  const won = s.winner === mySeat
  return (
    <Modal
      eyebrow={won ? 'Worms roasted' : 'Out-foraged'}
      title={won ? 'You Win' : `${seatLabel(s.winner ?? 0)} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="pk-final">
        {s.players.map(p => (
          <span key={p.seat} className={'pk-final-row' + (p.seat === s.winner ? ' win' : '')}>
            <b>{seatLabel(p.seat)}</b> {P.playerWorms(p)} 🐛 · {p.stack.length} tiles
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
