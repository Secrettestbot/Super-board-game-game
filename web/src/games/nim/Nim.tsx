/* NIM — UI (built for this codebase). Glowing tokens on a dark field, on the framework
   shell, vs a perfect nim-sum AI. Hover a token to highlight it and everything after it in
   its heap (the tokens that would be removed); click to take them. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as NM from './logic'
import type { NimState } from './logic'

const { HEAP_LABELS } = NM

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#141026" stroke="#3a2f6a" strokeWidth="1.5" />
    <rect x="12" y="13" width="4" height="22" rx="2" fill="#8a7cff" />
    <rect x="22" y="13" width="4" height="22" rx="2" fill="#b6abff" />
    <rect x="32" y="13" width="4" height="22" rx="2" fill="#6a5cff" />
    <circle cx="14" cy="11" r="2.4" fill="#cfc7ff" />
    <circle cx="24" cy="11" r="2.4" fill="#cfc7ff" />
    <circle cx="34" cy="11" r="2.4" fill="#cfc7ff" />
  </svg>
)

export function Nim() {
  const [s, setS] = useState<NimState>(() => NM.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [hover, setHover] = useState<{ heap: number; pos: number } | null>(null)

  function newGame() { setS(NM.makeGame()); setShowRules(false); setHover(null) }

  useAITurn(!s.winner && s.turn === 'ai', () => setS(p => NM.aiMove(p)), { delayMs: 620 })
  useGameKeys({ onNew: newGame, onToggleRules: () => setShowRules(v => !v), onEscape: () => setShowRules(false) })

  const yourTurn = !s.winner && s.turn === 'you'
  const total = s.heaps.reduce((a, b) => a + b, 0)

  // hovering the token at index `pos` in a heap of size n removes (n - pos) tokens,
  // i.e. that token and every one after it. `pos` is 0-based within the heap.
  function clickToken(heap: number, pos: number) {
    if (!yourTurn) return
    const n = s.heaps[heap]
    setS(NM.take(s, heap, n - pos, 'you'))
    setHover(null)
  }

  let banner: string, bk = ''
  if (s.winner === 'you') { bk = 'win'; banner = 'You took the last token — you win' }
  else if (s.winner === 'ai') { bk = 'lose'; banner = 'The rival took the last token' }
  else if (yourTurn) { bk = 'you'; banner = 'Your turn — take from one heap' }
  else { bk = 'foe'; banner = 'The rival is thinking…' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Nim · balance the heaps"
        title="Nim"
        subtitle="take any number from a single heap — and take the very last token to win"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${total} left`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>N · new &nbsp; ? · rules</>}
      >
        <div className="nm-wrap">
          <div className="nm-field">
            {s.heaps.map((n, h) => (
              <div key={h} className="nm-heap">
                <div className="nm-tokens">
                  {Array.from({ length: n }).map((_, pos) => {
                    const armed = hover != null && hover.heap === h && pos >= hover.pos
                    return (
                      <button
                        key={pos}
                        className={'nm-token' + (armed ? ' armed' : '')}
                        disabled={!yourTurn}
                        onMouseEnter={() => yourTurn && setHover({ heap: h, pos })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => clickToken(h, pos)}
                        aria-label={`Heap ${HEAP_LABELS[h]} token ${pos + 1}`}
                      />
                    )
                  })}
                  {n === 0 && <div className="nm-empty">empty</div>}
                </div>
                <div className="nm-heap-label">heap {HEAP_LABELS[h]}<span className="nm-heap-n">{n}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel turnbox">
            <div className={'tn you' + (s.turn === 'you' && !s.winner ? ' on' : '')}><span className="tn-dot you" /><span className="tn-name">You</span></div>
            <div className={'tn ai' + (s.turn === 'ai' && !s.winner ? ' on' : '')}><span className="tn-dot ai" /><span className="tn-name">Rival</span></div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.winner && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: NimState; onNew: () => void }) {
  const won = s.winner === 'you'
  return (
    <Modal
      eyebrow={won ? 'Last token taken' : 'Out-balanced'}
      title={won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p>{won
          ? 'You claimed the final token. The heaps stayed balanced when it mattered.'
          : 'The rival balanced the heaps to a zero nim-sum and never let go. Try opening differently.'}</p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Nim" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>There are three heaps of glowing tokens. On your turn you remove <b>one or more tokens from a single heap</b> — as many as you like, but all from the same heap. You and the rival alternate; <b>you move first</b>.</p>
        <p>Whoever takes the <b>very last token wins</b> (normal play). To take tokens, hover a token: it and every token <i>after</i> it in that heap light up — click to remove them.</p>
        <p>The secret is the <b>binary XOR</b> of the heap sizes (the "nim-sum"). Leave your opponent a position where the heaps XOR to <b>zero</b> and you cannot lose. The rival knows this trick — from the start [3, 4, 5] you have a winning move, but one slip hands the game away.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
      </div>
    </Modal>
  )
}
