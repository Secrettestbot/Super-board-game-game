/* WORD DUEL — UI (built for this codebase). A neon-arcade Wordle RACE on the framework shell.
   ONE hidden secret 5-letter word is shared by you (player 0) and the AI (player 1). You take
   turns guessing valid 5-letter words; each guess returns Wordle per-letter feedback (green /
   yellow / grey). First to guess the secret EXACTLY wins. You see your own grid + keyboard
   letter-states; the AI's progress shows as colored (letter-hidden) rows + a guess count. The
   AI guesses words consistent with ALL of its OWN feedback, never peeking at the secret. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { useAITurn } from '../../framework/useAITurn'
import * as W from './logic'
import type { WordGameState, GuessRecord, Color } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#161a2e" stroke="#3a4170" strokeWidth="1.6" />
    <rect x="9" y="13" width="9" height="9" rx="2" fill="#4f9e63" />
    <rect x="20" y="13" width="9" height="9" rx="2" fill="#c9a23b" />
    <rect x="31" y="13" width="8" height="9" rx="2" fill="#3a3f57" />
    <text x="24" y="38" textAnchor="middle" fontFamily="'Baloo 2', cursive" fontWeight="700" fontSize="14" fill="#36d6c4">WD</text>
  </svg>
)

const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const COLOR_RANK: Record<Color, number> = { grey: 1, yellow: 2, green: 3 }

/** Best (strongest) color known for each letter from the player's own feedback so far. */
function keyboardStates(history: GuessRecord[]): Record<string, Color> {
  const map: Record<string, Color> = {}
  for (const rec of history) {
    for (let i = 0; i < 5; i++) {
      const ch = rec.word[i]
      const c = rec.feedback[i]
      if (!map[ch] || COLOR_RANK[c] > COLOR_RANK[map[ch]]) map[ch] = c
    }
  }
  return map
}

function GuessRow({ rec }: { rec: GuessRecord }) {
  return (
    <div className="wd-grow">
      {rec.word.split('').map((ch, i) => (
        <div key={i} className={'wd-tile ' + rec.feedback[i]}>{ch}</div>
      ))}
    </div>
  )
}

function DraftRow({ draft, active }: { draft: string; active: boolean }) {
  const cells = []
  for (let i = 0; i < 5; i++) {
    const filled = i < draft.length
    const cursor = active && i === draft.length
    cells.push(
      <div key={i} className={'wd-tile draft' + (filled ? ' filled' : '') + (cursor ? ' cursor' : '')}>
        {filled ? draft[i] : ''}
      </div>,
    )
  }
  return <div className="wd-grow">{cells}</div>
}

function EmptyRow() {
  return (
    <div className="wd-grow">
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="wd-tile" />)}
    </div>
  )
}

export function WordGame() {
  const [s, setS] = useState<WordGameState>(() => W.makeGame())
  const [draft, setDraft] = useState('')
  const [warn, setWarn] = useState('')
  const [showRules, setShowRules] = useState(false)

  function newGame() {
    setS(W.makeGame())
    setDraft('')
    setWarn('')
    setShowRules(false)
  }

  const youGuesses = s.history[0]
  const aiGuesses = s.history[1]
  const kbStates = useMemo(() => keyboardStates(youGuesses), [youGuesses])

  const yourTurn = s.winner == null && s.turn === 0
  const aiActive = s.winner == null && s.turn === 1

  function submit() {
    if (!yourTurn) return
    const w = draft.trim().toLowerCase()
    if (w.length !== 5) { setWarn('Enter a 5-letter word.'); return }
    if (!W.isValidWord(w)) { setWarn(`"${w.toUpperCase()}" is not in the word list.`); return }
    setWarn('')
    setDraft('')
    setS(W.guess(s, 0, w))
  }

  // The AI plays one guess per turn while it is its turn and the game is live.
  useAITurn(aiActive, () => {
    const g = W.aiGuess(s)
    if (g == null) return
    setS(W.guess(s, 1, g))
  }, { delayMs: 650, tick: aiGuesses.length })

  function typeKey(ch: string) {
    if (!yourTurn) return
    setWarn('')
    setDraft((d) => (d.length >= 5 ? d : d + ch))
  }
  function backspace() {
    setWarn('')
    setDraft((d) => d.slice(0, -1))
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules((v) => !v),
    onEscape: () => { if (showRules) setShowRules(false) },
    extra: (e) => {
      if (showRules) return false
      if (e.key === 'Enter') { submit(); return true }
      if (e.key === 'Backspace') { backspace(); return true }
      if (/^[a-zA-Z]$/.test(e.key)) { typeKey(e.key.toLowerCase()); return true }
      return false
    },
  })

  // Banner / status.
  let banner: string
  let bk = ''
  if (s.winner === 0) { bk = 'win'; banner = `You cracked ${s.secret.toUpperCase()} in ${youGuesses.length}! You beat the machine.` }
  else if (s.winner === 1) { bk = 'lose'; banner = `The AI cracked ${s.secret.toUpperCase()} first, in ${aiGuesses.length}.` }
  else if (s.winner === -1) { bk = 'lose'; banner = `Out of guesses — it was ${s.secret.toUpperCase()}. A draw.` }
  else if (s.turn === 0) { bk = 'you'; banner = 'Your turn — guess the hidden 5-letter word' }
  else { bk = 'foe'; banner = 'The AI is deducing the word…' }

  const inputBad = warn !== ''
  const canSubmit = yourTurn && draft.trim().length === 5

  // Build the fixed-height grid: solved/typed rows + the draft + empty filler up to the cap.
  const rows: React.ReactNode[] = []
  for (let i = 0; i < youGuesses.length; i++) rows.push(<GuessRow key={'g' + i} rec={youGuesses[i]} />)
  if (s.winner == null && youGuesses.length < W.MAX_GUESSES) {
    rows.push(<DraftRow key="draft" draft={draft} active={yourTurn} />)
  }
  while (rows.length < W.MAX_GUESSES) rows.push(<EmptyRow key={'e' + rows.length} />)

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Word Duel · deduction race"
        title="Word Duel"
        subtitle="you vs the AI &mdash; same hidden word, alternating guesses, first to crack it wins"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${youGuesses.length} · AI ${aiGuesses.length} · cap ${W.MAX_GUESSES}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>type &nbsp; &#9166; · guess &nbsp; N · new</>}
      >
        <div className="wd-board">
          <div className="wd-colhead">Your board</div>
          <div className="wd-grid">{rows}</div>

          <div className="wd-input-wrap">
            <input
              className={'wd-input' + (inputBad ? ' bad' : '')}
              value={draft}
              maxLength={5}
              placeholder="guess a word"
              spellCheck={false}
              autoFocus
              disabled={!yourTurn}
              onChange={(e) => { setDraft(e.target.value.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 5)); setWarn('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            />
            <button className="wd-go" onClick={submit} disabled={!canSubmit}>Guess</button>
          </div>
          <div className="wd-warn">{warn}</div>

          <div className="wd-kb">
            {KB_ROWS.map((row, ri) => (
              <div className="wd-kb-row" key={ri}>
                {ri === 2 && (
                  <div className="wd-key wide" onClick={() => submit()}>Enter</div>
                )}
                {row.split('').map((ch) => (
                  <div
                    key={ch}
                    className={'wd-key ' + (kbStates[ch] ?? '')}
                    onClick={() => typeKey(ch)}
                  >{ch}</div>
                ))}
                {ri === 2 && (
                  <div className="wd-key wide" onClick={() => backspace()}>Del</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <div className="wd-foehead">AI racer</div>
            <div className="wd-foe-count">{aiGuesses.length}<span> / {W.MAX_GUESSES} guesses</span></div>
            <div className="wd-foe-grid">
              {aiGuesses.length === 0
                ? <div className="wd-foe-empty">The AI hasn&#39;t guessed yet.</div>
                : aiGuesses.map((rec, i) => (
                    <div className="wd-foe-row" key={i}>
                      {rec.feedback.map((c, j) => <div key={j} className={'wd-foe-cell ' + c} />)}
                    </div>
                  ))}
            </div>
            {aiActive && <div className="wd-thinking">deducing</div>}
          </div>

          <div className="panel">
            <div className="wd-foehead" style={{ color: 'var(--ink-3)' }}>Race log</div>
            <div className="wd-log">
              {youGuesses.length === 0 && aiGuesses.length === 0 && (
                <div className="wd-log-line sys">Make the first guess to start the race.</div>
              )}
              {[...youGuesses].map((r, i) => {
                const greens = r.feedback.filter((c) => c === 'green').length
                return <div key={'y' + i} className="wd-log-line you">You · {r.word.toUpperCase()} · {greens}🟩</div>
              })}
              {[...aiGuesses].map((r, i) => {
                const greens = r.feedback.filter((c) => c === 'green').length
                return <div key={'a' + i} className="wd-log-line foe">AI · ##### · {greens}🟩</div>
              })}
            </div>
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: WordGameState; onNew: () => void }) {
  const youWon = s.winner === 0
  const draw = s.winner === -1
  const eyebrow = youWon ? 'Word cracked' : draw ? 'Stalemate' : 'Outraced'
  const title = youWon ? 'You win!' : draw ? "It's a draw" : 'The AI wins'
  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Race again</button>}
    >
      <div className="modal-body">
        <p style={{ textAlign: 'center' }}>
          {youWon
            ? <>You guessed the word in <i>{s.history[0].length}</i> {s.history[0].length === 1 ? 'guess' : 'guesses'}, beating the AI.</>
            : draw
              ? <>Neither racer cracked it within {W.MAX_GUESSES} guesses each.</>
              : <>The AI guessed the word in <i>{s.history[1].length}</i> {s.history[1].length === 1 ? 'guess' : 'guesses'} before you.</>}
        </p>
        <p style={{ textAlign: 'center' }}>The hidden word was:</p>
        <div className="wd-reveal">
          {s.secret.split('').map((ch, i) => <div key={i} className="wd-tile green">{ch}</div>)}
        </div>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Word Duel" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>There is <b>one</b> hidden 5-letter word — the <i>same</i> secret for you and the AI. You take <b>turns</b> guessing it with valid dictionary words.</p>
        <p>After each guess, every letter is colored Wordle-style: <b style={{ color: 'var(--tile-green)' }}>green</b> = right letter, right spot · <b style={{ color: 'var(--tile-yellow)' }}>amber</b> = in the word, wrong spot · <b style={{ color: 'var(--ink-2)' }}>grey</b> = not in the word. Duplicate letters are scored exactly like Wordle.</p>
        <p>It&#39;s a <b>race</b>: the first racer to guess the word <i>exactly</i> wins. You see your own board and keyboard; the AI&#39;s progress shows as colored rows (its letters are hidden) plus a guess count. If both hit {`${'9'}`} guesses with no solve, the most greens wins — otherwise a draw.</p>
        <p>The AI only reasons from its <i>own</i> feedback; it never peeks at the answer.</p>
        <p><b>Keys:</b> type letters, <kbd>&#9166;</kbd> to guess · <kbd>Del</kbd> backspace · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
