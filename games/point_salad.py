"""Point Salad - A card-drafting vegetable/scoring game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Vegetable types
VEGGIES = ["Tomato", "Lettuce", "Carrot", "Cabbage", "Onion", "Pepper"]

VEGGIE_SHORT = {
    "Tomato": "TOM",
    "Lettuce": "LET",
    "Carrot": "CAR",
    "Cabbage": "CAB",
    "Onion": "ONI",
    "Pepper": "PEP",
}

VEGGIE_ICONS = {
    "Tomato": "[Tom]",
    "Lettuce": "[Let]",
    "Carrot": "[Car]",
    "Cabbage": "[Cab]",
    "Onion": "[Oni]",
    "Pepper": "[Pep]",
}


def _make_scoring_card(rule_text, score_func, veggie_back):
    """Create a point card (scoring side up) with a veggie on the back."""
    return {
        "type": "scoring",
        "rule": rule_text,
        "score_func": score_func,  # callable(veggie_counts) -> int
        "veggie_back": veggie_back,
    }


def _make_veggie_card(veggie):
    """Create a vegetable card."""
    return {
        "type": "veggie",
        "veggie": veggie,
    }


def _generate_scoring_rules():
    """Generate a pool of scoring cards with diverse rules."""
    rules = []

    # Per-veggie scoring: "X pts per Veggie"
    for v in VEGGIES:
        vs = VEGGIE_SHORT[v]
        for pts in [2, 3]:
            rules.append((
                f"{pts} pts per {v}",
                lambda counts, veg=v, p=pts: counts.get(veg, 0) * p,
            ))

    # Pair scoring: "5 pts per Veggie1/Veggie2 pair"
    pairs = [
        ("Tomato", "Lettuce"), ("Carrot", "Cabbage"),
        ("Onion", "Pepper"), ("Tomato", "Carrot"),
        ("Lettuce", "Onion"), ("Cabbage", "Pepper"),
    ]
    for v1, v2 in pairs:
        rules.append((
            f"5 pts per {v1}/{v2} pair",
            lambda counts, a=v1, b=v2: min(counts.get(a, 0), counts.get(b, 0)) * 5,
        ))

    # Set scoring: "8 pts per set of 3 different veggies"
    rules.append((
        "8 pts per set of 3 diff veggies",
        lambda counts: (sum(1 for v in VEGGIES if counts.get(v, 0) > 0) // 3) * 8,
    ))

    # Complete set: "12 pts if you have all 6 veggies"
    rules.append((
        "12 pts if you have all 6 veggies",
        lambda counts: 12 if all(counts.get(v, 0) > 0 for v in VEGGIES) else 0,
    ))

    # Most/fewest: "7 pts if most Veggie, -3 if fewest" (2-player simplified)
    for v in VEGGIES:
        rules.append((
            f"7 pts if most {v}",
            lambda counts, veg=v: 7 if counts.get(veg, 0) >= 3 else 0,
        ))

    # Threshold: "5 pts if 3+ Veggie"
    for v in VEGGIES:
        for threshold, pts in [(2, 4), (3, 6), (4, 8)]:
            rules.append((
                f"{pts} pts if {threshold}+ {v}",
                lambda counts, veg=v, t=threshold, p=pts: p if counts.get(veg, 0) >= t else 0,
            ))

    # Penalty: "+3 per Veggie1, -2 per Veggie2"
    combos = [
        ("Tomato", "Cabbage"), ("Lettuce", "Pepper"),
        ("Carrot", "Onion"),
    ]
    for v1, v2 in combos:
        rules.append((
            f"+3/{v1}, -2/{v2}",
            lambda counts, a=v1, b=v2: counts.get(a, 0) * 3 - counts.get(b, 0) * 2,
        ))

    # Even/odd bonuses
    for v in VEGGIES[:3]:
        rules.append((
            f"5 pts if even # of {v} (0 counts)",
            lambda counts, veg=v: 5 if counts.get(veg, 0) % 2 == 0 else 0,
        ))

    random.shuffle(rules)
    return rules


def _build_decks(variation):
    """Build 3 draw piles of scoring cards with veggie backs, plus veggie market."""
    rules = _generate_scoring_rules()
    cards_per_pile = 12 if variation == "standard" else 8

    piles = [[], [], []]
    veggie_idx = 0
    for i, (rule_text, score_func) in enumerate(rules):
        if i >= cards_per_pile * 3:
            break
        pile_idx = i % 3
        back_veggie = VEGGIES[veggie_idx % len(VEGGIES)]
        veggie_idx += 1
        piles[pile_idx].append(_make_scoring_card(rule_text, score_func, back_veggie))

    for pile in piles:
        random.shuffle(pile)

    return piles


class PointSalad(BaseGame):
    """Point Salad - A card-drafting vegetable and scoring game."""

    name = "Point Salad"
    description = (
        "A card-drafting game where every card is dual-use: one side is a "
        "vegetable, the other a scoring rule. Draft wisely to maximize points!"
    )
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - full 36-card market, play to exhaustion",
        "quick": "Quick game - smaller 24-card market for faster play",
    }

    def setup(self):
        # Build 3 scoring piles
        self.scoring_piles = _build_decks(self.variation)

        # Veggie market: 2 cards per pile (6 total), flipped from scoring piles
        self.veggie_market = [None, None, None, None, None, None]
        # Market layout: columns 0,1,2 correspond to piles 0,1,2
        # Row 0 (indices 0,1,2) and Row 1 (indices 3,4,5)
        self._refill_market()

        # Player hands: scoring cards and veggie counts
        self.player_scoring = [None, [], []]
        self.player_veggies = [None, {v: 0 for v in VEGGIES}, {v: 0 for v in VEGGIES}]

        self.round_number = 0
        self.consecutive_empty = 0

    def _refill_market(self):
        """Fill empty market slots by flipping cards from scoring piles."""
        for col in range(3):
            for row in range(2):
                idx = row * 3 + col
                if self.veggie_market[idx] is None and self.scoring_piles[col]:
                    card = self.scoring_piles[col].pop()
                    # Flip to veggie side
                    self.veggie_market[idx] = _make_veggie_card(card["veggie_back"])

    def _market_empty(self):
        """Check if all piles and market slots are empty."""
        all_piles_empty = all(len(p) == 0 for p in self.scoring_piles)
        all_market_empty = all(v is None for v in self.veggie_market)
        return all_piles_empty and all_market_empty

    def _scoring_card_to_serializable(self, card):
        """Convert scoring card for serialization (strip lambda)."""
        return {
            "type": "scoring",
            "rule": card["rule"],
            "veggie_back": card.get("veggie_back", ""),
        }

    def display(self):
        p = self.current_player
        opp = 2 if p == 1 else 1

        print("=" * 60)
        print(f"  POINT SALAD  -  Round {self.round_number + 1}")
        print("=" * 60)

        # Scoring piles (top cards visible)
        print("\n  SCORING PILES (take 1 scoring card):")
        for i in range(3):
            if self.scoring_piles[i]:
                top = self.scoring_piles[i][-1]
                print(f"    Pile {i + 1} ({len(self.scoring_piles[i])} cards): "
                      f"{top['rule']}")
            else:
                print(f"    Pile {i + 1}: (empty)")

        # Veggie market
        print("\n  VEGGIE MARKET (take up to 2 veggies):")
        print("    ", end="")
        for col in range(3):
            slot = self.veggie_market[col]
            if slot:
                print(f"  [{col + 1}] {VEGGIE_ICONS[slot['veggie']]:8s}", end="")
            else:
                print(f"  [{col + 1}] {'---':8s}", end="")
        print()
        print("    ", end="")
        for col in range(3):
            idx = 3 + col
            slot = self.veggie_market[idx]
            if slot:
                print(f"  [{col + 4}] {VEGGIE_ICONS[slot['veggie']]:8s}", end="")
            else:
                print(f"  [{col + 4}] {'---':8s}", end="")
        print()

        # Opponent info
        print(f"\n  {'─' * 50}")
        print(f"  {self.players[opp - 1]}:")
        opp_vegs = ", ".join(
            f"{v}:{self.player_veggies[opp][v]}"
            for v in VEGGIES if self.player_veggies[opp][v] > 0
        )
        print(f"    Veggies: {opp_vegs if opp_vegs else '(none)'}")
        print(f"    Scoring cards: {len(self.player_scoring[opp])}")

        # Current player info
        print(f"\n  {'─' * 50}")
        print(f"  {self.players[p - 1]} (YOU):")
        p_vegs = ", ".join(
            f"{v}:{self.player_veggies[p][v]}"
            for v in VEGGIES if self.player_veggies[p][v] > 0
        )
        print(f"    Veggies: {p_vegs if p_vegs else '(none)'}")
        if self.player_scoring[p]:
            print("    Scoring rules:")
            for i, sc in enumerate(self.player_scoring[p]):
                pts = sc["score_func"](self.player_veggies[p])
                print(f"      {i + 1}. {sc['rule']}  (currently: {pts} pts)")
        else:
            print("    Scoring rules: (none)")
        total = self._calc_score(p)
        print(f"    Current total: {total} pts")
        print(f"  {'─' * 50}")

    def _calc_score(self, player):
        total = 0
        for sc in self.player_scoring[player]:
            total += sc["score_func"](self.player_veggies[player])
        return total

    def get_move(self):
        print("\n  Actions:")
        print("    score <pile#>      - Take top scoring card (e.g., 'score 1')")
        print("    veggie <#> <#>     - Take 1 or 2 veggies (e.g., 'veggie 1 4')")
        print("    flip <#>           - Flip your scoring card to veggie side")

        move = input_with_quit("\n  Your action: ").strip().lower()
        return move

    def make_move(self, move):
        p = self.current_player
        parts = move.split()
        if not parts:
            return False

        action = parts[0]

        if action == "score":
            if len(parts) < 2:
                return False
            try:
                pile = int(parts[1]) - 1
            except ValueError:
                return False
            if pile < 0 or pile > 2:
                return False
            if not self.scoring_piles[pile]:
                print("  That pile is empty!")
                return False
            card = self.scoring_piles[pile].pop()
            self.player_scoring[p].append(card)
            self._refill_market()
            self.round_number += 1
            self.consecutive_empty = 0
            return True

        elif action == "veggie":
            if len(parts) < 2:
                return False
            indices = []
            for arg in parts[1:]:
                try:
                    idx = int(arg) - 1
                except ValueError:
                    return False
                if idx < 0 or idx > 5:
                    return False
                indices.append(idx)

            if len(indices) > 2:
                print("  Can take at most 2 veggies!")
                return False

            # Validate all chosen slots have cards
            for idx in indices:
                if self.veggie_market[idx] is None:
                    print(f"  Slot {idx + 1} is empty!")
                    return False

            # Check for duplicates
            if len(indices) != len(set(indices)):
                print("  Can't take the same slot twice!")
                return False

            # Take the veggies
            for idx in indices:
                veggie = self.veggie_market[idx]["veggie"]
                self.player_veggies[p][veggie] += 1
                self.veggie_market[idx] = None

            self._refill_market()
            self.round_number += 1
            self.consecutive_empty = 0
            return True

        elif action == "flip":
            if len(parts) < 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.player_scoring[p]):
                return False
            card = self.player_scoring[p].pop(idx)
            veggie = card["veggie_back"]
            self.player_veggies[p][veggie] += 1
            print(f"  Flipped scoring card to {veggie}!")
            input("  Press Enter to continue...")
            # Flipping doesn't count as main action; player still takes a turn
            # Actually in Point Salad, flipping is a free action - let them continue
            # But for simplicity in our game loop, treat it as a turn action
            self.round_number += 1
            return True

        return False

    def check_game_over(self):
        if self._market_empty():
            self.game_over = True
            s1 = self._calc_score(1)
            s2 = self._calc_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None  # tie
            self.final_scores = [0, s1, s2]
            return

    def get_state(self):
        # Serialize scoring cards (rule text only, funcs rebuilt on load)
        def serialize_pile(pile):
            return [{"rule": c["rule"], "veggie_back": c["veggie_back"]} for c in pile]

        def serialize_player_scoring(cards):
            if cards is None:
                return None
            return [{"rule": c["rule"], "veggie_back": c.get("veggie_back", "")}
                    for c in cards]

        return {
            "scoring_piles": [serialize_pile(p) for p in self.scoring_piles],
            "veggie_market": self.veggie_market,
            "player_scoring": [
                serialize_player_scoring(self.player_scoring[i]) for i in range(3)
            ],
            "player_veggies": self.player_veggies,
            "round_number": self.round_number,
            "consecutive_empty": self.consecutive_empty,
        }

    def load_state(self, state):
        # Rebuild scoring rules to re-attach lambdas
        all_rules = _generate_scoring_rules()
        rule_map = {text: func for text, func in all_rules}

        def rebuild_pile(serialized):
            pile = []
            for item in serialized:
                rule_text = item["rule"]
                func = rule_map.get(rule_text, lambda counts: 0)
                pile.append(_make_scoring_card(rule_text, func, item["veggie_back"]))
            return pile

        def rebuild_player_scoring(serialized):
            if serialized is None:
                return None
            cards = []
            for item in serialized:
                rule_text = item["rule"]
                func = rule_map.get(rule_text, lambda counts: 0)
                cards.append(_make_scoring_card(rule_text, func,
                                                item.get("veggie_back", "")))
            return cards

        self.scoring_piles = [rebuild_pile(p) for p in state["scoring_piles"]]
        self.veggie_market = state["veggie_market"]
        self.player_scoring = [
            rebuild_player_scoring(state["player_scoring"][i]) for i in range(3)
        ]
        self.player_veggies = state["player_veggies"]
        self.round_number = state["round_number"]
        self.consecutive_empty = state["consecutive_empty"]

    def get_tutorial(self):
        return """
============================================================
  POINT SALAD - Tutorial
============================================================

  Point Salad is a card-drafting game where every card
  has two sides: a VEGETABLE and a SCORING RULE.

  OBJECTIVE:
    Score the most points by collecting vegetables that
    match your scoring rules.

  SETUP:
    - 3 scoring piles with face-up top cards visible
    - 6 veggie market slots (2 rows x 3 columns)
    - Veggies are flipped from the scoring piles

  ON YOUR TURN, choose ONE:
    1. Take 1 SCORING card from top of any pile
       - This gives you a rule that scores points based
         on your vegetable collection
    2. Take 1 or 2 VEGGIE cards from the market
       - These are the vegetables you collect

  SPECIAL ACTION (any turn):
    - Flip one of your scoring cards to its veggie side
      (permanent - you lose the rule but gain the veggie)

  SCORING EXAMPLES:
    "3 pts per Tomato"         - Simple per-veggie scoring
    "5 pts per Tomato/Lettuce pair" - Need both to score
    "12 pts if all 6 veggies"  - Collection bonus
    "+3/Carrot, -2/Onion"      - Mixed positive/negative

  STRATEGY TIPS:
    - Balance scoring cards with vegetables to feed them
    - Watch what your opponent is collecting
    - Sometimes flipping a weak scoring card for its
      veggie is better than keeping the rule
    - Diverse strategies can all work!

  COMMANDS:
    score <#>        - Take scoring card from pile 1-3
    veggie <#> <#>   - Take 1 or 2 veggies from slots 1-6
    flip <#>         - Flip your scoring card to veggie
============================================================
"""
