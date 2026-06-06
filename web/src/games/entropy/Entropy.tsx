/* ENTROPY (Hyle) — UI (built for this codebase). A 5x5 grid on the framework shell.
   Solo: you are CHAOS — place each drawn tile to keep the board disordered while ORDER
   (the AI) slides tiles rook-style to build palindromes; keep its score under par to win.
   Online: the local player acts in their own seat's role (seat 0 = Chaos, seat 1 = Order)
   and the empty seat is filled by the AI / the remote human. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { entropyAdapter } from './net'
import * as EN from './logic'
import type { EntropyState, Color } from './logic'

const { N, PAR, COLORS } = EN

const COLOR_NAME: Record<Color, string> = { c: 'Cyan', m: 'Magenta', y: 'Amber', g: 'Lime', o: 'Orange' }
const cellName = (i: number) => `${'ABCDE'[i % N]}${Math.floor(i / N) + 1}`

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#10131c" stroke="#2c3550" strokeWidth="1.5" />
    <circle cx="16" cy="16" r="4.5" fill="#36d9d2" />
    <circle cx="32" cy="16" r="4.5" fill="#e0894e" />
    <circle cx="24" cy="24" r="4.5" fill="#c46bff" />
    <circle cx="16" cy="32" r="4.5" fill="#9ad94a" />
    <circle cx="32" cy="32" r="4.5" fill="#36d9d2" />
  </svg>
)

export function Entropy() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(entropyAdapter)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null) // Order: selected tile to slide

  const amChaos = mySeat === 0
  const amOrder = mySeat === 1
  const over = s.winner != null

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  const yourTurn = !over && isMyTurn

  // CHAOS: empty cells are placeable on your turn.
  const placeable = useMemo(
    () => (yourTurn && amChaos ? new Set(EN.emptyCells(s.board)) : new Set<number>()),
    [yourTurn, amChaos, s.board],
  )
  // ORDER: legal rook destinations for the currently selected tile.
  const dests = useMemo(
    () => (yourTurn && amOrder && sel != null ? new Set(EN.rookDests(s.board, sel)) : new Set<number>()),
    [yourTurn, amOrder, sel, s.board],
  )

  function clickCell(i: number) {
    if (!yourTurn) return
    if (amChaos) {
      if (placeable.has(i)) dispatch({ kind: 'place', cell: i })
      return
    }
    // ORDER
    if (sel != null && dests.has(i)) { dispatch({ kind: 'move', from: sel, to: i }); setSel(null); return }
    if (s.board[i]) { setSel(i === sel ? null : i); return } // (re)select a tile to slide
    setSel(null)
  }

  function pass() { if (yourTurn && amOrder) { dispatch({ kind: 'pass' }); setSel(null) } }

  const bagCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const col of COLORS) m[col] = 0
    for (const col of s.bag) m[col]++
    return m
  }, [s.bag])

  // Results & banners are relative to mySeat (you win iff your role won).
  const myWin = (s.winner === 'chaos' && amChaos) || (s.winner === 'order' && amOrder)
  const oppLabel = net.online ? 'Opponent' : amChaos ? 'Order' : 'Chaos'

  let banner: string, bk = ''
  if (over) {
    bk = myWin ? 'win' : 'lose'
    banner = myWin ? `You win — final score ${s.score} (par ${PAR})` : `You lose — final score ${s.score} (par ${PAR})`
  } else if (yourTurn && amChaos) {
    bk = 'you'; banner = s.drawn ? `Place the ${COLOR_NAME[s.drawn]} tile — keep it scattered` : 'Your move'
  } else if (yourTurn && amOrder) {
    bk = 'you'; banner = sel != null ? 'Slide it to an empty square (or pass)' : 'Select a tile to slide — build palindromes'
  } else {
    bk = 'foe'; banner = net.online ? `${oppLabel} is moving…` : amChaos ? 'Order is arranging…' : 'Chaos is placing…'
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (sel != null) setSel(null); else setShowRules(false) },
  })

  const left = N * N - s.placed
  const pct = Math.min(100, (s.score / PAR) * 100)

  const myRole = amChaos ? 'Chaos' : 'Order'
  const oppRole = amChaos ? 'Order' : 'Chaos'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Entropy · chaos vs order"
        title="Entropy"
        subtitle="scatter the tiles so Order can't build symmetry — keep its score under par"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${s.placed} / ${N * N} placed`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="en-wrap">
          <div className={"en-draw" + (yourTurn && amChaos && s.drawn ? " active" : "")}>
            <span className="en-draw-l">Drawn</span>
            {s.drawn
              ? <span className={"en-tile draw " + s.drawn} />
              : <span className="en-tile draw empty" />}
          </div>
          <div className="en-board">
            {s.board.map((v, i) => {
              const hint = placeable.has(i) || dests.has(i)
              const isSel = sel === i
              return (
                <div
                  key={i}
                  className={"en-cell" + (hint ? " hint" : "") + (s.last === i ? " last" : "") + (isSel ? " sel" : "")}
                  onClick={() => clickCell(i)}
                >
                  {v && <div className={"en-tile " + v} />}
                  {!v && hint && <div className="en-dot" />}
                </div>
              )
            })}
          </div>
          {amOrder && yourTurn && (
            <button className="btn-modal" onClick={pass} style={{ marginTop: 8 }}>Pass</button>
          )}
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel en-score">
            <div className="en-score-row">
              <span className="en-score-l">Order's score</span>
              <span className={"en-score-n" + (s.score > PAR ? " over" : "")}>{s.score}</span>
            </div>
            <div className="en-bar"><div className="en-bar-fill" style={{ width: `${pct}%` }} /></div>
            <div className="en-par">par {PAR} · Chaos wins ≤ par</div>
          </div>

          <div className="panel en-bag">
            <div className="panel-l">Bag · {left} left</div>
            <div className="en-bag-grid">
              {COLORS.map(col => (
                <div key={col} className="en-bag-item">
                  <span className={"en-tile sm " + col} />
                  <span className="en-bag-n">{bagCounts[col]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel en-roles">
            <div className={"en-role " + (amChaos ? "you" : "foe")}>
              <b>Chaos</b> · {amChaos ? 'you' : net.online ? 'Opponent' : 'AI'} place{amChaos ? '' : 's'} random tiles
            </div>
            <div className={"en-role " + (amOrder ? "you" : "foe")}>
              <b>Order</b> · {amOrder ? 'you' : net.online ? 'Opponent' : 'AI'} slide{amOrder ? '' : 's'} to build palindromes
            </div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {over && <ResultModal won={myWin} myRole={myRole} oppRole={oppRole} score={s.score} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, myRole, oppRole, score, online, onNew }: { won: boolean; myRole: string; oppRole: string; score: number; online: boolean; onNew: () => void }) {
  const winRole = won ? myRole : oppRole
  return (
    <Modal
      eyebrow={winRole === 'Chaos' ? 'Disorder held' : 'Patterns emerged'}
      title={won ? 'You Win' : `${online ? 'Opponent' : oppRole} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>Order {score}</span>
        <span className="en-par2">par {PAR}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Entropy" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Two roles alternate. <b>Chaos</b> is dealt a random coloured tile each turn and <b>clicks an empty cell</b> to place it, trying to keep the board <i>disordered</i>.</p>
        <p>Then <b>Order</b> <b>selects a tile and slides</b> it any number of empty cells in a straight line — rook-style, never jumping — or <b>passes</b>, building <b>palindromes</b>. Every run in a row or column that reads the same both ways (length 2–5) scores its length onto Order's total.</p>
        <p>The board fills over <b>25</b> placements. <b>Chaos wins</b> if Order's final score is at or below <b>par {PAR}</b>; otherwise Order wins. Solo, you play Chaos against the AI; online you play whichever seat you hold.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
