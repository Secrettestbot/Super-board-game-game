/* CATAN DICE — UI (built for this codebase). A warm island roll-and-write: six resource dice
   with keep toggles + rolls-left, build buttons along your fixed track, a side knight track,
   and an opponent summary. Seat-relative for online play: your sheet comes from mySeat, the
   AI/opponent fills the other seat, and isMyTurn gates interaction. The AI for empty seats is
   driven by useGameSession; locally you are seat 0 and the rival is an AI exactly as before. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { catanDiceAdapter } from './net'
import * as C from './logic'
import type { CatanState, Resource, Structure } from './logic'

const RES_ICON: Record<Resource, string> = {
  wood: '🌲', brick: '🧱', wheat: '🌾', sheep: '🐑', ore: '⛏️', gold: '⭐',
}
const STRUCT_ICON: Record<C.Slot | 'city' | 'knight', string> = {
  road: '━', settlement: '🏠', city: '🏛️', knight: '🛡️',
}
const BUILD_ORDER: Structure[] = ['road', 'settlement', 'city', 'knight']

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#f7efe0" stroke="#d8c9ab" strokeWidth="1.5" />
    <polygon points="24,8 34,14 34,26 24,32 14,26 14,14" fill="#4e8c4a" />
    <polygon points="24,16 30,19.5 30,26.5 24,30 18,26.5 18,19.5" fill="#e3b94b" />
    <circle cx="24" cy="23" r="3.2" fill="#c8623c" />
  </svg>
)

function costLabel(type: Structure): string {
  const c = C.COSTS[type]
  return (Object.keys(c) as (keyof typeof c)[])
    .map(k => `${c[k]} ${k}`)
    .join(' + ')
}

function Die({ res, kept, onClick, disabled }: { res: Resource; kept: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button className={`cd-die ${res}${kept ? ' kept' : ''}`} onClick={onClick} disabled={disabled} title={`${res}${kept ? ' (kept)' : ''}`}>
      <span className="cd-die-icon">{RES_ICON[res]}</span>
      <span className="cd-die-label">{res}</span>
    </button>
  )
}

export function CatanDice() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(catanDiceAdapter)
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setShowRules(false) }

  // Seat-relative: your sheet is mySeat, the opponent is the other seat.
  const you = mySeat as C.Player
  const foe = (mySeat === 0 ? 1 : 0) as C.Player
  const foeName = net.online ? 'Opponent' : 'Rival'

  const yourTurn = s.winner == null && isMyTurn

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && yourTurn && s.phase === 'roll' && s.rollsLeft > 0) {
        dispatch({ kind: 'roll' }); return true
      }
      return false
    },
  })

  function roll() { if (yourTurn && s.phase === 'roll' && s.rollsLeft > 0) dispatch({ kind: 'roll' }) }
  function keep(i: number) { if (yourTurn && s.phase === 'roll') dispatch({ kind: 'hold', i }) }
  function stopRolling() { if (yourTurn && s.phase === 'roll' && s.dice.length > 0) dispatch({ kind: 'stop' }) }
  function doBuild(t: Structure) { if (yourTurn && s.phase === 'build') dispatch({ kind: 'build', type: t }) }
  function endTurn() { if (yourTurn && s.phase === 'build') dispatch({ kind: 'end' }) }

  const youScore = C.totalScore(s, you), foeScore = C.totalScore(s, foe)
  const p = C.pool(s.dice)

  // banner — relative to mySeat
  let banner: string, bk = ''
  if (s.winner === 'tie') { bk = ''; banner = `A tie — ${youScore}-${foeScore}` }
  else if (s.winner === you) { bk = 'win'; banner = `You win — ${youScore} to ${foeScore}` }
  else if (s.winner === foe) { bk = 'lose'; banner = `${foeName} wins — ${foeScore} to ${youScore}` }
  else if (yourTurn && s.phase === 'roll' && s.dice.length === 0) { bk = 'you'; banner = 'Your turn — press Space or Roll' }
  else if (yourTurn && s.phase === 'roll') { bk = 'you'; banner = `Keep dice, then re-roll (${s.rollsLeft} left) or build` }
  else if (yourTurn && s.phase === 'build') { bk = 'you'; banner = 'Spend resources to build — then end turn' }
  else { bk = 'foe'; banner = `${foeName} is taking their turn…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Catan Dice · roll &amp; build"
        title="Catan Dice"
        subtitle="roll resources, keep the useful ones, and settle your island"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${Math.min(s.round, C.ROUNDS)} / ${C.ROUNDS}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="cd-main">
          {/* Dice tray */}
          <div className="cd-tray">
            <div className="cd-tray-head">
              <span className="cd-tray-title">Resource Dice</span>
              <span className="cd-rolls">rolls left <b>{s.rollsLeft}</b></span>
            </div>
            <div className="cd-dice">
              {s.dice.length > 0
                ? s.dice.map((d, i) => (
                    <Die key={i} res={d} kept={s.kept[i]} onClick={() => keep(i)} disabled={!yourTurn || s.phase !== 'roll'} />
                  ))
                : Array.from({ length: C.NDICE }, (_, i) => <div key={i} className="cd-die empty" />)}
            </div>

            {s.dice.length > 0 && (
              <div className="cd-pool">
                {C.RESOURCES.filter(r => p[r] > 0).map(r => (
                  <span key={r} className={`cd-chip ${r}`}>{RES_ICON[r]} <b>{p[r]}</b> {r}</span>
                ))}
                {C.RESOURCES.every(r => p[r] === 0) && <span className="cd-chip">no resources</span>}
              </div>
            )}

            <div className="cd-actions">
              <button className="cd-btn primary" onClick={roll} disabled={!yourTurn || s.phase !== 'roll' || s.rollsLeft <= 0}>
                {s.dice.length === 0 ? 'Roll dice' : `Re-roll (${s.rollsLeft})`}
              </button>
              <button className="cd-btn" onClick={stopRolling} disabled={!yourTurn || s.phase !== 'roll' || s.dice.length === 0}>
                Stop &amp; build
              </button>
            </div>

            {/* Build buttons (only in your build phase) */}
            <div className="cd-builds">
              {BUILD_ORDER.map(t => {
                const ok = yourTurn && s.phase === 'build' && C.canBuild(s, you, t)
                return (
                  <button key={t} className={`cd-build ${t}${ok ? ' ok' : ''}`} onClick={() => doBuild(t)} disabled={!ok}>
                    <span className="cd-build-name"><span className="cd-build-dot" />{t}</span>
                    <span className="cd-build-cost">{costLabel(t)}</span>
                    <span className="cd-build-pts">
                      {t === 'settlement' ? '+1 pt' : t === 'city' ? '+2 pt (upgrade)' : t === 'knight' ? 'most knights → +2' : 'longest road → +2'}
                    </span>
                  </button>
                )
              })}
            </div>
            {yourTurn && s.phase === 'build' && (
              <div className="cd-actions">
                <button className="cd-btn" onClick={endTurn}>End turn</button>
              </div>
            )}
          </div>

          {/* Both sheets — yours first */}
          <div className="cd-sheets">
            {[you, foe].map((pl) => (
              <SheetView key={pl} s={s} player={pl} mine={pl === you} foeName={foeName} score={pl === you ? youScore : foeScore} />
            ))}
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />
          <div className="panel cd-scorebox">
            <div className="panel-l">Score</div>
            <div className={`cd-srow you${s.turn === you && s.winner == null ? ' on' : ''}`}>
              <span className="cd-srow-name">You</span>
              <span className="cd-srow-n">{youScore}</span>
            </div>
            <div className={`cd-srow foe${s.turn === foe && s.winner == null ? ' on' : ''}`}>
              <span className="cd-srow-name">{foeName}</span>
              <span className="cd-srow-n">{foeScore}</span>
            </div>
            <div className="cd-round">Round {Math.min(s.round, C.ROUNDS)} of {C.ROUNDS}</div>
            <div className="cd-costs-help">
              road = wood+brick · settlement = wood+brick+wheat+sheep<br />
              city = 2 wheat+3 ore · knight = 2 sheep+ore · gold = any 1
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} you={you} youScore={youScore} foeScore={foeScore} foeName={foeName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function SheetView({ s, player, mine, foeName, score }: { s: CatanState; player: C.Player; mine: boolean; foeName: string; score: number }) {
  const sheet = s.sheets[player]
  const bd = C.scoreSheet(s, player)
  const active = s.turn === player && s.winner == null
  // Render the track. Built slots show their structure; settlements that are upgraded show a city.
  let settlementSeen = 0
  return (
    <div className={`cd-sheet ${mine ? 'you' : 'foe'}${active ? ' active' : ''}`}>
      <div className="cd-sheet-head">
        <span className="cd-sheet-name">{mine ? 'You' : foeName}</span>
        {active && <span className="cd-sheet-turn">turn</span>}
        <span className="cd-sheet-score">{score}</span>
      </div>

      <div className="cd-track">
        {C.TRACK.map((slot, i) => {
          const built = i < sheet.trackBuilt
          const isNext = i === sheet.trackBuilt
          let kind: C.Slot | 'city' = slot
          if (slot === 'settlement' && built) {
            // Cities upgrade earliest settlements first.
            settlementSeen++
            if (settlementSeen <= sheet.cities) kind = 'city'
          }
          const icon = built ? STRUCT_ICON[kind] : slot === 'road' ? '·' : '·'
          return (
            <div key={i} className={`cd-slot ${kind}${built ? ' built' : ''}${isNext ? ' next' : ''}`} title={built ? kind : `next: ${slot}`}>
              {icon}
            </div>
          )
        })}
      </div>

      <div className="cd-knights">
        <span className="cd-knights-l">knights</span>
        {Array.from({ length: C.KNIGHT_SLOTS }, (_, k) => (
          <div key={k} className={`cd-knight${k < sheet.knights ? ' on' : ''}`}>{k < sheet.knights ? STRUCT_ICON.knight : ''}</div>
        ))}
      </div>

      <div className="cd-breakdown">
        <span>pieces <b>{bd.pieces}</b></span>
        {bd.longestRoad > 0 && <span className="bonus">long road <b>+{bd.longestRoad}</b></span>}
        {bd.knightBonus > 0 && <span className="bonus">knights <b>+{bd.knightBonus}</b></span>}
        {bd.penalty > 0 && <span className="pen">unbuilt <b>-{bd.penalty}</b></span>}
      </div>
    </div>
  )
}

function ResultModal({ s, you, youScore, foeScore, foeName, onNew }: { s: CatanState; you: C.Player; youScore: number; foeScore: number; foeName: string; onNew: () => void }) {
  const won = s.winner === you
  const tie = s.winner === 'tie'
  return (
    <Modal
      eyebrow={tie ? 'Dead even' : won ? 'Master settler' : 'Out-settled'}
      title={tie ? 'A Tie' : won ? 'You Win' : `${foeName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {youScore}</span><span className="foe">{foeName} {foeScore}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Catan Dice" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each turn, roll the <b>six resource dice</b> (wood, brick, wheat, sheep, ore, gold). <b>Keep</b> any you like by clicking them, then <b>re-roll the rest</b> up to two more times — three rolls in all.</p>
        <p>Then <b>spend</b> resources to build along your <b>fixed track</b>, in order: a road opens the next settlement spot, settlements can later be upgraded to <b>cities</b>, and <b>knights</b> are a side track. <b>Gold is wild</b> — one gold counts as any single resource.</p>
        <p><b>Costs:</b> road = wood+brick · settlement = wood+brick+wheat+sheep · city = 2 wheat+3 ore · knight = 2 sheep+ore.</p>
        <p><b>Scoring:</b> settlement <b>1</b>, city <b>2</b>; <b>+2</b> for the most roads (longest road) and <b>+2</b> for the most knights; <b>−1</b> per settlement spot left empty. After <b>{C.ROUNDS} rounds</b> the higher score wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
