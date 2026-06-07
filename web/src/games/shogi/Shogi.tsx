/* MINISHOGI (5x5) — UI.
   Renders through the shared GameShell + Modal. Online-capable via useGameSession:
   seat 0 = Sente (bottom), seat 1 = Gote (top). You play your own seat; the other
   seat is an AI (solo) or a remote human (online). Click a piece → its legal targets
   light up (board moves AND drops). Captured pieces flow to each side's HAND; click a
   hand piece to arm a drop. Promotion offers a prompt when optional. */

import { useEffect, useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { shogiAdapter } from './net'
import * as SH from './logic'
import type { Move, Piece, PieceType, Player, State } from './logic'

const ORDER: PieceType[] = ['R', 'B', 'G', 'S', 'P']

// Japanese glyphs. Promoted pieces use the conventional promoted character.
const GLYPH: Record<PieceType, string> = { K: '玉', G: '金', S: '銀', B: '角', R: '飛', P: '歩' }
const GLYPH_PROMO: Record<PieceType, string> = { K: '玉', G: '金', S: '全', B: '馬', R: '龍', P: 'と' }
const NAME: Record<PieceType, string> = { K: 'King', G: 'Gold', S: 'Silver', B: 'Bishop', R: 'Rook', P: 'Pawn' }

function glyph(p: Piece): string {
  return p.promoted ? GLYPH_PROMO[p.type] : GLYPH[p.type]
}

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#241a10" stroke="#6a4d28" strokeWidth="1.5" />
    <polygon points="24,9 35,14 35,38 13,38 13,14" fill="#e7c88a" stroke="#a87c3a" strokeWidth="1.4" />
    <text x="24" y="31" fontFamily="serif" fontSize="17" fontWeight="700" fill="#7a1f12" textAnchor="middle">王</text>
  </svg>
)

type Sel =
  | { kind: 'square'; i: number }
  | { kind: 'drop'; t: PieceType }
  | null

export function Shogi() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(shogiAdapter)
  const me = mySeat as Player // seat 0 = Sente, seat 1 = Gote
  const opp: Player = me === 0 ? 1 : 0
  const [sel, setSel] = useState<Sel>(null)
  const [showRules, setShowRules] = useState(false)
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null)

  function newGame() {
    netNew(); setSel(null); setShowRules(false); setPromo(null)
  }

  // clear selection whenever the turn flips
  useEffect(() => { setSel(null) }, [s.turn])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSel(null); setPromo(null) },
  })

  const yourTurn = s.winner == null && isMyTurn

  const myMoves = useMemo(
    () => (yourTurn ? SH.legalMoves(s) : []),
    [s, yourTurn],
  )

  // Targets for the current selection (set of destination indices).
  const targets = useMemo(() => {
    const set = new Set<number>()
    if (!sel || !yourTurn) return set
    if (sel.kind === 'square') {
      for (const m of myMoves) if (m.from === sel.i) set.add(m.to)
    } else {
      for (const m of myMoves) if (m.drop === sel.t) set.add(m.to)
    }
    return set
  }, [sel, myMoves, yourTurn])

  function commit(move: Move) {
    if (move.drop != null) dispatch({ drop: move.drop, to: move.to })
    else dispatch({ from: move.from, to: move.to, promote: move.promote })
    setSel(null)
  }

  function clickSquare(i: number) {
    if (!yourTurn) return
    const p = s.board[i]
    if (sel && targets.has(i)) {
      if (sel.kind === 'drop') { commit({ from: -1, to: i, drop: sel.t }); return }
      // board move: check if it's a promotion choice
      const from = sel.i
      const opts = myMoves.filter(m => m.from === from && m.to === i)
      const canPromote = opts.some(m => m.promote)
      const canStay = opts.some(m => !m.promote)
      if (canPromote && canStay) { setPromo({ from, to: i }); return }
      // single option (forced promote or no-promote)
      const only = opts[0]
      commit(only)
      return
    }
    // selecting your own piece
    if (p && p.owner === me) setSel(sel && sel.kind === 'square' && sel.i === i ? null : { kind: 'square', i })
    else setSel(null)
  }

  function clickHand(owner: Player, t: PieceType) {
    if (!yourTurn || owner !== me) return
    if (s.hands[me][t] <= 0) return
    setSel(sel && sel.kind === 'drop' && sel.t === t ? null : { kind: 'drop', t })
  }

  function resolvePromo(doPromote: boolean) {
    if (!promo) return
    commit({ from: promo.from, to: promo.to, promote: doPromote })
    setPromo(null)
  }

  const oppLabel = net.online ? 'Opponent' : 'Gote'
  const thinking = net.online ? 'waiting for opponent…' : 'thinking…'
  const myWin = (s.winner === 'you' && me === 0) || (s.winner === 'ai' && me === 1)
  const oppWin = s.winner != null && s.winner !== 'draw' && !myWin

  let banner: string, bk = ''
  if (s.winner === 'draw') { bk = 'foe'; banner = 'Draw' }
  else if (myWin) { bk = 'win'; banner = 'Checkmate — you win' }
  else if (oppWin) { bk = 'lose'; banner = `Checkmate — ${oppLabel} wins` }
  else if (yourTurn) { bk = 'you'; banner = s.check ? 'You are in check!' : 'Your move' }
  else { bk = 'foe'; banner = s.check ? `${oppLabel} in check…` : `${oppLabel} is ${thinking}` }

  const lastFrom = s.last && s.last.from >= 0 ? s.last.from : -1
  const lastTo = s.last ? s.last.to : -1

  // Flip the board when you sit at seat 1 so your pieces are nearest you.
  const flip = me === 1
  const order = flip
    ? Array.from({ length: SH.SIZE }, (_, k) => SH.SIZE - 1 - k)
    : Array.from({ length: SH.SIZE }, (_, k) => k)

  const myName = me === 0 ? 'Sente · 先手' : 'Gote · 後手'
  const oppName = opp === 0 ? 'Sente · 先手' : 'Gote · 後手'

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Shogi · 将棋"
        title="Minishogi"
        subtitle="5×5 Shogi — drop your captures, promote on the far rank, and mate the king"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft="5×5 · drops on"
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="boardwrap">
          <Hand
            owner={opp}
            hand={s.hands[opp]}
            sel={sel}
            mySeat={me}
            active={false}
            onClick={() => {}}
            label={`${oppName} (${net.online ? 'Opponent' : 'AI'})`}
          />

          <div className="board">
            {order.map((i) => {
              const p = s.board[i]
              const [r, c] = SH.rc(i)
              const isT = targets.has(i)
              const cls = ['cell']
              if ((r + c) % 2 === 1) cls.push('alt')
              if (i === lastFrom || i === lastTo) cls.push('last')
              const selected = sel && sel.kind === 'square' && sel.i === i
              return (
                <div key={i} className={cls.join(' ')} onClick={() => clickSquare(i)}>
                  {p && (
                    <div className={'pc' + (p.owner === me ? ' p0' : ' p1') + (selected ? ' sel' : '') + (p.promoted ? ' promo' : '')}>
                      <span className="g">{glyph(p)}</span>
                    </div>
                  )}
                  {isT && <div className={'tgt' + (p ? ' cap' : '') + (sel && sel.kind === 'drop' ? ' drop' : '')} />}
                </div>
              )
            })}
          </div>

          <Hand
            owner={me}
            hand={s.hands[me]}
            sel={sel}
            mySeat={me}
            active={yourTurn}
            onClick={t => clickHand(me, t)}
            label={`${myName} (You)`}
          />
        </div>

        <div className="ch-side">
          <div className="ch-panel">
            <OnlineBar net={net} />
          </div>
        </div>
      </GameShell>

      {promo && (
        <Modal
          eyebrow="成 · Promotion"
          title="Promote this piece?"
          onClose={() => resolvePromo(false)}
          actions={
            <>
              <button className="btn-modal ghost" onClick={() => resolvePromo(false)}>Keep</button>
              <button className="btn-modal" onClick={() => resolvePromo(true)}>Promote</button>
            </>
          }
        >
          <div className="modal-body">
            <p>Reaching the far rank, this piece may <b>promote</b> — gaining a stronger move set for the rest of the game.</p>
          </div>
        </Modal>
      )}

      {s.winner != null && <WinModal won={myWin} draw={s.winner === 'draw'} oppLabel={oppLabel} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Hand({
  owner, hand, sel, mySeat, active, onClick, label,
}: {
  owner: Player
  hand: SH.State['hands'][0]
  sel: Sel
  mySeat: Player
  active: boolean
  onClick: (t: PieceType) => void
  label: string
}) {
  const total = ORDER.reduce((n, t) => n + hand[t], 0)
  return (
    <div className={'hand' + (owner === mySeat ? ' mine' : ' foe')}>
      <div className="hand-label">{label}</div>
      <div className="hand-pieces">
        {total === 0 && <span className="hand-empty">— empty —</span>}
        {ORDER.map(t => {
          const n = hand[t]
          if (n <= 0) return null
          const armed = sel && sel.kind === 'drop' && sel.t === t && owner === mySeat
          return (
            <button
              key={t}
              className={'hp' + (active ? ' active' : '') + (armed ? ' armed' : '')}
              disabled={!active}
              onClick={() => onClick(t)}
              title={NAME[t]}
            >
              <span className="hg">{GLYPH[t]}</span>
              {n > 1 && <span className="hn">×{n}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WinModal({ won, draw, oppLabel, onNew }: { won: boolean; draw: boolean; oppLabel: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={draw ? 'Draw' : won ? '詰み · Checkmate' : 'Checkmated'}
      title={draw ? 'Draw' : won ? 'You Win' : `${oppLabel} Wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{draw
          ? 'The game is drawn.'
          : won
            ? `You cornered ${oppLabel}’s king with no legal escape. Well played.`
            : 'Your king has no legal escape from check. Try again — mind the drops.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      eyebrow="How to play"
      title="Minishogi (5×5)"
      onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}
    >
      <div className="modal-body">
        <p>Each side has a <b>King 玉</b>, <b>Gold 金</b>, <b>Silver 銀</b>, <b>Bishop 角</b>, <b>Rook 飛</b> and one <b>Pawn 歩</b>. <b>Sente 先手</b> (bottom) moves first.</p>
        <p><b>Gold</b> steps one square orthogonally or forward-diagonally (6 ways). <b>Silver</b> steps one diagonally or straight forward (5 ways). <b>Bishop</b> slides diagonally, <b>Rook</b> orthogonally. <b>Pawn</b> steps one straight forward (and captures the same). The <b>King</b> moves one square any direction.</p>
        <p><b>Promotion:</b> moving into the far rank promotes — Rook→<b>Dragon 龍</b>, Bishop→<b>Horse 馬</b>, Silver→<b>全</b> and Pawn→<b>と</b> (both then move as Gold). A pawn entering the last rank must promote.</p>
        <p><b>Drops:</b> capture a piece and it flips to your <b>hand</b>. Instead of a move you may drop a hand piece (unpromoted) onto any empty square. No two unpromoted pawns may share a file, and you can’t drop a piece where it has no move.</p>
        <p><b>Win</b> by checkmating the king. <b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
