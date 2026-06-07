/* TWIXT — the connection game (UI, built for this codebase). A 12x12 hole grid on the framework
   shell, vs a connection-distance AI. You (Coral) link top↔bottom; the rival (Teal) links
   left↔right. Click an empty legal hole to drop a peg — non-crossing knight links snap in
   automatically. The connecting chain lights up at game end. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameKeys } from '../../framework/useGameKeys'
import { useGameSession } from '../../net/useGameSession'
import { twixtAdapter } from './net'
import * as TW from './logic'
import type { State, Owner } from './logic'

const { N, idx, rowOf, colOf } = TW

// Geometry of the SVG board: a hole sits at (PAD + c*GAP, PAD + r*GAP).
const GAP = 40
const PAD = 26
const SIZE = PAD * 2 + GAP * (N - 1)
const cx = (i: number) => PAD + colOf(i) * GAP
const cy = (i: number) => PAD + rowOf(i) * GAP

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#15191f" stroke="#2a3742" strokeWidth="1.5" />
    <line x1="14" y1="34" x2="34" y2="14" stroke="#e8765a" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="14" cy="34" r="4" fill="#e8765a" />
    <circle cx="34" cy="14" r="4" fill="#e8765a" />
    <circle cx="33" cy="33" r="3.2" fill="#3fb6ad" />
    <circle cx="15" cy="15" r="3.2" fill="#3fb6ad" />
  </svg>
)

export function Twixt() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(twixtAdapter)
  const mine = mySeat as Owner          // seat 0 = You (top↕bottom), seat 1 = Rival (left↔right)
  const foe = (mine === 0 ? 1 : 0) as Owner
  const [showRules, setShowRules] = useState(false)

  function newGame() { netNew(); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = s.winner == null && isMyTurn
  const legal = new Set(yourTurn ? TW.legalHoles(s, mine) : [])
  const winSet = new Set(s.win)
  const oppLabel = net.online ? 'Opponent' : 'Rival'

  function clickHole(i: number) {
    if (yourTurn && legal.has(i)) dispatch({ cell: i })
  }

  // Banners/result are relative to MY seat. Your goal depends on which side you hold.
  const myGoal = mine === 0 ? 'top to bottom' : 'left to right'
  const foeGoal = mine === 0 ? 'left to right' : 'top to bottom'
  const thinking = net.online ? 'waiting for opponent…' : `${oppLabel} is thinking…`
  let banner: string, bk = ''
  if (s.winner === mine) { bk = 'win'; banner = `You connect ${myGoal} — you win` }
  else if (s.winner === foe) { bk = 'lose'; banner = `${oppLabel} links ${foeGoal} — it wins` }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — drop a peg' }
  else { bk = 'foe'; banner = thinking }

  // Build hole nodes. Corners are rendered as voids; opponent-border holes are dimmed/blocked.
  const holes = []
  for (let i = 0; i < N * N; i++) {
    const r = rowOf(i), c = colOf(i)
    const corner = (r === 0 || r === N - 1) && (c === 0 || c === N - 1)
    if (corner) continue
    const owner = s.pegs[i]
    const isLegal = legal.has(i)
    // Borders relative to MY seat: top/bottom belong to seat 0, left/right to seat 1.
    const topBottom = r === 0 || r === N - 1
    const leftRight = c === 0 || c === N - 1
    const yourBorder = mine === 0 ? topBottom : leftRight
    const foeBorder = mine === 0 ? leftRight : topBottom
    let cls = 'tw-hole'
    if (yourBorder) cls += ' brd-you'
    else if (foeBorder) cls += ' brd-foe'
    if (isLegal) cls += ' legal'
    holes.push(
      <g key={i} className={cls} onClick={() => clickHole(i)}>
        <circle className="tw-hit" cx={cx(i)} cy={cy(i)} r={GAP * 0.46} />
        <circle className="tw-slot" cx={cx(i)} cy={cy(i)} r={5.5} />
        {owner != null && (
          <circle
            className={'tw-peg ' + (owner === mine ? 'you' : 'foe') + (winSet.has(i) ? ' win' : '') + (s.last === i ? ' last' : '')}
            cx={cx(i)} cy={cy(i)} r={9}
          />
        )}
      </g>,
    )
  }

  const winLinkSet = new Set(s.win.map(h => h))
  const linkEls = s.links.map((l, k) => {
    const onWin = winLinkSet.has(l.a) && winLinkSet.has(l.b)
    return (
      <line
        key={k}
        className={'tw-link ' + (l.owner === mine ? 'you' : 'foe') + (onWin ? ' win' : '')}
        x1={cx(l.a)} y1={cy(l.a)} x2={cx(l.b)} y2={cy(l.b)}
      />
    )
  })

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="TwixT · connect your borders"
        title="TwixT"
        subtitle="bridge your two sides with knight-linked pegs — and block the rival bridging theirs"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${N} × ${N}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="tw-wrap">
          <div className="tw-frame">
            <span className="tw-edge top" /><span className="tw-edge bottom" />
            <span className="tw-edge left" /><span className="tw-edge right" />
            <svg className="tw-board" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="TwixT board">
              <g className="tw-links">{linkEls}</g>
              <g className="tw-holes">{holes}</g>
            </svg>
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>
          <div className="panel players">
            <div className={'pl you' + (s.turn === mine && s.winner == null ? ' on' : '')}>
              <span className="pl-peg you" />
              <span className="pl-txt"><b>You · {mine === 0 ? 'Coral' : 'Teal'}</b><i>{mine === 0 ? 'top ↕ bottom' : 'left ↔ right'}</i></span>
            </div>
            <div className={'pl foe' + (s.turn === foe && s.winner == null ? ' on' : '')}>
              <span className="pl-peg foe" />
              <span className="pl-txt"><b>{oppLabel} · {foe === 0 ? 'Coral' : 'Teal'}</b><i>{foe === 0 ? 'top ↕ bottom' : 'left ↔ right'}</i></span>
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} mine={mine} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, mine, oppLabel, onNew }: { s: State; mine: Owner; oppLabel: string; onNew: () => void }) {
  const won = s.winner === mine
  const winnerLinks = s.winner === 0 ? 'Top ↕ Bottom connected' : 'Left ↔ Right connected'
  return (
    <Modal
      eyebrow={won ? 'Borders linked' : 'Out-connected'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>{winnerLinks}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="TwixT" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Coral</b> and move first. Click any empty hole to drop a peg, then the rival (<b>Teal</b>) replies. You alternate — every move is one placement.</p>
        <p>You own the <b>top</b> and <b>bottom</b> rows and win by linking them with an unbroken chain of pegs. Teal owns the <b>left</b> and <b>right</b> columns. You may not place in the rival's side columns, and Teal may not place in your top/bottom rows. The four corners are dead.</p>
        <p>After each placement, a <i>link</i> snaps in between your new peg and any of your pegs a <b>knight's move</b> away — <i>unless</i> the link would cross a link already on the board. Crossed bridges are simply skipped.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
