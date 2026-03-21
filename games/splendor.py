"""Splendor - A gem-trading engine-building game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Gem types: Diamond(W), Sapphire(U), Emerald(G), Ruby(R), Onyx(K), Gold(*)
GEM_NAMES = {
    "W": "Diamond",
    "U": "Sapphire",
    "G": "Emerald",
    "R": "Ruby",
    "K": "Onyx",
    "*": "Gold",
}
GEM_COLORS = ["W", "U", "G", "R", "K"]


def _make_card(tier, points, bonus, cost):
    """Create a card dict."""
    return {
        "tier": tier,
        "points": points,
        "bonus": bonus,
        "cost": dict(cost),
    }


def _generate_deck():
    """Generate simplified but varied card decks for 3 tiers."""
    random.seed()  # ensure randomness each game

    tier1 = [
        _make_card(1, 0, "W", {"U": 1, "K": 1}),
        _make_card(1, 0, "W", {"R": 2, "K": 1}),
        _make_card(1, 0, "U", {"W": 1, "G": 1}),
        _make_card(1, 0, "U", {"K": 2, "G": 1}),
        _make_card(1, 0, "G", {"R": 1, "U": 1}),
        _make_card(1, 0, "G", {"W": 2, "R": 1}),
        _make_card(1, 0, "R", {"W": 1, "K": 1}),
        _make_card(1, 0, "R", {"G": 2, "U": 1}),
        _make_card(1, 0, "K", {"G": 1, "R": 1}),
        _make_card(1, 1, "K", {"U": 2, "W": 2}),
    ]

    tier2 = [
        _make_card(2, 1, "W", {"G": 2, "R": 2, "K": 1}),
        _make_card(2, 1, "W", {"U": 3, "G": 2}),
        _make_card(2, 2, "U", {"U": 1, "G": 2, "R": 2, "K": 1}),
        _make_card(2, 1, "U", {"W": 2, "R": 3}),
        _make_card(2, 1, "G", {"W": 2, "U": 2, "K": 1}),
        _make_card(2, 2, "G", {"W": 3, "R": 2}),
        _make_card(2, 1, "R", {"W": 1, "U": 2, "K": 2}),
        _make_card(2, 2, "R", {"K": 3, "G": 2}),
        _make_card(2, 1, "K", {"G": 2, "R": 2, "W": 1}),
        _make_card(2, 2, "K", {"W": 2, "U": 2, "G": 1}),
    ]

    tier3 = [
        _make_card(3, 3, "W", {"U": 3, "G": 3, "K": 3}),
        _make_card(3, 4, "W", {"W": 3, "R": 3, "K": 3}),
        _make_card(3, 3, "U", {"W": 3, "G": 3, "R": 3}),
        _make_card(3, 4, "U", {"U": 3, "G": 3, "R": 3}),
        _make_card(3, 3, "G", {"W": 3, "U": 3, "K": 3}),
        _make_card(3, 5, "G", {"G": 3, "R": 5}),
        _make_card(3, 3, "R", {"W": 3, "U": 3, "R": 3}),
        _make_card(3, 4, "R", {"W": 3, "K": 3, "R": 3}),
        _make_card(3, 3, "K", {"R": 3, "K": 3, "G": 3}),
        _make_card(3, 5, "K", {"K": 3, "U": 5}),
    ]

    for deck in (tier1, tier2, tier3):
        random.shuffle(deck)

    return tier1, tier2, tier3


def _generate_nobles(count):
    """Generate noble tiles. Each requires bonuses from cards."""
    all_nobles = [
        {"points": 3, "requires": {"W": 3, "U": 3}},
        {"points": 3, "requires": {"U": 3, "G": 3}},
        {"points": 3, "requires": {"G": 3, "R": 3}},
        {"points": 3, "requires": {"R": 3, "K": 3}},
        {"points": 3, "requires": {"K": 3, "W": 3}},
        {"points": 3, "requires": {"W": 4, "K": 4}},
        {"points": 3, "requires": {"U": 4, "G": 4}},
    ]
    random.shuffle(all_nobles)
    return all_nobles[:count]


class SplendorGame(BaseGame):
    """Splendor: Collect gems, buy cards, attract nobles."""

    name = "Splendor"
    description = "A gem-trading engine-building game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Splendor (15 points)",
        "quick": "Quick Game (10 points)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.gems = {}          # available gem tokens on the table
        self.tier_decks = [[], [], []]   # draw piles per tier (0-indexed)
        self.tier_face_up = [[], [], []]  # face-up cards per tier
        self.nobles = []
        self.player_gems = [{}, {}]       # tokens each player holds
        self.player_cards = [[], []]      # purchased cards
        self.player_reserved = [[], []]   # reserved cards (max 3)
        self.player_points = [0, 0]
        self.target_points = 15
        self.final_round = False
        self.final_round_last_player = None

    def setup(self):
        """Initialize the game."""
        quick = self.variation == "quick"
        self.target_points = 10 if quick else 15

        # Token supply for 2 players: 4 of each gem, 5 gold
        for color in GEM_COLORS:
            self.gems[color] = 4
        self.gems["*"] = 5

        # Generate decks
        t1, t2, t3 = _generate_deck()
        if quick:
            t1, t2, t3 = t1[:6], t2[:6], t3[:6]

        self.tier_decks = [t1, t2, t3]
        self.tier_face_up = [[], [], []]
        for tier_idx in range(3):
            for _ in range(4):
                if self.tier_decks[tier_idx]:
                    self.tier_face_up[tier_idx].append(
                        self.tier_decks[tier_idx].pop()
                    )

        noble_count = 2 if quick else 3
        self.nobles = _generate_nobles(noble_count)

        for i in range(2):
            self.player_gems[i] = {c: 0 for c in GEM_COLORS + ["*"]}
            self.player_cards[i] = []
            self.player_reserved[i] = []
            self.player_points[i] = 0

    # ------------------------------------------------------------------ display
    def _gem_str(self, gems_dict, skip_zero=False):
        """Format a gem dict as a compact string."""
        parts = []
        for c in GEM_COLORS + ["*"]:
            v = gems_dict.get(c, 0)
            if skip_zero and v == 0:
                continue
            parts.append(f"{c}:{v}")
        return " ".join(parts)

    def _cost_str(self, cost):
        parts = []
        for c in GEM_COLORS:
            v = cost.get(c, 0)
            if v > 0:
                parts.append(f"{c}:{v}")
        return " ".join(parts) if parts else "free"

    def _bonuses(self, player_idx):
        """Count permanent gem bonuses from purchased cards."""
        bonuses = {c: 0 for c in GEM_COLORS}
        for card in self.player_cards[player_idx]:
            bonuses[card["bonus"]] = bonuses.get(card["bonus"], 0) + 1
        return bonuses

    def _total_tokens(self, player_idx):
        return sum(self.player_gems[player_idx].values())

    def display(self):
        """Display the full game state."""
        mode = "Standard" if self.variation == "standard" else "Quick"
        print(f"\n  === Splendor ({mode}, target {self.target_points} pts) ===")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Available gems
        print(f"  Gem supply: {self._gem_str(self.gems)}")
        print()

        # Nobles
        print("  Nobles:")
        if not self.nobles:
            print("    (none remaining)")
        for i, noble in enumerate(self.nobles):
            req = " ".join(f"{c}:{v}" for c, v in noble["requires"].items())
            print(f"    [{i + 1}] {noble['points']}pts - requires {req}")
        print()

        # Face-up cards per tier (display tier 3 on top)
        for tier_idx in [2, 1, 0]:
            remaining = len(self.tier_decks[tier_idx])
            print(f"  Tier {tier_idx + 1} (deck: {remaining}):")
            if not self.tier_face_up[tier_idx]:
                print("    (empty)")
            for pos, card in enumerate(self.tier_face_up[tier_idx]):
                pts = f"{card['points']}pt" if card["points"] else "  "
                print(
                    f"    [{pos + 1}] {pts} +{card['bonus']}  cost: {self._cost_str(card['cost'])}"
                )
        print()

        # Player info
        for pi in range(2):
            marker = " <<" if pi == self.current_player - 1 else ""
            bonuses = self._bonuses(pi)
            bonus_str = " ".join(f"{c}:{v}" for c, v in bonuses.items() if v)
            if not bonus_str:
                bonus_str = "(none)"
            res_count = len(self.player_reserved[pi])
            print(
                f"  {self.players[pi]}: {self.player_points[pi]} pts | "
                f"tokens({self._total_tokens(pi)}): {self._gem_str(self.player_gems[pi])} | "
                f"bonuses: {bonus_str} | reserved: {res_count}{marker}"
            )
        print()

    # ------------------------------------------------------------------ input
    def get_move(self):
        """Get move from current player."""
        pi = self.current_player - 1
        print(f"  {self.players[pi]}, choose an action:")
        print('    gems W U G       - take 3 different gems')
        print('    gems R R         - take 2 same gems (needs 4+ in supply)')
        print('    reserve T P      - reserve card (tier T, pos P) + 1 gold')
        print('    buy T P          - buy face-up card (tier T, pos P)')
        print('    buy reserved P   - buy a reserved card (pos P)')
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    # ------------------------------------------------------------------ logic
    def _can_afford(self, player_idx, cost):
        """Check if player can afford a card cost (bonuses + tokens + gold)."""
        bonuses = self._bonuses(player_idx)
        gold_needed = 0
        for c in GEM_COLORS:
            need = cost.get(c, 0)
            have = bonuses.get(c, 0) + self.player_gems[player_idx].get(c, 0)
            if have < need:
                gold_needed += need - have
        return gold_needed <= self.player_gems[player_idx].get("*", 0)

    def _pay_for_card(self, player_idx, cost):
        """Deduct gems for card purchase, using gold as needed."""
        bonuses = self._bonuses(player_idx)
        gold_used = 0
        for c in GEM_COLORS:
            need = cost.get(c, 0)
            bonus_cover = min(bonuses.get(c, 0), need)
            need -= bonus_cover
            token_cover = min(self.player_gems[player_idx].get(c, 0), need)
            self.player_gems[player_idx][c] -= token_cover
            self.gems[c] += token_cover
            need -= token_cover
            if need > 0:
                gold_used += need
        self.player_gems[player_idx]["*"] -= gold_used
        self.gems["*"] += gold_used

    def _check_nobles(self, player_idx):
        """Auto-visit nobles if player qualifies."""
        bonuses = self._bonuses(player_idx)
        for noble in list(self.nobles):
            qualified = True
            for c, v in noble["requires"].items():
                if bonuses.get(c, 0) < v:
                    qualified = False
                    break
            if qualified:
                self.player_points[player_idx] += noble["points"]
                self.nobles.remove(noble)
                return noble
        return None

    def _refill_face_up(self, tier_idx):
        """Refill the face-up row for a tier from its deck."""
        while len(self.tier_face_up[tier_idx]) < 4 and self.tier_decks[tier_idx]:
            self.tier_face_up[tier_idx].append(self.tier_decks[tier_idx].pop())

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        pi = self.current_player - 1
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        # --- Take gems ---
        if action == "gems":
            colors = [p.upper() for p in parts[1:]]
            if not colors:
                return False

            # Take 2 same
            if len(colors) == 2 and colors[0] == colors[1]:
                c = colors[0]
                if c not in GEM_COLORS:
                    return False
                if self.gems.get(c, 0) < 4:
                    print(f"  Need 4+ {GEM_NAMES.get(c, c)} in supply to take 2.")
                    return False
                if self._total_tokens(pi) + 2 > 10:
                    print("  Would exceed 10 token limit.")
                    return False
                self.gems[c] -= 2
                self.player_gems[pi][c] += 2
                return True

            # Take 3 different
            if len(colors) == 3:
                if len(set(colors)) != 3:
                    print("  Must pick 3 different gem types.")
                    return False
                for c in colors:
                    if c not in GEM_COLORS:
                        print(f"  Invalid gem type: {c}")
                        return False
                    if self.gems.get(c, 0) < 1:
                        print(f"  No {GEM_NAMES.get(c, c)} available.")
                        return False
                if self._total_tokens(pi) + 3 > 10:
                    print("  Would exceed 10 token limit.")
                    return False
                for c in colors:
                    self.gems[c] -= 1
                    self.player_gems[pi][c] += 1
                return True

            print("  Take 2 same or 3 different gems.")
            return False

        # --- Reserve ---
        if action == "reserve":
            if len(self.player_reserved[pi]) >= 3:
                print("  Already have 3 reserved cards.")
                return False
            if len(parts) != 3:
                return False
            try:
                tier = int(parts[1])
                pos = int(parts[2])
            except ValueError:
                return False
            if tier < 1 or tier > 3:
                return False
            tier_idx = tier - 1
            pos_idx = pos - 1
            if pos_idx < 0 or pos_idx >= len(self.tier_face_up[tier_idx]):
                return False

            card = self.tier_face_up[tier_idx].pop(pos_idx)
            self.player_reserved[pi].append(card)
            self._refill_face_up(tier_idx)

            # Gain 1 gold if available and under token limit
            if self.gems.get("*", 0) > 0 and self._total_tokens(pi) < 10:
                self.gems["*"] -= 1
                self.player_gems[pi]["*"] += 1
            return True

        # --- Buy ---
        if action == "buy":
            if len(parts) < 2:
                return False

            # Buy reserved card
            if parts[1] == "reserved":
                if len(parts) != 3:
                    return False
                try:
                    pos = int(parts[2])
                except ValueError:
                    return False
                pos_idx = pos - 1
                if pos_idx < 0 or pos_idx >= len(self.player_reserved[pi]):
                    print("  Invalid reserved card position.")
                    return False
                card = self.player_reserved[pi][pos_idx]
                if not self._can_afford(pi, card["cost"]):
                    print("  Cannot afford this card.")
                    return False
                self._pay_for_card(pi, card["cost"])
                self.player_reserved[pi].pop(pos_idx)
                self.player_cards[pi].append(card)
                self.player_points[pi] += card["points"]
                self._check_nobles(pi)
                return True

            # Buy face-up card
            if len(parts) != 3:
                return False
            try:
                tier = int(parts[1])
                pos = int(parts[2])
            except ValueError:
                return False
            if tier < 1 or tier > 3:
                return False
            tier_idx = tier - 1
            pos_idx = pos - 1
            if pos_idx < 0 or pos_idx >= len(self.tier_face_up[tier_idx]):
                print("  Invalid card position.")
                return False
            card = self.tier_face_up[tier_idx][pos_idx]
            if not self._can_afford(pi, card["cost"]):
                print("  Cannot afford this card.")
                return False
            self._pay_for_card(pi, card["cost"])
            self.tier_face_up[tier_idx].pop(pos_idx)
            self.player_cards[pi].append(card)
            self.player_points[pi] += card["points"]
            self._refill_face_up(tier_idx)
            self._check_nobles(pi)
            return True

        return False

    # ----------------------------------------------------------- game over
    def check_game_over(self):
        """Check if game end is triggered."""
        pi = self.current_player - 1

        # First player to reach target triggers final round
        if not self.final_round and self.player_points[pi] >= self.target_points:
            self.final_round = True
            self.final_round_last_player = pi

        # In final round, end after all players have had equal turns
        # (the round finishes when player 2 completes their turn)
        if self.final_round and self.current_player == 2:
            self.game_over = True
            # Highest score wins; ties broken by fewest cards
            p1, p2 = self.player_points[0], self.player_points[1]
            if p1 > p2:
                self.winner = 1
            elif p2 > p1:
                self.winner = 2
            else:
                # Fewer purchased cards wins the tie
                c1, c2 = len(self.player_cards[0]), len(self.player_cards[1])
                if c1 < c2:
                    self.winner = 1
                elif c2 < c1:
                    self.winner = 2
                else:
                    self.winner = None  # draw

    # ----------------------------------------------------------- save/load
    def get_state(self):
        """Return serializable game state."""
        return {
            "gems": dict(self.gems),
            "tier_decks": [list(d) for d in self.tier_decks],
            "tier_face_up": [list(f) for f in self.tier_face_up],
            "nobles": list(self.nobles),
            "player_gems": [dict(g) for g in self.player_gems],
            "player_cards": [list(c) for c in self.player_cards],
            "player_reserved": [list(r) for r in self.player_reserved],
            "player_points": list(self.player_points),
            "target_points": self.target_points,
            "final_round": self.final_round,
            "final_round_last_player": self.final_round_last_player,
        }

    def load_state(self, state):
        """Restore game state."""
        self.gems = dict(state["gems"])
        self.tier_decks = [list(d) for d in state["tier_decks"]]
        self.tier_face_up = [list(f) for f in state["tier_face_up"]]
        self.nobles = list(state["nobles"])
        self.player_gems = [dict(g) for g in state["player_gems"]]
        self.player_cards = [list(c) for c in state["player_cards"]]
        self.player_reserved = [list(r) for r in state["player_reserved"]]
        self.player_points = list(state["player_points"])
        self.target_points = state["target_points"]
        self.final_round = state["final_round"]
        self.final_round_last_player = state["final_round_last_player"]

    # ----------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Splendor - Tutorial
==================================================

  OVERVIEW:
  Splendor is a gem-trading engine-building game.
  Collect gem tokens, buy development cards, and
  attract noble patrons to earn prestige points.
  First to reach the target score triggers the
  final round; highest score wins.

  GEM TYPES:
  W = Diamond, U = Sapphire, G = Emerald,
  R = Ruby, K = Onyx, * = Gold (wild)

  ON YOUR TURN, choose ONE action:

  1. TAKE 3 DIFFERENT GEMS
     - Pick 3 tokens of different colors.
     - Each must have at least 1 in the supply.
     - Command: gems W U G

  2. TAKE 2 SAME GEMS
     - Pick 2 tokens of the same color.
     - Only allowed if 4+ of that color remain.
     - Command: gems R R

  3. RESERVE A CARD
     - Take a face-up card into your hand
       (max 3 reserved cards).
     - You also receive 1 gold token (if any).
     - Command: reserve 1 2  (tier 1, position 2)

  4. BUY A CARD
     - Pay the gem cost to purchase a card.
     - Your card bonuses count as permanent gems.
     - Gold tokens are wild for any color.
     - Command: buy 2 3      (tier 2, position 3)
     - Command: buy reserved 1  (1st reserved card)

  TOKEN LIMIT: Max 10 tokens per player.

  NOBLES: Nobles auto-visit you (3 prestige pts)
  when you have enough card bonuses matching
  their requirements. No action needed.

  WINNING:
  - Standard: first to 15 points triggers the
    final round (both players finish the round).
  - Quick: 10 points to trigger.
  - Highest score wins. Ties broken by fewer
    purchased development cards.

  STRATEGY HINTS:
  - Focus on one or two gem colors early to
    build an efficient engine.
  - Cards that give bonuses reduce future costs.
  - Keep an eye on noble requirements - they are
    worth 3 free points.
  - Reserving can deny opponents key cards and
    gives you flexible gold tokens.
  - Higher-tier cards are expensive but give
    more prestige points.

==================================================
"""
