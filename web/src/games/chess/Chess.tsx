/* CHESS — UI. Full standard chess on the framework shell. You play White (ivory) from
   the bottom against an alpha-beta AI playing Black (onyx). Click one of your pieces to
   see its legal targets, click a target to move; a promotion picker appears when a pawn
   reaches the last rank. The AI replies on its turn via useAITurn (one move per ply,
   re-armed on the ply counter). Banner shows check / checkmate / stalemate / draw. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as C from './logic'
import type { ChessState, Move, PieceType, Color } from './logic'

const GLYPH: Record<Color, Record<PieceType, string>> = {
  0: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  1: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
}
const PIECE_PTS: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1c140d" stroke="#3a2c1d" strokeWidth="1.5" />
    <rect x="9" y="9" width="15" height="15" fill="#e6cfa0" />
    <rect x="24" y="24" width="15" height="15" fill="#e6cfa0" />
    <rect x="24" y="9" width="15" height="15" fill="#7d5a3a" />
    <rect x="9" y="24" width="15" height="15" fill="#7d5a3a" />
    <text x="24" y="31" textAnchor="middle" fontSize="20" fill="#20272a">♞</text>
  </svg>
)

function materialBalance(s: ChessState): number {
  let bal = 0
  for (const p of s.board) { if (!p) continue; bal += p.color === C.WHITE ? PIECE_PTS[p.type] : -PIECE_PTS[p.type] }
  return bal
}

export function Chess() {
  const [s, setS] = useState<ChessState>(() => C.makeGame())
  const [sel, setSel] = useState<number | null>(null)
  const [pending, setPending] = useState<{ from: number; to: number } | null>(null) // awaiting promotion choice
  const [showRules, setShowRules] = useState(false)
  const [ply, setPly] = useState(0)

  function newGame() {
    setS(C.makeGame()); setSel(null); setPending(null); setShowRules(false); setPly(0)
  }

  const yourTurn = s.result == null && s.turn === C.WHITE
  const aiTurn = s.result == null && s.turn === C.BLACK

  // legal moves for the human, grouped by origin square
  const legal = useMemo(() => (yourTurn ? C.legalMoves(s) : []), [s, yourTurn])
  const targets = useMemo(() => {
    const map = new Map<number, Move>() // to-square -> a representative move
    if (sel == null) return map
    for (const m of legal) if (m.from === sel) map.set(m.to, m)
    return map
  }, [legal, sel])

  // AI driver: one move per turn, re-armed on the ply counter.
  useAITurn(aiTurn, () => {
    setS(prev => {
      if (prev.result != null || prev.turn !== C.BLACK) return prev
      return C.aiMove(prev)
    })
    setPly(p => p + 1)
  }, { delayMs: 480, tick: ply })

  function commitMove(m: Move) {
    setS(prev => C.applyMove(prev, m))
    setSel(null); setPending(null)
    setPly(p => p + 1)
  }

  function onSquare(idx: number) {
    if (!yourTurn || pending) return
    const piece = s.board[idx]
    // selecting one of your own pieces
    if (piece && piece.color === C.WHITE) {
      setSel(idx === sel ? null : idx)
      return
    }
    // clicking a legal target of the selected piece
    if (sel != null && targets.has(idx)) {
      const rep = targets.get(idx)!
      if (rep.promo) { setPending({ from: sel, to: idx }); return } // ask which piece
      commitMove(rep)
      return
    }
    setSel(null)
  }

  function choosePromo(pt: PieceType) {
    if (!pending) return
    commitMove({ from: pending.from, to: pending.to, promo: pt })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (pending) setPending(null); else if (sel != null) setSel(null); else setShowRules(false) },
  })

  const checked = s.result == null && C.inCheck(s, s.turn)

  let banner: string, bk = ''
  if (s.result === 'white') { bk = 'win'; banner = 'Checkmate — you win!' }
  else if (s.result === 'black') { bk = 'lose'; banner = 'Checkmate — Black wins' }
  else if (s.result === 'draw') {
    bk = 'foe'
    const why = s.reason === 'stalemate' ? 'Stalemate' : s.reason === 'fifty' ? 'Draw — 50-move rule'
      : s.reason === 'repetition' ? 'Draw — threefold repetition' : s.reason === 'material' ? 'Draw — insufficient material' : 'Draw'
    banner = why
  } else if (yourTurn) {
    bk = 'you'; banner = checked ? 'You are in check — defend the king' : 'Your move'
  } else {
    bk = 'foe'; banner = checked ? 'Black is in check…' : 'Black is thinking…'
  }

  const bal = materialBalance(s)
  const kingInCheckSq = checked ? findKing(s, s.turn) : -1

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Chess · 8×8 classic"
        title="Chess"
        subtitle="the royal game — castle, capture en passant, promote your pawns, and mate the king before the engine mates yours"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Move ${s.fullmove} · ${bal === 0 ? 'even' : bal > 0 ? `you +${bal}` : `Black +${-bal}`}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>click · move &nbsp; N · new &nbsp; ? · rules</>}
      >
        <div className="ch-boardwrap">
          <div className="ch-frame">
            <div className="ch-board">
              {Array.from({ length: 64 }, (_, idx) => {
                const rank = C.rankOf(idx), file = C.fileOf(idx)
                const isDark = (rank + file) % 2 === 1
                const piece = s.board[idx]
                const isTarget = targets.has(idx)
                const isLast = s.last != null && (s.last.from === idx || s.last.to === idx)
                const isSel = sel === idx
                const clickable = yourTurn && !pending && ((piece && piece.color === C.WHITE) || isTarget)
                const cls = ['ch-sq', isDark ? 'dark' : 'light']
                if (isSel) cls.push('selected')
                if (isLast) cls.push('last')
                if (idx === kingInCheckSq) cls.push('check')
                if (clickable) cls.push('clickable')
                return (
                  <div key={idx} className={cls.join(' ')} onClick={() => onSquare(idx)}>
                    {file === 0 && <span className="ch-coord rank">{8 - rank}</span>}
                    {rank === 7 && <span className="ch-coord file">{'abcdefgh'[file]}</span>}
                    {isTarget && (piece ? <span className="ch-capring" /> : <span className="ch-dot" />)}
                    {piece && <span className={'ch-piece ' + (piece.color === C.WHITE ? 'w' : 'b')}>{GLYPH[piece.color][piece.type]}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="ch-side">
          <div className="ch-panel">
            <h3>Match</h3>
            <div className={'ch-player' + (aiTurn ? ' on' : '')}>
              <span className="ch-disc b" />
              <span className="ch-pname">Black · Engine</span>
              <span className={'ch-material' + (bal < 0 ? '' : ' neg')}>{bal < 0 ? `+${-bal}` : ''}</span>
            </div>
            <div className="ch-captured b">
              {s.captured[1].length ? s.captured[1].map((t, i) => <span key={i}>{GLYPH[C.WHITE][t]}</span>) : <span className="none">— no captures —</span>}
            </div>
            <div className={'ch-player' + (yourTurn ? ' on' : '')}>
              <span className="ch-disc w" />
              <span className="ch-pname">You · White</span>
              <span className={'ch-material' + (bal < 0 ? ' neg' : '')}>{bal > 0 ? `+${bal}` : ''}</span>
            </div>
            <div className="ch-captured w">
              {s.captured[0].length ? s.captured[0].map((t, i) => <span key={i}>{GLYPH[C.BLACK][t]}</span>) : <span className="none">— no captures —</span>}
            </div>
          </div>

          <div className="ch-panel">
            <h3>Status</h3>
            <div className="ch-status">
              {s.result == null ? (
                <>
                  <div>To move: <b>{s.turn === C.WHITE ? 'White (you)' : 'Black'}</b></div>
                  {checked && <div className="chk">Check!</div>}
                  <div>Halfmove clock: <b>{s.halfmove}</b> / 100</div>
                  {s.last && <div>Last: <b>{C.squareName(s.last.from)}→{C.squareName(s.last.to)}</b></div>}
                </>
              ) : (
                <div>{banner}</div>
              )}
            </div>
          </div>
        </div>
      </GameShell>

      {pending && (
        <Modal
          eyebrow="Pawn promotion"
          title="Promote to…"
          onClose={() => setPending(null)}
          actions={<button className="btn-modal" onClick={() => setPending(null)}>Cancel</button>}
        >
          <div className="ch-promo-body">
            {(['q', 'r', 'b', 'n'] as PieceType[]).map(pt => (
              <button key={pt} className="ch-promo-btn" onClick={() => choosePromo(pt)} aria-label={pt}>
                {GLYPH[C.WHITE][pt]}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {s.result != null && (
        <ResultModal result={s.result} reason={s.reason} onNew={newGame} />
      )}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function findKing(s: ChessState, color: Color): number {
  for (let i = 0; i < 64; i++) { const p = s.board[i]; if (p && p.color === color && p.type === 'k') return i }
  return -1
}

function ResultModal({ result, reason, onNew }: { result: Exclude<C.Result, null>; reason: string | null; onNew: () => void }) {
  const won = result === 'white'
  const draw = result === 'draw'
  const eyebrow = draw ? 'Drawn game' : won ? 'Checkmate' : 'Checkmate'
  const title = draw ? 'Draw' : won ? 'You Win' : 'Black Wins'
  const detail = draw
    ? (reason === 'stalemate' ? 'Stalemate — the side to move has no legal move and is not in check.'
      : reason === 'fifty' ? 'Fifty moves passed with no capture or pawn move.'
      : reason === 'repetition' ? 'The same position arose three times.'
      : 'Neither side has the material to force mate.')
    : won ? 'You delivered checkmate. Long live the queen.' : 'The engine cornered your king.'
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body"><p className={won ? 'you' : draw ? '' : 'foe'}>{detail}</p></div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Chess" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>You are <b>White</b> and move first. <b>Click one of your pieces</b> to light up its legal squares (dots for moves, rings for captures), then <b>click a square</b> to move. Click the piece again or press <kbd>Esc</kbd> to deselect.</p>
        <p>All standard rules apply: pawns push one (or two from home), capture diagonally, take <b>en passant</b>, and <b>promote</b> on the last rank — a picker lets you choose the new piece. <b>Castle</b> by moving the king two squares toward a rook (only when neither has moved, the path is clear, and the king is not in or passing through check).</p>
        <p>You may not make a move that leaves your own king in <b>check</b>. <b>Checkmate</b> wins; <b>stalemate</b>, the <b>50-move rule</b>, <b>threefold repetition</b>, and <b>insufficient material</b> all draw.</p>
        <p>The opponent is an <b>alpha-beta engine</b> with piece-square evaluation — it punishes hanging pieces, so guard your queen.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect / close.</p>
      </div>
    </Modal>
  )
}
