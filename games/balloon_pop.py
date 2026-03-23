"""Balloon Pop - Push-your-luck balloon collection game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class BalloonPopGame(BaseGame):
    """Balloon Pop - Collect sets of colored balloons without popping them."""

    name = "Balloon Pop"
    description = "Push-your-luck balloon collection - draw cards but don't pop!"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (5 colors, 50 cards, 5 pop cards)",
        "risky": "Risky (5 colors, 50 cards, 10 pop cards)",
    }

    COLORS = ["Red", "Blue", "Green", "Yellow", "Purple"]
    COLOR_SYMBOLS = {"Red": "R", "Blue": "B", "Green": "G", "Yellow": "Y", "Purple": "P"}

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.banked = {1: {}, 2: {}}  # banked balloons per player
        self.unbanked = {1: {}, 2: {}}  # current draw pile per player
        self.drawn_cards = []  # cards drawn this turn (for display)
        self.phase = "draw"  # "draw" or "decide"
        self.rounds_played = 0
        self.max_rounds = 10
        self.log = []

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def _make_deck(self):
        deck = []
        if self.variation == "risky":
            pop_count = 10
        else:
            pop_count = 5

        # Distribute balloon cards evenly across colors
        balloon_count = 50 - pop_count
        per_color = balloon_count // len(self.COLORS)
        remainder = balloon_count % len(self.COLORS)

        for i, color in enumerate(self.COLORS):
            count = per_color + (1 if i < remainder else 0)
            for _ in range(count):
                deck.append({"type": "balloon", "color": color})

        # Add pop cards, each with a random color
        for _ in range(pop_count):
            deck.append({"type": "pop", "color": random.choice(self.COLORS)})

        random.shuffle(deck)
        return deck

    def _score_balloons(self, banked):
        """Score points for banked balloons. Sets of different colors score bonus."""
        total = 0
        counts = []
        for color in self.COLORS:
            counts.append(banked.get(color, 0))

        # Each balloon is worth 1 point
        total += sum(counts)

        # Bonus for complete sets (one of each color)
        min_count = min(counts)
        total += min_count * 5  # 5 bonus per complete set

        return total

    def setup(self):
        self.deck = self._make_deck()
        self.banked = {1: {}, 2: {}}
        self.unbanked = {1: {}, 2: {}}
        self.drawn_cards = []
        self.phase = "draw"
        self.rounds_played = 0
        self.log = []
        self.game_over = False
        self.winner = None
        self.current_player = 1

    def display(self):
        clear_screen()
        p1_score = self._score_balloons(self.banked[1])
        p2_score = self._score_balloons(self.banked[2])

        print("=" * 55)
        print(f"  BALLOON POP - Round {self.rounds_played + 1}/{self.max_rounds}")
        print(f"  Deck: {len(self.deck)} cards remaining")
        print("=" * 55)

        # Scores
        for p in [1, 2]:
            banked = self.banked[p]
            score = self._score_balloons(banked)
            balloon_str = " ".join(
                f"{self.COLOR_SYMBOLS[c]}:{banked.get(c, 0)}" for c in self.COLORS
            )
            sets = min(banked.get(c, 0) for c in self.COLORS)
            print(f"  {self.players[p-1]:12s} | Banked: [{balloon_str}] | "
                  f"Sets: {sets} | Score: {score}")

        # Current player's unbanked
        p = self.current_player
        unbanked = self.unbanked[p]
        if any(unbanked.get(c, 0) > 0 for c in self.COLORS):
            ub_str = " ".join(
                f"{self.COLOR_SYMBOLS[c]}:{unbanked.get(c, 0)}" for c in self.COLORS
            )
            print(f"\n  {self.players[p-1]}'s unbanked balloons: [{ub_str}]")
        else:
            print(f"\n  {self.players[p-1]} has no unbanked balloons.")

        # Show drawn cards this turn
        if self.drawn_cards:
            print(f"\n  Cards drawn this turn:")
            for card in self.drawn_cards:
                if card["type"] == "balloon":
                    sym = self.COLOR_SYMBOLS[card["color"]]
                    print(f"    [{sym}] {card['color']} Balloon")
                else:
                    print(f"    [X] POP! ({card['color']})")

        if self.log:
            print("\n  Recent:")
            for msg in self.log[-4:]:
                print(f"    {msg}")
        print()

    def get_move(self):
        p = self.current_player

        if not self.deck:
            print("  Deck is empty! Banking remaining balloons.")
            input_with_quit("  Press Enter...")
            return "bank"

        print(f"  {self.players[p-1]}'s turn:")
        print("    d) Draw a card (push your luck!)")
        print("    b) Bank your unbanked balloons (end turn safely)")

        while True:
            choice = input_with_quit("  Choice (d/b): ").strip().lower()
            if choice == "d":
                return "draw"
            elif choice == "b":
                return "bank"
            else:
                print("  Enter 'd' to draw or 'b' to bank.")

    def make_move(self, move):
        p = self.current_player

        if move == "bank":
            # Bank all unbanked balloons
            banked_count = 0
            for color in self.COLORS:
                amount = self.unbanked[p].get(color, 0)
                if amount > 0:
                    self.banked[p][color] = self.banked[p].get(color, 0) + amount
                    banked_count += amount
            self.unbanked[p] = {}
            self.drawn_cards = []
            if banked_count > 0:
                self._add_log(f"{self.players[p-1]} banked {banked_count} balloon(s)!")
            else:
                self._add_log(f"{self.players[p-1]} ended turn (nothing to bank).")
            self.rounds_played += 1
            return True

        if move == "draw":
            if not self.deck:
                return False

            card = self.deck.pop()
            self.drawn_cards.append(card)

            if card["type"] == "balloon":
                color = card["color"]
                self.unbanked[p][color] = self.unbanked[p].get(color, 0) + 1
                self._add_log(f"{self.players[p-1]} drew a {color} balloon!")
                # Don't switch player - they continue drawing or banking
                # We need to NOT switch player, so we return True but
                # the play loop will call switch_player. We handle this by
                # not ending the turn yet - we need a way to keep the turn going.
                # Solution: return False to indicate "not done yet" but that's
                # treated as invalid move. Instead, let's manage turns manually.
                # Actually, looking at the base class, make_move returning True
                # causes switch_player. We need to avoid switching on draws.
                # We'll override by switching back in check_game_over or
                # by using a "still drawing" flag.
                # Simplest approach: always return True, but in check_game_over
                # we switch back if the player is still drawing.
                self._still_drawing = True
                return True

            else:
                # POP! Lose all unbanked balloons of that color
                color = card["color"]
                lost = self.unbanked[p].get(color, 0)
                self.unbanked[p][color] = 0
                self._add_log(f"POP! {self.players[p-1]} lost {lost} unbanked {color} balloon(s)!")
                # Auto-bank remaining unbanked balloons and end turn
                banked_count = 0
                for c in self.COLORS:
                    amount = self.unbanked[p].get(c, 0)
                    if amount > 0:
                        self.banked[p][c] = self.banked[p].get(c, 0) + amount
                        banked_count += amount
                self.unbanked[p] = {}
                self.drawn_cards = []
                if banked_count > 0:
                    self._add_log(f"  Remaining {banked_count} balloon(s) auto-banked.")
                self.rounds_played += 1
                self._still_drawing = False
                return True

        return False

    def check_game_over(self):
        # If player is still drawing, switch back so they keep their turn
        if getattr(self, '_still_drawing', False):
            self.switch_player()  # undo the switch that play() does
            self._still_drawing = False
            return

        if self.rounds_played >= self.max_rounds or not self.deck:
            # Bank any remaining unbanked for both players
            for p in [1, 2]:
                for color in self.COLORS:
                    amount = self.unbanked[p].get(color, 0)
                    if amount > 0:
                        self.banked[p][color] = self.banked[p].get(color, 0) + amount
                self.unbanked[p] = {}

            self.game_over = True
            p1_score = self._score_balloons(self.banked[1])
            p2_score = self._score_balloons(self.banked[2])
            if p1_score > p2_score:
                self.winner = 1
            elif p2_score > p1_score:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "banked_1": self.banked[1],
            "banked_2": self.banked[2],
            "unbanked_1": self.unbanked[1],
            "unbanked_2": self.unbanked[2],
            "drawn_cards": self.drawn_cards,
            "rounds_played": self.rounds_played,
            "max_rounds": self.max_rounds,
            "log": self.log,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.banked = {1: state["banked_1"], 2: state["banked_2"]}
        self.unbanked = {1: state["unbanked_1"], 2: state["unbanked_2"]}
        self.drawn_cards = state["drawn_cards"]
        self.rounds_played = state["rounds_played"]
        self.max_rounds = state["max_rounds"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  BALLOON POP - Tutorial
==================================================

OVERVIEW:
  Balloon Pop is a push-your-luck card game. Draw balloons from the
  deck to collect sets of different colors, but watch out for POP
  cards that will burst your unbanked balloons!

GAMEPLAY:
  On your turn, you repeatedly choose to:
  - DRAW: Take the top card from the deck
    - Balloon card: Added to your unbanked collection
    - POP card: Lose all unbanked balloons of that color!
      Remaining unbanked balloons are auto-banked, turn ends.
  - BANK: Safely store all your unbanked balloons. Turn ends.

SCORING:
  - Each banked balloon = 1 point
  - Complete sets (one of each color) = 5 bonus points per set
  - Colors: Red, Blue, Green, Yellow, Purple

STRATEGY:
  - Drawing more cards means more balloons, but higher pop risk!
  - Bank early if you have valuable unbanked collections.
  - Try to collect all 5 colors for the set bonus.
  - The 'risky' variant has more pop cards - be careful!

  Highest score after 10 rounds wins!
"""
