"""Azul - A tile-drafting and pattern-building game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Standard 5-color wall pattern (each row is a shifted version)
STANDARD_WALL_PATTERN = [
    ["B", "Y", "R", "K", "W"],
    ["W", "B", "Y", "R", "K"],
    ["K", "W", "B", "Y", "R"],
    ["R", "K", "W", "B", "Y"],
    ["Y", "R", "K", "W", "B"],
]

# Simple 3-color wall pattern
SIMPLE_WALL_PATTERN = [
    ["B", "Y", "R"],
    ["R", "B", "Y"],
    ["Y", "R", "B"],
]

COLOR_NAMES = {
    "B": "Blue",
    "Y": "Yellow",
    "R": "Red",
    "K": "Black",
    "W": "White",
}


class AzulGame(BaseGame):
    """Azul: Draft tiles from factories and build your mosaic wall."""

    name = "Azul"
    description = "A tile-drafting and pattern-building game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Azul",
        "simple": "Simplified (3 colors, smaller board)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.bag = []
        self.box_lid = []  # tiles discarded after wall-tiling go here
        self.factories = []
        self.center = []
        self.first_player_marker_in_center = True
        self.num_colors = 5
        self.board_size = 5
        self.num_factories = 5
        self.colors = ["B", "Y", "R", "K", "W"]
        self.wall_pattern = STANDARD_WALL_PATTERN
        # Per-player state (indexed 0 and 1)
        self.pattern_lines = [[], []]  # each: list of [color_or_None, count] per row
        self.walls = [[], []]  # each: board_size x board_size bool grid
        self.floor_lines = [[], []]  # each: list of tiles on floor
        self.scores = [0, 0]
        self.round_number = 0
        self.first_player_next_round = 1  # player number (1 or 2)

    def setup(self):
        """Initialize the game for a new session."""
        if self.variation == "simple":
            self.num_colors = 3
            self.board_size = 3
            self.num_factories = 3
            self.colors = ["B", "Y", "R"]
            self.wall_pattern = [row[:] for row in SIMPLE_WALL_PATTERN]
        else:
            self.num_colors = 5
            self.board_size = 5
            self.num_factories = 5
            self.colors = ["B", "Y", "R", "K", "W"]
            self.wall_pattern = [row[:] for row in STANDARD_WALL_PATTERN]

        tiles_per_color = 20 if self.variation != "simple" else 12
        self.bag = []
        for color in self.colors:
            self.bag.extend([color] * tiles_per_color)
        random.shuffle(self.bag)
        self.box_lid = []

        self.pattern_lines = [
            [[None, 0] for _ in range(self.board_size)] for _ in range(2)
        ]
        self.walls = [
            [[False] * self.board_size for _ in range(self.board_size)] for _ in range(2)
        ]
        self.floor_lines = [[], []]
        self.scores = [0, 0]
        self.round_number = 0
        self.first_player_next_round = 1
        self.current_player = 1

        self._start_new_round()

    def _refill_bag(self):
        """Move tiles from box lid back to bag and shuffle."""
        if not self.box_lid:
            return
        self.bag.extend(self.box_lid)
        self.box_lid = []
        random.shuffle(self.bag)

    def _draw_from_bag(self, count):
        """Draw up to count tiles from the bag, refilling if needed."""
        drawn = []
        for _ in range(count):
            if not self.bag:
                self._refill_bag()
            if self.bag:
                drawn.append(self.bag.pop())
        return drawn

    def _start_new_round(self):
        """Set up factories for a new round."""
        self.round_number += 1
        self.factories = []
        for _ in range(self.num_factories):
            tiles = self._draw_from_bag(4)
            self.factories.append(tiles)
        self.center = []
        self.first_player_marker_in_center = True
        self.current_player = self.first_player_next_round

    def _all_tiles_taken(self):
        """Check if all factories and center are empty."""
        if self.center:
            return False
        for f in self.factories:
            if f:
                return False
        return True

    def display(self):
        """Display the full game state."""
        var_label = "Standard" if self.variation != "simple" else "Simple"
        print(f"\n  === Azul ({var_label}) === Round {self.round_number}")
        print(f"  {self.players[0]} (P1): {self.scores[0]} pts   |   "
              f"{self.players[1]} (P2): {self.scores[1]} pts")
        print(f"  Current turn: {self.players[self.current_player - 1]}")

        # Factories
        print("\n  --- Factories ---")
        for i, f in enumerate(self.factories):
            tiles_str = " ".join(f) if f else "(empty)"
            print(f"  Factory {i + 1}: [{tiles_str}]")

        # Center
        center_str = " ".join(self.center) if self.center else "(empty)"
        marker = " [1st]" if self.first_player_marker_in_center else ""
        print(f"  Center  0: [{center_str}]{marker}")

        # Both players' boards
        for p in range(2):
            print(f"\n  --- {self.players[p]} (P{p + 1}) --- Score: {self.scores[p]}")
            self._display_player_board(p)

    def _display_player_board(self, p):
        """Display one player's pattern lines, wall, and floor."""
        bs = self.board_size
        print("  Pattern Lines          Wall")
        for row in range(bs):
            # Pattern line (right-aligned)
            pl_color, pl_count = self.pattern_lines[p][row]
            capacity = row + 1
            empty = capacity - pl_count
            tile_char = pl_color if pl_color else "."
            pl_str = "." * empty + tile_char * pl_count
            pl_str = pl_str.rjust(bs)

            # Wall row
            wall_str = ""
            for col in range(bs):
                if self.walls[p][row][col]:
                    wall_str += self.wall_pattern[row][col]
                else:
                    wall_str += "."
            print(f"  Row {row + 1}: {pl_str}  |  {wall_str}")

        # Floor line
        floor_penalties = [-1, -1, -2, -2, -2, -3, -3]
        floor_str = " ".join(self.floor_lines[p]) if self.floor_lines[p] else "(empty)"
        penalty = self._calc_floor_penalty(p)
        print(f"  Floor: [{floor_str}] (penalty: {penalty})")

    def _calc_floor_penalty(self, p):
        """Calculate floor line penalty for a player."""
        penalties = [-1, -1, -2, -2, -2, -3, -3]
        total = 0
        for i in range(min(len(self.floor_lines[p]), len(penalties))):
            total += penalties[i]
        return total

    def get_move(self):
        """Get move from current player."""
        print(f"\n  {self.players[self.current_player - 1]}, pick tiles.")
        print("  Format: factory_num color pattern_line")
        print("  e.g. '3 B 2' = take Blue from factory 3, place on line 2")
        print("  Use '0' for center. Use 'F' for floor line.")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        try:
            parts = move.upper().split()
            if len(parts) != 3:
                return False
            source = int(parts[0])
            color = parts[1]
            dest = parts[2]
        except (ValueError, IndexError):
            return False

        p = self.current_player - 1  # 0-indexed player

        # Validate color
        if color not in self.colors:
            return False

        # Get tiles from source
        if source == 0:
            # Taking from center
            matching = [t for t in self.center if t == color]
            if not matching:
                return False
            # Remove matching tiles from center
            for _ in range(len(matching)):
                self.center.remove(color)
            picked = matching
            # First player marker penalty
            if self.first_player_marker_in_center:
                self.first_player_marker_in_center = False
                self.first_player_next_round = self.current_player
                self.floor_lines[p].append("1")  # marker as penalty tile
        elif 1 <= source <= self.num_factories:
            factory = self.factories[source - 1]
            if not factory:
                return False
            matching = [t for t in factory if t == color]
            if not matching:
                return False
            remaining = [t for t in factory if t != color]
            self.center.extend(remaining)
            self.factories[source - 1] = []
            picked = matching
        else:
            return False

        # Place tiles
        if dest == "F":
            # All to floor
            self.floor_lines[p].extend(picked)
        else:
            try:
                line_num = int(dest)
            except ValueError:
                return False
            if line_num < 1 or line_num > self.board_size:
                return False
            row = line_num - 1
            capacity = row + 1
            pl_color, pl_count = self.pattern_lines[p][row]

            # Check: color must match if line already has tiles
            if pl_color is not None and pl_color != color:
                return False

            # Check: this color must not already be on the wall in this row
            wall_col = self.wall_pattern[row].index(color)
            if self.walls[p][row][wall_col]:
                return False

            # Place tiles on pattern line, overflow to floor
            space = capacity - pl_count
            placed = min(len(picked), space)
            overflow = len(picked) - placed

            self.pattern_lines[p][row] = [color, pl_count + placed]
            if overflow > 0:
                self.floor_lines[p].extend([color] * overflow)

        # If all tiles taken, do wall-tiling phase
        if self._all_tiles_taken():
            self._wall_tiling_phase()

        return True

    def _wall_tiling_phase(self):
        """Score completed pattern lines and move tiles to walls."""
        for p in range(2):
            for row in range(self.board_size):
                pl_color, pl_count = self.pattern_lines[p][row]
                capacity = row + 1
                if pl_color is not None and pl_count == capacity:
                    # Line is complete - place tile on wall
                    wall_col = self.wall_pattern[row].index(pl_color)
                    self.walls[p][row][wall_col] = True

                    # Score this tile
                    points = self._score_tile(p, row, wall_col)
                    self.scores[p] += points

                    # Return leftover tiles (count - 1) to box lid
                    self.box_lid.extend([pl_color] * (pl_count - 1))

                    # Clear pattern line
                    self.pattern_lines[p][row] = [None, 0]

            # Apply floor penalty
            penalty = self._calc_floor_penalty(p)
            self.scores[p] = max(0, self.scores[p] + penalty)

            # Return floor tiles to box lid (except first-player marker)
            for tile in self.floor_lines[p]:
                if tile != "1":
                    self.box_lid.append(tile)
            self.floor_lines[p] = []

        # Check for game end
        game_ends = False
        for p in range(2):
            for row in range(self.board_size):
                if all(self.walls[p][row]):
                    game_ends = True
                    break
            if game_ends:
                break

        if game_ends:
            self._apply_end_bonuses()
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None  # draw
        else:
            self._start_new_round()

    def _score_tile(self, p, row, col):
        """Score a newly placed tile based on adjacency."""
        points = 0
        # Count horizontal chain
        h_count = 1
        # Left
        c = col - 1
        while c >= 0 and self.walls[p][row][c]:
            h_count += 1
            c -= 1
        # Right
        c = col + 1
        while c < self.board_size and self.walls[p][row][c]:
            h_count += 1
            c += 1

        # Count vertical chain
        v_count = 1
        # Up
        r = row - 1
        while r >= 0 and self.walls[p][r][col]:
            v_count += 1
            r -= 1
        # Down
        r = row + 1
        while r < self.board_size and self.walls[p][r][col]:
            v_count += 1
            r += 1

        if h_count > 1 and v_count > 1:
            points = h_count + v_count
        elif h_count > 1:
            points = h_count
        elif v_count > 1:
            points = v_count
        else:
            points = 1

        return points

    def _apply_end_bonuses(self):
        """Apply end-of-game bonus scoring."""
        for p in range(2):
            # Complete rows: +2 each
            for row in range(self.board_size):
                if all(self.walls[p][row]):
                    self.scores[p] += 2

            # Complete columns: +7 each
            for col in range(self.board_size):
                if all(self.walls[p][row][col] for row in range(self.board_size)):
                    self.scores[p] += 7

            # All 5 of one color: +10 each
            for color in self.colors:
                positions = []
                for row in range(self.board_size):
                    c = self.wall_pattern[row].index(color)
                    positions.append(self.walls[p][row][c])
                if all(positions):
                    self.scores[p] += 10

    def check_game_over(self):
        """Game over is handled in _wall_tiling_phase. This is a no-op check."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "bag": list(self.bag),
            "box_lid": list(self.box_lid),
            "factories": [list(f) for f in self.factories],
            "center": list(self.center),
            "first_player_marker_in_center": self.first_player_marker_in_center,
            "num_colors": self.num_colors,
            "board_size": self.board_size,
            "num_factories": self.num_factories,
            "colors": list(self.colors),
            "wall_pattern": [list(row) for row in self.wall_pattern],
            "pattern_lines": [
                [list(pl) for pl in self.pattern_lines[p]] for p in range(2)
            ],
            "walls": [
                [list(row) for row in self.walls[p]] for p in range(2)
            ],
            "floor_lines": [list(fl) for fl in self.floor_lines],
            "scores": list(self.scores),
            "round_number": self.round_number,
            "first_player_next_round": self.first_player_next_round,
        }

    def load_state(self, state):
        """Restore game state."""
        self.bag = list(state["bag"])
        self.box_lid = list(state["box_lid"])
        self.factories = [list(f) for f in state["factories"]]
        self.center = list(state["center"])
        self.first_player_marker_in_center = state["first_player_marker_in_center"]
        self.num_colors = state["num_colors"]
        self.board_size = state["board_size"]
        self.num_factories = state["num_factories"]
        self.colors = list(state["colors"])
        self.wall_pattern = [list(row) for row in state["wall_pattern"]]
        self.pattern_lines = [
            [list(pl) for pl in state["pattern_lines"][p]] for p in range(2)
        ]
        self.walls = [
            [list(row) for row in state["walls"][p]] for p in range(2)
        ]
        self.floor_lines = [list(fl) for fl in state["floor_lines"]]
        self.scores = list(state["scores"])
        self.round_number = state["round_number"]
        self.first_player_next_round = state["first_player_next_round"]

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Azul - Tutorial
==================================================

  OVERVIEW:
  Azul is a tile-drafting game where you pick
  colored tiles from shared factory displays and
  place them on your pattern lines to build a
  beautiful mosaic wall.

  TILE COLORS:
  B = Blue, Y = Yellow, R = Red, K = Black, W = White

  ROUND STRUCTURE:
  1. FACTORY OFFER PHASE:
     On your turn, you must pick ALL tiles of ONE
     color from either:
     - A factory display (remaining tiles go to center)
     - The center area
     The first player to take from the center also
     takes the first-player marker (counts as a
     penalty tile on their floor line).

  2. TILE PLACEMENT:
     Place your picked tiles on one pattern line
     (rows 1-5, holding 1-5 tiles respectively).
     - The line must be empty or already have the
       same color.
     - The color must not already be on the wall
       in that row.
     - Tiles that don't fit go to your floor line
       (penalty).
     - You may also send all tiles directly to the
       floor line.

  3. WALL-TILING (after all tiles are taken):
     - Completed pattern lines move one tile to the
       matching wall position.
     - Scoring: 1 point per tile, plus bonus for
       each adjacent tile in horizontal/vertical
       chains.
     - Floor line penalties: -1,-1,-2,-2,-2,-3,-3
     - Leftover tiles return to the bag.

  GAME END:
  The game ends after a round in which at least one
  player completes a full horizontal row on their wall.

  END-GAME BONUSES:
  - Complete horizontal row:     +2 points
  - Complete vertical column:    +7 points
  - All 5 of one color on wall: +10 points

  HOW TO ENTER MOVES:
  Format: factory_num color pattern_line
  - factory_num: 1-5 for factories, 0 for center
  - color: B, Y, R, K, or W
  - pattern_line: 1-5 for a row, F for floor

  Examples:
  - "3 B 2" = Take all Blue from factory 3, place
    on pattern line 2.
  - "0 R F" = Take all Red from center, send to
    floor line.

  STRATEGY HINTS:
  - Try to complete rows quickly for wall points.
  - Plan ahead: each wall row has a fixed color
    pattern, so choose colors that fit your board.
  - Avoid the floor line - penalties add up fast.
  - Completing full rows, columns, and color sets
    gives big end-game bonuses.

  SIMPLE VARIATION:
  Uses 3 colors (B, Y, R), 3 factories, and a
  3x3 wall/pattern line grid for a quicker game.

==================================================
"""
