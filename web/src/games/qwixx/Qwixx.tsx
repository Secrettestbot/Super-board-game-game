/* QWIXX — UI (built for this codebase). A bright roll-and-write scorepad: four coloured
   rows per player, six pipped dice, vs a greedy heuristic AI. Only legal cells are clickable;
   the active roller gets the white-sum AND a white+colour combo, the passive player gets the
   white-sum only. The AI's whole turn (roll + crosses + end) is driven by useAITurn's tick. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as QX from './logic'
import type { QwixxState, Color, Option } from './logic'

const { COLORS, NCOLS, ROW_VALUES } = QX

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#fdf6e8" stroke="#e2d6b8" strokeWidth="1.5" />
    <rect x="8" y="9" width="32" height="6" rx="3" fill="#e4572e" />
    <rect x="8" y="18" width="32" height="6" rx="3" fill="#f2b705" />
    <rect x="8" y="27" width="32" height="6" rx="3" fill="#1f9e6e" />
    <rect x="8" y="36" width="32" height="6" rx="3" fill="#2d7dd2" />
  </svg>
)

// dice pip layouts
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

function Die({ value, color }: { value: number; color: string }) {
  const pips = PIPS[value] || []
  return (
    <div className={'qx-die ' + color}>
      <div className="qx-die-grid">
        {Array.from({ length: 9 }, (_, k) => {
          const r = (k / 3) | 0, c = k % 3
          const on = pips.some(([pr, pc]) => pr === r && pc === c)
          return <span key={k} className={'qx-pip' + (on ? ' on' : '')} />
        })}
      </div>
    </div>
  )
}

export function Qwixx() {
  const [s, setS] = useState<QwixxState>(() => QX.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(QX.makeGame()); setShowRules(false) }

  // The AI runs its WHOLE turn step-by-step while it's active; the tick re-arms the timer
  // after each step (roll -> white -> colour -> end). It also reacts as the passive player
  // when YOU are active, by taking a sensible white-sum once.
  const aiActive = !s.winner && (
    (s.active !== s.you) ||                                  // AI's own turn
    (s.active === s.you && s.phase === 'act' && needsPassiveAI(s)) // AI's white reaction to your roll
  )
  useAITurn(aiActive, () => setS(p => aiTick(p)), {
    delayMs: 520,
    tick: `${s.turnNo}-${s.active}-${s.phase}-${s.whiteTakenBy.join('')}-${s.acted.white}-${s.acted.color}`,
  })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && yourTurn && s.phase === 'roll') { setS(QX.rollDice(s)); return true }
      return false
    },
  })

  const yourTurn = !s.winner && s.active === s.you
  const youArePassive = !s.winner && s.active !== s.you && s.phase === 'act'

  // Legal options for the human player right now (active or passive).
  const myOpts = useMemo<Option[]>(() => {
    if (s.winner || s.phase !== 'act') return []
    return QX.options(s, s.you)
  }, [s])
  const optAt = (color: Color, index: number) => myOpts.find(o => o.color === color && o.index === index)

  function clickCell(color: Color, index: number) {
    const o = optAt(color, index)
    if (!o) return
    setS(QX.cross(s, s.you, color, index, o.kind))
  }
  function endTurn() { if (yourTurn && s.phase === 'act') setS(QX.endTurn(s)) }
  function passPenalty() { if (yourTurn && s.phase === 'act') setS(QX.passPenalty(s)) }
  function roll() { if (yourTurn && s.phase === 'roll') setS(QX.rollDice(s)) }

  const t0 = QX.scoreTotal(s.players[0]), t1 = QX.scoreTotal(s.players[1])

  // banner
  let banner: string, bk = ''
  if (s.winner === s.you) { bk = 'win'; banner = `You win — ${Math.max(t0, t1)} to ${Math.min(t0, t1)}` }
  else if (s.winner === (s.you === 0 ? 1 : 0)) { bk = 'lose'; banner = `The rival wins — ${Math.max(t0, t1)} to ${Math.min(t0, t1)}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${t0}–${t1}` }
  else if (yourTurn && s.phase === 'roll') { bk = 'you'; banner = 'Your roll — press Space or Roll' }
  else if (yourTurn && s.phase === 'act') { bk = 'you'; banner = myOpts.length ? 'Cross a number, or pass / take penalty' : 'No legal cross — pass / take penalty' }
  else if (youArePassive) { bk = 'foe'; banner = myOpts.length ? 'Rival rolled — you may take the white sum' : 'Rival rolled — the white sum is no use to you' }
  else { bk = 'foe'; banner = 'The rival is rolling…' }

  const white = s.dice ? s.dice[0] + s.dice[1] : null

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Qwixx · roll &amp; write"
        title="Qwixx"
        subtitle="cross numbers left-to-right in four colours — and never look back"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Turn ${s.turnNo} · ${s.locks}/2 locked`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="qx-main">
          <div className="qx-sheets">
            {s.players.map((pl, pi) => (
              <div key={pi} className={'qx-sheet' + (s.active === pi && !s.winner ? ' active' : '')}>
                <div className="qx-sheet-head">
                  <span className="qx-sheet-name">{pi === s.you ? 'You' : 'Rival'}</span>
                  {s.active === pi && !s.winner && <span className="qx-roller">rolling</span>}
                  <span className="qx-sheet-score">{QX.scoreTotal(pl)}</span>
                </div>
                {COLORS.map(c => {
                  const row = pl.rows[c]
                  return (
                    <div key={c} className={'qx-row ' + c + (row.locked ? ' locked' : '')}>
                      {ROW_VALUES[c].map((v, i) => {
                        const crossed = row.marks[i]
                        const o = pi === s.you ? optAt(c, i) : undefined
                        const end = i === NCOLS - 1
                        return (
                          <button
                            key={i}
                            className={'qx-cell' + (crossed ? ' x' : '') + (o ? ' opt ' + o.kind : '') + (end ? ' end' : '')}
                            disabled={!o}
                            onClick={() => clickCell(c, i)}
                          >
                            {end ? <Lock /> : v}
                          </button>
                        )
                      })}
                      {row.locked && <span className="qx-lockflag">locked</span>}
                    </div>
                  )
                })}
                <div className="qx-pens">
                  <span className="qx-pens-l">penalties</span>
                  {[0, 1, 2, 3].map(k => <span key={k} className={'qx-pen' + (k < pl.penalties ? ' on' : '')}>✕</span>)}
                </div>
              </div>
            ))}
          </div>

          <div className="qx-tray">
            <div className="qx-dice">
              {s.dice ? (
                <>
                  <Die value={s.dice[0]} color="white" />
                  <Die value={s.dice[1]} color="white" />
                  <Die value={s.dice[2]} color="red" />
                  <Die value={s.dice[3]} color="yellow" />
                  <Die value={s.dice[4]} color="green" />
                  <Die value={s.dice[5]} color="blue" />
                </>
              ) : (
                Array.from({ length: 6 }, (_, k) => <div key={k} className="qx-die empty" />)
              )}
            </div>
            <div className="qx-tray-info">
              {white != null
                ? <span>white sum <b>{white}</b> &nbsp;·&nbsp; white+colour combos open to the roller</span>
                : <span>roll the dice to begin the turn</span>}
            </div>
            <div className="qx-actions">
              {yourTurn && s.phase === 'roll' && <button className="qx-btn primary" onClick={roll}>Roll dice</button>}
              {yourTurn && s.phase === 'act' && <button className="qx-btn" onClick={endTurn}>End turn</button>}
              {yourTurn && s.phase === 'act' && <button className="qx-btn warn" onClick={passPenalty}>Pass / take penalty</button>}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel qx-scorebox">
            <div className={'qx-score' + (s.active === s.you && !s.winner ? ' on' : '')}>
              <span className="qx-score-name">You</span>
              <span className="qx-score-pen">{s.players[s.you].penalties} pen</span>
              <span className="qx-score-n">{t0}</span>
            </div>
            <div className={'qx-score' + (s.active !== s.you && !s.winner ? ' on' : '')}>
              <span className="qx-score-name">Rival</span>
              <span className="qx-score-pen">{s.players[s.you === 0 ? 1 : 0].penalties} pen</span>
              <span className="qx-score-n">{t1}</span>
            </div>
            <div className="qx-locks">
              {COLORS.map(c => {
                const locked = s.players.some(p => p.rows[c].locked)
                return <span key={c} className={'qx-lockdot ' + c + (locked ? ' locked' : '')} title={locked ? `${c} locked` : c} />
              })}
              <span className="qx-locks-l">{s.locks}/2 locked → game ends</span>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} t0={t0} t1={t1} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Lock() {
  return (
    <svg viewBox="0 0 16 16" className="qx-lock" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path d="M5 7 V5 a3 3 0 0 1 6 0 V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

// Does the passive AI still owe a white-sum decision while YOU are active?
function needsPassiveAI(s: QwixxState): boolean {
  const ai = (s.you === 0 ? 1 : 0) as 0 | 1
  return !s.whiteTakenBy[ai] && QX.options(s, ai).some(o => o.kind === 'white')
}

// One scheduled AI action. If it's the AI's turn, advance its turn (logic.aiStep). If YOU
// are active, let the AI take its passive white-sum reaction. Idempotent / safe to re-run.
function aiTick(s: QwixxState): QwixxState {
  if (s.winner) return s
  if (s.active !== s.you) return QX.aiStep(s)
  // you are active -> AI reacts passively
  const ai = (s.you === 0 ? 1 : 0) as 0 | 1
  return QX.passiveWhite(s, ai)
}

function ResultModal({ s, t0, t1, onNew }: { s: QwixxState; t0: number; t1: number; onNew: () => void }) {
  const won = s.winner === s.you, draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Sharpest pencil' : 'Out-scored'}
      title={draw ? 'A Tie' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {t0}</span><span className="foe">Rival {t1}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Qwixx" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Each player has four coloured rows. <b>Red</b> and <b>yellow</b> run <b>2→12</b>; <b>green</b> and <b>blue</b> run <b>12→2</b>. On a turn the active player rolls all six dice (two white + one of each colour).</p>
        <p>First, <b>both</b> players may cross the <b>sum of the two white dice</b> in any one row. Then the roller may <i>additionally</i> cross a <b>white + colour</b> sum in that colour's row.</p>
        <p>You cross numbers <b>left-to-right</b> only — never to the left of a mark, and skipped numbers are lost. The end number (the 12, or the 2) needs <b>5+ marks already</b> in the row, and crossing it <b>locks</b> that row.</p>
        <p>If the roller crosses <b>nothing</b>, they take a <b>−5 penalty</b>. The game ends at <b>two locked rows</b> or a player's <b>4th penalty</b>. Score each row by its cross-count (1, 3, 6, 10, 15, 21…), minus 5 per penalty. Highest total wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
