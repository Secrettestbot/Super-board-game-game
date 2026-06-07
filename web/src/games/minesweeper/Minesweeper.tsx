/* MINESWEEPER — UI (solitaire, built for this codebase). A beveled grid on the shared
   shell. Left-click reveals, right-click flags (contextmenu suppressed). The first click
   is always safe and floods open a region. Difficulty selector, mines-remaining counter,
   a live timer, and a face/reset live in the side panel. No opponent — no useAITurn. */

import { useEffect, useRef, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import * as MS from './logic'
import type { MineState, Difficulty } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1b2331" stroke="#3a475e" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="9" fill="#11151d" stroke="#000" strokeWidth="0.5" />
    <g stroke="#e2e7f0" strokeWidth="2" strokeLinecap="round">
      <path d="M24 9 V39 M9 24 H39 M13.5 13.5 L34.5 34.5 M34.5 13.5 L13.5 34.5" />
    </g>
    <circle cx="24" cy="24" r="3.4" fill="#e2e7f0" />
    <circle cx="21.5" cy="21.5" r="1" fill="#11151d" />
  </svg>
)

const pad = (n: number) => String(Math.max(0, Math.min(999, n))).padStart(3, '0')

export function Minesweeper() {
  const [s, setS] = useState<MineState>(() => MS.makeGame('beginner'))
  const [showRules, setShowRules] = useState(false)
  const [flagMode, setFlagMode] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const diffRef = useRef<Difficulty>('beginner')

  function newGame(diff: Difficulty = diffRef.current) {
    diffRef.current = diff
    setS(MS.makeGame(diff))
    setSeconds(0)
    setShowRules(false)
  }

  // Timer: runs while the board is started and unresolved.
  const running = s.started && s.status === 'playing'
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds(t => Math.min(999, t + 1)), 1000)
    return () => clearInterval(id)
  }, [running])

  useGameKeys({
    onNew: () => newGame(),
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if (e.key === 'f' || e.key === 'F') { setFlagMode(v => !v); return true }
      return false
    },
  })

  function clickCell(i: number) {
    if (s.status !== 'playing') return
    if (flagMode) setS(MS.toggleFlag(s, i))
    else setS(MS.reveal(s, i))
  }

  function rightClick(e: React.MouseEvent, i: number) {
    e.preventDefault()
    if (s.status !== 'playing') return
    setS(MS.toggleFlag(s, i))
  }

  const remaining = MS.minesRemaining(s)
  const spec = MS.DIFFICULTIES[s.difficulty]

  let banner: string, bk = ''
  if (s.status === 'won') { bk = 'win'; banner = `Cleared in ${seconds}s — flawless` }
  else if (s.status === 'lost') { bk = 'lose'; banner = 'Boom — you hit a mine' }
  else if (!s.started) { bk = 'you'; banner = 'Click any cell — the first one is always safe' }
  else { bk = 'you'; banner = flagMode ? 'Flag mode — click to mark a mine' : 'Reveal safe cells; right-click to flag' }

  const face = s.status === 'won' ? '★' : s.status === 'lost' ? '✕' : flagMode ? '⚑' : '◦'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Minesweeper · sweep &amp; survive"
        title="Minesweeper"
        subtitle="clear every safe cell — the numbers tell you how many mines hide nearby"
        onRules={() => setShowRules(true)}
        onNew={() => newGame()}
        modeLeft={`${spec.rows} × ${spec.cols} · ${spec.mines} mines`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>F · flag &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="ms-wrap">
          <div
            className={'ms-board ' + s.difficulty + (s.status === 'lost' ? ' dead' : '')}
            style={{ ['--cols' as string]: s.cols, ['--rows' as string]: s.rows }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {s.grid.map((c, i) => {
              const cls = ['ms-cell']
              if (c.revealed) {
                cls.push('open')
                if (c.mine) cls.push(s.status === 'lost' && !c.flagged ? 'mine boom' : 'mine')
                else if (c.count > 0) cls.push('n' + c.count)
              } else {
                cls.push('hidden')
                if (c.flagged) cls.push('flag')
              }
              return (
                <button
                  key={i}
                  className={cls.join(' ')}
                  onClick={() => clickCell(i)}
                  onContextMenu={(e) => rightClick(e, i)}
                  disabled={s.status !== 'playing' && !c.revealed}
                >
                  {c.revealed
                    ? (c.mine ? '✸' : c.count > 0 ? c.count : '')
                    : (c.flagged ? '⚑' : '')}
                </button>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel ms-status">
            <button className={'ms-face' + (s.status !== 'playing' ? ' ' + s.status : '')} onClick={() => newGame()} aria-label="New game">{face}</button>
            <div className="ms-readouts">
              <div className="ms-readout"><span className="ms-rd-l">Mines</span><span className="ms-counter">{pad(remaining)}</span></div>
              <div className="ms-readout"><span className="ms-rd-l">Time</span><span className="ms-counter">{pad(seconds)}</span></div>
            </div>
          </div>

          <div className="panel ms-diff">
            <div className="panel-l">Difficulty</div>
            {(Object.keys(MS.DIFFICULTIES) as Difficulty[]).map(d => {
              const ds = MS.DIFFICULTIES[d]
              return (
                <button
                  key={d}
                  className={'ms-diff-btn' + (s.difficulty === d ? ' on' : '')}
                  onClick={() => newGame(d)}
                >
                  <span className="ms-diff-name">{ds.label}</span>
                  <span className="ms-diff-meta">{ds.rows}×{ds.cols} · {ds.mines}</span>
                </button>
              )
            })}
          </div>

          <div className="panel ms-mode">
            <button className={'ms-toggle' + (flagMode ? ' on' : '')} onClick={() => setFlagMode(v => !v)}>
              <span className="ms-toggle-icon">⚑</span>
              <span>Flag mode <kbd>F</kbd></span>
            </button>
            <div className="ms-hint">Left-click reveals · right-click flags</div>
          </div>
        </div>
      </GameShell>

      {s.status !== 'playing' && <ResultModal s={s} seconds={seconds} onNew={() => newGame()} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, seconds, onNew }: { s: MineState; seconds: number; onNew: () => void }) {
  const won = s.status === 'won'
  return (
    <Modal
      eyebrow={won ? 'Board swept' : 'Detonation'}
      title={won ? 'Cleared!' : 'Boom'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>New Game</button>}
    >
      <div className="modal-body">
        {won
          ? <p>You revealed every safe cell without tripping a mine — finished in <b>{seconds}s</b>. Try a harder board?</p>
          : <p>You hit a mine. The full minefield is revealed behind this dialog. Start fresh and watch the numbers.</p>}
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Minesweeper" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p><b>Reveal every safe cell</b> without uncovering a mine. Left-click a cell to reveal it; the <b>first click is always safe</b> and opens up a region.</p>
        <p>A revealed <b>number</b> counts the mines in the eight cells touching it. Use those numbers to deduce where the mines are. Reveal a blank (zero) cell and its whole connected area opens automatically.</p>
        <p><b>Flag</b> suspected mines with a right-click (or toggle <kbd>F</kbd> flag mode and left-click). Flagged cells can't be revealed until unflagged. The counter shows mines minus flags placed.</p>
        <p><b>Keys:</b> <kbd>F</kbd> flag mode · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
