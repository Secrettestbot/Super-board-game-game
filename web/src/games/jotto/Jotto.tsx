/* JOTTO — UI (built for this codebase). A codebreaker's parchment sheet on the framework
   shell. You and your opponent each secretly hold a 5-letter word of distinct letters; you
   take turns guessing the other's word, learning only the count of letters in common
   ("jots"). First to guess the opponent's exact word wins. Solo, the opponent is an AI that
   guesses from the set of words consistent with all the jot feedback it has gotten against
   YOUR word; online, the opponent is a remote human and unfilled seats fall back to the AI.

   Online play is wired through useGameSession(jottoAdapter): the host runs the real logic,
   guests send guess intents and render a per-seat view with the opponent's secret redacted.
   Everything below is seat-relative — "your" column/secret come from mySeat, isMyTurn gates
   guessing, and the opponent is called "Opponent" when net.online. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { jottoAdapter } from './net'
import type { GuessRecord } from './logic'
import * as J from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#f3e9d2" stroke="#b9892f" strokeWidth="1.6" />
    <circle cx="24" cy="24" r="13" fill="none" stroke="#a8412f" strokeWidth="2.2" />
    <text x="24" y="30" textAnchor="middle" fontFamily="'Baloo 2', cursive" fontWeight="700" fontSize="17" fill="#a8412f">J</text>
  </svg>
)

const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('')

function jotClass(j: number): string {
  if (j === 0) return 'jt-jot zero'
  if (j === 5) return 'jt-jot full'
  return 'jt-jot'
}

function GuessRow({ rec, side }: { rec: GuessRecord; side: 'you' | 'foe' }) {
  const win = rec.jots === 5
  return (
    <div className={'jt-row ' + side + (win ? ' win' : '')}>
      <div className="jt-tiles">
        {rec.word.split('').map((ch, i) => (
          <div key={i} className="jt-tile">{ch}</div>
        ))}
      </div>
      <div className={jotClass(rec.jots)}>{rec.jots}</div>
    </div>
  )
}

export function Jotto() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(jottoAdapter)
  const oppSeat = mySeat === 0 ? 1 : 0
  const [draft, setDraft] = useState('')
  const [warn, setWarn] = useState('')
  const [showRules, setShowRules] = useState(false)
  // Per-letter player notes for the tracking aid: '' | 'in' | 'out' | 'maybe'.
  const [notes, setNotes] = useState<Record<string, string>>({})

  function newGame() {
    netNew()
    setDraft('')
    setWarn('')
    setNotes({})
    setShowRules(false)
  }

  const yourGuesses = s.history[mySeat]   // your guesses → the opponent's word
  const oppGuesses = s.history[oppSeat]   // the opponent's guesses → your word
  const oppName = net.online ? 'Opponent' : 'AI'

  const yourTurn = s.winner == null && isMyTurn

  function submit() {
    if (!yourTurn) return
    const w = draft.trim().toLowerCase()
    if (w.length !== 5) { setWarn('Enter a 5-letter word.'); return }
    if (!J.isValidWord(w)) { setWarn(`"${w.toUpperCase()}" is not in the word list.`); return }
    setWarn('')
    setDraft('')
    dispatch({ kind: 'guess', word: w })
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false) },
  })

  function cycleNote(ch: string) {
    setNotes(prev => {
      const cur = prev[ch] ?? ''
      const next = cur === '' ? 'in' : cur === 'in' ? 'maybe' : cur === 'maybe' ? 'out' : ''
      return { ...prev, [ch]: next }
    })
  }

  const youWon = s.winner === mySeat
  const oppWord = s.secrets[oppSeat] // revealed (un-redacted) only once the game is over

  // Banner / status (relative to mySeat).
  let banner: string, bk = ''
  if (s.winner === mySeat) { bk = 'win'; banner = `You cracked it in ${yourGuesses.length}! ${oppName}'s word was ${oppWord.toUpperCase()}.` }
  else if (s.winner === oppSeat) { bk = 'lose'; banner = `${oppName} guessed your word in ${oppGuesses.length}. Your word: ${s.secrets[mySeat].toUpperCase()}.` }
  else if (yourTurn) { bk = 'you'; banner = `Your turn — guess ${oppName === 'AI' ? 'the AI’s' : 'the'} 5-letter word` }
  else { bk = 'foe'; banner = net.online ? 'Waiting for your opponent…' : 'The AI is deducing your word…' }

  const inputBad = warn !== ''
  const canSubmit = yourTurn && draft.trim().length === 5

  const trackNotes = useMemo(() => notes, [notes])

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Jotto · word deduction"
        title="Jotto"
        subtitle="you and your rival each hide a 5-letter word &mdash; guess by &ldquo;jots&rdquo;, the letters in common"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`You ${yourGuesses.length} · ${oppName} ${oppGuesses.length}`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>type word &nbsp; &#9166; · guess &nbsp; N · new</>}
      >
        <div className="jt-sheet">
          <div className="jt-colhead">
            <div className="jt-col-title you">Your guesses → {oppName}&#39;s word</div>
            <div className="jt-col-title foe">{oppName}&#39;s guesses → your word</div>
          </div>
          <div className="jt-cols">
            <div className="jt-stack">
              {yourGuesses.length === 0
                ? <div className="jt-empty">No guesses yet. Type a word below.</div>
                : yourGuesses.map((r, i) => <GuessRow key={i} rec={r} side="you" />)}
            </div>
            <div className="jt-stack">
              {oppGuesses.length === 0
                ? <div className="jt-empty">{oppName} hasn&#39;t guessed yet.</div>
                : oppGuesses.map((r, i) => <GuessRow key={i} rec={r} side="foe" />)}
            </div>
          </div>

          <div className="jt-input-wrap">
            <input
              className={'jt-input' + (inputBad ? ' bad' : '')}
              value={draft}
              maxLength={5}
              placeholder="guess a word"
              spellCheck={false}
              autoFocus
              disabled={!yourTurn}
              onChange={(e) => { setDraft(e.target.value.replace(/[^a-zA-Z]/g, '').toLowerCase()); setWarn('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            />
            <button className="jt-go" onClick={submit} disabled={!canSubmit}>Guess</button>
          </div>
          <div className="jt-warn">{warn}</div>
        </div>

        <div className="side">
          <div className="panel">
            <OnlineBar net={net} />
          </div>

          <div className="panel jt-secret">
            <div className="lab">Your secret word</div>
            <div className="word">{s.secrets[mySeat].toUpperCase()}</div>
          </div>

          <div className="panel">
            <div className="panel-l" style={{ marginBottom: 4 }}>Letter tracker</div>
            <div className="jt-empty" style={{ padding: '2px 0 0' }}>Tap a letter to note it.</div>
            <div className="jt-track-grid">
              {ALPHA.map(ch => (
                <div
                  key={ch}
                  className={'jt-letter ' + (trackNotes[ch] ?? '')}
                  onClick={() => cycleNote(ch)}
                  title="cycle: in → maybe → out → clear"
                >{ch}</div>
              ))}
            </div>
            <div className="jt-legend">
              <span><i className="jt-swatch in" />in word</span>
              <span><i className="jt-swatch maybe" />maybe</span>
              <span><i className="jt-swatch out" />ruled out</span>
            </div>
          </div>

          <div className="panel logbox">
            {[...yourGuesses].reverse().slice(0, 8).map((r, i) => (
              <div key={i} className="log-line you">{r.word.toUpperCase()} — {r.jots} jot{r.jots === 1 ? '' : 's'}</div>
            ))}
            {yourGuesses.length === 0 && <div className="log-line sys">Your guess log appears here.</div>}
          </div>
        </div>
      </GameShell>

      {s.winner != null && <ResultModal youWon={youWon} youGuesses={yourGuesses.length} oppGuesses={oppGuesses.length} oppWord={oppWord} oppName={oppName} onNew={newGame} />}
      {showRules && <RulesModal oppName={oppName} onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ youWon, youGuesses, oppGuesses, oppWord, oppName, onNew }: { youWon: boolean; youGuesses: number; oppGuesses: number; oppWord: string; oppName: string; onNew: () => void }) {
  return (
    <Modal
      eyebrow={youWon ? 'Word cracked' : 'Your word fell'}
      title={youWon ? 'You win!' : `${oppName} wins`}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p style={{ textAlign: 'center' }}>
          {youWon
            ? <>You guessed {oppName}&#39;s word in <i>{youGuesses}</i> {youGuesses === 1 ? 'guess' : 'guesses'}.</>
            : <>{oppName} guessed your word in <i>{oppGuesses}</i> {oppGuesses === 1 ? 'guess' : 'guesses'}.</>}
        </p>
        <p style={{ textAlign: 'center' }}>{oppName}&#39;s secret word was:</p>
        <div className="jt-reveal">
          {oppWord.split('').map((ch, i) => <div key={i} className="jt-tile">{ch}</div>)}
        </div>
      </div>
    </Modal>
  )
}

function RulesModal({ oppName, onClose }: { oppName: string; onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Jotto" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>You and {oppName === 'AI' ? 'the AI' : 'your opponent'} each secretly hold a <b>5-letter word</b> with all <i>distinct</i> letters. Your word is shown to you in the side panel; {oppName === 'AI' ? 'the AI&#39;s' : 'theirs'} is hidden.</p>
        <p>Take turns <b>guessing</b> the other player&#39;s word with a valid 5-letter word. After each guess you learn one number — the <b>jots</b>: how many letters your guess and the secret word have <i>in common</i>, regardless of position. You do <i>not</i> learn which letters or where.</p>
        <p>A jot of <b>0</b> means none of your letters appear in the word — that is real information. A jot of <b>5</b> means you guessed it exactly. The first player to guess the other&#39;s exact word <b>wins</b>.</p>
        <p>Use the <b>letter tracker</b> to mark letters you believe are in, maybe in, or ruled out.</p>
        <p>To play <b>online</b>, open the lobby panel to host or join a match — your opponent becomes a remote human.</p>
        <p><b>Keys:</b> type a word, <kbd>&#9166;</kbd> to guess · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
