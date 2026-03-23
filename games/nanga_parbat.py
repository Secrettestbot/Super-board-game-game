"""Nanga Parbat - Mountain climbing route-building game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Resources
OXYGEN = "O"
ROPE = "R"
FOOD = "F"
RESOURCE_NAMES = {OXYGEN: "Oxygen", ROPE: "Rope", FOOD: "Food"}
RESOURCE_SYMBOLS = {OXYGEN: "O", ROPE: "R", FOOD: "F"}

# Camp types
EMPTY_CAMP = "."
SUMMIT_FLAG = "!"


def _build_mountain(levels):
    """Build a triangular mountain grid.

    Level 0 = summit (1 camp), level N = base (N+1 camps).
    Each camp has a position (level, index) and optional resource.
    Returns dict of camp data keyed by "level-index" strings.
    """
    camps = {}
    resources = [OXYGEN, ROPE, FOOD]
    for level in range(levels):
        width = level + 1
        for idx in range(width):
            key = f"{level}-{idx}"
            # Summit has a flag, other camps have random resources
            if level == 0:
                camps[key] = {
                    "resource": None,
                    "flag": True,
                    "climber": None,  # None, 1, or 2
                    "collected_by": [],  # list of player numbers who collected
                }
            else:
                res = random.choice(resources) if random.random() < 0.7 else None
                camps[key] = {
                    "resource": res,
                    "flag": False,
                    "climber": None,
                    "collected_by": [],
                }
    return camps


def _get_camp_connections(level, idx, max_level):
    """Get camps connected to this camp (can move to)."""
    connections = []
    # Move up (to level-1): connects to idx-1 and idx (if valid)
    if level > 0:
        if idx - 1 >= 0:
            connections.append(f"{level - 1}-{idx - 1}")
        if idx < level:
            connections.append(f"{level - 1}-{idx}")
    # Move down (to level+1): connects to idx and idx+1
    if level < max_level - 1:
        connections.append(f"{level + 1}-{idx}")
        connections.append(f"{level + 1}-{idx + 1}")
    # Move sideways on same level
    if idx > 0:
        connections.append(f"{level}-{idx - 1}")
    if idx < level:
        connections.append(f"{level}-{idx + 1}")
    return connections


class NangaParbatGame(BaseGame):
    """Nanga Parbat: Climb the mountain, collect resources, reach the summit."""

    name = "Nanga Parbat"
    description = "Mountain climbing route-building game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (5-level mountain)",
        "quick": "Quick (3-level mountain)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.levels = 5
        self.camps = {}
        self.climbers = {1: [], 2: []}  # camp keys where each player has climbers
        self.resources = {1: {OXYGEN: 0, ROPE: 0, FOOD: 0},
                          2: {OXYGEN: 0, ROPE: 0, FOOD: 0}}
        self.scores = [0, 0]
        self.climbers_per_player = 3
        self.climbers_placed = {1: 0, 2: 0}
        self.summit_claimed = {1: False, 2: False}
        self.phase = "place"  # "place" or "move"
        self.turns_taken = 0
        self.max_turns = 30

    def setup(self):
        if self.variation == "quick":
            self.levels = 3
            self.climbers_per_player = 2
            self.max_turns = 18
        else:
            self.levels = 5
            self.climbers_per_player = 3
            self.max_turns = 30

        self.camps = _build_mountain(self.levels)
        self.climbers = {1: [], 2: []}
        self.resources = {1: {OXYGEN: 0, ROPE: 0, FOOD: 0},
                          2: {OXYGEN: 0, ROPE: 0, FOOD: 0}}
        self.scores = [0, 0]
        self.climbers_placed = {1: 0, 2: 0}
        self.summit_claimed = {1: False, 2: False}
        self.phase = "place"
        self.turns_taken = 0

    def _display_mountain(self):
        """Render the mountain as ASCII art."""
        max_width = self.levels * 6
        for level in range(self.levels):
            width = level + 1
            camps_str = ""
            for idx in range(width):
                key = f"{level}-{idx}"
                camp = self.camps[key]
                if camp["climber"] == 1:
                    marker = " P1"
                elif camp["climber"] == 2:
                    marker = " P2"
                elif camp["flag"]:
                    marker = " !!"
                elif camp["resource"]:
                    marker = f" [{camp['resource']}]"
                else:
                    marker = " ()"
                if key in self.climbers.get(1, []) and key in self.climbers.get(2, []):
                    marker = "1&2"
                elif key in self.climbers.get(1, []):
                    marker = "[1]"
                elif key in self.climbers.get(2, []):
                    marker = "[2]"
                elif camp["flag"]:
                    marker = " ! "
                elif camp["resource"] and camp["resource"] not in [
                    p for p in camp["collected_by"]
                ]:
                    marker = f"({camp['resource']})"
                else:
                    marker = " . "
                camps_str += f"  {marker}  "

            indent = " " * ((max_width - len(camps_str)) // 2)
            level_label = f"L{level}" if level > 0 else "^^"
            altitude_pts = self.levels - level
            print(f"  {level_label} [{altitude_pts}pt] {indent}{camps_str}")

            # Draw connectors
            if level < self.levels - 1:
                next_width = level + 2
                connectors = ""
                for idx in range(width):
                    connectors += "  / \\  "
                indent2 = " " * ((max_width - len(connectors)) // 2)
                print(f"            {indent2}{connectors}")

    def display(self):
        clear_screen()
        print(f"{'='*60}")
        print(f"  NANGA PARBAT - {self.variations[self.variation]}")
        print(f"  {self.players[self.current_player - 1]}'s turn | Phase: {self.phase.upper()}")
        print(f"  Turn {self.turns_taken + 1}/{self.max_turns}")
        print(f"{'='*60}")
        print()

        self._display_mountain()

        print()
        print(f"  {'='*50}")
        for p in [1, 2]:
            res = self.resources[p]
            climbers_info = f"{len(self.climbers[p])}/{self.climbers_per_player} placed"
            summit = "YES" if self.summit_claimed[p] else "no"
            print(f"  {self.players[p-1]}: Score={self.scores[p-1]} | "
                  f"O={res[OXYGEN]} R={res[ROPE]} F={res[FOOD]} | "
                  f"Climbers: {climbers_info} | Summit: {summit}")
        print(f"  {'='*50}")
        print()

    def _get_valid_placements(self, player):
        """Get valid camps for placing a new climber (base level only)."""
        base_level = self.levels - 1
        valid = []
        for idx in range(base_level + 1):
            key = f"{base_level}-{idx}"
            # Can place at base if no other climber there
            occupied = key in self.climbers[1] or key in self.climbers[2]
            if not occupied:
                valid.append(key)
        return valid

    def _get_valid_moves(self, player):
        """Get valid moves for existing climbers."""
        moves = []
        for camp_key in self.climbers[player]:
            parts = camp_key.split("-")
            level, idx = int(parts[0]), int(parts[1])
            connections = _get_camp_connections(level, idx, self.levels)
            for target in connections:
                # Check movement cost
                t_parts = target.split("-")
                t_level = int(t_parts[0])
                # Moving up requires resources
                can_move = True
                cost = {}
                if t_level < level:
                    # Going up: need oxygen
                    if self.resources[player][OXYGEN] < 1:
                        # Can still move if have rope
                        if self.resources[player][ROPE] < 1:
                            can_move = False
                        else:
                            cost[ROPE] = 1
                    else:
                        cost[OXYGEN] = 1
                # Can't move to camp occupied by own climber
                if target in self.climbers[player]:
                    can_move = False
                if can_move:
                    moves.append((camp_key, target, cost))
        return moves

    def get_move(self):
        player = self.current_player

        if self.phase == "place":
            if self.climbers_placed[player] >= self.climbers_per_player:
                print("  All climbers placed. Choose action: 'move' a climber")
                self.phase = "move"
                return self.get_move()

            valid = self._get_valid_placements(player)
            if not valid:
                print("  No valid placements. Switching to move phase.")
                self.phase = "move"
                return self.get_move()

            print("  Actions: 'place <camp>' to place climber, 'move' to move instead")
            print(f"  Valid base camps: {', '.join(valid)}")
            action = input_with_quit("  > ")
            parts = action.strip().split()
            if not parts:
                return None
            if parts[0].lower() == "move":
                self.phase = "move"
                return self.get_move()
            if parts[0].lower() == "place" and len(parts) > 1:
                return ("place", parts[1])
            # Try as just camp key
            return ("place", action.strip())

        else:  # move phase
            valid_moves = self._get_valid_moves(player)
            if not valid_moves:
                print("  No valid moves. Type 'pass' to end turn.")
                action = input_with_quit("  > ")
                return ("pass",)

            print("  Your climbers: " + ", ".join(self.climbers[player]))
            print("  Valid moves:")
            for i, (src, dst, cost) in enumerate(valid_moves):
                cost_str = ""
                if cost:
                    cost_str = " (costs: " + ", ".join(
                        f"{RESOURCE_NAMES[k]}={v}" for k, v in cost.items()
                    ) + ")"
                print(f"    [{i}] {src} -> {dst}{cost_str}")

            action = input_with_quit("  Choose move [number] or 'place' or 'pass': ")
            if action.strip().lower() == "pass":
                return ("pass",)
            if action.strip().lower() == "place":
                self.phase = "place"
                return self.get_move()
            return ("move", action.strip(), valid_moves)

    def make_move(self, move):
        if move is None:
            return False

        player = self.current_player

        if move[0] == "pass":
            self.turns_taken += 1
            self.phase = "place"
            return True

        if move[0] == "place":
            camp_key = move[1]
            valid = self._get_valid_placements(player)
            if camp_key not in valid:
                return False
            self.climbers[player].append(camp_key)
            self.climbers_placed[player] += 1
            # Collect resource at camp
            camp = self.camps[camp_key]
            if camp["resource"] and player not in camp["collected_by"]:
                self.resources[player][camp["resource"]] += 1
                camp["collected_by"].append(player)
            self.turns_taken += 1
            self.phase = "place"
            return True

        if move[0] == "move":
            try:
                idx = int(move[1])
                valid_moves = move[2]
            except (ValueError, IndexError):
                return False
            if idx < 0 or idx >= len(valid_moves):
                return False

            src, dst, cost = valid_moves[idx]
            # Pay costs
            for res, amount in cost.items():
                if self.resources[player][res] < amount:
                    return False
                self.resources[player][res] -= amount

            # Move climber
            self.climbers[player].remove(src)
            self.climbers[player].append(dst)

            # Collect resource at destination
            camp = self.camps[dst]
            if camp["resource"] and player not in camp["collected_by"]:
                self.resources[player][camp["resource"]] += 1
                camp["collected_by"].append(player)

            # Check summit
            if camp["flag"] and not self.summit_claimed[player]:
                self.summit_claimed[player] = True
                # Bonus points for summit
                self.scores[player - 1] += self.levels * 3

            # Score altitude points
            dst_parts = dst.split("-")
            dst_level = int(dst_parts[0])
            altitude_pts = self.levels - dst_level
            self.scores[player - 1] += altitude_pts

            self.turns_taken += 1
            self.phase = "place"
            return True

        return False

    def check_game_over(self):
        if self.turns_taken >= self.max_turns:
            self._final_scoring()
            self.game_over = True
            return

        # Also end if both summits claimed
        if self.summit_claimed[1] and self.summit_claimed[2]:
            self._final_scoring()
            self.game_over = True
            return

    def _final_scoring(self):
        """Add end-game bonuses."""
        for p in [1, 2]:
            # Bonus for remaining resources
            for res in [OXYGEN, ROPE, FOOD]:
                self.scores[p - 1] += self.resources[p][res]
            # Bonus for summit
            if self.summit_claimed[p]:
                pass  # already scored during movement

            # Score for highest climber position
            highest = self.levels  # worst = base level
            for key in self.climbers[p]:
                level = int(key.split("-")[0])
                highest = min(highest, level)
            if self.climbers[p]:
                self.scores[p - 1] += (self.levels - highest) * 2

        if self.scores[0] > self.scores[1]:
            self.winner = 1
        elif self.scores[1] > self.scores[0]:
            self.winner = 2
        else:
            self.winner = None

    def get_state(self):
        return {
            "levels": self.levels,
            "camps": self.camps,
            "climbers": {str(k): v for k, v in self.climbers.items()},
            "resources": {str(k): v for k, v in self.resources.items()},
            "scores": self.scores,
            "climbers_per_player": self.climbers_per_player,
            "climbers_placed": {str(k): v for k, v in self.climbers_placed.items()},
            "summit_claimed": {str(k): v for k, v in self.summit_claimed.items()},
            "phase": self.phase,
            "turns_taken": self.turns_taken,
            "max_turns": self.max_turns,
        }

    def load_state(self, state):
        self.levels = state["levels"]
        self.camps = state["camps"]
        self.climbers = {int(k): v for k, v in state["climbers"].items()}
        self.resources = {int(k): v for k, v in state["resources"].items()}
        self.scores = list(state["scores"])
        self.climbers_per_player = state["climbers_per_player"]
        self.climbers_placed = {int(k): v for k, v in state["climbers_placed"].items()}
        self.summit_claimed = {int(k): v for k, v in state["summit_claimed"].items()}
        self.phase = state["phase"]
        self.turns_taken = state["turns_taken"]
        self.max_turns = state["max_turns"]

    def get_tutorial(self):
        return """
==========================================
  NANGA PARBAT - Tutorial
==========================================

Race to climb the mountain and reach the summit!

THE MOUNTAIN:
  A triangular grid with camps at intersections.
  Level 0 (top) = Summit with flag (!)
  Higher level numbers = lower on the mountain
  Camps may contain resources: (O)xygen, (R)ope, (F)ood

TURNS:
  Each turn, choose to PLACE a new climber or MOVE an existing one.

  PLACE: Put a climber at any unoccupied base camp.
  MOVE:  Move a climber to a connected camp.
    - Moving UP costs 1 Oxygen (or 1 Rope if no Oxygen)
    - Moving sideways or down is free
    - Can't move to a camp with your own climber

RESOURCES:
  Collect resources by landing on a camp (each camp yields once per player).
  Resources fuel your climb upward.

SCORING:
  - Reaching the summit: bonus points (levels x 3)
  - Each upward move scores altitude points
  - Remaining resources = 1 point each
  - Highest climber position gives end-game bonus

GAME END:
  The game ends when both players reach the summit
  or after the maximum number of turns.

CONTROLS:
  place <camp>  - Place climber (e.g., 'place 4-2')
  move          - Switch to move mode
  <number>      - Choose a move from the list
  pass          - Pass your turn
"""
