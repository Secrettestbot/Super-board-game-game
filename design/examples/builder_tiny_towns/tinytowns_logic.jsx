/* TINY TOWNS — solo logic. window.TinyLogic.
   4x4 town. Each turn a resource is named at random; you must place it on an empty square.
   When a building's exact resource pattern appears (any rotation/reflection), you may build:
   remove those resources and place the building on one of the pattern's squares. Empty squares
   cost -1 at the end. Build a high-scoring little town. */
(function () {
  const N = 4;
  const RES = ["wood", "brick", "glass", "wheat", "stone"];
  const RES_SHORT = { wood: "Wd", brick: "Bk", glass: "Gl", wheat: "Wh", stone: "St" };

  // buildings: pattern = [[dr,dc,res],...]
  const BUILDINGS = {
    cottage: { name: "Cottage", pattern: [[0, 0, "wheat"], [0, 1, "glass"], [1, 1, "brick"]], desc: "3 points each." },
    farm: { name: "Farm", pattern: [[0, 0, "wheat"], [0, 1, "wheat"], [1, 0, "wood"], [1, 1, "wood"]], desc: "4 points each." },
    well: { name: "Well", pattern: [[0, 0, "wood"], [0, 1, "stone"]], desc: "1 per adjacent Cottage." },
    chapel: { name: "Chapel", pattern: [[0, 0, "glass"], [0, 1, "glass"], [1, 0, "stone"]], desc: "1 per Cottage in town." },
    tavern: { name: "Tavern", pattern: [[0, 0, "brick"], [0, 1, "brick"], [0, 2, "brick"]], desc: "Set: 2 / 5 / 9 / 14 / 20." },
  };
  const TAVERN_SCORE = [0, 2, 5, 9, 14, 20];

  // generate 8 orientations of a pattern, normalized & deduped
  function orientations(pat) {
    const outs = [], seen = new Set();
    let cur = pat.map(c => [c[0], c[1], c[2]]);
    for (let refl = 0; refl < 2; refl++) {
      for (let rot = 0; rot < 4; rot++) {
        // normalize
        const minR = Math.min(...cur.map(c => c[0])), minC = Math.min(...cur.map(c => c[1]));
        const norm = cur.map(c => [c[0] - minR, c[1] - minC, c[2]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const sig = norm.map(c => c.join(",")).join(";");
        if (!seen.has(sig)) { seen.add(sig); outs.push(norm); }
        cur = cur.map(c => [c[1], -c[0], c[2]]); // rotate 90
      }
      cur = cur.map(c => [c[0], -c[1], c[2]]); // reflect
    }
    return outs;
  }
  const ORI = {}; for (const k in BUILDINGS) ORI[k] = orientations(BUILDINGS[k].pattern);

  function makeGame() {
    const g = {
      grid: new Array(N * N).fill(null),  // null | {t:'r',r} | {t:'b',b}
      resource: null, queue: [], status: "playing", score: null, turn: 0, log: [],
    };
    return drawResource(g);
  }
  function drawResource(g) {
    const empties = g.grid.filter(x => x === null).length;
    if (empties === 0) {
      // grid full — only end if nothing can be built to free a square
      if (buildableKeys(g.grid).length === 0) return Object.assign({}, g, { resource: null, status: "over", score: scoreTown(g.grid) });
      return Object.assign({}, g, { resource: null });
    }
    const r = RES[(Math.random() * RES.length) | 0];
    return Object.assign({}, g, { resource: r });
  }

  function place(g, cell) {
    if (g.status !== "playing" || !g.resource || g.grid[cell] !== null) return g;
    const grid = g.grid.slice(); grid[cell] = { t: "r", r: g.resource };
    let g2 = Object.assign({}, g, { grid, resource: null, turn: g.turn + 1 });
    return drawResource(g2); // name next resource (or end if full)
  }

  // find all buildable placements for building key on current grid
  function matches(grid, key) {
    const groups = [];
    for (const ori of ORI[key]) {
      const maxR = Math.max(...ori.map(c => c[0])), maxC = Math.max(...ori.map(c => c[1]));
      for (let R = 0; R + maxR < N; R++) for (let C = 0; C + maxC < N; C++) {
        let ok = true; const cells = [];
        for (const [dr, dc, res] of ori) { const i = (R + dr) * N + (C + dc); const v = grid[i]; if (!v || v.t !== "r" || v.r !== res) { ok = false; break; } cells.push(i); }
        if (ok) groups.push(cells);
      }
    }
    return groups;
  }
  function buildableKeys(grid) { return Object.keys(BUILDINGS).filter(k => matches(grid, k).length > 0); }

  // build `key`, placing the building on `targetCell` (must belong to a matching group)
  function build(g, key, targetCell) {
    if (g.status !== "playing") return g;
    const groups = matches(g.grid, key);
    const group = groups.find(cells => cells.includes(targetCell)) || groups[0];
    if (!group) return g;
    const tc = group.includes(targetCell) ? targetCell : group[0];
    const grid = g.grid.slice();
    for (const i of group) grid[i] = null;
    grid[tc] = { t: "b", b: key };
    let g2 = Object.assign({}, g, { grid });
    // if naming was pending and now there are cells, fine; if grid had been about to end, recompute resource
    if (!g2.resource && g2.status === "playing") g2 = drawResource(g2);
    return g2;
  }

  function endTown(g) { return Object.assign({}, g, { status: "over", score: scoreTown(g.grid) }); }

  function adjacent(i) { const r = Math.floor(i / N), c = i % N, out = []; if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N); if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1); return out; }

  function scoreTown(grid) {
    const bcount = {}; for (const k in BUILDINGS) bcount[k] = 0;
    const cells = grid.map((v, i) => ({ v, i }));
    for (const { v } of cells) if (v && v.t === "b") bcount[v.b]++;
    let pts = 0; const breakdown = {};
    // cottage
    breakdown.cottage = bcount.cottage * 3; pts += breakdown.cottage;
    // farm
    breakdown.farm = bcount.farm * 4; pts += breakdown.farm;
    // chapel: per cottage in town
    breakdown.chapel = bcount.chapel * bcount.cottage; pts += breakdown.chapel;
    // well: per adjacent cottage
    let wellPts = 0;
    for (const { v, i } of cells) if (v && v.t === "b" && v.b === "well") for (const j of adjacent(i)) { const w = grid[j]; if (w && w.t === "b" && w.b === "cottage") wellPts++; }
    breakdown.well = wellPts; pts += wellPts;
    // tavern set
    breakdown.tavern = TAVERN_SCORE[Math.min(bcount.tavern, 5)]; pts += breakdown.tavern;
    // empty penalty
    const empties = grid.filter(x => x === null).length;
    breakdown.empty = -empties; pts += -empties;
    return { total: pts, breakdown, bcount, empties };
  }

  window.TinyLogic = { N, RES, RES_SHORT, BUILDINGS, TAVERN_SCORE, makeGame, place, build, matches, buildableKeys, endTown, scoreTown, adjacent };
})();
