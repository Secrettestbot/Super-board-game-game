/* FOX AND HOUNDS — UI (built for this codebase). 8x8 checkerboard on the framework shell.
   Asymmetric two-player: ONE seat is the sly fox, the other drives the four hounds. In solo
   play you are the fox (seat 0) and a minimax AI runs the hounds (seat 1). Online, a guest
   can take the opposite seat and drive the hounds against you. Click your own piece, then a
   highlighted diagonal square to move it. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { foxHoundsAdapter } from './net'
import * as FH from './logic'
import type { Side } from './logic'

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
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(foxHoundsAdapter)
  const mySide: Side = mySeat === 0 ? 'fox' : 'hound' // seat 0 = fox, seat 1 = hounds
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null) // selected square (fox square, or a hound's square)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSel(null) } })

  const yourTurn = s.winner == null && isMyTurn
  const houndSet = useMemo(() => new Set(s.hounds), [s.hounds])

  // legal destination squares for the currently selected piece (only when it's your turn)
  const targets = useMemo(() => {
    if (!yourTurn || sel == null) return new Set<number>()
    const occ = new Set<number>([s.fox, ...s.hounds])
    if (mySide === 'fox') {
      return sel === s.fox ? new Set(FH.foxMoves(s.fox, occ)) : new Set<number>()
    }
    return houndSet.has(sel) ? new Set(FH.houndMoves(sel, occ)) : new Set<number>()
  }, [yourTurn, sel, mySide, s.fox, s.hounds, houndSet])

  // can my side move at all this turn?
  const canMove = yourTurn && FH.legalMoves({ fox: s.fox, hounds: s.hounds }, mySide).length > 0

  function isMine(i: number): boolean {
    return mySide === 'fox' ? i === s.fox : houndSet.has(i)
  }

  function clickCell(i: number) {
    if (!yourTurn) return
    if (isMine(i)) { setSel(v => (v === i ? null : i)); return }
    if (sel != null && targets.has(i)) {
      if (mySide === 'fox') dispatch({ to: i })
      else dispatch({ to: i, hi: s.hounds.indexOf(sel) })
      setSel(null)
    }
  }

  // banner + result, relative to MY side
  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const iWon = s.winner != null && s.winner === mySide
  const myName = mySide === 'fox' ? 'Fox' : 'Hounds'

  let banner: string, bk = ''
  if (s.winner != null) {
    bk = iWon ? 'win' : 'lose'
    banner = iWon
      ? (mySide === 'fox' ? 'You Win — the fox slips free' : 'You Win — the pack closes in')
      : (mySide === 'fox' ? `${oppLabel} Wins — the pack closes in` : `${oppLabel} Wins — the fox slips free`)
  } else if (yourTurn) {
    bk = 'you'
    banner = sel != null ? 'Pick a glowing square to move to' : `Your turn — click your ${mySide === 'fox' ? 'fox' : 'hound'}`
  } else {
    bk = 'foe'
    banner = net.online ? `${oppLabel} is moving…` : (mySide === 'fox' ? 'The hounds are circling…' : 'The fox is darting…')
  }

  const hint = canMove
    ? (mySide === 'fox'
      ? 'Drift sideways and back to bait a gap, then sprint through it.'
      : 'Keep the wall unbroken and advance together — never leave a diagonal open.')
    : (yourTurn ? 'No legal move left…' : 'Watch for the moment the line bends.')

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Fox &amp; Hounds · the hunt"
        title="Fox and Hounds"
        subtitle={mySide === 'fox'
          ? 'you are the fox — slip past four relentless hounds to the far back row'
          : 'you drive the hounds — herd the fox into a corner with no escape'}
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
                (sel === i ? ' picked' : '') +
                (s.last === i ? ' last' : '')
              const clickable = yourTurn && (isMine(i) || targets.has(i))
              return (
                <div key={i} className={cls + (clickable ? ' clickable' : '')} onClick={() => clickCell(i)}>
                  {isFox && <div className={'fh-piece fox' + (yourTurn && mySide === 'fox' ? ' live' : '')}>{FOX_GLYPH}</div>}
                  {isHound && <div className={'fh-piece hound' + (yourTurn && mySide === 'hound' ? ' live' : '')}>{HOUND_GLYPH}</div>}
                  {!isFox && !isHound && targets.has(i) && <div className="fh-dot" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel turnbox">
            <div className={'tn fox' + (s.turn === 'fox' && s.winner == null ? ' on' : '')}>
              <span className="tn-mark fox">{FOX_GLYPH}</span>
              <span className="tn-name">{mySide === 'fox' ? 'You · Fox' : `${oppLabel} · Fox`}</span>
              <span className="tn-tag">any diagonal</span>
            </div>
            <div className={'tn hound' + (s.turn === 'hound' && s.winner == null ? ' on' : '')}>
              <span className="tn-mark hound">{HOUND_GLYPH}</span>
              <span className="tn-name">{mySide === 'hound' ? 'You · Hounds' : `${oppLabel} · Hounds`} ×{s.hounds.length}</span>
              <span className="tn-tag">forward only</span>
            </div>
          </div>
          <div className="panel hintbox"><span className="hint-l">Hint</span>{hint}</div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={iWon} mySide={mySide} oppLabel={oppLabel} myName={myName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, mySide, oppLabel, myName, onNew }: { won: boolean; mySide: Side; oppLabel: string; myName: string; onNew: () => void }) {
  const eyebrow = won
    ? (mySide === 'fox' ? 'Broken free' : 'Run to ground')
    : (mySide === 'fox' ? 'Run to ground' : 'Broken free')
  const blurb = won
    ? (mySide === 'fox' ? 'The fox darts past the line' : 'The pack pins the fox')
    : (mySide === 'fox' ? 'The pack pins the fox' : 'The fox darts past the line')
  return (
    <Modal
      eyebrow={eyebrow}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>{blurb} — {myName}.</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Fox and Hounds" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The game lives on the <b>dark squares</b> of the board. One side is the lone <b>fox</b>; the other drives the four <b>hounds</b>. Each turn a piece steps <b>one square diagonally</b> to an empty dark square — no captures, no jumps.</p>
        <p>The <b>fox</b> may move along <i>any</i> of the four diagonals — forward or backward. The <b>hounds</b> may only move <i>forward</i>, advancing toward the fox's home row, so their wall can never retreat.</p>
        <p>The <b>fox wins</b> by slipping all the way to the hounds' back row — or by jamming every hound so none can move. The <b>hounds win</b> if they trap the fox with no legal move left.</p>
        <p>Click your own piece to select it, then click a glowing square to move there. With a perfect wall the hounds are unbeatable — so the fox must wait for a crooked line and sprint through the gap.</p>
        <p>In solo play you are the fox against a minimax AI. <b>Online,</b> a second player can take the hounds (or the fox) against you.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
