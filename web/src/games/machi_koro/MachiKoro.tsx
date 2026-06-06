/* MACHI KORO — UI. Build a town by rolling dice, earning color-coded income, and raising
   four landmarks. Solo: you (player 0) play two greedy AIs. Online: useGameSession runs
   the real logic on the host, the AI fills empty seats, and each decision is sent as an
   intent (roll / reroll / income / buy / pass). The view is seat-relative: "you" is the
   local mySeat, and banners / panels / result are all from that seat's perspective. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { machiKoroAdapter } from './net'
import * as MK from './logic'
import type { State, Player, CardDef, Color } from './logic'

const { CARDS, LANDMARKS } = MK

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="11" fill="#2b4259" stroke="#ffcf5c" strokeWidth="1.5" />
    <rect x="11" y="22" width="9" height="15" rx="1.5" fill="#4aa3e0" />
    <rect x="20" y="15" width="9" height="22" rx="1.5" fill="#5fc77f" />
    <rect x="29" y="19" width="8" height="18" rx="1.5" fill="#ef6f5e" />
    <path d="M11 22 L15.5 17 L20 22 Z" fill="#ffcf5c" />
    <path d="M20 15 L24.5 10 L29 15 Z" fill="#ffcf5c" />
    <circle cx="33" cy="14" r="3.4" fill="#ffcf5c" stroke="#c9920f" strokeWidth="1" />
  </svg>
)

const COLOR_ORDER: Color[] = ['blue', 'green', 'red', 'purple']

function rollsLabel(c: CardDef): string {
  if (c.rolls.length === 1) return String(c.rolls[0])
  const a = c.rolls[0], b = c.rolls[c.rolls.length - 1]
  return b - a === c.rolls.length - 1 ? `${a}–${b}` : c.rolls.join(',')
}

export function MachiKoro() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(machiKoroAdapter)
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setShowRules(false) }

  const you = s.players[mySeat]
  const yourTurn = s.winner == null && isMyTurn
  const canRoll = yourTurn && s.phase === 'roll'
  const canTwo = canRoll && you.landmarks.train
  // reroll is only legal right after a roll, before income is applied, with a Radio Tower
  const canReroll = yourTurn && s.phase === 'build' && !s.incomeDone && !s.rerolled && you.landmarks.radio
  const inBuild = yourTurn && s.phase === 'build' && s.incomeDone

  function roll(count: number) { if (canRoll) dispatch({ kind: 'roll', n: count }) }
  function reroll(count: number) { if (canReroll) dispatch({ kind: 'reroll', n: count }) }
  function takeIncome() { if (yourTurn && s.phase === 'build' && !s.incomeDone) dispatch({ kind: 'income' }) }
  function buyId(id: string) { if (inBuild) dispatch({ kind: 'buy', card: id }) }
  function pass() { if (inBuild) dispatch({ kind: 'pass' }) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (canRoll) { roll(1); return true }
        return false
      }
      if ((e.key === 'd' || e.key === 'D') && canTwo) { roll(2); return true }
      if ((e.key === 'p' || e.key === 'P') && inBuild) { pass(); return true }
      return false
    },
  })

  const oppName = (id: number): string => (net.online ? `Player ${id + 1}` : s.players[id].name)
  const activeName = (): string => (s.turn === mySeat ? 'You' : oppName(s.turn))

  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = 'You completed all four landmarks — your town wins!' }
  else if (s.winner != null) { bk = 'lose'; banner = `${oppName(s.winner)} raised every landmark first — you lose.` }
  else if (yourTurn) {
    bk = 'you'
    if (s.phase === 'roll') banner = you.landmarks.train ? 'Your turn — roll 1 or 2 dice' : 'Your turn — roll the die'
    else if (!s.incomeDone) banner = `Rolled ${s.roll} — re-roll with the Radio Tower, or take income`
    else banner = `Rolled ${s.roll} — build one thing, or pass`
  } else { bk = 'foe'; banner = `${activeName()} is taking their turn…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Machi Koro · dice city-building"
        title="Machi Koro"
        subtitle="roll for coins, buy income engines, and raise all four landmarks before your rivals"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Landmarks · You {MK.landmarksBuilt(you)}/4</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; D · 2 dice &nbsp; P · pass &nbsp; N · new</>}
      >
        <div className="mk-main">
          <div className="mk-control">
            <div className="mk-dice">
              {s.dice.length
                ? s.dice.map((d, i) => <div key={i} className="mk-die">{d}</div>)
                : [<div key="e" className="mk-die empty">?</div>]}
            </div>
            <div className="mk-roll-sum">{s.dice.length ? s.roll : '—'}<small>roll total</small></div>

            <div className="mk-btns">
              <button className="mk-btn" onClick={() => roll(1)} disabled={!canRoll}>Roll 1</button>
              <button className="mk-btn ghost" onClick={() => roll(2)} disabled={!canTwo}>Roll 2</button>
              {canReroll && <button className="mk-btn ghost" onClick={() => reroll(s.dice.length)}>Re-roll 📡</button>}
              {canReroll && <button className="mk-btn" onClick={takeIncome}>Take income</button>}
              <button className="mk-btn ghost" onClick={pass} disabled={!inBuild}>Pass</button>
            </div>
          </div>

          <div className="panel" style={{ background: 'transparent', border: 'none', padding: 0 }}>
            <div className="mk-supply-l">Supply — buy one establishment on your build step</div>
            <div className="mk-supply">
              {COLOR_ORDER.flatMap(col => CARDS.filter(c => c.color === col)).map(c => {
                const stock = s.supply[c.id] ?? 0
                const buyable = inBuild && stock > 0 && you.coins >= c.cost
                return (
                  <button
                    key={c.id}
                    className={`mk-card ${c.color} ${buyable ? 'buyable' : 'locked'}`}
                    onClick={() => buyable && buyId(c.id)}
                    disabled={!buyable}
                    title={c.desc}
                  >
                    <div className="mk-card-top">
                      <span className="mk-card-glyph">{c.short}</span>
                      <span className="mk-card-name">{c.name}</span>
                      <span className="mk-card-rolls">{rollsLabel(c)}</span>
                    </div>
                    <div className="mk-card-desc">{c.desc}</div>
                    <div className="mk-card-foot">
                      <span className="mk-card-cost">{c.cost}</span>
                      <span className="mk-card-stock">×{stock} left</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>

          {s.players.map(p => (
            <PlayerCard
              key={p.id}
              p={p}
              name={p.id === mySeat ? 'You' : oppName(p.id)}
              active={s.turn === p.id && s.winner == null}
              you={p.id === mySeat}
              canBuildLm={p.id === mySeat && inBuild}
              coins={p.coins}
              onBuyLm={(id) => buyId(id)}
            />
          ))}

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} mySeat={mySeat} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerCard({
  p, name, active, you, canBuildLm, coins, onBuyLm,
}: {
  p: Player; name: string; active: boolean; you: boolean; canBuildLm: boolean; coins: number; onBuyLm: (id: string) => void
}) {
  const owned = CARDS
    .map(c => ({ c, n: p.est[c.id] ?? 0 }))
    .filter(x => x.n > 0)
  return (
    <div className={`mk-player ${you ? 'you-p' : ''} ${active ? 'active' : ''}`}>
      <div className="mk-p-head">
        <span className={'mk-p-name ' + (you ? 'you' : 'foe')}>{name}</span>
        <span className="mk-p-coins">{p.coins}</span>
      </div>

      <div className="mk-marks">
        {LANDMARKS.map(l => (
          <div key={l.id} className={'mk-mark ' + (p.landmarks[l.id] ? 'built' : '')} title={`${l.name} — ${l.desc}`}>
            <span>{l.short}</span>
            <small>{l.name.split(' ')[0]}</small>
          </div>
        ))}
      </div>

      <div className="mk-est">
        {owned.length
          ? owned.map(({ c, n }) => (
              <span key={c.id} className={'mk-est-chip ' + c.color} title={c.name}>
                {c.short}<span className="mk-est-x">×{n}</span>
              </span>
            ))
          : <span className="mk-est-empty">no establishments yet</span>}
      </div>

      {you && (
        <>
          <div className="mk-landmark-l">Build a landmark</div>
          <div className="mk-lm-buy">
            {LANDMARKS.map(l => {
              const built = p.landmarks[l.id]
              const canBuy = canBuildLm && !built && coins >= l.cost
              return (
                <button
                  key={l.id}
                  className={'mk-lm-btn' + (built ? ' done' : '')}
                  disabled={built || !canBuy}
                  onClick={() => canBuy && onBuyLm(l.id)}
                  title={l.desc}
                >
                  <span>{l.short}</span>
                  <span>{l.name.split(' ')[0]}</span>
                  <b>{built ? '✓' : l.cost}</b>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function ResultModal({ s, mySeat, oppName, onNew }: { s: State; mySeat: number; oppName: (id: number) => string; onNew: () => void }) {
  const won = s.winner === mySeat
  return (
    <Modal
      eyebrow={won ? 'Boomtown' : 'Out-built'}
      title={won ? 'You Win' : `${s.winner != null ? oppName(s.winner) : ''} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'Every landmark in your town is built — the railway hums, the mall buzzes, the park spins. A thriving little city!'
          : 'A rival finished all four landmarks first. Build your income engine faster next time.'}</p>
      </div>
      <div className="finalsc">
        {s.players.map(p => (
          <span key={p.id} className={p.id === mySeat ? 'you' : 'foe'}>{p.id === mySeat ? 'You' : oppName(p.id)} {MK.landmarksBuilt(p)}/4</span>
        ))}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Machi Koro" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Build!</button>}>
      <div className="modal-body">
        <p>You start with <b>3 coins</b>, a <b>Wheat Field</b> and a <b>Bakery</b>, and four unbuilt <b>landmarks</b>. On your turn: <b>roll</b> a die (or two once your Train Station is built), <b>earn</b> income from triggered cards, then <b>build</b> one establishment or landmark — or pass.</p>
        <p>Cards activate by their number and color:</p>
        <p><b style={{ color: 'var(--blue-hi)' }}>Blue</b> (primary) fires on <i>anyone's</i> roll — paid by the bank. <b style={{ color: 'var(--green-hi)' }}>Green</b> (secondary) fires only on <i>your own</i> roll. <b style={{ color: 'var(--red-hi)' }}>Red</b> (restaurants) fires on <i>another</i> player's roll — that roller pays you. <b style={{ color: 'var(--purple-hi)' }}>Purple</b> (major) fires on your roll and steals from opponents.</p>
        <p>Landmarks: <b>Train Station</b> lets you roll 2 dice · <b>Shopping Mall</b> adds +1 to each green/red yield · <b>Amusement Park</b> grants an extra turn on doubles · <b>Radio Tower</b> lets you re-roll once.</p>
        <p>First to build <b>all four landmarks</b> wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>D</kbd> roll 2 · <kbd>P</kbd> pass · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
