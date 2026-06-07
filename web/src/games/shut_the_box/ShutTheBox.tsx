/* SHUT THE BOX — UI (built for this codebase). A warm wooden box of nine number tiles and
   two pipped dice on the framework shell. You roll, then click up-tiles summing to the total
   and press Shut. Seat-relative via useGameSession(shutTheBoxAdapter): solo fills the rival
   seat with the AI, online lets a guest play seat 1. The session drives the AI for empty
   seats (it rolls and shuts several times per turn, re-arming on the adapter's tickKey). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import * as SB from './logic'
import { shutTheBoxAdapter } from './net'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="6" width="42" height="36" rx="6" fill="#7a4a25" stroke="#5a3417" strokeWidth="1.5" />
    <rect x="6" y="9" width="36" height="30" rx="4" fill="#caa06a" />
    <rect x="9" y="14" width="6" height="20" rx="1.4" fill="#f2e2c2" stroke="#9c7339" strokeWidth="0.6" />
    <rect x="18" y="14" width="6" height="20" rx="1.4" fill="#f2e2c2" stroke="#9c7339" strokeWidth="0.6" />
    <rect x="27" y="14" width="6" height="20" rx="1.4" fill="#6b4a26" />
    <rect x="36" y="14" width="6" height="20" rx="1.4" fill="#f2e2c2" stroke="#9c7339" strokeWidth="0.6" />
  </svg>
)

// dice pip layout (1..6) on a 3x3 grid
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

function Die({ v }: { v: number }) {
  if (!v) return <div className="die blank" />
  return (
    <div className="die">
      {PIPS[v].map(([r, c], i) => (
        <span key={i} className="pip" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
      ))}
    </div>
  )
}

export function ShutTheBox() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(shutTheBoxAdapter)
  const [sel, setSel] = useState<number[]>([])
  const [showRules, setShowRules] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setSel([]); setShowRules(false) }

  const yourTurn = !s.winner && isMyTurn
  const total = s.dice[0] + s.dice[1]

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel([]) },
    extra: (e) => {
      if (e.key === ' ' && yourTurn && !s.rolled) { dispatch({ kind: 'roll' }); return true }
      return false
    },
  })

  const up = SB.upNumbers(s.tiles)
  const selSum = sel.reduce((a, b) => a + b, 0)
  const selValid = s.rolled && selSum === total && sel.length > 0
  const canRollOne = SB.canRollOne(s.tiles)

  function toggleTile(n: number) {
    if (!yourTurn || !s.rolled || !s.tiles[n - 1]) return
    setSel(p => p.includes(n) ? p.filter(x => x !== n) : p.concat(n))
  }
  function doRoll(useOne = false) {
    if (!yourTurn || s.rolled) return
    setSel([]); dispatch({ kind: 'roll', useOne })
  }
  function doShut() {
    if (!selValid) return
    dispatch({ kind: 'shut', tiles: sel }); setSel([])
  }

  // hint: with a roll on the table, can the player even move?
  const noMove = yourTurn && s.rolled && !SB.hasSubset(up, total)

  // Seat-relative identity. Seat 0 = the 'you' side, seat 1 = the 'ai' side. When online we
  // address the opposite seat as "Opponent" rather than "Rival".
  const mySide: 'you' | 'ai' = mySeat === 0 ? 'you' : 'ai'
  const iWon = s.winner === mySide
  const foeLabel = net.online ? 'Opponent' : 'Rival'
  const myLabel = net.online ? `You (Player ${mySeat + 1})` : 'You'

  let banner: string, bk = ''
  if (s.winner === 'draw') { bk = ''; banner = 'A dead-even draw' }
  else if (s.winner) { bk = iWon ? 'win' : 'lose'; banner = iWon ? 'You win the box' : `The ${foeLabel.toLowerCase()} wins` }
  else if (yourTurn) {
    bk = 'you'
    if (!s.rolled) banner = 'Your turn — roll the dice'
    else if (selValid) banner = `Shut these for ${total} ✓`
    else banner = `Make ${total} — flip tiles summing to it`
  } else { bk = 'foe'; banner = `The ${foeLabel.toLowerCase()} is playing…` }

  // Scores keyed to my/opponent perspective.
  const myScore = mySeat === 0 ? s.scores.you : s.scores.ai
  const foeScore = mySeat === 0 ? s.scores.ai : s.scores.you
  const myActive = !s.winner && s.turn === mySide
  const foeActive = !s.winner && s.turn !== mySide

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Shut the Box · dice &amp; tiles"
        title="Shut the Box"
        subtitle="roll, then flip down tiles summing to the dice — get stuck and your leftovers are your score"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={myActive ? 'Your round' : foeActive ? `${foeLabel}'s round` : 'Two rounds · lower wins'}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="sb-wrap">
          <div className="sb-box">
            <div className="sb-lid">Shut the Box</div>
            <div className="sb-tiles">
              {Array.from({ length: SB.TILES }, (_, i) => i + 1).map(n => {
                const upTile = s.tiles[n - 1]
                const selected = sel.includes(n)
                const clickable = yourTurn && s.rolled && upTile
                return (
                  <button
                    key={n}
                    className={'sb-tile' + (upTile ? '' : ' down') + (selected ? ' sel' : '') + (clickable ? ' live' : '')}
                    onClick={() => toggleTile(n)}
                    disabled={!clickable}
                  >
                    <span className="sb-num">{n}</span>
                  </button>
                )
              })}
            </div>

            <div className="sb-controls">
              <div className="sb-dice">
                <Die v={s.dice[0]} />
                {!s.oneDie && <Die v={s.dice[1]} />}
              </div>
              <div className="sb-actions">
                {!s.rolled && !s.winner && (
                  <>
                    <button className="sb-btn primary" onClick={() => doRoll(false)} disabled={!yourTurn}>Roll</button>
                    {canRollOne && (
                      <button className="sb-btn" onClick={() => doRoll(true)} disabled={!yourTurn} title="7,8,9 are shut — one die allowed">One die</button>
                    )}
                  </>
                )}
                {s.rolled && (
                  <>
                    <div className={'sb-target' + (selValid ? ' ok' : selSum > total ? ' over' : '')}>
                      {selSum} / {total}
                    </div>
                    <button className="sb-btn primary" onClick={doShut} disabled={!selValid}>Shut</button>
                  </>
                )}
              </div>
              {noMove && <div className="sb-stuck">No tiles can make {total} — your round ends.</div>}
            </div>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />
          <div className="panel scoreboard">
            <div className={'sc you' + (myActive ? ' on' : '')}>
              <span className="sc-name">{myLabel}</span>
              <span className="sc-n">{myScore == null ? (myActive ? SB.upSum(s.tiles) : '—') : myScore}</span>
            </div>
            <div className={'sc ai' + (foeActive ? ' on' : '')}>
              <span className="sc-name">{foeLabel}</span>
              <span className="sc-n">{foeScore == null ? (foeActive ? SB.upSum(s.tiles) : '—') : foeScore}</span>
            </div>
            <div className="sc-note">leftover sum · lower wins</div>
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && (
        <ResultModal
          draw={s.winner === 'draw'}
          won={iWon}
          myScore={myScore ?? 0}
          foeScore={foeScore ?? 0}
          myLabel={myLabel}
          foeLabel={foeLabel}
          onNew={newGame}
        />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ draw, won, myScore, foeScore, myLabel, foeLabel, onNew }: {
  draw: boolean; won: boolean; myScore: number; foeScore: number
  myLabel: string; foeLabel: string; onNew: () => void
}) {
  return (
    <Modal
      eyebrow={draw ? 'Stalemate' : won ? 'Box well shut' : 'Out-rolled'}
      title={draw ? 'A Draw' : won ? 'You Win' : `${foeLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">{myLabel} {myScore}</span><span className="foe">{foeLabel} {foeScore}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Shut the Box" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Nine tiles, numbered <b>1–9</b>, start up. On your turn you <b>roll two dice</b>, then flip down any set of up-tiles that <b>sums exactly to the total</b> — a 7 can shut <i>7</i>, or <i>3+4</i>, or <i>1+2+4</i>.</p>
        <p>Keep rolling and shutting. Once tiles <b>7, 8 and 9</b> are all down you may roll a <b>single die</b> instead.</p>
        <p>If <b>no combination</b> can match your roll, your round ends — your <b>score is the sum of the tiles still up</b> (lower is better). Flip them all and you've <b>shut the box</b>: a perfect <b>0</b>.</p>
        <p>You and the rival each play one round from a fresh box; the <b>lower score wins</b> (ties draw).</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
