"""Tigris & Euphrates - Tile-laying civilization game with conflict resolution."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Tile colors/types
RED = "R"      # Temple (Priest)
BLUE = "B"     # Farm (Farmer)
GREEN = "G"    # Market (Trader)
BLACK = "K"    # Settlement (King)
CATASTROPHE = "X"
COLORS = [RED, BLUE, GREEN, BLACK]
COLOR_NAMES = {RED: "Temple(Red)", BLUE: "Farm(Blue)", GREEN: "Market(Green)", BLACK: "Settlement(Black)"}
LEADER_NAMES = {RED: "Priest", BLUE: "Farmer", GREEN: "Trader", BLACK: "King"}

# Board symbols
RIVER = "~"
EMPTY = "."
TEMPLE_START = "T"


class TigrisEuphratesGame(BaseGame):
    """Tigris & Euphrates: Build civilizations, resolve conflicts, collect treasures."""

    name = "Tigris & Euphrates"
    description = "Tile-laying civilization game with 4 leader types and conflict resolution"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard 11x16 board with full tile set",
        "quick": "Smaller 8x10 board with fewer tiles for faster play",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.board = []
        self.rows = 0
        self.cols = 0
        self.river_cells = []
        self.temples = []
        self.tile_bag = []
        self.hands = {1: [], 2: []}
        self.scores = {1: {c: 0 for c in COLORS}, 2: {c: 0 for c in COLORS}}
        self.leaders = {1: {c: None for c in COLORS}, 2: {c: None for c in COLORS}}
        self.treasures = {1: 0, 2: 0}
        self.catastrophes = {1: 2, 2: 2}
        self.actions_left = 2
        self.monuments = []

    def setup(self):
        if self.variation == "quick":
            self.rows, self.cols = 8, 10
            tile_counts = {RED: 14, BLUE: 14, GREEN: 14, BLACK: 14}
            num_temples = 4
        else:
            self.rows, self.cols = 11, 16
            tile_counts = {RED: 24, BLUE: 24, GREEN: 24, BLACK: 24}
            num_temples = 8

        self.board = [[EMPTY for _ in range(self.cols)] for _ in range(self.rows)]
        self._create_river()
        self._place_initial_temples(num_temples)

        for color, count in tile_counts.items():
            self.tile_bag.extend([color] * count)
        random.shuffle(self.tile_bag)

        for p in [1, 2]:
            self.hands[p] = [self._draw_tile() for _ in range(6)]

        self.actions_left = 2

    def _create_river(self):
        mid = self.rows // 2
        self.river_cells = []
        for c in range(self.cols):
            r = mid + random.choice([-1, 0, 0, 1]) if c > 0 else mid
            r = max(1, min(self.rows - 2, r))
            self.river_cells.append((r, c))
            self.board[r][c] = RIVER
            if c > 0:
                prev_r = self.river_cells[-2][0]
                if prev_r != r:
                    for ir in range(min(prev_r, r), max(prev_r, r) + 1):
                        if self.board[ir][c - 1] != RIVER:
                            self.river_cells.append((ir, c - 1))
                            self.board[ir][c - 1] = RIVER

    def _place_initial_temples(self, count):
        placed = 0
        attempts = 0
        while placed < count and attempts < 200:
            attempts += 1
            r = random.randint(1, self.rows - 2)
            c = random.randint(1, self.cols - 2)
            if self.board[r][c] == EMPTY:
                self.board[r][c] = RED
                self.temples.append((r, c))
                placed += 1

    def _draw_tile(self):
        if self.tile_bag:
            return self.tile_bag.pop()
        return None

    def _cell_str(self, r, c):
        val = self.board[r][c]
        if val == EMPTY:
            return " . "
        if val == RIVER:
            return " ~ "
        if val == CATASTROPHE:
            return " X "
        if val in COLORS:
            return f" {val} "
        # Leaders: stored as "L1R" = Leader player1 Red
        if val.startswith("L"):
            return f"{val[1]}{val[2]}>"
        return f" {val} "

    def display(self):
        clear_screen()
        p = self.current_player
        print(f"=== Tigris & Euphrates === Turn {self.turn_number + 1}")
        print(f"  {self.players[0]}: R={self.scores[1][RED]} B={self.scores[1][BLUE]} "
              f"G={self.scores[1][GREEN]} K={self.scores[1][BLACK]} T={self.treasures[1]}")
        print(f"  {self.players[1]}: R={self.scores[2][RED]} B={self.scores[2][BLUE]} "
              f"G={self.scores[2][GREEN]} K={self.scores[2][BLACK]} T={self.treasures[2]}")
        print()

        header = "   " + "".join(f"{c:3d}" for c in range(self.cols))
        print(header)
        for r in range(self.rows):
            row_str = f"{r:2d} " + "".join(self._cell_str(r, c) for c in range(self.cols))
            print(row_str)
        print()

        hand_str = " ".join(self.hands[p])
        print(f"Player {p} hand: [{hand_str}]  Catastrophes: {self.catastrophes[p]}")
        leaders_placed = {c: self.leaders[p][c] for c in COLORS if self.leaders[p][c] is not None}
        if leaders_placed:
            lstr = ", ".join(f"{LEADER_NAMES[c]}@{pos}" for c, pos in leaders_placed.items())
            print(f"  Leaders on board: {lstr}")
        else:
            print(f"  No leaders on board yet.")
        print(f"  Actions remaining this turn: {self.actions_left}")

    def get_move(self):
        print("\nActions: (t)ile r,c color | (l)eader r,c color | (c)atastrophe r,c")
        print("         (r)efresh hand | (p)ass")
        move = input_with_quit("Your action: ").strip().lower()
        return move

    def make_move(self, move):
        parts = move.split()
        if not parts:
            return False

        action = parts[0]
        p = self.current_player

        if action in ("p", "pass"):
            self.actions_left -= 1
            if self.actions_left <= 0:
                self.actions_left = 2
            return True

        if action in ("r", "refresh"):
            # Discard hand and draw new tiles
            discarded = self.hands[p][:]
            self.tile_bag.extend([t for t in discarded if t])
            random.shuffle(self.tile_bag)
            self.hands[p] = [self._draw_tile() for _ in range(6)]
            self.hands[p] = [t for t in self.hands[p] if t is not None]
            self.actions_left -= 1
            if self.actions_left <= 0:
                self.actions_left = 2
            return True

        if action in ("t", "tile"):
            if len(parts) < 4:
                return False
            try:
                r, c = int(parts[1]), int(parts[2])
                color = parts[3].upper()
            except (ValueError, IndexError):
                return False
            return self._place_tile(p, r, c, color)

        if action in ("l", "leader"):
            if len(parts) < 4:
                return False
            try:
                r, c = int(parts[1]), int(parts[2])
                color = parts[3].upper()
            except (ValueError, IndexError):
                return False
            return self._place_leader(p, r, c, color)

        if action in ("c", "catastrophe"):
            if len(parts) < 3:
                return False
            try:
                r, c = int(parts[1]), int(parts[2])
            except (ValueError, IndexError):
                return False
            return self._place_catastrophe(p, r, c)

        return False

    def _place_tile(self, player, r, c, color):
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if color not in COLORS:
            return False
        if color not in self.hands[player]:
            return False
        cell = self.board[r][c]
        if cell not in (EMPTY, RIVER):
            return False
        if color == BLUE and cell != RIVER:
            return False
        if color != BLUE and cell == RIVER:
            return False

        self.board[r][c] = color
        self.hands[player].remove(color)

        # Score point if player has matching leader in same kingdom
        kingdom = self._find_kingdom(r, c)
        scored = False
        for kr, kc in kingdom:
            val = self.board[kr][kc]
            if val.startswith("L") and val[1] == str(player) and val[2] == color:
                self.scores[player][color] += 1
                scored = True
                break
        if not scored:
            # Check for king getting black points for any unmatched tile
            for kr, kc in kingdom:
                val = self.board[kr][kc]
                if val.startswith("L") and val[1] == str(player) and val[2] == BLACK:
                    if color != RED:
                        self.scores[player][BLACK] += 1
                    break

        # Check for conflicts
        self._check_conflicts(r, c)

        # Refill hand
        new_tile = self._draw_tile()
        if new_tile:
            self.hands[player].append(new_tile)

        self.actions_left -= 1
        if self.actions_left <= 0:
            self.actions_left = 2
        return True

    def _place_leader(self, player, r, c, color):
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        if color not in COLORS:
            return False
        if self.board[r][c] != EMPTY:
            return False

        # Leader must be adjacent to a temple (red tile)
        adj = self._adjacent(r, c)
        has_temple = any(self.board[ar][ac] == RED for ar, ac in adj)
        if not has_temple:
            return False

        # Remove old leader position if on board
        old_pos = self.leaders[player][color]
        if old_pos is not None:
            self.board[old_pos[0]][old_pos[1]] = EMPTY

        leader_token = f"L{player}{color}"
        self.board[r][c] = leader_token
        self.leaders[player][color] = (r, c)

        self._check_conflicts(r, c)

        self.actions_left -= 1
        if self.actions_left <= 0:
            self.actions_left = 2
        return True

    def _place_catastrophe(self, player, r, c):
        if self.catastrophes[player] <= 0:
            return False
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            return False
        cell = self.board[r][c]
        if cell in (EMPTY, RIVER, CATASTROPHE):
            return False
        if cell.startswith("L"):
            return False

        self.board[r][c] = CATASTROPHE
        self.catastrophes[player] -= 1

        self.actions_left -= 1
        if self.actions_left <= 0:
            self.actions_left = 2
        return True

    def _adjacent(self, r, c):
        result = []
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                result.append((nr, nc))
        return result

    def _find_kingdom(self, r, c):
        """Find all connected cells in the kingdom containing (r,c)."""
        visited = set()
        stack = [(r, c)]
        while stack:
            cr, cc = stack.pop()
            if (cr, cc) in visited:
                continue
            val = self.board[cr][cc]
            if val in (EMPTY, RIVER, CATASTROPHE):
                continue
            visited.add((cr, cc))
            for nr, nc in self._adjacent(cr, cc):
                if (nr, nc) not in visited:
                    stack.append((nr, nc))
        return visited

    def _check_conflicts(self, r, c):
        """Simplified conflict: if two leaders of same color in one kingdom, weaker is removed."""
        kingdom = self._find_kingdom(r, c)
        leaders_in_kingdom = {}
        for kr, kc in kingdom:
            val = self.board[kr][kc]
            if val.startswith("L"):
                lp, lc = int(val[1]), val[2]
                if lc not in leaders_in_kingdom:
                    leaders_in_kingdom[lc] = []
                leaders_in_kingdom[lc].append((lp, kr, kc))

        for color, leader_list in leaders_in_kingdom.items():
            if len(leader_list) >= 2:
                # Conflict: count supporting temples (red tiles) adjacent to each leader
                strengths = []
                for lp, lr, lc in leader_list:
                    strength = sum(1 for ar, ac in self._adjacent(lr, lc)
                                   if self.board[ar][ac] == RED)
                    strengths.append((strength, lp, lr, lc))
                strengths.sort(reverse=True)
                # Winner stays, loser is removed
                winner = strengths[0]
                for loser in strengths[1:]:
                    lp, lr, lc = loser[1], loser[2], loser[3]
                    self.board[lr][lc] = EMPTY
                    self.leaders[lp][color] = None
                    # Winner gets a point
                    self.scores[winner[1]][RED] += 1

    def check_game_over(self):
        if len(self.tile_bag) == 0 and all(len(h) == 0 for h in self.hands.values()):
            self.game_over = True
        if self.turn_number >= (80 if self.variation == "quick" else 140):
            self.game_over = True

        if self.game_over:
            self._final_scoring()

    def _final_scoring(self):
        # Add treasure points (count as any color)
        for p in [1, 2]:
            for c in COLORS:
                self.scores[p][c] += self.treasures[p]

        s1 = min(self.scores[1].values())
        s2 = min(self.scores[2].values())
        if s1 > s2:
            self.winner = 1
        elif s2 > s1:
            self.winner = 2
        else:
            self.winner = None

    def get_state(self):
        leaders_ser = {}
        for p in [1, 2]:
            leaders_ser[str(p)] = {}
            for c in COLORS:
                pos = self.leaders[p][c]
                leaders_ser[str(p)][c] = list(pos) if pos else None
        return {
            "board": self.board,
            "rows": self.rows,
            "cols": self.cols,
            "tile_bag": self.tile_bag,
            "hands": {str(k): v for k, v in self.hands.items()},
            "scores": {str(k): v for k, v in self.scores.items()},
            "leaders": leaders_ser,
            "treasures": {str(k): v for k, v in self.treasures.items()},
            "catastrophes": {str(k): v for k, v in self.catastrophes.items()},
            "actions_left": self.actions_left,
            "monuments": self.monuments,
            "temples": [list(t) for t in self.temples],
            "river_cells": [list(rc) for rc in self.river_cells],
        }

    def load_state(self, state):
        self.board = state["board"]
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.tile_bag = state["tile_bag"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.treasures = {int(k): v for k, v in state["treasures"].items()}
        self.catastrophes = {int(k): v for k, v in state["catastrophes"].items()}
        self.actions_left = state["actions_left"]
        self.monuments = state["monuments"]
        self.temples = [tuple(t) for t in state["temples"]]
        self.river_cells = [tuple(rc) for rc in state["river_cells"]]
        leaders_ser = state["leaders"]
        self.leaders = {}
        for p_str, cols in leaders_ser.items():
            p = int(p_str)
            self.leaders[p] = {}
            for c, pos in cols.items():
                self.leaders[p][c] = tuple(pos) if pos else None

    def get_tutorial(self):
        return """
=== TIGRIS & EUPHRATES TUTORIAL ===

OVERVIEW:
  Build civilizations by placing tiles and leaders on the board.
  Score points in 4 colors: Red (temples), Blue (farms),
  Green (markets), and Black (settlements).
  Your final score is the LOWEST of your 4 color scores!

BOARD:
  ~ = River (only blue/farm tiles go here)
  . = Empty land (red, green, black tiles go here)
  R/B/G/K = Colored tiles
  1R> = Player 1's Red leader, 2K> = Player 2's King, etc.

ACTIONS (2 per turn):
  t r c COLOR  - Place a tile (e.g., 't 3 5 R' for red tile at row 3, col 5)
  l r c COLOR  - Place/move a leader (must be adjacent to a temple)
  c r c        - Place catastrophe tile (destroys a tile)
  r            - Refresh hand (discard all, draw 6 new)
  p            - Pass (skip an action)

LEADERS:
  Priest (R), Farmer (B), Trader (G), King (K)
  Place adjacent to a red temple tile.
  Earn points when matching tiles are placed in your kingdom.
  King earns black points for non-red tiles without matching leader.

CONFLICTS:
  If two leaders of the same color end up in one kingdom,
  a conflict occurs. Strength = adjacent temple tiles.
  Loser's leader is removed.

SCORING:
  Your final score = your LOWEST color score. Balance all four!
"""
