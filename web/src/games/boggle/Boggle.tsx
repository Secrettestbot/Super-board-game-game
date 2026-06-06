/* BOGGLE — UI (built for this codebase). A 4x4 dice grid you and a DFS-driven AI race over.
   Type words; we trace + validate the path live and highlight it on the grid. End the round
   and the AI reveals its found words one at a time (useAITurn re-arms on s.revealed). Classic
   length scoring with shared-word dedupe; play a few rounds, highest total wins. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useAITurn } from '../../framework/useAITurn'
import { useGameKeys } from '../../framework/useGameKeys'
import * as B from './logic'
import type { BoggleState } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#1d2a3a" stroke="#365066" strokeWidth="1.5" />
    <rect x="9" y="9" width="13" height="13" rx="3" fill="#ffce5c" />
    <rect x="26" y="9" width="13" height="13" rx="3" fill="#3fd0c8" />
    <rect x="9" y="26" width="13" height="13" rx="3" fill="#3fd0c8" />
    <rect x="26" y="26" width="13" height="13" rx="3" fill="#ff7e6b" />
    <path d="M11 33 L20 33 M14 30 L17 36" stroke="#0e1622" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </svg>
)

export function Boggle() {
  const [s, setS] = useState<BoggleState>(() => B.makeGame())
  const [showRules, setShowRules] = useState(false)
  const [draft, setDraft] = useState('')
  const [flash, setFlash] = useState<{ msg: string; kind: 'good' | 'warn' } | null>(null)

  function newGame() {
    setS(B.makeGame())
    setDraft('')
    setFlash(null)
    setShowRules(false)
  }

  // The AI reveals its words one at a time during the 'reveal' phase; re-arm on s.revealed so
  // the timer keeps firing until every word is shown (then revealStep auto-scores the round).
  useAITurn(
    s.phase === 'reveal' && s.winner == null,
    () => setS(p => B.revealStep(p)),
    { delayMs: 360, tick: s.revealed },
  )

  // Live path for the current draft (highlighted on the grid as you type), null if untraceable.
  const draftPath = useMemo(() => {
    const w = draft.toLowerCase().trim()
    if (w.length < 1) return null
    return B.findPath(s.grid, w)
  }, [draft, s.grid])
  const pathSet = useMemo(() => new Set(draftPath ?? []), [draftPath])

  const playing = s.phase === 'play' && s.winner == null
  const draftValid = playing && draft.trim().length >= 3 && B.WORD_SET.has(draft.toLowerCase().trim()) && draftPath != null

  function trySubmit() {
    if (!playing) return
    const r = B.submitWord(s, 0, draft)
    if (r.ok) {
      setS(r.state)
      setFlash({ msg: `+${B.wordScore(draft.toLowerCase().trim())}  "${draft.toLowerCase().trim()}"`, kind: 'good' })
      setDraft('')
    } else {
      setFlash({ msg: r.reason ?? 'invalid', kind: 'warn' })
    }
  }

  function endRound() {
    if (!playing) return
    setDraft('')
    setFlash(null)
    setS(B.aiTurn(s))
  }

  function continueNext() {
    if (s.phase !== 'done' || s.winner != null) return
    setS(B.nextRound(s))
    setDraft('')
    setFlash(null)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { setShowRules(false); setDraft('') },
  })

  // ---- Banner / mode text ----
  let banner: string
  let bk = ''
  if (s.winner === 0) { bk = 'win'; banner = 'You win the match!' }
  else if (s.winner === 1) { bk = 'lose'; banner = 'The rival wins the match' }
  else if (s.winner === -1) { bk = 'win'; banner = "It's a tie!" }
  else if (s.phase === 'reveal') { bk = 'foe'; banner = 'The rival reveals its words…' }
  else if (s.phase === 'done') {
    bk = 'you'
    const lr = s.lastRound
    banner = lr ? `Round ${s.round}: you ${lr.you} · rival ${lr.ai} — press on` : 'Round scored'
  } else { bk = 'you'; banner = 'Find words — drag a path of adjacent letters' }

  const yourRoundScore = roundUniqueScore(s.words[0], s.words[1])
  const aiRoundScore = roundUniqueScore(s.words[1], s.words[0])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Boggle · word-search race"
        title="Boggle"
        subtitle="trace words through the lettered dice before the rival — longer words, bigger points; share a word and you both lose it"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`Round ${s.round} / ${s.rounds} · You ${s.totals[0]} · Rival ${s.totals[1]}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>type · word &nbsp; enter · add &nbsp; N · new</>}
      >
        <div className="bg-wrap">
          <div className={'bg-grid' + (playing ? '' : ' locked')}>
            {s.grid.map((tok, i) => {
              const inPath = pathSet.has(i)
              const order = draftPath ? draftPath.indexOf(i) : -1
              return (
                <div key={i} className={'bg-cell' + (inPath ? ' lit' : '')}>
                  <span className="bg-letter">{tok}</span>
                  {order >= 0 && <span className="bg-order">{order + 1}</span>}
                </div>
              )
            })}
          </div>

          {playing && (
            <div className="bg-entry">
              <input
                className="bg-input"
                value={draft}
                autoFocus
                spellCheck={false}
                placeholder="type a word…"
                onChange={(e) => { setDraft(e.target.value.replace(/[^a-zA-Z]/g, '')); setFlash(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); trySubmit() } }}
              />
              <button className="bg-btn" disabled={!draftValid} onClick={trySubmit}>Add</button>
              <button className="bg-btn end" onClick={endRound}>End Round</button>
            </div>
          )}
          {flash && <div className={'bg-flash ' + flash.kind}>{flash.msg}</div>}
          {!playing && s.phase === 'done' && s.winner == null && (
            <div className="bg-entry">
              <button className="bg-btn end wide" onClick={continueNext}>Next Round →</button>
            </div>
          )}
        </div>

        <div className="side">
          <div className="panel bg-score">
            <div className={'bg-srow' + (playing ? ' on' : '')}>
              <span className="bg-pawn you" />
              <span className="bg-who">You</span>
              <span className="bg-tot">{s.totals[0]}</span>
            </div>
            <div className="bg-sub">this round: <b>{yourRoundScore}</b> · {s.words[0].length} words</div>
            <div className={'bg-srow' + (s.phase === 'reveal' ? ' on' : '')}>
              <span className="bg-pawn foe" />
              <span className="bg-who">Rival</span>
              <span className="bg-tot">{s.totals[1]}</span>
            </div>
            <div className="bg-sub">this round: <b>{aiRoundScore}</b> · {s.words[1].length} words</div>
          </div>

          <div className="panel bg-words">
            <div className="bg-wcol">
              <div className="bg-whead you">Your words</div>
              <div className="bg-wlist">
                {s.words[0].length === 0 && <div className="bg-empty">none yet</div>}
                {s.words[0].map((w, i) => {
                  const shared = s.words[1].includes(w)
                  return (
                    <div key={i} className={'bg-word' + (shared ? ' shared' : '')}>
                      <span>{w}</span>
                      <span className="bg-pts">{shared ? '—' : '+' + B.wordScore(w)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="bg-wcol">
              <div className="bg-whead foe">Rival words</div>
              <div className="bg-wlist">
                {s.words[1].length === 0 && <div className="bg-empty">{s.phase === 'play' ? 'hidden until reveal' : 'none'}</div>}
                {s.words[1].map((w, i) => {
                  const shared = s.words[0].includes(w)
                  return (
                    <div key={i} className={'bg-word' + (shared ? ' shared' : '')}>
                      <span>{w}</span>
                      <span className="bg-pts">{shared ? '—' : '+' + B.wordScore(w)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal winner={s.winner} totals={s.totals} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

// Unique-word score for one player after removing words the other player also has.
function roundUniqueScore(mine: string[], theirs: string[]): number {
  const other = new Set(theirs)
  let n = 0
  for (const w of new Set(mine)) if (!other.has(w)) n += B.wordScore(w)
  return n
}

function ResultModal({ winner, totals, onNew }: { winner: number; totals: [number, number]; onNew: () => void }) {
  const tie = winner === -1
  const won = winner === 0
  return (
    <Modal
      eyebrow={tie ? 'Dead heat' : won ? 'Sharp eyes' : 'Outscored'}
      title={tie ? 'Tie Game' : won ? 'You Win' : 'Rival Wins'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="finalsc">
        <span className="you">You {totals[0]}</span>
        <span className="vs">vs</span>
        <span className="foe">Rival {totals[1]}</span>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Boggle" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Got it</button>}>
      <div className="modal-body">
        <p>Both you and the rival hunt the <b>same 4×4 grid</b> of lettered dice for words. A word is <b>3+ letters</b> traced along a <b>path of adjacent cells</b> — including diagonals — using each cell <b>at most once</b>. <b>Qu</b> counts as one cell.</p>
        <p>Type a word and press <kbd>Enter</kbd>; the grid highlights your path as you go. It must be in the dictionary and traceable. Press <b>End Round</b> when you're done — the rival then reveals the words <i>its</i> search found.</p>
        <p>Score by length: <b>3–4</b> = 1 · <b>5</b> = 2 · <b>6</b> = 3 · <b>7</b> = 5 · <b>8+</b> = 11. A word found by <b>both</b> players scores for <b>neither</b>. Highest total after all rounds wins.</p>
        <p><b>Keys:</b> <kbd>Enter</kbd> add word · <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> clear/close.</p>
      </div>
    </Modal>
  )
}
