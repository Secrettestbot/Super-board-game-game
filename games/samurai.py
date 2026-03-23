"""Samurai - Area-influence game on a hexagonal grid."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Figure types
BUDDHA = "B"
RICE = "R"
HELMET = "H"
FIGURE_TYPES = [BUDDHA, RICE, HELMET]
FIGURE_NAMES = {BUDDHA: "Buddha", RICE: "Rice", HELMET: "High Helmet"}

# Tile types for players
TILE_TYPES = {
    "b1": (BUDDHA, 1), "b2": (BUDDHA, 2), "b3": (BUDDHA, 3),
    "r1": (RICE, 1), "r2": (RICE, 2), "r3": (RICE, 3),
    "h1": (HELMET, 1), "h2": (HELMET, 2), "h3": (HELMET, 3),
    "s1": ("SAMURAI", 1), "s2": ("SAMURAI", 2),  # wild - affects all types
    "sw": ("SWAP", 0),  # swap tile
    "mv": ("MOVE", 0),  # move a figure
}

LAND = "."
SEA = "~"
CITY = "C"


class SamuraiGame(BaseGame):
    """Samurai: Influence figures on a hexagonal grid with strategic tile placement."""

    name = "Samurai"
    description = "Area-influence game placing tiles to control Buddhas, Rice, and Helmets"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full board (13x13) with all figures and tiles",
        "quick": "Smaller board (9x9) with fewer figures for faster play",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.rows = 0
        self.cols = 0
        self.board = []
        self.figures = {}  # (r,c) -> list of figure types at that location
        self.influence = {}  # (r,c) -> {type: {1: total, 2: total}}
        self.hands = {1: [], 2: []}
        self.tile_pools = {1: [], 2: []}
        self.played_tiles = {}  # (r,c) -> (player, tile_type)
        self.captured = {1: {BUDDHA: 0, RICE: 0, HELMET: 0},
                         2: {BUDDHA: 0, RICE: 0, HELMET: 0}}
        self.fast_actions_left = 0

    def setup(self):
        if self.variation == "quick":
            self.rows, self.cols = 9, 9
            num_figures = {BUDDHA: 3, RICE: 3, HELMET: 3}
            num_cities = 2
        else:
            self.rows, self.cols = 13, 13
            num_figures = {BUDDHA: 5, RICE: 5, HELMET: 5}
            num_cities = 4

        self._create_board(num_cities)
        self._place_figures(num_figures)
        self._create_tile_pools()

        for p in [1, 2]:
            self.hands[p] = [self.tile_pools[p].pop() for _ in range(5)
                             if self.tile_pools[p]]

    def _create_board(self, num_cities):
        self.board = [[SEA for _ in range(self.cols)] for _ in range(self.rows)]
        center_r, center_c = self.rows // 2, self.cols // 2
        radius = min(self.rows, self.cols) // 2 - 1

        for r in range(self.rows):
            for c in range(self.cols):
                dist = abs(r - center_r) + abs(c - center_c)
                if dist <= radius:
                    self.board[r][c] = LAND

        # Place cities
        placed = 0
        attempts = 0
        while placed < num_cities and attempts < 100:
            attempts += 1
            r = random.randint(2, self.rows - 3)
            c = random.randint(2, self.cols - 3)
            if self.board[r][c] == LAND:
                self.board[r][c] = CITY
                placed += 1

    def _place_figures(self, num_figures):
        land_cells = []
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] in (LAND, CITY):
                    land_cells.append((r, c))

        random.shuffle(land_cells)
        idx = 0
        for fig_type, count in num_figures.items():
            for _ in range(count):
                if idx < len(land_cells):
                    pos = land_cells[idx]
                    key = f"{pos[0]},{pos[1]}"
                    if key not in self.figures:
                        self.figures[key] = []
                    self.figures[key].append(fig_type)
                    idx += 1

        # Cities get one of each type
        for r in range(self.rows):
            for c in range(self.cols):
                if self.board[r][c] == CITY:
                    key = f"{r},{c}"
                    if key not in self.figures:
                        self.figures[key] = []
                    for ft in FIGURE_TYPES:
                        if ft not in self.figures[key]:
                            self.figures[key].append(ft)

    def _create_tile_pools(self):
        base_tiles = ["b1", "b2", "b3", "r1", "r2", "r3",
                      "h1", "h2", "h3", "s1", "s2", "sw", "mv"]
        for p in [1, 2]:
            self.tile_pools[p] = base_tiles[:]
            if self.variation != "quick":
                self.tile_pools[p].extend(["b2", "r2", "h2", "s1"])
            random.shuffle(self.tile_pools[p])

    def _hex_neighbors(self, r, c):
        """Get neighbors in hex-like grid (using offset coordinates)."""
        neighbors = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, 1), (1, -1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                neighbors.append((nr, nc))
        return neighbors

    def _cell_display(self, r, c):
        key = f"{r},{c}"
        val = self.board[r][c]

        if val == SEA:
            return " ~~ "
        if key in self.played_tiles:
            pl, tt = self.played_tiles[key]
            return f"{pl}{tt:>2} "
        if key in self.figures and self.figures[key]:
            figs = "".join(self.figures[key])
            return f"[{figs}]"[:4].ljust(4)
        if val == CITY:
            return " CC "
        return " .. "

    def display(self):
        clear_screen()
        p = self.current_player
        print(f"=== Samurai === Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} captured: B={self.captured[1][BUDDHA]} "
              f"R={self.captured[1][RICE]} H={self.captured[1][HELMET]}")
        print(f"  {self.players[1]} captured: B={self.captured[2][BUDDHA]} "
              f"R={self.captured[2][RICE]} H={self.captured[2][HELMET]}")
        print()

        header = "    " + "".join(f"{c:4d}" for c in range(self.cols))
        print(header)
        for r in range(self.rows):
            row_str = f"{r:3d} " + "".join(self._cell_display(r, c) for c in range(self.cols))
            print(row_str)
        print()

        # Show figures remaining
        remaining = sum(len(v) for v in self.figures.values())
        print(f"  Figures remaining on board: {remaining}")
        print(f"\nPlayer {p}'s hand: {', '.join(self.hands[p])}")
        print(f"  Tiles in pool: {len(self.tile_pools[p])}")
        tile_desc = {k: f"{FIGURE_NAMES.get(v[0], v[0])}+{v[1]}" for k, v in TILE_TYPES.items()}
        print(f"  Tile guide: " + ", ".join(f"{k}={tile_desc[k]}" for k in sorted(TILE_TYPES.keys())))

    def get_move(self):
        print("\nPlace tile: TILE_NAME ROW COL (e.g., 'b2 5 3')")
        print("Or 'pass' to end turn")
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

        tile_name = parts[0]
        try:
            r, c = int(parts[1]), int(parts[2])
        except ValueError:
            return False

        if tile_name not in self.hands[p]:
            return False
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if self.board[r][c] == SEA:
            return False
        key = f"{r},{c}"
        if key in self.played_tiles:
            return False
        if key in self.figures and self.figures[key]:
            return False

        # Must be adjacent to at least one figure
        neighbors = self._hex_neighbors(r, c)
        adj_to_figure = False
        for nr, nc in neighbors:
            nkey = f"{nr},{nc}"
            if nkey in self.figures and self.figures[nkey]:
                adj_to_figure = True
                break
        if not adj_to_figure:
            return False

        tile_info = TILE_TYPES[tile_name]
        self.played_tiles[key] = (p, tile_name)
        self.hands[p].remove(tile_name)

        # Apply influence and check for captures
        self._apply_influence(p, r, c, tile_info)
        self._check_captures()

        # Draw new tile
        if self.tile_pools[p]:
            self.hands[p].append(self.tile_pools[p].pop())

        return True

    def _apply_influence(self, player, r, c, tile_info):
        tile_type, strength = tile_info
        neighbors = self._hex_neighbors(r, c)

        for nr, nc in neighbors:
            nkey = f"{nr},{nc}"
            if nkey not in self.figures or not self.figures[nkey]:
                continue

            if nkey not in self.influence:
                self.influence[nkey] = {}

            for fig_type in self.figures[nkey]:
                if fig_type not in self.influence[nkey]:
                    self.influence[nkey][fig_type] = {1: 0, 2: 0}

                if tile_type == "SAMURAI" or tile_type == fig_type:
                    self.influence[nkey][fig_type][player] += strength

    def _check_captures(self):
        """Check if any figures are fully surrounded and should be captured."""
        to_remove = []

        for key, figs in list(self.figures.items()):
            if not figs:
                continue
            r, c = map(int, key.split(","))
            neighbors = self._hex_neighbors(r, c)

            # Check if all land neighbors have played tiles or are sea
            all_filled = True
            for nr, nc in neighbors:
                nkey = f"{nr},{nc}"
                if self.board[nr][nc] != SEA and nkey not in self.played_tiles:
                    # Check if there's a figure there (figures don't block)
                    if nkey not in self.figures or not self.figures[nkey]:
                        all_filled = False
                        break

            if all_filled:
                inf = self.influence.get(key, {})
                for fig_type in figs[:]:
                    fig_inf = inf.get(fig_type, {1: 0, 2: 0})
                    if fig_inf[1] > fig_inf[2]:
                        self.captured[1][fig_type] += 1
                    elif fig_inf[2] > fig_inf[1]:
                        self.captured[2][fig_type] += 1
                    # Tie = no one captures
                to_remove.append(key)

        for key in to_remove:
            self.figures[key] = []

    def check_game_over(self):
        # Game ends when all figures of one type are captured, or board is exhausted
        for fig_type in FIGURE_TYPES:
            total_remaining = sum(1 for figs in self.figures.values() if fig_type in figs)
            if total_remaining == 0:
                self.game_over = True
                break

        if not self.game_over:
            total_figs = sum(len(v) for v in self.figures.values())
            if total_figs == 0:
                self.game_over = True

        if not self.game_over:
            if all(len(self.hands[p]) == 0 and len(self.tile_pools[p]) == 0 for p in [1, 2]):
                self.game_over = True

        if self.game_over:
            self._final_scoring()

    def _final_scoring(self):
        """Majority scoring: most majorities wins. Ties broken by total captures."""
        majorities = {1: 0, 2: 0}
        for fig_type in FIGURE_TYPES:
            if self.captured[1][fig_type] > self.captured[2][fig_type]:
                majorities[1] += 1
            elif self.captured[2][fig_type] > self.captured[1][fig_type]:
                majorities[2] += 1

        if majorities[1] > majorities[2]:
            self.winner = 1
        elif majorities[2] > majorities[1]:
            self.winner = 2
        else:
            t1 = sum(self.captured[1].values())
            t2 = sum(self.captured[2].values())
            if t1 > t2:
                self.winner = 1
            elif t2 > t1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "board": self.board,
            "rows": self.rows,
            "cols": self.cols,
            "figures": self.figures,
            "influence": self.influence,
            "hands": {str(k): v for k, v in self.hands.items()},
            "tile_pools": {str(k): v for k, v in self.tile_pools.items()},
            "played_tiles": self.played_tiles,
            "captured": {str(k): v for k, v in self.captured.items()},
        }

    def load_state(self, state):
        self.board = state["board"]
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.figures = state["figures"]
        self.influence = state["influence"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.tile_pools = {int(k): v for k, v in state["tile_pools"].items()}
        self.played_tiles = state["played_tiles"]
        self.captured = {int(k): v for k, v in state["captured"].items()}

    def get_tutorial(self):
        return """
=== SAMURAI TUTORIAL ===

OVERVIEW:
  Place influence tiles on the board to control three types of figures:
  Buddha (B), Rice (R), and High Helmet (H).
  Win by having the majority in the most figure types.

BOARD:
  ~~ = Sea (cannot place tiles)
  .. = Land (place tiles here)
  CC = City (contains one of each figure type)
  [B] = Buddha figure, [R] = Rice, [H] = Helmet
  [BRH] = Multiple figures at one location

TILES IN YOUR HAND:
  b1/b2/b3 = Buddha influence (strength 1/2/3)
  r1/r2/r3 = Rice influence (strength 1/2/3)
  h1/h2/h3 = Helmet influence (strength 1/2/3)
  s1/s2    = Samurai (wild - influences ALL types)
  sw       = Swap tile (special action)
  mv       = Move tile (special action)

PLACING TILES:
  Type: TILE ROW COL (e.g., 'b2 5 3')
  Tiles must be placed on empty land adjacent to a figure.
  Each tile radiates influence to all adjacent figures of matching type.

CAPTURING:
  When all land spaces around a figure are filled with tiles,
  the player with the most influence captures that figure.
  Ties mean no one captures.

WINNING:
  Player with majority in the most figure types wins.
  Ties broken by total figures captured.

  Type 'pass' to end your turn.
"""
