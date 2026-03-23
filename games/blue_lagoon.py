"""Blue Lagoon - Two-phase exploration and settlement game on island map."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Terrain
SEA = "~"
LAND = "#"
EMPTY = "."

# Resources
STATUETTE = "S"
COCONUT = "C"
WATER_RES = "W"
BAMBOO = "B"
PRECIOUS = "P"
RESOURCES = [STATUETTE, COCONUT, WATER_RES, BAMBOO, PRECIOUS]
RESOURCE_NAMES = {STATUETTE: "Statuette", COCONUT: "Coconut", WATER_RES: "Water",
                  BAMBOO: "Bamboo", PRECIOUS: "Precious Stone"}

# Piece types
SETTLER = "s"
VILLAGE = "v"


class BlueLagoonGame(BaseGame):
    """Blue Lagoon: Explore islands, collect resources, and build settlements."""

    name = "Blue Lagoon"
    description = "Two-phase exploration/settlement game on an island archipelago"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full map with 8 islands, 2 scoring phases",
        "quick": "Smaller map with 5 islands, single phase only",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.rows = 0
        self.cols = 0
        self.board = []
        self.terrain = []
        self.islands = {}  # island_id -> list of (r,c)
        self.resources = {}  # (r,c) as "r,c" -> resource type
        self.pieces = {1: [], 2: []}  # list of (r,c,type)
        self.villages = {1: [], 2: []}
        self.collected = {1: [], 2: []}
        self.scores = {1: 0, 2: 0}
        self.phase = 1
        self.max_phase = 2
        self.settlers_remaining = {1: 0, 2: 0}
        self.villages_remaining = {1: 0, 2: 0}
        self.num_islands = 0
        self.islands_connected = {1: set(), 2: set()}

    def setup(self):
        if self.variation == "quick":
            self.rows, self.cols = 10, 10
            self.num_islands = 5
            self.max_phase = 1
            settlers = 15
            villages = 3
        else:
            self.rows, self.cols = 14, 14
            self.num_islands = 8
            self.max_phase = 2
            settlers = 20
            villages = 5

        for p in [1, 2]:
            self.settlers_remaining[p] = settlers
            self.villages_remaining[p] = villages

        self._create_map()
        self._place_resources()
        self.phase = 1

    def _create_map(self):
        self.terrain = [[SEA for _ in range(self.cols)] for _ in range(self.rows)]
        self.board = [[SEA for _ in range(self.cols)] for _ in range(self.rows)]
        self.islands = {}

        for island_id in range(1, self.num_islands + 1):
            self._generate_island(island_id)

    def _generate_island(self, island_id):
        attempts = 0
        while attempts < 50:
            attempts += 1
            center_r = random.randint(2, self.rows - 3)
            center_c = random.randint(2, self.cols - 3)
            if self.terrain[center_r][center_c] != SEA:
                continue

            # Check distance from other islands
            too_close = False
            for oid, cells in self.islands.items():
                for cr, cc in cells:
                    if abs(cr - center_r) + abs(cc - center_c) < 3:
                        too_close = True
                        break
                if too_close:
                    break
            if too_close:
                continue

            # Grow island from center
            island_cells = [(center_r, center_c)]
            size = random.randint(4, 8)
            frontier = [(center_r, center_c)]

            while len(island_cells) < size and frontier:
                cr, cc = random.choice(frontier)
                for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nr, nc = cr + dr, cc + dc
                    if (0 <= nr < self.rows and 0 <= nc < self.cols
                            and self.terrain[nr][nc] == SEA
                            and (nr, nc) not in island_cells
                            and len(island_cells) < size):
                        island_cells.append((nr, nc))
                        frontier.append((nr, nc))
                frontier.remove((cr, cc))

            for r, c in island_cells:
                self.terrain[r][c] = LAND
                self.board[r][c] = LAND
            self.islands[island_id] = island_cells
            return

    def _place_resources(self):
        self.resources = {}
        all_land = []
        for iid, cells in self.islands.items():
            all_land.extend(cells)

        random.shuffle(all_land)
        # Place 2 of each resource type
        resource_pool = RESOURCES * 2
        if self.variation != "quick":
            resource_pool = RESOURCES * 3

        random.shuffle(resource_pool)
        for i, res in enumerate(resource_pool):
            if i < len(all_land):
                r, c = all_land[i]
                key = f"{r},{c}"
                self.resources[key] = res

    def _get_island_id(self, r, c):
        for iid, cells in self.islands.items():
            if (r, c) in cells:
                return iid
        return None

    def _cell_display(self, r, c):
        # Check for player pieces
        for p in [1, 2]:
            for pr, pc, ptype in self.pieces[p]:
                if pr == r and pc == c:
                    if ptype == VILLAGE:
                        return f"{p}V "
                    else:
                        return f"{p}s "

        key = f"{r},{c}"
        if key in self.resources:
            return f" {self.resources[key]} "

        if self.terrain[r][c] == LAND:
            return " # "
        return " ~ "

    def display(self):
        clear_screen()
        p = self.current_player
        print(f"=== Blue Lagoon === Phase {self.phase}/{self.max_phase} | Turn {self.turn_number + 1}")
        print(f"  {self.players[0]}: Score={self.scores[1]} | Settlers={self.settlers_remaining[1]} "
              f"Villages={self.villages_remaining[1]}")
        print(f"  {self.players[1]}: Score={self.scores[2]} | Settlers={self.settlers_remaining[2]} "
              f"Villages={self.villages_remaining[2]}")
        print()

        header = "   " + "".join(f"{c:3d}" for c in range(self.cols))
        print(header)
        for r in range(self.rows):
            row_str = f"{r:2d} " + "".join(self._cell_display(r, c) for c in range(self.cols))
            print(row_str)
        print()

        # Show collected resources
        p1_res = ", ".join(self.collected[1]) if self.collected[1] else "none"
        p2_res = ", ".join(self.collected[2]) if self.collected[2] else "none"
        print(f"  P1 resources: {p1_res}")
        print(f"  P2 resources: {p2_res}")
        print(f"  Islands connected - P1: {len(self.islands_connected[1])} "
              f"P2: {len(self.islands_connected[2])}")
        print(f"\nPlayer {p}'s turn")

    def get_move(self):
        p = self.current_player
        print("\nActions:")
        if self.phase == 1:
            print("  settler ROW COL  - Place settler (can go on sea or land)")
            print("  village ROW COL  - Place village (land only, costs village token)")
        else:
            print("  settler ROW COL  - Place settler (must be adjacent to your piece)")
            print("  village ROW COL  - Place village (land, adjacent to your piece)")
        print("  pass             - End turn")
        move = input_with_quit("Move: ").strip().lower()
        return move

    def make_move(self, move):
        parts = move.split()
        if not parts:
            return False
        p = self.current_player

        if parts[0] == "pass":
            return True

        if len(parts) < 3:
            return False

        action = parts[0]
        try:
            r, c = int(parts[1]), int(parts[2])
        except ValueError:
            return False

        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False

        # Check cell not already occupied
        for pp in [1, 2]:
            for pr, pc, _ in self.pieces[pp]:
                if pr == r and pc == c:
                    return False

        if action == "settler":
            return self._place_settler(p, r, c)
        elif action == "village":
            return self._place_village(p, r, c)
        return False

    def _is_adjacent_to_own_piece(self, player, r, c):
        for pr, pc, _ in self.pieces[player]:
            if abs(pr - r) + abs(pc - c) == 1:
                return True
        return False

    def _place_settler(self, player, r, c):
        if self.settlers_remaining[player] <= 0:
            return False

        if self.phase == 1:
            # In exploration phase, can place on any sea or land
            pass
        else:
            # In settlement phase, must be adjacent to own piece
            if not self.pieces[player]:
                # First piece can go anywhere on land
                if self.terrain[r][c] != LAND:
                    return False
            elif not self._is_adjacent_to_own_piece(player, r, c):
                return False

        self.pieces[player].append((r, c, SETTLER))
        self.settlers_remaining[player] -= 1

        # Collect resource if present
        key = f"{r},{c}"
        if key in self.resources:
            self.collected[player].append(self.resources[key])
            del self.resources[key]

        # Track island connections
        iid = self._get_island_id(r, c)
        if iid is not None:
            self.islands_connected[player].add(iid)

        return True

    def _place_village(self, player, r, c):
        if self.villages_remaining[player] <= 0:
            return False
        if self.terrain[r][c] != LAND:
            return False

        if self.phase == 2 and self.pieces[player]:
            if not self._is_adjacent_to_own_piece(player, r, c):
                return False

        self.pieces[player].append((r, c, VILLAGE))
        self.villages[player].append((r, c))
        self.villages_remaining[player] -= 1

        key = f"{r},{c}"
        if key in self.resources:
            self.collected[player].append(self.resources[key])
            del self.resources[key]

        iid = self._get_island_id(r, c)
        if iid is not None:
            self.islands_connected[player].add(iid)

        return True

    def check_game_over(self):
        # Check if both players have no moves
        both_empty = all(
            self.settlers_remaining[p] == 0 and self.villages_remaining[p] == 0
            for p in [1, 2]
        )
        no_resources = len(self.resources) == 0

        if both_empty or no_resources or self.turn_number >= (50 if self.variation == "quick" else 100):
            if self.phase < self.max_phase:
                self._score_phase()
                self._start_new_phase()
            else:
                self._score_phase()
                self.game_over = True
                if self.scores[1] > self.scores[2]:
                    self.winner = 1
                elif self.scores[2] > self.scores[1]:
                    self.winner = 2
                else:
                    self.winner = None

    def _score_phase(self):
        for p in [1, 2]:
            # Island connection bonus: 5 points per island reached
            self.scores[p] += len(self.islands_connected[p]) * 5

            # Island majority bonus
            for iid, cells in self.islands.items():
                count_p = sum(1 for pr, pc, _ in self.pieces[p] if (pr, pc) in cells)
                count_o = sum(1 for pr, pc, _ in self.pieces[3 - p] if (pr, pc) in cells)
                if count_p > count_o:
                    self.scores[p] += 10

            # Resource scoring
            resource_counts = {}
            for res in self.collected[p]:
                resource_counts[res] = resource_counts.get(res, 0) + 1

            # Points per resource collected
            for res, count in resource_counts.items():
                self.scores[p] += count * 3

            # Set bonus: unique resource types
            unique_types = len(resource_counts)
            set_bonus = [0, 2, 5, 10, 15, 20]
            if unique_types < len(set_bonus):
                self.scores[p] += set_bonus[unique_types]
            else:
                self.scores[p] += 20

            # Statuette bonus (2 extra per statuette)
            self.scores[p] += resource_counts.get(STATUETTE, 0) * 2

    def _start_new_phase(self):
        self.phase += 1
        self.turn_number = 0

        # Remove settlers, keep villages
        for p in [1, 2]:
            self.pieces[p] = [(r, c, t) for r, c, t in self.pieces[p] if t == VILLAGE]
            self.settlers_remaining[p] = 20 if self.variation != "quick" else 15
            self.islands_connected[p] = set()
            # Re-track islands from remaining villages
            for r, c, _ in self.pieces[p]:
                iid = self._get_island_id(r, c)
                if iid is not None:
                    self.islands_connected[p].add(iid)

        # Place new resources
        self._place_resources()

    def get_state(self):
        return {
            "rows": self.rows,
            "cols": self.cols,
            "terrain": self.terrain,
            "islands": {str(k): [list(c) for c in v] for k, v in self.islands.items()},
            "resources": self.resources,
            "pieces": {str(k): [[r, c, t] for r, c, t in v] for k, v in self.pieces.items()},
            "villages": {str(k): [list(v2) for v2 in v] for k, v in self.villages.items()},
            "collected": {str(k): v for k, v in self.collected.items()},
            "scores": {str(k): v for k, v in self.scores.items()},
            "phase": self.phase,
            "max_phase": self.max_phase,
            "settlers_remaining": {str(k): v for k, v in self.settlers_remaining.items()},
            "villages_remaining": {str(k): v for k, v in self.villages_remaining.items()},
            "num_islands": self.num_islands,
            "islands_connected": {str(k): list(v) for k, v in self.islands_connected.items()},
        }

    def load_state(self, state):
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.terrain = state["terrain"]
        self.islands = {int(k): [tuple(c) for c in v] for k, v in state["islands"].items()}
        self.resources = state["resources"]
        self.pieces = {int(k): [(r, c, t) for r, c, t in v] for k, v in state["pieces"].items()}
        self.villages = {int(k): [tuple(v2) for v2 in v] for k, v in state["villages"].items()}
        self.collected = {int(k): v for k, v in state["collected"].items()}
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.phase = state["phase"]
        self.max_phase = state["max_phase"]
        self.settlers_remaining = {int(k): v for k, v in state["settlers_remaining"].items()}
        self.villages_remaining = {int(k): v for k, v in state["villages_remaining"].items()}
        self.num_islands = state["num_islands"]
        self.islands_connected = {int(k): set(v) for k, v in state["islands_connected"].items()}

    def get_tutorial(self):
        return """
=== BLUE LAGOON TUTORIAL ===

OVERVIEW:
  Explore an island archipelago across two phases.
  Place settlers and villages to collect resources, connect islands,
  and claim territory. Scored after each phase.

BOARD SYMBOLS:
  ~ = Sea        # = Land (island)
  S = Statuette  C = Coconut  W = Water  B = Bamboo  P = Precious Stone
  1s = Player 1 settler  2V = Player 2 village

PHASES:
  Phase 1 (Exploration): Place settlers on ANY sea or land space.
  Phase 2 (Settlement): Must place adjacent to your existing pieces.
  Villages persist between phases; settlers are removed.

ACTIONS:
  settler ROW COL  - Place a settler token
  village ROW COL  - Place a village (land only, permanent)
  pass             - End your turn

SCORING (each phase):
  +5 per island reached
  +10 for majority on each island
  +3 per resource collected
  Set bonus for unique resource types (2/5/10/15/20)
  +2 extra per Statuette

STRATEGY:
  - Spread across islands for connection bonuses
  - Collect diverse resources for set bonuses
  - Place villages strategically - they persist to Phase 2!
  - Contest majorities on valuable islands
"""
