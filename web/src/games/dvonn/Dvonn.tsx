/* DVONN — UI (built for this codebase). A 7x7 axial-rhombus hex board of 49 cells on
   the framework shell, vs a heuristic AI. Phase 1: click empty cells to place (3 red
   anchors first, then your 23 white discs alternating with the rival's black). Phase 2:
   click a stack you control (ivory top), then a highlighted landing cell exactly its
   height away. Stacks cut off from the red DVONN pieces vanish. Most controlled pieces
   wins. The AI places many pieces / makes many moves while it's "its turn", so its
   driver re-arms on s.tick (useAITurn tick). */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as D from './logic'
import type { DvonnState, Move } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1b2029" stroke="#3a4452" strokeWidth="1.5" />
    <circle cx="24" cy="14" r="6.4" fill="#e2483d" stroke="#a82a22" strokeWidth="1.2" />
    <circle cx="16" cy="28" r="6.4" fill="#f4efe4" stroke="#c9c2b0" strokeWidth="1.2" />
    <circle cx="32" cy="28" r="6.4" fill="#2d343f" stroke="#000" strokeWidth="1.2" />
    <circle cx="24" cy="38" r="5.4" fill="#e2483d" opacity="0.85" stroke="#a82a22" strokeWidth="1" />
  </svg>
)

export function Dvonn() {
  const [s, setS] = useState<DvonnState>(() => D.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)   // selected stack (phase 2)
  const logRef = useRef<HTMLDivElement>(null)

  function newGame() { setS(D.makeGame()); setSel(null); setShowRules(false) }

  // It's the AI's action when: placing a black piece on its slot (turn 1, no reds left),
  // OR placing one of the 3 reds — we alternate reds too but colour is red regardless;
  // OR moving on its move-turn. To keep both sides progressing during placement, the AI
  // owns every placement where it's player 1's slot OR a red is due on player 1's slot.
  const aiPlacing = s.phase === 'place' && s.turn === 1
  const aiMoving = s.phase === 'move' && s.turn === 1
  const aiActive = s.winner == null && (aiPlacing || aiMoving)
  useAITurn(aiActive, () => setS(p => D.aiTurn(p)), { delayMs: 420, tick: s.tick })

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [s.log])
  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setSel(null); setShowRules(false) },
  })

  const yourPlace = s.phase === 'place' && s.turn === 0
  const yourMove = s.phase === 'move' && s.turn === 0

  // precompute legal landings for the selected stack
  const myMoves: Move[] = yourMove ? D.legalMoves(s, 0) : []
  const targets = new Set<number>(sel == null ? [] : myMoves.filter(m => m.from === sel).map(m => m.to))
  const movableFrom = new Set<number>(myMoves.map(m => m.from))

  function clickCell(i: number) {
    if (s.winner != null) return
    if (yourPlace) {
      if (s.board[i] == null) setS(D.placePiece(s, i))
      return
    }
    if (yourMove) {
      const st = s.board[i]
      if (sel != null && targets.has(i)) {        // confirm a move
        setS(D.applyMove(s, sel, i)); setSel(null); return
      }
      if (st != null && D.controllerOf(st) === 0 && movableFrom.has(i)) {
        setSel(prev => (prev === i ? null : i))    // (de)select your stack
        return
      }
      setSel(null)
    }
  }

  const youPts = D.controlledCount(s, 0)
  const foePts = D.controlledCount(s, 1)

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `You win — ${youPts} pieces to ${foePts}!` }
  else if (s.winner === 1) { bk = 'lose'; banner = `Rival wins — ${foePts} pieces to ${youPts}.` }
  else if (s.phase === 'done') { bk = ''; banner = `Tie — ${youPts}–${foePts}.` }
  else if (s.phase === 'place') {
    if (yourPlace) {
      bk = 'you'
      banner = s.redLeft > 0 ? `Place a red DVONN anchor — ${s.redLeft} left` : `Place a white disc — ${s.place[0]} left`
    }
    else { bk = 'foe'; banner = `Rival is placing… (${s.place[1]} left)` }
  } else { // move
    if (yourMove) { bk = 'you'; banner = sel == null ? 'Pick a stack you control' : 'Pick a glowing landing cell' }
    else { bk = 'foe'; banner = 'Rival is moving…' }
  }

  const placeLeft = s.phase === 'place'
  const modeLeft = placeLeft
    ? `Placement · red ${s.redLeft} · you ${s.place[0]} · foe ${s.place[1]}`
    : `You ${youPts} · Rival ${foePts}`

  function Cell({ i }: { i: number }) {
    const st = s.board[i]
    const empty = st == null
    let cls = 'dv-cell'
    if (empty) cls += ' empty'
    if (yourPlace && empty) cls += ' place-ok'
    if (yourMove && !empty && st != null && D.controllerOf(st) === 0 && movableFrom.has(i)) cls += ' movable'
    if (sel === i) cls += ' selected'
    if (targets.has(i)) cls += ' target'
    if (s.last && (s.last.from === i || s.last.to === i)) cls += ' lastmv'
    const clickable = (yourPlace && empty) || (yourMove && (targets.has(i) || (st != null && D.controllerOf(st) === 0 && movableFrom.has(i))))
    if (clickable) cls += ' click'

    return (
      <div className={cls} onClick={clickable ? () => clickCell(i) : undefined} title={D.sq(i)}>
        <div className="dv-hex">
          {st != null && <StackDisc st={st} />}
        </div>
      </div>
    )
  }

  function StackDisc({ st }: { st: D.Stack }) {
    const t = st[st.length - 1].color   // top colour
    const hasRed = D.stackHasRed(st)
    const showDot = hasRed && t !== 'r'
    return (
      <div className={`dv-stack ${t}${st.length > 1 ? ' tall' : ''}`}>
        {st.length > 1 ? st.length : ''}
        {showDot && <span className="dv-reddot" />}
      </div>
    )
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="DVONN · stack & control"
        title="DVONN"
        subtitle="fill the rhombus, then move stacks exactly their height onto others — but stay anchored to the red DVONN pieces or be swept away"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={modeLeft}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · play &nbsp; Esc · deselect &nbsp; N · new</>}
      >
        <div className="dv-wrap">
          <div className="dv-board-frame">
            <div className="dv-board" style={{ ['--cs' as string]: '54px' }}>
              {Array.from({ length: D.H }, (_, r) => (
                <div className="dv-row" data-r={r} key={r}>
                  {Array.from({ length: D.W }, (_, c) => <Cell key={c} i={D.idx(r, c)} />)}
                </div>
              ))}
            </div>
          </div>

          <div className="dv-side">
            <div className="panel">
              <div className={'dv-score-row you-row' + ((yourMove || yourPlace) ? ' on' : '')}>
                <span className="dv-pawn w" />
                <span className="dv-who">You</span>
                <span className="dv-pts">{youPts}</span>
              </div>
              <div className={'dv-score-row foe-row' + ((s.turn === 1 && s.winner == null && s.phase !== 'done') ? ' on' : '')}>
                <span className="dv-pawn b" />
                <span className="dv-who">Rival</span>
                <span className="dv-pts">{foePts}</span>
              </div>
            </div>

            <div className="panel dv-phasebox">
              <div className="dv-phase-label">{s.phase === 'place' ? 'Phase 1 · Placement' : s.phase === 'move' ? 'Phase 2 · Movement' : 'Game over'}</div>
              <div className="dv-phase-big">
                {s.phase === 'place' ? (s.redLeft > 0 ? 'Red anchors' : 'Filling the board')
                  : s.phase === 'move' ? 'Move your stacks' : 'Final score'}
              </div>
              <div className="dv-phase-sub">
                {s.phase === 'place'
                  ? 'Click an empty cell to drop a disc. The 3 red DVONN pieces go down first.'
                  : s.phase === 'move'
                  ? 'Click a stack you control, then a highlighted cell exactly its height away. Stacks cut off from a red piece are removed.'
                  : (s.winner === 0 ? 'You controlled the most pieces.' : s.winner === 1 ? 'The rival controlled more pieces.' : 'Even split.')}
              </div>
            </div>

            <div className="panel dv-legend">
              <div className="dv-leg-row"><span className="dv-leg-dot w" /> Your discs (white)</div>
              <div className="dv-leg-row"><span className="dv-leg-dot b" /> Rival discs (black)</div>
              <div className="dv-leg-row"><span className="dv-leg-dot r" /> DVONN anchor (red) — keeps stacks alive</div>
            </div>

            <div className="panel logbox" ref={logRef}>
              {s.log.map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
            </div>
          </div>
        </div>
      </GameShell>

      {(s.phase === 'done') && <ResultModal winner={s.winner} you={youPts} foe={foePts} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ winner, you, foe, onNew }: { winner: D.Player | null; you: number; foe: number; onNew: () => void }) {
  const won = winner === 0
  const tie = winner == null
  return (
    <Modal
      eyebrow={tie ? 'Dead heat' : won ? 'Anchored & ahead' : 'Swept aside'}
      title={tie ? 'Tie Game' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        {tie ? <span>{you} – {foe}</span>
          : won ? <span className="you">{you} – {foe}</span>
          : <span className="foe">{foe} – {you}</span>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="DVONN" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>A 49-cell hex rhombus. <b>Phase 1 — placement:</b> the <b>3 red DVONN anchors</b> are dropped first, then you (white) and the rival (black) alternate placing your <b>23 discs</b> each until the board is full.</p>
        <p><b>Phase 2 — movement:</b> every cell holds a <b>stack</b>; its <b>top disc's colour</b> controls it. Move a stack you control in one of the six straight hex directions a number of cells <b>exactly equal to its height</b>, landing <b>on top of another stack</b> (never onto an empty cell). A stack with no occupied neighbour at all cannot move.</p>
        <p>After every move, any stack <b>no longer connected</b> (through chains of occupied cells) to a <b>red DVONN piece</b> is <b>removed</b> from the board.</p>
        <p>If you can't move you pass; when neither side can move the game ends. <b>Score = pieces in stacks you control.</b> Most pieces wins. A red dot on a disc means a DVONN anchor is buried in that stack.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
