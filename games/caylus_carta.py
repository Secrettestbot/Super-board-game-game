"""Caylus Magna Carta - Worker placement card game.

Place workers on building cards along a road, activate for resources or VP.
Build new buildings to extend the road. Provost/bailiff mechanism controls
which buildings activate. Build sections of the castle for prestige VP.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

RESOURCES = ["Wood", "Stone", "Food", "Cloth", "Gold"]
RES_ABBREV = {"Wood": "W", "Stone": "S", "Food": "F", "Cloth": "C", "Gold": "G"}

# Building definitions
STARTING_BUILDINGS = [
    {"name": "Sawmill", "type": "production", "produces": "Wood", "amount": 1, "cost": None},
    {"name": "Quarry", "type": "production", "produces": "Stone", "amount": 1, "cost": None},
    {"name": "Farm", "type": "production", "produces": "Food", "amount": 1, "cost": None},
    {"name": "Market", "type": "trade", "desc": "Trade any 1 resource for any other", "cost": None},
    {"name": "Carpenter", "type": "build", "desc": "Build a wooden building", "cost": None},
]

BUILDABLE_BUILDINGS = [
    {"name": "Lumber Mill", "type": "production", "produces": "Wood", "amount": 2,
     "build_cost": {"Wood": 1, "Food": 1}},
    {"name": "Stone Mason", "type": "production", "produces": "Stone", "amount": 2,
     "build_cost": {"Wood": 1, "Stone": 1}},
    {"name": "Tailor", "type": "production", "produces": "Cloth", "amount": 1,
     "build_cost": {"Wood": 1}},
    {"name": "Goldsmith", "type": "production", "produces": "Gold", "amount": 1,
     "build_cost": {"Stone": 2}},
    {"name": "Bakery", "type": "production", "produces": "Food", "amount": 2,
     "build_cost": {"Wood": 1, "Stone": 1}},
    {"name": "Workshop", "type": "craft", "desc": "Convert 2 any resource to 1 Gold",
     "build_cost": {"Wood": 2, "Stone": 1}},
    {"name": "Church", "type": "prestige", "vp": 3,
     "build_cost": {"Stone": 2, "Gold": 1}},
    {"name": "Manor", "type": "prestige", "vp": 4,
     "build_cost": {"Wood": 1, "Stone": 2, "Cloth": 1}},
    {"name": "Guild Hall", "type": "prestige", "vp": 5,
     "build_cost": {"Stone": 2, "Gold": 1, "Cloth": 1}},
    {"name": "Inn", "type": "special", "desc": "Gain 1 worker back",
     "build_cost": {"Wood": 2}},
    {"name": "Trading Post", "type": "trade", "desc": "Trade any 2 for any 2",
     "build_cost": {"Wood": 1, "Food": 1}},
    {"name": "Weaver", "type": "production", "produces": "Cloth", "amount": 2,
     "build_cost": {"Wood": 2, "Food": 1}},
    {"name": "Bank", "type": "production", "produces": "Gold", "amount": 2,
     "build_cost": {"Stone": 3, "Cloth": 1}},
    {"name": "Stable", "type": "special", "desc": "Gain 2 workers back",
     "build_cost": {"Wood": 1, "Stone": 1, "Food": 1}},
    {"name": "Monument", "type": "prestige", "vp": 6,
     "build_cost": {"Stone": 3, "Gold": 2}},
]

# Castle sections (build for VP)
CASTLE_SECTIONS = [
    {"name": "Dungeon", "cost": {"Stone": 2}, "vp": 3},
    {"name": "Tower", "cost": {"Stone": 2, "Wood": 1}, "vp": 4},
    {"name": "Wall", "cost": {"Stone": 3}, "vp": 5},
    {"name": "Keep", "cost": {"Stone": 3, "Gold": 1}, "vp": 7},
]


def building_str(b, idx=None):
    prefix = f"R{idx}: " if idx is not None else ""
    if b["type"] == "production":
        return f"{prefix}{b['name']} (+{b['amount']} {RES_ABBREV[b['produces']]})"
    elif b["type"] == "prestige":
        return f"{prefix}{b['name']} ({b['vp']} VP)"
    else:
        return f"{prefix}{b['name']} ({b.get('desc', '')})"


class CaylusCartaGame(BaseGame):
    """Caylus Magna Carta - Worker placement card game."""

    name = "Caylus Magna Carta"
    description = "Worker placement along a road with provost mechanism and castle building"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full game: 12 road slots, provost + bailiff, castle building",
        "quick": "Shorter road (8 slots), simplified scoring, fewer rounds",
    }

    def setup(self):
        self.max_road = 12 if self.variation == "standard" else 8
        self.max_rounds = 10 if self.variation == "standard" else 6

        # Road: list of buildings (some start pre-built)
        self.road = []
        for b in STARTING_BUILDINGS:
            building = dict(b)
            building["owner"] = 0  # 0 = neutral
            building["worker"] = 0  # 0 = nobody, 1/2 = player
            self.road.append(building)

        # Building market
        self.building_market = [dict(b) for b in BUILDABLE_BUILDINGS]
        random.shuffle(self.building_market)

        # Castle sections available
        self.castle_sections = [dict(s) for s in CASTLE_SECTIONS]
        self.castle_built = {1: [], 2: []}

        # Provost position (controls activation cutoff)
        self.provost = len(self.road) - 1
        self.bailiff = len(self.road) - 1

        # Player state
        self.resources = {
            1: {"Wood": 2, "Stone": 1, "Food": 1, "Cloth": 0, "Gold": 0},
            2: {"Wood": 2, "Stone": 1, "Food": 1, "Cloth": 0, "Gold": 0},
        }
        self.workers = {1: 3, 2: 3}
        self.total_workers = {1: 3, 2: 3}
        self.vp = {1: 0, 2: 0}

        # Phase tracking
        self.round_num = 1
        self.phase = "place"  # "place", "provost", "activate", "build", "castle"
        self.passed = {1: False, 2: False}
        self.activation_index = 0
        self.message = ""

    def display(self):
        clear_screen()
        print(f"=== Caylus Magna Carta - {self.variation.title()} ===")
        print(f"Round {self.round_num}/{self.max_rounds} | Phase: {self.phase.upper()} | "
              f"{self.players[self.current_player - 1]}'s turn")
        print()

        # Player info
        for p in [1, 2]:
            res_str = " ".join(f"{RES_ABBREV[r]}:{self.resources[p][r]}" for r in RESOURCES)
            print(f"  {self.players[p-1]}: VP={self.vp[p]} Workers={self.workers[p]}/{self.total_workers[p]} {res_str}")
            if self.castle_built[p]:
                print(f"    Castle: {', '.join(s['name'] for s in self.castle_built[p])}")
        print()

        # Road display
        print("Road (Provost at R{0}, Bailiff at R{1}):".format(self.provost + 1, self.bailiff + 1))
        for i, b in enumerate(self.road):
            marker = " "
            if i == self.provost:
                marker = "P"
            if i == self.bailiff:
                marker = "B" if marker == " " else "X"

            worker_str = ""
            if b["worker"] > 0:
                worker_str = f" <P{b['worker']}>"

            owner_str = ""
            if b.get("owner", 0) > 0:
                owner_str = f" (built by P{b['owner']})"

            activated = "+" if i <= self.provost else "-"
            print(f"  [{activated}] R{i+1}: {building_str(b)}{worker_str}{owner_str} [{marker}]")

        if len(self.road) < self.max_road:
            print(f"  ... {self.max_road - len(self.road)} empty road slots")
        print()

        if self.phase == "build":
            print("Buildable buildings:")
            for i, b in enumerate(self.building_market[:5]):
                cost_str = " ".join(f"{RES_ABBREV[r]}:{v}" for r, v in b["build_cost"].items())
                print(f"  M{i+1}: {building_str(b)} [Cost: {cost_str}]")
            print()

        if self.phase == "castle":
            print("Castle sections:")
            for i, s in enumerate(self.castle_sections):
                cost_str = " ".join(f"{RES_ABBREV[r]}:{v}" for r, v in s["cost"].items())
                print(f"  K{i+1}: {s['name']} ({s['vp']} VP) [Cost: {cost_str}]")
            print()

        if self.message:
            print(self.message)
            self.message = ""

    def get_move(self):
        if self.phase == "place":
            if self.workers[self.current_player] <= 0 or self.passed[self.current_player]:
                return "pass"
            print("Place worker on building: R# (or 'pass' to stop placing)")
            move = input_with_quit("> ").strip()
            return move

        elif self.phase == "provost":
            print(f"Move provost? Current position: R{self.provost + 1}")
            print(f"Enter new position (R#), or 'keep' to leave it:")
            move = input_with_quit("> ").strip()
            return f"provost:{move}"

        elif self.phase == "activate":
            return "activate"

        elif self.phase == "build":
            print("Build a building from market? M# or 'skip':")
            move = input_with_quit("> ").strip()
            return f"build:{move}"

        elif self.phase == "castle":
            print("Build castle section? K# or 'skip':")
            move = input_with_quit("> ").strip()
            return f"castle:{move}"

        return "pass"

    def make_move(self, move):
        if self.phase == "place":
            return self._handle_place(move)
        elif self.phase == "provost":
            return self._handle_provost(move)
        elif self.phase == "activate":
            return self._handle_activate()
        elif self.phase == "build":
            return self._handle_build(move)
        elif self.phase == "castle":
            return self._handle_castle(move)
        return False

    def _handle_place(self, move):
        if move.lower() in ("pass", "p"):
            self.passed[self.current_player] = True
            if all(self.passed.values()):
                self.phase = "provost"
            return True

        try:
            idx = int(move.replace("r", "").replace("R", "")) - 1
        except ValueError:
            self.message = "Enter R# or 'pass'."
            return False

        if idx < 0 or idx >= len(self.road):
            self.message = "Invalid road position."
            return False

        if self.road[idx]["worker"] != 0:
            self.message = "That building already has a worker."
            return False

        if self.workers[self.current_player] <= 0:
            self.message = "No workers left."
            return False

        self.road[idx]["worker"] = self.current_player
        self.workers[self.current_player] -= 1
        return True

    def _handle_provost(self, move):
        cmd = move.replace("provost:", "").strip().lower()
        if cmd in ("keep", "k"):
            self.phase = "activate"
            self.activation_index = 0
            return True

        try:
            new_pos = int(cmd.replace("r", "").replace("R", "")) - 1
        except ValueError:
            self.message = "Enter R# or 'keep'."
            return False

        # Can only move provost up to 3 spaces in either direction
        if abs(new_pos - self.provost) > 3:
            self.message = "Can only move provost up to 3 spaces."
            return False

        if new_pos < 0 or new_pos >= len(self.road):
            self.message = "Invalid position."
            return False

        self.provost = new_pos
        self.phase = "activate"
        self.activation_index = 0
        return True

    def _handle_activate(self):
        """Activate all buildings with workers up to provost position."""
        for i in range(len(self.road)):
            b = self.road[i]
            if b["worker"] == 0:
                continue
            if i > self.provost:
                # Beyond provost - worker is wasted
                b["worker"] = 0
                continue

            player = b["worker"]
            self._activate_building(b, player)
            b["worker"] = 0

        self.phase = "build"
        self.message = "Buildings activated! Now you may build."
        return True

    def _activate_building(self, b, player):
        if b["type"] == "production":
            res = b["produces"]
            amt = b["amount"]
            self.resources[player][res] += amt

        elif b["type"] == "trade":
            # Auto-trade: convert cheapest resource to most needed
            # For simplicity, give 1 Food
            self.resources[player]["Food"] += 1

        elif b["type"] == "prestige":
            self.vp[player] += b.get("vp", 0)

        elif b["type"] == "craft":
            # Convert: give 1 Gold
            self.resources[player]["Gold"] += 1

        elif b["type"] == "special":
            if "worker" in b.get("desc", "").lower():
                gain = 1 if "1" in b.get("desc", "") else 2
                self.workers[player] = min(self.workers[player] + gain, self.total_workers[player])

    def _handle_build(self, move):
        cmd = move.replace("build:", "").strip().lower()
        if cmd in ("skip", "s", "pass", "p"):
            self.phase = "castle"
            return True

        try:
            idx = int(cmd.replace("m", "").replace("M", "")) - 1
        except ValueError:
            self.message = "Enter M# or 'skip'."
            return False

        if idx < 0 or idx >= min(5, len(self.building_market)):
            self.message = "Invalid building number."
            return False

        if len(self.road) >= self.max_road:
            self.message = "Road is full!"
            return False

        b = self.building_market[idx]
        p = self.current_player

        # Check cost
        for res, amt in b["build_cost"].items():
            if self.resources[p].get(res, 0) < amt:
                self.message = f"Not enough {res}."
                return False

        # Pay cost
        for res, amt in b["build_cost"].items():
            self.resources[p][res] -= amt

        # Add to road
        new_building = dict(b)
        new_building["owner"] = p
        new_building["worker"] = 0
        del new_building["build_cost"]
        self.road.append(new_building)

        self.building_market.pop(idx)
        self.vp[p] += 1  # VP for building

        self.phase = "castle"
        self.message = f"Built {b['name']}! +1 VP"
        return True

    def _handle_castle(self, move):
        cmd = move.replace("castle:", "").strip().lower()
        if cmd in ("skip", "s", "pass", "p"):
            self._end_round_phase()
            return True

        try:
            idx = int(cmd.replace("k", "").replace("K", "")) - 1
        except ValueError:
            self.message = "Enter K# or 'skip'."
            return False

        if idx < 0 or idx >= len(self.castle_sections):
            self.message = "Invalid castle section."
            return False

        section = self.castle_sections[idx]
        p = self.current_player

        for res, amt in section["cost"].items():
            if self.resources[p].get(res, 0) < amt:
                self.message = f"Not enough {res}."
                return False

        for res, amt in section["cost"].items():
            self.resources[p][res] -= amt

        self.castle_built[p].append(section)
        self.vp[p] += section["vp"]
        self.castle_sections.pop(idx)

        self.message = f"Built {section['name']}! +{section['vp']} VP"
        self._end_round_phase()
        return True

    def _end_round_phase(self):
        """Handle end of round."""
        self.round_num += 1
        self.phase = "place"
        self.passed = {1: False, 2: False}

        # Reset workers
        for p in [1, 2]:
            self.workers[p] = self.total_workers[p]

        # Move bailiff forward
        self.bailiff = min(self.bailiff + 1, len(self.road) - 1)
        self.provost = self.bailiff

        # Clear road workers
        for b in self.road:
            b["worker"] = 0

    def check_game_over(self):
        if self.round_num > self.max_rounds:
            self.game_over = True
            # Final scoring: 1 VP per 3 remaining resources
            for p in [1, 2]:
                total_res = sum(self.resources[p].values())
                self.vp[p] += total_res // 3

            if self.vp[1] > self.vp[2]:
                self.winner = 1
            elif self.vp[2] > self.vp[1]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "max_road": self.max_road,
            "max_rounds": self.max_rounds,
            "road": self.road,
            "building_market": self.building_market,
            "castle_sections": self.castle_sections,
            "castle_built": {str(k): v for k, v in self.castle_built.items()},
            "provost": self.provost,
            "bailiff": self.bailiff,
            "resources": {str(k): v for k, v in self.resources.items()},
            "workers": {str(k): v for k, v in self.workers.items()},
            "total_workers": {str(k): v for k, v in self.total_workers.items()},
            "vp": {str(k): v for k, v in self.vp.items()},
            "round_num": self.round_num,
            "phase": self.phase,
            "passed": {str(k): v for k, v in self.passed.items()},
            "activation_index": self.activation_index,
            "message": self.message,
        }

    def load_state(self, state):
        self.max_road = state["max_road"]
        self.max_rounds = state["max_rounds"]
        self.road = state["road"]
        self.building_market = state["building_market"]
        self.castle_sections = state["castle_sections"]
        self.castle_built = {int(k): v for k, v in state["castle_built"].items()}
        self.provost = state["provost"]
        self.bailiff = state["bailiff"]
        self.resources = {int(k): v for k, v in state["resources"].items()}
        self.workers = {int(k): v for k, v in state["workers"].items()}
        self.total_workers = {int(k): v for k, v in state["total_workers"].items()}
        self.vp = {int(k): v for k, v in state["vp"].items()}
        self.round_num = state["round_num"]
        self.phase = state["phase"]
        self.passed = {int(k): v for k, v in state["passed"].items()}
        self.activation_index = state["activation_index"]
        self.message = state.get("message", "")

    def get_tutorial(self):
        return """
=== CAYLUS MAGNA CARTA TUTORIAL ===

OVERVIEW:
  Build along a road of buildings by placing workers. Activate buildings for
  resources, then use resources to construct new buildings and castle sections.
  The provost controls which buildings actually activate!

PHASES EACH ROUND:
  1. PLACE   - Take turns placing workers on road buildings (R#)
  2. PROVOST - Active player may shift provost up to 3 spaces
  3. ACTIVATE - Buildings with workers (up to provost) produce
  4. BUILD   - Optionally build a new building from market (M#)
  5. CASTLE  - Optionally build a castle section (K#)

ROAD BUILDINGS:
  Production - Generate resources (Wood, Stone, Food, Cloth, Gold)
  Trade      - Exchange resources
  Prestige   - Earn VP directly
  Special    - Recover workers, etc.

THE PROVOST:
  Only buildings at or before the provost position activate!
  After placement, the active player may move the provost up to 3 spaces.
  Strategic use blocks opponent's workers or enables your own.

RESOURCES: W=Wood, S=Stone, F=Food, C=Cloth, G=Gold

CASTLE:
  Spend stone (and gold) to build castle sections for VP.
  Dungeon (3VP), Tower (4VP), Wall (5VP), Keep (7VP).

SCORING:
  VP from: prestige buildings, building new buildings (+1 each),
  castle sections, and 1 VP per 3 leftover resources.
"""
