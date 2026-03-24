"""Morels - A mushroom foraging card game for 2 players."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Mushroom species: (name, abundance_in_full_deck, cook_points)
SPECIES_FULL = [
    ("Chanterelle", 4, 5),
    ("Morel", 4, 6),
    ("Shiitake", 5, 4),
    ("Porcini", 4, 5),
    ("Hen of Woods", 5, 3),
    ("Oyster", 5, 3),
    ("Tree Ear", 6, 2),
    ("Lawyer's Wig", 6, 2),
    ("Honey Fungus", 7, 1),
    ("Butter", 7, 1),
]

SPECIES_QUICK = [
    ("Chanterelle", 4, 5),
    ("Morel", 4, 6),
    ("Shiitake", 5, 4),
    ("Porcini", 4, 5),
    ("Hen of Woods", 5, 3),
    ("Oyster", 5, 3),
]

# Special cards in deck
PAN_COUNT = 5
NIGHT_CARDS = [
    {"name": "Full Moon", "effect": "draw_two", "description": "Draw 2 cards from deck"},
    {"name": "Rainstorm", "effect": "grow", "description": "All forest mushrooms gain +1 value"},
    {"name": "Basket", "effect": "hand_limit_up", "description": "Increase hand limit by 2"},
]

HAND_LIMIT = 8
FOREST_SIZE = 8


class MorelGame(BaseGame):
    """Morels - a mushroom foraging card game for 2 players."""

    name = "Morels"
    description = "Forage mushrooms from the forest and cook them for points"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (10 mushroom species)",
        "quick": "Quick game (6 species, smaller deck)",
        "expert": "Expert game (10 species, Night cards active)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "quick":
            self.species = [(s[0], s[1], s[2]) for s in SPECIES_QUICK]
        else:
            self.species = [(s[0], s[1], s[2]) for s in SPECIES_FULL]
        self.deck = []
        self.forest = []  # visible cards in the "forest path" (left=free, right=costly)
        self.decay_pile = []  # cards that fell off the left end
        self.hands = {1: [], 2: []}  # each card: {"type":"mushroom"/"pan"/"night", "species":..., "value":...}
        self.pans = {1: 0, 2: 0}  # pans in hand
        self.sticks = {1: 0, 2: 0}  # walking sticks (currency)
        self.cooked = {1: [], 2: []}  # cooked sets: [{"species": name, "count": n, "points": p}]
        self.scores = {1: 0, 2: 0}
        self.hand_limit = {1: HAND_LIMIT, 2: HAND_LIMIT}
        self.log = []

    def _build_deck(self):
        """Build the full deck of cards."""
        self.deck = []
        for name, count, points in self.species:
            for _ in range(count):
                self.deck.append({
                    "type": "mushroom",
                    "species": name,
                    "value": points,
                })
        # Add pans
        for _ in range(PAN_COUNT):
            self.deck.append({"type": "pan", "species": None, "value": 0})
        # Add night cards for expert mode
        if self.variation == "expert":
            for nc in NIGHT_CARDS:
                self.deck.append({
                    "type": "night",
                    "species": nc["name"],
                    "value": 0,
                    "effect": nc["effect"],
                })
        random.shuffle(self.deck)

    def _fill_forest(self):
        """Keep the forest path at FOREST_SIZE visible cards."""
        while len(self.forest) < FOREST_SIZE and self.deck:
            self.forest.append(self.deck.pop())

    def _decay_forest(self):
        """The leftmost card decays (falls off). Called when a card is taken."""
        if self.forest:
            decayed = self.forest.pop(0)
            self.decay_pile.append(decayed)
            # Keep only recent decay
            if len(self.decay_pile) > 4:
                self.decay_pile.pop(0)

    def _card_display(self, card):
        """Short string for a card."""
        if card["type"] == "mushroom":
            return f"{card['species'][:8]}({card['value']})"
        elif card["type"] == "pan":
            return "Pan"
        elif card["type"] == "night":
            return f"Night:{card['species'][:8]}"
        return "?"

    def setup(self):
        self._build_deck()
        self.forest = []
        self.decay_pile = []
        self.hands = {1: [], 2: []}
        self.pans = {1: 0, 2: 0}
        self.sticks = {1: 2, 2: 2}  # start with 2 sticks each
        self.cooked = {1: [], 2: []}
        self.scores = {1: 0, 2: 0}
        self.hand_limit = {1: HAND_LIMIT, 2: HAND_LIMIT}
        self._fill_forest()
        # Deal 3 starting cards to each player
        for _ in range(3):
            for p in [1, 2]:
                if self.deck:
                    card = self.deck.pop()
                    self._add_to_hand(p, card)

    def _add_to_hand(self, player, card):
        """Add a card to player's hand, handling special types."""
        if card["type"] == "pan":
            self.pans[player] += 1
        elif card["type"] == "night":
            self._apply_night(player, card)
        else:
            self.hands[player].append(card)

    def _apply_night(self, player, card):
        """Apply night card effects."""
        effect = card.get("effect", "")
        if effect == "draw_two":
            for _ in range(2):
                if self.deck:
                    c = self.deck.pop()
                    self._add_to_hand(player, c)
            self.log.append(f"Full Moon: {self.players[player - 1]} draws 2 cards!")
        elif effect == "grow":
            for c in self.forest:
                if c["type"] == "mushroom":
                    c["value"] += 1
            self.log.append("Rainstorm: forest mushrooms grow in value!")
        elif effect == "hand_limit_up":
            self.hand_limit[player] += 2
            self.log.append(f"Basket: {self.players[player - 1]}'s hand limit increased!")

    def display(self):
        clear_screen()
        print("=" * 60)
        print("  MORELS - Mushroom Foraging")
        print("=" * 60)
        print(f"  Deck: {len(self.deck)} cards remaining")
        print()

        # Forest display
        print("  The Forest Path (left = free, right = costs sticks):")
        print("  " + "-" * 56)
        line1 = "  "
        line2 = "  "
        for i, card in enumerate(self.forest):
            cost = i  # position 0 is free, position 1 costs 1 stick, etc.
            name = self._card_display(card)
            line1 += f" [{i}]".ljust(13)
            if cost == 0:
                line2 += f" {name[:11]} FREE".ljust(13)
            else:
                line2 += f" {name[:11]} ${cost}".ljust(13)
            if (i + 1) % 4 == 0:
                print(line1)
                print(line2)
                line1 = "  "
                line2 = "  "
        if line1.strip():
            print(line1)
            print(line2)
        print()

        # Decay pile
        if self.decay_pile:
            decay_str = ", ".join(self._card_display(c) for c in self.decay_pile[-3:])
            print(f"  Decay pile: {decay_str}")
            print()

        # Player info
        p = self.current_player
        print(f"  --- {self.players[p - 1]}'s Turn ---")
        print(f"  Score: {self.scores[p]}  |  Sticks: {self.sticks[p]}  |  Pans: {self.pans[p]}")
        print(f"  Hand ({len(self.hands[p])}/{self.hand_limit[p]}):")

        # Group mushrooms by species
        species_count = {}
        for card in self.hands[p]:
            sp = card["species"]
            if sp not in species_count:
                species_count[sp] = {"count": 0, "value": card["value"]}
            species_count[sp]["count"] += 1

        if species_count:
            for sp, info in sorted(species_count.items()):
                print(f"    {sp}: {info['count']} cards (value {info['value']} each)")
        else:
            print("    (empty)")
        print()

        # Cooked sets
        if self.cooked[p]:
            print(f"  Cooked dishes:")
            for dish in self.cooked[p]:
                print(f"    {dish['species']} x{dish['count']} = {dish['points']} pts")
            print()

        # Opponent summary
        o = 2 if p == 1 else 1
        print(f"  {self.players[o - 1]}: Score {self.scores[o]}, "
              f"Hand {len(self.hands[o])}, Sticks {self.sticks[o]}, "
              f"Pans {self.pans[o]}")
        print()

        # Log
        if self.log:
            for entry in self.log[-4:]:
                print(f"  {entry}")
            print()

    def get_move(self):
        print("  Actions:")
        print("    take N       - Take card at position N from forest (0=free)")
        print("    decay        - Take all decay pile cards")
        print("    cook SPECIES - Cook 3+ matching mushrooms (need a pan)")
        print("    sell SPECIES N - Sell N mushrooms for sticks (2 sticks each)")
        move = input_with_quit("  > ").strip()
        return move

    def make_move(self, move):
        p = self.current_player
        parts = move.split()
        if not parts:
            return False

        action = parts[0].lower()

        if action == "take" and len(parts) >= 2:
            try:
                idx = int(parts[1])
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.forest):
                return False
            # Check cost (sticks needed = position index)
            cost = idx
            if cost > self.sticks[p]:
                print(f"  Need {cost} sticks, have {self.sticks[p]}!")
                input("  Press Enter...")
                return False
            # Check hand limit
            if len(self.hands[p]) >= self.hand_limit[p] and self.forest[idx]["type"] == "mushroom":
                print(f"  Hand full ({self.hand_limit[p]} cards)! Cook or sell first.")
                input("  Press Enter...")
                return False

            self.sticks[p] -= cost
            card = self.forest.pop(idx)
            self._add_to_hand(p, card)
            self.log.append(f"{self.players[p - 1]} takes {self._card_display(card)} (cost {cost})")

            # Decay + refill
            self._decay_forest()
            self._fill_forest()
            return True

        elif action == "decay":
            if not self.decay_pile:
                print("  Decay pile is empty!")
                input("  Press Enter...")
                return False
            mushrooms_in_decay = [c for c in self.decay_pile if c["type"] == "mushroom"]
            space = self.hand_limit[p] - len(self.hands[p])
            taken = 0
            for card in self.decay_pile[:]:
                if card["type"] == "mushroom" and space > 0:
                    self.hands[p].append(card)
                    self.decay_pile.remove(card)
                    space -= 1
                    taken += 1
                elif card["type"] == "pan":
                    self.pans[p] += 1
                    self.decay_pile.remove(card)
                    taken += 1
            self.log.append(f"{self.players[p - 1]} takes {taken} cards from decay pile")
            return True

        elif action == "cook" and len(parts) >= 2:
            species_name = " ".join(parts[1:]).strip()
            # Find matching species (case-insensitive partial match)
            matching_species = None
            for sp_name, _, _ in self.species:
                if sp_name.lower().startswith(species_name.lower()):
                    matching_species = sp_name
                    break
            if not matching_species:
                print(f"  Unknown species: {species_name}")
                input("  Press Enter...")
                return False
            # Count matching cards in hand
            matching = [c for c in self.hands[p] if c["species"] == matching_species]
            if len(matching) < 3:
                print(f"  Need at least 3 {matching_species} to cook (have {len(matching)})!")
                input("  Press Enter...")
                return False
            if self.pans[p] < 1:
                print("  Need a pan to cook! Find one in the forest.")
                input("  Press Enter...")
                return False

            # Cook all matching
            self.pans[p] -= 1
            for c in matching:
                self.hands[p].remove(c)
            points = sum(c["value"] for c in matching) * 2  # cooking doubles value
            self.scores[p] += points
            self.cooked[p].append({
                "species": matching_species,
                "count": len(matching),
                "points": points,
            })
            self.log.append(f"{self.players[p - 1]} cooks {len(matching)} {matching_species} for {points} pts!")
            return True

        elif action == "sell" and len(parts) >= 3:
            species_name = parts[1]
            try:
                count = int(parts[2])
            except ValueError:
                return False
            # Find matching species
            matching_species = None
            for sp_name, _, _ in self.species:
                if sp_name.lower().startswith(species_name.lower()):
                    matching_species = sp_name
                    break
            if not matching_species:
                print(f"  Unknown species: {species_name}")
                input("  Press Enter...")
                return False
            matching = [c for c in self.hands[p] if c["species"] == matching_species]
            if len(matching) < count or count < 1:
                print(f"  Can't sell {count} {matching_species} (have {len(matching)})!")
                input("  Press Enter...")
                return False
            # Sell: remove cards, gain 2 sticks per card
            for c in matching[:count]:
                self.hands[p].remove(c)
            gained = count * 2
            self.sticks[p] += gained
            self.log.append(f"{self.players[p - 1]} sells {count} {matching_species} for {gained} sticks")
            return True

        return False

    def check_game_over(self):
        if not self.deck and not self.forest:
            self.game_over = True
            # Final scoring: remaining mushrooms in hand worth face value
            for p in [1, 2]:
                for c in self.hands[p]:
                    if c["type"] == "mushroom":
                        self.scores[p] += c["value"]
            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "deck": self.deck,
            "forest": self.forest,
            "decay_pile": self.decay_pile,
            "hands": {str(k): v for k, v in self.hands.items()},
            "pans": {str(k): v for k, v in self.pans.items()},
            "sticks": {str(k): v for k, v in self.sticks.items()},
            "cooked": {str(k): v for k, v in self.cooked.items()},
            "scores": {str(k): v for k, v in self.scores.items()},
            "hand_limit": {str(k): v for k, v in self.hand_limit.items()},
            "log": self.log[-20:],
        }

    def load_state(self, state):
        self.deck = state["deck"]
        self.forest = state["forest"]
        self.decay_pile = state["decay_pile"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.pans = {int(k): v for k, v in state["pans"].items()}
        self.sticks = {int(k): v for k, v in state["sticks"].items()}
        self.cooked = {int(k): v for k, v in state["cooked"].items()}
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.hand_limit = {int(k): v for k, v in state["hand_limit"].items()}
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  MORELS - Tutorial
==================================================

  OVERVIEW:
  Morels is a mushroom foraging card game for 2 players.
  Collect mushrooms from the forest path, then cook them
  in sets of 3+ for big points.

  THE FOREST:
  8 cards are visible in the forest path. The leftmost
  card (position 0) is FREE to take. Cards further right
  cost walking sticks to skip to (cost = position number).

  Cards that fall off the left end go to the DECAY pile,
  which you can pick up on your turn.

  YOUR TURN (pick one action):
  1. TAKE: Pick a card from the forest.
     'take 0' = free, 'take 3' = costs 3 sticks
  2. DECAY: Take all cards from the decay pile.
  3. COOK: Cook 3+ matching mushrooms. Needs a PAN.
     Cooking doubles the mushroom values!
     'cook Morel' (cooks all Morels in hand)
  4. SELL: Sell mushrooms for walking sticks.
     Each mushroom sold = 2 sticks.
     'sell Morel 2' (sells 2 Morels)

  SPECIAL CARDS:
  - Pans: Required for cooking. Find them in the forest.
  - Night cards (expert mode): Special events.

  SCORING:
  - Cooked mushrooms = face value x 2
  - Uncooked mushrooms at game end = face value only

  MUSHROOM VALUES (standard):
  Morel(6), Chanterelle(5), Porcini(5), Shiitake(4),
  Hen of Woods(3), Oyster(3), Tree Ear(2),
  Lawyer's Wig(2), Honey Fungus(1), Butter(1)

  COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
==================================================
"""
