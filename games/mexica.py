"""Mexica - Area-building game on a lake with canals and temples."""

import random
from collections import deque

from engine.base import BaseGame, input_with_quit, clear_screen

# Cell types
EMPTY = "."
CANAL = "~"
BRIDGE = "="
TEMPLE = "T"
FOUNDER = "F"


class MexicaGame(BaseGame):
    """Mexica: Build canals, found districts, and place temples on a lake."""

    name = "Mexica"
    description = "Area-building game with canals, bridges, districts, and temples"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full 11x11 board, 10 districts, 6 temples each",
        "quick": "Smaller 8x8 board, 6 districts, 4 temples each",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.rows = 0
        self.cols = 0
        self.board = []
        self.canals = []
        self.bridges = []
        self.districts = {}  # id -> {"cells": [...], "required_size": int, "scored": bool}
        self.next_district_id = 1
        self.temples = {1: [], 2: []}  # player -> list of (r,c, size)
        self.temples_remaining = {1: 0, 2: 0}
        self.founder_pos = {1: None, 2: None}
        self.action_points = 0
        self.max_ap = 6
        self.scores = {1: 0, 2: 0}
        self.required_districts = []
        self.districts_founded = 0
        self.phase = 1  # 1 or 2
        self.temple_sizes = {1: [], 2: []}  # available temple sizes

    def setup(self):
        if self.variation == "quick":
            self.rows, self.cols = 8, 8
            self.required_districts = [4, 5, 5, 6, 6, 7]
            num_temples = 4
            self.max_ap = 5
        else:
            self.rows, self.cols = 11, 11
            self.required_districts = [4, 4, 5, 5, 6, 6, 7, 7, 8, 9]
            num_temples = 6
            self.max_ap = 6

        self.board = [[EMPTY for _ in range(self.cols)] for _ in range(self.rows)]

        # Place initial canal through center
        mid = self.rows // 2
        for c in range(self.cols):
            self.board[mid][c] = CANAL
            self.canals.append((mid, c))

        # Place founders at starting positions
        self.founder_pos[1] = (0, 0)
        self.founder_pos[2] = (self.rows - 1, self.cols - 1)
        self.board[0][0] = "F1"
        self.board[self.rows - 1][self.cols - 1] = "F2"

        for p in [1, 2]:
            self.temples_remaining[p] = num_temples
            # Temple sizes: 1, 1, 2, 2, 3, 3 (standard) or 1, 1, 2, 3 (quick)
            if self.variation == "quick":
                self.temple_sizes[p] = [1, 1, 2, 3]
            else:
                self.temple_sizes[p] = [1, 1, 2, 2, 3, 3]

        self.action_points = self.max_ap
        self.districts_founded = 0

    def _adjacent(self, r, c):
        result = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                result.append((nr, nc))
        return result

    def _cell_display(self, r, c):
        val = self.board[r][c]
        if val == EMPTY:
            # Check if in a district
            dist_id = self._get_district_at(r, c)
            if dist_id is not None:
                return f"d{dist_id:1d} "
            return " .  "
        if val == CANAL:
            return " ~  "
        if val == BRIDGE:
            return " =  "
        if val.startswith("F"):
            return f" {val} "
        if val.startswith("T"):
            return f" {val} "
        return f" {val[:3]:3s} "[:4]

    def _get_district_at(self, r, c):
        for did, info in self.districts.items():
            if [r, c] in info["cells"] or (r, c) in [(cr, cc) for cr, cc in
                    [tuple(x) if isinstance(x, list) else x for x in info["cells"]]]:
                return did
        return None

    def display(self):
        clear_screen()
        p = self.current_player
        print(f"=== Mexica === Phase {self.phase} | Turn {self.turn_number + 1}")
        print(f"  {self.players[0]}: Score={self.scores[1]} Temples left={self.temples_remaining[1]}")
        print(f"  {self.players[1]}: Score={self.scores[2]} Temples left={self.temples_remaining[2]}")
        print()

        header = "    " + "".join(f"{c:4d}" for c in range(self.cols))
        print(header)
        for r in range(self.rows):
            row_str = f"{r:3d} " + "".join(self._cell_display(r, c) for c in range(self.cols))
            print(row_str)
        print()

        # Show district requirements
        remaining_dists = self.required_districts[self.districts_founded:]
        if remaining_dists:
            print(f"  Districts to found (sizes): {remaining_dists}")
        else:
            print(f"  All districts founded!")

        founded = []
        for did, info in self.districts.items():
            status = "scored" if info["scored"] else "active"
            founded.append(f"D{did}(size={info['required_size']},{status})")
        if founded:
            print(f"  Founded: {', '.join(founded)}")

        print(f"\n  Player {p} | AP={self.action_points}/{self.max_ap} "
              f"| Founder at {self.founder_pos[p]}")
        if self.temple_sizes[p]:
            print(f"  Available temple sizes: {self.temple_sizes[p]}")

    def get_move(self):
        print("\nActions (cost AP):")
        print("  move ROW COL     - Move founder (1 AP per step)")
        print("  canal ROW COL    - Dig canal at position (2 AP)")
        print("  bridge ROW COL   - Build bridge over canal (1 AP)")
        print("  temple ROW COL SIZE - Place temple (1 AP)")
        print("  found ROW COL    - Found district at position (2 AP)")
        print("  pass             - End turn")
        move = input_with_quit("Action: ").strip().lower()
        return move

    def make_move(self, move):
        parts = move.split()
        if not parts:
            return False
        p = self.current_player

        if parts[0] == "pass":
            self.action_points = self.max_ap
            return True

        action = parts[0]

        if action == "move" and len(parts) >= 3:
            try:
                r, c = int(parts[1]), int(parts[2])
            except ValueError:
                return False
            return self._move_founder(p, r, c)

        if action == "canal" and len(parts) >= 3:
            try:
                r, c = int(parts[1]), int(parts[2])
            except ValueError:
                return False
            return self._dig_canal(p, r, c)

        if action == "bridge" and len(parts) >= 3:
            try:
                r, c = int(parts[1]), int(parts[2])
            except ValueError:
                return False
            return self._build_bridge(p, r, c)

        if action == "temple" and len(parts) >= 4:
            try:
                r, c, size = int(parts[1]), int(parts[2]), int(parts[3])
            except ValueError:
                return False
            return self._place_temple(p, r, c, size)

        if action == "found" and len(parts) >= 3:
            try:
                r, c = int(parts[1]), int(parts[2])
            except ValueError:
                return False
            return self._found_district(p, r, c)

        return False

    def _move_founder(self, player, target_r, target_c):
        if not (0 <= target_r < self.rows and 0 <= target_c < self.cols):
            return False

        cr, cc = self.founder_pos[player]
        dist = abs(target_r - cr) + abs(target_c - cc)

        if dist > self.action_points:
            return False

        target_cell = self.board[target_r][target_c]
        if target_cell.startswith("F") or target_cell.startswith("T"):
            return False

        # Allow movement over canals via bridges or along canals
        # Simplified: just check Manhattan distance and AP cost
        path_cost = dist
        # Moving along canals is free (teleportation via waterways)
        if self.board[cr][cc] == CANAL or self._adjacent_to_canal(cr, cc):
            if self._adjacent_to_canal(target_r, target_c) or self.board[target_r][target_c] == CANAL:
                # Canal travel: costs only 1 AP regardless of distance
                path_cost = 1

        if path_cost > self.action_points:
            return False

        # Clear old position
        self.board[cr][cc] = self._underlying_terrain(cr, cc)
        # Set new position
        self.founder_pos[player] = (target_r, target_c)
        if self.board[target_r][target_c] in (EMPTY, CANAL, BRIDGE):
            self.board[target_r][target_c] = f"F{player}"

        self.action_points -= path_cost
        if self.action_points <= 0:
            self.action_points = self.max_ap
        return True

    def _underlying_terrain(self, r, c):
        if (r, c) in [(cr, cc) for cr, cc in self.canals]:
            return CANAL
        if (r, c) in [(br, bc) for br, bc in self.bridges]:
            return BRIDGE
        return EMPTY

    def _adjacent_to_canal(self, r, c):
        for nr, nc in self._adjacent(r, c):
            if self.board[nr][nc] == CANAL or (nr, nc) in [(cr, cc) for cr, cc in self.canals]:
                return True
        return False

    def _dig_canal(self, player, r, c):
        if self.action_points < 2:
            return False
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if self.board[r][c] != EMPTY:
            return False

        # Must be adjacent to founder
        fr, fc = self.founder_pos[player]
        if abs(fr - r) + abs(fc - c) > 2:
            return False

        self.board[r][c] = CANAL
        self.canals.append((r, c))
        self.action_points -= 2
        if self.action_points <= 0:
            self.action_points = self.max_ap
        return True

    def _build_bridge(self, player, r, c):
        if self.action_points < 1:
            return False
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if self.board[r][c] != CANAL:
            return False

        # Must be adjacent to founder
        fr, fc = self.founder_pos[player]
        if abs(fr - r) + abs(fc - c) > 2:
            return False

        self.board[r][c] = BRIDGE
        self.bridges.append((r, c))
        # Remove from canals display
        self.canals = [(cr, cc) for cr, cc in self.canals if not (cr == r and cc == c)]
        self.action_points -= 1
        if self.action_points <= 0:
            self.action_points = self.max_ap
        return True

    def _place_temple(self, player, r, c, size):
        if self.action_points < 1:
            return False
        if self.temples_remaining[player] <= 0:
            return False
        if size not in self.temple_sizes[player]:
            return False
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if self.board[r][c] not in (EMPTY,):
            return False

        # Must be adjacent to founder or in same district
        fr, fc = self.founder_pos[player]
        if abs(fr - r) + abs(fc - c) > 2:
            return False

        token = f"T{player}{size}"
        self.board[r][c] = token
        self.temples[player].append((r, c, size))
        self.temples_remaining[player] -= 1
        self.temple_sizes[player].remove(size)
        self.action_points -= 1
        if self.action_points <= 0:
            self.action_points = self.max_ap
        return True

    def _found_district(self, player, r, c):
        if self.action_points < 2:
            return False
        if self.districts_founded >= len(self.required_districts):
            return False
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False

        # Find the area enclosed by canals containing (r,c)
        required_size = self.required_districts[self.districts_founded]
        area = self._find_enclosed_area(r, c)

        if len(area) < required_size:
            return False

        # Use only required_size cells (trim to size)
        area_cells = list(area)[:required_size]

        did = self.next_district_id
        self.next_district_id += 1
        self.districts[did] = {
            "cells": [[cr, cc] for cr, cc in area_cells],
            "required_size": required_size,
            "scored": False,
        }
        self.districts_founded += 1
        self.action_points -= 2

        # Score the district
        self._score_district(did)

        if self.action_points <= 0:
            self.action_points = self.max_ap
        return True

    def _find_enclosed_area(self, r, c):
        """BFS to find contiguous non-canal, non-bridge cells from (r,c)."""
        visited = set()
        queue = deque([(r, c)])
        while queue:
            cr, cc = queue.popleft()
            if (cr, cc) in visited:
                continue
            cell = self.board[cr][cc]
            if cell == CANAL:
                continue
            visited.add((cr, cc))
            for nr, nc in self._adjacent(cr, cc):
                if (nr, nc) not in visited:
                    queue.append((nr, nc))
        return visited

    def _score_district(self, district_id):
        """Score a district: player with largest total temple size gets points."""
        info = self.districts[district_id]
        if info["scored"]:
            return
        info["scored"] = True

        cells_set = set()
        for cell in info["cells"]:
            if isinstance(cell, list):
                cells_set.add((cell[0], cell[1]))
            else:
                cells_set.add(cell)

        temple_strength = {1: 0, 2: 0}
        for p in [1, 2]:
            for tr, tc, size in self.temples[p]:
                if (tr, tc) in cells_set:
                    temple_strength[p] += size

        points = info["required_size"] * 2
        if temple_strength[1] > temple_strength[2]:
            self.scores[1] += points
        elif temple_strength[2] > temple_strength[1]:
            self.scores[2] += points
        elif temple_strength[1] > 0:
            # Tie with temples: split
            self.scores[1] += points // 2
            self.scores[2] += points // 2

    def check_game_over(self):
        # Game ends when all districts are founded and scored,
        # or all temples placed, or turn limit
        all_founded = self.districts_founded >= len(self.required_districts)
        all_temples = all(self.temples_remaining[p] == 0 for p in [1, 2])

        if all_founded or all_temples:
            if self.phase == 1 and self.variation != "quick":
                self._end_phase()
            else:
                self.game_over = True

        if self.turn_number >= (40 if self.variation == "quick" else 80):
            self.game_over = True

        if self.game_over:
            # Score any unscored districts
            for did, info in self.districts.items():
                if not info["scored"]:
                    self._score_district(did)

            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None

    def _end_phase(self):
        """Transition from phase 1 to phase 2."""
        self.phase = 2
        # In phase 2, players get new temples
        for p in [1, 2]:
            if self.variation == "quick":
                extra = [1, 2]
            else:
                extra = [1, 1, 2]
            self.temple_sizes[p].extend(extra)
            self.temples_remaining[p] += len(extra)

    def get_state(self):
        return {
            "rows": self.rows,
            "cols": self.cols,
            "board": self.board,
            "canals": [list(c) for c in self.canals],
            "bridges": [list(b) for b in self.bridges],
            "districts": {str(k): v for k, v in self.districts.items()},
            "next_district_id": self.next_district_id,
            "temples": {str(k): [[r, c, s] for r, c, s in v] for k, v in self.temples.items()},
            "temples_remaining": {str(k): v for k, v in self.temples_remaining.items()},
            "founder_pos": {str(k): list(v) if v else None for k, v in self.founder_pos.items()},
            "action_points": self.action_points,
            "max_ap": self.max_ap,
            "scores": {str(k): v for k, v in self.scores.items()},
            "required_districts": self.required_districts,
            "districts_founded": self.districts_founded,
            "phase": self.phase,
            "temple_sizes": {str(k): v for k, v in self.temple_sizes.items()},
        }

    def load_state(self, state):
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.board = state["board"]
        self.canals = [tuple(c) for c in state["canals"]]
        self.bridges = [tuple(b) for b in state["bridges"]]
        self.districts = {int(k): v for k, v in state["districts"].items()}
        self.next_district_id = state["next_district_id"]
        self.temples = {int(k): [(r, c, s) for r, c, s in v] for k, v in state["temples"].items()}
        self.temples_remaining = {int(k): v for k, v in state["temples_remaining"].items()}
        self.founder_pos = {}
        for k, v in state["founder_pos"].items():
            self.founder_pos[int(k)] = tuple(v) if v else None
        self.action_points = state["action_points"]
        self.max_ap = state["max_ap"]
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.required_districts = state["required_districts"]
        self.districts_founded = state["districts_founded"]
        self.phase = state["phase"]
        self.temple_sizes = {int(k): v for k, v in state["temple_sizes"].items()}

    def get_tutorial(self):
        return """
=== MEXICA TUTORIAL ===

OVERVIEW: Build a city on a lake by digging canals, founding districts,
and placing temples. Score points for largest temples in each district.

BOARD: . = Land, ~ = Canal, = = Bridge, F1/F2 = Founders, T13 = Temple, d1 = District

ACTIONS (AP cost): move ROW COL (1 AP/step, 1 AP via canal),
  canal ROW COL (2 AP), bridge ROW COL (1 AP),
  temple ROW COL SIZE (1 AP), found ROW COL (2 AP), pass (end turn)

CANAL TRAVEL: Founder travels along canals for 1 AP regardless of distance.

DISTRICTS: Founded in canal-enclosed areas. Scored when founded.
  Points = district size x 2, to player with highest temple size total.

TEMPLES: Sizes 1-3. Larger = more influence. Place near your founder.

GAME END: All districts founded or all temples placed. Highest score wins!
"""
