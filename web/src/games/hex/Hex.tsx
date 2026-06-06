/* HEX — the connection game (UI, built for this codebase). An 11x11 rhombus of hexagons on the
   framework shell, vs a shortest-connection-distance AI. You (amber) link top↔bottom; the rival
   (slate) links left↔right. Click an empty cell to place; the winning chain lights up at game end. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as HX from './logic'
import type { HexState } from './logic'

const { N } = HX

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#181d27" stroke="#2c3445" strokeWidth="1.5" />
    <polygon points="24,9 33,14.5 33,25.5 24,31 15,25.5 15,14.5" fill="none" stroke="#e0a23c" strokeWidth="2" strokeLinejoin="round" />
    <polygon points="24,17 28.5,19.7 28.5,25.3 24,28 19.5,25.3 19.5,19.7" fill="#e0a23c" />
    <circle cx="33" cy="36" r="4" fill="#7e93b8" />
  </svg>
)

export function Hex() {
  const [s, setS] = useState<HexState>(() => HX.makeGame())
  const [showRules, setShowRules] = useState(false)

  function newGame() { setS(HX.makeGame()); setShowRules(false) }

  useAITurn(!s.winner && s.turn === 's', () => setS(p => HX.aiMove(p)), { delayMs: 520, tick: s.last })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'y'
  const winSet = new Set(s.win)

  function clickCell(i: number) { if (yourTurn && !s.board[i]) setS(HX.place(s, i, 'y')) }

  let banner: string, bk = ''
  if (s.winner === 'y') { bk = 'win'; banner = 'You connect top to bottom — you win' }
  else if (s.winner === 's') { bk = 'lose'; banner = 'The rival links left to right — it wins' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — place an amber stone' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  const rows = []
  for (let r = 0; r < N; r++) {
    const cells = []
    for (let c = 0; c < N; c++) {
      const i = HX.idx(r, c)
      const v = s.board[i]
      cells.push(
        <button
          key={i}
          className={'hx-cell' + (s.last === i ? ' last' : '') + (winSet.has(i) ? ' win' : '')}
          onClick={() => clickCell(i)}
          disabled={!yourTurn || !!v}
          aria-label={`${'ABCDEFGHIJK'[c]}${r + 1}`}
        >
          <span className="hx-hex" />
          {v && <span className={'hx-stone ' + v} />}
        </button>,
      )
    }
    rows.push(<div className="hx-row" key={r}>{cells}</div>)
  }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Hex · connect your edges"
        title="Hex"
        subtitle="link your two sides with an unbroken chain — and block the rival linking theirs"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${N} × ${N}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="hx-wrap">
          <div className="hx-frame">
            <span className="hx-edge top" /><span className="hx-edge bottom" />
            <span className="hx-edge left" /><span className="hx-edge right" />
            <div className="hx-board">{rows}</div>
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <div className={'pl y' + (s.turn === 'y' && !s.winner ? ' on' : '')}>
              <span className="pl-stone y" />
              <span className="pl-txt"><b>You · Amber</b><i>top ↕ bottom</i></span>
            </div>
            <div className={'pl s' + (s.turn === 's' && !s.winner ? ' on' : '')}>
              <span className="pl-stone s" />
              <span className="pl-txt"><b>Rival · Slate</b><i>left ↔ right</i></span>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: HexState; onNew: () => void }) {
  const won = s.winner === 'y'
  return (
    <Modal
      eyebrow={won ? 'Edges linked' : 'Out-connected'}
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
    <Modal eyebrow="How to play" title="Hex" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You are <b>Amber</b> and move first. Click any empty hexagon to place a stone, then the rival (<b>Slate</b>) replies. You alternate — every move is a placement and there is <i>no passing</i>.</p>
        <p>You own the <b>top</b> and <b>bottom</b> edges and win by forming an unbroken chain of amber stones connecting them. Slate owns the <b>left</b> and <b>right</b> edges. Hexes touch their six neighbours, so chains can snake diagonally.</p>
        <p>Hex can <b>never draw</b> — exactly one player connects, so blocking the rival and building your own link are the same fight.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
