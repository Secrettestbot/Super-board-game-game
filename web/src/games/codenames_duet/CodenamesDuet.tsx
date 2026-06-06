/* CODENAMES DUET — UI (built for this codebase). A cooperative spy game: you (player 0)
   and an AI partner share one mission — contact all 15 secret agents on a 5x5 word grid
   within the turn budget, without ever tapping an assassin. You alternate roles: on your
   clue turn you give a one-word clue + number from YOUR key card (shown as the board
   coloring) so the AI can find ITS agents; on the AI's clue turn it gives a clue and you
   tap the words you believe are agents on your key. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { useAITurn } from '../../framework/useAITurn'
import * as G from './logic'
import type { State, Card } from './logic'

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="10" fill="#15201c" stroke="#2f6b50" strokeWidth="1.6" />
    <circle cx="24" cy="20" r="7.5" fill="none" stroke="#56c08d" strokeWidth="2.2" />
    <path d="M12 39 q12 -12 24 0" fill="none" stroke="#56c08d" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="24" cy="20" r="2.6" fill="#d8b24a" />
  </svg>
)

// Player 0's key card determines the board coloring shown to the human.
function humanRoleClass(c: Card): string {
  const r = c.roles[0]
  if (r === 'agent') return 'agent'
  if (r === 'assassin') return 'assassin'
  return 'bystander'
}

export function CodenamesDuet() {
  const [s, setS] = useState<State>(() => G.makeGame())
  const [showRules, setShowRules] = useState(false)
  // Human clue draft (when it's the human's turn to give a clue).
  const [clueWord, setClueWord] = useState('')
  const [clueNum, setClueNum] = useState(2)
  // A monotonic counter bumped on EVERY AI action so useAITurn re-arms each step.
  const [aiTick, setAiTick] = useState(0)
  const [flash, setFlash] = useState<{ word: string; kind: string } | null>(null)

  function newGame() {
    setS(G.makeGame())
    setClueWord('')
    setClueNum(2)
    setAiTick(0)
    setFlash(null)
    setShowRules(false)
  }

  const remaining = G.agentsRemaining(s)
  const isHumanClueTurn = s.status === 'playing' && s.clueGiver === 0 && s.clue == null
  const isHumanGuessTurn = s.status === 'playing' && s.clue != null && s.clue.from === 1
  // The AI acts when: (a) it's the AI's turn to give a clue, or (b) it has given a clue
  // and is the one guessing (clue.from === 0 means the human gave it -> AI guesses).
  const aiShouldClue = s.status === 'playing' && s.clueGiver === 1 && s.clue == null
  const aiShouldGuess = s.status === 'playing' && s.clue != null && s.clue.from === 0
  const aiActive = aiShouldClue || aiShouldGuess

  useAITurn(aiActive, () => {
    if (aiShouldClue) {
      setS(prev => G.giveClue(prev, 1))
    } else if (aiShouldGuess) {
      // Run the AI's full guessing phase for the human's clue in one step.
      setS(prev => G.aiGuess(prev))
    }
    setAiTick(t => t + 1)
  }, { delayMs: 720, tick: aiTick })

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false) },
  })

  // Human taps a word during the AI's clue turn.
  function tap(word: string) {
    if (!isHumanGuessTurn) return
    const card = s.cards.find(c => c.word === word)
    if (!card || card.contacted) return
    // Resolve against the HUMAN's (player 0) key for the flash hint.
    const role = card.roles[0]
    setFlash({ word, kind: role })
    setS(prev => G.guess(prev, word))
    setAiTick(t => t + 1)
  }

  // Human submits a clue (typed or from suggestions).
  const suggestions = useMemo(
    () => (isHumanClueTurn ? G.clueSuggestions(s, 0).slice(0, 6) : []),
    [s, isHumanClueTurn],
  )
  function submitClue(word: string, num: number) {
    if (!isHumanClueTurn) return
    const w = word.trim().toUpperCase()
    if (!w) return
    setS(prev => G.setHumanClue(prev, w, num))
    setClueWord('')
    setAiTick(t => t + 1)
  }

  // Banner.
  let banner: string, bk = ''
  if (s.status === 'won') { bk = 'win'; banner = `Mission complete — all 15 agents contacted in ${s.turnsTaken} turns!` }
  else if (s.status === 'lost' && s.assassinHit) { bk = 'lose'; banner = 'An ASSASSIN was contacted. The mission is blown.' }
  else if (s.status === 'lost') { bk = 'lose'; banner = `Out of turns with ${remaining} agent${remaining === 1 ? '' : 's'} still in the field. Mission failed.` }
  else if (isHumanClueTurn) { bk = 'you'; banner = 'Your turn to give a clue — point your partner at YOUR agents' }
  else if (isHumanGuessTurn) { bk = 'you'; banner = `Partner's clue: ${s.clue!.word} ${s.clue!.number} — tap the words you think are your agents` }
  else if (aiShouldClue) { bk = 'foe'; banner = 'Your partner is choosing a clue…' }
  else { bk = 'foe'; banner = 'Your partner is contacting agents…' }

  const clueText = s.clue ? `${s.clue.word} · ${s.clue.number}` : '—'
  const guessesLeft = s.clue ? s.clue.remaining : 0

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Codenames Duet · co-op"
        title="Codenames Duet"
        subtitle="you &amp; an AI partner — contact all 15 agents together, never the assassin"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Turns {Math.max(0, s.turnsLeft)} / {G.TOTAL_TURNS} · Agents {remaining}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>tap word · clue + N · N · new</>}
      >
        <div className="cd-main">
          <div className="cd-grid">
            {s.cards.map((c) => {
              const cls = humanRoleClass(c)
              const isFlash = flash?.word === c.word
              return (
                <button
                  key={c.word}
                  className={
                    'cd-card ' + cls +
                    (c.contacted ? ' contacted' : '') +
                    (c.revealed && !c.contacted ? ' spent' : '') +
                    (isHumanGuessTurn && !c.contacted && !c.revealed ? ' tappable' : '') +
                    (isFlash ? ' flash-' + flash!.kind : '')
                  }
                  onClick={() => tap(c.word)}
                  disabled={!isHumanGuessTurn || c.contacted || c.revealed}
                >
                  <span className="cd-word">{c.word}</span>
                  {c.contacted && <span className="cd-mark" aria-hidden="true">✦</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel cd-clue-panel">
            <div className="panel-l">Active clue</div>
            <div className="cd-clue-big">{clueText}</div>
            <div className="cd-clue-sub">
              {s.clue
                ? <>from {s.clue.from === 0 ? 'you' : 'partner'} · {guessesLeft} guess{guessesLeft === 1 ? '' : 'es'} left</>
                : <>waiting for a clue</>}
            </div>
          </div>

          {isHumanClueTurn && (
            <div className="panel cd-giver">
              <div className="panel-l">Give a clue</div>
              <div className="cd-give-row">
                <input
                  className="cd-clue-input"
                  value={clueWord}
                  placeholder="clue word"
                  spellCheck={false}
                  maxLength={16}
                  onChange={(e) => setClueWord(e.target.value.replace(/[^a-zA-Z-]/g, '').toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitClue(clueWord, clueNum) }}
                />
                <select
                  className="cd-clue-num"
                  value={clueNum}
                  onChange={(e) => setClueNum(parseInt(e.target.value, 10))}
                >
                  {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button
                  className="cd-give-btn"
                  disabled={clueWord.trim().length === 0}
                  onClick={() => submitClue(clueWord, clueNum)}
                >Give</button>
              </div>
              <div className="cd-sugg-label">Suggested clues (cover your partner's agents):</div>
              <div className="cd-suggs">
                {suggestions.length === 0 && <div className="cd-sugg-empty">No safe table clue — type one or give a 1.</div>}
                {suggestions.map(sg => (
                  <button key={sg.word} className="cd-sugg" onClick={() => submitClue(sg.word, sg.number)}>
                    <b>{sg.word}</b> <span className="cd-sugg-n">{sg.number}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel cd-legend">
            <div className="panel-l">Your key card</div>
            <div className="cd-leg-row"><i className="cd-sw agent" /> your agent</div>
            <div className="cd-leg-row"><i className="cd-sw bystander" /> bystander</div>
            <div className="cd-leg-row"><i className="cd-sw assassin" /> assassin (avoid!)</div>
            <div className="cd-leg-note">
              Coloring is YOUR key. Your partner sees a different key — some of your bystanders
              are their agents, so tap carefully on their clues.
            </div>
          </div>
        </div>
      </GameShell>

      {s.status !== 'playing' && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: State; onNew: () => void }) {
  const won = s.status === 'won'
  return (
    <Modal
      eyebrow={won ? 'Mission complete' : 'Mission failed'}
      title={won ? 'All agents contacted!' : (s.assassinHit ? 'Assassin contacted' : 'Out of turns')}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>New mission</button>}
    >
      <div className="modal-body">
        <p style={{ textAlign: 'center' }}>
          {won
            ? <>You and your partner found all <b>15</b> agents in <i>{s.turnsTaken}</i> turns.</>
            : s.assassinHit
              ? <>An <b>assassin</b> was contacted — the mission is blown.</>
              : <>Time ran out with <i>{G.agentsRemaining(s)}</i> agents still hidden.</>}
        </p>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Codenames Duet" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin mission</button>}>
      <div className="modal-body">
        <p><b>Codenames Duet</b> is cooperative — you and your AI partner work <i>together</i> to contact all <b>15 secret agents</b> on the 5×5 word grid before the shared turn budget runs out, and without ever tapping an <b>assassin</b>.</p>
        <p>There are two hidden key cards. The board coloring you see is <b>your</b> key: <span style={{ color: 'var(--good)' }}>green</span> = your agents, neutral = bystanders, dark = your assassins. Your partner has a <i>different</i> key — three agents overlap, so 9 + 9 − 3 = 15 unique agents in all.</p>
        <p>You take turns being the <b>clue-giver</b>. On your clue turn, give a one-word clue + a number pointing your partner at <i>their</i> agents (use the suggestions or type your own). On your partner's clue turn, <b>tap</b> the words you believe are <i>your</i> agents. A correct agent lets you keep guessing; a bystander ends the turn; an assassin ends the mission.</p>
        <p><b>Keys:</b> tap a word to guess · type a clue + <kbd>↵</kbd> · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
