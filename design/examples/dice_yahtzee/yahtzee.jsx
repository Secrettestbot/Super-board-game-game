/* YAHTZEE — UI. Logic → window.YahtLogic */

const { useState, useEffect } = React;
const YA = window.YahtLogic;

function Die({ v, held, onClick, rolling }) {
  const pips = PIPS[v] || [];
  return (
    <button className={"die" + (held ? " held" : "") + (rolling ? " rolling" : "")} onClick={onClick} style={{ width: "56px", height: "56px", flex: "0 0 auto" }}>
      <div className="pips">{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <span key={i} className={"pip" + (pips.includes(i) ? " on" : "")}></span>)}</div>
    </button>
  );
}
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function App() {
  const [s, setS] = useState(() => YA.makeGame());
  const [showRules, setShowRules] = useState(false);
  const [anim, setAnim] = useState(null);   // { roll:[bool], faces:[v] }
  const tRef = React.useRef(null);
  const aRef = React.useRef(null);

  function newGame() { clearTimeout(tRef.current); setS(YA.makeGame()); setShowRules(false); }
  useEffect(() => {
    clearTimeout(tRef.current);
    if (!s.winner && s.turn === "ai") tRef.current = setTimeout(() => setS(p => YA.aiTurn(p)), 900);
    return () => clearTimeout(tRef.current);
  }, [s.turn, s.winner]);
  useEffect(() => {
    function onKey(e) { if (e.key === "?" || e.key === "/") setShowRules(v => !v); else if (e.key === "Escape") setShowRules(false); else if (e.key === "n" || e.key === "N") newGame(); else if (e.key === " " && s.turn === "you" && s.rollsLeft > 0 && !s.winner) { e.preventDefault(); rollDice(); } }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const yourTurn = !s.winner && s.turn === "you";
  const yt = YA.totals(s.cards.you), at = YA.totals(s.cards.ai);

  function animateRoll(rolling) {
    clearInterval(aRef.current);
    let t = 0;
    aRef.current = setInterval(() => {
      t += 70;
      setAnim({ roll: rolling, faces: rolling.map(() => 1 + ((Math.random() * 6) | 0)) });
      if (t >= 540) { clearInterval(aRef.current); setAnim(null); }
    }, 70);
    setAnim({ roll: rolling, faces: rolling.map(() => 1 + ((Math.random() * 6) | 0)) });
  }
  function rollDice() {
    if (!(yourTurn && s.rollsLeft > 0)) return;
    const rolling = s.dice.map((_, i) => !(s.rolled && s.held[i]));
    animateRoll(rolling);
    setS(YA.roll(s, "you"));
  }
  function hold(i) { if (yourTurn && s.rolled) setS(YA.toggleHold(s, i)); }
  function pickCat(k) { if (yourTurn && s.rolled && s.cards.you[k] == null) setS(YA.pick(s, "you", k)); }

  let banner, bk = "";
  if (s.winner === "you") { bk = "win"; banner = `You win — ${yt.grand} to ${at.grand}`; }
  else if (s.winner === "ai") { bk = "lose"; banner = `Rival wins — ${at.grand} to ${yt.grand}`; }
  else if (s.winner === "tie") { banner = "A tie"; }
  else if (yourTurn) { bk = "you"; banner = !s.rolled ? "Your turn — roll the dice" : s.rollsLeft > 0 ? "Hold dice and re-roll, or score" : "Choose a category to score"; }
  else { bk = "foe"; banner = "The rival is rolling…"; }

  return (
    <div className="app">
      <header className="masthead">
        <a className="back-link" href="../Game Library.html">
          <svg width="13" height="13" viewBox="0 0 14 14"><path d="M11 7 L3 7 M7 3 L3 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          library
        </a>
        <div className="title-block">
          <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="6" y="6" width="36" height="36" rx="8" fill="#f0ece0" stroke="#c0392b" strokeWidth="2" transform="rotate(-8 24 24)" />
            <circle cx="17" cy="18" r="3" fill="#c0392b" /><circle cx="24" cy="24" r="3" fill="#c0392b" /><circle cx="31" cy="30" r="3" fill="#c0392b" />
          </svg>
          <div className="title-stack">
            <div className="title-eyebrow">Yahtzee · five dice</div>
            <h1 className="title-main">Yahtzee</h1>
            <div className="title-sub">three rolls a turn — chase the categories and beat the rival's card</div>
          </div>
        </div>
        <div className="tools">
          <button className="tool-btn" onClick={() => setShowRules(true)}>Rules</button>
          <button className="tool-btn primary" onClick={newGame}>New Game</button>
        </div>
      </header>

      <div className="modebar">
        <div className="mb-l">Round {s.round}/13</div>
        <div className={"turn-banner " + bk}>{banner}</div>
        <div className="mb-r">space · roll &nbsp; N · new</div>
      </div>

      <div className="stage">
        <div className="dicearea">
          <div className="dice">
            {s.dice.map((v, i) => { const rolling = !!(anim && anim.roll[i]); return <Die key={i} v={rolling ? anim.faces[i] : v} held={s.rolled && s.held[i] && !rolling} rolling={rolling} onClick={() => hold(i)} />; })}
          </div>
          <div className="rollzone">
            <button className="rollbtn" disabled={!yourTurn || s.rollsLeft <= 0} onClick={rollDice}>{s.rolled ? `Re-roll` : "Roll"} <span className="rl">{s.rollsLeft} left</span></button>
            {s.rolled && yourTurn && <div className="roll-hint">Tap dice to hold · tap a category to score</div>}
          </div>
        </div>

        <div className="cardwrap">
          <table className="scorecard">
            <thead><tr><th></th><th className="cyou">You</th><th className="cai">Rival</th></tr></thead>
            <tbody>
              {YA.CATS.map((cat, i) => {
                const yv = s.cards.you[cat.k], av = s.cards.ai[cat.k];
                const open = yourTurn && s.rolled && yv == null;
                const preview = open ? YA.score(cat.k, s.dice) : null;
                return (
                  <React.Fragment key={cat.k}>
                    {i === 6 && <tr className="divider"><td colSpan="3">Lower</td></tr>}
                    <tr className={open ? "open" : ""}>
                      <td className="catname" onClick={() => open && pickCat(cat.k)}>{cat.name}</td>
                      <td className={"cell you" + (open ? " sel" : "")} onClick={() => open && pickCat(cat.k)}>{yv != null ? yv : open ? <span className="prev">{preview}</span> : ""}</td>
                      <td className="cell ai">{av != null ? av : ""}</td>
                    </tr>
                    {i === 5 && <tr className="subtot"><td>Upper bonus (63+)</td><td className="you">{yt.bonus || (yt.up >= 63 ? 35 : "—")}</td><td className="ai">{at.bonus || "—"}</td></tr>}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="grand"><td>Total</td><td className="you">{yt.grand}</td><td className="ai">{at.grand}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      {s.winner && <WinModal s={s} yt={yt} at={at} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function WinModal({ s, yt, at, onNew }) {
  const won = s.winner === "you", tie = s.winner === "tie";
  return (
    <div className="overlay"><div className="modal">
      <div className="modal-eye">{tie ? "Dead heat" : won ? "Hot dice" : "Cold dice"}</div>
      <h2 className="modal-title">{tie ? "A Tie" : won ? "You Win" : "Rival Wins"}</h2>
      <div className="finalsc"><span className="you">You {yt.grand}</span><span className="foe">Rival {at.grand}</span></div>
      <div className="modal-actions"><button className="btn-modal" onClick={onNew}>Play again</button></div>
    </div></div>
  );
}
function RulesModal({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-eye">How to play</div>
      <h2 className="modal-title">Yahtzee</h2>
      <div className="modal-body">
        <p>Each turn, roll five dice. You may <b>re-roll</b> any dice up to twice — tap a die to <b>hold</b> it. Then score the dice in one open category.</p>
        <p>The <b>upper</b> section (Ones–Sixes) sums that face; reach 63 for a <b>+35 bonus</b>. The <b>lower</b> section: three/four of a kind (sum all), full house (25), small/large straight (30/40), <b>Yahtzee</b> five-of-a-kind (50), and chance (sum). Extra Yahtzees add +100.</p>
        <p>Every category is used exactly once across 13 rounds. Highest grand total wins.</p>
        <p><b>Keys:</b> <kbd>space</kbd> roll · <kbd>N</kbd> new game · <kbd>?</kbd> rules.</p>
      </div>
      <div className="modal-actions"><button className="btn-modal" onClick={onClose}>Begin</button></div>
    </div></div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
