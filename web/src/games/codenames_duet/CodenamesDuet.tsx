/* CODENAMES DUET — UI (built for this codebase). A cooperative spy game: you and a
   partner (an AI locally, or a second human online) share one mission — contact all 15
   secret agents on a 5x5 word grid within the turn budget, without ever tapping an
   assassin. You alternate roles: on your clue turn you give a one-word clue + number from
   YOUR key card (shown as the board coloring) so your partner can find THEIR agents; on
   your partner's clue turn you tap the words you believe are agents on your key.

   Seat-relative: `mySeat` (0 or 1) is the local player; everything below is framed from
   that seat. The shared timer / mission / active clue are public. Online play swaps the
   AI partner for a second human via useGameSession + OnlineBar — your partner's key card
   is hidden from you (redactFor), exactly as the AI's was. */

import { useMemo, useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import { OnlineBar } from '../../framework/OnlineBar'
import { useGameSession } from '../../net/useGameSession'
import { codenamesDuetAdapter } from './net'
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

// The local seat's key card determines the board coloring shown to that player. A redacted
// (partner-side) role arrives as a non-role placeholder, so default it to a neutral cell.
function myRoleClass(c: Card, mySeat: number): string {
  const r = c.roles[mySeat]
  if (r === 'agent') return 'agent'
  if (r === 'assassin') return 'assassin'
  return 'bystander'
}

export function CodenamesDuet() {
  const { state: s, mySeat, isMyTurn, dispatch, newGame: netNew, net } = useGameSession(codenamesDuetAdapter)
  const [showRules, setShowRules] = useState(false)
  // Local clue draft (when it's your turn to give a clue).
  const [clueWord, setClueWord] = useState('')
  const [clueNum, setClueNum] = useState(2)
  const [flash, setFlash] = useState<{ word: string; kind: string } | null>(null)

  function newGame() {
    netNew()
    setClueWord('')
    setClueNum(2)
    setFlash(null)
    setShowRules(false)
  }

  const remaining = G.agentsRemaining(s)
  // Seat-relative phases. You give a clue when it's your turn and no clue is active; you
  // guess when there is an active clue someone else gave (clue.from is the OTHER seat).
  const myClueTurn = s.status === 'playing' && isMyTurn && s.clue == null
  const myGuessTurn = s.status === 'playing' && isMyTurn && s.clue != null
  const partnerLabel = net.online ? `Player ${(mySeat === 0 ? 1 : 0) + 1}` : 'Partner'

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false) },
  })

  // Tap a word during your guess turn.
  function tap(word: string) {
    if (!myGuessTurn) return
    const idx = s.cards.findIndex(c => c.word === word)
    const card = s.cards[idx]
    if (!card || card.contacted) return
    // Resolve against YOUR key for the flash hint.
    setFlash({ word, kind: card.roles[mySeat] })
    dispatch({ kind: 'guess', cell: idx })
  }

  // Suggestions cover your partner's hidden agents — only meaningful when YOU can see your
  // own key (you always can) and it's your clue turn. clueSuggestions reads the giver seat.
  const suggestions = useMemo(
    () => (myClueTurn ? G.clueSuggestions(s, mySeat as 0 | 1).slice(0, 6) : []),
    [s, myClueTurn, mySeat],
  )
  function submitClue(word: string, num: number) {
    if (!myClueTurn) return
    const w = word.trim().toUpperCase()
    if (!w) return
    dispatch({ kind: 'clue', word: w, count: num })
    setClueWord('')
  }

  // Banner — framed from the local seat.
  let banner: string, bk = ''
  if (s.status === 'won') { bk = 'win'; banner = `Mission complete — all 15 agents contacted in ${s.turnsTaken} turns!` }
  else if (s.status === 'lost' && s.assassinHit) { bk = 'lose'; banner = 'An ASSASSIN was contacted. The mission is blown.' }
  else if (s.status === 'lost') { bk = 'lose'; banner = `Out of turns with ${remaining} agent${remaining === 1 ? '' : 's'} still in the field. Mission failed.` }
  else if (myClueTurn) { bk = 'you'; banner = `Your turn to give a clue — point ${partnerLabel.toLowerCase()} at YOUR agents` }
  else if (myGuessTurn) { bk = 'you'; banner = `${partnerLabel}'s clue: ${s.clue!.word} ${s.clue!.number} — tap the words you think are your agents` }
  else if (s.clue == null) { bk = 'foe'; banner = `${partnerLabel} is choosing a clue…` }
  else { bk = 'foe'; banner = `${partnerLabel} is contacting agents…` }

  const clueText = s.clue ? `${s.clue.word} · ${s.clue.number}` : '—'
  const guessesLeft = s.clue ? s.clue.remaining : 0
  // Whose clue is active, from the local seat's point of view.
  const clueFromMe = s.clue != null && s.clue.from === mySeat

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Codenames Duet · co-op"
        title="Codenames Duet"
        subtitle="you &amp; a partner — contact all 15 agents together, never the assassin"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={<>Turns {Math.max(0, s.turnsLeft)} / {G.TOTAL_TURNS} · Agents {remaining}</>}
        banner={banner}
        bannerClass={bk}
        modeRight={<>tap word · clue + N · pass · new</>}
      >
        <div className="cd-main">
          <div className="cd-grid">
            {s.cards.map((c) => {
              const cls = myRoleClass(c, mySeat)
              const isFlash = flash?.word === c.word
              return (
                <button
                  key={c.word}
                  className={
                    'cd-card ' + cls +
                    (c.contacted ? ' contacted' : '') +
                    (c.revealed && !c.contacted ? ' spent' : '') +
                    (myGuessTurn && !c.contacted && !c.revealed ? ' tappable' : '') +
                    (isFlash ? ' flash-' + flash!.kind : '')
                  }
                  onClick={() => tap(c.word)}
                  disabled={!myGuessTurn || c.contacted || c.revealed}
                >
                  <span className="cd-word">{c.word}</span>
                  {c.contacted && <span className="cd-mark" aria-hidden="true">✦</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="side">
          <OnlineBar net={net} />

          <div className="panel cd-clue-panel">
            <div className="panel-l">Active clue</div>
            <div className="cd-clue-big">{clueText}</div>
            <div className="cd-clue-sub">
              {s.clue
                ? <>from {clueFromMe ? 'you' : partnerLabel.toLowerCase()} · {guessesLeft} guess{guessesLeft === 1 ? '' : 'es'} left</>
                : <>waiting for a clue</>}
            </div>
            {myGuessTurn && (
              <button className="cd-give-btn" onClick={() => dispatch({ kind: 'pass' })} style={{ marginTop: 8 }}>
                Pass turn
              </button>
            )}
          </div>

          {myClueTurn && (
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
              <div className="cd-sugg-label">Suggested clues (cover {partnerLabel.toLowerCase()}'s agents):</div>
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
              Coloring is YOUR key. {partnerLabel} sees a different key — some of your bystanders
              are their agents, so tap carefully on their clues.
            </div>
          </div>
        </div>
      </GameShell>

      {s.status !== 'playing' && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal partnerLabel={partnerLabel} onClose={() => setShowRules(false)} />}
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

function RulesModal({ partnerLabel, onClose }: { partnerLabel: string; onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Codenames Duet" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin mission</button>}>
      <div className="modal-body">
        <p><b>Codenames Duet</b> is cooperative — you and your partner work <i>together</i> to contact all <b>15 secret agents</b> on the 5×5 word grid before the shared turn budget runs out, and without ever tapping an <b>assassin</b>.</p>
        <p>There are two hidden key cards. The board coloring you see is <b>your</b> key: <span style={{ color: 'var(--good)' }}>green</span> = your agents, neutral = bystanders, dark = your assassins. {partnerLabel} has a <i>different</i> key — three agents overlap, so 9 + 9 − 3 = 15 unique agents in all.</p>
        <p>You take turns being the <b>clue-giver</b>. On your clue turn, give a one-word clue + a number pointing your partner at <i>their</i> agents (use the suggestions or type your own). On your partner's clue turn, <b>tap</b> the words you believe are <i>your</i> agents. A correct agent lets you keep guessing; a bystander ends the turn; an assassin ends the mission.</p>
        <p><b>Online:</b> Host online and share the link to play with a second human — each of you keeps your own secret key card hidden from the other.</p>
        <p><b>Keys:</b> tap a word to guess · type a clue + <kbd>↵</kbd> · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
