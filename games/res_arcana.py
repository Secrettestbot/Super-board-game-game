"""Res Arcana - An engine-building card game with magical artifacts."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Essence types
ESSENCES = ["elan", "life", "death", "calm", "gold"]
ESSENCE_SYMBOLS = {
    "elan": "E",
    "life": "L",
    "death": "D",
    "calm": "C",
    "gold": "G",
}

# Artifact definitions: name, cost (essences), points, ability description, ability type
ARTIFACT_POOL = [
    {"name": "Fire Dragon", "cost": {"elan": 2, "death": 1}, "points": 2,
     "ability": "Tap: gain 1 elan, 1 gold", "tap_gain": {"elan": 1, "gold": 1}},
    {"name": "Cursed Skull", "cost": {"death": 2}, "points": 1,
     "ability": "Tap: gain 2 death", "tap_gain": {"death": 2}},
    {"name": "Windup Man", "cost": {"elan": 1, "calm": 1}, "points": 1,
     "ability": "Tap: gain 1 elan, 1 calm", "tap_gain": {"elan": 1, "calm": 1}},
    {"name": "Philosopher Stone", "cost": {"gold": 3}, "points": 2,
     "ability": "Tap: gain 2 gold", "tap_gain": {"gold": 2}},
    {"name": "Celestial Horse", "cost": {"calm": 2, "life": 1}, "points": 2,
     "ability": "Tap: gain 1 life, 1 gold", "tap_gain": {"life": 1, "gold": 1}},
    {"name": "Sacrificial Dagger", "cost": {"death": 1, "elan": 1}, "points": 1,
     "ability": "Tap: gain 1 death, 1 gold", "tap_gain": {"death": 1, "gold": 1}},
    {"name": "Tree of Life", "cost": {"life": 3}, "points": 2,
     "ability": "Tap: gain 2 life", "tap_gain": {"life": 2}},
    {"name": "Dancing Sword", "cost": {"elan": 2}, "points": 1,
     "ability": "Tap: gain 2 elan", "tap_gain": {"elan": 2}},
    {"name": "Crystal Ball", "cost": {"calm": 2}, "points": 1,
     "ability": "Tap: gain 2 calm", "tap_gain": {"calm": 2}},
    {"name": "Vault", "cost": {"gold": 2}, "points": 1,
     "ability": "Tap: gain 1 gold, 1 any", "tap_gain": {"gold": 2}},
    {"name": "Hawk", "cost": {"life": 1, "elan": 1}, "points": 1,
     "ability": "Tap: gain 1 elan, 1 life", "tap_gain": {"elan": 1, "life": 1}},
    {"name": "Reanimate", "cost": {"death": 2, "calm": 1}, "points": 2,
     "ability": "Tap: gain 1 death, 1 calm", "tap_gain": {"death": 1, "calm": 1}},
    {"name": "Gold Ingot", "cost": {"gold": 1}, "points": 0,
     "ability": "Tap: gain 1 gold", "tap_gain": {"gold": 1}},
    {"name": "Corruption", "cost": {"death": 1}, "points": 0,
     "ability": "Tap: gain 1 death, 1 elan", "tap_gain": {"death": 1, "elan": 1}},
    {"name": "Healing Salve", "cost": {"life": 2, "calm": 1}, "points": 2,
     "ability": "Tap: gain 1 life, 1 calm", "tap_gain": {"life": 1, "calm": 1}},
    {"name": "Storm Elemental", "cost": {"elan": 3}, "points": 2,
     "ability": "Tap: gain 2 elan, 1 gold", "tap_gain": {"elan": 2, "gold": 1}},
]

# Places of Power: name, cost to claim, points, ability
PLACES_OF_POWER = [
    {"name": "Alchemist's Tower", "claim_cost": {"gold": 4},
     "points": 3, "ability": "Tap: gain 1 gold",
     "tap_gain": {"gold": 1}},
    {"name": "Cursed Forge", "claim_cost": {"death": 3, "elan": 1},
     "points": 3, "ability": "Tap: gain 1 death",
     "tap_gain": {"death": 1}},
    {"name": "Sacred Grove", "claim_cost": {"life": 3, "calm": 1},
     "points": 3, "ability": "Tap: gain 1 life",
     "tap_gain": {"life": 1}},
    {"name": "Coral Castle", "claim_cost": {"calm": 4},
     "points": 3, "ability": "Tap: gain 1 calm",
     "tap_gain": {"calm": 1}},
    {"name": "Dragon Lair", "claim_cost": {"elan": 3, "gold": 2},
     "points": 4, "ability": "Tap: gain 1 elan",
     "tap_gain": {"elan": 1}},
    {"name": "Sunken Reef", "claim_cost": {"life": 2, "gold": 2},
     "points": 3, "ability": "Tap: gain 1 life",
     "tap_gain": {"life": 1}},
]

# Monuments: name, cost to claim, points
MONUMENTS = [
    {"name": "Obelisk", "claim_cost": {"gold": 4}, "points": 3},
    {"name": "Colossus", "claim_cost": {"gold": 5}, "points": 4},
    {"name": "Hanging Gardens", "claim_cost": {"gold": 6}, "points": 5},
    {"name": "Great Pyramid", "claim_cost": {"gold": 8}, "points": 7},
]


def _copy_dict(d):
    return {k: v for k, v in d.items()}


def _copy_card(card):
    return {k: (_copy_dict(v) if isinstance(v, dict) else v) for k, v in card.items()}


class ResArcanaGame(BaseGame):
    """Res Arcana: Build an engine of magical artifacts and claim victory."""

    name = "Res Arcana"
    description = "An engine-building card game with magical artifacts"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (first to 10 points)",
        "quick": "Quick game (first to 7 points, 6-card decks)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.target_points = 10
        self.essences = [{}, {}]  # per-player essence pools
        self.decks = [[], []]  # per-player draw decks
        self.hands = [[], []]  # per-player hands
        self.tableaus = [[], []]  # per-player played artifacts
        self.tapped = [set(), set()]  # indices of tapped artifacts per player
        self.places = [[], []]  # claimed places of power per player
        self.tapped_places = [set(), set()]
        self.monuments_owned = [[], []]  # claimed monuments per player
        self.available_places = []
        self.available_monuments = []
        self.round_number = 0
        self.passed = [False, False]
        self.scores = [0, 0]

    def setup(self):
        quick = self.variation == "quick"
        self.target_points = 7 if quick else 10
        deck_size = 6 if quick else 8

        # Initialize essences - each player starts with 1 of each basic essence
        for p in range(2):
            self.essences[p] = {e: 1 for e in ESSENCES}

        # Deal artifact decks
        pool = [_copy_card(c) for c in ARTIFACT_POOL]
        random.shuffle(pool)
        self.decks[0] = pool[:deck_size]
        self.decks[1] = pool[deck_size:deck_size * 2]

        # Draw starting hands (3 cards)
        for p in range(2):
            self.hands[p] = self.decks[p][:3]
            self.decks[p] = self.decks[p][3:]

        self.tableaus = [[], []]
        self.tapped = [set(), set()]
        self.places = [[], []]
        self.tapped_places = [set(), set()]
        self.monuments_owned = [[], []]

        # Set up available places and monuments
        places_pool = [_copy_card(p) for p in PLACES_OF_POWER]
        random.shuffle(places_pool)
        num_places = 3 if quick else 4
        self.available_places = places_pool[:num_places]

        self.available_monuments = [_copy_card(m) for m in MONUMENTS]
        if quick:
            self.available_monuments = self.available_monuments[:3]

        self.round_number = 1
        self.passed = [False, False]
        self._calc_scores()

    def _calc_scores(self):
        for p in range(2):
            total = 0
            for card in self.tableaus[p]:
                total += card.get("points", 0)
            for place in self.places[p]:
                total += place.get("points", 0)
            for mon in self.monuments_owned[p]:
                total += mon.get("points", 0)
            self.scores[p] = total

    def _essence_str(self, ess):
        parts = []
        for e in ESSENCES:
            v = ess.get(e, 0)
            if v > 0:
                parts.append(f"{ESSENCE_SYMBOLS[e]}:{v}")
        return " ".join(parts) if parts else "(none)"

    def _cost_str(self, cost):
        parts = []
        for e in ESSENCES:
            v = cost.get(e, 0)
            if v > 0:
                parts.append(f"{ESSENCE_SYMBOLS[e]}:{v}")
        return " ".join(parts) if parts else "free"

    def _can_pay(self, player, cost):
        for e in ESSENCES:
            if cost.get(e, 0) > self.essences[player].get(e, 0):
                return False
        return True

    def _pay_cost(self, player, cost):
        for e in ESSENCES:
            self.essences[player][e] = self.essences[player].get(e, 0) - cost.get(e, 0)

    def display(self):
        mode = "Standard" if self.variation != "quick" else "Quick"
        print(f"\n  === Res Arcana ({mode}) === Round {self.round_number}")
        print(f"  Target: {self.target_points} points")
        print(f"  {self.players[0]}: {self.scores[0]} pts  |  "
              f"{self.players[1]}: {self.scores[1]} pts")
        print(f"  Current turn: {self.players[self.current_player - 1]}")

        # Available places of power
        print("\n  --- Places of Power (unclaimed) ---")
        if not self.available_places:
            print("    (none)")
        for i, place in enumerate(self.available_places):
            print(f"    [{i + 1}] {place['name']} ({place['points']}pts) "
                  f"cost: {self._cost_str(place['claim_cost'])} | {place['ability']}")

        # Available monuments
        print("\n  --- Monuments (unclaimed) ---")
        if not self.available_monuments:
            print("    (none)")
        for i, mon in enumerate(self.available_monuments):
            print(f"    [{i + 1}] {mon['name']} ({mon['points']}pts) "
                  f"cost: {self._cost_str(mon['claim_cost'])}")

        # Both players
        for p in range(2):
            marker = " <<" if p == self.current_player - 1 else ""
            passed = " [PASSED]" if self.passed[p] else ""
            print(f"\n  --- {self.players[p]} (P{p + 1}) --- "
                  f"{self.scores[p]} pts{passed}{marker}")
            print(f"  Essences: {self._essence_str(self.essences[p])}")
            print(f"  Hand ({len(self.hands[p])}): ", end="")
            if p == self.current_player - 1:
                if self.hands[p]:
                    for i, card in enumerate(self.hands[p]):
                        print(f"[{i + 1}]{card['name']}({self._cost_str(card['cost'])}|"
                              f"{card['points']}pts) ", end="")
                    print()
                else:
                    print("(empty)")
            else:
                print(f"{len(self.hands[p])} cards")
            print(f"  Deck: {len(self.decks[p])} cards remaining")

            # Tableau
            print(f"  Tableau:")
            if not self.tableaus[p]:
                print("    (empty)")
            for i, card in enumerate(self.tableaus[p]):
                tapped = " [TAPPED]" if i in self.tapped[p] else ""
                print(f"    [{i + 1}] {card['name']} ({card['points']}pts) "
                      f"| {card['ability']}{tapped}")

            # Claimed places
            if self.places[p]:
                print(f"  Places of Power:")
                for i, place in enumerate(self.places[p]):
                    tapped = " [TAPPED]" if i in self.tapped_places[p] else ""
                    print(f"    [{i + 1}] {place['name']} ({place['points']}pts) "
                          f"| {place['ability']}{tapped}")

            # Claimed monuments
            if self.monuments_owned[p]:
                print(f"  Monuments:")
                for mon in self.monuments_owned[p]:
                    print(f"    {mon['name']} ({mon['points']}pts)")

    def get_move(self):
        p = self.current_player - 1
        print(f"\n  {self.players[p]}, choose an action:")
        print("    play N         - play artifact N from hand")
        print("    tap N          - tap artifact N for its ability")
        print("    tapplace N     - tap place of power N")
        print("    claim place N  - claim place of power N")
        print("    claim mon N    - claim monument N")
        print("    draw           - draw 1 card from your deck")
        print("    convert E1 E2  - convert 2 of essence E1 to 1 of E2")
        print("    pass           - pass (done for this round)")
        print("  Essences: E=elan L=life D=death C=calm G=gold")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def _symbol_to_essence(self, sym):
        sym = sym.upper()
        for e, s in ESSENCE_SYMBOLS.items():
            if s == sym:
                return e
        return None

    def make_move(self, move):
        p = self.current_player - 1
        parts = move.strip().split()
        if not parts:
            return False

        action = parts[0].lower()

        # --- Pass ---
        if action == "pass":
            self.passed[p] = True
            # Check if both passed - new round
            if all(self.passed):
                self._new_round()
            return True

        if self.passed[p]:
            print("  You have already passed this round.")
            return False

        # --- Play artifact from hand ---
        if action == "play":
            if len(parts) != 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.hands[p]):
                print("  Invalid card number.")
                return False
            card = self.hands[p][idx]
            if not self._can_pay(p, card["cost"]):
                print(f"  Cannot afford {card['name']}. "
                      f"Need: {self._cost_str(card['cost'])}")
                return False
            self._pay_cost(p, card["cost"])
            self.tableaus[p].append(self.hands[p].pop(idx))
            self._calc_scores()
            return True

        # --- Tap artifact ---
        if action == "tap":
            if len(parts) != 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.tableaus[p]):
                print("  Invalid artifact number.")
                return False
            if idx in self.tapped[p]:
                print("  That artifact is already tapped.")
                return False
            card = self.tableaus[p][idx]
            gain = card.get("tap_gain", {})
            for e, v in gain.items():
                self.essences[p][e] = self.essences[p].get(e, 0) + v
            self.tapped[p].add(idx)
            return True

        # --- Tap place of power ---
        if action == "tapplace":
            if len(parts) != 2:
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(self.places[p]):
                print("  Invalid place number.")
                return False
            if idx in self.tapped_places[p]:
                print("  That place is already tapped.")
                return False
            place = self.places[p][idx]
            gain = place.get("tap_gain", {})
            for e, v in gain.items():
                self.essences[p][e] = self.essences[p].get(e, 0) + v
            self.tapped_places[p].add(idx)
            return True

        # --- Claim place of power or monument ---
        if action == "claim":
            if len(parts) != 3:
                return False
            target = parts[1].lower()
            try:
                idx = int(parts[2]) - 1
            except ValueError:
                return False

            if target == "place":
                if idx < 0 or idx >= len(self.available_places):
                    print("  Invalid place number.")
                    return False
                place = self.available_places[idx]
                if not self._can_pay(p, place["claim_cost"]):
                    print(f"  Cannot afford {place['name']}. "
                          f"Need: {self._cost_str(place['claim_cost'])}")
                    return False
                self._pay_cost(p, place["claim_cost"])
                self.places[p].append(self.available_places.pop(idx))
                self._calc_scores()
                return True

            elif target in ("mon", "monument"):
                if idx < 0 or idx >= len(self.available_monuments):
                    print("  Invalid monument number.")
                    return False
                mon = self.available_monuments[idx]
                if not self._can_pay(p, mon["claim_cost"]):
                    print(f"  Cannot afford {mon['name']}. "
                          f"Need: {self._cost_str(mon['claim_cost'])}")
                    return False
                self._pay_cost(p, mon["claim_cost"])
                self.monuments_owned[p].append(self.available_monuments.pop(idx))
                self._calc_scores()
                return True
            return False

        # --- Draw a card ---
        if action == "draw":
            if not self.decks[p]:
                print("  Your deck is empty.")
                return False
            self.hands[p].append(self.decks[p].pop(0))
            return True

        # --- Convert essences (2:1 trade) ---
        if action == "convert":
            if len(parts) != 3:
                print("  Format: convert E1 E2 (trade 2 of E1 for 1 of E2)")
                return False
            e_from = self._symbol_to_essence(parts[1])
            e_to = self._symbol_to_essence(parts[2])
            if e_from is None or e_to is None:
                print("  Invalid essence symbol. Use E, L, D, C, or G.")
                return False
            if e_from == e_to:
                print("  Must convert to a different essence.")
                return False
            if self.essences[p].get(e_from, 0) < 2:
                print(f"  Need at least 2 {ESSENCE_SYMBOLS[e_from]} to convert.")
                return False
            self.essences[p][e_from] -= 2
            self.essences[p][e_to] = self.essences[p].get(e_to, 0) + 1
            return True

        return False

    def _new_round(self):
        """Start a new round: untap everything, gain income, draw a card."""
        self.round_number += 1
        for p in range(2):
            self.tapped[p] = set()
            self.tapped_places[p] = set()
            self.passed[p] = False
            # Income: 1 gold per round
            self.essences[p]["gold"] = self.essences[p].get("gold", 0) + 1
            # Draw a card if deck not empty
            if self.decks[p]:
                self.hands[p].append(self.decks[p].pop(0))
        # Alternate starting player each round
        if self.round_number % 2 == 0:
            self.current_player = 2
        else:
            self.current_player = 1

    def check_game_over(self):
        self._calc_scores()
        for p in range(2):
            if self.scores[p] >= self.target_points:
                self.game_over = True
                if self.scores[0] > self.scores[1]:
                    self.winner = 1
                elif self.scores[1] > self.scores[0]:
                    self.winner = 2
                else:
                    # Tie-break: most essences
                    e0 = sum(self.essences[0].values())
                    e1 = sum(self.essences[1].values())
                    if e0 > e1:
                        self.winner = 1
                    elif e1 > e0:
                        self.winner = 2
                    else:
                        self.winner = None
                return

    def get_state(self):
        return {
            "target_points": self.target_points,
            "essences": [_copy_dict(e) for e in self.essences],
            "decks": [[_copy_card(c) for c in d] for d in self.decks],
            "hands": [[_copy_card(c) for c in h] for h in self.hands],
            "tableaus": [[_copy_card(c) for c in t] for t in self.tableaus],
            "tapped": [list(t) for t in self.tapped],
            "places": [[_copy_card(p) for p in pl] for pl in self.places],
            "tapped_places": [list(t) for t in self.tapped_places],
            "monuments_owned": [[_copy_card(m) for m in ml] for ml in self.monuments_owned],
            "available_places": [_copy_card(p) for p in self.available_places],
            "available_monuments": [_copy_card(m) for m in self.available_monuments],
            "round_number": self.round_number,
            "passed": list(self.passed),
            "scores": list(self.scores),
        }

    def load_state(self, state):
        self.target_points = state["target_points"]
        self.essences = [_copy_dict(e) for e in state["essences"]]
        self.decks = [[_copy_card(c) for c in d] for d in state["decks"]]
        self.hands = [[_copy_card(c) for c in h] for h in state["hands"]]
        self.tableaus = [[_copy_card(c) for c in t] for t in state["tableaus"]]
        self.tapped = [set(t) for t in state["tapped"]]
        self.places = [[_copy_card(p) for p in pl] for pl in state["places"]]
        self.tapped_places = [set(t) for t in state["tapped_places"]]
        self.monuments_owned = [[_copy_card(m) for m in ml] for ml in state["monuments_owned"]]
        self.available_places = [_copy_card(p) for p in state["available_places"]]
        self.available_monuments = [_copy_card(m) for m in state["available_monuments"]]
        self.round_number = state["round_number"]
        self.passed = list(state["passed"])
        self.scores = list(state["scores"])

    def get_tutorial(self):
        return """
==================================================
  Res Arcana - Tutorial
==================================================

  OVERVIEW:
  Res Arcana is an engine-building card game where
  players use magical essences to power artifacts,
  claim places of power, and build monuments.
  First to reach the target score wins.

  ESSENCES:
  E = Elan (red/fire energy)
  L = Life (green/nature energy)
  D = Death (black/dark energy)
  C = Calm (blue/water energy)
  G = Gold (universal currency)

  Each player starts with 1 of each essence.

  ON YOUR TURN, choose ONE action:

  1. PLAY an artifact from your hand
     Pay its essence cost to place it on your tableau.
     Command: play N  (N = card number in hand)

  2. TAP an artifact for its ability
     Each artifact can be tapped once per round to
     generate essences or other effects.
     Command: tap N  (N = artifact number in tableau)

  3. TAP a place of power
     Your claimed places can also be tapped.
     Command: tapplace N

  4. CLAIM a place of power
     Pay the cost to take an unclaimed place. Places
     give points and a tap ability each round.
     Command: claim place N

  5. CLAIM a monument
     Pay gold to claim a monument for its points.
     Command: claim mon N

  6. DRAW a card from your deck
     Command: draw

  7. CONVERT essences
     Trade 2 of one essence for 1 of another.
     Command: convert E G  (2 elan -> 1 gold)

  8. PASS
     You are done for this round. When both players
     pass, a new round begins: all artifacts untap,
     each player gains 1 gold and draws 1 card.
     Command: pass

  SCORING:
  Each artifact, place of power, and monument has
  point values. First to the target wins.
  Standard: 10 points. Quick: 7 points.

  STRATEGY:
  - Build your engine early with cheap artifacts
    that generate the essences you need.
  - Places of power give recurring value each round.
  - Monuments are expensive but worth many points.
  - Use the 2:1 conversion to fix your essence mix.
  - Know when to shift from engine-building to
    claiming high-point targets.

==================================================
"""
