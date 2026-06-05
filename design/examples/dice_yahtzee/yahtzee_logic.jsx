/* YAHTZEE — dice logic. window.YahtLogic.
   13 rounds. Each turn: roll five dice, re-roll any subset up to twice, then fill one open
   category. Upper bonus +35 at 63+. Extra five-of-a-kinds score +100. You vs an AI; higher
   grand total wins. */
(function () {
  const CATS = [
    { k: "ones", name: "Ones", up: true }, { k: "twos", name: "Twos", up: true }, { k: "threes", name: "Threes", up: true },
    { k: "fours", name: "Fours", up: true }, { k: "fives", name: "Fives", up: true }, { k: "sixes", name: "Sixes", up: true },
    { k: "three", name: "Three of a Kind" }, { k: "four", name: "Four of a Kind" }, { k: "fullhouse", name: "Full House" },
    { k: "smstraight", name: "Small Straight" }, { k: "lgstraight", name: "Large Straight" }, { k: "yahtzee", name: "Yahtzee" }, { k: "chance", name: "Chance" },
  ];
  const UPPER = ["ones", "twos", "threes", "fours", "fives", "sixes"];

  function counts(d) { const c = [0, 0, 0, 0, 0, 0, 0]; for (const x of d) c[x]++; return c; }
  function sum(d) { return d.reduce((a, b) => a + b, 0); }
  function score(cat, d) {
    const c = counts(d), face = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
    if (face[cat]) return c[face[cat]] * face[cat];
    const maxc = Math.max(...c.slice(1));
    if (cat === "three") return maxc >= 3 ? sum(d) : 0;
    if (cat === "four") return maxc >= 4 ? sum(d) : 0;
    if (cat === "fullhouse") { const has3 = c.includes(3), has2 = c.includes(2); return (has3 && has2) || c.includes(5) ? 25 : 0; }
    if (cat === "smstraight") { const s = new Set(d); const seqs = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]; return seqs.some(q => q.every(n => s.has(n))) ? 30 : 0; }
    if (cat === "lgstraight") { const s = [...new Set(d)].sort().join(""); return s === "12345" || s === "23456" ? 40 : 0; }
    if (cat === "yahtzee") return maxc === 5 ? 50 : 0;
    if (cat === "chance") return sum(d);
    return 0;
  }

  function rollDie() { return 1 + ((Math.random() * 6) | 0); }
  function newCard() { const c = {}; for (const x of CATS) c[x.k] = null; c.yBonus = 0; return c; }

  function makeGame() {
    return {
      dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false], rollsLeft: 3, rolled: false,
      turn: "you", round: 1, cards: { you: newCard(), ai: newCard() }, winner: null, log: [{ t: "sys", x: "Roll the dice. Three rolls a turn — hold the ones you like." }],
    };
  }

  function totals(card) {
    let up = 0; for (const k of UPPER) up += card[k] || 0;
    const bonus = up >= 63 ? 35 : 0;
    let low = 0; for (const x of CATS) if (!x.up) low += card[x.k] || 0;
    return { up, bonus, low, yBonus: card.yBonus || 0, grand: up + bonus + low + (card.yBonus || 0) };
  }

  function push(log, t, x) { return log.concat([{ t, x }]).slice(-30); }

  function roll(s, who) {
    if (s.winner || s.turn !== who || s.rollsLeft <= 0) return s;
    const dice = s.dice.map((d, i) => (s.rolled && s.held[i]) ? d : rollDie());
    return Object.assign({}, s, { dice, rollsLeft: s.rollsLeft - 1, rolled: true });
  }
  function toggleHold(s, i) { if (!s.rolled || s.turn !== "you") return s; const held = s.held.slice(); held[i] = !held[i]; return Object.assign({}, s, { held }); }

  function pick(s, who, cat) {
    if (s.winner || s.turn !== who || !s.rolled) return s;
    const card = Object.assign({}, s.cards[who]);
    if (card[cat] != null) return s;
    let pts = score(cat, s.dice);
    // extra yahtzee bonus
    if (counts(s.dice).includes(5) && card.yahtzee != null && card.yahtzee > 0 && cat !== "yahtzee") card.yBonus = (card.yBonus || 0) + 100;
    card[cat] = pts;
    const cards = Object.assign({}, s.cards, { [who]: card });
    let log = push(s.log, who === "you" ? "you" : "ai", `${who === "you" ? "You" : "Rival"} scored ${CATS.find(c => c.k === cat).name} for ${pts}.`);
    const other = who === "you" ? "ai" : "you";
    const nextRound = who === "ai" ? s.round + 1 : s.round;
    let ns = Object.assign({}, s, { cards, turn: other, dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false], rollsLeft: 3, rolled: false, round: nextRound, log });
    // game over?
    if (Object.keys(s.cards.you).filter(k => k !== "yBonus").every(k => cards.you[k] != null) && Object.keys(cards.ai).filter(k => k !== "yBonus").every(k => cards.ai[k] != null)) {
      const yg = totals(cards.you).grand, ag = totals(cards.ai).grand;
      ns.winner = yg === ag ? "tie" : yg > ag ? "you" : "ai"; ns.turn = null;
      ns.log = push(ns.log, ns.winner === "you" ? "you" : "ai", `Final — you ${yg}, rival ${ag}.`);
    }
    return ns;
  }

  // ===== AI =====
  function aiKeep(dice, card) {
    const c = counts(dice);
    // if a straight is close, keep unique low/high
    const uniq = [...new Set(dice)];
    // default: keep the most frequent face
    let mode = 1, mc = 0; for (let f = 1; f <= 6; f++) if (c[f] >= mc) { mc = c[f]; mode = f; }
    // if 4+ unique consecutive present, chase straight
    const s = new Set(dice);
    const straightish = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]].some(q => q.filter(n => s.has(n)).length >= 3);
    return dice.map(d => straightish ? s.has(d) && [d] : d === mode);
  }
  function aiBestCat(dice, card) {
    let best = null, bv = -1;
    for (const x of CATS) { if (card[x.k] != null) continue; const v = score(x.k, dice); let adj = v; if (x.k === "chance") adj -= 2; if (v > bv) { bv = v; best = x.k; } }
    if (bv <= 0) {
      // dump: pick least valuable open (prefer ones, yahtzee last)
      const order = ["ones", "twos", "threes", "yahtzee", "four", "three", "fullhouse", "smstraight", "lgstraight", "fours", "fives", "sixes", "chance"];
      for (const k of order) if (card[k] != null ? false : card[k] === null) return k;
    }
    return best;
  }
  // returns the state after the AI plays its whole turn
  function aiTurn(s) {
    if (s.winner || s.turn !== "ai") return s;
    let st = roll(s, "ai");
    for (let r = 0; r < 2; r++) {
      const keep = aiKeepBool(st.dice, st.cards.ai);
      st = Object.assign({}, st, { held: keep });
      if (keep.every(Boolean)) break;
      st = roll(st, "ai");
    }
    const cat = aiBestCat(st.dice, st.cards.ai);
    return pick(st, "ai", cat || CATS.find(x => st.cards.ai[x.k] == null).k);
  }
  function aiKeepBool(dice, card) {
    const c = counts(dice); const s = new Set(dice);
    const straightish = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]].some(q => q.filter(n => s.has(n)).length >= 3) && card.lgstraight == null;
    if (straightish) { const seen = {}; return dice.map(d => { if (seen[d]) return false; seen[d] = 1; return true; }); }
    let mode = 6, mc = 0; for (let f = 1; f <= 6; f++) if (c[f] >= mc) { mc = c[f]; mode = f; }
    if (mc <= 1) { mode = Math.max(...dice.filter(d => d >= 4), 0); } // weak roll: keep high dice
    return dice.map(d => mc >= 2 ? d === mode : d >= 5);
  }

  window.YahtLogic = { CATS, UPPER, makeGame, score, roll, toggleHold, pick, aiTurn, totals, counts };
})();
