/* TWIXT — the connection game (UI, built for this codebase). A 12x12 hole grid on the framework
   shell, vs a connection-distance AI. You (Coral) link top↔bottom; the rival (Teal) links
   left↔right. Click an empty legal hole to drop a peg — non-crossing knight links snap in
   automatically. The connecting chain lights up at game end. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as TW from './logic'
import type { State } from './logic'

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
  const [s, setS] = useState<State>(() => TW.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(TW.makeGame()); setShowRules(false) }

  useAITurn(s.winner == null && s.turn === 1, () => setS(p => TW.aiTurn(p)), { delayMs: 540, tick: s.last })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = s.winner == null && s.turn === 0
  const legal = new Set(yourTurn ? TW.legalHoles(s, 0) : [])
  const winSet = new Set(s.win)

  function clickHole(i: number) {
    if (yourTurn && legal.has(i)) setS(TW.place(s, 0, i))
  }

  let banner: string, bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You connect top to bottom — you win' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The rival links left to right — it wins' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — drop a coral peg' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  // Build hole nodes. Corners are rendered as voids; opponent-border holes are dimmed/blocked.
  const holes = []
  for (let i = 0; i < N * N; i++) {
    const r = rowOf(i), c = colOf(i)
    const corner = (r === 0 || r === N - 1) && (c === 0 || c === N - 1)
    if (corner) continue
    const owner = s.pegs[i]
    const isLegal = legal.has(i)
    const yourBorder = r === 0 || r === N - 1            // top/bottom — yours
    const foeBorder = c === 0 || c === N - 1             // left/right — rival's
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
            className={'tw-peg ' + (owner === 0 ? 'you' : 'foe') + (winSet.has(i) ? ' win' : '') + (s.last === i ? ' last' : '')}
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
        className={'tw-link ' + (l.owner === 0 ? 'you' : 'foe') + (onWin ? ' win' : '')}
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
          <div className="panel players">
            <div className={'pl you' + (s.turn === 0 && s.winner == null ? ' on' : '')}>
              <span className="pl-peg you" />
              <span className="pl-txt"><b>You · Coral</b><i>top ↕ bottom</i></span>
            </div>
            <div className={'pl foe' + (s.turn === 1 && s.winner == null ? ' on' : '')}>
              <span className="pl-peg foe" />
              <span className="pl-txt"><b>Rival · Teal</b><i>left ↔ right</i></span>
            </div>
          </div>
          <div className="panel logbox">
            {s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.winner === 0
  return (
    <Modal
      eyebrow={won ? 'Borders linked' : 'Out-connected'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className={won ? 'you' : 'foe'}>{won ? 'Top ↕ Bottom connected' : 'Left ↔ Right connected'}</span>
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
