"""Mandala - 2-player card game with shared fields.

6 colors of cards. Two mandala areas, each with a shared "mountain" and two
personal "fields." Play cards to mountains or fields; when a mandala has all
6 colors, resolve it. Cards go to a personal "cup" track determining point values.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

COLORS = ["Red", "Orange", "Yellow", "Green", "Blue", "Purple"]
COLOR_ABBREV = {"Red": "R", "Orange": "O", "Yellow": "Y",
                "Green": "G", "Blue": "B", "Purple": "P"}
ABBREV_TO_COLOR = {v: k for k, v in COLOR_ABBREV.items()}


def _build_deck(size):
    """Build a deck of colored cards."""
    cards_per_color = size // len(COLORS)
    deck = []
    for color in COLORS:
        deck.extend([color] * cards_per_color)
    random.shuffle(deck)
    return deck


class MandalaGame(BaseGame):
    """Mandala - 2-player card game with shared fields and cup scoring."""

    name = "Mandala"
    description = "2-player card game with shared mandalas and strategic color valuation"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (54-card deck, 9 per color)",
        "quick": "Quick game (36-card deck, 6 per color)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.deck_size = 36
        else:
            self.deck_size = 54
        self.deck = []
        self.hands = {}  # player -> list of color strings
        self.hand_size = 6
        # Two mandalas, each has:
        #   mountain: list of colors (shared center)
        #   fields: {player: list of colors} (personal sides)
        self.mandalas = [
            {"mountain": [], "fields": {"1": [], "2": []}},
            {"mountain": [], "fields": {"1": [], "2": []}},
        ]
        # Cup track: each player has an ordered list of colors
        # First color in cup = 1 pt, second = 2 pts, etc. (up to 6)
        self.cups = {}  # player -> list of colors (ordered)
        # Cards scored (in the cup area, face down)
        self.scored_cards = {}  # player -> list of colors
        self.discard = []
        self.log = []

    def setup(self):
        self.deck = _build_deck(self.deck_size)
        for p in ["1", "2"]:
            self.hands[p] = []
            self.cups[p] = []
            self.scored_cards[p] = []
            for _ in range(self.hand_size):
                if self.deck:
                    self.hands[p].append(self.deck.pop())
        self.log = ["Game started! Each player has 6 cards."]

    def _mandala_colors(self, m_idx):
        """Get all unique colors present in a mandala."""
        m = self.mandalas[m_idx]
        colors = set(m["mountain"])
        colors.update(m["fields"]["1"])
        colors.update(m["fields"]["2"])
        return colors

    def _mandala_complete(self, m_idx):
        """Check if a mandala has all 6 colors."""
        return len(self._mandala_colors(m_idx)) >= len(COLORS)

    def _resolve_mandala(self, m_idx):
        """Resolve a completed mandala. Returns actions needed."""
        m = self.mandalas[m_idx]
        # Determine who has more cards in their field
        count1 = len(m["fields"]["1"])
        count2 = len(m["fields"]["2"])
        if count1 > count2:
            first_picker = "1"
            second_picker = "2"
        elif count2 > count1:
            first_picker = "2"
            second_picker = "1"
        else:
            # Tie: current player picks first
            first_picker = str(self.current_player)
            second_picker = "1" if first_picker == "2" else "2"
        return first_picker, second_picker

    def _get_color_value(self, player, color):
        """Get the point value of a color for a player based on cup position."""
        sp = str(player) if isinstance(player, int) else player
        if color in self.cups[sp]:
            return self.cups[sp].index(color) + 1
        return 0

    def _draw_cards(self, player, count):
        """Draw cards from deck to player's hand."""
        sp = str(player) if isinstance(player, int) else player
        for _ in range(count):
            if self.deck:
                self.hands[sp].append(self.deck.pop())

    def _calculate_score(self, player):
        """Calculate a player's score based on cup values and scored cards."""
        sp = str(player) if isinstance(player, int) else player
        total = 0
        for card in self.scored_cards[sp]:
            val = self._get_color_value(sp, card)
            total += val
        return total

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        print(f"  MANDALA - {self.variation.title()} | Turn {self.turn_number + 1}")
        print(f"{'=' * 60}")
        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            score = self._calculate_score(p)
            cup_str = ", ".join(f"{COLOR_ABBREV[c]}={i+1}pt"
                                for i, c in enumerate(self.cups[sp])) or "(empty)"
            print(f"  {self.players[p-1]}: Score={score}, "
                  f"Hand={len(self.hands[sp])} cards{marker}")
            print(f"    Cup: {cup_str}")
            print(f"    Scored cards: {len(self.scored_cards[sp])}")
        print()
        # Display mandalas
        for m_idx in range(2):
            m = self.mandalas[m_idx]
            print(f"  --- Mandala {m_idx + 1} ---")
            # P1 field
            f1 = self._group_cards(m["fields"]["1"])
            f2 = self._group_cards(m["fields"]["2"])
            mtn = self._group_cards(m["mountain"])
            colors_present = self._mandala_colors(m_idx)
            print(f"    {self.players[0]}'s field: {f1 or '(empty)'}")
            print(f"    Mountain:       {mtn or '(empty)'}")
            print(f"    {self.players[1]}'s field: {f2 or '(empty)'}")
            print(f"    Colors present: {len(colors_present)}/6 "
                  f"({', '.join(COLOR_ABBREV[c] for c in sorted(colors_present))})")
            print()
        # Current player's hand
        cp = str(self.current_player)
        hand_grouped = self._group_cards(self.hands[cp])
        print(f"  Your hand: {hand_grouped}")
        print(f"  Deck remaining: {len(self.deck)}")
        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def _group_cards(self, cards):
        """Group cards by color for display."""
        if not cards:
            return ""
        counts = {}
        for c in cards:
            counts[c] = counts.get(c, 0) + 1
        return " ".join(f"{COLOR_ABBREV[c]}x{n}" for c, n in sorted(counts.items()))

    def get_move(self):
        cp = str(self.current_player)
        hand = self.hands[cp]

        if not hand:
            print("  No cards in hand. Drawing cards...")
            input_with_quit("  Press Enter to continue...")
            return {"action": "draw"}

        print("  Actions:")
        print("    [1] Play card(s) to a Mandala's Mountain")
        print("    [2] Play card(s) to your Field in a Mandala")
        choice = input_with_quit("  Choose action (1 or 2): ").strip()

        if choice not in ('1', '2'):
            return None

        # Choose mandala
        m_choice = input_with_quit("  Which Mandala? (1 or 2): ").strip()
        try:
            m_idx = int(m_choice) - 1
            if m_idx not in (0, 1):
                return None
        except ValueError:
            return None

        if choice == '1':
            # Play to mountain: play 1 card of a color not already in the mandala
            present_colors = self._mandala_colors(m_idx)
            available = [c for c in hand if c not in present_colors]
            if not available:
                print("  No playable colors for this mountain (all colors already present).")
                input_with_quit("  Press Enter to continue...")
                return None
            avail_unique = sorted(set(available))
            print(f"  Available colors: {', '.join(f'{COLOR_ABBREV[c]}={c}' for c in avail_unique)}")
            color_input = input_with_quit("  Play which color? (letter): ").strip().upper()
            if color_input not in ABBREV_TO_COLOR:
                return None
            color = ABBREV_TO_COLOR[color_input]
            if color not in available:
                return None
            return {"action": "mountain", "mandala": m_idx, "color": color}

        else:
            # Play to field: play 1 or more cards of the SAME color
            # Color must not already be in this mandala
            present_colors = self._mandala_colors(m_idx)
            available = [c for c in hand if c not in present_colors]
            if not available:
                print("  No playable colors for this field.")
                input_with_quit("  Press Enter to continue...")
                return None
            avail_unique = sorted(set(available))
            print(f"  Available colors: {', '.join(f'{COLOR_ABBREV[c]}={c}' for c in avail_unique)}")
            color_input = input_with_quit("  Play which color? (letter): ").strip().upper()
            if color_input not in ABBREV_TO_COLOR:
                return None
            color = ABBREV_TO_COLOR[color_input]
            if color not in available:
                return None
            count_in_hand = hand.count(color)
            if count_in_hand > 1:
                num_input = input_with_quit(f"  How many {color} cards? (1-{count_in_hand}): ").strip()
                try:
                    num = int(num_input)
                    if num < 1 or num > count_in_hand:
                        return None
                except ValueError:
                    return None
            else:
                num = 1
            return {"action": "field", "mandala": m_idx, "color": color, "count": num}

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "draw":
            self._draw_cards(cp, self.hand_size)
            self.log.append(f"{self.players[self.current_player-1]} drew cards.")
            return True

        if action == "mountain":
            m_idx = move["mandala"]
            color = move["color"]
            present = self._mandala_colors(m_idx)
            if color in present:
                return False
            if color not in self.hands[cp]:
                return False
            self.hands[cp].remove(color)
            self.mandalas[m_idx]["mountain"].append(color)
            self.log.append(f"{self.players[self.current_player-1]} played {COLOR_ABBREV[color]} "
                            f"to Mandala {m_idx+1} mountain")
            # Check completion
            if self._mandala_complete(m_idx):
                self._do_resolution(m_idx)
            # Draw back to hand size
            while len(self.hands[cp]) < self.hand_size and self.deck:
                self.hands[cp].append(self.deck.pop())
            return True

        if action == "field":
            m_idx = move["mandala"]
            color = move["color"]
            count = move["count"]
            present = self._mandala_colors(m_idx)
            if color in present:
                return False
            if self.hands[cp].count(color) < count:
                return False
            for _ in range(count):
                self.hands[cp].remove(color)
                self.mandalas[m_idx]["fields"][cp].append(color)
            self.log.append(f"{self.players[self.current_player-1]} played {count}x "
                            f"{COLOR_ABBREV[color]} to Mandala {m_idx+1} field")
            if self._mandala_complete(m_idx):
                self._do_resolution(m_idx)
            while len(self.hands[cp]) < self.hand_size and self.deck:
                self.hands[cp].append(self.deck.pop())
            return True

        return False

    def _do_resolution(self, m_idx):
        """Resolve a completed mandala."""
        m = self.mandalas[m_idx]
        first_picker, second_picker = self._resolve_mandala(m_idx)

        # Mountain cards to be distributed
        mountain_cards = list(m["mountain"])
        # Get unique colors from mountain
        mountain_colors = []
        seen = set()
        for c in mountain_cards:
            if c not in seen:
                mountain_colors.append(c)
                seen.add(c)

        # First picker takes colors for cup/scoring, alternating
        picker_order = [first_picker, second_picker]
        pick_idx = 0
        remaining = list(mountain_colors)

        while remaining:
            picker = picker_order[pick_idx % 2]
            color = remaining.pop(0)
            # Add to cup if not already there
            if color not in self.cups[picker]:
                self.cups[picker].append(color)
            # All cards of this color from mountain go to scored pile
            color_count = mountain_cards.count(color)
            for _ in range(color_count):
                self.scored_cards[picker].append(color)
            pick_idx += 1

        # Field cards go to scored piles
        for p in ["1", "2"]:
            for card in m["fields"][p]:
                self.scored_cards[p].append(card)

        self.log.append(f"Mandala {m_idx+1} resolved! {self.players[int(first_picker)-1]} picked first.")

        # Reset mandala
        self.mandalas[m_idx] = {"mountain": [], "fields": {"1": [], "2": []}}

    def check_game_over(self):
        # Game ends when deck is empty and a player can't draw
        if not self.deck:
            both_empty = all(len(self.hands[sp]) == 0 for sp in ["1", "2"])
            if both_empty:
                self.game_over = True
            else:
                # Check if current player has no cards
                cp = str(self.current_player)
                if len(self.hands[cp]) == 0:
                    self.game_over = True

        if self.game_over:
            s1 = self._calculate_score(1)
            s2 = self._calculate_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": list(self.deck),
            "hands": {k: list(v) for k, v in self.hands.items()},
            "mandalas": [
                {
                    "mountain": list(m["mountain"]),
                    "fields": {k: list(v) for k, v in m["fields"].items()},
                }
                for m in self.mandalas
            ],
            "cups": {k: list(v) for k, v in self.cups.items()},
            "scored_cards": {k: list(v) for k, v in self.scored_cards.items()},
            "discard": list(self.discard),
            "log": self.log,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.hands = state["hands"]
        self.mandalas = state["mandalas"]
        self.cups = state["cups"]
        self.scored_cards = state["scored_cards"]
        self.discard = state.get("discard", [])
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  MANDALA - Tutorial
============================================================

  OVERVIEW:
  Mandala is a 2-player card game where you play colored cards
  into two shared mandala areas. When a mandala contains all 6
  colors, it is resolved and cards are scored.

  COMPONENTS:
  - 6 colors of cards: R=Red, O=Orange, Y=Yellow,
    G=Green, B=Blue, P=Purple
  - Each player starts with 6 cards in hand

  THE MANDALAS:
  Each mandala has three zones:
  - Mountain (center): shared area for single cards
  - Player 1's Field: personal cards on one side
  - Player 2's Field: personal cards on the other side

  ON YOUR TURN:
  Choose one action:
  1. Play 1 card to a Mountain (color must be new to that mandala)
  2. Play 1+ cards of SAME color to your Field (color must be new)

  RESOLUTION:
  When a mandala has all 6 colors:
  - Player with more field cards picks first
  - Players alternate picking colors from the mountain
  - Each picked color goes to your Cup (value track) and
    scored pile

  THE CUP (scoring track):
  - Colors are added to your cup in the order you pick them
  - 1st color = 1 point per card, 2nd = 2 pts, etc.
  - This makes later-added colors worth more!
  - Field cards also go to your scored pile

  STRATEGY:
  - Control which colors get high cup values
  - Play to fields strategically to win resolution
  - Watch which colors your opponent values

  WINNING:
  - Game ends when the deck runs out
  - Highest score from scored cards wins
============================================================
"""
