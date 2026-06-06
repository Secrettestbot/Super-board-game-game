/* STRATEGO — UI (built for this codebase). 8x8 reduced board on the framework shell vs a
   belief-based heuristic AI. Your ranks are visible; the enemy is face-down until combat
   reveals it. Click one of your mobile pieces to see its legal steps / scout slides / strikes,
   then click a target. Combat flares a crimson flash on the contested square. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as ST from './logic'
import type { StrategoState, Move, Captured } from './logic'

const { N, RANK_NAME, RANK_SHORT, RANK_BOMB, RANK_FLAG, isPiece, isLake } = ST

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#20251a" stroke="#4a5234" strokeWidth="1.5" />
    <rect x="10" y="11" width="12" height="14" rx="2" fill="#4a5163" stroke="#6b7390" strokeWidth="0.6" />
    <rect x="26" y="11" width="12" height="14" rx="2" fill="#d8b455" stroke="#f0d27c" strokeWidth="0.6" />
    <path d="M24 36 L24 25 M24 25 L34 27 L24 31 Z" fill="#ecca6a" stroke="#a8842f" strokeWidth="0.8" strokeLinejoin="round" />
    <rect x="22.5" y="34" width="3" height="6" rx="1" fill="#7c8166" />
  </svg>
)

// human-readable label for a captured chip
function chipLabel(rank: number): string {
  return RANK_SHORT[rank] ?? String(rank)
}

export function Stratego() {
  const [s, setS] = useState<StrategoState>(() => ST.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [moveTick, setMoveTick] = useState(0)

  function newGame() {
    setS(ST.makeGame()); setSel(null); setShowRules(false); setMoveTick(t => t + 1)
  }

  // AI plays player 1, one move per turn.
  useAITurn(s.winner == null && s.turn === 1, () => {
    setS(p => ST.aiMove(p)); setMoveTick(t => t + 1)
  }, { delayMs: 600, tick: moveTick })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const yourTurn = s.winner == null && s.turn === 0
  const myMoves = useMemo(() => (yourTurn ? ST.legalMoves(s, 0) : []), [yourTurn, s])
  const movable = useMemo(() => new Set(myMoves.map(m => m.from)), [myMoves])
  const dests = useMemo(() => {
    const map = new Map<number, Move>()
    if (sel != null) for (const m of myMoves) if (m.from === sel) map.set(m.to, m)
    return map
  }, [myMoves, sel])

  const { you, ai } = ST.counts(s.board)
  const flareCells = s.reveal ? new Set([s.reveal.from, s.reveal.to]) : new Set<number>()

  function clickCell(i: number) {
    if (!yourTurn) return
    const dest = dests.get(i)
    if (dest) {
      setS(ST.move(s, 0, dest.from, dest.to)); setSel(null); setMoveTick(t => t + 1)
      return
    }
    const cell = s.board[i]
    if (isPiece(cell) && cell.owner === 0 && movable.has(i)) {
      setSel(i === sel ? null : i)
      return
    }
    setSel(null)
  }

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You captured the enemy flag — victory!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'Your flag has fallen — the enemy wins' }
  else if (yourTurn) { bk = 'you'; banner = sel == null ? 'Your move — pick a piece' : 'Choose a destination or strike' }
  else { bk = 'foe'; banner = 'The enemy is maneuvering…' }

  const youLost = s.captured.filter(c => c.owner === 0)
  const foeLost = s.captured.filter(c => c.owner === 1)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Stratego · hold the line"
        title="Stratego"
        subtitle="rank your hidden army, probe the enemy, and storm the flag — bombs and the spy change everything"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="8 × 8 · reduced"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="st-wrap">
          <div className="st-board">
            {s.board.map((cell, i) => {
              const isDark = ((Math.floor(i / N) + (i % N)) % 2) === 1
              const dest = dests.get(i)
              const lake = isLake(cell)
              const cls = 'st-cell'
                + (lake ? ' lake' : isDark ? ' dark' : ' light')
                + (sel === i ? ' sel' : '')
                + (dest ? (isPiece(cell) ? ' attackhere' : ' movehere') : '')
                + (s.last && (s.last.from === i || s.last.to === i) ? ' last' : '')
                + (flareCells.has(i) ? ' flare' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {isPiece(cell) && <PieceView state={s} cell={cell} live={cell.owner === 0 && movable.has(i) && yourTurn} />}
                  {!isPiece(cell) && !lake && dest && <div className="st-dot" />}
                  {isPiece(cell) && dest && <div className="st-ring" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <div className="panel-h">Forces afield</div>
            <div className="muster">
              <div className={'muster-row foe' + (s.turn === 1 && s.winner == null ? ' on' : '')}>
                <span className="muster-pip foe" /><span className="muster-name">Enemy</span><span className="muster-n">{ai}</span>
              </div>
              <div className={'muster-row you' + (s.turn === 0 && s.winner == null ? ' on' : '')}>
                <span className="muster-pip you" /><span className="muster-name">You</span><span className="muster-n">{you}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">Enemy losses</div>
            <Tray pieces={foeLost} side="foe" />
          </div>
          <div className="panel">
            <div className="panel-h">Your losses</div>
            <Tray pieces={youLost} side="you" />
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} you={you} ai={ai} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PieceView({ state, cell, live }: { state: StrategoState; cell: ST.Piece; live: boolean }) {
  const yours = cell.owner === 0
  // You always see your own ranks. Enemy pieces are shown only once revealed in combat.
  const shown = yours || cell.revealed
  const rank = cell.rank
  const special = rank === RANK_FLAG ? ' flag' : rank === RANK_BOMB ? ' bomb' : ''
  const cls = 'st-piece ' + (yours ? 'you' : 'foe')
    + (shown ? '' : ' hidden')
    + (cell.revealed && !yours ? ' revealed' : '')
    + (live ? ' live' : '')
    + special
  void state
  return (
    <div className={cls} title={shown ? RANK_NAME[rank] : 'Unknown enemy'}>
      <span className="st-rk">{shown ? RANK_SHORT[rank] : ''}</span>
    </div>
  )
}

function Tray({ pieces, side }: { pieces: Captured[]; side: 'you' | 'foe' }) {
  if (!pieces.length) return <div className="tray"><span className="tray-empty">none yet</span></div>
  return (
    <div className="tray">
      {pieces.map((p, i) => (
        <span key={i} className={'tray-pc ' + side} title={RANK_NAME[p.rank]}>{chipLabel(p.rank)}</span>
      ))}
    </div>
  )
}

function ResultModal({ s, you, ai, onNew }: { s: StrategoState; you: number; ai: number; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Flag taken' : 'Line broken'}
      title={won ? 'You Win' : 'Enemy Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {you}</span><span className="foe">Enemy {ai}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Stratego" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Your army of 16 sits hidden on the bottom rows. <i>You</i> see your ranks; the enemy is face-down until you fight. Pieces move one square orthogonally; a <b>Scout (2)</b> slides any distance in a straight line. Bombs and the Flag never move; the two central <i>lakes</i> are impassable.</p>
        <p><b>Combat</b> — move onto an enemy and both reveal. Higher rank wins (Marshal 10 is the strongest mover, Spy 1 the weakest); equal ranks both die. Specials: a <b>Spy</b> beats the <b>Marshal</b> only when the spy attacks; a <b>Miner (3)</b> defuses a <b>Bomb</b>, but any other attacker dies to it.</p>
        <p><b>Win</b> by capturing the enemy <i>Flag</i> — or by leaving the enemy with no piece it can move.</p>
        <p>The enemy never peeks at your ranks: it reasons from your moves and from combats it has seen.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
