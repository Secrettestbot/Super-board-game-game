/* SKULL KING — game logic. Exposes window.SkullKingLogic.
   Pirate trick-taking with bidding. 10 rounds; round R deals R cards each.
   You vs the rival (AI). */
(function () {
  const SUITS = ["parrot", "chest", "map", "roger"]; // roger = Jolly Roger = trump (black)
  const SUIT_NAME = { parrot: "Parrot", chest: "Chest", map: "Map", roger: "Jolly Roger" };

  let UID = 0;
  function card(o) { return Object.assign({ id: ++UID }, o); }

  function buildDeck() {
    const d = [];
    for (const s of SUITS) for (let r = 1; r <= 14; r++) d.push(card({ kind: "suit", suit: s, rank: r }));
    for (let i = 0; i < 5; i++) d.push(card({ kind: "escape" }));
    for (let i = 0; i < 5; i++) d.push(card({ kind: "pirate" }));
    for (let i = 0; i < 2; i++) d.push(card({ kind: "mermaid" }));
    d.push(card({ kind: "skullking" }));
    return d;
  }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // strength used by AI for leading / dumping
  function cardVal(c) {
    if (c.kind === "escape") return 0;
    if (c.kind === "suit") return c.suit === "roger" ? 20 + c.rank : c.rank;
    if (c.kind === "mermaid") return 40;
    if (c.kind === "pirate") return 60;
    return 80; // skull king
  }

  function cardLabel(c) {
    if (c.kind === "escape") return "Escape";
    if (c.kind === "mermaid") return "Mermaid";
    if (c.kind === "pirate") return "Pirate";
    if (c.kind === "skullking") return "Skull King";
    return SUIT_NAME[c.suit] + " " + c.rank;
  }

  // legal plays when following
  function legalPlays(hand, trick) {
    if (trick.length === 0) return hand.slice();
    let leadSuit = null;
    for (const t of trick) { if (t.card.kind === "suit") { leadSuit = t.card.suit; break; } }
    if (!leadSuit) return hand.slice();
    const hasLead = hand.some(c => c.kind === "suit" && c.suit === leadSuit);
    if (!hasLead) return hand.slice();
    return hand.filter(c => (c.kind === "suit" && c.suit === leadSuit) || c.kind !== "suit");
  }
  function isLegal(card, hand, trick) {
    return legalPlays(hand, trick).some(c => c.id === card.id);
  }

  // resolve a completed (or partial) trick — cards: [{player, card}]
  function resolveTrick(cards) {
    const sk = cards.find(c => c.card.kind === "skullking");
    const firstPirate = cards.find(c => c.card.kind === "pirate");
    const firstMermaid = cards.find(c => c.card.kind === "mermaid");
    const pirateCount = cards.filter(c => c.card.kind === "pirate").length;
    let winnerIdx;

    if (sk || firstPirate || firstMermaid) {
      if (sk && firstPirate && firstMermaid) winnerIdx = cards.indexOf(firstMermaid);
      else if (sk && firstPirate) winnerIdx = cards.indexOf(sk);
      else if (firstPirate && firstMermaid) winnerIdx = cards.indexOf(firstPirate);
      else if (sk && firstMermaid) winnerIdx = cards.indexOf(firstMermaid);
      else if (sk) winnerIdx = cards.indexOf(sk);
      else if (firstPirate) winnerIdx = cards.indexOf(firstPirate);
      else winnerIdx = cards.indexOf(firstMermaid);
    } else {
      let leadSuit = null;
      for (const c of cards) { if (c.card.kind === "suit") { leadSuit = c.card.suit; break; } }
      if (!leadSuit) { winnerIdx = 0; }
      else {
        const rogers = cards.filter(c => c.card.kind === "suit" && c.card.suit === "roger");
        const pool = rogers.length ? rogers : cards.filter(c => c.card.kind === "suit" && c.card.suit === leadSuit);
        let best = pool[0];
        for (const c of pool) if (c.card.rank > best.card.rank) best = c;
        winnerIdx = cards.indexOf(best);
      }
    }

    let bonus = 0;
    for (const c of cards) if (c.card.kind === "suit" && c.card.rank === 14) bonus += c.card.suit === "roger" ? 20 : 10;
    const winner = cards[winnerIdx];
    if (winner.card.kind === "skullking" && pirateCount) bonus += 30 * pirateCount;
    if (winner.card.kind === "mermaid" && sk) bonus += 40;

    return { winnerIdx, winnerPlayer: winner.player, bonus };
  }

  function makeInitial(firstLeader) {
    firstLeader = firstLeader || "you";
    return dealRound({
      round: 1,
      phase: "bid",
      hands: { you: [], ai: [] },
      bids: { you: null, ai: null },
      tricksWon: { you: 0, ai: 0 },
      bonus: { you: 0, ai: 0 },
      scores: { you: 0, ai: 0 },
      leader: firstLeader,
      firstLeader,
      turn: firstLeader,
      trick: [],
      lastTrick: null,      // {cards, winnerPlayer, bonus} of the trick just resolved
      roundLog: [],         // [{round, you:{bid,tricks,delta}, ai:{...}}]
      log: [],
      winner: null,
    }, 1);
  }

  function dealRound(s, round) {
    const deck = shuffle(buildDeck());
    const you = deck.slice(0, round);
    const ai = deck.slice(round, round * 2);
    return Object.assign({}, s, {
      round,
      phase: "bid",
      hands: { you, ai },
      bids: { you: null, ai: null },
      tricksWon: { you: 0, ai: 0 },
      bonus: { you: 0, ai: 0 },
      leader: s.firstLeader,
      turn: s.firstLeader,
      trick: [],
      lastTrick: null,
    });
  }

  function aiBid(hand, round) {
    let exp = 0;
    for (const c of hand) {
      if (c.kind === "skullking") exp += 1;
      else if (c.kind === "pirate") exp += 0.85;
      else if (c.kind === "mermaid") exp += 0.55;
      else if (c.kind === "suit") {
        if (c.suit === "roger") exp += c.rank >= 12 ? 0.85 : c.rank >= 8 ? 0.5 : c.rank >= 5 ? 0.25 : 0.1;
        else exp += c.rank === 14 ? 0.6 : c.rank >= 12 ? 0.4 : c.rank >= 10 ? 0.2 : 0.04;
      }
    }
    exp += (Math.random() - 0.5) * 0.5;
    return Math.max(0, Math.min(round, Math.round(exp)));
  }

  // log helpers
  function push(log, t, x) { return log.concat([{ t, x }]).slice(-40); }

  // ===== player actions =====

  function submitBid(s, youBid) {
    if (s.phase !== "bid") return s;
    const ai = aiBid(s.hands.ai, s.round);
    let log = push(s.log, "sys", `Round ${s.round} · you bid ${youBid}, rival bids ${ai}.`);
    return Object.assign({}, s, {
      bids: { you: youBid, ai },
      phase: "play",
      turn: s.leader,
      log,
    });
  }

  // play a card for the current turn player
  function playCard(s, player, cardId) {
    if (s.phase !== "play" || s.turn !== player) return s;
    const hand = s.hands[player];
    const c = hand.find(x => x.id === cardId);
    if (!c) return s;
    if (!isLegal(c, hand, s.trick)) return s;

    const newHand = hand.filter(x => x.id !== cardId);
    const trick = s.trick.concat([{ player, card: c }]);
    const hands = Object.assign({}, s.hands, { [player]: newHand });
    let log = push(s.log, player, `${player === "you" ? "You" : "Rival"} played ${cardLabel(c)}.`);

    if (trick.length < 2) {
      const other = player === "you" ? "ai" : "you";
      return Object.assign({}, s, { hands, trick, turn: other, log });
    }

    // trick complete — freeze for reveal; collectTrick() applies it after a pause
    const res = resolveTrick(trick);
    return Object.assign({}, s, {
      hands, trick, phase: "trickEnd",
      pending: { winnerPlayer: res.winnerPlayer, winnerIdx: res.winnerIdx, bonus: res.bonus },
      log,
    });
  }

  // apply the frozen trick result and advance (called after the reveal pause)
  function collectTrick(s) {
    if (s.phase !== "trickEnd" || !s.pending) return s;
    const res = s.pending;
    const tricksWon = Object.assign({}, s.tricksWon);
    tricksWon[res.winnerPlayer] += 1;
    const bonus = Object.assign({}, s.bonus);
    bonus[res.winnerPlayer] += res.bonus;
    const wname = res.winnerPlayer === "you" ? "You" : "Rival";
    let log = push(s.log, res.winnerPlayer, `${wname} won the trick${res.bonus ? ` (+${res.bonus} bonus)` : ""}.`);

    const handsEmpty = s.hands.you.length === 0 && s.hands.ai.length === 0;
    const base = Object.assign({}, s, {
      trick: [], tricksWon, bonus, phase: "play", pending: null,
      leader: res.winnerPlayer, turn: res.winnerPlayer,
      lastTrick: { cards: s.trick, winnerPlayer: res.winnerPlayer, bonus: res.bonus },
      log,
    });
    if (!handsEmpty) return base;
    return scoreRound(base);
  }

  function roundDelta(bid, tricks, bonus, round) {
    let base, bonusApplies = false;
    if (bid === 0) { base = tricks === 0 ? 10 * round : -10 * round; }
    else if (tricks === bid) { base = 20 * bid; bonusApplies = true; }
    else { base = -10 * Math.abs(tricks - bid); }
    return base + (bonusApplies ? bonus : 0);
  }

  function scoreRound(s) {
    const dy = roundDelta(s.bids.you, s.tricksWon.you, s.bonus.you, s.round);
    const da = roundDelta(s.bids.ai, s.tricksWon.ai, s.bonus.ai, s.round);
    const scores = { you: s.scores.you + dy, ai: s.scores.ai + da };
    const roundLog = s.roundLog.concat([{
      round: s.round,
      you: { bid: s.bids.you, tricks: s.tricksWon.you, delta: dy },
      ai: { bid: s.bids.ai, tricks: s.tricksWon.ai, delta: da },
    }]);
    let log = push(s.log, "sys", `Round ${s.round} scored — you ${dy >= 0 ? "+" : ""}${dy}, rival ${da >= 0 ? "+" : ""}${da}.`);

    if (s.round >= 10) {
      const winner = scores.you === scores.ai ? "tie" : scores.you > scores.ai ? "you" : "ai";
      return Object.assign({}, s, { scores, roundLog, log, phase: "gameOver", winner });
    }
    return Object.assign({}, s, { scores, roundLog, log, phase: "roundEnd" });
  }

  function nextRound(s) {
    if (s.phase !== "roundEnd") return s;
    const firstLeader = s.firstLeader === "you" ? "ai" : "you";
    const ns = Object.assign({}, s, { firstLeader });
    return dealRound(ns, s.round + 1);
  }

  // ===== AI driver =====
  function aiPlayChoice(s) {
    const hand = s.hands.ai;
    const legal = legalPlays(hand, s.trick);
    const need = s.bids.ai - s.tricksWon.ai;
    const wantWin = need > 0;

    if (s.trick.length === 1) {
      // AI follows → it is last, knows outcome
      const evals = legal.map(card => {
        const res = resolveTrick(s.trick.concat([{ player: "ai", card }]));
        return { card, wins: res.winnerPlayer === "ai", bonus: res.bonus, val: cardVal(card) };
      });
      if (wantWin) {
        const winners = evals.filter(e => e.wins);
        if (winners.length) { winners.sort((a, b) => a.val - b.val); return winners[0].card; }
        evals.sort((a, b) => a.val - b.val); return evals[0].card;
      } else {
        const losers = evals.filter(e => !e.wins);
        if (losers.length) { losers.sort((a, b) => b.val - a.val); return losers[0].card; }
        evals.sort((a, b) => a.val - b.val); return evals[0].card;
      }
    }
    // AI leads
    const sorted = legal.slice().sort((a, b) => cardVal(a) - cardVal(b));
    return wantWin ? sorted[sorted.length - 1] : sorted[0];
  }

  function aiStep(s) {
    if (s.phase !== "play" || s.turn !== "ai") return s;
    const card = aiPlayChoice(s);
    return playCard(s, "ai", card.id);
  }

  window.SkullKingLogic = {
    SUITS, SUIT_NAME, makeInitial, submitBid, playCard, collectTrick, nextRound, aiStep,
    legalPlays, isLegal, resolveTrick, cardLabel, cardVal, aiBid,
  };
})();
