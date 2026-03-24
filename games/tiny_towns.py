"""Tiny Towns - Resource placement and building game.

Place resources on a 4x4 grid in specific patterns to construct
buildings. Each building scores differently. Fill your town wisely!
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Resources
RESOURCES = ["Wood", "Brick", "Glass", "Stone", "Wheat"]
RES_ICONS = {"Wood": "W", "Brick": "B", "Glass": "G", "Stone": "S", "Wheat": "H"}

# Buildings: name, pattern (relative positions with resource types), score_type, icon
# Pattern is list of (row_offset, col_offset, resource)
STANDARD_BUILDINGS = [
    {
        "name": "Cottage",
        "icon": "CTG",
        "pattern": [(0, 0, "Wheat"), (0, 1, "Brick"), (1, 0, "Glass")],
        "score": "fixed",
        "points": 3,
        "desc": "3 points",
    },
    {
        "name": "Farm",
        "icon": "FRM",
        "pattern": [(0, 0, "Wheat"), (0, 1, "Wheat"), (1, 0, "Wood"), (1, 1, "Wood")],
        "score": "fixed",
        "points": 4,
        "desc": "4 points",
    },
    {
        "name": "Chapel",
        "icon": "CHP",
        "pattern": [(0, 0, "Stone"), (0, 1, "Glass"), (1, 0, "Stone")],
        "score": "fed",
        "points": 1,
        "desc": "1 point per fed Cottage",
    },
    {
        "name": "Tavern",
        "icon": "TAV",
        "pattern": [(0, 0, "Brick"), (0, 1, "Glass"), (1, 1, "Wood")],
        "score": "set",
        "points_map": {1: 2, 2: 5, 3: 9, 4: 14, 5: 20},
        "desc": "Set scoring: 2/5/9/14/20",
    },
    {
        "name": "Well",
        "icon": "WEL",
        "pattern": [(0, 0, "Stone"), (1, 0, "Wood")],
        "score": "adjacent",
        "points": 1,
        "desc": "1 point per adjacent Cottage",
    },
    {
        "name": "Theater",
        "icon": "THT",
        "pattern": [(0, 0, "Stone"), (0, 1, "Wood"), (1, 0, "Glass")],
        "score": "unique_row_col",
        "points": 1,
        "desc": "1 point per unique building in row/col",
    },
    {
        "name": "Factory",
        "icon": "FCT",
        "pattern": [(0, 0, "Stone"), (0, 1, "Brick"), (1, 0, "Wood"), (1, 1, "Stone")],
        "score": "fixed",
        "points": 5,
        "desc": "5 points, next build uses 1 fewer resource",
    },
    {
        "name": "Warehouse",
        "icon": "WRH",
        "pattern": [(0, 0, "Brick"), (0, 1, "Wood"), (1, 0, "Brick")],
        "score": "fixed",
        "points": 0,
        "desc": "0 points, stores 1 resource for later",
    },
]

# Fortune variant adds coins
FORTUNE_BUILDINGS = STANDARD_BUILDINGS + [
    {
        "name": "Bank",
        "icon": "BNK",
        "pattern": [(0, 0, "Glass"), (0, 1, "Brick"), (1, 0, "Stone")],
        "score": "coins",
        "points": 4,
        "desc": "4 points + earn 1 coin when built",
    },
    {
        "name": "Market",
        "icon": "MKT",
        "pattern": [(0, 0, "Wood"), (0, 1, "Glass"), (1, 0, "Stone"), (1, 1, "Wheat")],
        "score": "fixed",
        "points": 6,
        "desc": "6 points",
    },
]


class TinyTownsGame(BaseGame):
    """Tiny Towns - Resource placement and pattern building."""

    name = "Tiny Towns"
    description = "Place resources on a 4x4 grid in patterns to construct buildings"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "fortune": "Fortune Variant",
    }

    GRID_SIZE = 4

    def __init__(self, variation=None):
        super().__init__(variation)
        self.boards = {}  # player -> 4x4 grid
        self.scores = {}
        self.coins = {}
        self.buildings_available = []
        self.current_resource = None
        self.rounds_played = 0
        self.max_rounds = 15
        self.phase = "choose_resource"  # choose_resource, place_resource, build
        self.factory_bonus = {}  # player -> bool
        self.log = []

    def setup(self):
        for sp in ["1", "2"]:
            # Grid cells: None, {"type": "resource", "resource": "Wood"} or {"type": "building", "building": {...}}
            self.boards[sp] = [[None for _ in range(self.GRID_SIZE)] for _ in range(self.GRID_SIZE)]
            self.scores[sp] = 0
            self.coins[sp] = 0
            self.factory_bonus[sp] = False

        if self.variation == "fortune":
            self.buildings_available = list(FORTUNE_BUILDINGS)
        else:
            self.buildings_available = list(STANDARD_BUILDINGS)

        self.current_resource = None
        self.rounds_played = 0
        self.phase = "choose_resource"
        self.log = ["Game started! Choose a resource to place."]

    def _board_str(self, sp):
        """Return a string representation of a player's board."""
        lines = []
        lines.append("     0    1    2    3")
        for r in range(self.GRID_SIZE):
            row_str = f"  {r} "
            for c in range(self.GRID_SIZE):
                cell = self.boards[sp][r][c]
                if cell is None:
                    row_str += " .   "
                elif cell["type"] == "resource":
                    icon = RES_ICONS[cell["resource"]]
                    row_str += f" ({icon}) "
                elif cell["type"] == "building":
                    icon = cell["building"]["icon"]
                    row_str += f" {icon} "
                else:
                    row_str += " ?   "
            lines.append(row_str)
        return "\n".join(lines)

    def _empty_cells(self, sp):
        """Count empty cells."""
        count = 0
        for r in range(self.GRID_SIZE):
            for c in range(self.GRID_SIZE):
                if self.boards[sp][r][c] is None:
                    count += 1
        return count

    def _resource_cells(self, sp):
        """Get list of cells with resources."""
        cells = []
        for r in range(self.GRID_SIZE):
            for c in range(self.GRID_SIZE):
                cell = self.boards[sp][r][c]
                if cell and cell["type"] == "resource":
                    cells.append((r, c, cell["resource"]))
        return cells

    def _check_pattern(self, sp, building, anchor_r, anchor_c):
        """Check if a building pattern matches starting at anchor position."""
        for dr, dc, res in building["pattern"]:
            r, c = anchor_r + dr, anchor_c + dc
            if r < 0 or r >= self.GRID_SIZE or c < 0 or c >= self.GRID_SIZE:
                return False
            cell = self.boards[sp][r][c]
            if cell is None or cell["type"] != "resource" or cell["resource"] != res:
                return False
        return True

    def _find_buildable(self, sp):
        """Find all possible builds for a player."""
        options = []
        for building in self.buildings_available:
            for r in range(self.GRID_SIZE):
                for c in range(self.GRID_SIZE):
                    if self._check_pattern(sp, building, r, c):
                        options.append((building, r, c))
        return options

    def _build(self, sp, building, anchor_r, anchor_c, place_r, place_c):
        """Execute a build: remove resources, place building."""
        # Remove pattern resources
        for dr, dc, res in building["pattern"]:
            r, c = anchor_r + dr, anchor_c + dc
            self.boards[sp][r][c] = None

        # Place building on chosen cell
        self.boards[sp][place_r][place_c] = {
            "type": "building",
            "building": building,
        }

        if building["name"] == "Factory":
            self.factory_bonus[sp] = True
        if building["name"] == "Bank" and self.variation == "fortune":
            self.coins[sp] += 1

    def _score_player(self, sp):
        """Calculate total score for a player."""
        score = 0
        buildings_on_board = []
        for r in range(self.GRID_SIZE):
            for c in range(self.GRID_SIZE):
                cell = self.boards[sp][r][c]
                if cell and cell["type"] == "building":
                    buildings_on_board.append((r, c, cell["building"]))

        # Count building types for set scoring
        type_counts = {}
        for _, _, bld in buildings_on_board:
            type_counts[bld["name"]] = type_counts.get(bld["name"], 0) + 1

        for r, c, bld in buildings_on_board:
            if bld["score"] == "fixed":
                score += bld["points"]
            elif bld["score"] == "set":
                # Scored at end for all taverns together
                pass
            elif bld["score"] == "adjacent":
                # Count adjacent cottages
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < self.GRID_SIZE and 0 <= nc < self.GRID_SIZE:
                        adj = self.boards[sp][nr][nc]
                        if adj and adj["type"] == "building" and adj["building"]["name"] == "Cottage":
                            score += bld["points"]
            elif bld["score"] == "fed":
                # 1 point per cottage on board
                cottages = sum(1 for _, _, b in buildings_on_board if b["name"] == "Cottage")
                score += cottages * bld["points"]
            elif bld["score"] == "unique_row_col":
                # Unique building types in same row + col
                seen = set()
                for c2 in range(self.GRID_SIZE):
                    cell2 = self.boards[sp][r][c2]
                    if cell2 and cell2["type"] == "building" and c2 != c:
                        seen.add(cell2["building"]["name"])
                for r2 in range(self.GRID_SIZE):
                    cell2 = self.boards[sp][r2][c]
                    if cell2 and cell2["type"] == "building" and r2 != r:
                        seen.add(cell2["building"]["name"])
                score += len(seen)
            elif bld["score"] == "coins":
                score += bld["points"]

        # Tavern set scoring
        tavern_count = type_counts.get("Tavern", 0)
        if tavern_count > 0:
            pts_map = STANDARD_BUILDINGS[3]["points_map"]  # Tavern is index 3
            score += pts_map.get(tavern_count, pts_map.get(5, 20))

        # Fortune coins
        if self.variation == "fortune":
            score += self.coins[sp] * 2

        # Penalty for unfilled/resource cells
        for r in range(self.GRID_SIZE):
            for c in range(self.GRID_SIZE):
                cell = self.boards[sp][r][c]
                if cell is not None and cell["type"] == "resource":
                    score -= 1  # Leftover resources are -1

        return score

    def display(self):
        clear_screen()
        mode = "Fortune" if self.variation == "fortune" else "Standard"
        print(f"{'=' * 55}")
        print(f"  TINY TOWNS - {mode} | Round {self.rounds_played}/{self.max_rounds}")
        print(f"{'=' * 55}")

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            sc = self._score_player(sp)
            extra = f" Coins={self.coins[sp]}" if self.variation == "fortune" else ""
            print(f"\n  {self.players[p-1]} (Score: {sc}{extra}){marker}")
            print(self._board_str(sp))

        print()
        if self.current_resource:
            print(f"  Current resource: {self.current_resource} ({RES_ICONS[self.current_resource]})")

        # Show buildings
        print("\n  Buildings available:")
        for i, bld in enumerate(self.buildings_available[:8]):
            pattern = ", ".join(f"{RES_ICONS[res]}" for _, _, res in bld["pattern"])
            print(f"    [{i+1}] {bld['name']} ({bld['icon']}): {pattern} - {bld['desc']}")

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = str(self.current_player)

        if self.phase == "choose_resource":
            print("  Choose a resource:")
            for i, res in enumerate(RESOURCES):
                print(f"    [{i+1}] {res} ({RES_ICONS[res]})")
            choice = input_with_quit("  Resource: ").strip()
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(RESOURCES):
                    return {"action": "choose_resource", "resource": RESOURCES[idx]}
            except ValueError:
                pass
            return None

        elif self.phase == "place_resource":
            print(f"  Place {self.current_resource} ({RES_ICONS[self.current_resource]}) on your board.")
            pos = input_with_quit("  Position (row,col): ").strip()
            try:
                parts = pos.split(",")
                row, col = int(parts[0]), int(parts[1])
                return {"action": "place_resource", "row": row, "col": col}
            except (ValueError, IndexError):
                return None

        elif self.phase == "build":
            buildable = self._find_buildable(cp)
            if not buildable:
                return {"action": "skip_build"}

            print("  Buildable patterns found:")
            for i, (bld, r, c) in enumerate(buildable):
                print(f"    [{i+1}] {bld['name']} at anchor ({r},{c})")
            print(f"    [0] Skip building")

            choice = input_with_quit("  Build: ").strip()
            try:
                idx = int(choice)
                if idx == 0:
                    return {"action": "skip_build"}
                idx -= 1
                if 0 <= idx < len(buildable):
                    bld, anchor_r, anchor_c = buildable[idx]
                    # Choose where to place the building (must be one of the pattern cells)
                    print(f"  Place {bld['name']} on which pattern cell?")
                    cells = [(anchor_r + dr, anchor_c + dc) for dr, dc, _ in bld["pattern"]]
                    for j, (pr, pc) in enumerate(cells):
                        print(f"    [{j+1}] ({pr},{pc})")
                    pchoice = input_with_quit("  Cell: ").strip()
                    pidx = int(pchoice) - 1
                    if 0 <= pidx < len(cells):
                        pr, pc = cells[pidx]
                        return {"action": "build", "building_idx": idx,
                                "anchor_r": anchor_r, "anchor_c": anchor_c,
                                "place_r": pr, "place_c": pc,
                                "buildable": buildable}
            except (ValueError, IndexError):
                pass
            return None

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "choose_resource":
            self.current_resource = move["resource"]
            self.phase = "place_resource"
            self.log.append(f"{self.players[self.current_player-1]} chose {self.current_resource}")
            return True

        if action == "place_resource":
            row, col = move["row"], move["col"]
            if row < 0 or row >= self.GRID_SIZE or col < 0 or col >= self.GRID_SIZE:
                return False
            if self.boards[cp][row][col] is not None:
                return False
            self.boards[cp][row][col] = {"type": "resource", "resource": self.current_resource}
            self.log.append(f"Placed {self.current_resource} at ({row},{col})")
            self.phase = "build"
            return True

        if action == "build":
            buildable = move.get("buildable", self._find_buildable(cp))
            idx = move["building_idx"]
            if idx < 0 or idx >= len(buildable):
                return False
            bld, anchor_r, anchor_c = buildable[idx]
            place_r, place_c = move["place_r"], move["place_c"]
            self._build(cp, bld, anchor_r, anchor_c, place_r, place_c)
            self.log.append(f"{self.players[self.current_player-1]} built {bld['name']}!")
            # Check for more builds
            if self._find_buildable(cp):
                self.phase = "build"
            else:
                self._end_turn()
            return True

        if action == "skip_build":
            self._end_turn()
            return True

        return False

    def _end_turn(self):
        """End current player's turn."""
        if self.current_player == 2:
            self.rounds_played += 1
        # Both players place the same resource on their boards
        # In 2P: after P1 chooses and places, P2 places same resource, then P2 chooses next
        if self.current_player == 1:
            # P2 now places the same resource
            self.phase = "place_resource"
        else:
            self.current_resource = None
            self.phase = "choose_resource"

    def check_game_over(self):
        if self.rounds_played >= self.max_rounds:
            self.game_over = True
            s1 = self._score_player("1")
            s2 = self._score_player("2")
            self.scores["1"] = s1
            self.scores["2"] = s2
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            self.log.append(f"Game over! P1={s1}, P2={s2}")
            return

        # Also end if both boards are full
        if all(self._empty_cells(sp) == 0 for sp in ["1", "2"]):
            self.game_over = True
            s1 = self._score_player("1")
            s2 = self._score_player("2")
            self.scores["1"] = s1
            self.scores["2"] = s2
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "boards": self.boards,
            "scores": self.scores,
            "coins": self.coins,
            "current_resource": self.current_resource,
            "rounds_played": self.rounds_played,
            "phase": self.phase,
            "factory_bonus": self.factory_bonus,
            "log": self.log,
        }

    def load_state(self, state):
        self.boards = state["boards"]
        self.scores = state["scores"]
        self.coins = state.get("coins", {"1": 0, "2": 0})
        self.current_resource = state["current_resource"]
        self.rounds_played = state["rounds_played"]
        self.phase = state["phase"]
        self.factory_bonus = state.get("factory_bonus", {"1": False, "2": False})
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  TINY TOWNS - Tutorial
============================================================
  Place resources (W=Wood, B=Brick, G=Glass, S=Stone,
  H=Wheat) on a 4x4 grid in patterns to build structures.

  GAMEPLAY:
  1. CHOOSE a resource type
  2. PLACE it on an empty cell
  3. BUILD if pattern matches (resources removed, building placed)

  BUILDINGS: Cottage(3pts), Farm(4pts), Chapel(1pt/Cottage),
  Tavern(set:2/5/9/14/20), Well(1pt/adj Cottage),
  Theater(1pt/unique in row+col), Factory(5pts), Warehouse(0pts)

  FORTUNE: Adds Bank(4pts+coin) and Market(6pts). Coins=2pts.
  SCORING: Building pts + bonuses - 1 per leftover resource.
============================================================
"""
