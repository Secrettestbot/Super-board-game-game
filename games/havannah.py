"""Havannah - A hexagonal connection game with three ways to win."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


class HavannahGame(BaseGame):
    """Havannah: Connect stones to form a ring, bridge, or fork."""

    name = "Havannah"
    description = "Hexagonal connection game - win by ring, bridge, or fork"
    min_players = 2
    max_players = 2
    variations = {
        "base4": "Base 4 (37 cells, quick game)",
        "base5": "Base 5 (61 cells, standard)",
        "base6": "Base 6 (91 cells, advanced)",
        "base8": "Base 8 (169 cells, tournament)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "base5")
        self.base = 0
        self.board = {}          # (r, c) -> player (1 or 2)
        self.cells = set()       # all valid (r, c) positions
        self.corners = set()     # the 6 corner cells
        self.edges = {}          # (r, c) -> edge index (0-5), only for non-corner edge cells
        self.win_type = None     # "ring", "bridge", or "fork"

    def setup(self):
        """Initialize the hex board for the chosen base size."""
        self.base = int(self.variation.replace("base", ""))
        b = self.base
        self.board = {}
        self.cells = set()
        self.corners = set()
        self.edges = {}
        self.win_type = None

        # Build the set of valid cells using axial-style coordinates.
        # The board has (2*b - 1) rows.
        # Row 0 .. b-2 have lengths b .. 2b-2  (top half, growing)
        # Row b-1 has length 2b-1              (middle row)
        # Row b .. 2b-2 have lengths 2b-2 .. b (bottom half, shrinking)
        total_rows = 2 * b - 1
        for r in range(total_rows):
            row_len = self._row_length(r)
            for c in range(row_len):
                self.cells.add((r, c))

        # Identify the 6 corners.
        # Top-left: (0, 0)
        # Top-right: (0, b-2)  -- wait, row 0 has length b, so last col = b-1
        # Let me reconsider. Row 0 has length b. Row b-1 has length 2b-1.
        # Row 2b-2 has length b.
        top_row = 0
        mid_row = b - 1
        bot_row = 2 * b - 2
        top_len = self._row_length(top_row)
        mid_len = self._row_length(mid_row)
        bot_len = self._row_length(bot_row)

        self.corners = {
            (top_row, 0),                  # corner 0: top-left
            (top_row, top_len - 1),        # corner 1: top-right
            (mid_row, 0),                  # corner 2: middle-left
            (mid_row, mid_len - 1),        # corner 3: middle-right
            (bot_row, 0),                  # corner 4: bottom-left
            (bot_row, bot_len - 1),        # corner 5: bottom-right
        }

        # Identify the 6 edges (sides between corners). Corners are NOT on edges.
        # Edge 0: top edge       -- row 0, excluding first and last col
        # Edge 1: upper-right    -- last col of rows 1..b-2
        # Edge 2: lower-right    -- last col of rows b..2b-3
        # Edge 3: bottom edge    -- row 2b-2, excluding first and last col
        # Edge 4: lower-left     -- col 0 of rows b..2b-3
        # Edge 5: upper-left     -- col 0 of rows 1..b-2
        self.edges = {}

        # Edge 0: top row interior
        for c in range(1, top_len - 1):
            self.edges[(top_row, c)] = 0

        # Edge 1: upper-right side (rows 1 to b-2, rightmost col)
        for r in range(1, b - 1):
            rl = self._row_length(r)
            self.edges[(r, rl - 1)] = 1

        # Edge 2: lower-right side (rows b to 2b-3, rightmost col)
        for r in range(b, 2 * b - 2):
            rl = self._row_length(r)
            self.edges[(r, rl - 1)] = 2

        # Edge 3: bottom row interior
        for c in range(1, bot_len - 1):
            self.edges[(bot_row, c)] = 3

        # Edge 4: lower-left side (rows b to 2b-3, col 0)
        for r in range(b, 2 * b - 2):
            self.edges[(r, 0)] = 4

        # Edge 5: upper-left side (rows 1 to b-2, col 0)
        for r in range(1, b - 1):
            self.edges[(r, 0)] = 5

    def _row_length(self, r):
        """Return the number of columns in row r."""
        b = self.base
        if r < b:
            return b + r
        else:
            return b + (2 * b - 2 - r)

    def _neighbors(self, r, c):
        """Return list of valid neighbor cells for (r, c)."""
        b = self.base
        result = []
        # In this hex grid, the neighbor offsets depend on whether the row
        # is in the top half (r < b-1), middle (r == b-1), or bottom half (r > b-1).
        # For top half rows (r < b), the next row is wider, so:
        #   same row: (r, c-1), (r, c+1)
        #   row above (shorter): (r-1, c-1), (r-1, c)
        #   row below (longer): (r+1, c), (r+1, c+1)
        # For bottom half rows (r >= b), the next row is shorter:
        #   same row: (r, c-1), (r, c+1)
        #   row above (longer): (r-1, c), (r-1, c+1)
        #   row below (shorter): (r+1, c-1), (r+1, c)

        if r < b - 1:
            # Top half (row below is longer, row above is shorter or doesn't exist)
            candidates = [
                (r, c - 1), (r, c + 1),       # same row
                (r - 1, c - 1), (r - 1, c),   # row above (shorter)
                (r + 1, c), (r + 1, c + 1),   # row below (longer)
            ]
        elif r == b - 1:
            # Middle row: row above is shorter (top half style), row below is shorter (bottom half style)
            candidates = [
                (r, c - 1), (r, c + 1),       # same row
                (r - 1, c - 1), (r - 1, c),   # row above (shorter)
                (r + 1, c - 1), (r + 1, c),   # row below (shorter)
            ]
        else:
            # Bottom half (row below is shorter, row above is longer)
            candidates = [
                (r, c - 1), (r, c + 1),       # same row
                (r - 1, c), (r - 1, c + 1),   # row above (longer)
                (r + 1, c - 1), (r + 1, c),   # row below (shorter)
            ]

        for nr, nc in candidates:
            if (nr, nc) in self.cells:
                result.append((nr, nc))
        return result

    def display(self):
        """Display the hex board with ASCII art."""
        b = self.base
        total_rows = 2 * b - 1
        symbols = {0: ".", 1: "\u25cf", 2: "\u25cb"}  # filled circle, open circle

        print(f"\n  === Havannah (Base {b}) ===")
        print(f"  {self.players[0]} ({symbols[1]}) vs {self.players[1]} ({symbols[2]})")
        print(f"  Current turn: {self.players[self.current_player - 1]} ({symbols[self.current_player]})")
        if self.win_type:
            print(f"  Win by: {self.win_type}!")
        print()

        max_row_len = 2 * b - 1  # length of the middle row

        for r in range(total_rows):
            row_len = self._row_length(r)
            # Indent so the board is centered around the middle row
            indent = max_row_len - row_len
            row_label = f"{r + 1:>3}"
            line = " " * indent + row_label + "  "
            cols = []
            for c in range(row_len):
                cell = self.board.get((r, c), 0)
                cols.append(symbols[cell])
            line += " ".join(cols)

            # Column labels on the right for reference
            line += f"    (cols a-{chr(ord('a') + row_len - 1)})"
            print(line)

        print()

    def _col_label(self, c):
        """Return label for column index c."""
        return chr(ord('a') + c)

    def get_move(self):
        """Get move as 'row col' e.g. '3 d'."""
        player_name = self.players[self.current_player - 1]
        b = self.base
        total_rows = 2 * b - 1

        while True:
            raw = input_with_quit(
                f"  {player_name}, enter move (row col, e.g. '3 d'): "
            ).strip().lower()

            parts = raw.split()
            if len(parts) != 2:
                print(f"  Invalid format. Enter row number and column letter, e.g. '3 d'.")
                continue

            try:
                row_num = int(parts[0])
                col_letter = parts[1]
            except ValueError:
                # Maybe they entered it as "d 3" (col first)
                try:
                    col_letter = parts[0]
                    row_num = int(parts[1])
                except ValueError:
                    print(f"  Invalid input. Use format 'row col' like '3 d'.")
                    continue

            if len(col_letter) != 1 or not col_letter.isalpha():
                print(f"  Column must be a single letter.")
                continue

            r = row_num - 1
            c = ord(col_letter) - ord('a')

            if r < 0 or r >= total_rows:
                print(f"  Row must be 1 to {total_rows}.")
                continue

            row_len = self._row_length(r)
            if c < 0 or c >= row_len:
                print(f"  Column must be a-{chr(ord('a') + row_len - 1)} for row {row_num}.")
                continue

            if (r, c) not in self.cells:
                print(f"  Invalid cell.")
                continue

            return (r, c)

    def make_move(self, move):
        """Place a stone at the given position. Returns True if valid."""
        r, c = move

        if (r, c) not in self.cells:
            print("  Invalid cell!")
            return False

        if (r, c) in self.board:
            print("  That cell is already occupied!")
            return False

        self.board[(r, c)] = self.current_player
        return True

    def _get_connected_component(self, start, player):
        """BFS to find all cells in the connected component of `player` containing `start`."""
        visited = set()
        queue = deque([start])
        visited.add(start)
        while queue:
            cell = queue.popleft()
            for nb in self._neighbors(cell[0], cell[1]):
                if nb not in visited and self.board.get(nb) == player:
                    visited.add(nb)
                    queue.append(nb)
        return visited

    def _check_bridge(self, component):
        """Check if the component touches at least 2 different corners."""
        touched_corners = set()
        for cell in component:
            if cell in self.corners:
                touched_corners.add(cell)
        return len(touched_corners) >= 2

    def _check_fork(self, component):
        """Check if the component touches at least 3 different edges."""
        touched_edges = set()
        for cell in component:
            if cell in self.edges:
                touched_edges.add(self.edges[cell])
        return len(touched_edges) >= 3

    def _check_ring(self, component):
        """Check if the component forms a ring (encloses at least one cell).

        Strategy: find all empty/opponent cells adjacent to the component.
        For each such cell, flood-fill outward through non-component cells.
        If the fill cannot reach the board boundary, the cell is enclosed -> ring.
        """
        # Collect cells adjacent to the component that are not in the component
        adjacent_non_component = set()
        for cell in component:
            for nb in self._neighbors(cell[0], cell[1]):
                if nb not in component:
                    adjacent_non_component.add(nb)

        if not adjacent_non_component:
            return False

        # We'll flood-fill from each unvisited adjacent cell.
        # If the fill is enclosed (can't reach boundary), it's a ring.
        checked = set()

        for start in adjacent_non_component:
            if start in checked:
                continue
            # BFS through cells not in the component
            visited = set()
            queue = deque([start])
            visited.add(start)
            reached_boundary = False

            while queue:
                cell = queue.popleft()
                # Check if this cell is on the boundary of the board
                if self._is_boundary(cell):
                    reached_boundary = True
                for nb in self._neighbors(cell[0], cell[1]):
                    if nb not in visited and nb not in component:
                        visited.add(nb)
                        queue.append(nb)

            checked.update(visited)
            if not reached_boundary:
                return True

        return False

    def _is_boundary(self, cell):
        """Check if a cell is on the boundary of the board (edge or corner)."""
        return cell in self.corners or cell in self.edges

    def check_game_over(self):
        """Check if the current player has won by ring, bridge, or fork."""
        player = self.current_player
        player_cells = {c for c, p in self.board.items() if p == player}

        if not player_cells:
            return

        # Find connected components for the current player
        visited = set()
        for cell in player_cells:
            if cell in visited:
                continue
            component = self._get_connected_component(cell, player)
            visited.update(component)

            # Check bridge
            if self._check_bridge(component):
                self.game_over = True
                self.winner = player
                self.win_type = "bridge"
                return

            # Check fork
            if self._check_fork(component):
                self.game_over = True
                self.winner = player
                self.win_type = "fork"
                return

            # Check ring
            if self._check_ring(component):
                self.game_over = True
                self.winner = player
                self.win_type = "ring"
                return

        # Check for draw (all cells filled, no winner)
        if len(self.board) == len(self.cells):
            self.game_over = True
            self.winner = None

    def get_state(self):
        """Return serializable game state."""
        # Convert tuple keys to strings for JSON
        board_serialized = {f"{r},{c}": p for (r, c), p in self.board.items()}
        return {
            "base": self.base,
            "board": board_serialized,
            "win_type": self.win_type,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.base = state["base"]
        self.variation = f"base{self.base}"
        self.win_type = state.get("win_type")

        # Rebuild cell geometry
        b = self.base
        self.cells = set()
        self.corners = set()
        self.edges = {}
        total_rows = 2 * b - 1

        for r in range(total_rows):
            row_len = self._row_length(r)
            for c in range(row_len):
                self.cells.add((r, c))

        top_row = 0
        mid_row = b - 1
        bot_row = 2 * b - 2
        top_len = self._row_length(top_row)
        mid_len = self._row_length(mid_row)
        bot_len = self._row_length(bot_row)

        self.corners = {
            (top_row, 0),
            (top_row, top_len - 1),
            (mid_row, 0),
            (mid_row, mid_len - 1),
            (bot_row, 0),
            (bot_row, bot_len - 1),
        }

        for c in range(1, top_len - 1):
            self.edges[(top_row, c)] = 0
        for r in range(1, b - 1):
            rl = self._row_length(r)
            self.edges[(r, rl - 1)] = 1
        for r in range(b, 2 * b - 2):
            rl = self._row_length(r)
            self.edges[(r, rl - 1)] = 2
        for c in range(1, bot_len - 1):
            self.edges[(bot_row, c)] = 3
        for r in range(b, 2 * b - 2):
            self.edges[(r, 0)] = 4
        for r in range(1, b - 1):
            self.edges[(r, 0)] = 5

        # Restore board
        self.board = {}
        for key, p in state["board"].items():
            r, c = key.split(",")
            self.board[(int(r), int(c))] = p

    def get_tutorial(self):
        """Return comprehensive tutorial text for Havannah."""
        return """
==============================================================
                   HAVANNAH  TUTORIAL
==============================================================

OVERVIEW
  Havannah is a two-player connection game played on a
  hexagonal board. It was invented by Christian Freeling in
  1979 and is considered one of the most elegant abstract
  strategy games. Players take turns placing stones on
  empty cells, aiming to complete one of three winning
  structures.

--------------------------------------------------------------
THE BOARD
--------------------------------------------------------------
  The board is a hexagon made of smaller hexagonal cells.
  The "base" size determines the board:

    Base 4  :  37 cells  (quick game, good for learning)
    Base 5  :  61 cells  (standard size)
    Base 6  :  91 cells  (advanced play)
    Base 8  : 169 cells  (tournament size)

  A base-5 board has rows of length 5,6,7,8,9,8,7,6,5.
  The board has 6 corner cells and 6 edges (sides)
  connecting those corners.

--------------------------------------------------------------
THREE WAYS TO WIN
--------------------------------------------------------------

  1. RING
     Form a loop (cycle) of your stones that surrounds at
     least one cell, whether empty or occupied by either
     player. The enclosed area can be any size. A ring is
     the hardest winning condition to achieve but also the
     hardest to defend against.

     Example (stones marked as X forming a ring around .):
            X X
           X . X
            X X

  2. BRIDGE
     Connect at least two of the six corner cells of the
     board with a continuous chain of your stones. The two
     corners do not need to be adjacent. Corner cells are
     the six pointy tips of the hexagonal board.

  3. FORK
     Connect at least three of the six edges (sides) of the
     board with a continuous chain of your stones. IMPORTANT:
     corner cells do NOT count as belonging to any edge.
     Your chain must touch actual edge cells (the cells
     between two corners along one side of the board).

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Enter your move as: row column
  The row is a number and the column is a letter.

  Examples:
    1 a    -- row 1, column a (top-left corner)
    5 e    -- row 5, column e (center of a base-5 board)
    3 d    -- row 3, column d

  Each row shows its valid column letters on the right side
  of the display. The number of columns varies by row since
  the board is hexagonal.

--------------------------------------------------------------
BOARD GEOMETRY
--------------------------------------------------------------
  Each cell has up to 6 neighbors (hexagonal adjacency).
  The corners are the 6 cells at the tips of the hexagon.
  The edges are the cells along the 6 sides between corners
  (not including the corners themselves).

  For a base-5 board:
  - 6 corner cells
  - 6 edges with 3 cells each = 18 edge cells
  - 37 interior cells
  - Total: 61 cells

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - The center of the board is generally a strong opening
    because it radiates influence in all directions.
  - Forks are the most common winning threat. Try to build
    chains that threaten to reach multiple edges at once.
  - Bridges are relatively easy to spot and block, since
    corners are specific cells.
  - Rings are rare but powerful. An unexpected ring threat
    can win the game because they are hard to see coming.
  - Try to create dual threats -- moves that simultaneously
    threaten two different winning conditions (e.g., a fork
    and a bridge at the same time).
  - Defense is as important as offense. Always check if your
    opponent is one move from winning before making your move.
  - Connected groups of stones are stronger than scattered
    ones. Build outward from your existing groups.

--------------------------------------------------------------
DRAWS
--------------------------------------------------------------
  The game ends in a draw only if every cell is filled and
  neither player has completed a ring, bridge, or fork.
  This is extremely rare in practice.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
