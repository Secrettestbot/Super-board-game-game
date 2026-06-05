/* YINSH — logic. window.YinshLogic.
   Hex-shaped board of intersections (the standard Yinsh point set). Each player has 5 rings.
   Phase 1: players alternate placing their 5 rings. Phase 2: a turn = drop a marker (your
   colour) inside one of your rings, then move that ring in a straight line. The ring must
   land on the first empty point beyond any run of markers it jumps; every marker jumped is
   FLIPPED. Five of your markers in a row → remove that run and one of your rings (score).
   First to remove 3 rings wins. You are White, the rival Black. */
(function () {
  // axial-ish: use (col, row) offset coordinates over the Yinsh point layout.
  // The board: 11 columns; each column has a vertical run of points of varying length, hex outline.
  // We model points by (x,y) integer grid where valid points follow the Yinsh shape.
  // Columns 0..10, with per-column [yMin,yMax] inclusive of valid rows (0..10).
  const COLS = [
    [4, 7], [2, 8], [1, 9], [1, 9], [0, 10], [0, 9], [1, 10], [1, 9], [1, 9], [2, 8], [4, 7],
  ];
  // Actually use the canonical Yinsh: 85 points. Define via radius condition on a hex grid.
  const PTS = [];
  const PT_SET = new Set();
  for (let c = 0; c < 11; c++) { const [a, b] = COLS[c]; for (let r = a; r <= b; r++) { PTS.push([c, r]); PT_SET.add(c + "," + r); } }
  const has = (c, r) => PT_SET.has(c + "," + r);
  const key = (c, r) => c + "," + r;

  // six hex directions in this offset system (columns vertical). Use axial directions:
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];

  function makeGame() {
    return {
      rings: {},      // key -> 'w'|'b'
      markers: {},    // key -> 'w'|'b'
      phase: "place", // 'place' | 'play' | 'over'
      turn: "w", you: "w",
      placed: { w: 0, b: 0 },
      score: { w: 0, b: 0 },
      pendingRing: null,   // key of dropped-marker ring awaiting move
      pendingRows: null,   // rows to resolve {who, options:[[keys]]}
      removingRing: null,  // who must remove a ring after scoring
      winner: null, last: null,
      log: [{ t: "sys", x: "Place your five rings. Then drop a marker and slide the ring beyond — flipping all it jumps." }],
    };
  }

  function linePoints(c, r, dc, dr) { const out = []; let x = c + dc, y = r + dr; while (has(x, y)) { out.push([x, y]); x += dc; y += dr; } return out; }

  // legal landing points for a ring at (c,r): along each dir, slide over empties; may jump a
  // contiguous run of markers; land on first empty after; cannot pass another ring; stop at ring.
  function ringMoves(s, c, r) {
    const out = [];
    for (const [dc, dr] of DIRS) {
      let jumped = false;
      let x = c + dc, y = r + dr;
      while (has(x, y)) {
        const k = key(x, y);
        if (s.rings[k]) break;                       // can't land on / pass a ring
        if (s.markers[k]) { jumped = true; x += dc; y += dr; continue; } // jump markers
        // empty
        out.push(k);
        if (jumped) break;                            // after jumping, must land on first empty
        x += dc; y += dr;
      }
    }
    return out;
  }

  function push(log, t, x) { return log.concat([{ t, x }]).slice(-30); }
  const other = p => p === "w" ? "b" : "w";

  function placeRing(s, k) {
    if (s.phase !== "place" || s.rings[k] || s.markers[k]) return s;
    const rings = Object.assign({}, s.rings, { [k]: s.turn });
    const placed = Object.assign({}, s.placed, { [s.turn]: s.placed[s.turn] + 1 });
    let phase = "place", turn = other(s.turn);
    if (placed.w >= 5 && placed.b >= 5) { phase = "play"; turn = "w"; }
    let log = push(s.log, s.turn === s.you ? "you" : "ai", `${s.turn === s.you ? "You" : "Rival"} placed a ring.`);
    return Object.assign({}, s, { rings, placed, phase, turn, last: { place: k }, log });
  }

  // drop marker in a ring then await move
  function dropMarker(s, k) {
    if (s.phase !== "play" || s.pendingRing || s.removingRing) return s;
    if (s.rings[k] !== s.turn) return s;
    const markers = Object.assign({}, s.markers, { [k]: s.turn });
    const rings = Object.assign({}, s.rings); delete rings[k];
    return Object.assign({}, s, { markers, rings, pendingRing: k, last: { drop: k } });
  }
  function cancelDrop(s) {
    if (!s.pendingRing) return s;
    const k = s.pendingRing;
    const markers = Object.assign({}, s.markers); delete markers[k];
    const rings = Object.assign({}, s.rings, { [k]: s.turn });
    return Object.assign({}, s, { markers, rings, pendingRing: null });
  }

  function moveRing(s, to) {
    if (!s.pendingRing) return s;
    const from = s.pendingRing;
    const [fc, fr] = from.split(",").map(Number), [tc, tr] = to.split(",").map(Number);
    if (!ringMoves(s, fc, fr).includes(to)) return s;
    // flip markers between from and to
    const markers = Object.assign({}, s.markers);
    const dc = Math.sign(tc - fc), dr = Math.sign(tr - fr);
    let x = fc + dc, y = fr + dr;
    while (!(x === tc && y === tr)) { const k = key(x, y); if (markers[k]) markers[k] = other(markers[k]); x += dc; y += dr; }
    const rings = Object.assign({}, s.rings, { [to]: s.turn });
    let ns = Object.assign({}, s, { markers, rings, pendingRing: null, last: { from, to } });
    let log = push(s.log, s.turn === s.you ? "you" : "ai", `${s.turn === s.you ? "You" : "Rival"} moved a ring.`);
    ns.log = log;
    return resolveRows(ns, s.turn);
  }

  // find five-in-a-row runs of a colour
  function findRuns(markers, colour) {
    const runs = [];
    const seen = new Set();
    for (const k of Object.keys(markers)) {
      if (markers[k] !== colour) continue;
      const [c, r] = k.split(",").map(Number);
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1]]) {
        // only start runs (no same-colour marker behind)
        const bk = key(c - dc, r - dr);
        if (markers[bk] === colour) continue;
        const run = [];
        let x = c, y = r;
        while (markers[key(x, y)] === colour) { run.push(key(x, y)); x += dc; y += dr; }
        if (run.length >= 5) runs.push(run.slice(0, 5).length === run.length ? run : run);
      }
    }
    return runs.filter(r => r.length >= 5);
  }

  function resolveRows(s, mover) {
    // mover's runs first, then opponent (a move can form opponent rows via flips)
    const myRuns = findRuns(s.markers, mover);
    if (myRuns.length) return Object.assign({}, s, { pendingRows: { who: mover, runs: myRuns }, removingRing: null, turn: mover });
    const oppRuns = findRuns(s.markers, other(mover));
    if (oppRuns.length) return Object.assign({}, s, { pendingRows: { who: other(mover), runs: oppRuns }, turn: other(mover) });
    return Object.assign({}, s, { turn: other(mover) });
  }

  // remove a chosen run (5 markers) then require a ring removal
  function removeRun(s, runKeys) {
    if (!s.pendingRows) return s;
    const who = s.pendingRows.who;
    const markers = Object.assign({}, s.markers);
    for (const k of runKeys) delete markers[k];
    let log = push(s.log, who === s.you ? "you" : "ai", `${who === s.you ? "You" : "Rival"} completed a row!`);
    return Object.assign({}, s, { markers, pendingRows: null, removingRing: who, log });
  }
  function removeRing(s, k) {
    if (!s.removingRing) return s;
    const who = s.removingRing;
    if (s.rings[k] !== who) return s;
    const rings = Object.assign({}, s.rings); delete rings[k];
    const score = Object.assign({}, s.score, { [who]: s.score[who] + 1 });
    let log = push(s.log, who === s.you ? "you" : "ai", `${who === s.you ? "You" : "Rival"} removed a ring (${score[who]}/3).`);
    let ns = Object.assign({}, s, { rings, score, removingRing: null, log });
    if (score[who] >= 3) { ns.winner = who; ns.phase = "over"; ns.turn = null; ns.log = push(ns.log, who === s.you ? "you" : "ai", `${who === s.you ? "You win" : "Rival wins"} — three rings!`); return ns; }
    // after scoring, check for further runs then pass turn
    return resolveRows(ns, who === s.turn ? s.turn : who);
  }

  // ===== AI =====
  function allRingPositions(s, who) { return Object.keys(s.rings).filter(k => s.rings[k] === who); }
  function evalState(s, me) {
    const op = other(me);
    let sc = (s.score[me] - s.score[op]) * 100;
    let mm = 0, om = 0; for (const k in s.markers) { if (s.markers[k] === me) mm++; else om++; }
    sc += (mm - om) * 1.0;
    // near-rows: count runs of 3-4
    return sc;
  }
  function aiPlace(s) {
    // place ring near centre with light spread
    const empties = PTS.map(([c, r]) => key(c, r)).filter(k => !s.rings[k] && !s.markers[k]);
    empties.sort((a, b) => dist(a) - dist(b));
    const pick = empties[Math.min((Math.random() * 4) | 0, empties.length - 1)];
    return placeRing(s, pick);
  }
  function dist(k) { const [c, r] = k.split(",").map(Number); return Math.abs(c - 5) + Math.abs(r - 5); }

  function aiTurn(s) {
    if (s.winner) return s;
    if (s.phase === "place" && s.turn === "b") return aiPlace(s);
    if (s.removingRing === "b") { const rs = allRingPositions(s, "b"); return removeRing(s, rs[(Math.random() * rs.length) | 0]); }
    if (s.pendingRows && s.pendingRows.who === "b") return removeRun(s, s.pendingRows.runs[0]);
    if (s.phase === "play" && s.turn === "b" && !s.pendingRing) {
      // pick best (ring, move): greedily maximize markers flipped to mine + progress
      const rings = allRingPositions(s, "b");
      let best = null, bv = -1e9;
      for (const rk of rings) {
        const [c, r] = rk.split(",").map(Number);
        const dropped = dropMarker(s, rk);
        const moves = ringMoves(dropped, c, r);
        for (const to of moves) {
          const after = simMove(dropped, to);
          let v = evalState(after, "b");
          // reward forming runs
          if (findRuns(after.markers, "b").length) v += 60;
          v += Math.random() * 2;
          if (v > bv) { bv = v; best = { rk, to }; }
        }
      }
      if (!best) { // no move: pass by dropping+moving minimal — should not happen often
        return Object.assign({}, s, { turn: "w" });
      }
      let st = dropMarker(s, best.rk);
      return moveRing(st, best.to);
    }
    return s;
  }
  function simMove(s, to) {
    // like moveRing but pure (s already has pendingRing + dropped marker)
    const from = s.pendingRing;
    const [fc, fr] = from.split(",").map(Number), [tc, tr] = to.split(",").map(Number);
    const markers = Object.assign({}, s.markers);
    const dc = Math.sign(tc - fc), dr = Math.sign(tr - fr);
    let x = fc + dc, y = fr + dr;
    while (!(x === tc && y === tr)) { const k = key(x, y); if (markers[k]) markers[k] = other(markers[k]); x += dc; y += dr; }
    const rings = Object.assign({}, s.rings, { [to]: s.turn });
    return Object.assign({}, s, { markers, rings, pendingRing: null });
  }

  window.YinshLogic = { PTS, COLS, makeGame, ringMoves, placeRing, dropMarker, cancelDrop, moveRing, removeRun, removeRing, aiTurn, findRuns, has, key };
})();
