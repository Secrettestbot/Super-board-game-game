"""Tussie Mussie - I-cut-you-choose flower bouquet card game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Flower cards: (name, base_points, scoring_type, scoring_detail)
# scoring_type: "flat" = always scores base, "color_bonus" = bonus per color,
# "set" = bonus for having set, "unique" = bonus if only one of color
STANDARD_FLOWERS = [
    ("Red Rose", 2, "flat", None, "red"),
    ("Pink Rose", 2, "flat", None, "pink"),
    ("White Rose", 2, "flat", None, "white"),
    ("Red Tulip", 1, "color_bonus", "red", "red"),
    ("Pink Tulip", 1, "color_bonus", "pink", "pink"),
    ("White Tulip", 1, "color_bonus", "white", "white"),
    ("Red Carnation", 0, "color_count", "red", "red"),
    ("Pink Carnation", 0, "color_count", "pink", "pink"),
    ("White Carnation", 0, "color_count", "white", "white"),
    ("Daisy", 3, "unique_color", "yellow", "yellow"),
    ("Sunflower", 3, "unique_color", "yellow", "yellow"),
    ("Lavender", 1, "pair_bonus", None, "purple"),
    ("Violet", 1, "pair_bonus", None, "purple"),
    ("Lily", 4, "penalty", None, "white"),
    ("Orchid", 5, "penalty", None, "pink"),
    ("Marigold", 0, "most_colors", None, "yellow"),
    ("Bluebell", 2, "flat", None, "blue"),
    ("Iris", 1, "flat", None, "blue"),
]

EXTENDED_FLOWERS = STANDARD_FLOWERS + [
    ("Peony", 3, "flat", None, "pink"),
    ("Daffodil", 2, "color_bonus", "yellow", "yellow"),
    ("Poppy", 1, "color_count", "red", "red"),
    ("Hyacinth", 2, "pair_bonus", None, "purple"),
    ("Jasmine", 3, "unique_color", "white", "white"),
    ("Dahlia", 1, "flat", None, "red"),
]


def make_card(flower_tuple, card_id):
    """Create a card dict from flower tuple."""
    return {
        "id": card_id,
        "name": flower_tuple[0],
        "base_points": flower_tuple[1],
        "scoring_type": flower_tuple[2],
        "scoring_detail": flower_tuple[3],
        "color": flower_tuple[4],
    }


def score_bouquet(cards):
    """Score a player's bouquet of cards."""
    total = 0
    colors = [c["color"] for c in cards]
    color_counts = {}
    for c in colors:
        color_counts[c] = color_counts.get(c, 0) + 1

    for card in cards:
        st = card["scoring_type"]
        if st == "flat":
            total += card["base_points"]
        elif st == "color_bonus":
            # +1 per card of the specified color (including self)
            bonus_color = card["scoring_detail"]
            total += card["base_points"] + color_counts.get(bonus_color, 0)
        elif st == "color_count":
            # Score = number of cards of that color * 2
            bonus_color = card["scoring_detail"]
            total += color_counts.get(bonus_color, 0) * 2
        elif st == "unique_color":
            # Score points only if you have exactly 1 of this color
            if color_counts.get(card["color"], 0) == 1:
                total += card["base_points"]
        elif st == "pair_bonus":
            # Score points; if you have 2+ purple cards, bonus +3
            total += card["base_points"]
            if color_counts.get("purple", 0) >= 2:
                total += 3
        elif st == "penalty":
            # High points but -1 per card you have total
            total += card["base_points"] - len(cards)
        elif st == "most_colors":
            # Score = number of unique colors * 2
            total += len(color_counts) * 2

    return total


class TussieMussiGame(BaseGame):
    """Tussie Mussie - I-cut-you-choose flower bouquet game."""

    name = "Tussie Mussie"
    description = "I-cut-you-choose flower bouquet card game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (18 cards)",
        "extended": "Extended game (24 cards)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.bouquets = {1: [], 2: []}
        self.drawn_cards = []
        self.face_up_idx = None
        self.face_down_idx = None
        self.phase = "draw"  # draw, arrange, choose, score
        self.log = []
        self.cards_per_player = 4
        self.round_count = 0

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        flowers = STANDARD_FLOWERS if self.variation != "extended" else EXTENDED_FLOWERS
        self.deck = [make_card(f, i) for i, f in enumerate(flowers)]
        random.shuffle(self.deck)
        self.bouquets = {1: [], 2: []}
        self.drawn_cards = []
        self.face_up_idx = None
        self.face_down_idx = None
        self.phase = "draw"
        self.log = []
        self.cards_per_player = 4 if self.variation != "extended" else 5
        self.round_count = 0
        self.game_over = False
        self.winner = None

    def display(self):
        clear_screen()
        print("=" * 56)
        print("         T U S S I E   M U S S I E")
        print("=" * 56)
        print(f"  Deck: {len(self.deck)} cards remaining")
        print(f"  Round: {self.round_count + 1} / {self.cards_per_player * 2}")
        print()

        for p in (1, 2):
            marker = " <<" if self.current_player == p else ""
            print(f"  {self.players[p-1]}'s Bouquet ({len(self.bouquets[p])}/{self.cards_per_player} cards){marker}")
            if self.bouquets[p]:
                for card in self.bouquets[p]:
                    print(f"    - {card['name']} [{card['color']}]")
            else:
                print(f"    (empty)")
            print()

        if self.phase == "arrange":
            print(f"  --- {self.players[self.current_player - 1]} drew 2 cards ---")
            print()
            for i, card in enumerate(self.drawn_cards):
                self._print_card(card, i + 1)
            print()
            print("  Choose which card to offer FACE UP (the other will be face down).")

        elif self.phase == "choose":
            opp = 2 if self.current_player == 1 else 1
            print(f"  --- {self.players[opp - 1]} is offering ---")
            print()
            if self.face_up_idx is not None:
                up_card = self.drawn_cards[self.face_up_idx]
                down_card = self.drawn_cards[self.face_down_idx]
                print(f"  FACE UP (A):")
                self._print_card(up_card, "A")
                print(f"  FACE DOWN (B):")
                print(f"    B. ??? [hidden]")
            print()
            print(f"  {self.players[self.current_player - 1]}, choose A (face up) or B (face down).")

        elif self.phase == "score":
            print("  --- FINAL SCORES ---")
            for p in (1, 2):
                sc = score_bouquet(self.bouquets[p])
                print(f"  {self.players[p-1]}: {sc} points")
            print()

        if self.log:
            print("  --- Log ---")
            for msg in self.log[-5:]:
                print(f"  {msg}")
        print()

    def _print_card(self, card, label):
        desc = self._scoring_description(card)
        print(f"    {label}. {card['name']} [{card['color']}] - {desc}")

    def _scoring_description(self, card):
        st = card["scoring_type"]
        bp = card["base_points"]
        if st == "flat":
            return f"{bp} points"
        elif st == "color_bonus":
            return f"{bp} pts + 1 per {card['scoring_detail']} card"
        elif st == "color_count":
            return f"2 pts per {card['scoring_detail']} card you have"
        elif st == "unique_color":
            return f"{bp} pts if only {card['color']} card"
        elif st == "pair_bonus":
            return f"{bp} pts, +3 if 2+ purple cards"
        elif st == "penalty":
            return f"{bp} pts minus 1 per card total"
        elif st == "most_colors":
            return f"2 pts per unique color in bouquet"
        return f"{bp} pts"

    def get_move(self):
        if self.phase == "draw":
            return ("draw", input_with_quit("  Press Enter to draw 2 cards: "))
        elif self.phase == "arrange":
            return ("arrange", input_with_quit("  Card to show face up (1 or 2): "))
        elif self.phase == "choose":
            return ("choose", input_with_quit("  Pick A (face up) or B (face down): "))
        return ("unknown", "")

    def make_move(self, move):
        action, value = move

        if action == "draw":
            if len(self.deck) < 2:
                self.phase = "score"
                return True
            self.drawn_cards = [self.deck.pop(), self.deck.pop()]
            self.phase = "arrange"
            return True

        elif action == "arrange":
            val = value.strip()
            if val in ("1", "2"):
                idx = int(val) - 1
                self.face_up_idx = idx
                self.face_down_idx = 1 - idx
                offerer = self.current_player
                self._add_log(f"{self.players[offerer - 1]} offers {self.drawn_cards[self.face_up_idx]['name']} face up and one face down.")
                self.phase = "choose"
                self.switch_player()
                return True
            return False

        elif action == "choose":
            val = value.strip().lower()
            if val in ("a", "b"):
                chooser = self.current_player
                offerer = 2 if chooser == 1 else 1
                if val == "a":
                    chosen_card = self.drawn_cards[self.face_up_idx]
                    other_card = self.drawn_cards[self.face_down_idx]
                else:
                    chosen_card = self.drawn_cards[self.face_down_idx]
                    other_card = self.drawn_cards[self.face_up_idx]

                self.bouquets[chooser].append(chosen_card)
                self.bouquets[offerer].append(other_card)
                self._add_log(f"{self.players[chooser - 1]} takes {chosen_card['name']}.")
                self._add_log(f"{self.players[offerer - 1]} gets {other_card['name']}.")

                self.drawn_cards = []
                self.face_up_idx = None
                self.face_down_idx = None
                self.round_count += 1

                # Check if all cards dealt
                if all(len(self.bouquets[p]) >= self.cards_per_player for p in (1, 2)):
                    self.phase = "score"
                else:
                    self.phase = "draw"
                    # The OTHER player (offerer) becomes current player for next draw
                    self.current_player = offerer
                return True
            return False

        return False

    def check_game_over(self):
        if self.phase == "score":
            s1 = score_bouquet(self.bouquets[1])
            s2 = score_bouquet(self.bouquets[2])
            self.game_over = True
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "bouquets": {"1": self.bouquets[1], "2": self.bouquets[2]},
            "drawn_cards": self.drawn_cards,
            "face_up_idx": self.face_up_idx,
            "face_down_idx": self.face_down_idx,
            "phase": self.phase,
            "log": self.log,
            "cards_per_player": self.cards_per_player,
            "round_count": self.round_count,
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.bouquets = {1: state["bouquets"]["1"], 2: state["bouquets"]["2"]}
        self.drawn_cards = state["drawn_cards"]
        self.face_up_idx = state["face_up_idx"]
        self.face_down_idx = state["face_down_idx"]
        self.phase = state["phase"]
        self.log = state["log"]
        self.cards_per_player = state["cards_per_player"]
        self.round_count = state["round_count"]
        self._resumed = True

    def get_tutorial(self):
        return """
=== TUSSIE MUSSIE TUTORIAL ===

Tussie Mussie is an I-cut-you-choose flower bouquet card game for 2 players.

HOW TO PLAY:
1. On your turn, draw 2 flower cards from the deck
2. Look at both cards, then offer them to your opponent:
   - One card FACE UP (your opponent can see it)
   - One card FACE DOWN (hidden)
3. Your opponent chooses either the face-up or face-down group
4. You get whichever group they didn't pick
5. Continue until each player has 4 cards (5 in extended)

SCORING:
Each flower card has a scoring condition:
  - Flat points: Always worth their value
  - Color bonus: Extra points per card of a matching color
  - Color count: Points based on how many of a color you have
  - Unique color: Points only if you have exactly one of that color
  - Pair bonus: Extra points if you have 2+ purple cards
  - Penalty: High base points minus 1 per total card
  - Most colors: Points for color variety

STRATEGY:
  - When offering, try to make both options unappealing
  - The face-down card creates uncertainty
  - Build your bouquet around scoring synergies
  - Watch what colors your opponent collects

The player with the most points wins!
"""
