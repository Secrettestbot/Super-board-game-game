/* DOMINOES — UI (built for this codebase). Double-six block-with-draw, vs a greedy AI
   or a friend online. Ivory tiles on green baize; click a playable tile, then pick an end
   if it fits both. Seat-relative: your hand comes from mySeat, opponents are AI locally
   and "Opponent" online. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { dominoesAdapter } from './net'
import * as DM from './logic'
import type { Player, Tile, End, Placed } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="9" width="36" height="30" rx="6" fill="#ece8db" stroke="#b8b29c" strokeWidth="1.5" />
    <line x1="24" y1="11" x2="24" y2="37" stroke="#b8b29c" strokeWidth="1.5" />
    <circle cx="15" cy="18" r="2.2" fill="#1c211b" />
    <circle cx="15" cy="30" r="2.2" fill="#1c211b" />
    <circle cx="33" cy="15" r="2.2" fill="#1c211b" />
    <circle cx="33" cy="24" r="2.2" fill="#1c211b" />
    <circle cx="33" cy="33" r="2.2" fill="#1c211b" />
  </svg>
)

// pip layouts (which of the 9 grid cells are filled) for values 0..6
const PIP_MAP: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function Pips({ v }: { v: number }) {
  const on = new Set(PIP_MAP[v])
  return (
    <div className="dm-pips">
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={on.has(i) ? 'pip on' : 'pip'} />)}
    </div>
  )
}

function HandTile({ t, vertical, playable, selected, onClick }:
  { t: Tile; vertical?: boolean; playable?: boolean; selected?: boolean; onClick?: () => void }) {
  return (
    <div
      className={'dm-tile' + (vertical ? ' v' : ' h') + (playable ? ' playable' : '') + (selected ? ' selected' : '')}
      onClick={onClick}
    >
      <div className="dm-half"><Pips v={t.a} /></div>
      <div className="dm-half"><Pips v={t.b} /></div>
    </div>
  )
}

function LineTile({ p }: { p: Placed }) {
  const dbl = p.a === p.b
  return (
    <div className={'dm-line-tile' + (dbl ? ' dbl' : '')}>
      <div className="dm-half"><Pips v={p.a} /></div>
      <div className="dm-half"><Pips v={p.b} /></div>
    </div>
  )
}

const SEAT_TO_PLAYER: Player[] = ['you', 'ai']

export function Dominoes() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(dominoesAdapter)
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)   // tileId of the selected hand tile

  function newGame() { netNew(); setShowRules(false); setSel(null) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setShowRules(false); setSel(null) } })

  // Seat-relative identities. seat 0 = 'you', seat 1 = 'ai'.
  const me: Player = SEAT_TO_PLAYER[mySeat] ?? 'you'
  const foe: Player = me === 'you' ? 'ai' : 'you'
  const myHand = s.hands[me]
  const foeHand = s.hands[foe]
  const oppName = net.online ? 'Opponent' : 'Rival'

  const yourTurn = !s.winner && isMyTurn
  const youCanMove = useMemo(() => yourTurn && myHand.some(t => DM.canPlay(s.line, t)), [yourTurn, myHand, s.line])
  const e = DM.ends(s.line)

  const selTile = sel != null ? myHand.find(t => DM.tileId(t) === sel) : undefined
  const selEnds = selTile ? DM.playableEnds(s.line, selTile) : []

  function pickTile(t: Tile) {
    if (!yourTurn) return
    const myEnds = DM.playableEnds(s.line, t)
    if (!myEnds.length) return
    if (myEnds.length === 1) { dispatch({ kind: 'play', tileId: DM.tileId(t), end: myEnds[0] }); setSel(null); return }
    setSel(prev => prev === DM.tileId(t) ? null : DM.tileId(t))   // toggle: needs end choice
  }
  function playEnd(end: End) {
    if (!selTile) return
    dispatch({ kind: 'play', tileId: DM.tileId(selTile), end }); setSel(null)
  }
  function stuckAction() {
    if (!yourTurn || youCanMove) return
    dispatch(s.boneyard.length ? { kind: 'draw' } : { kind: 'pass' })
  }

  const iWon = s.winner === me
  const foeWon = s.winner === foe
  const myScore = s.scores[me]
  const foeScore = s.scores[foe]

  let banner: string, bk = ''
  if (iWon) { bk = 'win'; banner = `You win — +${myScore}` }
  else if (foeWon) { bk = 'lose'; banner = `${oppName} wins — +${foeScore}` }
  else if (s.winner === 'draw') { bk = ''; banner = 'Blocked dead even — a tie' }
  else if (yourTurn && youCanMove) { bk = 'you'; banner = selTile ? 'Choose an end for that tile' : 'Your turn — play a tile' }
  else if (yourTurn) { bk = 'you'; banner = s.boneyard.length ? 'No play — draw from the boneyard' : 'No play — you must pass' }
  else { bk = 'foe'; banner = `${oppName} is thinking…` }

  const stuckLabel = s.boneyard.length ? 'Draw tile' : 'Pass'
  const myTurnNow = !s.winner && isMyTurn
  const foeTurnNow = !s.winner && !isMyTurn && s.turn != null

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Dominoes · block &amp; draw"
        title="Dominoes"
        subtitle="match the open ends, dump your heavy bones, and be first to lay your last tile"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="Double-six · single round"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="dm-wrap">
          <div className="dm-board">
            <div className="dm-rival">
              <span className="dm-rival-l">{oppName} holds</span>
              <div className="dm-backs">
                {foeHand.map((_, i) => <div key={i} className="dm-back" />)}
              </div>
            </div>

            <div className="dm-line-area">
              {e && <div className="dm-end dm-end-l">{e.L}</div>}
              <div className="dm-line">
                {s.line.map((p, i) => <LineTile key={i} p={p} />)}
              </div>
              {e && <div className="dm-end dm-end-r">{e.R}</div>}
            </div>

            <div className="dm-yourhand">
              {myHand.map(t => (
                <HandTile
                  key={DM.tileId(t)}
                  t={t}
                  vertical
                  playable={yourTurn && DM.canPlay(s.line, t)}
                  selected={sel === DM.tileId(t)}
                  onClick={() => pickTile(t)}
                />
              ))}
            </div>

            <div className="dm-actions">
              {selTile && selEnds.length > 1 && (
                <div className="dm-endpick">
                  <span>Attach to:</span>
                  <button className="dm-endbtn" onClick={() => playEnd('L')}>Left · {e?.L}</button>
                  <button className="dm-endbtn" onClick={() => playEnd('R')}>Right · {e?.R}</button>
                </div>
              )}
              {yourTurn && !youCanMove && (
                <button className="dm-stuck" onClick={stuckAction}>{stuckLabel}</button>
              )}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel scoreboard">
            <div className={'sc you' + (myTurnNow ? ' on' : '')}>
              <span className="sc-chip you"></span><span className="sc-name">You · Ivory</span><span className="sc-n">{myScore}</span>
            </div>
            <div className={'sc ai' + (foeTurnNow ? ' on' : '')}>
              <span className="sc-chip ai"></span><span className="sc-name">{oppName} · Ebony</span><span className="sc-n">{foeScore}</span>
            </div>
          </div>
          <div className="panel stats">
            <div className="stat"><span>Your tiles</span><b>{myHand.length}</b></div>
            <div className="stat"><span>{oppName} tiles</span><b>{foeHand.length}</b></div>
            <div className="stat"><span>Boneyard</span><b>{s.boneyard.length}</b></div>
            <div className="stat ends"><span>Open ends</span><b>{e ? `${e.L} · ${e.R}` : '—'}</b></div>
          </div>
          <OnlineBar net={net} />
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal iWon={iWon} draw={s.winner === 'draw'} reason={s.reason} myScore={myScore} foeScore={foeScore} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ iWon, draw, reason, myScore, foeScore, oppName, onNew }:
  { iWon: boolean; draw: boolean; reason: 'out' | 'blocked' | null; myScore: number; foeScore: number; oppName: string; onNew: () => void }) {
  const pts = iWon ? myScore : foeScore
  return (
    <Modal
      eyebrow={draw ? 'Locked up' : iWon ? (reason === 'out' ? 'Dominoes!' : 'Lighter hand') : 'Out-bonED'}
      title={draw ? 'A Tie' : iWon ? 'You Win' : `${oppName} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {myScore}</span>
        <span className="foe">{oppName} {foeScore}</span>
      </div>
      {!draw && <p className="dm-final-note">{reason === 'out' ? 'Went out' : 'Game blocked'} — scored {pts} from the loser's hand.</p>}
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Dominoes" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The double-six set has <b>28 tiles</b>; you each get <b>7</b> and the rest sit in the <b>boneyard</b>. Whoever holds the highest double (or heaviest tile) leads it onto the line.</p>
        <p>On your turn you must lay a tile whose half <b>matches one of the two open ends</b> — the chain grows from both ends. If a tile fits both ends you choose which. Can't play? <i>Draw</i> from the boneyard until you can; if it's empty you <i>pass</i>.</p>
        <p>A round ends when someone lays their <b>last tile</b> ("dominoes!") or the game is <b>blocked</b> (both pass). The winner — the one who went out, or the lighter hand if blocked — scores the <b>sum of pips in the opponent's hand</b>. This is a single round: that player wins.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close / deselect.</p>
      </div>
    </Modal>
  )
}
