/* THE CREW — UI. Logic → window.CrewLogic */

const { useState, useEffect, useRef } = React;
const CR = window.CrewLogic;
const NAMES = CR.NAMES;
const CREWCLS = ["cr-you", "cr-vega", "cr-orion"];

function Card({ c, size, faded, dim, onClick, ring }) {
  const cls = ["card", "suit-" + c.suit];
  if (size) cls.push(size);
  if (faded) cls.push("faded");
  if (dim) cls.push("dim");
  if (ring != null) cls.push("ring", CREWCLS[ring]);
  return (
    <div className={cls.join(" ")} onClick={onClick}>
      {c.suit === "rocket" ? <span className="rocket-emblem"></span> : null}
      <span className="cval">{c.val}</span>
    </div>
  );
}

function TaskBadge({ task, small }) {
  const c = { suit: task.suit, val: task.val };
  return (
    <div className={"taskbadge" + (task.done ? " done" : "") + (task.failed ? " failed" : "")}>
      <Card c={c} size={small ? "tiny" : "mini"} ring={task.assignee} />
      {task.done && <span className="tb-mark ok">✓</span>}
      {task.failed && <span className="tb-mark no">✗</span>}
    </div>
  );
}

function App() {
  const [mission, setMission] = useState(1);
  const [s, setS] = useState(() => CR.makeMission(1));
  const [showRules, setShowRules] = useState(false);
  const t = useRef(null);
  const logRef = useRef(null);

  function startMission(n) { clearTimeout(t.current); setMission(n); setS(CR.makeMission(n)); setShowRules(false); }

  useEffect(() => {
    clearTimeout(t.current);
    if (!s.result && s.turn != null && s.turn !== 0) t.current = setTimeout(() => setS(p => CR.aiStep(p)), 620);
    return () => clearTimeout(t.current);
  }, [s.turn, s.result, s.trickNo]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [s.log]);
  useEffect(() => {
    function onKey(e) { if (e.key === "?" || e.key === "/") setShowRules(v => !v); else if (e.key === "Escape") setShowRules(false); else if (e.key === "n" || e.key === "N") startMission(mission); }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const yourTurn = !s.result && s.turn === 0;
  const legal = yourTurn ? new Set(CR.legalCards(s.hands[0], s.trick).map(c => c.id)) : new Set();

  function playYou(c) { if (yourTurn && legal.has(c.id)) setS(CR.playCard(s, 0, c.id)); }

  const shown = s.trick.length ? { cards: s.trick, winner: null } : s.lastTrick;
  function seatCard(p) { return shown ? (shown.cards.find(e => e.player === p) || null) : null; }
  function tasksOf(p) { return s.tasks.filter(t => t.assignee === p); }

  let banner, bk = "";
  if (s.result === "win") { bk = "win"; banner = "Mission accomplished"; }
  else if (s.result === "lose") { bk = "lose"; banner = "Mission failed"; }
  else if (yourTurn) { bk = "you"; banner = s.trick.length ? "Your turn — follow the lead" : "Your turn — lead a card"; }
  else { bk = "foe"; banner = `${NAMES[s.turn]} is playing…`; }

  function CrewSeat({ p }) {
    const card = seatCard(p);
    const isWinner = shown && shown.winner === p;
    return (
      <div className={"seat " + CREWCLS[p] + (s.turn === p && !s.result ? " active" : "")}>
        <div className="seat-top">
          <span className="seat-name">{NAMES[p]}</span>
          <span className="seat-cards">{s.hands[p].length}🂠</span>
        </div>
        <div className="seat-tasks">{tasksOf(p).map(tk => <TaskBadge key={tk.cardId} task={tk} small />)}{tasksOf(p).length === 0 && <span className="no-task">no task</span>}</div>
        <div className="seat-play">{card ? <Card c={card.card} size="play" faded={shown.winner != null && !isWinner} /> : <div className="play-empty"></div>}{isWinner && <span className="won-tag">won</span>}</div>
      </div>
    );
  }

  const youCard = seatCard(0);
  const youWin = shown && shown.winner === 0;

  return (
    <div className="app">
      <header className="masthead">
        <a className="back-link" href="../Game Library.html">
          <svg width="13" height="13" viewBox="0 0 14 14"><path d="M11 7 L3 7 M7 3 L3 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          library
        </a>
        <div className="title-block">
          <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="3" y="3" width="42" height="42" rx="10" fill="#0b1018" stroke="#2e3f52" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="13" fill="none" stroke="#4fd0e0" strokeWidth="1.4" opacity="0.5" />
            <path d="M24 12 L27 22 L24 30 L21 22 Z" fill="#4fd0e0" />
            <circle cx="24" cy="20" r="2" fill="#0b1018" />
            <path d="M21 28 l-3 5 M27 28 l3 5" stroke="#e0a64e" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <div className="title-stack">
            <div className="title-eyebrow">The Crew · co-op trick-taking</div>
            <h1 className="title-main">The Crew</h1>
            <div className="title-sub">silent teamwork in deep space — win the right cards for the right crewmate</div>
          </div>
        </div>
        <div className="tools">
          <button className="tool-btn" onClick={() => setShowRules(true)}>Rules</button>
          <button className="tool-btn primary" onClick={() => startMission(mission)}>Restart</button>
        </div>
      </header>

      <div className="modebar">
        <div className="mb-l">Mission {mission} · {s.tasks.filter(t => t.done).length}/{s.tasks.length} tasks</div>
        <div className={"turn-banner " + bk}>{banner}</div>
        <div className="mb-r">N · restart &nbsp; ? · rules</div>
      </div>

      <div className="stage">
        <div className="playcol">
          <div className="crewstrip">
            <CrewSeat p={1} />
            <div className="trick-center">
              <div className="tc-label">{shown ? (s.trick.length ? "current trick" : "last trick") : "awaiting launch"}</div>
              <div className="tc-cards">
                {[1, 0, 2].map(p => { const e = seatCard(p); return (
                  <div key={p} className={"tc-slot" + (shown && shown.winner === p ? " win" : "")}>
                    {e ? <Card c={e.card} size="play" faded={shown.winner != null && shown.winner !== p} /> : <div className="play-empty"></div>}
                    <span className="tc-who">{NAMES[p]}</span>
                  </div>
                ); })}
              </div>
            </div>
            <CrewSeat p={2} />
          </div>

          <div className="youzone">
            <div className="youhead">
              <span className="yh-name">You</span>
              <div className="yh-tasks">{tasksOf(0).map(tk => <TaskBadge key={tk.cardId} task={tk} />)}{tasksOf(0).length === 0 && <span className="no-task">no task assigned</span>}</div>
            </div>
            <div className="hand">
              {CR.sortHand(s.hands[0]).map(c => {
                const isLegal = legal.has(c.id);
                const isTask = s.tasks.some(tk => tk.cardId === c.id);
                return <div key={c.id} className={"handcard" + (yourTurn && !isLegal ? " illegal" : "") + (isTask ? " istask" : "")}>
                  <Card c={c} size="hand" onClick={yourTurn && isLegal ? () => playYou(c) : undefined} dim={yourTurn && !isLegal} />
                  {isTask && <span className="task-pip"></span>}
                </div>;
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel tasklist">
            <div className="panel-l">Mission tasks</div>
            <div className="tl-rows">
              {s.tasks.map(tk => (
                <div key={tk.cardId} className={"tl-row" + (tk.done ? " done" : "") + (tk.failed ? " failed" : "")}>
                  <Card c={{ suit: tk.suit, val: tk.val }} size="mini" ring={tk.assignee} />
                  <span className="tl-who">{NAMES[tk.assignee]}</span>
                  <span className="tl-status">{tk.done ? "✓ done" : tk.failed ? "✗ failed" : "pending"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel logbox" ref={logRef}>
            {s.log.map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}
          </div>
        </div>
      </div>

      {s.result && <ResultModal s={s} mission={mission} onNext={() => startMission(mission + 1)} onRetry={() => startMission(mission)} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function ResultModal({ s, mission, onNext, onRetry }) {
  const won = s.result === "win";
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-eye">{won ? "Telemetry nominal" : "Telemetry lost"}</div>
        <h2 className="modal-title">{won ? "Mission Complete" : "Mission Failed"}</h2>
        <div className="finalsc">{won ? `Mission ${mission} cleared — ${s.tasks.length} task${s.tasks.length > 1 ? "s" : ""} fulfilled` : "A task card went to the wrong crewmate"}</div>
        <div className="modal-actions">
          {won
            ? <button className="btn-modal" onClick={onNext}>Mission {mission + 1} →</button>
            : <button className="btn-modal" onClick={onRetry}>Retry mission</button>}
          {won && <button className="btn-modal ghost" onClick={onRetry}>Replay</button>}
        </div>
      </div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-eye">How to play</div>
        <h2 className="modal-title">The Crew</h2>
        <div className="modal-body">
          <p>A <b>cooperative</b> trick-taking game. You and your crewmates <i>Vega</i> and <i>Orion</i> share one goal: fulfil every <b>task</b>.</p>
          <p>Each task is a card pinned to one crewmate (ringed in their colour). That crewmate must <b>win the trick</b> containing their card. If anyone else takes it, the mission fails at once.</p>
          <p>Normal trick rules: follow the led colour if you can; otherwise play anything. <b>Rockets</b> are trump and beat all colours. Highest card wins the trick and leads the next.</p>
          <p>Clear a mission and the next adds another task. Play carefully — you can't tell your crewmates what's in your hand.</p>
          <p><b>Keys:</b> <kbd>N</kbd> restart · <kbd>?</kbd> rules · <kbd>Esc</kbd> close.</p>
        </div>
        <div className="modal-actions"><button className="btn-modal" onClick={onClose}>Launch</button></div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
