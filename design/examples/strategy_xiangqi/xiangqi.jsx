/* XIANGQI — UI. Logic → window.XiangqiLogic */

const { useState, useEffect, useMemo } = React;
const XQ = window.XiangqiLogic;
const W = XQ.W, H = XQ.H;
const GLYPH = {
  r: { K: "帥", A: "仕", E: "相", H: "傌", R: "俥", C: "炮", S: "兵" },
  b: { K: "將", A: "士", E: "象", H: "馬", R: "車", C: "砲", S: "卒" },
};

function App() {
  const [s, setS] = useState(() => XQ.makeInitial());
  const [sel, setSel] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const tRef = React.useRef(null);

  function newGame() { clearTimeout(tRef.current); setS(XQ.makeInitial()); setSel(null); setShowRules(false); }
  useEffect(() => {
    clearTimeout(tRef.current);
    if (!s.winner && s.turn === "b") tRef.current = setTimeout(() => setS(p => XQ.aiMove(p)), 250);
    return () => clearTimeout(tRef.current);
  }, [s.turn, s.winner, s.moveNo]);
  useEffect(() => { setSel(null); }, [s.turn]);
  useEffect(() => {
    function onKey(e) { if (e.key === "?" || e.key === "/") setShowRules(v => !v); else if (e.key === "Escape") { setShowRules(false); setSel(null); } else if (e.key === "n" || e.key === "N") newGame(); }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const yourTurn = !s.winner && s.turn === "r";
  const targets = useMemo(() => (sel != null && yourTurn ? new Set(XQ.legalMoves(s.board, "r").filter(m => m.from === sel).map(m => m.to)) : new Set()), [sel, s.board, yourTurn]);

  function clickPoint(i) {
    if (!yourTurn) return;
    const p = s.board[i];
    if (sel != null && targets.has(i)) { setS(XQ.applyMove(s, sel, i)); setSel(null); return; }
    if (p && p.s === "r") setSel(i === sel ? null : i);
    else setSel(null);
  }

  let banner, bk = "";
  if (s.winner === "r") { bk = "win"; banner = "Checkmate — you win"; }
  else if (s.winner === "b") { bk = "lose"; banner = "Checkmate — the rival wins"; }
  else if (yourTurn) { bk = "you"; banner = s.check ? "You're in check!" : "Red to move"; }
  else { bk = "foe"; banner = s.check ? "Rival in check…" : "The rival is calculating…"; }

  // geometry: 9 cols x 10 rows of intersections, padding
  const PAD = 6, GAP = (100 - PAD * 2) / 8; // % per col
  const GAPR = (100 - PAD * 2) / 9;          // % per row
  const px = c => PAD + c * GAP, py = r => PAD + r * GAPR;
  const lastFrom = s.last ? s.last.from : -1, lastTo = s.last ? s.last.to : -1;

  return (
    <div className="app">
      <header className="masthead">
        <a className="back-link" href="../Game Library.html">
          <svg width="13" height="13" viewBox="0 0 14 14"><path d="M11 7 L3 7 M7 3 L3 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          library
        </a>
        <div className="title-block">
          <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="3" y="3" width="42" height="42" rx="9" fill="#1d160e" stroke="#5a4226" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="14" fill="#e8d2a0" stroke="#b89058" strokeWidth="1.5" />
            <text x="24" y="31" fontFamily="serif" fontSize="20" fontWeight="700" fill="#b0331f" textAnchor="middle">帥</text>
          </svg>
          <div className="title-stack">
            <div className="title-eyebrow">Xiangqi · 象棋</div>
            <h1 className="title-main">Xiangqi</h1>
            <div className="title-sub">Chinese chess — cross the river, screen the cannon, and mate the general</div>
          </div>
        </div>
        <div className="tools">
          <button className="tool-btn" onClick={() => setShowRules(true)}>Rules</button>
          <button className="tool-btn primary" onClick={newGame}>New Game</button>
        </div>
      </header>

      <div className="modebar">
        <div className="mb-l">move {s.moveNo}</div>
        <div className={"turn-banner " + bk}>{banner}</div>
        <div className="mb-r">N · new &nbsp; ? · rules</div>
      </div>

      <div className="stage">
        <div className="boardwrap">
          <div className="board">
            <svg className="grid" viewBox="0 0 100 111" preserveAspectRatio="none">
              <rect x="0" y="0" width="100" height="111" className="board-bg" rx="2" />
              {/* horizontal lines */}
              {[...Array(10)].map((_, r) => <line key={"h" + r} x1={px(0)} y1={py(r) * 1.11} x2={px(8)} y2={py(r) * 1.11} className="gl" />)}
              {/* vertical lines (split at river except outer) */}
              {[...Array(9)].map((_, c) => (c === 0 || c === 8)
                ? <line key={"v" + c} x1={px(c)} y1={py(0) * 1.11} x2={px(c)} y2={py(9) * 1.11} className="gl" />
                : <g key={"v" + c}><line x1={px(c)} y1={py(0) * 1.11} x2={px(c)} y2={py(4) * 1.11} className="gl" /><line x1={px(c)} y1={py(5) * 1.11} x2={px(c)} y2={py(9) * 1.11} className="gl" /></g>)}
              {/* palace diagonals */}
              <line x1={px(3)} y1={py(0) * 1.11} x2={px(5)} y2={py(2) * 1.11} className="gl" /><line x1={px(5)} y1={py(0) * 1.11} x2={px(3)} y2={py(2) * 1.11} className="gl" />
              <line x1={px(3)} y1={py(7) * 1.11} x2={px(5)} y2={py(9) * 1.11} className="gl" /><line x1={px(5)} y1={py(7) * 1.11} x2={px(3)} y2={py(9) * 1.11} className="gl" />
              <text x="27" y={py(4.5) * 1.11 + 2} className="river-t">楚 河</text>
              <text x="62" y={py(4.5) * 1.11 + 2} className="river-t">漢 界</text>
            </svg>
            <div className="points">
              {s.board.map((p, i) => {
                const [r, c] = XQ.rc(i);
                const isT = targets.has(i);
                const cls = ["pt"];
                if (i === lastFrom || i === lastTo) cls.push("lastpt");
                return (
                  <div key={i} className={cls.join(" ")} style={{ left: px(c) + "%", top: py(r) + "%" }} onClick={() => clickPoint(i)}>
                    {p && <div className={"pc " + p.s + (sel === i ? " sel" : "")}><span className="g">{GLYPH[p.s][p.t]}</span></div>}
                    {isT && <div className={"tgt" + (p ? " cap" : "")}></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="panel players">
            <div className={"pl b" + (s.turn === "b" && !s.winner ? " on" : "")}><span className="pl-dot b"></span>Rival · Black</div>
            <div className={"pl r" + (s.turn === "r" && !s.winner ? " on" : "")}><span className="pl-dot r"></span>You · Red</div>
          </div>
          <div className="panel logbox">{s.log.slice().reverse().map((l, i) => <div key={i} className={"log-line " + l.t}>{l.x}</div>)}</div>
        </div>
      </div>

      {s.winner && <WinModal s={s} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function WinModal({ s, onNew }) {
  const won = s.winner === "r";
  return (
    <div className="overlay"><div className="modal">
      <div className="modal-eye">{won ? "将死" : "Checkmated"}</div>
      <h2 className="modal-title">{won ? "You Win" : "Rival Wins"}</h2>
      <div className="modal-actions"><button className="btn-modal" onClick={onNew}>Play again</button></div>
    </div></div>
  );
}
function RulesModal({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-eye">How to play</div>
      <h2 className="modal-title">Xiangqi</h2>
      <div className="modal-body">
        <p>You play <b>Red</b> (bottom) and move first. Pieces sit on intersections.</p>
        <p><b>Chariot</b> 俥 moves like a rook; the <b>Cannon</b> 炮 moves like a rook but must jump exactly one piece to capture. The <b>Horse</b> 傌 leaps but is blocked by a piece beside it. The <b>Elephant</b> 相 steps two diagonally, can't cross the river, and is blocked at its midpoint. <b>Advisors</b> 仕 and the <b>General</b> 帥 stay in the palace; the General can't face the enemy general down an open file.</p>
        <p><b>Soldiers</b> 兵 step forward, gaining a sideways step once across the river. Checkmate or stalemate the general to win.</p>
        <p><b>Keys:</b> <kbd>N</kbd> new game · <kbd>?</kbd> rules · <kbd>Esc</kbd> deselect.</p>
      </div>
      <div className="modal-actions"><button className="btn-modal" onClick={onClose}>Begin</button></div>
    </div></div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
