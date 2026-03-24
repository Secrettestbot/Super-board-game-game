"""Fjords - Two-phase tile-laying and land claim game."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Terrain types
MOUNTAIN = "M"
MEADOW = "G"  # green meadow
WATER = "W"

TERRAIN_DISPLAY = {
    MOUNTAIN: "^^^",
    MEADOW: " . ",
    WATER: "~~~",
    None: "   ",
}

CLAIM_DISPLAY = {
    1: "[1]",
    2: "[2]",
}


def _generate_tile_pool(count):
    """Generate a pool of hex terrain tiles. Each tile has 6 edges."""
    tiles = []
    terrains = [MOUNTAIN, MEADOW, WATER]
    # Weight meadows higher so there's more to claim
    weights = [0.25, 0.55, 0.20]
    for i in range(count):
        # A tile is a terrain type (center) plus edge types for connectivity
        center = random.choices(terrains, weights=weights, k=1)[0]
        # Each tile has a primary terrain; edges match for placement rules
        edges = []
        for _ in range(6):
            if center == MOUNTAIN:
                edges.append(random.choices(terrains, [0.5, 0.3, 0.2], k=1)[0])
            elif center == WATER:
                edges.append(random.choices(terrains, [0.2, 0.3, 0.5], k=1)[0])
            else:
                edges.append(random.choices(terrains, [0.2, 0.6, 0.2], k=1)[0])
        tiles.append({"id": i, "center": center, "edges": edges})
    return tiles


# Hex grid uses offset coordinates (odd-r layout)
# Neighbors for odd-r hex grid
def _hex_neighbors(row, col):
    """Return neighbor coordinates for offset hex grid (odd-r)."""
    if row % 2 == 0:
        return [
            (row - 1, col - 1), (row - 1, col),
            (row, col - 1), (row, col + 1),
            (row + 1, col - 1), (row + 1, col),
        ]
    else:
        return [
            (row - 1, col), (row - 1, col + 1),
            (row, col - 1), (row, col + 1),
            (row + 1, col), (row + 1, col + 1),
        ]


class FjordsGame(BaseGame):
    """Fjords: Build a landscape with tiles, then claim meadow territory."""

    name = "Fjords"
    description = "Two-phase tile-laying and land claim game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (36 tiles, 8x8 board)",
        "quick": "Quick game (24 tiles, 6x6 board)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.rows = 8
        self.cols = 8
        self.tile_count = 36
        self.board = []  # 2D grid: each cell is {"terrain": ..., "claim": None/1/2} or None
        self.tile_pool = []
        self.current_tile = None
        self.phase = 1  # 1 = tile laying, 2 = claiming
        self.tiles_placed = 0
        self.scores = [0, 0]
        self.claims = [0, 0]  # number of claim tokens placed per player
        self.max_claims = 0
        self.consecutive_passes = 0

    def setup(self):
        if self.variation == "quick":
            self.rows = 6
            self.cols = 6
            self.tile_count = 24
        else:
            self.rows = 8
            self.cols = 8
            self.tile_count = 36

        self.board = [[None for _ in range(self.cols)] for _ in range(self.rows)]
        self.tile_pool = _generate_tile_pool(self.tile_count)
        random.shuffle(self.tile_pool)
        self.tiles_placed = 0
        self.phase = 1
        self.scores = [0, 0]
        self.claims = [0, 0]
        self.max_claims = (self.rows * self.cols) // 2
        self.consecutive_passes = 0

        # Place initial seed tiles in center
        cr, cc = self.rows // 2, self.cols // 2
        for dr, dc in [(0, 0), (0, 1), (1, 0)]:
            r, c = cr + dr - 1, cc + dc - 1
            if self.tile_pool:
                tile = self.tile_pool.pop()
                self.board[r][c] = {"terrain": tile["center"], "claim": None}
                self.tiles_placed += 1

        self._draw_tile()

    def _draw_tile(self):
        """Draw the next tile from the pool."""
        if self.tile_pool:
            self.current_tile = self.tile_pool.pop()
        else:
            self.current_tile = None

    def _valid_tile_placements(self):
        """Return list of (row, col) where current tile can be placed."""
        valid = []
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] is not None:
                    continue
                # Must be adjacent to at least one placed tile
                neighbors = _hex_neighbors(r, c)
                has_neighbor = False
                for nr, nc in neighbors:
                    if 0 <= nr < self.rows and 0 <= nc < self.cols:
                        if self.board[nr][nc] is not None:
                            has_neighbor = True
                            break
                if has_neighbor:
                    valid.append((r, c))
        return valid

    def _valid_claim_placements(self, player):
        """Return list of (row, col) where player can place a claim."""
        valid = []
        # Player can claim any unclaimed meadow adjacent to one of their existing claims
        has_any_claim = False
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] is not None and self.board[r][c]["claim"] == player:
                    has_any_claim = True
                    break
            if has_any_claim:
                break

        for r in range(self.rows):
            for c in range(self.cols):
                cell = self.board[r][c]
                if cell is None or cell["terrain"] != MEADOW or cell["claim"] is not None:
                    continue
                if not has_any_claim:
                    # First claim: can place on any unclaimed meadow
                    valid.append((r, c))
                else:
                    # Must be adjacent to existing claim
                    neighbors = _hex_neighbors(r, c)
                    for nr, nc in neighbors:
                        if 0 <= nr < self.rows and 0 <= nc < self.cols:
                            ncell = self.board[nr][nc]
                            if ncell is not None and ncell["claim"] == player:
                                valid.append((r, c))
                                break
        return valid

    def display(self):
        clear_screen()
        print(f"{'='*50}")
        print(f"  FJORDS - {self.variations[self.variation]}")
        print(f"  Phase {self.phase}: {'Tile Laying' if self.phase == 1 else 'Land Claiming'}")
        print(f"  Turn: {self.players[self.current_player - 1]}")
        print(f"  Scores: {self.players[0]}={self.scores[0]}  {self.players[1]}={self.scores[1]}")
        print(f"{'='*50}")

        # Column headers
        header = "     "
        for c in range(self.cols):
            header += f" {c:^3}"
        print(header)
        print("     " + "----" * self.cols)

        for r in range(self.rows):
            indent = "  " if r % 2 == 0 else "    "
            row_str = f" {r:2} |"
            for c in range(self.cols):
                cell = self.board[r][c]
                if cell is None:
                    row_str += " -- "
                elif cell["claim"] is not None:
                    row_str += f" {CLAIM_DISPLAY[cell['claim']]}"
                else:
                    row_str += f" {TERRAIN_DISPLAY[cell['terrain']]}"
            print(indent + row_str)

        print()
        if self.phase == 1:
            if self.current_tile:
                print(f"  Current tile: {TERRAIN_DISPLAY[self.current_tile['center']].strip()} "
                      f"({self.current_tile['center']})")
                print(f"  Tiles remaining: {len(self.tile_pool)}")
            else:
                print("  No more tiles!")
        else:
            print(f"  Claims placed: P1={self.claims[0]} P2={self.claims[1]}")
        print()

    def get_move(self):
        if self.phase == 1:
            if self.current_tile is None:
                print("  No more tiles. Moving to claim phase.")
                return "end_phase"

            valid = self._valid_tile_placements()
            if not valid:
                print("  No valid placements. Moving to claim phase.")
                return "end_phase"

            print("  Valid positions:", ", ".join(f"({r},{c})" for r, c in valid[:15]))
            if len(valid) > 15:
                print(f"  ... and {len(valid) - 15} more")
            move = input_with_quit("  Place tile at (row,col): ")
            return ("place_tile", move)
        else:
            valid = self._valid_claim_placements(self.current_player)
            if not valid:
                print("  No valid claim positions. Type 'pass'.")
                input_with_quit("  Press Enter to pass: ")
                return ("pass",)

            print("  Valid claim positions:", ", ".join(f"({r},{c})" for r, c in valid[:15]))
            if len(valid) > 15:
                print(f"  ... and {len(valid) - 15} more")
            move = input_with_quit("  Claim meadow at (row,col) or 'pass': ")
            if move.strip().lower() == "pass":
                return ("pass",)
            return ("claim", move)

    def make_move(self, move):
        if move == "end_phase":
            self.phase = 2
            self.consecutive_passes = 0
            return True

        if move[0] == "place_tile":
            try:
                parts = move[1].strip().strip("()").split(",")
                r, c = int(parts[0].strip()), int(parts[1].strip())
            except (ValueError, IndexError):
                return False

            if r < 0 or r >= self.rows or c < 0 or c >= self.cols:
                return False
            if self.board[r][c] is not None:
                return False
            if (r, c) not in self._valid_tile_placements():
                return False

            self.board[r][c] = {"terrain": self.current_tile["center"], "claim": None}
            self.tiles_placed += 1
            self._draw_tile()
            self.consecutive_passes = 0
            return True

        if move[0] == "pass":
            self.consecutive_passes += 1
            return True

        if move[0] == "claim":
            try:
                parts = move[1].strip().strip("()").split(",")
                r, c = int(parts[0].strip()), int(parts[1].strip())
            except (ValueError, IndexError):
                return False

            if r < 0 or r >= self.rows or c < 0 or c >= self.cols:
                return False
            valid = self._valid_claim_placements(self.current_player)
            if (r, c) not in valid:
                return False

            self.board[r][c]["claim"] = self.current_player
            self.claims[self.current_player - 1] += 1
            self.scores[self.current_player - 1] += 1
            self.consecutive_passes = 0
            return True

        return False

    def check_game_over(self):
        if self.phase == 1:
            # Phase 1 ends when no tiles or no valid placements
            if self.current_tile is None or not self._valid_tile_placements():
                self.phase = 2
                self.consecutive_passes = 0
            return

        # Phase 2 ends when both players pass consecutively
        if self.consecutive_passes >= 2:
            self.game_over = True
            # Also check if no valid claims for either player
            if not self._valid_claim_placements(1) and not self._valid_claim_placements(2):
                self.game_over = True

            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None
            return

        # Check if current player (after switch) has valid claims
        # Game continues as long as at least one player can claim

    def get_state(self):
        # Convert board to serializable format
        board_data = []
        for r in range(self.rows):
            row_data = []
            for c in range(self.cols):
                cell = self.board[r][c]
                if cell is None:
                    row_data.append(None)
                else:
                    row_data.append({"terrain": cell["terrain"], "claim": cell["claim"]})
            board_data.append(row_data)

        tile_pool_data = [{"id": t["id"], "center": t["center"], "edges": t["edges"]}
                          for t in self.tile_pool]
        current_tile_data = None
        if self.current_tile:
            current_tile_data = {
                "id": self.current_tile["id"],
                "center": self.current_tile["center"],
                "edges": self.current_tile["edges"],
            }

        return {
            "rows": self.rows,
            "cols": self.cols,
            "board": board_data,
            "tile_pool": tile_pool_data,
            "current_tile": current_tile_data,
            "phase": self.phase,
            "tiles_placed": self.tiles_placed,
            "scores": self.scores,
            "claims": self.claims,
            "consecutive_passes": self.consecutive_passes,
            "tile_count": self.tile_count,
            "max_claims": self.max_claims,
        }

    def load_state(self, state):
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.board = []
        for row_data in state["board"]:
            row = []
            for cell in row_data:
                if cell is None:
                    row.append(None)
                else:
                    row.append({"terrain": cell["terrain"], "claim": cell["claim"]})
            self.board.append(row)
        self.tile_pool = state["tile_pool"]
        self.current_tile = state["current_tile"]
        self.phase = state["phase"]
        self.tiles_placed = state["tiles_placed"]
        self.scores = list(state["scores"])
        self.claims = list(state["claims"])
        self.consecutive_passes = state["consecutive_passes"]
        self.tile_count = state["tile_count"]
        self.max_claims = state["max_claims"]

    def get_tutorial(self):
        return """
==========================================
  FJORDS - Tutorial
==========================================

Fjords is a two-phase territory game:

PHASE 1 - TILE LAYING:
  Players take turns placing terrain tiles onto the shared board.
  Each tile has a terrain type: Mountain (^^^), Meadow ( . ), or Water (~~~).
  Tiles must be placed adjacent to existing tiles.
  The landscape grows organically as players build it together.

PHASE 2 - LAND CLAIMING:
  Players take turns placing claim markers on meadow hexes.
  Your first claim can go on any unclaimed meadow.
  After that, each new claim must be adjacent to one of your existing claims.
  If you cannot place a claim, you must pass.
  The game ends when both players pass consecutively.

SCORING:
  Each claimed meadow hex = 1 point.
  The player with the most claimed meadows wins!

CONTROLS:
  Enter coordinates as: row,col (e.g., 3,4)
  Type 'pass' during claiming phase to pass your turn.

STRATEGY TIPS:
  - In Phase 1, place mountains and water to create barriers
  - Try to create large connected meadow areas near your side
  - In Phase 2, expand quickly to claim the most territory
  - Block your opponent from reaching large meadow areas
"""
