/* ENTROPY (Hyle) — UI (built for this codebase). A 5x5 grid on the framework shell.
   You are CHAOS: place each drawn tile to keep the board disordered. ORDER (the AI)
   then slides a tile rook-style to build palindromes, which score. Keep Order at or
   below par to win. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as EN from './logic'
import type { EntropyState, Color } from './logic'

const { N, PAR, COLORS } = EN

const COLOR_NAME: Record<Color, string> = { c: 'Cyan', m: 'Magenta', y: 'Amber', g: 'Lime', o: 'Orange' }

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
  const [s, setS] = useState<EntropyState>(() => EN.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(EN.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.phase === 'order', () => setS(p => EN.aiStep(p)), { delayMs: 560, tick: s.placed })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.phase === 'chaos'
  const placeable = useMemo(
    () => (yourTurn ? new Set(EN.emptyCells(s.board)) : new Set<number>()),
    [yourTurn, s.board],
  )

  function clickCell(i: number) { if (yourTurn && placeable.has(i)) setS(EN.place(s, i)) }

  const bagCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const col of COLORS) m[col] = 0
    for (const col of s.bag) m[col]++
    return m
  }, [s.bag])

  let banner: string, bk = ''
  if (s.winner === 'chaos') { bk = 'win'; banner = `You win — Order held to ${s.score} (par ${PAR})` }
  else if (s.winner === 'order') { bk = 'lose'; banner = `Order wins — ${s.score} beats par ${PAR}` }
  else if (yourTurn && s.drawn) { bk = 'you'; banner = `Place the ${COLOR_NAME[s.drawn]} tile — keep it scattered` }
  else { bk = 'foe'; banner = 'Order is arranging…' }

  const left = N * N - s.placed
  const pct = Math.min(100, (s.score / PAR) * 100)

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
          <div className={"en-draw" + (yourTurn && s.drawn ? " active" : "")}>
            <span className="en-draw-l">Drawn</span>
            {s.drawn
              ? <span className={"en-tile draw " + s.drawn} />
              : <span className="en-tile draw empty" />}
          </div>
          <div className="en-board">
            {s.board.map((v, i) => (
              <div
                key={i}
                className={"en-cell" + (placeable.has(i) ? " hint" : "") + (s.last === i ? " last" : "")}
                onClick={() => clickCell(i)}
              >
                {v && <div className={"en-tile " + v} />}
                {!v && placeable.has(i) && <div className="en-dot" />}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
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
            <div className="en-role you"><b>Chaos</b> · you place random tiles</div>
            <div className="en-role foe"><b>Order</b> · AI slides to build palindromes</div>
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: EntropyState; onNew: () => void }) {
  const won = s.winner === 'chaos'
  return (
    <Modal
      eyebrow={won ? 'Disorder held' : 'Patterns emerged'}
      title={won ? 'Chaos Wins' : 'Order Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>Order {s.score}</span>
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
        <p>You are <b>Chaos</b>. Each turn a random coloured tile is <b>drawn</b> from the bag — click any empty cell to <b>place</b> it. Your goal is to keep the board <i>disordered</i>.</p>
        <p>Then <b>Order</b> (the AI) <b>slides</b> one tile any number of empty cells in a straight line — rook-style, never jumping — to build <b>palindromes</b>. Every run in a row or column that reads the same both ways (length 2–5) scores its length, and those points pile onto Order's total.</p>
        <p>The board fills over <b>25</b> placements. <b>Chaos wins</b> if Order's final score is at or below <b>par {PAR}</b>; otherwise Order wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
