"""Herbaceous - A set collection herb garden game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

ALL_HERBS = ["Chive", "Mint", "Thyme", "Lavender", "Tarragon", "Rosemary", "Sage", "Bay"]
QUICK_HERBS = ["Chive", "Mint", "Thyme", "Lavender", "Tarragon", "Rosemary"]

HERB_SHORT = {
    "Chive": "Chv", "Mint": "Mnt", "Thyme": "Thy", "Lavender": "Lav",
    "Tarragon": "Tar", "Rosemary": "Ros", "Sage": "Sag", "Bay": "Bay",
    "Special": "Spc",
}

# Special herbs that count as any type for certain purposes
SPECIAL_HERBS = ["Angelica", "Dill", "Saffron"]

# Container types and their rules
CONTAINERS = {
    "Large Pot": {
        "desc": "Any herbs (score all cards placed)",
        "rule": "any",
        "min": 1,
    },
    "Wooden Planter": {
        "desc": "Matching pairs only (2+ of same herb)",
        "rule": "pairs",
        "min": 2,
    },
    "Glass Jar": {
        "desc": "One of each type (all different herbs)",
        "rule": "all_different",
        "min": 1,
    },
    "Small Pot": {
        "desc": "At least 3 herbs of any combination",
        "rule": "at_least_3",
        "min": 3,
    },
}


class HerbaceousGame(BaseGame):
    """Herbaceous herb garden game implementation."""

    name = "Herbaceous"
    description = "Set collection herb garden - plant herbs into containers for points"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game - 8 herb types",
        "quick": "Quick game - 6 herb types",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.herbs = QUICK_HERBS if self.variation == "quick" else ALL_HERBS
        self.deck = []
        # Personal gardens (private collection areas)
        self.gardens = {1: [], 2: []}
        # Community garden (shared, both can plant from here)
        self.community = []
        # Containers: each player has 4, each can be used once
        # {container_name: list of herbs planted or None if unused}
        self.containers = {
            1: {"Large Pot": None, "Wooden Planter": None,
                "Glass Jar": None, "Small Pot": None},
            2: {"Large Pot": None, "Wooden Planter": None,
                "Glass Jar": None, "Small Pot": None},
        }
        self.drawn_cards = []  # Cards drawn this turn (up to 2)
        self.phase = "draw"  # "draw", "place", "plant_option"
        self.log = []
        self.cards_placed_this_turn = 0

    def setup(self):
        self.deck = []
        # Add regular herbs: 3 of each type
        herbs_per_type = 3
        for herb in self.herbs:
            for _ in range(herbs_per_type):
                self.deck.append({"name": herb, "special": False})
        # Add special herbs (2 in standard, 1 in quick)
        num_specials = 1 if self.variation == "quick" else 2
        for i in range(num_specials):
            special_name = SPECIAL_HERBS[i % len(SPECIAL_HERBS)]
            self.deck.append({"name": special_name, "special": True})

        random.shuffle(self.deck)

        self.gardens = {1: [], 2: []}
        self.community = []
        self.containers = {
            1: {"Large Pot": None, "Wooden Planter": None,
                "Glass Jar": None, "Small Pot": None},
            2: {"Large Pot": None, "Wooden Planter": None,
                "Glass Jar": None, "Small Pot": None},
        }
        self.drawn_cards = []
        self.phase = "draw"
        self.log = []
        self.cards_placed_this_turn = 0

    def display(self):
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print(f"{'=' * 60}")
        print(f"  HERBACEOUS - {self.players[0]} vs {self.players[1]}")
        print(f"  Deck: {len(self.deck)} herbs remaining")
        print(f"{'=' * 60}")

        # Community garden
        print(f"\n  Community Garden:")
        if self.community:
            for i, h in enumerate(self.community):
                tag = " *" if h["special"] else ""
                print(f"    [{i + 1}] {h['name']}{tag}", end="")
            print()
        else:
            print(f"    (empty)")

        # Opponent info
        print(f"\n  {self.players[opp - 1]}'s Garden: {len(self.gardens[opp])} herbs")
        print(f"  {self.players[opp - 1]}'s Containers:")
        for cname, planted in self.containers[opp].items():
            if planted is not None:
                herbs_str = ", ".join(h["name"] for h in planted)
                pts = self._score_container(planted, cname)
                print(f"    {cname}: [{herbs_str}] = {pts} pts")
            else:
                print(f"    {cname}: (available)")

        # Current player info
        print(f"\n  --- YOUR INFO ({self.players[p - 1]}) ---")
        print(f"  Your Garden:")
        if self.gardens[p]:
            for i, h in enumerate(self.gardens[p]):
                tag = " *" if h["special"] else ""
                print(f"    [{i + 1}] {h['name']}{tag}")
        else:
            print(f"    (empty)")

        print(f"  Your Containers:")
        for cname, planted in self.containers[p].items():
            if planted is not None:
                herbs_str = ", ".join(h["name"] for h in planted)
                pts = self._score_container(planted, cname)
                print(f"    {cname}: [{herbs_str}] = {pts} pts")
            else:
                desc = CONTAINERS[cname]["desc"]
                print(f"    {cname}: (available) - {desc}")

        # Scores
        s1 = self._total_score(1)
        s2 = self._total_score(2)
        print(f"\n  Scores: {self.players[0]}={s1}  {self.players[1]}={s2}")

        # Phase info
        if self.phase == "draw":
            print(f"\n  Phase: Draw and place herbs")
        elif self.phase == "place":
            print(f"\n  Phase: Place drawn herb")
            if self.drawn_cards:
                print(f"  Drawn: {self.drawn_cards[0]['name']}")
        elif self.phase == "plant_option":
            print(f"\n  Phase: Optionally plant herbs into a container")

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def _score_container(self, herbs, container_name):
        """Score a planted container."""
        if not herbs:
            return 0
        rule = CONTAINERS[container_name]["rule"]

        if rule == "any":
            # 1 point per herb
            return len(herbs)
        elif rule == "pairs":
            # 2 points per pair
            counts = {}
            for h in herbs:
                counts[h["name"]] = counts.get(h["name"], 0) + 1
            pairs = sum(c // 2 for c in counts.values())
            return pairs * 3
        elif rule == "all_different":
            # 2 points per unique herb type
            unique = len(set(h["name"] for h in herbs))
            return unique * 2
        elif rule == "at_least_3":
            # 2 points per herb if at least 3
            if len(herbs) >= 3:
                return len(herbs) * 2
            return 0
        return 0

    def _total_score(self, player):
        total = 0
        for cname, planted in self.containers[player].items():
            if planted is not None:
                total += self._score_container(planted, cname)
        return total

    def get_move(self):
        p = self.current_player

        if self.phase == "draw":
            return self._get_draw_move(p)
        elif self.phase == "place":
            return self._get_place_move(p)
        elif self.phase == "plant_option":
            return self._get_plant_move(p)
        return "pass"

    def _get_draw_move(self, player):
        """Draw a card and decide where to place it."""
        if not self.deck:
            return {"action": "skip_draw"}

        # Draw a card
        card = self.deck.pop()
        print(f"  You drew: {card['name']}{'(special)' if card['special'] else ''}")
        print(f"  Place it in:")
        print(f"    [G] Your personal garden")
        print(f"    [C] Community garden")

        while True:
            choice = input_with_quit("  Where to place? (G/C): ").strip().upper()
            if choice in ('G', 'GARDEN'):
                return {"action": "draw_place", "card": card, "destination": "garden"}
            elif choice in ('C', 'COMMUNITY'):
                return {"action": "draw_place", "card": card, "destination": "community"}
            print("  Choose G or C.")

    def _get_place_move(self, player):
        """Place the second drawn card."""
        if not self.deck:
            return {"action": "skip_draw"}

        card = self.deck.pop()
        self.drawn_cards = [card]
        print(f"  Second card drawn: {card['name']}{'(special)' if card['special'] else ''}")

        # Second card goes to the other destination
        # Or player can choose
        print(f"  Place it in:")
        print(f"    [G] Your personal garden")
        print(f"    [C] Community garden")

        while True:
            choice = input_with_quit("  Where to place? (G/C): ").strip().upper()
            if choice in ('G', 'GARDEN'):
                return {"action": "draw_place", "card": card, "destination": "garden"}
            elif choice in ('C', 'COMMUNITY'):
                return {"action": "draw_place", "card": card, "destination": "community"}
            print("  Choose G or C.")

    def _get_plant_move(self, player):
        """Optionally plant herbs from garden/community into a container."""
        available_containers = [c for c, v in self.containers[player].items() if v is None]

        if not available_containers:
            print("  All containers are full. Skipping plant phase.")
            return {"action": "skip_plant"}

        garden = self.gardens[player]
        if not garden and not self.community:
            print("  No herbs available to plant. Skipping.")
            return {"action": "skip_plant"}

        print("  Would you like to plant herbs into a container?")
        print("  Available containers:")
        for i, cname in enumerate(available_containers):
            desc = CONTAINERS[cname]["desc"]
            print(f"    [{i + 1}] {cname} - {desc}")
        print(f"    [0] Skip planting")

        while True:
            raw = input_with_quit("  Choose container (0 to skip): ")
            try:
                ci = int(raw.strip())
            except ValueError:
                print("  Enter a number.")
                continue
            if ci == 0:
                return {"action": "skip_plant"}
            if ci < 1 or ci > len(available_containers):
                print(f"  Choose 0-{len(available_containers)}.")
                continue

            container_name = available_containers[ci - 1]
            return self._select_herbs_for_container(player, container_name)

    def _select_herbs_for_container(self, player, container_name):
        """Let player select herbs from garden and community for a container."""
        rule = CONTAINERS[container_name]["rule"]
        garden = self.gardens[player]
        community = self.community

        print(f"\n  Planting into {container_name} ({CONTAINERS[container_name]['desc']})")
        print(f"  Select herbs to plant. Sources:")

        all_available = []
        print(f"  From your garden:")
        for i, h in enumerate(garden):
            tag = " *" if h["special"] else ""
            print(f"    [G{i + 1}] {h['name']}{tag}")
            all_available.append(("garden", i, h))

        print(f"  From community garden:")
        for i, h in enumerate(community):
            tag = " *" if h["special"] else ""
            print(f"    [C{i + 1}] {h['name']}{tag}")
            all_available.append(("community", i, h))

        selected = []
        selected_indices = []
        print(f"\n  Type herb codes (e.g., 'G1 C2 G3') or 'done' to confirm, 'cancel' to go back:")

        while True:
            raw = input_with_quit("  Select herbs: ").strip()
            if raw.lower() == 'cancel':
                return self._get_plant_move(player)
            if raw.lower() == 'done':
                if not selected:
                    print("  No herbs selected. Type 'cancel' to go back.")
                    continue
                # Validate against container rules
                if not self._validate_container(selected, container_name):
                    print(f"  Invalid selection for {container_name}. Try again.")
                    selected = []
                    selected_indices = []
                    continue
                break

            parts = raw.upper().split()
            selected = []
            selected_indices = []
            valid = True
            for part in parts:
                if part.startswith('G') and len(part) > 1:
                    try:
                        idx = int(part[1:]) - 1
                        if 0 <= idx < len(garden):
                            selected.append(garden[idx])
                            selected_indices.append(("garden", idx))
                        else:
                            print(f"  Invalid: {part}")
                            valid = False
                            break
                    except ValueError:
                        print(f"  Invalid: {part}")
                        valid = False
                        break
                elif part.startswith('C') and len(part) > 1:
                    try:
                        idx = int(part[1:]) - 1
                        if 0 <= idx < len(community):
                            selected.append(community[idx])
                            selected_indices.append(("community", idx))
                        else:
                            print(f"  Invalid: {part}")
                            valid = False
                            break
                    except ValueError:
                        print(f"  Invalid: {part}")
                        valid = False
                        break
                else:
                    print(f"  Invalid: {part}. Use G# or C#.")
                    valid = False
                    break

            if valid and selected:
                sel_str = ", ".join(h["name"] for h in selected)
                print(f"  Selected: {sel_str}")
                print(f"  Type 'done' to confirm or select again.")

        return {
            "action": "plant",
            "container": container_name,
            "herbs": selected,
            "indices": selected_indices,
        }

    def _validate_container(self, herbs, container_name):
        """Check if herbs are valid for the container."""
        rule = CONTAINERS[container_name]["rule"]
        min_count = CONTAINERS[container_name]["min"]

        if len(herbs) < min_count:
            return False

        if rule == "any":
            return len(herbs) >= 1
        elif rule == "pairs":
            # Must have at least one pair
            counts = {}
            for h in herbs:
                counts[h["name"]] = counts.get(h["name"], 0) + 1
            return any(c >= 2 for c in counts.values())
        elif rule == "all_different":
            names = [h["name"] for h in herbs]
            return len(names) == len(set(names))
        elif rule == "at_least_3":
            return len(herbs) >= 3
        return True

    def make_move(self, move):
        p = self.current_player
        action = move["action"]

        if action == "skip_draw":
            self.phase = "plant_option"
            return True

        if action == "draw_place":
            card = move["card"]
            dest = move["destination"]
            if dest == "garden":
                self.gardens[p].append(card)
                self.log.append(f"{self.players[p - 1]} placed {card['name']} in personal garden")
            else:
                self.community.append(card)
                self.log.append(f"{self.players[p - 1]} placed {card['name']} in community garden")

            self.cards_placed_this_turn += 1
            if self.cards_placed_this_turn >= 2:
                self.phase = "plant_option"
                self.cards_placed_this_turn = 0
            else:
                self.phase = "place"
            return True

        if action == "skip_plant":
            self.phase = "draw"
            self.cards_placed_this_turn = 0
            return True

        if action == "plant":
            container_name = move["container"]
            herbs = move["herbs"]
            indices = move["indices"]

            # Remove herbs from sources (reverse order to preserve indices)
            garden_removes = sorted([idx for src, idx in indices if src == "garden"], reverse=True)
            community_removes = sorted([idx for src, idx in indices if src == "community"], reverse=True)

            for idx in garden_removes:
                if idx < len(self.gardens[p]):
                    self.gardens[p].pop(idx)
            for idx in community_removes:
                if idx < len(self.community):
                    self.community.pop(idx)

            self.containers[p][container_name] = herbs
            pts = self._score_container(herbs, container_name)
            herbs_str = ", ".join(h["name"] for h in herbs)
            self.log.append(f"{self.players[p - 1]} planted [{herbs_str}] in {container_name} = {pts} pts")

            self.phase = "draw"
            self.cards_placed_this_turn = 0
            return True

        return False

    def switch_player(self):
        """Only switch when the full turn cycle is done."""
        if self.phase == "draw":
            self.current_player = 2 if self.current_player == 1 else 1

    def check_game_over(self):
        # Game ends when deck is empty and current turn cycle completes
        if not self.deck and self.phase == "draw":
            self.game_over = True
            s1 = self._total_score(1)
            s2 = self._total_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "herbs": self.herbs,
            "deck": self.deck,
            "gardens": {"1": self.gardens[1], "2": self.gardens[2]},
            "community": self.community,
            "containers": {
                "1": {k: v for k, v in self.containers[1].items()},
                "2": {k: v for k, v in self.containers[2].items()},
            },
            "phase": self.phase,
            "cards_placed_this_turn": self.cards_placed_this_turn,
            "log": self.log[-10:],
        }

    def load_state(self, state):
        self.herbs = state["herbs"]
        self.deck = state["deck"]
        self.gardens = {1: state["gardens"]["1"], 2: state["gardens"]["2"]}
        self.community = state["community"]
        self.containers = {
            1: state["containers"]["1"],
            2: state["containers"]["2"],
        }
        self.phase = state.get("phase", "draw")
        self.cards_placed_this_turn = state.get("cards_placed_this_turn", 0)
        self.log = state.get("log", [])

    def get_tutorial(self):
        herb_list = ", ".join(self.herbs)
        return f"""
{'=' * 60}
  HERBACEOUS - Tutorial
{'=' * 60}

  OBJECTIVE:
  Score the most points by planting herbs into containers.

  HERB TYPES: {herb_list}
  Plus special herbs that add variety.

  EACH TURN:
  1. DRAW & PLACE: Draw 2 herbs one at a time. For each,
     choose to place in your personal garden [G] or the
     shared community garden [C].
  2. PLANT (optional): Place herbs from your garden and/or
     the community garden into one of your 4 containers.

  CONTAINERS (each used only ONCE):
    Large Pot      - Any herbs (1 point each)
    Wooden Planter - Matching pairs (3 points per pair)
    Glass Jar      - All different herbs (2 points each)
    Small Pot      - At least 3 herbs (2 points each)

  STRATEGY:
  - Community garden herbs can be taken by either player!
  - Each container can only be planted once, so timing
    matters.
  - Special herbs add versatility to your collections.

  GAME END:
  When the deck runs out, the player with the most points
  from their planted containers wins!

{'=' * 60}
"""
