/* THE ROYAL GAME OF UR — UI (built for this codebase). A lapis-and-shell inlay board on the
   framework shell, vs a heuristic AI or a remote opponent. Roll the four dice, then the movable
   pieces light up — click one to move. Rosettes grant another roll; capture on the shared path.
   Seat-relative: your pieces are always the ones for `mySeat` (seat 0 = light, seat 1 = dark). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { urAdapter } from './net'
import * as UR from './logic'
import type { Player, UrState } from './logic'

/* ---- Physical board geometry ----
   3 rows × 8 cols. Row 0 = the light side, row 1 = the shared bridge, row 2 = the dark side.
   The two cells row0/row2 at cols 3,4 are absent (the classic Ur gap). Each player's TRACK
   (0..13) maps to physical [row,col] cells; the shared row is row 1 for both. */
const COLS = 8, ROWS = 3
// the light ('you') track 0..13 → [row,col]
const TRACK_YOU: [number, number][] = [
  [0, 3], [0, 2], [0, 1], [0, 0],                       // 0..3 entry column (3 = rosette)
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], // 4..11 shared (7 = centre rosette)
  [0, 7], [0, 6],                                        // 12..13 exit (13 = rosette)
]
const TRACK_FOE: [number, number][] = [
  [2, 3], [2, 2], [2, 1], [2, 0],
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
  [2, 7], [2, 6],
]
const key = (r: number, c: number) => r * COLS + c
// physical cells that exist (skip the gap)
const EXISTS = new Set<number>()
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!((r === 0 || r === 2) && (c === 3 || c === 4))) EXISTS.add(key(r, c))
// physical cells carrying a rosette
const ROSETTE_CELLS = new Set<number>()
for (const t of UR.ROSETTES) { const [r, c] = TRACK_YOU[t]; ROSETTE_CELLS.add(key(r, c)); const [r2, c2] = TRACK_FOE[t]; ROSETTE_CELLS.add(key(r2, c2)) }

const trackCell = (p: Player, t: number) => (p === 'you' ? TRACK_YOU : TRACK_FOE)[t]

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#1b2f6b" stroke="#3a59b0" strokeWidth="1.5" />
    <g fill="#e9c45a">
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2
        return <path key={i} d={`M24 24 L${24 + 11 * Math.cos(a - 0.18)} ${24 + 11 * Math.sin(a - 0.18)} L${24 + 14 * Math.cos(a)} ${24 + 14 * Math.sin(a)} L${24 + 11 * Math.cos(a + 0.18)} ${24 + 11 * Math.sin(a + 0.18)} Z`} />
      })}
    </g>
    <circle cx="24" cy="24" r="5" fill="#f0f0e6" stroke="#1b2f6b" strokeWidth="1" />
  </svg>
)

// seat → the logic Player it controls (seat 0 = light 'you', seat 1 = dark 'foe')
const SEAT_PLAYER: Player[] = ['you', 'foe']

export function Ur() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(urAdapter)
  const [showRules, setShowRules] = useState(false)

  // "my" player and "their" player relative to this seat
  const me = SEAT_PLAYER[mySeat] ?? 'you'
  const them: Player = me === 'you' ? 'foe' : 'you'

  function newGame() { netNew(); setShowRules(false) }

  const over = s.winner != null
  const yourTurn = !over && isMyTurn
  const canRoll = yourTurn && !s.rolled
  const movable = useMemo(
    () => (yourTurn && s.rolled && s.roll ? new Set(UR.legalMoves(s, me, s.roll)) : new Set<number>()),
    [yourTurn, s.rolled, s.roll, s, me],
  )

  function clickPiece(p: Player, idx: number) {
    if (p === me && yourTurn && s.rolled && movable.has(idx)) dispatch({ kind: 'move', piece: idx })
  }
  function rollNow() { if (canRoll) dispatch({ kind: 'roll' }) }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && canRoll) { rollNow(); return true }
      return false
    },
  })

  // map physical cell → occupant {player, idx, movable}
  const occupant = useMemo(() => {
    const m = new Map<number, { p: Player; idx: number; mv: boolean }>()
    for (const pl of ['you', 'foe'] as Player[]) {
      s.pieces[pl].forEach((t, idx) => {
        if (t >= 0 && t < UR.HOME) {
          const [r, c] = trackCell(pl, t)
          m.set(key(r, c), { p: pl, idx, mv: pl === me && movable.has(idx) })
        }
      })
    }
    return m
  }, [s.pieces, movable, me])

  const lastCell = s.last && s.last.to >= 0 && s.last.to < UR.HOME ? key(...trackCell(s.last.player, s.last.to)) : -1

  const oppLabel = net.online ? 'Opponent' : 'The rival'
  const iWon = s.winner === me
  const justRosette = s.last?.player === me && s.rolled === false && s.last.to < UR.HOME && UR.ROSETTES.has(s.last.to)

  let banner: string, bk = ''
  if (over && iWon) { bk = 'win'; banner = 'You win — all seven stones home' }
  else if (over) { bk = 'lose'; banner = `${oppLabel} wins the race` }
  else if (yourTurn && canRoll) { bk = 'you'; banner = justRosette ? 'Rosette — roll again!' : 'Your turn — roll the dice' }
  else if (yourTurn && s.rolled) { bk = 'you'; banner = `You rolled a ${s.roll} — move a glowing piece` }
  else { bk = 'foe'; banner = net.online ? `${oppLabel} is playing…` : 'The rival is playing…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Royal Game of Ur · race &amp; capture"
        title="The Royal Game of Ur"
        subtitle="the oldest race-game on earth — roll the four dice, run all seven stones home"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Home ${UR.home(s, me)}/7 · ${UR.home(s, them)}/7`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · roll &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="ur-wrap">
          <div className="ur-board">
            {Array.from({ length: ROWS * COLS }, (_, cell) => {
              const r = Math.floor(cell / COLS)
              if (!EXISTS.has(cell)) return <div key={cell} className="ur-gap" />
              const occ = occupant.get(cell)
              const ros = ROSETTE_CELLS.has(cell)
              const safe = cell === key(...TRACK_YOU[UR.SAFE_ROSETTE])
              return (
                <div
                  key={cell}
                  className={'ur-cell' + (ros ? ' ros' : '') + (safe ? ' safe' : '') + (r === 1 ? ' shared' : r === 0 ? ' youside' : ' foeside') + (lastCell === cell ? ' last' : '')}
                  onClick={() => occ && clickPiece(occ.p, occ.idx)}
                >
                  {ros && <span className="ur-rosette" aria-hidden="true" />}
                  {occ && <span className={'ur-piece ' + occ.p + (occ.mv ? ' movable' : '')} />}
                </div>
              )
            })}
          </div>

          <div className="ur-dice" onClick={rollNow}>
            {s.dice.map((d, i) => (
              <span key={i} className={'die' + (d ? ' up' : '')} aria-hidden="true">
                <svg viewBox="0 0 28 28"><polygon points="14,3 25,24 3,24" /><circle className="pip" cx="14" cy="10" r="2.4" /></svg>
              </span>
            ))}
            <span className={'ur-rollnum' + (s.roll != null ? ' show' : '')}>{s.roll != null ? s.roll : '–'}</span>
            <button className={'ur-rollbtn' + (canRoll ? ' live' : '')} disabled={!canRoll} onClick={(e) => { e.stopPropagation(); rollNow() }}>
              {canRoll ? 'Roll' : yourTurn && s.rolled ? 'Move' : 'Wait'}
            </button>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel scoreboard">
            <PlayerRow s={s} p={me} name="You · Light" on={!over && s.turn === me} />
            <PlayerRow s={s} p={them} name={`${oppLabel} · Dark`} on={!over && s.turn === them} />
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {over && <ResultModal s={s} me={me} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerRow({ s, p, name, on }: { s: UrState; p: Player; name: string; on: boolean }) {
  return (
    <div className={'pr ' + p + (on ? ' on' : '')}>
      <div className="pr-top"><span className={'pr-dot ' + p} /><span className="pr-name">{name}</span></div>
      <div className="pr-stats">
        <span className="pr-stat"><b>{UR.off(s, p)}</b> off</span>
        <span className="pr-stat"><b>{UR.onBoard(s, p)}</b> on</span>
        <span className="pr-stat home"><b>{UR.home(s, p)}</b> home</span>
      </div>
      <div className="pr-track">
        {Array.from({ length: UR.PIECES }, (_, i) => {
          const t = s.pieces[p][i]
          const cls = t === UR.HOME ? 'home' : t === UR.OFF ? 'off' : 'on'
          return <span key={i} className={'pip ' + p + ' ' + cls} />
        })}
      </div>
    </div>
  )
}

function ResultModal({ s, me, oppLabel, onNew }: { s: UrState; me: Player; oppLabel: string; onNew: () => void }) {
  const won = s.winner === me
  const them: Player = me === 'you' ? 'foe' : 'you'
  return (
    <Modal
      eyebrow={won ? 'Stones all home' : 'Out-raced'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {UR.home(s, me)}/7</span><span className="foe">{oppLabel} {UR.home(s, them)}/7</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="The Royal Game of Ur" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>A 4,500-year-old race. You are the <b>light</b> stones; the rival is <b>dark</b>. Each side has <b>seven pieces</b> waiting off the board and its own 14-square <b>track</b>: up your side, across the shared middle row, and back up your side to bear off.</p>
        <p>On your turn, <b>roll the four dice</b> — each shows 0 or 1, so you move <b>0 to 4</b>. A zero forfeits the turn. Otherwise advance <b>one</b> piece by that amount: enter a new piece, move along, or <b>bear off</b> past the end (you need the <i>exact</i> count).</p>
        <p>On the shared middle row, landing on an enemy piece <b>captures</b> it — back to the start — except on the central <b>rosette</b>, which is safe. Land on any of the five <b>rosettes</b> to take an <i>extra turn</i>.</p>
        <p>First to bring <b>all seven</b> stones home wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> roll · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
