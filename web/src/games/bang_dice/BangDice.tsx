/* BANG! THE DICE GAME — UI. Four gunslingers sit in a circle, brawling with five dice.
   The AI plays players 1, 2 & 3 across several sub-steps per turn (roll / keep+reroll /
   resolve / end), so useAITurn re-arms on `s.step` — a monotonic counter the logic bumps
   on every state-advancing action. active = it's an AI seat's turn AND no winner. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { bangDiceAdapter } from './net'
import * as BD from './logic'
import type { BangState, Face, Player } from './logic'

const { MAX_LIFE, NUM_REROLLS } = BD

const FACE_GLYPH: Record<string, string> = {
  '1': '🔫', '2': '🎯', arrow: '🏹', dynamite: '🧨', beer: '🍺', gatling: '⚙️',
}
const FACE_LABEL: Record<string, string> = {
  '1': 'shoot 1 away', '2': 'shoot 2 away', arrow: 'take arrow',
  dynamite: 'dynamite', beer: 'heal 1', gatling: 'gatling',
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#241405" stroke="#d98c2b" strokeWidth="1.6" />
    <circle cx="24" cy="24" r="13" fill="none" stroke="#e8c07a" strokeWidth="1.4" opacity="0.6" />
    <path d="M24 11 L24 24 L33 30" stroke="#d14b2a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <circle cx="24" cy="24" r="2.4" fill="#d14b2a" />
    <circle cx="24" cy="11" r="1.8" fill="#e8c07a" />
  </svg>
)

function dieClass(d: Face, kept: boolean, idle: boolean): string {
  let c = 'bd-die face-' + String(d)
  if (kept) c += ' kept'
  if (d === 'dynamite') c += ' dynamite'
  if (idle) c += ' idle'
  return c
}

/** Seat positions around a circle (4 players): you bottom, others around. */
const SEAT_POS = [
  { className: 'seat-bottom' },
  { className: 'seat-left' },
  { className: 'seat-top' },
  { className: 'seat-right' },
]

function PlayerSeat({ p, on, you, target, pos, name }: { p: Player; on: boolean; you: boolean; target: number; pos: string; name: string }) {
  const pct = Math.max(0, (p.life / MAX_LIFE) * 100)
  return (
    <div className={
      'bd-seat ' + pos +
      (you ? ' you-seat' : '') + (on ? ' on' : '') + (p.alive ? '' : ' dead') +
      (target === 1 ? ' tgt1' : target === 2 ? ' tgt2' : '')
    }>
      <div className="bd-seat-head">
        <span className="bd-seat-name">{name}</span>
        {target === 1 && <span className="bd-tgt-badge t1">●1</span>}
        {target === 2 && <span className="bd-tgt-badge t2">●2</span>}
      </div>
      <div className="bd-life-row">
        <span className="bd-life-bar"><span className="bd-life-fill" style={{ width: `${pct}%` }} /></span>
        <span className="bd-life-n">{p.alive ? `${p.life}/${MAX_LIFE}` : 'DEAD'}</span>
      </div>
      <div className="bd-arrows" title={`${p.arrows} arrows`}>
        {p.arrows > 0 ? '🏹'.repeat(Math.min(p.arrows, 8)) : <span className="bd-no-arrow">no arrows</span>}
      </div>
    </div>
  )
}

export function BangDice() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(bangDiceAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  // Everything is seat-relative: "you" is whatever seat this client controls (0 in solo,
  // possibly 1..3 when joined online). The hook drives AI for any empty seats on the host.
  const yourTurn = s.winner == null && isMyTurn
  const yourRoll = yourTurn && s.phase === 'roll'

  function doRoll() { if (yourRoll && s.rerollsLeft > 0) dispatch({ kind: 'roll' }) }
  function doResolve() { if (yourRoll && s.rolled) dispatch({ kind: 'resolve' }) }
  function doEnd() { if (yourTurn && s.phase === 'resolved') dispatch({ kind: 'end' }) }
  function doToggle(i: number) { if (yourRoll && s.rolled) dispatch({ kind: 'hold', idx: i }) }

  // Display name for a seat: your own seat is "You"; others are "Opponent"/"Player N"
  // online (the logic's flavour names like "Slab" are solo-only), or the flavour name solo.
  function seatName(p: Player): string {
    if (p.id === mySeat) return 'You'
    if (!net.online) return p.name
    return net.seats.filter(x => x.kind === 'guest').length > 1 ? `Player ${p.id + 1}` : 'Opponent'
  }

  // Rotate the fixed circle so the local player always sits at the bottom.
  function seatPos(id: number): string {
    const rel = ((id - mySeat) % s.players.length + s.players.length) % s.players.length
    return SEAT_POS[rel].className
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (yourRoll && s.rerollsLeft > 0) { doRoll(); return true }
      }
      if (e.key === 'Enter') {
        if (yourRoll && s.rolled) { doResolve(); return true }
        if (yourTurn && s.phase === 'resolved') { doEnd(); return true }
      }
      return false
    },
  })

  const live = BD.aliveCount(s.players)

  // targeting indicators (only meaningful while a roll is showing): who would [1]/[2] hit?
  const t1 = (yourRoll && s.rolled) ? BD.targetAt(s.players, mySeat, 1) : null
  const t2 = (yourRoll && s.rolled) ? BD.targetAt(s.players, mySeat, 2) : null
  function seatTarget(id: number): number {
    if (id === t1) return 1
    if (id === t2) return 2
    return 0
  }

  let banner: string, bk = ''
  if (s.winner != null) {
    if (s.winner === mySeat) { bk = 'win'; banner = 'You win — last gunslinger standing!' }
    else { bk = 'lose'; banner = `${seatName(s.players[s.winner])} wins the shootout.` }
  } else if (yourTurn) {
    bk = 'you'
    if (!s.rolled) banner = 'Your turn — roll the dice'
    else if (s.phase === 'roll') banner = s.rerollsLeft > 0 ? 'Keep dice & reroll, or resolve' : 'Out of rerolls — resolve'
    else banner = 'Turn resolved — end turn'
  } else {
    bk = 'foe'; banner = `${seatName(s.players[s.turn])} is at the table…`
  }

  const dyn = s.dice.filter(d => d === 'dynamite').length

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="BANG! The Dice Game · western dice shootout"
        title="BANG! Dice"
        subtitle="roll five dice — shoot the seats, take arrows, drink beer, mind the dynamite"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${live} gunslingers left · arrows in pile: ${s.arrowPile}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; ↵ · resolve/end &nbsp; N · new</>}
      >
        <div className="bd-wrap">
          <div>
            <div className="bd-table">
              <div className="bd-table-center">
                <div className="bd-pile-glyph">🏹</div>
                <div className="bd-pile-n">{s.arrowPile}</div>
                <div className="bd-pile-l">arrows left</div>
              </div>
              {s.players.map(p => (
                <PlayerSeat
                  key={p.id}
                  p={p}
                  pos={seatPos(p.id)}
                  name={seatName(p)}
                  you={p.id === mySeat}
                  on={s.turn === p.id && s.winner == null}
                  target={seatTarget(p.id)}
                />
              ))}
            </div>

            <div className="bd-tray">
              <div className="bd-tray-head">
                <span className="bd-tray-l">{s.rolled ? 'your dice · click to keep' : 'press roll to begin'}</span>
                <span className={'bd-reroll' + (dyn >= 2 ? ' danger' : '')}>
                  {dyn > 0 && <span className="bd-dyn-warn">🧨 {dyn}</span>}
                  rolls left: {s.rerollsLeft}/{NUM_REROLLS}
                </span>
              </div>
              <div className="bd-dice">
                {s.dice.map((d, i) => (
                  <button
                    key={i}
                    className={dieClass(d, s.kept[i], !s.rolled)}
                    onClick={() => doToggle(i)}
                    disabled={!yourRoll || !s.rolled || d === 'dynamite'}
                    title={s.rolled ? FACE_LABEL[String(d)] : ''}
                  >
                    <span className="bd-die-glyph">{s.rolled ? FACE_GLYPH[String(d)] : '·'}</span>
                    {s.rolled && <span className="bd-die-cap">{d === 'dynamite' ? 'locked' : s.kept[i] ? 'kept' : FACE_LABEL[String(d)]}</span>}
                  </button>
                ))}
              </div>

              <div className="bd-actions">
                <button className="bd-btn" onClick={doRoll} disabled={!yourRoll || s.rerollsLeft <= 0}>
                  {s.rolled ? 'Reroll' : 'Roll'}
                </button>
                <button className="bd-btn ghost" onClick={doResolve} disabled={!yourRoll || !s.rolled}>Resolve</button>
                <button className="bd-btn" onClick={doEnd} disabled={!yourTurn || s.phase !== 'resolved'}>End Turn</button>
              </div>
            </div>
          </div>

          <div className="bd-side">
            <div className="panel">
              <OnlineBar net={net} />
            </div>
            <div className="panel">
              <div className="panel-l">Dice faces</div>
              <div className="bd-legend">
                <div className="bd-leg-row"><span className="bd-leg-ic">🔫</span> shoot the player <b>1 seat</b> away</div>
                <div className="bd-leg-row"><span className="bd-leg-ic">🎯</span> shoot the player <b>2 seats</b> away</div>
                <div className="bd-leg-row"><span className="bd-leg-ic">🏹</span> take an arrow — empties the pile → Indian attack</div>
                <div className="bd-leg-row"><span className="bd-leg-ic">🍺</span> heal <b>1</b> life (max {MAX_LIFE})</div>
                <div className="bd-leg-row"><span className="bd-leg-ic">⚙️</span> collect <b>3</b> → gatling all + drop arrows</div>
                <div className="bd-leg-row"><span className="bd-leg-ic">🧨</span> can't reroll · <b>3rd</b> ends roll + burns you</div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-l">Gunfight log</div>
              <div className="bd-logbox" ref={logRef}>
                {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
              </div>
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} mySeat={mySeat} champName={s.winner != null ? seatName(s.players[s.winner]) : ''} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, mySeat, champName, onNew }: { s: BangState; mySeat: number; champName: string; onNew: () => void }) {
  const won = s.winner === mySeat
  return (
    <Modal
      eyebrow={won ? 'Last one standing' : 'Outdrawn'}
      title={won ? 'You Win' : `${champName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>
          {won
            ? 'The dust settles and you\'re the only gunslinger left on your feet.'
            : `${champName} is the last one standing. Better luck on the next draw.`}
        </p>
        <p>
          Final life — {s.players.map(p => `${p.id === mySeat ? 'You' : p.name}: ${p.alive ? p.life : 'dead'}`).join(' · ')}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="BANG! The Dice Game" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Draw!</button>}>
      <div className="modal-body">
        <p>Four gunslingers sit in a <b>circle</b>, each with <b>{MAX_LIFE} life</b>. On your turn, roll <b>5 dice</b> up to <b>3 times</b> — click dice to <b>keep</b> them between rolls — then <b>resolve</b>.</p>
        <p><b>🔫 / 🎯:</b> shoot the player <b>1</b> or <b>2</b> seats away (clockwise, skipping the dead). <b>🏹 Arrow:</b> take one from the pile; when it <i>empties</i>, an <b>Indian attack</b> hits everyone for their arrow count, then arrows reset. <b>🍺 Beer:</b> heal 1 (capped). <b>⚙️ Gatling:</b> collect <b>3</b> to blast all others for 1 and dump your arrows.</p>
        <p><b>🧨 Dynamite</b> can <i>never</i> be re-rolled. Your <b>3rd</b> dynamite ends your rolling immediately and explodes for <b>1</b> damage.</p>
        <p><b>Win:</b> be the <b>last gunslinger standing</b>.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>Enter</kbd> resolve/end · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
