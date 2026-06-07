/* QWIXX — UI (built for this codebase). A bright roll-and-write scorepad: four coloured
   rows per player, six pipped dice. Solo vs a greedy heuristic AI, or online host/guest via
   useGameSession. Seat-relative: your own sheet comes from `mySeat`, marking is gated by
   `isMyTurn`, and banners/score/result are all stated from your seat's point of view. Only
   legal cells are clickable; the active roller gets the white-sum AND a white+colour combo,
   the passive player gets the white-sum only. The hook drives any AI / empty seat. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { qwixxAdapter } from './net'
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
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(qwixxAdapter)
  const [showRules, setShowRules] = useState(false)

  const me = mySeat as 0 | 1
  const foe = (me === 0 ? 1 : 0) as 0 | 1
  const over = s.winner != null

  // What to call the other player on this screen.
  const oppName = net.online ? `Player ${foe + 1}` : 'Rival'

  function newGame() { netNew(); setShowRules(false) }

  function roll() { if (isMyTurn && s.phase === 'roll' && s.active === me) dispatch({ kind: 'roll' }) }
  function endTurn() { if (isMyTurn && s.phase === 'act' && s.active === me) dispatch({ kind: 'pass' }) }
  function passWindow() { if (isMyTurn && s.phase === 'act') dispatch({ kind: 'pass' }) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && isMyTurn && s.phase === 'roll' && s.active === me) { roll(); return true }
      return false
    },
  })

  // My role this turn, from MY seat (active roller vs passive reactor).
  const iAmActive = !over && s.active === me
  const iAmPassive = !over && s.active !== me && s.phase === 'act'

  // Legal options for ME right now (active or passive), only when it's my turn to act.
  const myOpts = useMemo<Option[]>(() => {
    if (over || s.phase !== 'act' || !isMyTurn) return []
    return QX.options(s, me)
  }, [s, me, isMyTurn, over])
  const optAt = (color: Color, index: number) => myOpts.find(o => o.color === color && o.index === index)

  function clickCell(color: Color, index: number) {
    if (!isMyTurn) return
    const o = optAt(color, index)
    if (!o) return
    dispatch({ kind: 'mark', color, index })
  }

  const myTotal = QX.scoreTotal(s.players[me]), foeTotal = QX.scoreTotal(s.players[foe])

  // banner — stated from MY seat
  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = `You win — ${Math.max(myTotal, foeTotal)} to ${Math.min(myTotal, foeTotal)}` }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppName} wins — ${Math.max(myTotal, foeTotal)} to ${Math.min(myTotal, foeTotal)}` }
  else if (s.winner === 'draw') { bk = ''; banner = `A tie — ${myTotal}–${foeTotal}` }
  else if (iAmActive && s.phase === 'roll') { bk = 'you'; banner = 'Your roll — press Space or Roll' }
  else if (iAmActive && s.phase === 'act' && isMyTurn) { bk = 'you'; banner = myOpts.length ? 'Cross a number, or pass / take penalty' : 'No legal cross — pass / take penalty' }
  else if (iAmActive && s.phase === 'act') { bk = 'you'; banner = `Waiting for ${oppName} to react…` }
  else if (iAmPassive && isMyTurn) { bk = 'foe'; banner = myOpts.length ? `${oppName} rolled — you may take the white sum` : `${oppName} rolled — the white sum is no use to you` }
  else { bk = 'foe'; banner = `${oppName} is taking their turn…` }

  const white = s.dice ? s.dice[0] + s.dice[1] : null

  // Render order: my sheet first (left/top), opponent second.
  const sheetOrder: (0 | 1)[] = me === 0 ? [0, 1] : [1, 0]

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
            {sheetOrder.map(pi => {
              const pl = s.players[pi]
              const mine = pi === me
              return (
                <div key={pi} className={'qx-sheet' + (s.active === pi && !over ? ' active' : '')}>
                  <div className="qx-sheet-head">
                    <span className="qx-sheet-name">{mine ? 'You' : oppName}</span>
                    {s.active === pi && !over && <span className="qx-roller">rolling</span>}
                    <span className="qx-sheet-score">{QX.scoreTotal(pl)}</span>
                  </div>
                  {COLORS.map(c => {
                    const row = pl.rows[c]
                    return (
                      <div key={c} className={'qx-row ' + c + (row.locked ? ' locked' : '')}>
                        {ROW_VALUES[c].map((v, i) => {
                          const crossed = row.marks[i]
                          const o = mine ? optAt(c, i) : undefined
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
              )
            })}
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
              {iAmActive && s.phase === 'roll' && isMyTurn && <button className="qx-btn primary" onClick={roll}>Roll dice</button>}
              {iAmActive && s.phase === 'act' && isMyTurn && <button className="qx-btn" onClick={endTurn}>End turn</button>}
              {iAmActive && s.phase === 'act' && isMyTurn && <button className="qx-btn warn" onClick={endTurn}>Pass / take penalty</button>}
              {iAmPassive && isMyTurn && <button className="qx-btn" onClick={passWindow}>Skip white sum</button>}
            </div>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />
          <div className="panel qx-scorebox">
            <div className={'qx-score' + (s.active === me && !over ? ' on' : '')}>
              <span className="qx-score-name">You</span>
              <span className="qx-score-pen">{s.players[me].penalties} pen</span>
              <span className="qx-score-n">{myTotal}</span>
            </div>
            <div className={'qx-score' + (s.active === foe && !over ? ' on' : '')}>
              <span className="qx-score-name">{oppName}</span>
              <span className="qx-score-pen">{s.players[foe].penalties} pen</span>
              <span className="qx-score-n">{foeTotal}</span>
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

      {over && <ResultModal s={s} me={me} oppName={oppName} myTotal={myTotal} foeTotal={foeTotal} onNew={newGame} />}
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

function ResultModal({ s, me, oppName, myTotal, foeTotal, onNew }: {
  s: QwixxState; me: 0 | 1; oppName: string; myTotal: number; foeTotal: number; onNew: () => void
}) {
  const won = s.winner === me, draw = s.winner === 'draw'
  return (
    <Modal
      eyebrow={draw ? 'Dead even' : won ? 'Sharpest pencil' : 'Out-scored'}
      title={draw ? 'A Tie' : won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myTotal}</span><span className="foe">{oppName} {foeTotal}</span></div>
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
