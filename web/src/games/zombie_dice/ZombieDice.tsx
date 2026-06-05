/* ZOMBIE DICE — UI (built for this codebase). A push-your-luck dice game vs a greedy
   AI on the framework shell. The AI rolls several times per turn, so useAITurn re-arms
   on a tick that changes every roll (roll/shot/brain counters). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as ZD from './logic'
import type { ZombieState, Rolled } from './logic'

const { GOAL } = ZD

const GLYPH: Record<string, string> = { brain: '🧠', shot: '💥', run: '👣' }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="10" fill="#1c2a14" stroke="#4fae3e" strokeWidth="1.5" />
    <circle cx="18" cy="20" r="4.4" fill="#a7e066" />
    <circle cx="18" cy="20" r="1.7" fill="#1c2a14" />
    <circle cx="30" cy="20" r="4.4" fill="#a7e066" />
    <circle cx="30" cy="20" r="1.7" fill="#1c2a14" />
    <path d="M16 31 q8 5 16 0" fill="none" stroke="#c64b3a" strokeWidth="2" strokeLinecap="round" />
    <path d="M20 30 v4 M24 30 v5 M28 30 v4" stroke="#c64b3a" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

function Die({ r }: { r: Rolled }) {
  return (
    <div className={'zd-die ' + r.color + (r.face === 'run' ? ' run' : '')} title={`${r.color} · ${r.face}`}>
      <span className="zd-glyph">{GLYPH[r.face]}</span>
    </div>
  )
}

export function ZombieDice() {
  const [s, setS] = useState<ZombieState>(() => ZD.makeGame())
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(ZD.makeGame()); setShowRules(false) }

  const yourTurn = !s.winner && s.turn === 'you'

  function doRoll() { if (yourTurn) setS(p => ZD.roll(p)) }
  function doStop() { if (yourTurn && s.rolling) setS(p => ZD.stop(p)) }

  // The AI rolls several times per turn; re-arm the timer every step via a changing tick.
  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => ZD.aiStep(p)),
    { delayMs: 620, tick: `${s.scores.you}-${s.scores.ai}-${s.brains}-${s.shots}-${s.rolling}` })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (!yourTurn) return false
      if (e.key === ' ' || e.key === 'Spacebar') { doRoll(); return true }
      if (e.key === 'h' || e.key === 'H') { doStop(); return true }
      return false
    },
  })

  const cup = ZD.cupCount(s.cup)
  const brainChips = Array.from({ length: s.brains })
  const shotChips = Array.from({ length: s.shots })

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = `You win — ${s.scores.you} brains devoured!` }
  else if (s.winner === 'ai') { bk = 'lose'; banner = `The rival wins — ${s.scores.ai} brains.` }
  else if (yourTurn) { bk = 'you'; banner = s.rolling ? 'Your turn — roll again or stop & bank' : 'Your turn — roll the dice' }
  else { bk = 'foe'; banner = 'The rival is rolling…' }

  const canRoll = yourTurn && !s.winner
  const canStop = yourTurn && s.rolling

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Zombie Dice · push your luck"
        title="Zombie Dice"
        subtitle="eat brains, dodge shotguns — three blasts in a turn and you lose the lot"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`First to ${GOAL} brains`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; H · stop &nbsp; N · new</>}
      >
        <div className="zd-wrap">
          <div className="zd-table">
            <div className="zd-roll-label">{s.rolling ? 'the roll' : 'the cup awaits'}</div>
            <div className={'zd-hand' + (s.hand.length ? '' : ' empty')}>
              {s.hand.length ? s.hand.map((r, i) => <Die key={i} r={r} />) : <span>press ROLL to draw three dice</span>}
            </div>

            <div className="zd-aside">
              <div className="zd-pile brains">
                <div className="zd-pile-row">
                  {brainChips.length ? brainChips.map((_, i) => <span key={i} className="zd-chip">🧠</span>) : <span className="zd-pile-empty">—</span>}
                </div>
                <div className="zd-pile-l">brains this turn · {s.brains}</div>
              </div>
              <div className="zd-pile shots">
                <div className="zd-pile-row">
                  {shotChips.length ? shotChips.map((_, i) => <span key={i} className="zd-chip">💥</span>) : <span className="zd-pile-empty">—</span>}
                </div>
                <div className="zd-pile-l">shotguns · {s.shots} / 3</div>
              </div>
            </div>

            <div className="zd-actions">
              <button className="zd-btn" onClick={doRoll} disabled={!canRoll}>{s.rolling ? 'Roll Again' : 'Roll'}</button>
              <button className="zd-btn stop" onClick={doStop} disabled={!canStop}>Stop &amp; Bank</button>
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc you' + (s.turn === 'you' && !s.winner ? ' on' : '')}>
              <span className="sc-ic">🧟</span><span className="sc-name">You</span><span className="sc-n">{s.scores.you}</span>
            </div>
            <div className={'sc ai' + (s.turn === 'ai' && !s.winner ? ' on' : '')}>
              <span className="sc-ic">🧟‍♂️</span><span className="sc-name">Rival</span><span className="sc-n">{s.scores.ai}</span>
            </div>
            <div className="sc-goal">first to {GOAL} brains wins</div>
          </div>

          <div className="panel">
            <div className="panel-l">This turn</div>
            <div className="zd-stats">
              <div className="zd-stat"><span>Brains banked if you stop</span><b>{(s.turn === 'you' && !s.winner ? s.scores.you : s.scores[s.turn ?? 'you']) + s.brains}</b></div>
              <div className="zd-stat"><span>Shotguns</span><b>{s.shots} / 3</b></div>
              <div className="zd-stat"><span>Dice left in cup</span><b>{s.cup.length} / 13</b></div>
              <div className="zd-cup">
                <span><i className="zd-swatch g" />{cup.g}</span>
                <span><i className="zd-swatch y" />{cup.y}</span>
                <span><i className="zd-swatch r" />{cup.r}</span>
              </div>
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: ZombieState; onNew: () => void }) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? 'Brains acquired' : 'Out-feasted'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {s.scores.you}</span><span className="foe">Rival {s.scores.ai}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Zombie Dice" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Feast</button>}>
      <div className="modal-body">
        <p>You are a zombie out for <b>brains</b>. Each turn you draw <b>3 dice</b> from a cup of 13 — six <b>green</b> (easy), four <b>yellow</b>, three <b>red</b> (dangerous) — and roll them.</p>
        <p>A <b>🧠 brain</b> is set aside and scored; a <b>👣 runner</b> stays in your hand to be re-rolled; a <i>💥 shotgun</i> wounds you. After a roll you may <b>roll again</b> (drawing new dice to refill your hand to three) or <b>stop</b> to <b>bank</b> the brains you've gathered.</p>
        <p>But take <i>three shotguns</i> in a single turn and you <i>bust</i> — your turn ends and you score <b>zero</b> brains. Push your luck, but know when to quit.</p>
        <p>First zombie to bank <b>{GOAL} brains</b> wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>H</kbd> stop · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
