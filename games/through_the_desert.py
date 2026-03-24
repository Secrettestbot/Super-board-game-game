"""Through the Desert - Caravan-building game with colored camels."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

CAMEL_COLORS = ["P", "O", "Y", "W", "V"]  # Pink, Orange, Yellow, White, Violet
COLOR_NAMES = {"P": "Pink", "O": "Orange", "Y": "Yellow", "W": "White", "V": "Violet"}
COLOR_DISPLAY = {"P": "Pk", "O": "Or", "Y": "Yl", "W": "Wh", "V": "Vi"}

OASIS = "*"
WATER = "~"
EMPTY = "."


class ThroughTheDesertGame(BaseGame):
    """Through the Desert: Build caravans of colored camels across the desert."""

    name = "Through the Desert"
    description = "Caravan-building game placing colored camels to form caravans"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard board (15x15) with 5 camel colors",
        "quick": "Smaller board (10x10) with 4 camel colors, fewer camels",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.rows = 0
        self.cols = 0
        self.board = []
        self.oases = []
        self.water_holes = []
        self.colors_used = []
        self.camel_supply = {}
        self.rider_positions = {1: {}, 2: {}}
        self.caravans = {1: {}, 2: {}}  # player -> color -> list of (r,c)
        self.scores = {1: 0, 2: 0}
        self.oasis_points = {1: 0, 2: 0}
        self.water_points = {1: 0, 2: 0}
        self.placements_left = 0
        self.phase = "riders"  # "riders" or "play"
        self.riders_to_place = []

    def setup(self):
        if self.variation == "quick":
            self.rows, self.cols = 10, 10
            self.colors_used = CAMEL_COLORS[:4]
            camels_per_color = 12
            num_oases = 4
            num_water = 3
        else:
            self.rows, self.cols = 15, 15
            self.colors_used = CAMEL_COLORS[:]
            camels_per_color = 20
            num_oases = 8
            num_water = 5

        self.board = [[EMPTY for _ in range(self.cols)] for _ in range(self.rows)]

        for color in self.colors_used:
            self.camel_supply[color] = camels_per_color

        self._place_terrain(num_oases, num_water)

        for p in [1, 2]:
            self.caravans[p] = {c: [] for c in self.colors_used}
            self.rider_positions[p] = {}

        self.phase = "riders"
        self.riders_to_place = list(self.colors_used)
        self.placements_left = 2

    def _place_terrain(self, num_oases, num_water):
        placed = 0
        while placed < num_oases:
            r = random.randint(1, self.rows - 2)
            c = random.randint(1, self.cols - 2)
            if self.board[r][c] == EMPTY:
                self.board[r][c] = OASIS
                self.oases.append((r, c))
                placed += 1

        placed = 0
        while placed < num_water:
            r = random.randint(0, self.rows - 1)
            c = random.randint(0, self.cols - 1)
            if self.board[r][c] == EMPTY:
                self.board[r][c] = WATER
                self.water_holes.append((r, c))
                placed += 1

    def _cell_display(self, r, c):
        val = self.board[r][c]
        if val == EMPTY:
            return " .  "
        if val == OASIS:
            return " *  "
        if val == WATER:
            return " ~  "
        # Camel: stored as "1P" = player 1 Pink camel
        if len(val) >= 2 and val[0] in "12":
            return f"{val[0]}{COLOR_DISPLAY[val[1]]} "
        return f" {val}  "[:4]

    def display(self):
        clear_screen()
        p = self.current_player
        print(f"=== Through the Desert === Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} score: {self.scores[1]}  |  "
              f"{self.players[1]} score: {self.scores[2]}")
        print(f"  Camel supply: {', '.join(f'{COLOR_NAMES[c]}={self.camel_supply[c]}' for c in self.colors_used)}")
        print()

        header = "    " + "".join(f"{c:4d}" for c in range(self.cols))
        print(header)
        for r in range(self.rows):
            row_str = f"{r:3d} " + "".join(self._cell_display(r, c) for c in range(self.cols))
            print(row_str)
        print()

        if self.phase == "riders":
            print(f"RIDER PLACEMENT PHASE - Player {p}")
            remaining = [c for c in self.riders_to_place if c not in self.rider_positions[p]]
            print(f"  Colors to place: {', '.join(COLOR_NAMES[c] for c in remaining)}")
        else:
            print(f"Player {p}'s turn - Place 2 camels (different colors)")
            print(f"  Placements left: {self.placements_left}")

    def get_move(self):
        if self.phase == "riders":
            remaining = [c for c in self.riders_to_place if c not in self.rider_positions[self.current_player]]
            if not remaining:
                return "done"
            print(f"\nPlace rider - choose color ({'/'.join(c for c in remaining)})")
            color = input_with_quit("Color: ").strip().upper()
            if color not in remaining:
                return f"invalid {color}"
            r_str = input_with_quit("Row: ").strip()
            c_str = input_with_quit("Col: ").strip()
            return f"rider {r_str} {c_str} {color}"
        else:
            print("\nPlace a camel: COLOR ROW COL (e.g., 'P 5 3') or 'pass'")
            move = input_with_quit("Move: ").strip()
            return move

    def make_move(self, move):
        parts = move.split()
        if not parts:
            return False
        p = self.current_player

        if self.phase == "riders":
            if parts[0] == "done":
                # Check if all riders placed for this player
                remaining = [c for c in self.riders_to_place if c not in self.rider_positions[p]]
                if not remaining:
                    if p == 1:
                        return True
                    else:
                        self.phase = "play"
                        self.placements_left = 2
                        return True
                return False

            if parts[0] == "rider" and len(parts) >= 4:
                try:
                    r, c = int(parts[1]), int(parts[2])
                    color = parts[3].upper()
                except (ValueError, IndexError):
                    return False
                return self._place_rider(p, r, c, color)
            return False

        # Play phase
        if parts[0].lower() == "pass":
            self.placements_left = 0
            self._end_turn()
            return True

        if len(parts) >= 3:
            try:
                color = parts[0].upper()
                r, c = int(parts[1]), int(parts[2])
            except (ValueError, IndexError):
                return False
            return self._place_camel(p, color, r, c)
        return False

    def _place_rider(self, player, r, c, color):
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if color not in self.colors_used:
            return False
        if color in self.rider_positions[player]:
            return False
        if self.board[r][c] != EMPTY:
            return False

        # Check not adjacent to same-color rider of other player
        other = 3 - player
        if color in self.rider_positions[other]:
            or_, oc = self.rider_positions[other][color]
            if abs(or_ - r) + abs(oc - c) <= 1:
                return False

        token = f"{player}{color}"
        self.board[r][c] = token
        self.rider_positions[player][color] = (r, c)
        self.caravans[player][color] = [(r, c)]
        return True

    def _place_camel(self, player, color, r, c):
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if color not in self.colors_used:
            return False
        if self.camel_supply[color] <= 0:
            return False

        cell = self.board[r][c]
        if cell not in (EMPTY, OASIS, WATER):
            return False

        # Must be adjacent to an existing camel in player's caravan of this color
        caravan = self.caravans[player][color]
        if not caravan:
            return False

        adj = False
        for cr, cc in caravan:
            if abs(cr - r) + abs(cc - c) == 1:
                adj = True
                break
        if not adj:
            return False

        # Cannot connect to opponent's caravan of same color
        other = 3 - player
        for cr, cc in self.caravans[other].get(color, []):
            if abs(cr - r) + abs(cc - c) == 1:
                return False

        # Check for oasis/water scoring
        was_oasis = cell == OASIS
        was_water = cell == WATER

        token = f"{player}{color}"
        self.board[r][c] = token
        self.caravans[player][color].append((r, c))
        self.camel_supply[color] -= 1

        if was_oasis:
            self.scores[player] += 5
            self.oasis_points[player] += 5
        if was_water:
            self.scores[player] += 3
            self.water_points[player] += 3

        self.placements_left -= 1
        if self.placements_left <= 0:
            self._end_turn()
        return True

    def _end_turn(self):
        self.placements_left = 2

    def _adjacent(self, r, c):
        result = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                result.append((nr, nc))
        return result

    def check_game_over(self):
        # Game ends when any camel color runs out
        for color in self.colors_used:
            if self.camel_supply[color] <= 0:
                self.game_over = True
                break

        if self.turn_number >= (60 if self.variation == "quick" else 100):
            self.game_over = True

        if self.game_over:
            self._final_scoring()

    def _final_scoring(self):
        # Score enclosed areas
        for p in [1, 2]:
            area_score = self._calculate_enclosed_areas(p)
            self.scores[p] += area_score
            # Score for longest caravan per color
            for color in self.colors_used:
                length = len(self.caravans[p][color])
                self.scores[p] += length

        if self.scores[1] > self.scores[2]:
            self.winner = 1
        elif self.scores[2] > self.scores[1]:
            self.winner = 2
        else:
            self.winner = None

    def _calculate_enclosed_areas(self, player):
        """Calculate points for areas enclosed by player's caravans."""
        total = 0
        for color in self.colors_used:
            caravan = set()
            for pos in self.caravans[player][color]:
                caravan.add(pos)
            if len(caravan) < 4:
                continue
            # Simple enclosure check: flood fill from edges
            # Cells not reachable from edge and not part of any caravan = enclosed
            all_player_cells = set()
            for c2 in self.colors_used:
                for pos in self.caravans[player][c2]:
                    all_player_cells.add(pos)

            reachable = set()
            stack = []
            for r in range(self.rows):
                for c in [0, self.cols - 1]:
                    if (r, c) not in caravan:
                        stack.append((r, c))
            for c in range(self.cols):
                for r in [0, self.rows - 1]:
                    if (r, c) not in caravan:
                        stack.append((r, c))

            while stack:
                cr, cc = stack.pop()
                if (cr, cc) in reachable:
                    continue
                if (cr, cc) in caravan:
                    continue
                if not (0 <= cr < self.rows and 0 <= cc < self.cols):
                    continue
                reachable.add((cr, cc))
                for nr, nc in self._adjacent(cr, cc):
                    if (nr, nc) not in reachable and (nr, nc) not in caravan:
                        stack.append((nr, nc))

            enclosed = 0
            for r in range(self.rows):
                for c in range(self.cols):
                    if (r, c) not in reachable and (r, c) not in caravan:
                        enclosed += 1
            total += enclosed
        return total

    def get_state(self):
        caravans_ser = {}
        for p in [1, 2]:
            caravans_ser[str(p)] = {}
            for c in self.colors_used:
                caravans_ser[str(p)][c] = [list(pos) for pos in self.caravans[p][c]]

        rider_ser = {}
        for p in [1, 2]:
            rider_ser[str(p)] = {}
            for c, pos in self.rider_positions[p].items():
                rider_ser[str(p)][c] = list(pos)

        return {
            "board": self.board,
            "rows": self.rows,
            "cols": self.cols,
            "oases": [list(o) for o in self.oases],
            "water_holes": [list(w) for w in self.water_holes],
            "colors_used": self.colors_used,
            "camel_supply": self.camel_supply,
            "rider_positions": rider_ser,
            "caravans": caravans_ser,
            "scores": {str(k): v for k, v in self.scores.items()},
            "oasis_points": {str(k): v for k, v in self.oasis_points.items()},
            "water_points": {str(k): v for k, v in self.water_points.items()},
            "placements_left": self.placements_left,
            "phase": self.phase,
            "riders_to_place": self.riders_to_place,
        }

    def load_state(self, state):
        self.board = state["board"]
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.oases = [tuple(o) for o in state["oases"]]
        self.water_holes = [tuple(w) for w in state["water_holes"]]
        self.colors_used = state["colors_used"]
        self.camel_supply = state["camel_supply"]
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.oasis_points = {int(k): v for k, v in state["oasis_points"].items()}
        self.water_points = {int(k): v for k, v in state["water_points"].items()}
        self.placements_left = state["placements_left"]
        self.phase = state["phase"]
        self.riders_to_place = state["riders_to_place"]

        self.rider_positions = {}
        for p_str, colors in state["rider_positions"].items():
            p = int(p_str)
            self.rider_positions[p] = {}
            for c, pos in colors.items():
                self.rider_positions[p][c] = tuple(pos)

        self.caravans = {}
        for p_str, colors in state["caravans"].items():
            p = int(p_str)
            self.caravans[p] = {}
            for c, positions in colors.items():
                self.caravans[p][c] = [tuple(pos) for pos in positions]

    def get_tutorial(self):
        return """
=== THROUGH THE DESERT TUTORIAL ===

OVERVIEW:
  Build caravans of colored camels across the desert.
  Score points by reaching oases, water holes, and enclosing areas.

SETUP:
  Each player places one rider (starting camel) per color on the board.
  Riders cannot be adjacent to the opponent's rider of the same color.

BOARD SYMBOLS:
  .  = Empty desert
  *  = Oasis (5 points when reached)
  ~  = Water hole (3 points when reached)
  1Pk = Player 1's Pink camel, 2Or = Player 2's Orange, etc.

GAMEPLAY:
  Each turn, place 2 camels of DIFFERENT colors.
  Camels must extend from your existing caravan of that color.
  You cannot connect to an opponent's caravan of the same color.

PLACING CAMELS:
  Type: COLOR ROW COL (e.g., 'P 5 3' for Pink at row 5, col 3)
  Type 'pass' to skip remaining placements.

SCORING:
  +5 points for each oasis reached
  +3 points for each water hole reached
  +1 per cell in areas enclosed by your caravans
  +1 per camel in each caravan (length bonus)

GAME END:
  Game ends when any camel color supply runs out.
  Highest total score wins!
"""
