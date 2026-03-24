"""Pueblo - Block stacking visibility game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class PuebloGame(BaseGame):
    """Pueblo - Hide your blocks in a shared pueblo to avoid the chief's gaze."""

    name = "Pueblo"
    description = "Block stacking visibility game - hide your blocks from the chief"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (4x4 grid, 3 height levels)",
        "small": "Small (3x3 grid, 2 height levels)",
    }

    # Tetromino shapes as relative (row, col) offsets
    PIECES = {
        "I": [(0, 0), (0, 1), (0, 2), (0, 3)],
        "L": [(0, 0), (1, 0), (2, 0), (2, 1)],
        "T": [(0, 0), (0, 1), (0, 2), (1, 1)],
        "S": [(0, 1), (0, 2), (1, 0), (1, 1)],
        "O": [(0, 0), (0, 1), (1, 0), (1, 1)],
    }

    SMALL_PIECES = {
        "I": [(0, 0), (0, 1), (0, 2)],
        "L": [(0, 0), (1, 0), (1, 1)],
        "T": [(0, 0), (0, 1), (0, 2), (1, 1)],
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.grid_size = 4
        self.max_height = 3
        # grid[r][c] = list of player numbers stacked at that cell, index 0 = bottom
        self.grid = []
        self.penalties = [0, 0]  # index 0 = player 1, index 1 = player 2
        self.chief_pos = 0  # index into perimeter positions
        self.perimeter = []  # list of (row, col, direction) for chief walk
        self.pieces_remaining = {1: [], 2: []}
        self.round_number = 0
        self.total_rounds = 0
        self.log = []

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        if self.variation == "small":
            self.grid_size = 3
            self.max_height = 2
        else:
            self.grid_size = 4
            self.max_height = 3

        self.grid = [[[] for _ in range(self.grid_size)] for _ in range(self.grid_size)]
        self.penalties = [0, 0]
        self.chief_pos = 0
        self.round_number = 0
        self.log = []
        self.game_over = False
        self.winner = None

        # Build perimeter positions for chief (clockwise around the grid)
        self.perimeter = []
        n = self.grid_size
        # Top edge: left to right, looking south
        for c in range(n):
            self.perimeter.append([-1, c, "S"])
        # Right edge: top to bottom, looking west
        for r in range(n):
            self.perimeter.append([r, n, "W"])
        # Bottom edge: right to left, looking north
        for c in range(n - 1, -1, -1):
            self.perimeter.append([n, c, "N"])
        # Left edge: bottom to top, looking east
        for r in range(n - 1, -1, -1):
            self.perimeter.append([r, -1, "E"])

        # Give each player pieces
        if self.variation == "small":
            piece_names = list(self.SMALL_PIECES.keys())
        else:
            piece_names = list(self.PIECES.keys())

        for p in [1, 2]:
            self.pieces_remaining[p] = list(piece_names)

        self.total_rounds = len(piece_names) * 2  # each player places all pieces
        self.current_player = 1

    def _get_pieces_dict(self):
        if self.variation == "small":
            return self.SMALL_PIECES
        return self.PIECES

    def _get_visible_from_chief(self):
        """Return dict of {(r, c): set of player numbers visible} from chief's current position."""
        cr, cc, direction = self.perimeter[self.chief_pos]
        visible = {}
        n = self.grid_size

        if direction == "S":
            # Chief is above, looking south along column cc
            for r in range(n):
                cell = self.grid[r][cc]
                if cell:
                    top = cell[-1]
                    visible[(r, cc)] = top
                    break  # first non-empty cell blocks view
        elif direction == "N":
            for r in range(n - 1, -1, -1):
                cell = self.grid[r][cc]
                if cell:
                    top = cell[-1]
                    visible[(r, cc)] = top
                    break
        elif direction == "E":
            for c in range(n):
                cell = self.grid[cr][c]
                if cell:
                    top = cell[-1]
                    visible[(cr, c)] = top
                    break
        elif direction == "W":
            for c in range(n - 1, -1, -1):
                cell = self.grid[cr][c]
                if cell:
                    top = cell[-1]
                    visible[(cr, c)] = top
                    break

        # Also check exposed tops at each height level along the sight line
        # More interesting: check all cells visible from the side at various heights
        visible_full = {}
        if direction == "S":
            for r in range(n):
                cell = self.grid[r][cc]
                for h, owner in enumerate(cell):
                    # visible if no taller cell in front (closer to chief = smaller r)
                    blocked = False
                    for r2 in range(r):
                        if len(self.grid[r2][cc]) > h:
                            blocked = True
                            break
                    if not blocked:
                        key = "{}-{}-{}".format(r, cc, h)
                        visible_full[key] = owner
        elif direction == "N":
            for r in range(n - 1, -1, -1):
                cell = self.grid[r][cc]
                for h, owner in enumerate(cell):
                    blocked = False
                    for r2 in range(r + 1, n):
                        if len(self.grid[r2][cc]) > h:
                            blocked = True
                            break
                    if not blocked:
                        key = "{}-{}-{}".format(r, cc, h)
                        visible_full[key] = owner
        elif direction == "E":
            for c in range(n):
                cell = self.grid[cr][c]
                for h, owner in enumerate(cell):
                    blocked = False
                    for c2 in range(c):
                        if len(self.grid[cr][c2]) > h:
                            blocked = True
                            break
                    if not blocked:
                        key = "{}-{}-{}".format(cr, c, h)
                        visible_full[key] = owner
        elif direction == "W":
            for c in range(n - 1, -1, -1):
                cell = self.grid[cr][c]
                for h, owner in enumerate(cell):
                    blocked = False
                    for c2 in range(c + 1, n):
                        if len(self.grid[cr][c2]) > h:
                            blocked = True
                            break
                    if not blocked:
                        key = "{}-{}-{}".format(cr, c, h)
                        visible_full[key] = owner

        return visible_full

    def _score_chief_view(self):
        """Score penalties for visible blocks from the chief's current position."""
        visible = self._get_visible_from_chief()
        p1_vis = sum(1 for v in visible.values() if v == 1)
        p2_vis = sum(1 for v in visible.values() if v == 2)
        self.penalties[0] += p1_vis
        self.penalties[1] += p2_vis
        return p1_vis, p2_vis

    def _can_place_piece(self, piece_cells, start_r, start_c):
        """Check if a piece can be placed at the given position."""
        for dr, dc in piece_cells:
            r, c = start_r + dr, start_c + dc
            if r < 0 or r >= self.grid_size or c < 0 or c >= self.grid_size:
                return False
            if len(self.grid[r][c]) >= self.max_height:
                return False
        # Check that all cells being placed on have compatible heights
        # (piece must rest on a flat surface or the ground)
        heights = []
        for dr, dc in piece_cells:
            r, c = start_r + dr, start_c + dc
            heights.append(len(self.grid[r][c]))
        # All cells must be at the same height (piece rests flat)
        if len(set(heights)) > 1:
            # Allow if piece bridges: max height diff of 1 and at least one support
            min_h = min(heights)
            max_h = max(heights)
            if max_h - min_h > 1:
                return False
        return True

    def _rotate_piece(self, cells):
        """Rotate piece 90 degrees clockwise."""
        return [(c, -r) for r, c in cells]

    def _normalize_piece(self, cells):
        """Normalize piece so minimum r and c are 0."""
        min_r = min(r for r, c in cells)
        min_c = min(c for r, c in cells)
        return sorted([(r - min_r, c - min_c) for r, c in cells])

    def _get_all_rotations(self, piece_name):
        """Get all unique rotations of a piece."""
        pieces_dict = self._get_pieces_dict()
        cells = pieces_dict[piece_name]
        rotations = []
        current = list(cells)
        seen = []
        for _ in range(4):
            norm = self._normalize_piece(current)
            if norm not in seen:
                seen.append(norm)
                rotations.append(norm)
            current = self._rotate_piece(current)
        return rotations

    def display(self):
        clear_screen()
        n = self.grid_size
        print("=" * 50)
        print(f"  PUEBLO - Round {self.round_number + 1}/{self.total_rounds}")
        print(f"  {self.players[0]}: {self.penalties[0]} penalty pts | "
              f"{self.players[1]}: {self.penalties[1]} penalty pts")
        print(f"  (Lower penalty wins!)")
        print("=" * 50)

        # Display grid with height info
        print("\n  Pueblo Grid (top view - number = height, letter = top owner):")
        print("    " + "   ".join(str(c) for c in range(n)))
        print("   " + "----" * n + "-")
        for r in range(n):
            row_str = f" {r} |"
            for c in range(n):
                cell = self.grid[r][c]
                if not cell:
                    row_str += " . |"
                else:
                    owner = cell[-1]
                    height = len(cell)
                    marker = "A" if owner == 1 else "B"
                    row_str += f"{height}{marker} |"
            print(row_str)
            print("   " + "----" * n + "-")

        # Show chief position
        cr, cc, direction = self.perimeter[self.chief_pos]
        dir_names = {"N": "North (looking up)", "S": "South (looking down)",
                     "E": "East (looking right)", "W": "West (looking left)"}
        print(f"\n  Chief position: edge ({cr},{cc}) looking {dir_names[direction]}")

        # Show current player's remaining pieces
        p = self.current_player
        if self.pieces_remaining[p]:
            print(f"\n  {self.players[p-1]}'s remaining pieces: {', '.join(self.pieces_remaining[p])}")
        else:
            print(f"\n  {self.players[p-1]} has placed all pieces.")

        # Log
        if self.log:
            print("\n  Recent:")
            for msg in self.log[-4:]:
                print(f"    {msg}")

        print()

    def get_move(self):
        p = self.current_player
        if not self.pieces_remaining[p]:
            print(f"  {self.players[p-1]} has no pieces left. Passing.")
            input_with_quit("  Press Enter to continue...")
            return "pass"

        pieces = self.pieces_remaining[p]
        print(f"  {self.players[p-1]}'s turn (you are {'A' if p == 1 else 'B'})")
        print(f"  Available pieces: {', '.join(pieces)}")

        # Select piece
        piece_name = None
        while piece_name is None:
            choice = input_with_quit("  Choose piece (e.g., I, L, T, S, O): ").strip().upper()
            if choice in pieces:
                piece_name = choice
            else:
                print(f"  Invalid choice. Available: {', '.join(pieces)}")

        # Show rotations
        rotations = self._get_all_rotations(piece_name)
        print(f"\n  Rotations for {piece_name}:")
        for i, rot in enumerate(rotations):
            # Display piece shape
            max_r = max(r for r, c in rot)
            max_c = max(c for r, c in rot)
            print(f"    Rotation {i}:")
            for r in range(max_r + 1):
                line = "      "
                for c in range(max_c + 1):
                    if (r, c) in rot:
                        line += "#"
                    else:
                        line += "."
                print(line)

        rot_idx = None
        while rot_idx is None:
            choice = input_with_quit(f"  Choose rotation (0-{len(rotations)-1}): ").strip()
            try:
                idx = int(choice)
                if 0 <= idx < len(rotations):
                    rot_idx = idx
                else:
                    print(f"  Enter 0-{len(rotations)-1}")
            except ValueError:
                print("  Enter a number.")

        # Choose position
        while True:
            pos = input_with_quit("  Place at position (row,col): ").strip()
            try:
                parts = pos.replace(" ", "").split(",")
                start_r, start_c = int(parts[0]), int(parts[1])
                if self._can_place_piece(rotations[rot_idx], start_r, start_c):
                    return {"piece": piece_name, "rotation": rot_idx, "row": start_r, "col": start_c}
                else:
                    print("  Cannot place piece there (out of bounds, too high, or uneven surface).")
            except (ValueError, IndexError):
                print("  Enter as row,col (e.g., 1,2)")

    def make_move(self, move):
        if move == "pass":
            # Advance chief and score
            p1_vis, p2_vis = self._score_chief_view()
            self._add_log(f"Chief scored: {self.players[0]} +{p1_vis}, {self.players[1]} +{p2_vis}")
            self.chief_pos = (self.chief_pos + 1) % len(self.perimeter)
            self.round_number += 1
            return True

        p = self.current_player
        piece_name = move["piece"]
        rot_idx = move["rotation"]
        start_r = move["row"]
        start_c = move["col"]

        rotations = self._get_all_rotations(piece_name)
        cells = rotations[rot_idx]

        if not self._can_place_piece(cells, start_r, start_c):
            return False

        # Place piece
        for dr, dc in cells:
            r, c = start_r + dr, start_c + dc
            self.grid[r][c].append(p)

        self.pieces_remaining[p].remove(piece_name)
        self._add_log(f"{self.players[p-1]} placed {piece_name} at ({start_r},{start_c})")

        # Chief scores after each placement
        p1_vis, p2_vis = self._score_chief_view()
        self._add_log(f"Chief scored: {self.players[0]} +{p1_vis}, {self.players[1]} +{p2_vis}")
        self.chief_pos = (self.chief_pos + 1) % len(self.perimeter)
        self.round_number += 1

        return True

    def check_game_over(self):
        # Game ends when all pieces are placed
        if not self.pieces_remaining[1] and not self.pieces_remaining[2]:
            # Final scoring: chief does a full walk around remaining perimeter
            for _ in range(len(self.perimeter)):
                self._score_chief_view()
                self.chief_pos = (self.chief_pos + 1) % len(self.perimeter)

            self.game_over = True
            if self.penalties[0] < self.penalties[1]:
                self.winner = 1
            elif self.penalties[1] < self.penalties[0]:
                self.winner = 2
            else:
                self.winner = None  # tie

    def get_state(self):
        # Convert grid (list of lists of lists) - already JSON-serializable
        return {
            "grid": self.grid,
            "penalties": self.penalties,
            "chief_pos": self.chief_pos,
            "pieces_remaining_1": self.pieces_remaining[1],
            "pieces_remaining_2": self.pieces_remaining[2],
            "round_number": self.round_number,
            "total_rounds": self.total_rounds,
            "grid_size": self.grid_size,
            "max_height": self.max_height,
            "perimeter": self.perimeter,
            "log": self.log,
        }

    def load_state(self, state):
        self.grid = state["grid"]
        self.penalties = state["penalties"]
        self.chief_pos = state["chief_pos"]
        self.pieces_remaining = {1: state["pieces_remaining_1"], 2: state["pieces_remaining_2"]}
        self.round_number = state["round_number"]
        self.total_rounds = state["total_rounds"]
        self.grid_size = state["grid_size"]
        self.max_height = state["max_height"]
        self.perimeter = state["perimeter"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  PUEBLO - Tutorial
==================================================

OVERVIEW:
  Pueblo is a block-stacking game where players try to hide their blocks
  inside a shared pueblo structure. A chief walks around the pueblo edges
  and penalizes any blocks visible from their vantage point.

GAMEPLAY:
  1. Players take turns placing tetromino-shaped pieces on the grid.
  2. Each piece is made of connected blocks belonging to your color.
  3. After each placement, the chief moves one step around the perimeter
     and scores penalties for any blocks visible from that position.
  4. Blocks can be stacked up to the maximum height level.
  5. Pieces must rest on a flat surface (all cells at similar heights).

VISIBILITY:
  The chief looks straight across the grid from their edge position.
  A block is visible if no taller block is between it and the chief.
  Each visible block of your color scores 1 penalty point.

STRATEGY:
  - Try to place blocks where they'll be hidden behind other blocks.
  - Stack your blocks under opponent blocks to stay hidden.
  - Pay attention to where the chief will be looking next!

WINNING:
  The player with the LOWEST penalty score wins!

CONTROLS:
  - Choose a piece shape, rotation, and grid position.
  - Position is given as row,col (e.g., 0,0 is top-left).
"""
