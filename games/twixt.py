"""TwixT - A connection strategy game with knight-move links."""

from collections import deque
from engine.base import BaseGame, input_with_quit, clear_screen


# The 8 knight-move offsets used for linking pegs
KNIGHT_MOVES = [
    (-2, -1), (-2, 1),
    (-1, -2), (-1, 2),
    (1, -2), (1, 2),
    (2, -1), (2, 1),
]


def _segments_intersect(p1, p2, p3, p4):
    """Check if line segment p1-p2 crosses segment p3-p4 (proper intersection only).

    Each point is (row, col). Uses the standard cross-product orientation test.
    Returns True only for proper crossings (not shared endpoints).
    """
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    d1 = cross(p3, p4, p1)
    d2 = cross(p3, p4, p2)
    d3 = cross(p1, p2, p3)
    d4 = cross(p1, p2, p4)

    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True

    # Collinear / touching at endpoints is not considered a crossing
    return False


class TwixTGame(BaseGame):
    """TwixT: Connect your two borders with knight-move linked pegs."""

    name = "TwixT"
    description = "Connect opposite borders using pegs and knight-move links"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "24x24 board",
        "small": "12x12 board",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.size = 0
        self.board = []          # 2D grid: 0=empty, 1=player1 peg, 2=player2 peg
        self.links = set()       # set of ((r1,c1),(r2,c2)) with canonical ordering
        self.swap_available = False
        self.first_move = None

    def setup(self):
        """Initialize the game board and state."""
        if self.variation == "small":
            self.size = 12
        else:
            self.size = 24
        self.board = [[0] * self.size for _ in range(self.size)]
        self.links = set()
        self.swap_available = False
        self.first_move = None

    # ------------------------------------------------------------------
    # Coordinate helpers
    # ------------------------------------------------------------------
    def _is_corner(self, r, c):
        """The four corner intersections belong to no one."""
        s = self.size - 1
        return (r, c) in ((0, 0), (0, s), (s, 0), (s, s))

    def _is_border_row_top(self, r):
        return r == 0

    def _is_border_row_bottom(self, r):
        return r == self.size - 1

    def _is_border_col_left(self, c):
        return c == 0

    def _is_border_col_right(self, c):
        return c == self.size - 1

    def _can_place(self, r, c, player):
        """Check whether *player* may place a peg at (r, c)."""
        if r < 0 or r >= self.size or c < 0 or c >= self.size:
            return False
        if self.board[r][c] != 0:
            return False
        if self._is_corner(r, c):
            return False
        # Player 1 (top-bottom) cannot place on left/right border columns
        if player == 1 and (self._is_border_col_left(c) or self._is_border_col_right(c)):
            return False
        # Player 2 (left-right) cannot place on top/bottom border rows
        if player == 2 and (self._is_border_row_top(r) or self._is_border_row_bottom(r)):
            return False
        return True

    # ------------------------------------------------------------------
    # Link helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _canon_link(a, b):
        """Canonical form for a link so we can store in a set."""
        return (min(a, b), max(a, b))

    def _link_crosses_existing(self, a, b):
        """Return True if segment a-b would cross any existing link."""
        for (p, q) in self.links:
            if _segments_intersect(a, b, p, q):
                return True
        return False

    def _add_links_for_peg(self, r, c, player):
        """After placing a peg at (r,c), add all valid knight-move links
        to friendly pegs, skipping any that would cross an existing link."""
        for dr, dc in KNIGHT_MOVES:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.size and 0 <= nc < self.size:
                if self.board[nr][nc] == player:
                    link = self._canon_link((r, c), (nr, nc))
                    if link not in self.links:
                        if not self._link_crosses_existing((r, c), (nr, nc)):
                            self.links.add(link)

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------
    def display(self):
        """Display the board with pegs and a legend."""
        size = self.size
        symbols = {0: ".", 1: "X", 2: "O"}

        print(f"\n  === TwixT ({self.variation}, {size}x{size}) ===")
        print(f"  {self.players[0]} (X): connects Top <-> Bottom borders")
        print(f"  {self.players[1]} (O): connects Left <-> Right borders")
        print(f"  Current turn: {self.players[self.current_player - 1]} "
              f"({symbols[self.current_player]})")
        if self.swap_available:
            print("  ** Player 2 may type 'swap' to take Player 1's first move **")
        print(f"  Links on board: {len(self.links)}")
        print()

        # For boards up to 26 columns we use a-z
        def col_label(c):
            return chr(ord('a') + c)

        # Build a set of horizontal / vertical / diagonal link indicators
        # between adjacent board cells for a richer display.
        # For manageable output we show pegs only; links are listed below
        # on small boards or omitted on large ones.

        # Column header
        hdr = "     "
        for c in range(size):
            hdr += f" {col_label(c)}"
        print(hdr)

        # Top border indicator (Player 1's border)
        border_line = "     " + " -" * size
        print(border_line)

        for r in range(size):
            row_label = f" {r + 1:>3} "
            left_border = "|" if True else " "
            right_border = "|"
            row_str = row_label + left_border
            for c in range(size):
                sym = symbols[self.board[r][c]]
                if self._is_corner(r, c):
                    sym = "+"
                row_str += f" {sym}"
            row_str += f" {right_border}"
            print(row_str)

        # Bottom border indicator
        bottom_line = "     " + " -" * size
        print(bottom_line)
        print()

        # Show links for small board (12x12), skip for 24x24 to avoid clutter
        if size <= 12 and self.links:
            print("  Links:")
            for (p, q) in sorted(self.links):
                pr, pc = p
                qr, qc = q
                owner = symbols[self.board[pr][pc]]
                print(f"    {owner}: {col_label(pc)}{pr+1} -- {col_label(qc)}{qr+1}")
            print()

    # ------------------------------------------------------------------
    # Input
    # ------------------------------------------------------------------
    def get_move(self):
        """Get move as column-letter + row-number (e.g. 'd5') or 'swap'."""
        player_name = self.players[self.current_player - 1]
        size = self.size
        max_col = chr(ord('a') + size - 1)

        while True:
            prompt = f"  {player_name}, enter move (a-{max_col})(1-{size})"
            if self.swap_available:
                prompt += " or 'swap'"
            prompt += ": "
            raw = input_with_quit(prompt).strip()

            if raw.lower() == "swap":
                if self.swap_available:
                    return "swap"
                else:
                    print("  Swap is not available.")
                    continue

            if len(raw) < 2:
                print(f"  Invalid input. Enter like 'd5' (column a-{max_col}, row 1-{size}).")
                continue

            try:
                col_char = raw[0].lower()
                row_num = int(raw[1:])

                if not ('a' <= col_char <= max_col):
                    print(f"  Column must be a-{max_col}.")
                    continue
                if row_num < 1 or row_num > size:
                    print(f"  Row must be 1-{size}.")
                    continue

                col = ord(col_char) - ord('a')
                row = row_num - 1
                return (row, col)
            except (ValueError, IndexError):
                print(f"  Invalid input. Enter like 'd5' (column a-{max_col}, row 1-{size}).")

    # ------------------------------------------------------------------
    # Move execution
    # ------------------------------------------------------------------
    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move == "swap":
            if not self.swap_available:
                return False
            r, c = self.first_move
            # Player 2 takes over Player 1's peg
            self.board[r][c] = 2
            # Remove any links that were created for player 1's first peg
            self.links.clear()
            # Re-add links for the now-player-2 peg (unlikely on first move,
            # but keeps logic consistent)
            self._add_links_for_peg(r, c, 2)
            self.swap_available = False
            return True

        row, col = move

        if not self._can_place(row, col, self.current_player):
            if self._is_corner(row, col):
                print("  Corner intersections cannot be used!")
            elif self.board[row][col] != 0:
                print("  That intersection is already occupied!")
            else:
                print("  You cannot place on your opponent's border!")
            return False

        self.board[row][col] = self.current_player
        self._add_links_for_peg(row, col, self.current_player)

        # Swap rule: after Player 1's very first move
        if self.turn_number == 0 and self.current_player == 1:
            self.first_move = (row, col)
            self.swap_available = True
        else:
            self.swap_available = False

        return True

    # ------------------------------------------------------------------
    # Win detection
    # ------------------------------------------------------------------
    def check_game_over(self):
        """Check if either player has connected their borders via links."""
        if self._check_connection(1):
            self.game_over = True
            self.winner = 1
            return
        if self._check_connection(2):
            self.game_over = True
            self.winner = 2
            return

    def _check_connection(self, player):
        """BFS through the link graph (not just adjacency) to see if
        player has connected their two borders.

        Player 1: top row (row 0) to bottom row (row size-1).
        Player 2: left col (col 0) to right col (col size-1).
        """
        size = self.size

        # Build adjacency from links for this player
        adj = {}
        for (a, b) in self.links:
            if self.board[a[0]][a[1]] != player:
                continue
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)

        # Also include isolated pegs (no links) so we at least enumerate them
        # but they can only win if a single peg sits on both borders (impossible
        # on standard TwixT, kept for completeness).

        # Starting pegs: on the player's start border
        if player == 1:
            starts = [(r, c) for r in [0] for c in range(size)
                      if self.board[r][c] == player]
            is_goal = lambda r, c: r == size - 1
        else:
            starts = [(r, c) for c in [0] for r in range(size)
                      if self.board[r][c] == player]
            is_goal = lambda r, c: c == size - 1

        visited = set()
        queue = deque()
        for s in starts:
            if s not in visited:
                visited.add(s)
                queue.append(s)

        while queue:
            node = queue.popleft()
            if is_goal(node[0], node[1]):
                return True
            for nb in adj.get(node, []):
                if nb not in visited:
                    visited.add(nb)
                    queue.append(nb)

        return False

    # ------------------------------------------------------------------
    # Serialisation
    # ------------------------------------------------------------------
    def get_state(self):
        """Return serializable game state."""
        return {
            "size": self.size,
            "board": [row[:] for row in self.board],
            "links": [list(link) for link in self.links],  # list of [[r1,c1],[r2,c2]]
            "swap_available": self.swap_available,
            "first_move": list(self.first_move) if self.first_move else None,
        }

    def load_state(self, state):
        """Restore game state."""
        self.size = state["size"]
        self.board = [row[:] for row in state["board"]]
        self.links = set()
        for link in state["links"]:
            a = tuple(link[0])
            b = tuple(link[1])
            self.links.add(self._canon_link(a, b))
        self.swap_available = state["swap_available"]
        self.first_move = tuple(state["first_move"]) if state["first_move"] else None

    # ------------------------------------------------------------------
    # Tutorial
    # ------------------------------------------------------------------
    def get_tutorial(self):
        """Return comprehensive tutorial text."""
        return """
==============================================================
                     TWIXT  TUTORIAL
==============================================================

OVERVIEW
  TwixT is a two-player connection strategy game played on a
  grid of peg holes. Players take turns placing pegs and try
  to connect their two opposite border rows/columns with an
  unbroken chain of pegs and links.

--------------------------------------------------------------
BOARD
--------------------------------------------------------------
  Standard: 24x24 grid   |   Small: 12x12 grid

  The board is displayed with column letters across the top
  (a-x for 24x24, a-l for 12x12) and row numbers down the
  side (1-24 or 1-12).

  The four corner intersections (marked +) are neutral and
  cannot be used by either player.

--------------------------------------------------------------
PLAYERS & BORDERS
--------------------------------------------------------------
  Player 1 (X):
    - Owns the TOP and BOTTOM border rows.
    - Goal: connect TOP to BOTTOM with a chain of linked pegs.
    - Cannot place pegs on the LEFT or RIGHT border columns.

  Player 2 (O):
    - Owns the LEFT and RIGHT border columns.
    - Goal: connect LEFT to RIGHT with a chain of linked pegs.
    - Cannot place pegs on the TOP or BOTTOM border rows.

--------------------------------------------------------------
PLACING PEGS
--------------------------------------------------------------
  On your turn, place one peg on any empty intersection that
  you are allowed to use (i.e., not a corner and not on your
  opponent's border).

--------------------------------------------------------------
KNIGHT-MOVE LINKS
--------------------------------------------------------------
  When you place a peg, it is automatically linked to every
  friendly peg that is a knight's move away (offsets of 2+1
  in any combination):

    (-2,-1) (-2,+1)  (-1,-2) (-1,+2)
    (+1,-2) (+1,+2)  (+2,-1) (+2,+1)

  This is exactly the same set of squares a chess knight can
  reach.

--------------------------------------------------------------
CROSSING RESTRICTION
--------------------------------------------------------------
  Links CANNOT cross other links -- not even your own. If a
  potential link between two of your pegs would cross any
  existing link on the board (yours or your opponent's), that
  link is simply not created. The peg is still placed; only
  the conflicting link is skipped.

  This is the key tactical constraint of TwixT: you must plan
  your link paths carefully to avoid blocking yourself.

--------------------------------------------------------------
SWAP RULE
--------------------------------------------------------------
  After Player 1 places the very first peg of the game,
  Player 2 has a one-time option:

    - Place a new peg normally, OR
    - Type 'swap' to take over Player 1's peg. The peg
      changes ownership and Player 1 then takes the next turn.

  The swap rule compensates for the first-move advantage.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  You win by forming a connected path of your pegs and links
  from one of your borders to the opposite border:

    Player 1 (X): top row  -->  bottom row
    Player 2 (O): left col -->  right col

  The game cannot end in a draw under normal play (though a
  stalemate is theoretically possible on very small boards).

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Type the column letter followed by the row number:
    d5   = column d, row 5
    a1   = top-left area
    l12  = bottom-right area (on 12x12)

  Type 'swap' on Player 2's first turn to invoke the swap
  rule (if available).

--------------------------------------------------------------
STRATEGY HINTS
--------------------------------------------------------------
  - Aim for the centre of the board early on; edge pegs are
    harder to link into useful chains.
  - Think two or three links ahead -- a single peg is weak,
    but a chain of links is very hard to block.
  - Watch for crossing threats: sometimes you can block your
    opponent by placing a peg that creates a link crossing
    through their planned path.
  - The swap rule means an overly strong first move will be
    taken by your opponent -- choose a solid but not dominant
    opening.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'     / 'q'  -- Quit the game
  'save'     / 's'  -- Save and suspend the game
  'help'     / 'h'  -- Show quick help
  'tutorial' / 't'  -- Show this tutorial
==============================================================
"""
