/* AZUL — UI (built for this codebase). Five factory displays + a center pool on the framework
   shell, two player boards (pattern lines · 5×5 wall · floor) vs a greedy AI. Click a factory or
   center tile to pick a color, then click a pattern line (or the floor) to place it. Rounds chain,
   so the AI driver re-arms on s.step (useAITurn tick). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { azulAdapter } from './net'
import * as A from './logic'
import type { Color, Winner } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#0f2c52" stroke="#2b5c92" strokeWidth="1.5" />
    <rect x="9" y="9" width="13" height="13" rx="2.5" fill="#2f7fd0" />
    <rect x="26" y="9" width="13" height="13" rx="2.5" fill="#e8b53a" />
    <rect x="9" y="26" width="13" height="13" rx="2.5" fill="#d2503f" />
    <rect x="26" y="26" width="13" height="13" rx="2.5" fill="#143a63" stroke="#3a6ea0" strokeWidth="1" />
  </svg>
)

/** Pick a class per color (drives the 5 distinct tile colors in CSS). */
function colorClass(c: Color): string { return 'az-c' + c }

function Tile({ c, sel, onClick, small }: { c: Color; sel?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <span
      className={'az-tile ' + colorClass(c) + (sel ? ' sel' : '') + (small ? ' sm' : '') + (onClick ? ' click' : '')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={A.COLOR_NAMES[c]}
    />
  )
}

export function Azul() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(azulAdapter)
  const [showRules, setShowRules] = useState(false)
  // Drafting selection: a source + color chosen, awaiting a destination line.
  const [pick, setPick] = useState<{ source: number | 'center'; color: Color } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { netNew(); setPick(null); setShowRules(false) }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0 }, [s.log])
  useEffect(() => { setPick(null) }, [s.step]) // clear stale selection whenever the board changes

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (pick) setPick(null); else setShowRules(false) },
  })

  // Seat-relative perspective: "you" = mySeat, the opponent = the other seat.
  const oppSeat = (mySeat === 0 ? 1 : 0) as 0 | 1
  const yourTurn = s.winner == null && isMyTurn
  const myBoard = s.boards[mySeat as 0 | 1]
  const myScore = myBoard.score
  const oppScore = s.boards[oppSeat].score
  const oppLabel = net.online ? `Player ${oppSeat + 1}` : 'Rival'
  const youWon = s.winner === mySeat

  // Banner (relative to mySeat).
  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = `You win — ${myScore} to ${oppScore}!` }
  else if (s.winner === oppSeat) { bk = 'lose'; banner = `${oppLabel} wins — ${oppScore} to ${myScore}.` }
  else if (s.winner === 'tie') { bk = ''; banner = `A tie — ${myScore} all.` }
  else if (yourTurn) {
    bk = 'you'
    banner = pick ? `Place ${A.COLOR_NAMES[pick.color]} — choose a pattern line or the floor` : 'Your turn — pick a color from a factory or the center'
  } else { bk = 'foe'; banner = net.online ? `${oppLabel} is drafting…` : 'The rival is drafting…' }

  // --- Interaction ---
  function pickColor(source: number | 'center', color: Color) {
    if (!yourTurn) return
    setPick(p => (p && p.source === source && p.color === color ? null : { source, color }))
  }
  function placeAt(line: number | 'floor') {
    if (!yourTurn || !pick) return
    if (line !== 'floor' && !A.canPlaceOnLine(myBoard, line, pick.color)) return
    dispatch({ source: pick.source, color: pick.color, line })
    setPick(null)
  }

  const selColors = (arr: Color[], source: number | 'center') => {
    // distinct colors with counts
    const counts = new Map<Color, number>()
    for (const c of arr) counts.set(c, (counts.get(c) ?? 0) + 1)
    return Array.from(counts.keys()).sort((a, b) => a - b).map(color => ({ color, n: counts.get(color)!, source }))
  }

  function FactoryDisc({ idx }: { idx: number }) {
    const f = s.factories[idx]
    return (
      <div className={'az-factory' + (f.length === 0 ? ' empty' : '')}>
        <div className="az-fac-grid">
          {[0, 1, 2, 3].map(i => {
            const c = f[i]
            if (c == null) return <span key={i} className="az-slot" />
            const isSel = pick != null && pick.source === idx && pick.color === c
            return <Tile key={i} c={c} sel={isSel} onClick={yourTurn ? () => pickColor(idx, c) : undefined} />
          })}
        </div>
      </div>
    )
  }

  function PatternLines({ board, mine }: { board: A.State['boards'][0]; mine: boolean }) {
    return (
      <div className="az-pattern">
        {board.pattern.map((pl, r) => {
          const cap = r + 1
          const placeable = mine && yourTurn && pick != null && A.canPlaceOnLine(board, r, pick.color)
          return (
            <div
              key={r}
              className={'az-pline' + (placeable ? ' placeable' : '')}
              onClick={placeable ? () => placeAt(r) : undefined}
            >
              {Array.from({ length: cap }, (_, i) => {
                const filledFromRight = i >= cap - pl.count
                return filledFromRight && pl.color >= 0
                  ? <Tile key={i} c={pl.color} small />
                  : <span key={i} className={'az-slot sm' + (placeable ? ' ghost' : '')} />
              })}
            </div>
          )
        })}
      </div>
    )
  }

  function Wall({ board }: { board: A.State['boards'][0] }) {
    return (
      <div className="az-wall">
        {board.wall.map((row, r) => (
          <div key={r} className="az-wrow">
            {row.map((cell, col) => {
              const color = A.wallColorAt(r, col)
              return (
                <span key={col} className={'az-wcell ' + colorClass(color) + (cell ? ' on' : '')} />
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  function Floor({ board }: { board: A.State['boards'][0] }) {
    const placeable = board === myBoard && yourTurn && pick != null
    return (
      <div className={'az-floor' + (placeable ? ' placeable' : '')} onClick={placeable ? () => placeAt('floor') : undefined}>
        {A.FLOOR_PENALTIES.map((p, i) => {
          const t = board.floor[i]
          return (
            <span key={i} className="az-fslot">
              <span className="az-fpen">{p}</span>
              {t != null && (t < 0 ? <span className="az-first">1</span> : <Tile c={t} small />)}
            </span>
          )
        })}
      </div>
    )
  }

  function Board({ player }: { player: 0 | 1 }) {
    const board = s.boards[player]
    const mine = player === mySeat
    const active = s.winner == null && s.turn === player
    return (
      <div className={'az-board panel' + (mine ? ' mine' : ' foe') + (active ? ' active' : '')}>
        <div className="az-board-head">
          <span className={'az-dot ' + (mine ? 'you' : 'foe')} />
          <span className="az-who">{mine ? 'You' : oppLabel}</span>
          <span className="az-score">{board.score}</span>
        </div>
        <div className="az-board-body">
          <PatternLines board={board} mine={mine} />
          <Wall board={board} />
        </div>
        <Floor board={board} />
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Azul · tile drafting"
        title="Azul"
        subtitle="draft azulejo tiles from the factories, fill your pattern lines, and tile a wall of contiguous color before the rival"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} · You ${myScore} · ${oppLabel} ${oppScore}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · pick + place &nbsp; Esc · cancel &nbsp; N · new</>}
      >
        <div className="az-wrap">
          <div className="az-table">
            <div className="az-factories">
              {s.factories.map((_, i) => <FactoryDisc key={i} idx={i} />)}
            </div>
            <div className={'az-center' + (s.center.length === 0 ? ' empty' : '')}>
              <div className="az-center-l">center{s.centerHasFirst && <span className="az-first inline">1</span>}</div>
              <div className="az-center-tiles">
                {s.center.length === 0
                  ? <span className="az-empty-note">{s.centerHasFirst ? '— first-player marker here —' : '— empty —'}</span>
                  : selColors(s.center, 'center').map(({ color, n }) => (
                    <span key={color} className="az-cgroup">
                      {Array.from({ length: n }, (_, i) => {
                        const isSel = pick != null && pick.source === 'center' && pick.color === color
                        return <Tile key={i} c={color} sel={isSel} onClick={yourTurn ? () => pickColor('center', color) : undefined} />
                      })}
                    </span>
                  ))}
              </div>
            </div>
          </div>

          <div className="az-boards">
            <Board player={mySeat as 0 | 1} />
            <Board player={oppSeat} />
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel logbox" ref={logRef}>
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} won={youWon} you={myScore} foe={oppScore} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, won, you, foe, oppLabel, onNew }: { winner: Winner; won: boolean; you: number; foe: number; oppLabel: string; onNew: () => void }) {
  const tie = winner === 'tie'
  return (
    <Modal
      eyebrow={tie ? 'Dead heat' : won ? 'Wall complete' : 'Outdrafted'}
      title={tie ? 'A Tie' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {you}</span>
        <span className="foe">{oppLabel} {foe}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Azul" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Start drafting</button>}>
      <div className="modal-body">
        <p>Each round the five <b>factories</b> are filled with four tiles. On your turn, take <b>all tiles of one color</b> from one factory (the rest slide to the <b>center</b>), or all of one color from the center. The first to draft from the center takes the <b>first-player marker</b> — a −1 floor penalty, but you lead next round.</p>
        <p>Place taken tiles on one <b>pattern line</b> (line <i>i</i> holds <i>i</i>+1 tiles, one color). You can't use a color already walled in that row, and a partly-filled line keeps its color. Tiles that don't fit fall to your <b>floor line</b> (penalties −1 −1 −2 −2 −2 −3 −3).</p>
        <p>When the table empties, every <b>complete</b> pattern line moves its tile to the <b>wall</b>, scoring 1 plus its contiguous horizontal and vertical neighbors. Then floor penalties apply and floors clear.</p>
        <p>The game ends when someone completes a full <b>wall row</b>. Bonuses: <b>+2</b> per row, <b>+7</b> per column, <b>+10</b> per color placed all five times. Highest score wins.</p>
        <p><b>Keys:</b> <kbd>Click</kbd> a tile then a line to place · <kbd>Esc</kbd> cancel · <kbd>N</kbd> new game · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
