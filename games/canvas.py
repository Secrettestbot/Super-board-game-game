"""Canvas - Layered transparent card art scoring game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Icons that can appear on art cards
ICONS = ["Shape", "Hue", "Texture", "Tone", "Composition"]

# Scoring conditions that check icon patterns on paintings
SCORING_CONDITIONS = [
    {"name": "Variety", "desc": "3 pts per painting with 3+ different icons", "id": "variety"},
    {"name": "Repetition", "desc": "2 pts per pair of matching icons on a painting", "id": "repetition"},
    {"name": "Composition Focus", "desc": "4 pts per painting with 2+ Composition icons", "id": "comp_focus"},
    {"name": "Hue Harmony", "desc": "3 pts per painting with 2+ Hue icons", "id": "hue_harmony"},
    {"name": "Shape Mastery", "desc": "5 pts if all paintings have at least 1 Shape icon", "id": "shape_mastery"},
    {"name": "Texture Blend", "desc": "2 pts per Texture icon across all paintings", "id": "texture_blend"},
    {"name": "Tone Balance", "desc": "3 pts per painting with exactly 1 Tone icon", "id": "tone_balance"},
    {"name": "Minimalism", "desc": "4 pts per painting with exactly 3 icons total", "id": "minimalism"},
    {"name": "Maximalism", "desc": "3 pts per painting with 5+ icons total", "id": "maximalism"},
    {"name": "Rainbow", "desc": "8 pts if you have all 5 icon types across paintings", "id": "rainbow"},
    {"name": "Monochrome", "desc": "4 pts per painting where all icons are the same", "id": "monochrome"},
    {"name": "Duality", "desc": "3 pts per painting with exactly 2 different icons", "id": "duality"},
]


def generate_art_card():
    """Generate a random art card with 1-3 icons."""
    num_icons = random.choice([1, 1, 2, 2, 2, 3])
    icons = [random.choice(ICONS) for _ in range(num_icons)]
    name_parts = ["Crimson", "Azure", "Golden", "Emerald", "Violet", "Silver",
                  "Amber", "Cobalt", "Ivory", "Onyx", "Coral", "Jade"]
    name_suffixes = ["Wash", "Stroke", "Layer", "Glaze", "Tint", "Shade",
                     "Filter", "Overlay", "Accent", "Base", "Veil", "Mist"]
    name = f"{random.choice(name_parts)} {random.choice(name_suffixes)}"
    return {"name": name, "icons": icons}


def score_painting(painting_icons, conditions):
    """Score a single painting's icons against conditions. Returns points per condition."""
    results = {}
    for cond in conditions:
        cid = cond["id"]
        pts = 0
        icon_counts = {}
        for icon in painting_icons:
            icon_counts[icon] = icon_counts.get(icon, 0) + 1
        unique = len(icon_counts)
        total = len(painting_icons)

        if cid == "variety":
            pts = 3 if unique >= 3 else 0
        elif cid == "repetition":
            for count in icon_counts.values():
                pts += (count // 2) * 2
        elif cid == "comp_focus":
            pts = 4 if icon_counts.get("Composition", 0) >= 2 else 0
        elif cid == "hue_harmony":
            pts = 3 if icon_counts.get("Hue", 0) >= 2 else 0
        elif cid == "tone_balance":
            pts = 3 if icon_counts.get("Tone", 0) == 1 else 0
        elif cid == "minimalism":
            pts = 4 if total == 3 else 0
        elif cid == "maximalism":
            pts = 3 if total >= 5 else 0
        elif cid == "monochrome":
            pts = 4 if unique == 1 and total > 0 else 0
        elif cid == "duality":
            pts = 3 if unique == 2 else 0
        # These are handled at the full-paintings level
        elif cid in ("shape_mastery", "texture_blend", "rainbow"):
            pts = 0
        results[cid] = pts
    return results


def score_all_paintings(paintings, conditions):
    """Score all paintings for a player. Returns total and breakdown."""
    total = 0
    breakdown = []

    # Per-painting conditions
    for i, painting in enumerate(paintings):
        icons = []
        for card in painting:
            icons.extend(card["icons"])
        per_painting = score_painting(icons, conditions)
        for cid, pts in per_painting.items():
            if pts > 0:
                cond_name = next(c["name"] for c in conditions if c["id"] == cid)
                breakdown.append(f"  Painting {i + 1}: {cond_name} = {pts} pts")
                total += pts

    # Cross-painting conditions
    all_icons = []
    for painting in paintings:
        for card in painting:
            all_icons.extend(card["icons"])

    for cond in conditions:
        cid = cond["id"]
        if cid == "shape_mastery":
            all_have_shape = all(
                any(icon == "Shape" for card in painting for icon in card["icons"])
                for painting in paintings
            )
            if all_have_shape and len(paintings) > 0:
                total += 5
                breakdown.append(f"  All paintings: Shape Mastery = 5 pts")
        elif cid == "texture_blend":
            tex_count = sum(1 for icon in all_icons if icon == "Texture")
            pts = tex_count * 2
            if pts > 0:
                total += pts
                breakdown.append(f"  All paintings: Texture Blend ({tex_count} Textures) = {pts} pts")
        elif cid == "rainbow":
            unique_all = len(set(all_icons))
            if unique_all >= 5:
                total += 8
                breakdown.append(f"  All paintings: Rainbow = 8 pts")

    return total, breakdown


class CanvasGame(BaseGame):
    """Canvas: Layer transparent art cards to create scored paintings."""

    name = "Canvas"
    description = "Layer transparent art cards to create paintings scored by icon patterns"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full market (5 cards visible), create 3 paintings",
        "quick": "Smaller market (3 cards visible), create 2 paintings",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.market = []
        self.deck = []
        self.scoring_conditions = []
        self.hands = [[], []]  # cards in hand per player (0-indexed)
        self.paintings = [[], []]  # completed paintings per player
        self.tokens = [0, 0]  # inspiration tokens per player
        self.paintings_needed = 3
        self.market_size = 5
        self.phase = "collect"  # "collect" or "paint"
        self.action_done = False

    def setup(self):
        if self.variation == "quick":
            self.paintings_needed = 2
            self.market_size = 3
            deck_size = 24
        else:
            self.paintings_needed = 3
            self.market_size = 5
            deck_size = 40

        # Generate deck
        self.deck = [generate_art_card() for _ in range(deck_size)]
        random.shuffle(self.deck)

        # Fill market
        self.market = []
        for _ in range(self.market_size):
            if self.deck:
                self.market.append(self.deck.pop())

        # Pick 3 scoring conditions
        chosen = random.sample(SCORING_CONDITIONS, 3)
        self.scoring_conditions = [{"name": c["name"], "desc": c["desc"], "id": c["id"]} for c in chosen]

        # Starting tokens and cards
        self.tokens = [4, 4]
        self.hands = [[], []]
        for p in range(2):
            for _ in range(3):
                if self.deck:
                    self.hands[p].append(self.deck.pop())

        self.paintings = [[], []]
        self.phase = "collect"
        self.action_done = False

    def display(self):
        clear_screen()
        p = self.current_player - 1
        print(f"{'=' * 60}")
        print(f"  CANVAS - Turn {self.turn_number + 1}")
        print(f"{'=' * 60}")

        # Scoring conditions
        print("\n  Scoring Conditions:")
        for i, cond in enumerate(self.scoring_conditions):
            print(f"    {i + 1}. {cond['name']}: {cond['desc']}")

        # Both players' status
        for pi in range(2):
            marker = " <--" if pi == p else ""
            print(f"\n  {self.players[pi]}: {self.tokens[pi]} tokens, "
                  f"{len(self.hands[pi])} cards, "
                  f"{len(self.paintings[pi])}/{self.paintings_needed} paintings{marker}")
            if self.paintings[pi]:
                for j, painting in enumerate(self.paintings[pi]):
                    icons = []
                    for card in painting:
                        icons.extend(card["icons"])
                    print(f"    Painting {j + 1}: [{', '.join(icons)}]")

        # Market
        print(f"\n  Market (take from left=free, right=costs tokens):")
        print(f"  ", end="")
        for i, card in enumerate(self.market):
            cost = i  # first card is free, second costs 1, etc.
            icon_str = "+".join(card["icons"])
            cost_str = f"(free)" if cost == 0 else f"(cost {cost})"
            print(f"  [{i + 1}] {card['name']} ({icon_str}) {cost_str}", end="")
        print()

        # Current player's hand
        if pi == p or True:
            print(f"\n  Your hand ({self.players[p]}):")
            if self.hands[p]:
                for i, card in enumerate(self.hands[p]):
                    icon_str = ", ".join(card["icons"])
                    print(f"    [{i + 1}] {card['name']} - Icons: {icon_str}")
            else:
                print(f"    (empty)")

        print(f"\n{'=' * 60}")

    def get_move(self):
        p = self.current_player - 1

        # Check if player can/must paint
        can_paint = len(self.hands[p]) >= 3
        must_paint = len(self.hands[p]) >= 5
        needs_paintings = len(self.paintings[p]) < self.paintings_needed

        if must_paint and needs_paintings:
            print("  You have 5+ cards - you MUST create a painting!")
            print("  Select 3 cards to layer (e.g., '1 2 3'):")
            move = input_with_quit("  > ")
            return ("paint", move.strip())

        options = []
        if needs_paintings and not must_paint:
            options.append("(t)ake a card from market")
        if can_paint and needs_paintings:
            options.append("(p)aint - layer 3 cards into a painting")
        if not needs_paintings:
            print("  You've completed all paintings! Press Enter to pass.")
            input_with_quit("  > ")
            return ("pass", "")

        print(f"  Actions: {', '.join(options)}")
        action = input_with_quit("  Choose action: ").strip().lower()

        if action in ("t", "take"):
            print(f"  Pick a card from market (1-{len(self.market)}):")
            idx = input_with_quit("  > ")
            return ("take", idx.strip())
        elif action in ("p", "paint"):
            print("  Select 3 cards to layer (e.g., '1 2 3'):")
            cards = input_with_quit("  > ")
            return ("paint", cards.strip())
        else:
            return ("invalid", "")

    def make_move(self, move):
        action, data = move
        p = self.current_player - 1

        if action == "pass":
            return True

        if action == "take":
            try:
                idx = int(data) - 1
                if idx < 0 or idx >= len(self.market):
                    return False
            except (ValueError, TypeError):
                return False

            cost = idx  # position 0 is free, position 1 costs 1, etc.
            if self.tokens[p] < cost:
                print(f"  Not enough tokens! Need {cost}, have {self.tokens[p]}")
                input("  Press Enter...")
                return False

            # Pay cost - tokens go to cards being skipped
            self.tokens[p] -= cost

            # Take the card
            card = self.market.pop(idx)
            self.hands[p].append(card)

            # Refill market
            if self.deck:
                self.market.append(self.deck.pop())

            return True

        if action == "paint":
            try:
                indices = [int(x) - 1 for x in data.split()]
                if len(indices) != 3:
                    print("  Must select exactly 3 cards!")
                    input("  Press Enter...")
                    return False
                if len(set(indices)) != 3:
                    print("  Must select 3 different cards!")
                    input("  Press Enter...")
                    return False
                for idx in indices:
                    if idx < 0 or idx >= len(self.hands[p]):
                        return False
            except (ValueError, TypeError):
                return False

            # Create painting from selected cards
            painting = [self.hands[p][i] for i in sorted(indices)]
            # Remove cards from hand (reverse order to preserve indices)
            for idx in sorted(indices, reverse=True):
                self.hands[p].pop(idx)

            self.paintings[p].append(painting)

            # Show painting result
            icons = []
            for card in painting:
                icons.extend(card["icons"])
            print(f"\n  Created painting with icons: {', '.join(icons)}")
            input("  Press Enter to continue...")

            return True

        return False

    def check_game_over(self):
        # Game ends when both players have completed all paintings
        all_done = all(
            len(self.paintings[p]) >= self.paintings_needed
            for p in range(2)
        )
        if all_done:
            self.game_over = True
            # Score
            scores = []
            print(f"\n{'=' * 60}")
            print("  FINAL SCORING")
            print(f"{'=' * 60}")
            for pi in range(2):
                total, breakdown = score_all_paintings(
                    self.paintings[pi], self.scoring_conditions
                )
                scores.append(total)
                print(f"\n  {self.players[pi]}: {total} points")
                for line in breakdown:
                    print(line)

            if scores[0] > scores[1]:
                self.winner = 1
            elif scores[1] > scores[0]:
                self.winner = 2
            else:
                # Tiebreak: most remaining tokens
                if self.tokens[0] > self.tokens[1]:
                    self.winner = 1
                elif self.tokens[1] > self.tokens[0]:
                    self.winner = 2
                else:
                    self.winner = None
            input("\n  Press Enter to continue...")

    def get_state(self):
        return {
            "market": self.market,
            "deck": self.deck,
            "scoring_conditions": self.scoring_conditions,
            "hands": self.hands,
            "paintings": self.paintings,
            "tokens": self.tokens,
            "paintings_needed": self.paintings_needed,
            "market_size": self.market_size,
            "phase": self.phase,
            "action_done": self.action_done,
        }

    def load_state(self, state):
        self.market = state["market"]
        self.deck = state["deck"]
        self.scoring_conditions = state["scoring_conditions"]
        self.hands = state["hands"]
        self.paintings = state["paintings"]
        self.tokens = state["tokens"]
        self.paintings_needed = state["paintings_needed"]
        self.market_size = state["market_size"]
        self.phase = state["phase"]
        self.action_done = state["action_done"]

    def get_tutorial(self):
        return """
============================
  CANVAS - Tutorial
============================

OVERVIEW:
  You are an artist creating paintings by layering transparent art cards.
  Each card adds icons (Shape, Hue, Texture, Tone, Composition) to your painting.
  Score points based on 3 scoring conditions that match icon patterns.

HOW TO PLAY:
  1. TAKE a card from the market:
     - The leftmost card is FREE
     - Each position to the right costs 1 more token
     - You start with 4 tokens

  2. PAINT by layering exactly 3 cards:
     - All icons from the 3 cards combine on your painting
     - You must paint if you have 5+ cards in hand
     - Create the required number of paintings to finish

SCORING:
  Each game has 3 random scoring conditions.
  Your paintings are scored against all 3 conditions.
  Some conditions score per-painting, others across all paintings.
  Highest total score wins! Tiebreak: most remaining tokens.

COMMANDS:
  (t)ake - Take a card from the market
  (p)aint - Layer 3 cards into a painting
  Type 'help' for controls, 'quit' to exit
"""
