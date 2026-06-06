/* MINISHOGI (5x5) — UI.
   Renders through the shared GameShell + Modal. You are Sente (player 0, bottom);
   the AI is Gote (player 1, top) and replies via useAITurn. Click a piece → its legal
   targets light up (board moves AND drops). Captured pieces flow to each side's HAND;
   click a hand piece to arm a drop. Promotion offers a prompt when optional. */

import { useEffect, useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as SH from './logic'
import type { Move, Piece, PieceType, State } from './logic'

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
  const [s, setS] = useState<State>(() => SH.makeGame())
  const [sel, setSel] = useState<Sel>(null)
  const [showRules, setShowRules] = useState(false)
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null)
  const [tick, setTick] = useState(0)

  function newGame() {
    setS(SH.makeGame()); setSel(null); setShowRules(false); setPromo(null); setTick(t => t + 1)
  }

  // AI (Gote, player 1) replies after a short pause.
  useAITurn(s.winner == null && s.turn === 1, () => { setS(p => SH.aiMove(p)); setTick(t => t + 1) }, { delayMs: 300, tick })
  // clear selection whenever the turn flips
  useEffect(() => { setSel(null) }, [s.turn])

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setSel(null); setPromo(null) },
  })

  const yourTurn = s.winner == null && s.turn === 0

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
    setS(prev => SH.applyMove(prev, move))
    setSel(null)
    setTick(t => t + 1)
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
    if (p && p.owner === 0) setSel(sel && sel.kind === 'square' && sel.i === i ? null : { kind: 'square', i })
    else setSel(null)
  }

  function clickHand(owner: 0 | 1, t: PieceType) {
    if (!yourTurn || owner !== 0) return
    if (s.hands[0][t] <= 0) return
    setSel(sel && sel.kind === 'drop' && sel.t === t ? null : { kind: 'drop', t })
  }

  function resolvePromo(doPromote: boolean) {
    if (!promo) return
    commit({ from: promo.from, to: promo.to, promote: doPromote })
    setPromo(null)
  }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'Checkmate — you win' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'Checkmate — Gote wins' }
  else if (yourTurn) { bk = 'you'; banner = s.check ? 'You are in check!' : 'Your move · Sente 先手' }
  else { bk = 'foe'; banner = s.check ? 'Gote in check…' : 'Gote is thinking…' }

  const lastFrom = s.last && s.last.from >= 0 ? s.last.from : -1
  const lastTo = s.last ? s.last.to : -1

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
            owner={1}
            hand={s.hands[1]}
            sel={sel}
            active={false}
            onClick={() => {}}
            label="Gote · 後手 (AI)"
          />

          <div className="board">
            {s.board.map((p, i) => {
              const [r, c] = SH.rc(i)
              const isT = targets.has(i)
              const cls = ['cell']
              if ((r + c) % 2 === 1) cls.push('alt')
              if (i === lastFrom || i === lastTo) cls.push('last')
              const selected = sel && sel.kind === 'square' && sel.i === i
              return (
                <div key={i} className={cls.join(' ')} onClick={() => clickSquare(i)}>
                  {p && (
                    <div className={'pc' + (p.owner === 0 ? ' p0' : ' p1') + (selected ? ' sel' : '') + (p.promoted ? ' promo' : '')}>
                      <span className="g">{glyph(p)}</span>
                    </div>
                  )}
                  {isT && <div className={'tgt' + (p ? ' cap' : '') + (sel && sel.kind === 'drop' ? ' drop' : '')} />}
                </div>
              )
            })}
          </div>

          <Hand
            owner={0}
            hand={s.hands[0]}
            sel={sel}
            active={yourTurn}
            onClick={t => clickHand(0, t)}
            label="Sente · 先手 (You)"
          />
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

      {s.winner != null && <WinModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function Hand({
  owner, hand, sel, active, onClick, label,
}: {
  owner: 0 | 1
  hand: SH.State['hands'][0]
  sel: Sel
  active: boolean
  onClick: (t: PieceType) => void
  label: string
}) {
  const total = ORDER.reduce((n, t) => n + hand[t], 0)
  return (
    <div className={'hand' + (owner === 0 ? ' mine' : ' foe')}>
      <div className="hand-label">{label}</div>
      <div className="hand-pieces">
        {total === 0 && <span className="hand-empty">— empty —</span>}
        {ORDER.map(t => {
          const n = hand[t]
          if (n <= 0) return null
          const armed = sel && sel.kind === 'drop' && sel.t === t && owner === 0
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

function WinModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? '詰み · Checkmate' : 'Checkmated'}
      title={won ? 'You Win' : 'Gote Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'You cornered Gote’s king with no legal escape. Well played.'
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
        <p>You are <b>Sente 先手</b> (bottom) and move first. Each side has a <b>King 玉</b>, <b>Gold 金</b>, <b>Silver 銀</b>, <b>Bishop 角</b>, <b>Rook 飛</b> and one <b>Pawn 歩</b>.</p>
        <p><b>Gold</b> steps one square orthogonally or forward-diagonally (6 ways). <b>Silver</b> steps one diagonally or straight forward (5 ways). <b>Bishop</b> slides diagonally, <b>Rook</b> orthogonally. <b>Pawn</b> steps one straight forward (and captures the same). The <b>King</b> moves one square any direction.</p>
        <p><b>Promotion:</b> moving into the far rank promotes — Rook→<b>Dragon 龍</b>, Bishop→<b>Horse 馬</b>, Silver→<b>全</b> and Pawn→<b>と</b> (both then move as Gold). A pawn entering the last rank must promote.</p>
        <p><b>Drops:</b> capture a piece and it flips to your <b>hand</b>. Instead of a move you may drop a hand piece (unpromoted) onto any empty square. No two unpromoted pawns may share a file, and you can’t drop a piece where it has no move.</p>
        <p><b>Win</b> by checkmating the king. <b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
    </Modal>
  )
}
