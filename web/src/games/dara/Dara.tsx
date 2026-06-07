/* DARA — UI (built for this codebase). A 5×6 sahel board on the framework shell. Drop your
   12 stones (no early threes), then slide one step orthogonally to form an exactly-three
   "dara" and capture. Reduce the rival below 3 to win. Online-capable via useGameSession
   (host-authoritative): empty seats are filled by the alpha-beta AI; a remote guest plays
   the other side. Everything is rendered relative to mySeat (seat 0 = Sand, seat 1 = Slate). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { daraAdapter } from './net'
import * as DA from './logic'
import type { Stone } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#c89a5b" stroke="#9c7330" strokeWidth="1.5" />
    <circle cx="16" cy="24" r="5.5" fill="#e8d3a8" stroke="#b8975c" strokeWidth="0.6" />
    <circle cx="32" cy="16" r="5.5" fill="#43403b" stroke="#26241f" strokeWidth="0.6" />
    <circle cx="32" cy="32" r="5.5" fill="#43403b" stroke="#26241f" strokeWidth="0.6" />
  </svg>
)

export function Dara() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(daraAdapter)
  const myStone: Stone = mySeat === 1 ? 'a' : 's'   // seat 0 = Sand, seat 1 = Slate
  const oppStone: Stone = myStone === 's' ? 'a' : 's'
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)   // selected own stone (phase 2)

  function newGame() { netNew(); setShowRules(false); setSel(null) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && isMyTurn
  const youCapturing = yourTurn && s.pendingCapture === oppStone
  const cnt = DA.counts(s.board)

  // legal target sets for the current interaction (relative to mySeat)
  const dropOk = useMemo(
    () => (yourTurn && s.phase === 'drop' && !s.pendingCapture ? new Set(DA.dropCells(s.board, myStone)) : new Set<number>()),
    [yourTurn, s.phase, s.pendingCapture, s.board, myStone],
  )
  const moveTargets = useMemo(
    () => (yourTurn && s.phase === 'move' && sel !== null && !s.pendingCapture
      ? new Set(DA.neighbors(sel).filter(j => !s.board[j]))
      : new Set<number>()),
    [yourTurn, s.phase, sel, s.pendingCapture, s.board],
  )
  const capTargets = useMemo(
    () => (youCapturing ? new Set(DA.captureTargets(s.board, myStone)) : new Set<number>()),
    [youCapturing, s.board, myStone],
  )

  function clickCell(i: number) {
    if (!yourTurn) return
    if (youCapturing) { if (capTargets.has(i)) { dispatch({ kind: 'remove', cell: i }); setSel(null) } return }
    if (s.phase === 'drop') { if (dropOk.has(i)) dispatch({ kind: 'place', cell: i }); return }
    // move phase
    if (s.board[i] === myStone) { setSel(i === sel ? null : i); return }
    if (sel !== null && moveTargets.has(i)) {
      dispatch({ kind: 'move', from: sel, to: i })
      setSel(null)
    }
  }

  const myHand = s.hand[myStone]
  const oppHand = s.hand[oppStone]
  const myOnBoard = myStone === 's' ? cnt.s : cnt.a
  const oppOnBoard = oppStone === 's' ? cnt.s : cnt.a
  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const thinking = net.online ? 'The opponent is thinking…' : 'The rival is thinking…'

  const iWin = s.winner === myStone
  const oppWin = s.winner === oppStone

  let banner: string, bk = ''
  if (iWin) { bk = 'win'; banner = 'You win — the rival can no longer make three' }
  else if (oppWin) { bk = 'lose'; banner = `${oppLabel} wins` }
  else if (youCapturing) { bk = 'you'; banner = 'A dara! Capture a rival stone' }
  else if (yourTurn && s.phase === 'drop') { bk = 'you'; banner = `Your turn — drop a stone (${myHand} in hand)` }
  else if (yourTurn) { bk = 'you'; banner = sel === null ? 'Your turn — pick a stone to slide' : 'Slide to an adjacent empty cell' }
  else { bk = 'foe'; banner = thinking }

  const modeLeft = s.phase === 'drop' ? 'Drop · 5 × 6' : 'Move · 5 × 6'
  const myName = myStone === 's' ? 'Sand' : 'Slate'
  const oppName = oppStone === 's' ? 'Sand' : 'Slate'
  const myOn = s.turn === myStone && !s.winner
  const oppOn = s.turn === oppStone && !s.winner

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Dara · three to capture"
        title="Dara"
        subtitle="a sahel game of placement and patience — line up exactly three to take a rival stone"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={modeLeft}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="da-wrap">
          <div className="da-board">
            {s.board.map((v, i) => {
              const hint = dropOk.has(i) || moveTargets.has(i)
              const cls = 'da-cell'
                + (hint ? ' hint' : '')
                + (s.last === i ? ' last' : '')
                + (sel === i ? ' sel' : '')
                + (capTargets.has(i) ? ' cap' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {v && <div className={'da-stone ' + v + (sel === i ? ' sel' : '') + (capTargets.has(i) ? ' cap' : '')} />}
                  {!v && hint && <div className="da-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel players">
            <div className={'pl ' + myStone + (myOn ? ' on' : '')}>
              <span className={'pl-chip ' + myStone} />
              <span className="pl-name">You · {myName}</span>
              <span className="pl-stats"><b>{myOnBoard}</b><i>on board</i></span>
              {s.phase === 'drop' && <span className="pl-hand">{myHand} <small>in hand</small></span>}
            </div>
            <div className={'pl ' + oppStone + (oppOn ? ' on' : '')}>
              <span className={'pl-chip ' + oppStone} />
              <span className="pl-name">{oppLabel} · {oppName}</span>
              <span className="pl-stats"><b>{oppOnBoard}</b><i>on board</i></span>
              {s.phase === 'drop' && <span className="pl-hand">{oppHand} <small>in hand</small></span>}
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWin} oppLabel={oppLabel} myOnBoard={myOnBoard} oppOnBoard={oppOnBoard} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, myOnBoard, oppOnBoard, onNew }: { won: boolean; oppLabel: string; myOnBoard: number; oppOnBoard: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Three in a row' : 'Outmanoeuvred'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myOnBoard}</span><span className="foe">{oppLabel} {oppOnBoard}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Dara" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Played on a <b>5 × 6</b> board. You are <b>Sand</b> and move first; each side has <b>12 stones</b>.</p>
        <p><b>Drop phase:</b> take turns placing your stones on empty cells, but you may <i>not</i> make three in a row yet — and nothing is captured.</p>
        <p><b>Move phase:</b> once all stones are down, slide a stone one step up, down, left or right onto an empty cell. Whenever a move forms a line of <i>exactly three</i> of your stones (a <b>dara</b>), you <b>capture</b> any one rival stone. A line of four or more does not count.</p>
        <p>Reduce the rival <b>below three stones</b> — or leave them with no legal move — to <b>win</b>.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
