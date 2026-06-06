/* NINE MEN'S MORRIS — UI (built for this codebase). A carved board (three concentric
   squares + cross-connectors) on the framework shell. Phase 1 click to place; phase 2
   click your man then an adjacent point to slide; on a mill, click a highlighted rival
   man to remove. Online-capable via useGameSession (host-authoritative): empty seats are
   filled by the alpha-beta AI; a remote guest plays the other side. Everything is rendered
   relative to mySeat (seat 0 = White, seat 1 = Black). */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { morrisAdapter } from './net'
import * as MM from './logic'
import type { Color } from './logic'

const { LAYOUT, ADJ } = MM
const U = 60          // grid unit (svg space is 0..6 * U + padding)
const PAD = 36
const VB = 6 * U + PAD * 2

function xy(p: number): [number, number] {
  const [gx, gy] = LAYOUT[p]
  return [PAD + gx * U, PAD + gy * U]
}

// unique board segments (an edge for each adjacency pair, drawn once).
const SEGMENTS: [number, number][] = (() => {
  const seen = new Set<string>(); const out: [number, number][] = []
  ADJ.forEach((nbrs, a) => nbrs.forEach(b => { const k = a < b ? `${a}-${b}` : `${b}-${a}`; if (!seen.has(k)) { seen.add(k); out.push(a < b ? [a, b] : [b, a]) } }))
  return out
})()

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#2a1d10" stroke="#6b4f2c" strokeWidth="1.5" />
    <g stroke="#c89a52" strokeWidth="1.5" fill="none">
      <rect x="10" y="10" width="28" height="28" />
      <rect x="17" y="17" width="14" height="14" />
      <path d="M24 10 V17 M24 38 V31 M10 24 H17 M38 24 H31" />
    </g>
    <circle cx="10" cy="10" r="3" fill="#ece4d2" />
    <circle cx="38" cy="38" r="3" fill="#1d1712" stroke="#000" strokeWidth="0.5" />
  </svg>
)

export function Morris() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(morrisAdapter)
  const myColor: Color = mySeat === 1 ? 'b' : 'w'  // seat 0 = White, seat 1 = Black
  const oppColor: Color = myColor === 'w' ? 'b' : 'w'
  const [showRules, setShowRules] = useState(false)
  const [sel, setSel] = useState<number | null>(null)

  function newGame() { netNew(); setSel(null); setShowRules(false) }

  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => { setSel(null); setShowRules(false) } })

  const yourTurn = !s.winner && isMyTurn
  const placing = yourTurn && s.phase === 'place'
  const moving = yourTurn && s.phase === 'move'
  const removing = yourTurn && s.phase === 'remove'

  const slideTargets = useMemo(() => {
    if (!moving || sel === null) return new Set<number>()
    return new Set(ADJ[sel].filter(j => s.board[j] === null))
  }, [moving, sel, s.board])

  const movableMen = useMemo(() => {
    if (!moving) return new Set<number>()
    return new Set(MM.legalSlides(s.board, myColor).map(([from]) => from))
  }, [moving, s.board, myColor])

  const removeTargets = useMemo(() => {
    if (!removing) return new Set<number>()
    return new Set(MM.removable(s.board, oppColor))
  }, [removing, s.board, oppColor])

  function clickPoint(p: number) {
    if (placing) { if (s.board[p] === null) dispatch({ kind: 'place', cell: p }); return }
    if (removing) { if (removeTargets.has(p)) dispatch({ kind: 'remove', cell: p }); return }
    if (moving) {
      if (s.board[p] === myColor && movableMen.has(p)) { setSel(p === sel ? null : p); return }
      if (sel !== null && slideTargets.has(p)) { dispatch({ kind: 'move', from: sel, to: p }); setSel(null); return }
    }
  }

  const lastSet = new Set(s.last)

  // counts relative to mySeat
  const myOnBoard = s.onBoard[myColor], myHand = s.hand[myColor]
  const oppOnBoard = s.onBoard[oppColor], oppHand = s.hand[oppColor]
  const myTotal = myOnBoard + myHand
  const oppTotal = oppOnBoard + oppHand
  const oppLabel = net.online ? 'Opponent' : 'Rival'
  const thinking = net.online ? 'The opponent is thinking…' : 'The rival is thinking…'

  const iWin = s.winner === myColor
  const oppWin = s.winner === oppColor

  let banner: string, bk = ''
  if (iWin) { bk = 'win'; banner = `You win — ${oppLabel.toLowerCase()} is down to two men` }
  else if (oppWin) { bk = 'lose'; banner = `${oppLabel} wins` }
  else if (removing) { bk = 'you'; banner = 'Mill! Take a rival man' }
  else if (placing) { bk = 'you'; banner = `Your turn — place a man (${myHand} in hand)` }
  else if (moving) { bk = 'you'; banner = sel === null ? 'Your turn — pick a man to move' : 'Slide it to an adjacent point' }
  else { bk = 'foe'; banner = thinking }

  const phaseLabel = (s.hand.w > 0 || s.hand.b > 0) ? 'Placing' : 'Moving'
  const myName = myColor === 'w' ? 'White' : 'Black'
  const oppName = oppColor === 'w' ? 'White' : 'Black'
  const myOn = s.turn === myColor && !s.winner
  const oppOn = s.turn === oppColor && !s.winner

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Nine Men's Morris · mills &amp; men"
        title="Morris"
        subtitle="line up three to take a rival man — strand them with two, or with nowhere to move"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={phaseLabel}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="mm-wrap">
          <svg className="mm-board" viewBox={`0 0 ${VB} ${VB}`}>
            {SEGMENTS.map(([a, b], i) => {
              const [x1, y1] = xy(a), [x2, y2] = xy(b)
              return <line key={i} className="mm-edge" x1={x1} y1={y1} x2={x2} y2={y2} />
            })}
            {LAYOUT.map((_, p) => {
              const [cx, cy] = xy(p)
              const v = s.board[p]
              const isRemovable = removeTargets.has(p)
              const isTarget = slideTargets.has(p)
              const isMovable = movableMen.has(p)
              const isSel = sel === p
              const clickable = placing && v === null ? true : isTarget || isMovable || isRemovable
              const cls = [
                'mm-pt',
                clickable ? 'click' : '',
                lastSet.has(p) ? 'last' : '',
                isSel ? 'sel' : '',
              ].join(' ')
              return (
                <g key={p} className={cls} onClick={() => clickPoint(p)}>
                  {isTarget && <circle className="mm-spot" cx={cx} cy={cy} r={9} />}
                  {placing && v === null && <circle className="mm-open" cx={cx} cy={cy} r={5} />}
                  <circle className="mm-node" cx={cx} cy={cy} r={5} />
                  {v && (
                    <circle
                      className={'mm-man ' + v + (isRemovable ? ' rem' : '') + (isMovable ? ' mv' : '')}
                      cx={cx} cy={cy} r={15}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        <div className="side">
          <div className="panel"><OnlineBar net={net} /></div>
          <div className="panel mm-score">
            <div className={'mm-pl ' + myColor + (myOn ? ' on' : '')}>
              <span className={'mm-chip ' + myColor} />
              <span className="mm-pl-name">You · {myName}</span>
              <span className="mm-pl-stat">{myOnBoard}<span className="mm-sub"> on</span> · {myHand}<span className="mm-sub"> hand</span></span>
            </div>
            <div className={'mm-pl ' + oppColor + (oppOn ? ' on' : '')}>
              <span className={'mm-chip ' + oppColor} />
              <span className="mm-pl-name">{oppLabel} · {oppName}</span>
              <span className="mm-pl-stat">{oppOnBoard}<span className="mm-sub"> on</span> · {oppHand}<span className="mm-sub"> hand</span></span>
            </div>
            <div className="mm-tot">You {myTotal} men · {oppLabel} {oppTotal} men</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal won={iWin} oppLabel={oppLabel} myTotal={myTotal} oppTotal={oppTotal} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ won, oppLabel, myTotal, oppTotal, onNew }: { won: boolean; oppLabel: string; myTotal: number; oppTotal: number; onNew: () => void }) {
  return (
    <Modal
      eyebrow={won ? 'Mills carried the day' : 'Out-milled'}
      title={won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc"><span className="you">You {myTotal}</span><span className="foe">{oppLabel} {oppTotal}</span></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Nine Men's Morris" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>White places first. Each side has <b>nine men</b>. In the <b>placing phase</b> you take turns dropping a man on any empty point.</p>
        <p>Once all eighteen are down, the <b>moving phase</b> begins: slide one of your men along a line to an <b>adjacent empty point</b>.</p>
        <p>Whenever you line up <b>three men</b> along a marked line — a <i>mill</i> — you <b>remove</b> one rival man (one outside a mill, unless every rival man is in a mill). Removable men are highlighted.</p>
        <p>You <b>win</b> by reducing the rival to <b>two men</b>, or leaving them with <b>no legal move</b>. There is no flying — moves are always to an adjacent point.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
