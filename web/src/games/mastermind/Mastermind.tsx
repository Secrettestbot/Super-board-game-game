/* MASTERMIND — UI (built for this codebase). A walnut code-breaking board on the
   framework shell. You assemble a 4-peg guess from 6 colours and submit; the board
   returns black/white feedback. Crack the hidden code within 10 guesses. Solo — no
   adversarial AI; the "opponent" is just the hidden code + the feedback oracle. */

import { useState } from 'react'
import { GameShell } from '../../framework/GameShell'
import { Modal } from '../../framework/Modal'
import { useGameKeys } from '../../framework/useGameKeys'
import * as MM from './logic'
import type { MastermindState, Peg } from './logic'

const { COLORS, SLOTS } = MM
const COLOR_IDS = Array.from({ length: COLORS }, (_, i) => i)
const ROW_IDS = Array.from({ length: MM.MAX_GUESSES }, (_, i) => i)

const TITLE_MARK = (
  <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="42" height="42" rx="9" fill="#3a2a1c" stroke="#cf9f4e" strokeWidth="1.5" />
    <circle cx="16" cy="17" r="5" fill="#e0433f" />
    <circle cx="32" cy="17" r="5" fill="#3f7fe0" />
    <circle cx="16" cy="32" r="5" fill="#4bb265" />
    <circle cx="32" cy="32" r="5" fill="#e8c64a" />
  </svg>
)

function Peg4({ pegs, current, sel, onPick }: {
  pegs: (Peg | null)[]
  current?: boolean
  sel?: number | null
  onPick?: (slot: number) => void
}) {
  return (
    <div className="mm-pegs">
      {Array.from({ length: SLOTS }, (_, i) => {
        const p = pegs[i]
        return (
          <div
            key={i}
            className={'mm-hole' + (current ? ' pick' : '') + (sel === i ? ' sel' : '')}
            onClick={current && onPick ? () => onPick(i) : undefined}
          >
            {p !== null && p !== undefined && <div className={'mm-peg c' + p} />}
          </div>
        )
      })}
    </div>
  )
}

function FeedbackPegs({ black, white }: { black: number; white: number }) {
  const keys: ('black' | 'white' | '')[] = []
  for (let i = 0; i < black; i++) keys.push('black')
  for (let i = 0; i < white; i++) keys.push('white')
  while (keys.length < SLOTS) keys.push('')
  return (
    <div className="mm-fb">
      {keys.map((k, i) => <div key={i} className={'mm-key ' + k} />)}
    </div>
  )
}

export function Mastermind() {
  const [s, setS] = useState<MastermindState>(() => MM.makeGame())
  const [draft, setDraft] = useState<(Peg | null)[]>(() => new Array(SLOTS).fill(null))
  const [picked, setPicked] = useState<Peg>(0)
  const [sel, setSel] = useState<number | null>(0)
  const [showRules, setShowRules] = useState(false)

  function newGame() {
    setS(MM.makeGame())
    setDraft(new Array(SLOTS).fill(null))
    setPicked(0)
    setSel(0)
    setShowRules(false)
  }

  const complete = MM.isComplete(draft)

  function submitGuess() {
    if (s.over || !complete) return
    setS(MM.submit(s, draft as Peg[]))
    setDraft(new Array(SLOTS).fill(null))
    setSel(0)
  }

  // place the currently-picked colour into the first empty slot (or selected slot)
  function dropColour(color: Peg) {
    if (s.over) return
    setPicked(color)
    const target = sel !== null && draft[sel] === null ? sel : draft.findIndex(p => p === null)
    if (target < 0) return
    const next = draft.slice(); next[target] = color
    setDraft(next)
    const nextEmpty = next.findIndex(p => p === null)
    setSel(nextEmpty < 0 ? null : nextEmpty)
  }

  // tap a slot: empty -> drop picked colour; filled -> cycle its colour
  function tapSlot(slot: number) {
    if (s.over) return
    setSel(slot)
    const next = draft.slice()
    if (next[slot] === null) next[slot] = picked
    else next[slot] = ((next[slot]! + 1) % COLORS) as Peg
    setDraft(next)
  }

  function clearSlot(slot: number) {
    if (s.over) return
    const next = draft.slice(); next[slot] = null
    setDraft(next)
    setSel(slot)
  }

  useGameKeys({
    onNew: newGame,
    onToggleRules: () => setShowRules(v => !v),
    onEscape: () => { if (showRules) setShowRules(false); else if (sel !== null) clearSlot(sel) },
    extra: (e) => {
      if (s.over) return false
      if (e.key === 'Enter') { submitGuess(); return true }
      if (e.key === 'Backspace') {
        const t = sel !== null && draft[sel] !== null ? sel : (() => { for (let i = SLOTS - 1; i >= 0; i--) if (draft[i] !== null) return i; return -1 })()
        if (t >= 0) clearSlot(t)
        return true
      }
      if (e.key >= '1' && e.key <= String(COLORS)) { dropColour((+e.key - 1) as Peg); return true }
      return false
    },
  })

  const left = MM.guessesLeft(s)
  let banner: string, bk = ''
  if (s.over && s.won) { bk = 'win'; banner = `Cracked in ${s.guesses}!` }
  else if (s.over) { bk = 'lose'; banner = 'Out of guesses — code revealed' }
  else { bk = 'you'; banner = complete ? 'Submit your guess' : 'Build a 4-peg guess' }

  return (
    <>
      <GameShell
        mark={TITLE_MARK}
        eyebrow="Mastermind · crack the code"
        title="Mastermind"
        subtitle="deduce the hidden 4-colour code from black &amp; white feedback — repeats allowed"
        onRules={() => setShowRules(true)}
        onNew={newGame}
        modeLeft={`${SLOTS} pegs · ${COLORS} colours`}
        banner={banner}
        bannerClass={bk}
        modeRight={<>1-6 · peg &nbsp; ⏎ · submit &nbsp; N · new</>}
      >
        <div className="mm-wrap">
          <div className="mm-board">
            {ROW_IDS.map((r) => {
              const row = s.rows[r]
              const isCurrent = !s.over && r === s.rows.length
              if (row) {
                return (
                  <div key={r} className="mm-row done">
                    <Peg4 pegs={row.guess} />
                    <FeedbackPegs black={row.fb.black} white={row.fb.white} />
                  </div>
                )
              }
              if (isCurrent) {
                return (
                  <div key={r} className="mm-row cur">
                    <Peg4 pegs={draft} current sel={sel} onPick={tapSlot} />
                    <span className="mm-num">{r + 1}</span>
                  </div>
                )
              }
              return (
                <div key={r} className="mm-row">
                  <Peg4 pegs={new Array(SLOTS).fill(null)} />
                  <span className="mm-num">{r + 1}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel remain">
            <span className="big">{left}</span>
            <span className="lab">guesses<br />remaining</span>
          </div>
          <div className="panel">
            <div className="panel-l" style={{ marginBottom: 9 }}>Colour palette</div>
            <div className="palette">
              {COLOR_IDS.map((c) => (
                <div
                  key={c}
                  className={'swatch c' + c + (picked === c ? ' on' : '')}
                  title={`Colour ${c + 1}`}
                  onClick={() => dropColour(c as Peg)}
                />
              ))}
            </div>
            <div className="mm-actions" style={{ marginTop: 12 }}>
              <button className="mm-btn" onClick={() => { setDraft(new Array(SLOTS).fill(null)); setSel(0) }} disabled={s.over || draft.every(p => p === null)}>Clear</button>
              <button className="mm-btn go" onClick={submitGuess} disabled={s.over || !complete}>Submit</button>
            </div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={'log-line ' + l.t}>{l.x}</div>)}</div>
        </div>
      </GameShell>

      {s.over && <ResultModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

function ResultModal({ s, onNew }: { s: MastermindState; onNew: () => void }) {
  return (
    <Modal
      eyebrow={s.won ? 'Code broken' : 'The code held'}
      title={s.won ? `Cracked in ${s.guesses}!` : 'Out of Guesses'}
      closeOnOverlay={false}
      actions={<button className="btn-modal" onClick={onNew}>Play again</button>}
    >
      <div className="modal-body">
        <p style={{ textAlign: 'center' }}>{s.won
          ? <>You broke the code in <i>{s.guesses}</i> {s.guesses === 1 ? 'guess' : 'guesses'}.</>
          : <>The hidden code was:</>}</p>
        <div className="reveal">
          {s.secret.map((p, i) => (
            <div key={i} className="mm-hole"><div className={'mm-peg c' + p} /></div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal eyebrow="How to play" title="Mastermind" onClose={onClose}
      actions={<button className="btn-modal" onClick={onClose}>Begin</button>}>
      <div className="modal-body">
        <p>The computer has hidden a secret <b>code</b> of 4 pegs, each one of <b>6 colours</b>. <i>Repeats are allowed</i> — a colour may appear more than once. You have <b>10 guesses</b> to crack it.</p>
        <p>Pick colours from the palette to build a 4-peg guess, then <b>Submit</b>. Each guess is scored with key-pegs: a <b>black</b> peg for every peg that is the right colour <i>and</i> the right position; a <b>white</b> peg for every peg that is the right colour but in the <i>wrong</i> position. The positions of those pegs are not revealed.</p>
        <p>Get all <b>4 black</b> pegs to win. Use up every guess without cracking it and the code is revealed.</p>
        <p><b>Keys:</b> <kbd>1</kbd>–<kbd>6</kbd> drop colour · <kbd>⏎</kbd> submit · <kbd>⌫</kbd> clear peg · <kbd>N</kbd> new · <kbd>?</kbd> rules.</p>
      </div>
    </Modal>
  )
}
