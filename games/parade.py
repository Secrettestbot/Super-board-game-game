"""Parade - A card shedding game with penalty scoring."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

STANDARD_COLORS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Black']
QUICK_COLORS = ['Red', 'Blue', 'Green', 'Yellow']

COLOR_CODES = {
    'Red': '\033[91m', 'Blue': '\033[94m', 'Green': '\033[92m',
    'Yellow': '\033[93m', 'Purple': '\033[95m', 'Black': '\033[97m',
}
RESET = '\033[0m'
COLOR_SHORT = {
    'Red': 'R', 'Blue': 'B', 'Green': 'G', 'Yellow': 'Y',
    'Purple': 'P', 'Black': 'K',
}


def card_str(card, colored=True):
    color, value = card
    short = COLOR_SHORT.get(color, '?')
    if colored:
        code = COLOR_CODES.get(color, '')
        return f"{code}{short}{value}{RESET}"
    return f"{short}{value}"


class ParadeGame(BaseGame):
    """Parade card game implementation."""

    name = "Parade"
    description = "Card shedding with penalty scoring - lowest score wins"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 6 colors, values 0-10",
        "quick": "Quick game - 4 colors, values 0-10",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.colors = QUICK_COLORS if self.variation == "quick" else STANDARD_COLORS
        self.deck = []
        self.parade = []  # The parade line
        self.hands = {1: [], 2: []}
        self.collections = {1: [], 2: []}  # Penalty cards collected
        self.log = []
        self.final_round = False
        self.turns_in_final = 0

    def setup(self):
        self.deck = []
        for color in self.colors:
            for val in range(0, 11):
                self.deck.append([color, val])
        random.shuffle(self.deck)

        # Deal 5 cards to each player
        self.hands = {1: [], 2: []}
        for _ in range(5):
            self.hands[1].append(self.deck.pop())
            self.hands[2].append(self.deck.pop())

        # Start parade with 6 cards
        self.parade = []
        for _ in range(6):
            self.parade.append(self.deck.pop())

        self.collections = {1: [], 2: []}
        self.log = []
        self.final_round = False
        self.turns_in_final = 0

    def _sort_hand(self, player):
        color_order = {c: i for i, c in enumerate(self.colors)}
        self.hands[player].sort(key=lambda c: (color_order.get(c[0], 99), c[1]))

    def _sort_collection(self, player):
        color_order = {c: i for i, c in enumerate(self.colors)}
        self.collections[player].sort(key=lambda c: (color_order.get(c[0], 99), c[1]))

    def display(self):
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print(f"{'=' * 64}")
        print(f"  PARADE - {self.players[0]} vs {self.players[1]}")
        print(f"  Deck: {len(self.deck)} cards" +
              (" | *** FINAL ROUND ***" if self.final_round else ""))
        print(f"{'=' * 64}")

        # Parade line
        print(f"\n  Parade ({len(self.parade)} cards):")
        print(f"  ", end="")
        for i, card in enumerate(self.parade):
            print(f" {card_str(card)}", end="")
            if (i + 1) % 15 == 0:
                print(f"\n  ", end="")
        print()

        # Both players' collections
        for player in (1, 2):
            self._sort_collection(player)
            coll = self.collections[player]
            label = "YOU" if player == p else self.players[player - 1]
            print(f"\n  {label}'s collection:")
            if coll:
                by_color = {}
                for card in coll:
                    by_color.setdefault(card[0], []).append(card)
                for color in self.colors:
                    if color in by_color:
                        cards = by_color[color]
                        cstrs = " ".join(card_str(c) for c in cards)
                        print(f"    {color:>8}: {cstrs}")
            else:
                print(f"    (empty)")

        # Penalty preview
        print(f"\n  Penalty scores: {self.players[0]}={self._calculate_score(1)}  "
              f"{self.players[1]}={self._calculate_score(2)}")

        # Current player hand
        self._sort_hand(p)
        print(f"\n  Your hand: ", end="")
        for i, card in enumerate(self.hands[p]):
            print(f" [{i + 1}]{card_str(card)}", end="")
        print()

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def _cards_removed_by(self, played_card, parade):
        """Determine which cards get removed from parade when playing a card."""
        color, value = played_card
        removed = []

        # The card's value determines how many cards at the END of the parade are "safe"
        # Cards beyond that safe zone with same color OR value <= played card's value are removed
        safe_count = value
        vulnerable = parade[:max(0, len(parade) - safe_count)]

        for card in vulnerable:
            if card[0] == color or card[1] <= value:
                removed.append(card)

        return removed

    def get_move(self):
        p = self.current_player
        hand = self.hands[p]
        if not hand:
            return "pass"

        # Show what each card would remove
        print("  Card effects (cards you'd collect as penalties):")
        for i, card in enumerate(hand):
            removed = self._cards_removed_by(card, self.parade)
            if removed:
                rem_str = ", ".join(card_str(c, False) for c in removed)
                print(f"    [{i + 1}] {card_str(card, False)} -> collect: {rem_str} ({len(removed)} cards)")
            else:
                print(f"    [{i + 1}] {card_str(card, False)} -> collect: nothing!")
        print()

        while True:
            raw = input_with_quit(f"  {self.players[p - 1]}, play a card [1-{len(hand)}]: ")
            try:
                idx = int(raw.strip()) - 1
            except ValueError:
                print("  Enter a number.")
                continue
            if idx < 0 or idx >= len(hand):
                print(f"  Choose 1-{len(hand)}.")
                continue
            return {"card_idx": idx}

    def make_move(self, move):
        if move == "pass":
            return True

        p = self.current_player
        idx = move["card_idx"]
        hand = self.hands[p]

        if idx < 0 or idx >= len(hand):
            return False

        card = hand.pop(idx)

        # Determine removed cards
        removed = self._cards_removed_by(card, self.parade)

        # Remove those cards from parade and add to player's collection
        for r in removed:
            self.parade.remove(r)
            self.collections[p].append(r)

        # Add played card to END of parade
        self.parade.append(card)

        rem_str = ", ".join(card_str(c, False) for c in removed) if removed else "nothing"
        self.log.append(f"{self.players[p - 1]} played {card_str(card, False)}, collected: {rem_str}")

        # Draw a card (if deck has cards and not final round)
        if self.deck and not self.final_round:
            self.hands[p].append(self.deck.pop())

        # Check if final round triggers
        if not self.final_round:
            if not self.deck:
                self.final_round = True
                self.turns_in_final = 0
            else:
                # Check if player has collected all colors
                colors_collected = set(c[0] for c in self.collections[p])
                if len(colors_collected) >= len(self.colors):
                    self.final_round = True
                    self.turns_in_final = 0

        if self.final_round:
            self.turns_in_final += 1

        return True

    def _calculate_score(self, player):
        """Calculate penalty score for a player."""
        coll = self.collections[player]
        if not coll:
            return 0

        # Count cards per color for both players
        color_counts = {1: {}, 2: {}}
        for pl in (1, 2):
            for card in self.collections[pl]:
                color_counts[pl][card[0]] = color_counts[pl].get(card[0], 0) + 1

        score = 0
        for card in coll:
            color = card[0]
            value = card[1]
            # Check if this player has the most of this color
            opp = 2 if player == 1 else 1
            my_count = color_counts[player].get(color, 0)
            opp_count = color_counts[opp].get(color, 0)
            if my_count > opp_count:
                score += 1  # Count as 1 instead of face value
            else:
                score += value
        return score

    def check_game_over(self):
        # Game ends when final round is over (both players had a turn)
        if self.final_round and self.turns_in_final >= 2:
            # Each player adds 2 remaining hand cards to collection
            for pl in (1, 2):
                # Player discards down by adding remaining hand cards to collection
                while self.hands[pl]:
                    self.collections[pl].append(self.hands[pl].pop())

            self.game_over = True
            s1 = self._calculate_score(1)
            s2 = self._calculate_score(2)
            if s1 < s2:
                self.winner = 1
            elif s2 < s1:
                self.winner = 2
            else:
                # Tie: fewer cards wins
                c1 = len(self.collections[1])
                c2 = len(self.collections[2])
                if c1 < c2:
                    self.winner = 1
                elif c2 < c1:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        return {
            "colors": self.colors,
            "deck": self.deck,
            "parade": self.parade,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "collections": {"1": self.collections[1], "2": self.collections[2]},
            "final_round": self.final_round,
            "turns_in_final": self.turns_in_final,
            "log": self.log[-10:],
        }

    def load_state(self, state):
        self.colors = state["colors"]
        self.deck = state["deck"]
        self.parade = state["parade"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.collections = {1: state["collections"]["1"], 2: state["collections"]["2"]}
        self.final_round = state.get("final_round", False)
        self.turns_in_final = state.get("turns_in_final", 0)
        self.log = state.get("log", [])

    def get_tutorial(self):
        return f"""
{'=' * 60}
  PARADE - Tutorial
{'=' * 60}

  OBJECTIVE:
  Score the FEWEST penalty points. Lowest score wins!

  THE DECK:
  {len(self.colors)} colors x values 0-10 = {len(self.colors) * 11} cards.
  Colors: {', '.join(self.colors)}

  THE PARADE:
  A line of face-up cards. You play a card to the END.

  CARD REMOVAL RULE:
  When you play a card with value V:
  - The last V cards in the parade are "safe" (protected)
  - All other cards (earlier in line) that match your card's
    COLOR or have a value <= V are REMOVED and added to
    your collection (these are penalty points!).
  - Playing a 0 means NO cards are safe - everything is
    vulnerable!

  SCORING:
  - Cards in your collection count their face value as penalty
  - EXCEPT: for each color where you have MORE cards than
    your opponent, those cards count as 1 point each instead
  - This means collecting lots of one color can be strategic!

  GAME END:
  - When the deck runs out or a player collects all {len(self.colors)} colors
  - Each player plays one final card
  - Remaining hand cards go to your collection
  - Lowest total penalty score wins!

{'=' * 60}
"""
