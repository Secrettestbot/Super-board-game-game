/* FOX AND HOUNDS — UI (built for this codebase). 8x8 checkerboard on the framework shell;
   you are the sly fox slipping past a wall of four minimax hounds. Click the fox, then a
   highlighted diagonal square to slip there; the AI advances one hound in reply. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as FH from './logic'
import type { FHState } from './logic'

const { N } = FH

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2a1c12" stroke="#6b4a2c" strokeWidth="1.5" />
    <path d="M16 30 L20 16 L24 26 L28 16 L32 30 Z" fill="#d96a31" stroke="#7a3a16" strokeWidth="0.8" />
    <circle cx="22" cy="26" r="1.3" fill="#1a120a" /><circle cx="26" cy="26" r="1.3" fill="#1a120a" />
    <path d="M24 31 L22 29 L26 29 Z" fill="#f0e3d2" />
  </svg>
)

const FOX_GLYPH = (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M9 28 L15 9 L20 22 L25 9 L31 28 Z" fill="var(--fox)" stroke="var(--fox-d)" strokeWidth="1" />
    <path d="M9 28 Q20 38 31 28 Q26 33 20 33 Q14 33 9 28 Z" fill="var(--fox-d)" />
    <circle cx="16.5" cy="23" r="1.6" fill="#1a120a" /><circle cx="23.5" cy="23" r="1.6" fill="#1a120a" />
    <path d="M20 29 L17.5 26 L22.5 26 Z" fill="var(--fox-hi)" />
  </svg>
)

const HOUND_GLYPH = (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <ellipse cx="20" cy="24" rx="11" ry="9" fill="var(--hound)" stroke="var(--hound-d)" strokeWidth="1" />
    <path d="M10 16 Q8 9 13 11 L15 17 Z" fill="var(--hound-d)" />
    <path d="M30 16 Q32 9 27 11 L25 17 Z" fill="var(--hound-d)" />
    <circle cx="16" cy="23" r="1.5" fill="#0e0e10" /><circle cx="24" cy="23" r="1.5" fill="#0e0e10" />
    <ellipse cx="20" cy="28" rx="2.4" ry="1.8" fill="#0e0e10" />
  </svg>
)

export function FoxHounds() {
  const [s, setS] = useState<FHState>(() => FH.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState(false) // fox selected?

  function newGame() { setS(FH.makeGame()); setSel(false); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 'hound', () => setS(p => FH.aiMove(p)), { delayMs: 520 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSel(false) } })

  const yourTurn = !s.winner && s.turn === 'fox'
  const targets = useMemo(
    () => (yourTurn && sel) ? new Set(FH.legalMoves({ fox: s.fox, hounds: s.hounds }, 'fox')) : new Set<number>(),
    [yourTurn, sel, s.fox, s.hounds],
  )
  const houndSet = useMemo(() => new Set(s.hounds), [s.hounds])
  const canMove = yourTurn && FH.legalMoves({ fox: s.fox, hounds: s.hounds }, 'fox').length > 0

  function clickCell(i: number) {
    if (!yourTurn) return
    if (i === s.fox) { setSel(v => !v); return }
    if (sel && targets.has(i)) { setS(FH.moveFox(s, i)); setSel(false) }
  }

  let banner: string, bk = ''
  if (s.winner === 'fox') { bk = 'win'; banner = 'You Win — the fox slips free' }
  else if (s.winner === 'hound') { bk = 'lose'; banner = 'Rival Wins — the pack closes in' }
  else if (yourTurn) { bk = 'you'; banner = sel ? 'Pick a glowing square to dart to' : 'Your turn — click the fox' }
  else { bk = 'foe'; banner = 'The hounds are circling…' }

  const hint = canMove
    ? 'Drift sideways and back to bait a gap, then sprint through it.'
    : (yourTurn ? 'No escape left…' : 'Watch the wall — slip the moment it bends.')

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Fox &amp; Hounds · the hunt"
        title="Fox and Hounds"
        subtitle="you are the fox — slip past four relentless hounds to the far back row"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8 · dark squares"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="fh-wrap">
          <div className="fh-board">
            {Array.from({ length: N * N }, (_, i) => {
              const dark = FH.isDark(i)
              const isFox = i === s.fox
              const isHound = houndSet.has(i)
              const cls =
                'fh-cell ' + (dark ? 'dark' : 'light') +
                (FH.isDark(i) && targets.has(i) ? ' target' : '') +
                (isFox && sel ? ' picked' : '') +
                (s.last === i ? ' last' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {isFox && <div className={'fh-piece fox' + (yourTurn ? ' live' : '')}>{FOX_GLYPH}</div>}
                  {isHound && <div className="fh-piece hound">{HOUND_GLYPH}</div>}
                  {!isFox && !isHound && targets.has(i) && <div className="fh-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel turnbox">
            <div className={'tn fox' + (s.turn === 'fox' && !s.winner ? ' on' : '')}>
              <span className="tn-mark fox">{FOX_GLYPH}</span>
              <span className="tn-name">You · Fox</span>
              <span className="tn-tag">any diagonal</span>
            </div>
            <div className={'tn hound' + (s.turn === 'hound' && !s.winner ? ' on' : '')}>
              <span className="tn-mark hound">{HOUND_GLYPH}</span>
              <span className="tn-name">Rival · Hounds ×{s.hounds.length}</span>
              <span className="tn-tag">forward only</span>
            </div>
          </div>
          <div className="panel hintbox"><span className="hint-l">Hint</span>{hint}</div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: FHState; onNew: () => void }) {
  const won = s.winner === 'fox'
  return (
    <Modal
      eyebrow={won ? 'Broken free' : 'Run to ground'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">{won ? 'The fox darts past the line' : 'The pack pins the fox'}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Fox and Hounds" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The game lives on the <b>dark squares</b> of the board. You are the lone <b>fox</b>; the rival drives the four <b>hounds</b>. Each turn a piece steps <b>one square diagonally</b> to an empty dark square — no captures, no jumps.</p>
        <p>The <b>fox</b> may move along <i>any</i> of the four diagonals — forward or backward. The <b>hounds</b> may only move <i>forward</i>, advancing toward your home row, so their wall can never retreat.</p>
        <p>The <b>fox wins</b> by slipping all the way to the hounds' back row — or by jamming every hound so none can move. The <b>hounds win</b> if they trap the fox with no legal move left.</p>
        <p>Click the fox to select it, then click a glowing square to dart there. With a perfect wall the hounds are unbeatable — so wait for a crooked line and sprint through the gap.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
