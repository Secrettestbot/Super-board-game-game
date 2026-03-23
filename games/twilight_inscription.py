"""Twilight Inscription - A roll-and-write space exploration game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Event dice faces
EVENT_DICE = [
    ["Navigate", "Expand", "Industry", "Warfare", "Wild", "Wild"],
    ["Navigate", "Navigate", "Expand", "Industry", "Warfare", "Wild"],
    ["Navigate", "Expand", "Expand", "Industry", "Warfare", "Wild"],
    ["Navigate", "Expand", "Industry", "Industry", "Warfare", "Wild"],
]

# Navigation: star map is a grid, connect adjacent stars to build routes
NAV_GRID_SIZE = 5  # 5x5 star grid
# Stars with bonus points
NAV_BONUSES = {
    "0,0": 2, "4,4": 2, "2,2": 3, "0,4": 2, "4,0": 2,
}

# Expansion: sectors with planets
SECTOR_NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]
SECTOR_PLANETS = {
    "Alpha": 3, "Beta": 4, "Gamma": 3, "Delta": 5, "Epsilon": 3,
}
SECTOR_BONUS = {
    "Alpha": 5, "Beta": 7, "Gamma": 5, "Delta": 10, "Epsilon": 5,
}

# Industry: structures to build
STRUCTURES = [
    {"name": "Mine", "cost": 1, "points": 1},
    {"name": "Factory", "cost": 2, "points": 3},
    {"name": "Starport", "cost": 3, "points": 6},
    {"name": "Citadel", "cost": 4, "points": 10},
]

# Warfare: fleet grid positions
FLEET_GRID_SIZE = 4
FLEET_BONUSES = {
    "0,0": 1, "1,1": 2, "2,2": 2, "3,3": 3, "0,3": 2, "3,0": 2,
}


class TwilightInscriptionGame(BaseGame):
    """Twilight Inscription - roll-and-write space exploration."""

    name = "Twilight Inscription"
    description = "Roll dice and fill sheets to explore the galaxy"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full game with 8 rounds",
        "quick": "Quick game with 5 rounds",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_rounds = 8 if self.variation == "standard" else 5
        self.current_round = 1
        self.dice_results = []
        self.phase = "roll"  # "roll", "choose"
        self.actions_remaining = {1: 0, 2: 0}
        self.round_actions_taken = {1: False, 2: False}

        # Per-player sheets
        self.nav_routes = {1: [], 2: []}  # list of [r1,c1,r2,c2] connections
        self.expansion = {1: {s: 0 for s in SECTOR_NAMES}, 2: {s: 0 for s in SECTOR_NAMES}}
        self.industry = {1: [], 2: []}  # list of built structure names
        self.industry_resources = {1: 0, 2: 0}
        self.warfare = {1: [], 2: []}  # list of "r,c" fleet positions
        self.log = []

    def setup(self):
        """Initialize the game."""
        self.current_round = 1
        self.phase = "roll"
        self.log.append("The galaxy awaits! Round 1 begins.")
        self._roll_dice()

    def _roll_dice(self):
        """Roll the event dice for this round."""
        self.dice_results = []
        for die in EVENT_DICE:
            self.dice_results.append(random.choice(die))
        # Replace Wild with player choice later
        self.log.append(f"Round {self.current_round}: Dice rolled!")
        self.round_actions_taken = {1: False, 2: False}

    def _count_action(self, action):
        """Count how many dice show this action (Wild counts as any)."""
        count = 0
        for d in self.dice_results:
            if d == action or d == "Wild":
                count += 1
        return count

    def _available_actions(self):
        """Return list of actions available from current dice."""
        actions = []
        seen = set()
        for d in self.dice_results:
            if d == "Wild":
                continue
            if d not in seen:
                seen.add(d)
                actions.append(d)
        if not actions:
            actions = ["Navigate", "Expand", "Industry", "Warfare"]
        return actions

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print("=" * 62)
        print(f"  TWILIGHT INSCRIPTION - Round {self.current_round}/{self.max_rounds}")
        print("=" * 62)

        # Show dice
        print(f"  Dice: ", end="")
        for i, d in enumerate(self.dice_results):
            print(f"[{d[:3].upper()}] ", end="")
        print()
        print("-" * 62)

        # Show both players' scores summary
        for pp in [p, opp]:
            label = ">>" if pp == p else "  "
            nav_pts = self._score_navigation(pp)
            exp_pts = self._score_expansion(pp)
            ind_pts = self._score_industry(pp)
            war_pts = self._score_warfare(pp)
            total = nav_pts + exp_pts + ind_pts + war_pts
            print(f"  {label} {self.players[pp-1]}: NAV={nav_pts} EXP={exp_pts} "
                  f"IND={ind_pts} WAR={war_pts} | Total={total}")

        print("-" * 62)

        # Show current player's sheets in detail
        print(f"  {self.players[p-1]}'s Sheets:")
        print()

        # Navigation
        print("  NAVIGATION (Star Map):")
        self._display_nav_grid(p)

        # Expansion
        print("  EXPANSION (Planets Claimed):")
        for sector in SECTOR_NAMES:
            claimed = self.expansion[p][sector]
            total = SECTOR_PLANETS[sector]
            bar = "#" * claimed + "." * (total - claimed)
            bonus_str = f" [+{SECTOR_BONUS[sector]}]" if claimed >= total else ""
            print(f"    {sector:8s}: [{bar}] {claimed}/{total}{bonus_str}")

        # Industry
        print(f"  INDUSTRY (Resources: {self.industry_resources[p]}):")
        built_counts = {}
        for s in self.industry[p]:
            built_counts[s] = built_counts.get(s, 0) + 1
        for struct in STRUCTURES:
            cnt = built_counts.get(struct["name"], 0)
            print(f"    {struct['name']:8s}: {cnt} built (cost:{struct['cost']} pts:{struct['points']}ea)")

        # Warfare
        print("  WARFARE (Fleet Positions):")
        self._display_fleet_grid(p)

        print("-" * 62)
        if self.log:
            for line in self.log[-3:]:
                print(f"  {line}")
        print("=" * 62)

    def _display_nav_grid(self, player):
        """Display the navigation star grid."""
        routes = self.nav_routes[player]
        route_set = set()
        for r in routes:
            route_set.add(f"{r[0]},{r[1]}-{r[2]},{r[3]}")
            route_set.add(f"{r[2]},{r[3]}-{r[0]},{r[1]}")

        connected_stars = set()
        for r in routes:
            connected_stars.add(f"{r[0]},{r[1]}")
            connected_stars.add(f"{r[2]},{r[3]}")

        for row in range(NAV_GRID_SIZE):
            line = "    "
            for col in range(NAV_GRID_SIZE):
                key = f"{row},{col}"
                if key in connected_stars:
                    if key in NAV_BONUSES:
                        line += f"*{NAV_BONUSES[key]}"
                    else:
                        line += " * "
                else:
                    if key in NAV_BONUSES:
                        line += f" {NAV_BONUSES[key]} "
                    else:
                        line += " . "
                if col < NAV_GRID_SIZE - 1:
                    hr = f"{row},{col}-{row},{col+1}"
                    if hr in route_set:
                        line += "-"
                    else:
                        line += " "
            print(line)
            if row < NAV_GRID_SIZE - 1:
                vline = "    "
                for col in range(NAV_GRID_SIZE):
                    vr = f"{row},{col}-{row+1},{col}"
                    if vr in route_set:
                        vline += " | "
                    else:
                        vline += "   "
                    if col < NAV_GRID_SIZE - 1:
                        vline += " "
                print(vline)

    def _display_fleet_grid(self, player):
        """Display the warfare fleet grid."""
        fleet_set = set(self.warfare[player])
        for row in range(FLEET_GRID_SIZE):
            line = "    "
            for col in range(FLEET_GRID_SIZE):
                key = f"{row},{col}"
                if key in fleet_set:
                    line += "[F]"
                elif key in FLEET_BONUSES:
                    line += f"({FLEET_BONUSES[key]})"
                else:
                    line += " . "
                line += " "
            print(line)

    def _score_navigation(self, player):
        """Score navigation sheet."""
        routes = self.nav_routes[player]
        # 1 point per route, plus bonuses for connected bonus stars
        pts = len(routes)
        connected = set()
        for r in routes:
            connected.add(f"{r[0]},{r[1]}")
            connected.add(f"{r[2]},{r[3]}")
        for star in connected:
            if star in NAV_BONUSES:
                pts += NAV_BONUSES[star]
        return pts

    def _score_expansion(self, player):
        """Score expansion sheet."""
        pts = 0
        for sector in SECTOR_NAMES:
            claimed = self.expansion[player][sector]
            pts += claimed  # 1 pt per planet
            if claimed >= SECTOR_PLANETS[sector]:
                pts += SECTOR_BONUS[sector]  # completion bonus
        return pts

    def _score_industry(self, player):
        """Score industry sheet."""
        pts = 0
        for s_name in self.industry[player]:
            for struct in STRUCTURES:
                if struct["name"] == s_name:
                    pts += struct["points"]
                    break
        return pts

    def _score_warfare(self, player):
        """Score warfare sheet."""
        pts = len(self.warfare[player])  # 1 pt per fleet
        for pos in self.warfare[player]:
            if pos in FLEET_BONUSES:
                pts += FLEET_BONUSES[pos]
        return pts

    def get_move(self):
        """Get a move from the current player."""
        available = self._available_actions()
        print("\n  Available actions from dice:")
        for i, action in enumerate(available):
            count = self._count_action(action)
            print(f"    {i+1}. {action} (strength: {count})")
        print(f"    {len(available)+1}. Skip (take no action)")

        choice = input_with_quit(f"\n  Choose action (1-{len(available)+1}): ").strip()
        try:
            idx = int(choice) - 1
            if idx == len(available):
                return "skip"
            if 0 <= idx < len(available):
                action = available[idx]
                return self._get_action_details(action)
        except ValueError:
            pass
        return None

    def _get_action_details(self, action):
        """Get details for a specific action."""
        p = self.current_player
        strength = self._count_action(action)

        if action == "Navigate":
            print(f"\n  NAVIGATE (connect {strength} route(s)):")
            print("  Connect adjacent stars (row,col to row,col)")
            routes = []
            for i in range(strength):
                inp = input_with_quit(f"  Route {i+1} (r1,c1,r2,c2 or 'done'): ").strip()
                if inp.lower() == "done":
                    break
                try:
                    parts = [int(x.strip()) for x in inp.split(",")]
                    if len(parts) == 4:
                        routes.append(parts)
                    else:
                        print("  Format: r1,c1,r2,c2")
                except ValueError:
                    print("  Enter four numbers separated by commas.")
            return ("navigate", routes)

        elif action == "Expand":
            print(f"\n  EXPAND (claim {strength} planet(s)):")
            claims = []
            for i in range(strength):
                print("  Sectors: ", end="")
                for s in SECTOR_NAMES:
                    remaining = SECTOR_PLANETS[s] - self.expansion[p][s]
                    if remaining > 0:
                        print(f"{s}({remaining} left) ", end="")
                print()
                inp = input_with_quit(f"  Sector for planet {i+1} (or 'done'): ").strip()
                if inp.lower() == "done":
                    break
                # Match sector name
                matched = None
                for s in SECTOR_NAMES:
                    if s.lower().startswith(inp.lower()):
                        matched = s
                        break
                if matched:
                    claims.append(matched)
                else:
                    print(f"  Unknown sector: {inp}")
            return ("expand", claims)

        elif action == "Industry":
            print(f"\n  INDUSTRY (gain {strength} resource(s), then build):")
            self.industry_resources[p] += strength
            print(f"  Resources now: {self.industry_resources[p]}")
            builds = []
            while True:
                print("  Build options:")
                can_build = False
                for struct in STRUCTURES:
                    if self.industry_resources[p] >= struct["cost"]:
                        print(f"    {struct['name']}: cost {struct['cost']}, "
                              f"worth {struct['points']} pts")
                        can_build = True
                if not can_build:
                    print("  Not enough resources to build anything.")
                    break
                inp = input_with_quit("  Build what? (name or 'done'): ").strip()
                if inp.lower() == "done" or not inp:
                    break
                matched = None
                for struct in STRUCTURES:
                    if struct["name"].lower().startswith(inp.lower()):
                        matched = struct
                        break
                if matched and self.industry_resources[p] >= matched["cost"]:
                    self.industry_resources[p] -= matched["cost"]
                    builds.append(matched["name"])
                    print(f"  Built {matched['name']}! Resources left: {self.industry_resources[p]}")
                else:
                    print("  Cannot build that.")
            return ("industry", builds, strength)

        elif action == "Warfare":
            print(f"\n  WARFARE (place {strength} fleet(s)):")
            placements = []
            for i in range(strength):
                inp = input_with_quit(f"  Fleet {i+1} position (row,col or 'done'): ").strip()
                if inp.lower() == "done":
                    break
                try:
                    parts = [int(x.strip()) for x in inp.split(",")]
                    if len(parts) == 2:
                        placements.append(f"{parts[0]},{parts[1]}")
                    else:
                        print("  Format: row,col")
                except ValueError:
                    print("  Enter two numbers separated by comma.")
            return ("warfare", placements)

        return None

    def make_move(self, move):
        """Apply a move to the game state."""
        if move is None:
            return False

        p = self.current_player
        self.log = []

        if move == "skip":
            self.log.append(f"{self.players[p-1]} skips their action.")
            self.round_actions_taken[p] = True
            self._check_advance_round()
            return True

        action_type = move[0]

        if action_type == "navigate":
            routes = move[1]
            added = 0
            for route in routes:
                r1, c1, r2, c2 = route
                # Validate: adjacent stars, within grid
                if not (0 <= r1 < NAV_GRID_SIZE and 0 <= c1 < NAV_GRID_SIZE and
                        0 <= r2 < NAV_GRID_SIZE and 0 <= c2 < NAV_GRID_SIZE):
                    continue
                # Must be adjacent (horizontally or vertically)
                if abs(r1-r2) + abs(c1-c2) != 1:
                    continue
                # Check not already connected
                existing = False
                for r in self.nav_routes[p]:
                    if (r[0] == r1 and r[1] == c1 and r[2] == r2 and r[3] == c2) or \
                       (r[0] == r2 and r[1] == c2 and r[2] == r1 and r[3] == c1):
                        existing = True
                        break
                if not existing:
                    self.nav_routes[p].append([r1, c1, r2, c2])
                    added += 1
            self.log.append(f"{self.players[p-1]} builds {added} navigation route(s).")
            self.round_actions_taken[p] = True
            self._check_advance_round()
            return True

        elif action_type == "expand":
            claims = move[1]
            claimed = 0
            for sector in claims:
                if sector in SECTOR_NAMES:
                    if self.expansion[p][sector] < SECTOR_PLANETS[sector]:
                        self.expansion[p][sector] += 1
                        claimed += 1
            self.log.append(f"{self.players[p-1]} claims {claimed} planet(s).")
            self.round_actions_taken[p] = True
            self._check_advance_round()
            return True

        elif action_type == "industry":
            builds = move[1]
            strength = move[2]
            for b in builds:
                self.industry[p].append(b)
            self.log.append(f"{self.players[p-1]} gains {strength} resources, "
                          f"builds {len(builds)} structure(s).")
            self.round_actions_taken[p] = True
            self._check_advance_round()
            return True

        elif action_type == "warfare":
            placements = move[1]
            placed = 0
            for pos in placements:
                parts = pos.split(",")
                if len(parts) == 2:
                    try:
                        r, c = int(parts[0]), int(parts[1])
                        if 0 <= r < FLEET_GRID_SIZE and 0 <= c < FLEET_GRID_SIZE:
                            if pos not in self.warfare[p]:
                                self.warfare[p].append(pos)
                                placed += 1
                    except ValueError:
                        pass
            self.log.append(f"{self.players[p-1]} positions {placed} fleet(s).")
            self.round_actions_taken[p] = True
            self._check_advance_round()
            return True

        return False

    def _check_advance_round(self):
        """Check if both players have taken actions and advance round."""
        if self.round_actions_taken[1] and self.round_actions_taken[2]:
            self.current_round += 1
            if self.current_round <= self.max_rounds:
                self._roll_dice()

    def check_game_over(self):
        """Check if the game is over."""
        if self.current_round > self.max_rounds:
            self.game_over = True
            score1 = (self._score_navigation(1) + self._score_expansion(1) +
                      self._score_industry(1) + self._score_warfare(1))
            score2 = (self._score_navigation(2) + self._score_expansion(2) +
                      self._score_industry(2) + self._score_warfare(2))
            self.log.append(f"Final: {self.players[0]}={score1} vs {self.players[1]}={score2}")
            if score1 > score2:
                self.winner = 1
            elif score2 > score1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            "max_rounds": self.max_rounds,
            "current_round": self.current_round,
            "dice_results": self.dice_results,
            "phase": self.phase,
            "round_actions_taken": {
                "1": self.round_actions_taken[1],
                "2": self.round_actions_taken[2],
            },
            "nav_routes": {
                "1": self.nav_routes[1],
                "2": self.nav_routes[2],
            },
            "expansion": {
                "1": self.expansion[1],
                "2": self.expansion[2],
            },
            "industry": {
                "1": self.industry[1],
                "2": self.industry[2],
            },
            "industry_resources": {
                "1": self.industry_resources[1],
                "2": self.industry_resources[2],
            },
            "warfare": {
                "1": self.warfare[1],
                "2": self.warfare[2],
            },
            "log": self.log,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.max_rounds = state["max_rounds"]
        self.current_round = state["current_round"]
        self.dice_results = state["dice_results"]
        self.phase = state["phase"]
        self.round_actions_taken = {
            1: state["round_actions_taken"]["1"],
            2: state["round_actions_taken"]["2"],
        }
        self.nav_routes = {
            1: state["nav_routes"]["1"],
            2: state["nav_routes"]["2"],
        }
        self.expansion = {
            1: state["expansion"]["1"],
            2: state["expansion"]["2"],
        }
        self.industry = {
            1: state["industry"]["1"],
            2: state["industry"]["2"],
        }
        self.industry_resources = {
            1: state["industry_resources"]["1"],
            2: state["industry_resources"]["2"],
        }
        self.warfare = {
            1: state["warfare"]["1"],
            2: state["warfare"]["2"],
        }
        self.log = state.get("log", [])

    def get_tutorial(self):
        """Return tutorial text."""
        return """
============================================================
  TWILIGHT INSCRIPTION - Tutorial
============================================================

  OVERVIEW:
  Explore the galaxy by filling in four player sheets!
  Each round, shared dice determine what actions you can take.

  THE FOUR SHEETS:

  1. NAVIGATION - Connect stars on a 5x5 grid
     Build routes between adjacent stars (up/down/left/right).
     Earn 1pt per route + bonus points for special stars.
     Enter routes as: row1,col1,row2,col2

  2. EXPANSION - Claim planets in sectors
     Five sectors with 3-5 planets each.
     Earn 1pt per planet + big bonus for completing a sector.
     Enter sector name (e.g., "Alpha").

  3. INDUSTRY - Build structures using resources
     Gain resources from dice, spend them on structures:
     Mine(1)=1pt, Factory(2)=3pt, Starport(3)=6pt, Citadel(4)=10pt

  4. WARFARE - Position fleets on a 4x4 grid
     Place fleets on the grid for points.
     Bonus positions are marked with numbers.
     Enter positions as: row,col

  DICE & ACTIONS:
  Each round, 4 dice are rolled showing action types.
  Choose one action type - your strength equals how many
  dice show that type (Wild counts for any action).

  STRATEGY:
  Focus on 1-2 sheets to maximize scoring, or spread out
  for flexibility. Completing expansion sectors gives big
  bonuses. Industry structures scale well.

  The game lasts 8 rounds (standard) or 5 rounds (quick).
  Highest total score wins!
============================================================
"""
