/* TINY TOWNS — UI. Logic → window.TinyLogic */

const { useState, useEffect } = React;
const TN = window.TinyLogic;
const N = TN.N;
const RES_NAME = { wood: "Wood", brick: "Brick", glass: "Glass", wheat: "Wheat", stone: "Stone" };
const B_ICON = { cottage: "⌂", farm: "≋", well: "○", chapel: "✚", tavern: "⚑" };

function App() {
  const [g, setG] = useState(() => TN.makeGame());
  const [buildMode, setBuildMode] = useState(null);
  const [showRules, setShowRules] = useState(false);

  function newGame() { setG(TN.makeGame()); setBuildMode(null); setShowRules(false); }

  useEffect(() => {
    function onKey(e) { if (e.key === "?" || e.key === "/") setShowRules(v => !v); else if (e.key === "Escape") { setShowRules(false); setBuildMode(null); } else if (e.key === "n" || e.key === "N") newGame(); }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const playing = g.status === "playing";
  const buildable = playing ? TN.buildableKeys(g.grid) : [];
  const candidates = buildMode ? new Set([].concat(...TN.matches(g.grid, buildMode))) : new Set();

  function clickCell(i) {
    if (!playing) return;
    if (buildMode) {
      if (candidates.has(i)) { setG(TN.build(g, buildMode, i)); setBuildMode(null); }
      return;
    }
    if (g.resource && g.grid[i] === null) setG(TN.place(g, i));
  }
  function pickBuild(key) {
    if (!buildable.includes(key)) return;
    setBuildMode(m => m === key ? null : key);
  }

  let banner, bk = "";
  if (g.status === "over") { bk = "win"; banner = `Town complete — ${g.score.total} point${Math.abs(g.score.total) === 1 ? "" : "s"}`; }
  else if (buildMode) { bk = "you"; banner = `Place your ${TN.BUILDINGS[buildMode].name} — tap a highlighted square`; }
  else if (g.resource) { bk = "you"; banner = `Place the ${RES_NAME[g.resource]}`; }
  else { bk = "you"; banner = "Town full — build to free a square, or end the town"; }

  return (
    <div className="app">
      <header className="masthead">
        <a className="back-link" href="../Game Library.html">
          <svg width="13" height="13" viewBox="0 0 14 14"><path d="M11 7 L3 7 M7 3 L3 7 L7 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          library
        </a>
        <div className="title-block">
          <svg className="title-mark" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="3" y="3" width="42" height="42" rx="9" fill="#1c1810" stroke="#4a3d28" strokeWidth="1.5" />
            <rect x="12" y="24" width="11" height="12" fill="#c0573f" /><path d="M11 24 L17.5 17 L24 24 Z" fill="#8a3c2a" />
            <rect x="26" y="20" width="10" height="16" fill="#d8a83e" /><path d="M25 20 L31 14 L37 20 Z" fill="#a87d24" />
          </svg>
          <div className="title-stack">
            <div className="title-eyebrow">Tiny Towns · pattern builder</div>
            <h1 className="title-main">Tiny Towns</h1>
            <div className="title-sub">place the resources you're dealt, match a pattern, and raise a building</div>
          </div>
        </div>
        <div className="tools">
          <button className="tool-btn" onClick={() => setShowRules(true)}>Rules</button>
          <button className="tool-btn primary" onClick={newGame}>New Game</button>
        </div>
      </header>

      <div className="modebar">
        <div className="mb-l">Turn {g.turn}</div>
        <div className={"turn-banner " + bk}>{banner}</div>
        <div className="mb-r">N · new &nbsp; ? · rules</div>
      </div>

      <div className="stage">
        <div className="boardside">
          <div className="supply">
            <span className="supply-l">To place</span>
            {g.resource ? <div className={"restile big r-" + g.resource}><span>{RES_NAME[g.resource]}</span></div> : <div className="restile big empty">—</div>}
          </div>
          <div className={"town" + (buildMode ? " building" : "")}>
            {g.grid.map((v, i) => {
              const cls = ["tcell"];
              if (!v) cls.push("empty");
              if (buildMode && candidates.has(i)) cls.push("candidate");
              if (!buildMode && g.resource && !v) cls.push("placeable");
              return (
                <div key={i} className={cls.join(" ")} onClick={() => clickCell(i)}>
                  {v && v.t === "r" && <div className={"restile r-" + v.r}><span>{RES_NAME[v.r]}</span></div>}
                  {v && v.t === "b" && <div className={"btile b-" + v.b}><span className="bi">{B_ICON[v.b]}</span><span className="bn">{TN.BUILDINGS[v.b].name}</span></div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="side">
          <div className="panel">
            <div className="panel-l">Buildings</div>
            <div className="blist">
              {Object.keys(TN.BUILDINGS).map(k => {
                const B = TN.BUILDINGS[k];
                const can = buildable.includes(k);
                return (
                  <div key={k} className={"brow" + (can ? " can" : "") + (buildMode === k ? " active" : "")} onClick={() => pickBuild(k)}>
                    <Pattern pattern={B.pattern} />
                    <div className="brow-txt"><div className="brow-name">{B_ICON[k]} {B.name}</div><div className="brow-desc">{B.desc}</div></div>
                    {can && <span className="brow-go">build</span>}
                  </div>
                );
              })}
            </div>
          </div>
          {playing && <button className="endbtn" onClick={() => setG(TN.endTown(g))}>End town &amp; score</button>}
        </div>
      </div>

      {g.status === "over" && <ScoreModal g={g} onNew={newGame} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function Pattern({ pattern }) {
  const maxR = Math.max(...pattern.map(c => c[0])), maxC = Math.max(...pattern.map(c => c[1]));
  const map = {}; pattern.forEach(c => map[c[0] + "_" + c[1]] = c[2]);
  const rows = [];
  for (let r = 0; r <= maxR; r++) { const row = []; for (let c = 0; c <= maxC; c++) row.push(map[r + "_" + c] || null); rows.push(row); }
  return (
    <div className="pat" style={{ gridTemplateColumns: `repeat(${maxC + 1}, 1fr)` }}>
      {rows.flat().map((res, i) => <span key={i} className={"pcell" + (res ? " r-" + res : " blank")}></span>)}
    </div>
  );
}

function ScoreModal({ g, onNew }) {
  const b = g.score.breakdown, bc = g.score.bcount;
  const rows = [
    ["Cottages", bc.cottage, b.cottage], ["Farms", bc.farm, b.farm], ["Chapels", bc.chapel, b.chapel],
    ["Wells", bc.well, b.well], ["Taverns", bc.tavern, b.tavern], ["Empty squares", g.score.empties, b.empty],
  ].filter(r => r[1] || r[2]);
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-eye">Final tally</div>
        <h2 className="modal-title">{g.score.total} points</h2>
        <div className="scoretable">
          {rows.map((r, i) => <div key={i} className="st-row"><span>{r[0]}</span><span className="st-n">{r[1]}</span><span className={"st-p" + (r[2] < 0 ? " neg" : "")}>{r[2] >= 0 ? "+" : ""}{r[2]}</span></div>)}
        </div>
        <div className="modal-actions"><button className="btn-modal" onClick={onNew}>Build another</button></div>
      </div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-eye">How to play</div>
        <h2 className="modal-title">Tiny Towns</h2>
        <div className="modal-body">
          <p>Each turn a resource is named — you <b>must</b> place it on an empty square of your 4×4 town. You don't choose which resource comes; only where it goes.</p>
          <p>When the exact <b>pattern</b> for a building appears (in any rotation or mirror), tap that building, then tap a square in the pattern: the resources clear and the building rises there.</p>
          <p>Score at the end: <i>Cottage</i> +3, <i>Farm</i> +4, <i>Chapel</i> +1 per cottage, <i>Well</i> +1 per adjacent cottage, <i>Taverns</i> 2/5/9/14/20 for a set. Every <b>empty square costs −1</b>.</p>
          <p>Buildings clear their squares, making room to keep going. End the town whenever you like.</p>
          <p><b>Keys:</b> <kbd>N</kbd> new · <kbd>?</kbd> rules · <kbd>Esc</kbd> cancel.</p>
        </div>
        <div className="modal-actions"><button className="btn-modal" onClick={onClose}>Begin</button></div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
