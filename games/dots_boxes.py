"""Dots and Boxes - Complete boxes by drawing lines between dots."""

from engine.base import BaseGame, input_with_quit, clear_screen


class DotsBoxesGame(BaseGame):
    """Dots and Boxes: Draw lines to complete boxes and score points."""

    name = "Dots and Boxes"
    description = "Draw lines between dots to complete boxes and score"
    min_players = 2
    max_players = 2
    variations = {
        "3x3": "3x3 grid of dots (2x2 boxes)",
        "4x4": "4x4 grid of dots (3x3 boxes)",
        "5x5": "5x5 grid of dots (4x4 boxes)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "3x3")
        self.rows = 0
        self.cols = 0
        # Horizontal lines: h_lines[r][c] = True means line between dot (r,c) and (r,c+1)
        self.h_lines = []
        # Vertical lines: v_lines[r][c] = True means line between dot (r,c) and (r+1,c)
        self.v_lines = []
        # Box owners: boxes[r][c] = player number who completed it, or 0
        self.boxes = []
        self.scores = {1: 0, 2: 0}

    def setup(self):
        """Initialize the grid based on variation."""
        size = int(self.variation[0])
        self.rows = size
        self.cols = size

        num_box_rows = self.rows - 1
        num_box_cols = self.cols - 1

        # Horizontal lines: rows x (cols-1)
        self.h_lines = [[False] * num_box_cols for _ in range(self.rows)]
        # Vertical lines: (rows-1) x cols
        self.v_lines = [[False] * self.cols for _ in range(num_box_rows)]
        # Boxes: (rows-1) x (cols-1)
        self.boxes = [[0] * num_box_cols for _ in range(num_box_rows)]
        self.scores = {1: 0, 2: 0}

    def display(self):
        """Display the dot grid with lines and completed boxes."""
        print(f"\n  === Dots and Boxes ({self.variation}) ===")
        print(f"  {self.players[0]} (A): {self.scores[1]}  |  {self.players[1]} (B): {self.scores[2]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        num_box_rows = self.rows - 1
        num_box_cols = self.cols - 1

        # Column labels
        col_header = "     "
        for c in range(self.cols):
            col_header += f"{c + 1}   "
        print(col_header)

        for r in range(self.rows):
            # Row of dots and horizontal lines
            row_str = f"  {r + 1}  "
            for c in range(self.cols):
                row_str += "*"
                if c < num_box_cols:
                    if self.h_lines[r][c]:
                        row_str += "---"
                    else:
                        row_str += "   "
            print(row_str)

            # Row of vertical lines and box contents
            if r < num_box_rows:
                vert_str = "     "
                for c in range(self.cols):
                    if self.v_lines[r][c]:
                        vert_str += "|"
                    else:
                        vert_str += " "
                    if c < num_box_cols:
                        owner = self.boxes[r][c]
                        if owner == 1:
                            vert_str += " A "
                        elif owner == 2:
                            vert_str += " B "
                        else:
                            vert_str += "   "
                print(vert_str)

        print()

    def get_move(self):
        """Get move as 'r1,2' or 'c1,2'."""
        print(f"  {self.players[self.current_player - 1]}, draw a line.")
        print("  Format: r<row>,<col> for horizontal line, c<row>,<col> for vertical line")
        print("  Example: 'r1,2' = horizontal line at row 1, col 2")
        print("  Example: 'c1,2' = vertical line at row 1, col 2")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        move = move.strip().lower()
        if len(move) < 4:
            return False

        line_type = move[0]
        if line_type not in ('r', 'c'):
            return False

        try:
            coords = move[1:].split(',')
            if len(coords) != 2:
                return False
            r = int(coords[0]) - 1
            c = int(coords[1]) - 1
        except (ValueError, IndexError):
            return False

        num_box_rows = self.rows - 1
        num_box_cols = self.cols - 1

        if line_type == 'r':
            # Horizontal line at dot-row r, between columns c and c+1
            if r < 0 or r >= self.rows or c < 0 or c >= num_box_cols:
                return False
            if self.h_lines[r][c]:
                print("  That line is already drawn!")
                return False
            self.h_lines[r][c] = True
        else:
            # Vertical line at dot-column c, between rows r and r+1
            if r < 0 or r >= num_box_rows or c < 0 or c >= self.cols:
                return False
            if self.v_lines[r][c]:
                print("  That line is already drawn!")
                return False
            self.v_lines[r][c] = True

        # Check if any boxes were completed
        completed = self._check_completed_boxes()
        if completed > 0:
            self.scores[self.current_player] += completed
            # Player goes again - undo the switch that play() will do
            # We achieve this by switching now so play()'s switch restores us
            self.switch_player()

        return True

    def _check_completed_boxes(self):
        """Check for newly completed boxes. Returns count of new completions."""
        num_box_rows = self.rows - 1
        num_box_cols = self.cols - 1
        completed = 0

        for r in range(num_box_rows):
            for c in range(num_box_cols):
                if self.boxes[r][c] == 0:
                    # Check all 4 sides of box (r, c)
                    top = self.h_lines[r][c]
                    bottom = self.h_lines[r + 1][c]
                    left = self.v_lines[r][c]
                    right = self.v_lines[r][c + 1]
                    if top and bottom and left and right:
                        self.boxes[r][c] = self.current_player
                        completed += 1

        return completed

    def check_game_over(self):
        """Check if all boxes are filled."""
        num_box_rows = self.rows - 1
        num_box_cols = self.cols - 1
        total_boxes = num_box_rows * num_box_cols

        if self.scores[1] + self.scores[2] == total_boxes:
            self.game_over = True
            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None  # Draw

    def get_state(self):
        """Return serializable game state."""
        return {
            "rows": self.rows,
            "cols": self.cols,
            "h_lines": self.h_lines,
            "v_lines": self.v_lines,
            "boxes": self.boxes,
            "scores": {str(k): v for k, v in self.scores.items()},
        }

    def load_state(self, state):
        """Restore game state."""
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.h_lines = state["h_lines"]
        self.v_lines = state["v_lines"]
        self.boxes = state["boxes"]
        self.scores = {int(k): v for k, v in state["scores"].items()}

    def get_tutorial(self):
        """Return tutorial with rules."""
        return """
==================================================
  Dots and Boxes - Tutorial
==================================================

  RULES:
  - The board is a grid of dots.
  - On your turn, draw one line between two
    adjacent dots (horizontally or vertically).
  - If your line completes a box (all 4 sides
    drawn), you score a point and your initial
    appears in that box. You then take another turn.
  - You may complete multiple boxes in one move and
    get an extra turn for each.
  - The game ends when all boxes are completed.
  - The player with the most boxes wins.

  HOW TO ENTER MOVES:
  - Horizontal line: r<row>,<col>
    Draws a line from dot (row,col) to dot (row,col+1)
    Example: "r1,2" draws --  between dots at
    row 1 col 2 and row 1 col 3.

  - Vertical line: c<row>,<col>
    Draws a line from dot (row,col) to dot (row+1,col)
    Example: "c1,2" draws |  between dots at
    row 1 col 2 and row 2 col 2.

  STRATEGY:
  - Avoid completing the third side of a box, as
    your opponent will take the fourth side.
  - Try to force your opponent into giving you
    chains of boxes.
  - In the endgame, the player who controls the
    longest chains usually wins.

==================================================
"""
