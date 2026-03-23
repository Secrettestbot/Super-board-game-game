"""Fungi (Morels) - A 2-player forest mushroom foraging card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

ALL_MUSHROOMS = ["Porcini", "Chanterelle", "Morel", "Shiitake",
                 "Hen of Woods", "Tree Ear", "Lawyer's Wig", "Oyster"]
QUICK_MUSHROOMS = ["Porcini", "Chanterelle", "Morel", "Shiitake", "Oyster"]

# Points for cooking each type
MUSHROOM_POINTS = {
    "Porcini": 5, "Chanterelle": 3, "Morel": 6, "Shiitake": 4,
    "Hen of Woods": 4, "Tree Ear": 2, "Lawyer's Wig": 3, "Oyster": 2,
}

# How many of each type in the deck
MUSHROOM_COUNT = {
    "Porcini": 4, "Chanterelle": 5, "Morel": 4, "Shiitake": 5,
    "Hen of Woods": 4, "Tree Ear": 5, "Lawyer's Wig": 4, "Oyster": 5,
}

QUICK_MUSHROOM_COUNT = {
    "Porcini": 4, "Chanterelle": 5, "Morel": 4, "Shiitake": 5, "Oyster": 5,
}

SHORT = {
    "Porcini": "Por", "Chanterelle": "Cha", "Morel": "Mor", "Shiitake": "Shi",
    "Hen of Woods": "Hen", "Tree Ear": "Tre", "Lawyer's Wig": "Law", "Oyster": "Oys",
    "Pan": "Pan", "Night": "Ngt", "Stick": "Stk",
}


class FungiGame(BaseGame):
    """Fungi (Morels) card game implementation."""

    name = "Fungi"
    description = "Forest mushroom foraging - collect, cook, and score sets"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 8 mushroom species, 8-card path",
        "quick": "Quick game - 5 species, 6-card path",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.species = list(QUICK_MUSHROOMS)
            self.path_size = 6
        else:
            self.species = list(ALL_MUSHROOMS)
            self.path_size = 8
        self.deck = []
        self.path = []  # The forest path of visible cards
        self.decay_pile = []  # Cards that have decayed
        self.hands = {1: [], 2: []}  # Cards in hand
        self.collections = {1: [], 2: []}  # Cooked mushrooms (scored)
        self.sticks = {1: 2, 2: 2}  # Walking sticks
        self.pans = {1: 1, 2: 1}  # Cooking pans
        self.log = []
        self.hand_limit = 8

    def setup(self):
        self.deck = []
        counts = QUICK_MUSHROOM_COUNT if self.variation == "quick" else MUSHROOM_COUNT
        for mush, count in counts.items():
            if mush in self.species:
                for _ in range(count):
                    self.deck.append({"type": "mushroom", "name": mush})
        # Add pans (3 in standard, 2 in quick)
        num_pans = 2 if self.variation == "quick" else 3
        for _ in range(num_pans):
            self.deck.append({"type": "pan", "name": "Pan"})
        # Add night cards (4 in standard, 3 in quick)
        num_nights = 3 if self.variation == "quick" else 4
        for _ in range(num_nights):
            self.deck.append({"type": "night", "name": "Night"})

        random.shuffle(self.deck)

        # Deal initial hands
        self.hands = {1: [], 2: []}
        for _ in range(3):
            if self.deck:
                self.hands[1].append(self.deck.pop())
            if self.deck:
                self.hands[2].append(self.deck.pop())

        # Fill the path
        self.path = []
        for _ in range(self.path_size):
            if self.deck:
                self.path.append(self.deck.pop())

        self.decay_pile = []
        self.collections = {1: [], 2: []}
        self.sticks = {1: 2, 2: 2}
        self.pans = {1: 1, 2: 1}
        self.log = []

    def _card_name(self, card):
        return SHORT.get(card["name"], card["name"][:3])

    def _sort_hand(self, player):
        order = self.species + ["Pan", "Night"]
        self.hands[player].sort(key=lambda c: order.index(c["name"]) if c["name"] in order else 99)

    def display(self):
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print(f"{'=' * 64}")
        print(f"  FUNGI - {self.players[0]} vs {self.players[1]}")
        print(f"  Deck: {len(self.deck)} | Decay pile: {len(self.decay_pile)}")
        print(f"{'=' * 64}")

        # Forest path
        print(f"\n  Forest Path (left=free, right=costs sticks):")
        print(f"  ", end="")
        for i, card in enumerate(self.path):
            cost = max(0, i - 1)  # First 2 are free
            marker = f"[{self._card_name(card)}]"
            if cost == 0:
                marker = f"\033[92m{marker}\033[0m"  # Green = free
            else:
                marker = f"\033[93m{marker}\033[0m"  # Yellow = costs sticks
            print(f" {i + 1}:{marker}", end="")
        print()
        print(f"  Cost: ", end="")
        for i in range(len(self.path)):
            cost = max(0, i - 1)
            print(f"  {cost:^5}", end="")
        print()

        # Opponent info (hidden hand)
        print(f"\n  {self.players[opp - 1]}: {len(self.hands[opp])} cards in hand, "
              f"{self.sticks[opp]} sticks, {self.pans[opp]} pans")
        cooked_opp = self._count_cooked(opp)
        if cooked_opp:
            print(f"    Cooked: {cooked_opp}")

        # Current player info
        self._sort_hand(p)
        print(f"\n  {self.players[p - 1]} (YOU): {self.sticks[p]} sticks, {self.pans[p]} pans")
        print(f"  Hand ({len(self.hands[p])}/{self.hand_limit}): ", end="")
        for i, card in enumerate(self.hands[p]):
            print(f" [{i + 1}]{self._card_name(card)}", end="")
        print()

        cooked_p = self._count_cooked(p)
        if cooked_p:
            print(f"  Cooked: {cooked_p}")

        # Scores
        print(f"\n  Scores: {self.players[0]}={self._score(1)}  {self.players[1]}={self._score(2)}")

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def _count_cooked(self, player):
        counts = {}
        for card in self.collections[player]:
            n = card["name"]
            counts[n] = counts.get(n, 0) + 1
        if not counts:
            return ""
        parts = [f"{SHORT.get(n, n)}x{c}" for n, c in counts.items()]
        return ", ".join(parts)

    def _score(self, player):
        total = 0
        for card in self.collections[player]:
            total += MUSHROOM_POINTS.get(card["name"], 0)
        return total

    def _count_in_hand(self, player, mushroom_name):
        return sum(1 for c in self.hands[player] if c["name"] == mushroom_name)

    def get_move(self):
        p = self.current_player
        print("  Actions:")
        print("    [T]ake  - Take a card from the forest path")
        print("    [C]ook  - Cook 3+ matching mushrooms (needs a pan)")
        print("    [S]ell  - Sell 2+ matching mushrooms for sticks")
        print()

        while True:
            action = input_with_quit("  Choose action (T/C/S): ").strip().upper()

            if action in ('T', 'TAKE'):
                return self._get_take_move(p)
            elif action in ('C', 'COOK'):
                return self._get_cook_move(p)
            elif action in ('S', 'SELL'):
                return self._get_sell_move(p)
            else:
                print("  Invalid action. Choose T, C, or S.")

    def _get_take_move(self, player):
        while True:
            raw = input_with_quit(f"  Take card from path [1-{len(self.path)}] (0 to cancel): ")
            try:
                idx = int(raw.strip()) - 1
            except ValueError:
                print("  Enter a number.")
                continue
            if idx == -1:
                return self.get_move()
            if idx < 0 or idx >= len(self.path):
                print(f"  Must be 1-{len(self.path)}.")
                continue
            cost = max(0, idx - 1)
            if cost > self.sticks[player]:
                print(f"  That costs {cost} sticks but you only have {self.sticks[player]}.")
                continue
            if len(self.hands[player]) >= self.hand_limit:
                card = self.path[idx]
                if card["type"] == "pan":
                    pass  # Pans don't go to hand
                else:
                    print(f"  Hand is full ({self.hand_limit} cards).")
                    continue
            return {"action": "take", "index": idx, "cost": cost}

    def _get_cook_move(self, player):
        # Find cookable mushrooms (3+ of same type)
        hand = self.hands[player]
        mushroom_counts = {}
        for c in hand:
            if c["type"] == "mushroom":
                mushroom_counts[c["name"]] = mushroom_counts.get(c["name"], 0) + 1

        cookable = {k: v for k, v in mushroom_counts.items() if v >= 3}
        if not cookable:
            print("  You need 3+ matching mushrooms to cook.")
            return self.get_move()
        if self.pans[player] <= 0:
            print("  You need a pan to cook! Pick one up from the path.")
            return self.get_move()

        print("  Cookable mushrooms:")
        options = []
        for name, count in cookable.items():
            points = MUSHROOM_POINTS[name] * count
            options.append(name)
            print(f"    [{len(options)}] {name} x{count} = {points} points")

        while True:
            raw = input_with_quit("  Choose mushroom to cook (0 to cancel): ")
            try:
                ci = int(raw.strip()) - 1
            except ValueError:
                print("  Enter a number.")
                continue
            if ci == -1:
                return self.get_move()
            if ci < 0 or ci >= len(options):
                print(f"  Choose 1-{len(options)}.")
                continue
            return {"action": "cook", "mushroom": options[ci]}

    def _get_sell_move(self, player):
        hand = self.hands[player]
        mushroom_counts = {}
        for c in hand:
            if c["type"] == "mushroom":
                mushroom_counts[c["name"]] = mushroom_counts.get(c["name"], 0) + 1

        sellable = {k: v for k, v in mushroom_counts.items() if v >= 2}
        if not sellable:
            print("  You need 2+ matching mushrooms to sell.")
            return self.get_move()

        print("  Sellable mushrooms (gives sticks):")
        options = []
        for name, count in sellable.items():
            options.append(name)
            print(f"    [{len(options)}] {name} x{count} -> {count} sticks")

        while True:
            raw = input_with_quit("  Choose mushroom to sell (0 to cancel): ")
            try:
                ci = int(raw.strip()) - 1
            except ValueError:
                print("  Enter a number.")
                continue
            if ci == -1:
                return self.get_move()
            if ci < 0 or ci >= len(options):
                print(f"  Choose 1-{len(options)}.")
                continue
            return {"action": "sell", "mushroom": options[ci]}

    def make_move(self, move):
        p = self.current_player
        action = move["action"]

        if action == "take":
            idx = move["index"]
            cost = move["cost"]
            if idx >= len(self.path):
                return False
            card = self.path.pop(idx)
            self.sticks[p] -= cost

            if card["type"] == "night":
                # Night: decay the leftmost card in the path
                self.log.append(f"{self.players[p - 1]} drew a Night card!")
                if self.path:
                    decayed = self.path.pop(0)
                    self.decay_pile.append(decayed)
                    self.log[-1] += f" {self._card_name(decayed)} decayed."
            elif card["type"] == "pan":
                self.pans[p] += 1
                self.log.append(f"{self.players[p - 1]} picked up a Pan")
            else:
                self.hands[p].append(card)
                self.log.append(f"{self.players[p - 1]} took {card['name']} (cost {cost} sticks)")

            # Refill path
            while len(self.path) < self.path_size and self.deck:
                self.path.append(self.deck.pop())
            # Decay leftmost if path is full (shift old cards out)
            return True

        elif action == "cook":
            mushroom = move["mushroom"]
            if self.pans[p] <= 0:
                return False
            cards_to_cook = [c for c in self.hands[p] if c["name"] == mushroom]
            if len(cards_to_cook) < 3:
                return False
            self.pans[p] -= 1
            for c in cards_to_cook:
                self.hands[p].remove(c)
                self.collections[p].append(c)
            points = MUSHROOM_POINTS[mushroom] * len(cards_to_cook)
            self.log.append(f"{self.players[p - 1]} cooked {mushroom} x{len(cards_to_cook)} for {points} points")
            return True

        elif action == "sell":
            mushroom = move["mushroom"]
            cards_to_sell = [c for c in self.hands[p] if c["name"] == mushroom]
            if len(cards_to_sell) < 2:
                return False
            sticks_gained = len(cards_to_sell)
            for c in cards_to_sell:
                self.hands[p].remove(c)
            self.sticks[p] += sticks_gained
            self.decay_pile.extend(cards_to_sell)
            self.log.append(f"{self.players[p - 1]} sold {mushroom} x{len(cards_to_sell)} for {sticks_gained} sticks")
            return True

        return False

    def check_game_over(self):
        # Game ends when deck is empty and path is empty
        if not self.deck and not self.path:
            self.game_over = True
            s1 = self._score(1)
            s2 = self._score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            return

        # Also end if both players have no valid moves
        # (rare edge case - if hands are full and no cards cookable/sellable)

    def get_state(self):
        return {
            "species": self.species,
            "path_size": self.path_size,
            "deck": self.deck,
            "path": self.path,
            "decay_pile": self.decay_pile,
            "hands": {"1": self.hands[1], "2": self.hands[2]},
            "collections": {"1": self.collections[1], "2": self.collections[2]},
            "sticks": {"1": self.sticks[1], "2": self.sticks[2]},
            "pans": {"1": self.pans[1], "2": self.pans[2]},
            "hand_limit": self.hand_limit,
            "log": self.log[-10:],
        }

    def load_state(self, state):
        self.species = state["species"]
        self.path_size = state["path_size"]
        self.deck = state["deck"]
        self.path = state["path"]
        self.decay_pile = state["decay_pile"]
        self.hands = {1: state["hands"]["1"], 2: state["hands"]["2"]}
        self.collections = {1: state["collections"]["1"], 2: state["collections"]["2"]}
        self.sticks = {1: state["sticks"]["1"], 2: state["sticks"]["2"]}
        self.pans = {1: state["pans"]["1"], 2: state["pans"]["2"]}
        self.hand_limit = state.get("hand_limit", 8)
        self.log = state.get("log", [])

    def get_tutorial(self):
        species_list = ", ".join(self.species)
        return f"""
{'=' * 60}
  FUNGI - Tutorial
{'=' * 60}

  OBJECTIVE:
  Score the most points by foraging and cooking mushrooms.

  MUSHROOM TYPES: {species_list}

  THE FOREST PATH:
  {self.path_size} cards are visible. The first 2 are FREE to take.
  Cards further right cost walking sticks (position - 2).

  EACH TURN, choose one action:
    [T]ake  - Take a card from the forest path
    [C]ook  - Cook 3+ matching mushrooms (uses 1 pan)
    [S]ell  - Sell 2+ matching mushrooms for walking sticks

  SPECIAL CARDS:
    Pan    - Needed to cook (goes to your pan supply)
    Night  - When drawn, the leftmost path card decays!

  COOKING:
  You need a pan + 3 or more matching mushrooms.
  Points per mushroom vary by type (Morel=6, Porcini=5, etc.)

  HAND LIMIT: {self.hand_limit} cards maximum.

  GAME END:
  When the deck and path are empty, most points wins!

{'=' * 60}
"""
