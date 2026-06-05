/* DARA — UI (built for this codebase). A 5×6 sahel board on the framework shell, vs a
   depth-limited alpha-beta AI. Drop your 12 stones (no early threes), then slide one step
   orthogonally to form an exactly-three "dara" and capture. Reduce the rival below 3 to win. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as DA from './logic'
import type { DaraState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#c89a5b" stroke="#9c7330" strokeWidth="1.5" />
    <circle cx="16" cy="24" r="5.5" fill="#e8d3a8" stroke="#b8975c" strokeWidth="0.6" />
    <circle cx="32" cy="16" r="5.5" fill="#43403b" stroke="#26241f" strokeWidth="0.6" />
    <circle cx="32" cy="32" r="5.5" fill="#43403b" stroke="#26241f" strokeWidth="0.6" />
  </svg>
)

export function Dara() {
  const [s, setS] = useState<DaraState>(() => DA.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)   // selected own stone (phase 2)

  function newGame() { setS(DA.makeGame()); setShowRules(false); setSel(null) }

  const aiActive = !s.winner && s.turn === 'a'
  useAITurn(aiActive, () => setS(p => DA.aiMove(p)), { delayMs: 460, tick: s.pendingCapture })
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = !s.winner && s.turn === 's'
  const youCapturing = yourTurn && s.pendingCapture === 'a'
  const cnt = DA.counts(s.board)

  // legal target sets for the current interaction
  const dropOk = useMemo(
    () => (yourTurn && s.phase === 'drop' && !s.pendingCapture ? new Set(DA.dropCells(s.board, 's')) : new Set<number>()),
    [yourTurn, s.phase, s.pendingCapture, s.board],
  )
  const moveTargets = useMemo(
    () => (yourTurn && s.phase === 'move' && sel !== null && !s.pendingCapture
      ? new Set(DA.neighbors(sel).filter(j => !s.board[j]))
      : new Set<number>()),
    [yourTurn, s.phase, sel, s.pendingCapture, s.board],
  )
  const capTargets = useMemo(
    () => (youCapturing ? new Set(DA.captureTargets(s.board, 's')) : new Set<number>()),
    [youCapturing, s.board],
  )

  function clickCell(i: number) {
    if (!yourTurn) return
    if (youCapturing) { if (capTargets.has(i)) { setS(DA.capture(s, i, 's')); setSel(null) } return }
    if (s.phase === 'drop') { if (dropOk.has(i)) setS(DA.drop(s, i, 's')); return }
    // move phase
    if (s.board[i] === 's') { setSel(i === sel ? null : i); return }
    if (sel !== null && moveTargets.has(i)) {
      setS(DA.move(s, sel, i, 's'))
      setSel(null)
    }
  }

  let banner: string, bk = ''
  if (s.winner === 's') { bk = 'win'; banner = 'You win — the rival can no longer make three' }
  else if (s.winner === 'a') { bk = 'lose'; banner = 'The rival wins' }
  else if (youCapturing) { bk = 'you'; banner = 'A dara! Capture a rival stone' }
  else if (yourTurn && s.phase === 'drop') { bk = 'you'; banner = `Your turn — drop a stone (${s.hand.s} in hand)` }
  else if (yourTurn) { bk = 'you'; banner = sel === null ? 'Your turn — pick a stone to slide' : 'Slide to an adjacent empty cell' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const modeLeft = s.phase === 'drop' ? 'Drop · 5 × 6' : 'Move · 5 × 6'

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
          <div className="panel players">
            <div className={'pl s' + (s.turn === 's' && !s.winner ? ' on' : '')}>
              <span className="pl-chip s" />
              <span className="pl-name">You · Sand</span>
              <span className="pl-stats"><b>{cnt.s}</b><i>on board</i></span>
              {s.phase === 'drop' && <span className="pl-hand">{s.hand.s} <small>in hand</small></span>}
            </div>
            <div className={'pl a' + (s.turn === 'a' && !s.winner ? ' on' : '')}>
              <span className="pl-chip a" />
              <span className="pl-name">Rival · Slate</span>
              <span className="pl-stats"><b>{cnt.a}</b><i>on board</i></span>
              {s.phase === 'drop' && <span className="pl-hand">{s.hand.a} <small>in hand</small></span>}
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} cnt={cnt} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, cnt, onNew }: { s: DaraState; cnt: { s: number; a: number }; onNew: () => void }) {
  const won = s.winner === 's'
  return (
    <Modal
      eyebrow={won ? 'Three in a row' : 'Outmanoeuvred'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {cnt.s}</span><span className="foe">Rival {cnt.a}</span></div>
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
