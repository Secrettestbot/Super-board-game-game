/* BACKGAMMON — UI (built for this codebase). A walnut & green board on the framework shell.
   Solo: you are White (moving down toward home points 1–6) vs a 1-ply heuristic AI (Black).
   Online: you take whichever seat you're assigned — seat 0 = White, seat 1 = Black — and the
   board/banners/scoreboard are drawn relative to YOUR side. Roll, click a checker, then click
   a highlighted destination. The session hook drives any empty (AI) seat. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { backgammonAdapter } from './net'
import * as BG from './logic'
import type { BackgammonState, Move, Side } from './logic'

const BAR = BG.BAR_FROM
const SIDE: Side[] = ['w', 'b'] // seat 0 -> White, seat 1 -> Black

// White points read 1..24 = index+1; for the rival's perspective the same index is fine for logs.
function ptLabel(i: number) { return i + 1 }

export function Backgammon() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(backgammonAdapter)
  const mySide = SIDE[mySeat] ?? 'w'
  const oppSide = BG.other(mySide)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)   // selected source (point index or BAR)

  function newGame() { netNew(); setShowRules(false); setSel(null) }

  const yourTurn = !s.winner && isMyTurn

  // legal moves for YOUR side with current remaining dice (post "use-most-dice" filter)
  const usable = useMemo<Move[]>(() => (yourTurn && s.rolled) ? BG.usableMoves(s, mySide) : [], [yourTurn, s, mySide])
  const sources = useMemo(() => new Set(usable.map(m => m.from)), [usable])
  const dests = useMemo(() => {
    const m = new Map<number, Move>()
    if (sel == null || !sources.has(sel)) return m
    for (const mv of usable) if (mv.from === sel) m.set(mv.to, mv)
    return m
  }, [usable, sel, sources])

  function doRoll() { if (yourTurn && !s.rolled) { setSel(null); dispatch({ kind: 'roll' }) } }

  function clickSource(from: number) {
    if (!yourTurn || !s.rolled) return
    if (!sources.has(from)) return
    setSel(prev => (prev === from ? null : from))
  }
  function clickDest(to: number) {
    if (sel == null) return
    const mv = dests.get(to)
    if (!mv) return
    dispatch({ kind: 'move', from: mv.from, die: mv.die })
    setSel(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'r' || e.key === 'R') && yourTurn && !s.rolled && !s.winner) {
        e.preventDefault(); doRoll(); return true
      }
      return false
    },
  })

  // if the selected source is no longer valid (after a move), don't show its dests
  const activeSel = sel != null && (sources.has(sel)) ? sel : null

  const pipMine = BG.pipCount(s, mySide), pipOpp = BG.pipCount(s, oppSide)
  const offMine = mySide === 'w' ? s.offW : s.offB
  const offOpp = mySide === 'w' ? s.offB : s.offW
  const barMine = mySide === 'w' ? s.barW : s.barB

  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const iWon = s.winner === mySide

  let banner = '', bk = ''
  if (s.winner != null) {
    if (iWon) { bk = 'win'; banner = 'You win — all 15 borne off' }
    else { bk = 'lose'; banner = `${oppLabel} wins — all 15 borne off` }
  }
  else if (yourTurn && !s.rolled) { bk = 'you'; banner = 'Your turn — roll the dice' }
  else if (yourTurn && s.rolled) { bk = 'you'; banner = barMine > 0 ? 'Re-enter from the bar' : (sel == null ? 'Pick a checker to move' : 'Choose a destination') }
  else { bk = 'foe'; banner = s.rolled ? `${oppLabel} is moving…` : `${oppLabel} is rolling…` }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Backgammon · race &amp; hit"
        title="Backgammon"
        subtitle="run your checkers home and bear them off first — strand a blot and it goes to the bar"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Off ${offMine}/15 · ${offOpp}/15`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="bg-wrap">
          <Board
            s={s} sel={activeSel} sources={sources} dests={dests}
            onSource={clickSource} onDest={clickDest}
          />
          <DiceTray s={s} yourTurn={yourTurn} oppLabel={oppLabel} onRoll={doRoll} />
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <div className={"sc " + oppSide + (s.turn === oppSide && !s.winner ? " on" : "")}>
              <span className={"sc-checker " + oppSide} /><span className="sc-name">{oppLabel} · {oppSide === 'w' ? 'White' : 'Black'}</span>
            </div>
            <div className="sc-meta"><span>bar {oppSide === 'w' ? s.barW : s.barB}</span><span>off {offOpp}</span><span>pip {pipOpp}</span></div>
            <div className={"sc " + mySide + (s.turn === mySide && !s.winner ? " on" : "")}>
              <span className={"sc-checker " + mySide} /><span className="sc-name">You · {mySide === 'w' ? 'White' : 'Black'}</span>
            </div>
            <div className="sc-meta"><span>bar {barMine}</span><span>off {offMine}</span><span>pip {pipMine}</span></div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal iWon={iWon} offMine={offMine} offOpp={offOpp} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="8" fill="#3a2417" stroke="#6b4423" strokeWidth="1.5" />
    <path d="M8 8 L16 8 L12 26 Z" fill="#1c6a3f" />
    <path d="M24 8 L32 8 L28 26 Z" fill="#e8e0cc" stroke="#b8af93" strokeWidth="0.4" />
    <path d="M16 40 L24 40 L20 22 Z" fill="#1c6a3f" />
    <circle cx="38" cy="13" r="3.4" fill="#e8e0cc" />
    <circle cx="38" cy="13" r="0.9" fill="#3a2417" />
  </svg>
)

// ---------- board ----------
// Top row: points index 23..12 left→right. Bottom row: points 0..11 left→right (White home at
// bottom-left). The bar sits between left and right halves; bear-off trays flank the board.
const TOP = [23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12]
const BOT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function Board({ s, sel, sources, dests, onSource, onDest }: {
  s: BackgammonState; sel: number | null; sources: Set<number>; dests: Map<number, Move>
  onSource: (i: number) => void; onDest: (i: number) => void
}) {
  function Point({ i, top, idxInRow }: { i: number; top: boolean; idxInRow: number }) {
    const v = s.points[i]
    const n = Math.abs(v)
    const side: 'w' | 'b' | null = v > 0 ? 'w' : v < 0 ? 'b' : null
    const isSource = sources.has(i)
    const isDest = dests.has(i)
    const isSel = sel === i
    const dark = idxInRow % 2 === 0
    const cls = ['bg-pt', top ? 'top' : 'bot', dark ? 'd' : 'l']
    if (isSource) cls.push('src')
    if (isDest) cls.push('dest')
    if (isSel) cls.push('sel')
    if (s.last === i) cls.push('last')
    function click() { if (isDest) onDest(i); else if (isSource) onSource(i) }
    return (
      <div className={cls.join(' ')} data-pt={ptLabel(i)} onClick={click}>
        <div className="bg-stack">
          {Array.from({ length: Math.min(n, 5) }).map((_, k) => (
            <div key={k} className={"checker " + side} />
          ))}
          {n > 5 && <div className="bg-count">{n}</div>}
        </div>
        {isDest && <div className="bg-target" />}
      </div>
    )
  }

  return (
    <div className="bg-frame">
      <Tray side="b" off={s.offB} />
      <div className="bg-board">
        <div className="bg-row top">
          {TOP.slice(0, 6).map((i, k) => <Point key={i} i={i} top idxInRow={k} />)}
          <div className="bg-gap" />
          {TOP.slice(6).map((i, k) => <Point key={i} i={i} top idxInRow={k + 6} />)}
        </div>

        <Bar s={s} sel={sel} sources={sources} onSource={onSource} />

        <div className="bg-row bot">
          {BOT.slice(0, 6).map((i, k) => <Point key={i} i={i} top={false} idxInRow={k} />)}
          <div className="bg-gap" />
          {BOT.slice(6).map((i, k) => <Point key={i} i={i} top={false} idxInRow={k + 6} />)}
        </div>
      </div>
      <Tray side="w" off={s.offW} />
    </div>
  )
}

function Bar({ s, sel, sources, onSource }: {
  s: BackgammonState; sel: number | null; sources: Set<number>; onSource: (i: number) => void
}) {
  const barSel = sel === BAR
  const barSrc = sources.has(BAR)
  return (
    <div className="bg-barzone">
      <div className={"bg-bar top" + (barSrc ? ' src' : '') + (barSel ? ' sel' : '')}
        onClick={() => barSrc && onSource(BAR)}>
        {Array.from({ length: Math.min(s.barB, 4) }).map((_, k) => <div key={k} className="checker b" />)}
        {s.barB > 4 && <div className="bg-count">{s.barB}</div>}
      </div>
      <div className={"bg-bar bot" + (barSrc ? ' src' : '') + (barSel ? ' sel' : '')}
        onClick={() => barSrc && onSource(BAR)}>
        {Array.from({ length: Math.min(s.barW, 4) }).map((_, k) => <div key={k} className="checker w" />)}
        {s.barW > 4 && <div className="bg-count">{s.barW}</div>}
      </div>
    </div>
  )
}

function Tray({ side, off }: { side: 'w' | 'b'; off: number }) {
  return (
    <div className={"bg-tray " + side}>
      <div className="bg-tray-l">off</div>
      <div className="bg-tray-stack">
        {Array.from({ length: off }).map((_, k) => <div key={k} className={"borne " + side} />)}
      </div>
      <div className="bg-tray-n">{off}</div>
    </div>
  )
}

function DiceTray({ s, yourTurn, oppLabel, onRoll }: { s: BackgammonState; yourTurn: boolean; oppLabel: string; onRoll: () => void }) {
  const showRoll = yourTurn && !s.rolled && !s.winner
  const used = (() => {
    // map dice -> whether still in remaining (account for multiplicity)
    const rem = s.remaining.slice()
    return s.dice.map(d => { const i = rem.indexOf(d); if (i >= 0) { rem.splice(i, 1); return false } return true })
  })()
  return (
    <div className="bg-dicetray">
      {showRoll && <button className="bg-rollbtn" onClick={onRoll}>Roll</button>}
      {!showRoll && s.dice.length > 0 && (
        <div className="bg-dice">
          {s.dice.map((d, i) => <Die key={i} v={d} used={used[i]} />)}
        </div>
      )}
      {!showRoll && s.dice.length === 0 && <div className="bg-dice-hint">{oppLabel.toLowerCase()}'s roll</div>}
    </div>
  )
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}
function Die({ v, used }: { v: number; used: boolean }) {
  return (
    <div className={"die" + (used ? " used" : "")}>
      <div className="die-grid">
        {Array.from({ length: 9 }).map((_, k) => {
          const r = (k / 3) | 0, c = k % 3
          const on = (PIPS[v] || []).some(([pr, pc]) => pr === r && pc === c)
          return <span key={k} className={"pip" + (on ? " on" : "")} />
        })}
      </div>
    </div>
  )
}

function ResultModal({ iWon, offMine, offOpp, oppLabel, onNew }: { iWon: boolean; offMine: number; offOpp: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={iWon ? 'Borne off' : 'Out-raced'}
      title={iWon ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {offMine}/15</span><span className="foe">{oppLabel} {offOpp}/15</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Backgammon" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You race your 15 checkers toward your home board and bear them off; your opponent races the other way. First to bear off all fifteen <b>wins</b>.</p>
        <p>Each turn, <b>roll</b> two dice and move two checkers (or one checker twice) by the pip values — <b>doubles</b> give you four moves of that number. Land on an empty point, your own point, or a point with a single enemy checker (a <b>blot</b>) — landing on a blot <b>hits</b> it and sends it to the <b>bar</b>. You can't land on a point held by two or more enemies.</p>
        <p>A checker on the bar must <b>re-enter</b> the opponent's home board before you do anything else. You must use as many dice as you legally can.</p>
        <p>Click a checker, then a highlighted point to move. <b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
