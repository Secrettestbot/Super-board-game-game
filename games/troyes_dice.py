"""Troyes Dice - Roll and draft dice to build medieval Troyes.

Manage citizens, military, and religion tracks. Draft colored dice each
round to advance on tracks and construct buildings for points.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Dice colors and their domains
DOMAINS = {
    "Yellow": "Civil",
    "Red": "Military",
    "White": "Religious",
}

# Buildings available for construction
BUILDINGS = [
    {"name": "Cathedral", "domain": "White", "cost": 3, "points": 4,
     "bonus": "religion"},
    {"name": "Marketplace", "domain": "Yellow", "cost": 2, "points": 2,
     "bonus": "coins"},
    {"name": "Barracks", "domain": "Red", "cost": 2, "points": 2,
     "bonus": "military"},
    {"name": "Town Hall", "domain": "Yellow", "cost": 3, "points": 3,
     "bonus": "civil"},
    {"name": "Ramparts", "domain": "Red", "cost": 3, "points": 4,
     "bonus": "military"},
    {"name": "Monastery", "domain": "White", "cost": 2, "points": 3,
     "bonus": "religion"},
    {"name": "Workshop", "domain": "Yellow", "cost": 1, "points": 1,
     "bonus": "coins"},
    {"name": "Watchtower", "domain": "Red", "cost": 1, "points": 1,
     "bonus": "military"},
    {"name": "Chapel", "domain": "White", "cost": 1, "points": 1,
     "bonus": "religion"},
]

# Ladies expansion: extra characters
LADIES = [
    {"name": "Lady of Commerce", "effect": "coins_bonus",
     "desc": "+2 coins per Yellow die used"},
    {"name": "Lady of War", "effect": "military_bonus",
     "desc": "+1 military per Red die used"},
    {"name": "Lady of Faith", "effect": "religion_bonus",
     "desc": "+1 religion per White die used"},
]

TRACK_MAX = 12
MAX_ROUNDS = 8


class TroyesDiceGame(BaseGame):
    """Troyes Dice - Dice drafting medieval city builder."""

    name = "Troyes Dice"
    description = "Roll and draft colored dice to build medieval Troyes"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "ladies": "Ladies of Troyes Expansion",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.use_ladies = self.variation == "ladies"
        # Per player tracks
        self.civil = {}
        self.military = {}
        self.religion = {}
        self.coins = {}
        self.buildings = {}  # player -> list of built building names
        self.ladies = {}     # player -> list of active ladies
        # Dice pool
        self.dice_pool = []  # list of (color, value)
        self.available_buildings = []
        self.phase = "draft"  # draft, build
        self.drafted = {}     # player -> list of (color, value)
        self.round_number = 0
        self.events_remaining = 0
        self.log = []

    def setup(self):
        for p in [1, 2]:
            sp = str(p)
            self.civil[sp] = 0
            self.military[sp] = 0
            self.religion[sp] = 0
            self.coins[sp] = 5
            self.buildings[sp] = []
            self.ladies[sp] = []
            self.drafted[sp] = []

        self.available_buildings = list(BUILDINGS)
        random.shuffle(self.available_buildings)
        self.available_buildings = self.available_buildings[:6]

        self.round_number = 1
        self.phase = "draft"
        self._roll_dice_pool()
        self.log = ["Game started! Draft dice to build Troyes."]

    def _roll_dice_pool(self):
        """Roll the shared dice pool: 2 of each color per player."""
        self.dice_pool = []
        for color in ["Yellow", "Red", "White"]:
            for _ in range(2):  # 2 per color
                self.dice_pool.append((color, random.randint(1, 6)))
        # Handle event: reduce a random track
        self.events_remaining = random.randint(0, 2)
        if self.events_remaining > 0:
            self.log.append(f"Event! {self.events_remaining} threats this round.")

    def _apply_die(self, player, color, value):
        """Apply a drafted die to the player's tracks."""
        sp = str(player)
        domain = DOMAINS[color]
        advance = (value + 1) // 2  # 1-2->1, 3-4->2, 5-6->3

        if domain == "Civil":
            self.civil[sp] = min(TRACK_MAX, self.civil[sp] + advance)
            self.coins[sp] += 1
        elif domain == "Military":
            self.military[sp] = min(TRACK_MAX, self.military[sp] + advance)
        elif domain == "Religious":
            self.religion[sp] = min(TRACK_MAX, self.religion[sp] + advance)

        # Ladies bonus
        if self.use_ladies:
            for lady in self.ladies[sp]:
                if lady["effect"] == "coins_bonus" and color == "Yellow":
                    self.coins[sp] += 2
                elif lady["effect"] == "military_bonus" and color == "Red":
                    self.military[sp] = min(TRACK_MAX, self.military[sp] + 1)
                elif lady["effect"] == "religion_bonus" and color == "White":
                    self.religion[sp] = min(TRACK_MAX, self.religion[sp] + 1)

    def _can_build(self, player, building):
        sp = str(player)
        if building["name"] in self.buildings[sp]:
            return False
        cost = building["cost"]
        if self.coins[sp] < cost:
            return False
        # Check domain track requirement
        domain_map = {"Yellow": self.civil, "Red": self.military,
                      "White": self.religion}
        track = domain_map[building["domain"]][sp]
        if track < cost:
            return False
        return True

    def _calc_score(self, player):
        sp = str(player)
        score = 0
        # Building points
        for bname in self.buildings[sp]:
            for b in BUILDINGS:
                if b["name"] == bname:
                    score += b["points"]
                    break
        # Track bonuses: 1 pt per 3 levels on each track
        score += self.civil[sp] // 3
        score += self.military[sp] // 3
        score += self.religion[sp] // 3
        # Coins bonus
        score += self.coins[sp] // 4
        return score

    def display(self):
        clear_screen()
        variant = "Ladies Expansion" if self.use_ladies else "Standard"
        print(f"{'=' * 60}")
        print(f"  TROYES DICE - {variant} | Round {self.round_number}/{MAX_ROUNDS}")
        print(f"{'=' * 60}")

        # Dice pool
        if self.dice_pool:
            print("\n  Dice Pool:")
            for i, (color, val) in enumerate(self.dice_pool):
                sym = color[0]
                print(f"    [{i+1}] {sym}:{val} ({color} - {DOMAINS[color]})")

        if self.events_remaining > 0:
            print(f"\n  ** Threats remaining: {self.events_remaining} **")

        for p in [1, 2]:
            sp = str(p)
            marker = " << your turn" if p == self.current_player else ""
            score = self._calc_score(p)
            print(f"\n  {self.players[p-1]} | Score: {score}{marker}")
            bar_c = "#" * self.civil[sp] + "." * (TRACK_MAX - self.civil[sp])
            bar_m = "#" * self.military[sp] + "." * (TRACK_MAX - self.military[sp])
            bar_r = "#" * self.religion[sp] + "." * (TRACK_MAX - self.religion[sp])
            print(f"    Civil:    [{bar_c}] {self.civil[sp]:2d}/{TRACK_MAX}")
            print(f"    Military: [{bar_m}] {self.military[sp]:2d}/{TRACK_MAX}")
            print(f"    Religion: [{bar_r}] {self.religion[sp]:2d}/{TRACK_MAX}")
            print(f"    Coins: {self.coins[sp]}")
            if self.drafted[sp]:
                d_str = ", ".join(f"{c[0]}:{v}" for c, v in self.drafted[sp])
                print(f"    Drafted: {d_str}")
            if self.buildings[sp]:
                print(f"    Buildings: {', '.join(self.buildings[sp])}")
            if self.ladies[sp]:
                print(f"    Ladies: {', '.join(l['name'] for l in self.ladies[sp])}")

        # Available buildings
        print("\n  Buildings available:")
        for i, b in enumerate(self.available_buildings):
            can = self._can_build(self.current_player, b)
            status = "" if can else " (can't)"
            print(f"    [{i+1}] {b['name']} ({b['domain'][0]}) "
                  f"Cost:{b['cost']} Pts:{b['points']}{status}")

        if self.use_ladies and self.round_number <= 3:
            print("\n  Ladies available:")
            for i, l in enumerate(LADIES):
                print(f"    [L{i+1}] {l['name']}: {l['desc']}")

        print(f"\n  Phase: {self.phase}")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "draft":
            if not self.dice_pool:
                return {"action": "end_draft"}
            print(f"  {self.players[cp-1]}, draft a die from the pool.")
            print(f"  You have {self.coins[sp]} coins. (Buying opponent's die costs 2)")
            idx = input_with_quit("  Die number (or 0 to stop): ").strip()
            try:
                i = int(idx)
                if i == 0:
                    return {"action": "end_draft"}
                i -= 1
                if 0 <= i < len(self.dice_pool):
                    return {"action": "draft", "index": i}
            except ValueError:
                pass
            return None

        elif self.phase == "build":
            print(f"  {self.players[cp-1]}, build or pass.")
            print(f"    [1-{len(self.available_buildings)}] Build a building")
            if self.use_ladies and self.round_number <= 3:
                print(f"    [L1-L3] Recruit a Lady (costs 3 coins)")
            print(f"    [0] Pass / End build phase")
            choice = input_with_quit("  Choice: ").strip()

            if choice == "0":
                return {"action": "end_build"}

            if choice.upper().startswith("L") and self.use_ladies:
                try:
                    li = int(choice[1:]) - 1
                    if 0 <= li < len(LADIES):
                        return {"action": "recruit_lady", "index": li}
                except ValueError:
                    pass
                return None

            try:
                bi = int(choice) - 1
                if 0 <= bi < len(self.available_buildings):
                    return {"action": "build", "index": bi}
            except ValueError:
                pass
            return None

        elif self.phase == "event":
            print(f"  {self.players[cp-1]}, handle threat!")
            print(f"    [1] Use military ({self.military[sp]})")
            print(f"    [2] Pay 2 coins ({self.coins[sp]})")
            print(f"    [3] Lose 1 from each track")
            choice = input_with_quit("  Choice: ").strip()
            if choice in ("1", "2", "3"):
                return {"action": "handle_event", "method": int(choice)}
            return None

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move.get("action")

        if action == "draft":
            idx = move["index"]
            if idx < 0 or idx >= len(self.dice_pool):
                return False
            color, val = self.dice_pool[idx]
            self.dice_pool.pop(idx)
            self.drafted[sp].append((color, val))
            self._apply_die(cp, color, val)
            self.log.append(
                f"{self.players[cp-1]} drafted {color[0]}:{val}.")
            return True

        if action == "end_draft":
            if self.current_player == 1:
                self.current_player = 2
                return True
            else:
                # Both done drafting
                if self.events_remaining > 0:
                    self.phase = "event"
                    self.current_player = 1
                else:
                    self.phase = "build"
                    self.current_player = 1
                return True

        if action == "handle_event":
            method = move["method"]
            if method == 1:
                if self.military[sp] >= 2:
                    self.military[sp] -= 2
                    self.log.append(
                        f"{self.players[cp-1]} used military to fend off threat.")
                else:
                    return False
            elif method == 2:
                if self.coins[sp] >= 2:
                    self.coins[sp] -= 2
                    self.log.append(
                        f"{self.players[cp-1]} paid coins for threat.")
                else:
                    return False
            elif method == 3:
                self.civil[sp] = max(0, self.civil[sp] - 1)
                self.military[sp] = max(0, self.military[sp] - 1)
                self.religion[sp] = max(0, self.religion[sp] - 1)
                self.log.append(
                    f"{self.players[cp-1]} lost progress to threat.")
            else:
                return False

            self.events_remaining -= 1
            if self.current_player == 1:
                self.current_player = 2
                return True
            else:
                if self.events_remaining > 0:
                    self.current_player = 1
                else:
                    self.phase = "build"
                    self.current_player = 1
                return True

        if action == "build":
            bi = move["index"]
            if bi < 0 or bi >= len(self.available_buildings):
                return False
            building = self.available_buildings[bi]
            if not self._can_build(cp, building):
                return False
            self.coins[sp] -= building["cost"]
            self.buildings[sp].append(building["name"])
            # Building bonus
            if building["bonus"] == "coins":
                self.coins[sp] += 2
            elif building["bonus"] == "civil":
                self.civil[sp] = min(TRACK_MAX, self.civil[sp] + 1)
            elif building["bonus"] == "military":
                self.military[sp] = min(TRACK_MAX, self.military[sp] + 1)
            elif building["bonus"] == "religion":
                self.religion[sp] = min(TRACK_MAX, self.religion[sp] + 1)
            self.log.append(
                f"{self.players[cp-1]} built {building['name']}!")
            return True

        if action == "recruit_lady":
            li = move["index"]
            if li < 0 or li >= len(LADIES):
                return False
            if self.coins[sp] < 3:
                return False
            lady = LADIES[li]
            if any(l["name"] == lady["name"] for l in self.ladies[sp]):
                return False
            self.coins[sp] -= 3
            self.ladies[sp].append(lady)
            self.log.append(
                f"{self.players[cp-1]} recruited {lady['name']}!")
            return True

        if action == "end_build":
            if self.current_player == 1:
                self.current_player = 2
                return True
            else:
                # Advance round
                self.round_number += 1
                self.phase = "draft"
                self.current_player = 1
                self.drafted = {"1": [], "2": []}
                if self.round_number <= MAX_ROUNDS:
                    self._roll_dice_pool()
                return True

        return False

    def check_game_over(self):
        if self.round_number > MAX_ROUNDS:
            self.game_over = True
            s1 = self._calc_score(1)
            s2 = self._calc_score(2)
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            self.log.append(
                f"Final: {self.players[0]}={s1}, {self.players[1]}={s2}")

    def get_state(self):
        return {
            "civil": self.civil,
            "military": self.military,
            "religion": self.religion,
            "coins": self.coins,
            "buildings": self.buildings,
            "ladies": self.ladies,
            "dice_pool": self.dice_pool,
            "available_buildings": self.available_buildings,
            "drafted": self.drafted,
            "phase": self.phase,
            "events_remaining": self.events_remaining,
            "round_number": self.round_number,
            "log": self.log,
        }

    def load_state(self, state):
        self.civil = state["civil"]
        self.military = state["military"]
        self.religion = state["religion"]
        self.coins = state["coins"]
        self.buildings = state["buildings"]
        self.ladies = state.get("ladies", {"1": [], "2": []})
        self.dice_pool = state["dice_pool"]
        self.available_buildings = state["available_buildings"]
        self.drafted = state["drafted"]
        self.phase = state["phase"]
        self.events_remaining = state["events_remaining"]
        self.round_number = state["round_number"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  TROYES DICE - Tutorial
============================================================

  OVERVIEW:
  Roll and draft colored dice to advance tracks and build
  structures in medieval Troyes. Manage citizens, military,
  and religion to score the most points.

  DICE COLORS:
  - Yellow: Civil domain (also grants coins)
  - Red: Military domain
  - White: Religious domain

  EACH ROUND:
  1. ROLL: 6 dice are rolled (2 per color)
  2. DRAFT: Players take turns drafting dice
     - Each die advances the matching track by (value+1)/2
  3. EVENT: Handle threats using military, coins, or tracks
  4. BUILD: Spend coins to construct buildings for points
     - Must meet domain track requirement equal to cost

  TRACKS:
  - Civil, Military, Religion (0-12 each)
  - 1 point per 3 levels on each track at game end

  BUILDINGS:
  - Cost coins and require domain track levels
  - Award victory points and bonus effects

  LADIES EXPANSION:
  - Recruit ladies in rounds 1-3 for 3 coins each
  - They provide ongoing bonuses when using matching dice

  SCORING:
  - Building points + track bonuses + coin reserves
  - Game ends after 8 rounds
============================================================
"""
