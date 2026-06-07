/* SENET — UI (built for this codebase). A papyrus-and-lapis reed board on the framework shell.
   Cast the four sticks, then your movable pawns light up — click one to move. A throw of 1/4/5
   grants another cast; the House of Water sweeps a pawn back; bear off square 30.

   Online-capable: useGameSession drives the host/guest seat model. In solo play you are seat 0
   and the rival is an AI; online, the opponent is a remote human. Everything renders relative to
   `mySeat`, so a guest sitting in seat 1 still sees "their" pawns highlight and wins for them. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { senetAdapter } from './net'
import * as SN from './logic'
import type { Player, SenetState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3c2f15" stroke="#e0c485" strokeWidth="1.5" />
    <g fill="#e0c060">
      <rect x="9" y="13" width="30" height="6" rx="2" />
      <rect x="9" y="21" width="30" height="6" rx="2" opacity="0.78" />
      <rect x="9" y="29" width="30" height="6" rx="2" opacity="0.58" />
    </g>
    <circle cx="34" cy="16" r="3.2" fill="#2a5e86" stroke="#e0c485" strokeWidth="0.8" />
    <circle cx="33" cy="32" r="3.2" fill="#221802" stroke="#e0c060" strokeWidth="0.8" />
  </svg>
)

// glyphs for the special squares (by path index)
const GLYPH: Record<number, string> = {
  [SN.BEAUTY]: '☥', // House of Beauty (ankh)
  [SN.WATER]: '≈',  // House of Water
  [SN.HORUS]: '◈',  // House of Horus (bear-off)
}

export function Senet() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(senetAdapter)
  const me = mySeat as Player        // seat 0 = obsidian, seat 1 = alabaster
  const foe: Player = me === 0 ? 1 : 0
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setShowRules(false) }

  const yourTurn = s.winner == null && isMyTurn
  const canThrow = yourTurn && s.phase === 'throw'

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => setShowRules(false),
    extra: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && canThrow) { dispatch({ kind: 'throw' }); return true }
      return false
    },
  })

  const movable = useMemo(
    () => (yourTurn && s.phase === 'move' && s.roll != null ? new Set(SN.legalMoves(s, me, s.roll)) : new Set<number>()),
    [yourTurn, s, me],
  )

  function clickPawn(idx: number) {
    if (yourTurn && s.phase === 'move' && movable.has(idx)) dispatch({ kind: 'move', pawn: idx })
  }
  function throwNow() { if (canThrow) dispatch({ kind: 'throw' }) }

  const oppLabel = net.online ? 'The opponent' : 'The rival'

  let banner: string, bk = ''
  if (s.winner === me) { bk = 'win'; banner = 'You win — all five pawns borne off' }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppLabel} races all pawns off` }
  else if (canThrow) { bk = 'you'; banner = 'Your turn — cast the sticks' }
  else if (yourTurn && s.phase === 'move') { bk = 'you'; banner = `You cast a ${s.roll} — move a glowing pawn` }
  else { bk = 'foe'; banner = `${oppLabel} is casting…` }

  // physical render: build a [row][col] grid of path indices
  const grid: number[][] = []
  for (let r = 0; r < SN.ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < SN.COLS; c++) row.push(SN.pathOf(r, c))
    grid.push(row)
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Senet · ancient Egyptian race"
        title="Senet"
        subtitle="the 5,000-year-old passing-of-the-soul race — cast the sticks, bear all five pawns off"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Off ${s.off[me]}/${SN.PAWNS} · ${s.off[foe]}/${SN.PAWNS}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>space · cast &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="sn-wrap">
          <div className="sn-board">
            {grid.flatMap((row) =>
              row.map((idx) => {
                const owner = s.board[idx]
                const mv = owner === me && movable.has(idx)
                const cls =
                  'sn-cell' +
                  (idx === SN.BEAUTY ? ' beauty' : '') +
                  (idx === SN.WATER ? ' water' : '') +
                  (idx === SN.HORUS ? ' bear' : '') +
                  (idx === 27 || idx === 28 ? ' exact' : '')
                return (
                  <div key={idx} className={cls} onClick={() => owner === me && clickPawn(idx)}>
                    <span className="sn-num">{idx + 1}</span>
                    {GLYPH[idx] && <span className="sn-glyph" aria-hidden="true">{GLYPH[idx]}</span>}
                    {owner != null && (
                      <span className={'sn-pawn p' + owner + (mv ? ' movable' : '')} aria-hidden="true" />
                    )}
                  </div>
                )
              }),
            )}
          </div>

          <div className="sn-sticks" onClick={throwNow}>
            {s.sticks.map((d, i) => (
              <span key={i} className={'sn-stick' + (d ? ' up' : '')} aria-hidden="true" />
            ))}
            <span className={'sn-rollnum' + (s.roll != null ? ' show' : '')}>{s.roll != null ? s.roll : '–'}</span>
            <button
              className={'sn-rollbtn' + (canThrow ? ' live' : '')}
              disabled={!canThrow}
              onClick={(e) => { e.stopPropagation(); throwNow() }}
            >
              {canThrow ? 'Cast' : yourTurn && s.phase === 'move' ? 'Move' : 'Wait'}
            </button>
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />
          <div className="panel scoreboard">
            <PlayerRow s={s} p={me} name="You · Obsidian" on={s.turn === me && s.winner == null} />
            <PlayerRow s={s} p={foe} name={`${net.online ? 'Opponent' : 'Rival'} · Alabaster`} on={s.turn === foe && s.winner == null} />
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} me={me} online={net.online} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function PlayerRow({ s, p, name, on }: { s: SenetState; p: Player; name: string; on: boolean }) {
  const onBoard = s.board.filter(b => b === p).length
  const offCount = s.off[p]
  return (
    <div className={'pr p' + p + (on ? ' on' : '')}>
      <div className="pr-top"><span className={'pr-dot p' + p} /><span className="pr-name">{name}</span></div>
      <div className="pr-stats">
        <span className="pr-stat"><b>{onBoard}</b> on</span>
        <span className="pr-stat home"><b>{offCount}</b> off</span>
      </div>
      <div className="pr-pips">
        {Array.from({ length: SN.PAWNS }, (_, i) => {
          const borne = i < offCount
          return <span key={i} className={'pip p' + p + ' ' + (borne ? 'off' : 'on')} />
        })}
      </div>
    </div>
  )
}

function ResultModal({ s, me, online, onNew }: { s: SenetState; me: Player; online: boolean; onNew: () => void }) {
  const won = s.winner === me
  const foe: Player = me === 0 ? 1 : 0
  const oppName = online ? 'Opponent' : 'Rival'
  return (
    <Modal
      eyebrow={won ? 'All pawns home' : 'Out-raced'}
      title={won ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {s.off[me]}/{SN.PAWNS}</span>
        <span className="foe">{oppName} {s.off[foe]}/{SN.PAWNS}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Senet" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>A 5,000-year-old Egyptian race over <b>30 squares</b> in 3 rows of 10, run in a
          <b> boustrophedon</b> path (row 1 left→right, row 2 right→left, row 3 left→right). You are
          the <b>obsidian</b> pawns; the rival is <b>alabaster</b>. Each side has <b>five pawns</b>,
          interleaved on the first row.</p>
        <p>On your turn, <b>cast the four sticks</b> — each blank or white. The move is the count of
          whites, but <b>all blank counts as 5</b>. A throw of <b>1, 4 or 5</b> earns an
          <i> extra cast</i>.</p>
        <p>Advance <b>one</b> pawn forward onto an empty square, or onto a lone <b>opponent</b> pawn to
          <b> swap</b> it back to your pawn's square. You cannot land on your own pawn. Two adjacent
          opponent pawns form a <b>block</b> you cannot pass or land on.</p>
        <p>Square <b>27 (House of Water)</b> sweeps a pawn back toward square 15. Squares <b>28–30</b>
          need an <i>exact</i> throw to bear a pawn <b>off</b> the board.</p>
        <p>First to bear <b>all five</b> pawns off wins.</p>
        <p><b>Keys:</b> <kbd>Space</kbd> cast · <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
