"""Railroad Ink - Route-drawing dice game.

Roll dice showing road/rail segments, draw them on your board
to build connected networks. Score points for longest routes
and connected exits.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Grid is 7x7
GRID_SIZE = 7

# Exit positions (edges of the board)
EXITS = {
    "N1": (0, 1, "road"), "N2": (0, 3, "rail"), "N3": (0, 5, "road"),
    "E1": (1, 6, "rail"), "E2": (3, 6, "road"), "E3": (5, 6, "rail"),
    "S1": (6, 1, "road"), "S2": (6, 3, "rail"), "S3": (6, 5, "road"),
    "W1": (1, 0, "rail"), "W2": (3, 0, "road"), "W3": (5, 0, "rail"),
}

# Dice faces - each face has connections: N, E, S, W (road/rail/none)
# Format: (name, display, {direction: type})
ROUTE_DICE = [
    ("road_straight", "═══", {"N": None, "E": "road", "S": None, "W": "road"}),
    ("road_curve", "╗  ", {"N": None, "E": None, "S": "road", "W": "road"}),
    ("road_T", "╦══", {"N": None, "E": "road", "S": "road", "W": "road"}),
    ("rail_straight", "|||", {"N": "rail", "E": None, "S": "rail", "W": None}),
    ("rail_curve", "+--", {"N": "rail", "E": "rail", "S": None, "W": None}),
    ("rail_T", "++|", {"N": "rail", "E": "rail", "S": "rail", "W": None}),
    ("overpass", "=#=", {"N": "rail", "E": "road", "S": "rail", "W": "road"}),
    ("station", "[S]", {"N": "road", "E": None, "S": "rail", "W": None}),
]

# Red expansion dice (lava/meteor)
RED_DICE = [
    ("lava_straight", "~L~", {"N": None, "E": "lava", "S": None, "W": "lava"}),
    ("meteor", "[M]", {}),  # Blocks a cell
]

# Rotation maps direction
ROTATIONS = {
    0: {"N": "N", "E": "E", "S": "S", "W": "W"},
    1: {"N": "E", "E": "S", "S": "W", "W": "N"},  # 90 CW
    2: {"N": "S", "E": "W", "S": "N", "W": "E"},  # 180
    3: {"N": "W", "E": "N", "S": "E", "W": "S"},  # 270
}

OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}
DIR_DELTA = {"N": (-1, 0), "S": (1, 0), "E": (0, 1), "W": (0, -1)}


def rotate_tile(tile, rotation):
    """Rotate a tile's connections."""
    _, display, connections = tile
    new_conn = {}
    rot_map = ROTATIONS[rotation % 4]
    for orig_dir, new_dir in rot_map.items():
        if orig_dir in connections and connections[orig_dir]:
            new_conn[new_dir] = connections[orig_dir]
    return new_conn


class RailroadInkGame(BaseGame):
    """Railroad Ink - Route-drawing dice game."""

    name = "Railroad Ink"
    description = "Roll dice and draw road/rail routes to connect exits"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (Blue)",
        "red": "Red Expansion (Lava/Meteor)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.boards = {}  # player -> 7x7 grid
        self.round_num = 1
        self.max_rounds = 7
        self.dice_rolled = []
        self.dice_placed = []  # indices of dice already placed this round
        self.special_used = {}  # player -> count of special routes used
        self.phase = "roll"  # roll, place
        self.log = []

    def setup(self):
        for sp in ["1", "2"]:
            # Each cell: None or {"connections": {dir: type}, "name": str}
            self.boards[sp] = [[None for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
            self.special_used[sp] = 0

        self.round_num = 1
        self.dice_rolled = []
        self.dice_placed = []
        self.phase = "roll"
        self.log = ["Game started! Roll the dice to begin."]

    def _roll_dice(self):
        """Roll 4 route dice (+ 1 red die if red variant)."""
        self.dice_rolled = []
        for _ in range(4):
            self.dice_rolled.append(random.choice(ROUTE_DICE))
        if self.variation == "red":
            self.dice_rolled.append(random.choice(RED_DICE))
        self.dice_placed = []

    def _can_place(self, sp, row, col, connections):
        """Check if a tile can be placed at row, col."""
        if row < 0 or row >= GRID_SIZE or col < 0 or col >= GRID_SIZE:
            return False
        if self.boards[sp][row][col] is not None:
            return False

        # Must connect to at least one adjacent tile or exit
        has_connection = False
        for direction, route_type in connections.items():
            if route_type is None:
                continue
            dr, dc = DIR_DELTA[direction]
            nr, nc = row + dr, col + dc

            # Check exit connections
            for exit_name, (er, ec, etype) in EXITS.items():
                if er == row and ec == col:
                    has_connection = True

            # Check adjacent tiles
            if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                adj = self.boards[sp][nr][nc]
                if adj is not None:
                    opp = OPPOSITE[direction]
                    adj_type = adj["connections"].get(opp)
                    if adj_type and (adj_type == route_type or adj_type == "lava" or route_type == "lava"):
                        has_connection = True

        return has_connection

    def _score_board(self, sp):
        """Score a player's board."""
        score = 0
        board = self.boards[sp]

        # Score connected exits using BFS
        exit_groups = []
        visited_exits = set()

        for exit_name, (er, ec, etype) in EXITS.items():
            if exit_name in visited_exits:
                continue
            if board[er][ec] is None:
                continue
            # BFS from this exit
            group = {exit_name}
            queue = [(er, ec)]
            visited = {(er, ec)}
            while queue:
                r, c = queue.pop(0)
                cell = board[r][c]
                if cell is None:
                    continue
                for direction, route_type in cell["connections"].items():
                    if route_type is None:
                        continue
                    dr, dc = DIR_DELTA[direction]
                    nr, nc = r + dr, c + dc
                    if (nr, nc) in visited:
                        continue
                    if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                        adj = board[nr][nc]
                        if adj is not None:
                            opp = OPPOSITE[direction]
                            adj_type = adj["connections"].get(opp)
                            if adj_type and adj_type == route_type:
                                visited.add((nr, nc))
                                queue.append((nr, nc))
                                # Check if this is an exit
                                for en, (exr, exc, _) in EXITS.items():
                                    if exr == nr and exc == nc:
                                        group.add(en)

            visited_exits.update(group)
            if len(group) >= 2:
                exit_groups.append(group)

        # Points for connected exits: 4pts per group of 2+
        for g in exit_groups:
            score += len(g) * 4

        # Longest road/rail
        for route_type in ["road", "rail"]:
            longest = self._find_longest(sp, route_type)
            score += longest

        # Penalty for empty center (3x3 center)
        center_empty = 0
        for r in range(2, 5):
            for c in range(2, 5):
                if board[r][c] is None:
                    center_empty += 1
        score -= center_empty

        return max(0, score)

    def _find_longest(self, sp, route_type):
        """Find the longest connected route of a given type."""
        board = self.boards[sp]
        longest = 0
        for r in range(GRID_SIZE):
            for c in range(GRID_SIZE):
                if board[r][c] is None:
                    continue
                length = self._dfs_length(board, r, c, route_type, set())
                longest = max(longest, length)
        return longest

    def _dfs_length(self, board, r, c, route_type, visited):
        if (r, c) in visited:
            return 0
        cell = board[r][c]
        if cell is None:
            return 0
        # Check if this cell has the route type
        has_type = any(t == route_type for t in cell["connections"].values() if t)
        if not has_type:
            return 0
        visited.add((r, c))
        best = 1
        for direction, rtype in cell["connections"].items():
            if rtype != route_type:
                continue
            dr, dc = DIR_DELTA[direction]
            nr, nc = r + dr, c + dc
            if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                adj = board[nr][nc]
                if adj and OPPOSITE[direction] in adj["connections"]:
                    if adj["connections"][OPPOSITE[direction]] == route_type:
                        length = 1 + self._dfs_length(board, nr, nc, route_type, visited)
                        best = max(best, length)
        visited.discard((r, c))
        return best

    def display(self):
        clear_screen()
        mode = "Red Expansion" if self.variation == "red" else "Standard Blue"
        print(f"{'=' * 60}")
        print(f"  RAILROAD INK - {mode} | Round {self.round_num}/{self.max_rounds}")
        print(f"{'=' * 60}")

        cp = str(self.current_player)
        print(f"\n  {self.players[self.current_player-1]}'s Board:")
        print("     0   1   2   3   4   5   6")
        for r in range(GRID_SIZE):
            row_str = f"  {r} "
            for c in range(GRID_SIZE):
                cell = self.boards[cp][r][c]
                # Check if exit
                is_exit = False
                for en, (er, ec, et) in EXITS.items():
                    if er == r and ec == c and cell is None:
                        row_str += f"({en[0]})"
                        is_exit = True
                        break
                if not is_exit:
                    if cell is None:
                        row_str += " .  "
                    else:
                        row_str += f" {cell['name'][:3]} "
            print(row_str)

        print()
        if self.dice_rolled:
            print("  Rolled dice:")
            for i, die in enumerate(self.dice_rolled):
                placed = "PLACED" if i in self.dice_placed else "available"
                name, display, _ = die
                print(f"    [{i+1}] {display} ({name}) - {placed}")
        print()

        # Scores so far
        for p in [1, 2]:
            sp = str(p)
            score = self._score_board(sp)
            marker = " <<" if p == self.current_player else ""
            print(f"  {self.players[p-1]}: Score={score} | Special used={self.special_used[sp]}/3{marker}")

        if self.log:
            print(f"\n  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = str(self.current_player)

        if self.phase == "roll":
            input_with_quit("  Press Enter to roll dice...")
            return {"action": "roll"}

        elif self.phase == "place":
            available = [i for i in range(len(self.dice_rolled)) if i not in self.dice_placed]
            if not available:
                return {"action": "end_placement"}

            print(f"  Available dice: {available}")
            print("  Place a die or 'done' to end placement")
            choice = input_with_quit("  Die # to place (or 'done'): ").strip()

            if choice.lower() == "done":
                return {"action": "end_placement"}

            try:
                die_idx = int(choice) - 1
                if die_idx not in available:
                    return None
            except ValueError:
                return None

            pos = input_with_quit("  Position (row,col): ").strip()
            try:
                parts = pos.split(",")
                row, col = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                return None

            rot = input_with_quit("  Rotation (0-3, 0=none): ").strip()
            try:
                rotation = int(rot)
            except ValueError:
                rotation = 0

            return {"action": "place", "die_idx": die_idx, "row": row, "col": col, "rotation": rotation}

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "roll":
            self._roll_dice()
            self.phase = "place"
            self.log.append(f"Round {self.round_num}: Dice rolled!")
            return True

        if action == "place":
            die_idx = move["die_idx"]
            row, col = move["row"], move["col"]
            rotation = move.get("rotation", 0)

            if die_idx < 0 or die_idx >= len(self.dice_rolled):
                return False
            if die_idx in self.dice_placed:
                return False

            tile = self.dice_rolled[die_idx]
            name, display, _ = tile

            # Handle meteor (red variant)
            if name == "meteor":
                if row < 0 or row >= GRID_SIZE or col < 0 or col >= GRID_SIZE:
                    return False
                self.boards[cp][row][col] = {"connections": {}, "name": "MET"}
                self.dice_placed.append(die_idx)
                self.log.append(f"Meteor placed at ({row},{col})!")
                return True

            connections = rotate_tile(tile, rotation)

            # First tile can go anywhere, subsequent must connect
            has_any = any(self.boards[cp][r][c] is not None
                         for r in range(GRID_SIZE) for c in range(GRID_SIZE))
            if has_any:
                if not self._can_place(cp, row, col, connections):
                    return False
            else:
                if row < 0 or row >= GRID_SIZE or col < 0 or col >= GRID_SIZE:
                    return False
                if self.boards[cp][row][col] is not None:
                    return False

            self.boards[cp][row][col] = {"connections": connections, "name": name[:3]}
            self.dice_placed.append(die_idx)
            self.log.append(f"Placed {name} at ({row},{col}) rot={rotation}")
            return True

        if action == "end_placement":
            # Move to next player or next round
            if self.current_player == 1:
                self.phase = "place"
                # Player 2 uses same dice
                self.dice_placed = []
            else:
                self.round_num += 1
                self.phase = "roll"
                self.dice_rolled = []
                self.dice_placed = []
            return True

        return False

    def check_game_over(self):
        if self.round_num > self.max_rounds:
            self.game_over = True
            s1 = self._score_board("1")
            s2 = self._score_board("2")
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None
            self.log.append(f"Final scores: P1={s1}, P2={s2}")

    def get_state(self):
        return {
            "boards": self.boards,
            "round_num": self.round_num,
            "dice_rolled": [(d[0], d[1]) for d in self.dice_rolled],
            "dice_placed": self.dice_placed,
            "special_used": self.special_used,
            "phase": self.phase,
            "log": self.log,
        }

    def load_state(self, state):
        self.boards = state["boards"]
        self.round_num = state["round_num"]
        # Reconstruct dice from names
        self.dice_rolled = []
        all_dice = ROUTE_DICE + (RED_DICE if self.variation == "red" else [])
        for name, display in state.get("dice_rolled", []):
            for d in all_dice:
                if d[0] == name:
                    self.dice_rolled.append(d)
                    break
        self.dice_placed = state["dice_placed"]
        self.special_used = state["special_used"]
        self.phase = state["phase"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  RAILROAD INK - Tutorial
============================================================

  OVERVIEW:
  Railroad Ink is a route-drawing game. Roll dice and draw
  road and rail segments on your 7x7 board. Connect exits
  on the board edges to score points.

  GAMEPLAY:
  1. ROLL: Roll 4 route dice each round
  2. PLACE: Both players use the same dice results
     - Place tiles on your board (row, col, rotation)
     - Tiles must connect to existing routes or exits
     - Rotation: 0=none, 1=90CW, 2=180, 3=270

  BOARD:
  - 7x7 grid with 12 exits on the edges (N/E/S/W)
  - Exits are pre-marked with (N), (E), (S), (W)
  - Roads connect to roads, rails to rails

  SCORING:
  - Connected exits: 4 points per exit in a connected group
  - Longest road: points equal to length
  - Longest rail: points equal to length
  - Penalty: -1 per empty center cell (3x3 center)

  RED EXPANSION:
  - Adds lava and meteor dice
  - Meteors block cells permanently
  - Lava connects to both road and rail

  Game lasts 7 rounds. Highest score wins!
============================================================
"""
