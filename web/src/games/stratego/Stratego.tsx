/* STRATEGO — UI (built for this codebase). 8x8 reduced board on the framework shell.
   Solo: vs a belief-based heuristic AI. Online: two commanders, each privately deploying a
   16-piece army, then maneuvering. Seat-relative — your army (the pieces you own, derived
   from mySeat) is fully visible; the opponent's pieces show face-down backs until combat
   reveals them. Hidden info is enforced by the adapter's redactFor: the opponent's
   un-revealed ranks never cross the wire. Click one of your mobile pieces to see its legal
   steps / scout slides / strikes, then click a target. Combat flares the contested square. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { strategoAdapter } from './net'
import type { PlacedPiece } from './net'
import * as ST from './logic'
import type { Move, Captured, Player } from './logic'

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

const idx = (r: number, c: number) => r * N + c

// human-readable label for a captured chip
function chipLabel(rank: number): string {
  return RANK_SHORT[rank] ?? String(rank)
}

// The two home rows a seat deploys onto (must match net.ts SEAT_ROWS).
const SEAT_ROWS: Record<number, [number, number]> = { 0: [6, 7], 1: [0, 1] }

/** A random valid deployment for `seat`: the ARMY shuffled onto its 16 home cells. */
function randomLayout(seat: number): PlacedPiece[] {
  const rows = SEAT_ROWS[seat]
  const cells: number[] = []
  for (const r of rows) for (let c = 0; c < N; c++) cells.push(idx(r, c))
  // Fisher-Yates shuffle the cells.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    const t = cells[i]; cells[i] = cells[j]; cells[j] = t
  }
  return ST.ARMY.map((rank, k) => ({ cell: cells[k], rank }))
}

export function Stratego() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(strategoAdapter)
  const me = mySeat as Player // seat 0 / 1 == owner on the board
  const foe: Player = me === 0 ? 1 : 0

  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [layout, setLayout] = useState<PlacedPiece[]>(() => randomLayout(mySeat))

  const inSetup = s._phase === 'setup'
  const iNeedToDeploy = inSetup && isMyTurn

  function newGame() {
    netNew(); setSel(null); setShowRules(false); setLayout(randomLayout(mySeat))
  }

  const yourTurn = s.winner == null && !inSetup && isMyTurn
  const myMoves = useMemo(() => (yourTurn ? ST.legalMoves(s, me) : []), [yourTurn, s, me])
  const movable = useMemo(() => new Set(myMoves.map(m => m.from)), [myMoves])
  const dests = useMemo(() => {
    const map = new Map<number, Move>()
    if (sel != null) for (const m of myMoves) if (m.from === sel) map.set(m.to, m)
    return map
  }, [myMoves, sel])

  // A pseudo-board for the deployment preview: your chosen layout, opponent cells empty.
  const deployBoard = useMemo(() => {
    const board = s.board.map(c => (isLake(c) ? c : null)) as ST.Cell[]
    for (const p of layout) {
      board[p.cell] = { rank: p.rank, owner: me, revealed: false, moved: false, id: p.cell }
    }
    return board
  }, [layout, s.board, me])

  const board = inSetup ? deployBoard : s.board

  const { you, ai } = ST.counts(s.board)
  const myCount = me === 0 ? you : ai
  const foeCount = me === 0 ? ai : you
  const flareCells = s.reveal ? new Set([s.reveal.from, s.reveal.to]) : new Set<number>()

  function clickCell(i: number) {
    if (!yourTurn) return
    const dest = dests.get(i)
    if (dest) {
      dispatch({ kind: 'move', from: dest.from, to: dest.to }); setSel(null)
      return
    }
    const cell = s.board[i]
    if (isPiece(cell) && cell.owner === me && movable.has(i)) {
      setSel(i === sel ? null : i)
      return
    }
    setSel(null)
  }

  function confirmDeploy() {
    dispatch({ kind: 'setup', layout })
    setSel(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else setSel(null) },
  })

  const oppLabel = net.online ? 'Opponent' : 'Enemy'
  const myWin = s.winner === me

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You captured the enemy flag — victory!' }
  else if (s.winner === foe) { bk = 'lose'; banner = `Your flag has fallen — ${oppLabel.toLowerCase()} wins` }
  else if (inSetup) {
    if (iNeedToDeploy) { bk = 'you'; banner = 'Deploy your army, then confirm' }
    else { bk = 'foe'; banner = `Waiting for ${oppLabel.toLowerCase()} to deploy…` }
  }
  else if (yourTurn) { bk = 'you'; banner = sel == null ? 'Your move — pick a piece' : 'Choose a destination or strike' }
  else { bk = 'foe'; banner = `${oppLabel} is maneuvering…` }

  const myLost = s.captured.filter(c => c.owner === me)
  const foeLost = s.captured.filter(c => c.owner === foe)

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
            {board.map((cell, i) => {
              const isDark = ((Math.floor(i / N) + (i % N)) % 2) === 1
              const dest = dests.get(i)
              const lake = isLake(cell)
              const cls = 'st-cell'
                + (lake ? ' lake' : isDark ? ' dark' : ' light')
                + (sel === i ? ' sel' : '')
                + (dest ? (isPiece(cell) ? ' attackhere' : ' movehere') : '')
                + (!inSetup && s.last && (s.last.from === i || s.last.to === i) ? ' last' : '')
                + (!inSetup && flareCells.has(i) ? ' flare' : '')
              return (
                <div key={i} className={cls} onClick={() => clickCell(i)}>
                  {isPiece(cell) && <PieceView cell={cell} mySeat={me} live={cell.owner === me && movable.has(i) && yourTurn} />}
                  {!isPiece(cell) && !lake && dest && <div className="st-dot" />}
                  {isPiece(cell) && dest && <div className="st-ring" />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          {iNeedToDeploy ? (
            <div className="panel">
              <div className="panel-h">Deployment</div>
              <div className="modal-body" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-modal" onClick={() => setLayout(randomLayout(mySeat))}>Randomize</button>
                <button className="btn-modal" onClick={confirmDeploy}>Confirm army</button>
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-h">Forces afield</div>
              <div className="muster">
                <div className={'muster-row foe' + (s.turn === foe && s.winner == null && !inSetup ? ' on' : '')}>
                  <span className="muster-pip foe" /><span className="muster-name">{oppLabel}</span><span className="muster-n">{foeCount}</span>
                </div>
                <div className={'muster-row you' + (s.turn === me && s.winner == null && !inSetup ? ' on' : '')}>
                  <span className="muster-pip you" /><span className="muster-name">You</span><span className="muster-n">{myCount}</span>
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-h">{oppLabel} losses</div>
            <Tray pieces={foeLost} side="foe" />
          </div>
          <div className="panel">
            <div className="panel-h">Your losses</div>
            <Tray pieces={myLost} side="you" />
          </div>

          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal won={myWin} my={myCount} foe={foeCount} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PieceView({ cell, mySeat, live }: { cell: ST.Piece; mySeat: Player; live: boolean }) {
  const yours = cell.owner === mySeat
  // You always see your own ranks. Opponent pieces are face-down until combat reveals them.
  const shown = yours || cell.revealed
  const rank = cell.rank
  const special = rank === RANK_FLAG ? ' flag' : rank === RANK_BOMB ? ' bomb' : ''
  const cls = 'st-piece ' + (yours ? 'you' : 'foe')
    + (shown ? '' : ' hidden')
    + (cell.revealed && !yours ? ' revealed' : '')
    + (live ? ' live' : '')
    + special
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

function ResultModal({ won, my, foe, oppLabel, onNew }: { won: boolean; my: number; foe: number; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Flag taken' : 'Line broken'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {my}</span><span className="foe">{oppLabel} {foe}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Stratego" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>Your army of 16 sits hidden on your back rows. <i>You</i> see your ranks; the enemy is face-down until you fight. Pieces move one square orthogonally; a <b>Scout (2)</b> slides any distance in a straight line. Bombs and the Flag never move; the two central <i>lakes</i> are impassable.</p>
        <p><b>Online:</b> each commander privately deploys their army first — randomize until you like the setup, then confirm. Your opponent never sees your ranks, only your face-down pieces, until combat reveals them.</p>
        <p><b>Combat</b> — move onto an enemy and both reveal. Higher rank wins (Marshal 10 is the strongest mover, Spy 1 the weakest); equal ranks both die. Specials: a <b>Spy</b> beats the <b>Marshal</b> only when the spy attacks; a <b>Miner (3)</b> defuses a <b>Bomb</b>, but any other attacker dies to it.</p>
        <p><b>Win</b> by capturing the enemy <i>Flag</i> — or by leaving the enemy with no piece it can move.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
