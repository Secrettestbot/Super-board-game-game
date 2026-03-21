"""Sudoku - Classic number placement puzzle."""

import random
import copy

from engine.base import BaseGame, input_with_quit, clear_screen


# Difficulty configs: number of clues to leave on the board
VARIATION_CONFIG = {
    "easy": {"clues": 42, "label": "Easy"},
    "medium": {"clues": 32, "label": "Medium"},
    "hard": {"clues": 26, "label": "Hard"},
}


class SudokuGame(BaseGame):
    """Sudoku - classic 9x9 number placement puzzle."""

    name = "Sudoku"
    description = "Classic number puzzle - fill the 9x9 grid with 1-9"
    min_players = 1
    max_players = 2
    variations = {
        "easy": "Easy (40+ clues)",
        "medium": "Medium (30-35 clues)",
        "hard": "Hard (25-28 clues)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        config = VARIATION_CONFIG.get(self.variation, VARIATION_CONFIG["easy"])
        self.clues_count = config["clues"]
        self.label = config["label"]
        # 9x9 grids: 0 means empty
        self.solution = [[0] * 9 for _ in range(9)]
        self.puzzle = [[0] * 9 for _ in range(9)]
        self.board = [[0] * 9 for _ in range(9)]
        self.fixed = [[False] * 9 for _ in range(9)]  # True = original clue
        self.penalties = [0, 0]  # penalty scores for 2-player mode
        self.num_players = 1

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Generate a new Sudoku puzzle."""
        clear_screen()
        print(f"\n{'='*50}")
        print(f"  SUDOKU ({self.label}) - Player Setup")
        print(f"{'='*50}")
        print("\n  How many players?")
        print("  1. Single player (solve the puzzle)")
        print("  2. Two players (take turns, penalties for errors)")
        while True:
            choice = input_with_quit("  Enter 1 or 2: ").strip()
            if choice in ("1", "2"):
                self.num_players = int(choice)
                break
            print("  Please enter 1 or 2.")

        if self.num_players == 1:
            self.players = [self._get_player_name(1)]
        else:
            self.players = [self._get_player_name(1), self._get_player_name(2)]

        print("\n  Generating puzzle...")
        self.solution = [[0] * 9 for _ in range(9)]
        self._generate_full_board(self.solution)
        self.puzzle = [row[:] for row in self.solution]
        self._remove_cells(self.puzzle, 81 - self.clues_count)
        self.board = [row[:] for row in self.puzzle]
        self.fixed = [[self.puzzle[r][c] != 0 for c in range(9)] for r in range(9)]
        self.penalties = [0, 0]
        self.current_player = 1

    def _get_player_name(self, num):
        name = input_with_quit(f"  Player {num} name (Enter for 'Player {num}'): ").strip()
        return name if name else f"Player {num}"

    # --------------------------------------------------------- puzzle generation
    def _generate_full_board(self, board):
        """Fill a 9x9 board with a valid complete Sudoku using backtracking."""
        nums = list(range(1, 10))
        return self._fill_board(board, nums)

    def _fill_board(self, board, nums):
        """Backtracking solver/generator."""
        cell = self._find_empty(board)
        if cell is None:
            return True
        r, c = cell
        order = nums[:]
        random.shuffle(order)
        for n in order:
            if self._is_valid_placement(board, r, c, n):
                board[r][c] = n
                if self._fill_board(board, nums):
                    return True
                board[r][c] = 0
        return False

    def _find_empty(self, board):
        """Find the first empty cell (value 0)."""
        for r in range(9):
            for c in range(9):
                if board[r][c] == 0:
                    return (r, c)
        return None

    def _is_valid_placement(self, board, row, col, num):
        """Check if placing num at (row, col) violates Sudoku rules."""
        # Check row
        if num in board[row]:
            return False
        # Check column
        for r in range(9):
            if board[r][col] == num:
                return False
        # Check 3x3 box
        br, bc = 3 * (row // 3), 3 * (col // 3)
        for r in range(br, br + 3):
            for c in range(bc, bc + 3):
                if board[r][c] == num:
                    return False
        return True

    def _remove_cells(self, board, count):
        """Remove 'count' cells from a completed board."""
        cells = [(r, c) for r in range(9) for c in range(9)]
        random.shuffle(cells)
        removed = 0
        for r, c in cells:
            if removed >= count:
                break
            board[r][c] = 0
            removed += 1

    # --------------------------------------------------------------- display
    def display(self):
        """Display the Sudoku board."""
        player_info = ""
        if self.num_players == 2:
            player_info = (
                f"  {self.players[0]}: {self.penalties[0]} penalties | "
                f"{self.players[1]}: {self.penalties[1]} penalties\n"
                f"  Current turn: {self.players[self.current_player - 1]}\n"
            )

        print(f"\n{'='*50}")
        print(f"  === Sudoku ({self.label}) ===")
        if self.num_players == 1:
            print(f"  Player: {self.players[0]}")
        print(f"{'='*50}")
        if player_info:
            print(player_info)

        # Column headers
        print("       1 2 3   4 5 6   7 8 9")
        print("     +-------+-------+-------+")

        for r in range(9):
            row_label = chr(ord('A') + r)
            parts = []
            for c in range(9):
                val = self.board[r][c]
                if val == 0:
                    parts.append(".")
                elif self.fixed[r][c]:
                    parts.append(str(val))
                else:
                    parts.append(str(val))
            line = f"  {row_label}  | {parts[0]} {parts[1]} {parts[2]} | {parts[3]} {parts[4]} {parts[5]} | {parts[6]} {parts[7]} {parts[8]} |"
            print(line)
            if r in (2, 5):
                print("     +-------+-------+-------+")
        print("     +-------+-------+-------+")

        # Count remaining empty cells
        empty = sum(1 for r in range(9) for c in range(9) if self.board[r][c] == 0)
        print(f"\n  Cells remaining: {empty}")

        if self.game_over:
            if self.num_players == 2:
                print(f"\n  Final penalties: {self.players[0]}={self.penalties[0]}, {self.players[1]}={self.penalties[1]}")
            print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Prompt player for an action: place, erase, or hint."""
        if self.num_players == 2:
            who = self.players[self.current_player - 1]
        else:
            who = self.players[0]

        print(f"\n  Actions: [P]lace number  [E]rase  [H]int")
        action = input_with_quit(f"  {who}, choose action (P/E/H): ").strip().upper()

        if action in ("P", "PLACE"):
            cell = input_with_quit("  Cell (e.g. A1, B5): ").strip().upper()
            num = input_with_quit("  Number (1-9): ").strip()
            return ("place", cell, num)
        elif action in ("E", "ERASE"):
            cell = input_with_quit("  Cell to erase (e.g. A1): ").strip().upper()
            return ("erase", cell)
        elif action in ("H", "HINT"):
            return ("hint",)
        else:
            print("  Invalid action. Use P, E, or H.")
            input("  Press Enter to try again...")
            return None

    # --------------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply a move. Returns True if valid action taken."""
        if move is None:
            return False

        action = move[0]

        if action == "place":
            _, cell_str, num_str = move
            parsed = self._parse_cell(cell_str)
            if parsed is None:
                print("  Invalid cell. Use format like A1, B5 (row A-I, col 1-9).")
                input("  Press Enter to continue...")
                return False
            r, c = parsed
            try:
                num = int(num_str)
                if num < 1 or num > 9:
                    raise ValueError
            except ValueError:
                print("  Number must be 1-9.")
                input("  Press Enter to continue...")
                return False
            if self.fixed[r][c]:
                print("  That cell is a fixed clue and cannot be changed.")
                input("  Press Enter to continue...")
                return False
            if self.board[r][c] != 0:
                print("  Cell is already filled. Erase it first.")
                input("  Press Enter to continue...")
                return False

            # Check correctness
            if num == self.solution[r][c]:
                self.board[r][c] = num
                print(f"  Placed {num} at {chr(ord('A') + r)}{c + 1}.")
            else:
                # Check if it violates visible constraints
                conflicts = self._find_conflicts(r, c, num)
                if conflicts:
                    print(f"  Conflict! {num} already in same row/column/box.")
                else:
                    print(f"  Incorrect number at {chr(ord('A') + r)}{c + 1}.")
                if self.num_players == 2:
                    self.penalties[self.current_player - 1] += 1
                    print(f"  +1 penalty for {self.players[self.current_player - 1]}!")
                # Don't place the wrong number
                input("  Press Enter to continue...")
            return True

        elif action == "erase":
            _, cell_str = move
            parsed = self._parse_cell(cell_str)
            if parsed is None:
                print("  Invalid cell. Use format like A1, B5.")
                input("  Press Enter to continue...")
                return False
            r, c = parsed
            if self.fixed[r][c]:
                print("  That cell is a fixed clue and cannot be erased.")
                input("  Press Enter to continue...")
                return False
            if self.board[r][c] == 0:
                print("  Cell is already empty.")
                input("  Press Enter to continue...")
                return False
            self.board[r][c] = 0
            print(f"  Erased {chr(ord('A') + r)}{c + 1}.")
            return True

        elif action == "hint":
            # Find a random empty cell and reveal it
            empty_cells = [
                (r, c) for r in range(9) for c in range(9)
                if self.board[r][c] == 0
            ]
            if not empty_cells:
                print("  No empty cells left!")
                input("  Press Enter to continue...")
                return False
            r, c = random.choice(empty_cells)
            self.board[r][c] = self.solution[r][c]
            print(f"  Hint: {self.solution[r][c]} placed at {chr(ord('A') + r)}{c + 1}.")
            if self.num_players == 2:
                self.penalties[self.current_player - 1] += 1
                print(f"  +1 penalty for using a hint!")
            input("  Press Enter to continue...")
            return True

        return False

    def _parse_cell(self, cell_str):
        """Parse a cell string like 'A1' into (row, col). Returns None on failure."""
        cell_str = cell_str.strip().upper()
        if len(cell_str) < 2:
            return None
        row_ch = cell_str[0]
        col_str = cell_str[1:]
        if row_ch < 'A' or row_ch > 'I':
            return None
        try:
            col = int(col_str)
            if col < 1 or col > 9:
                return None
        except ValueError:
            return None
        return (ord(row_ch) - ord('A'), col - 1)

    def _find_conflicts(self, row, col, num):
        """Return list of conflicting cells for placing num at (row, col)."""
        conflicts = []
        # Row
        for c in range(9):
            if c != col and self.board[row][c] == num:
                conflicts.append((row, c))
        # Column
        for r in range(9):
            if r != row and self.board[r][col] == num:
                conflicts.append((r, col))
        # Box
        br, bc = 3 * (row // 3), 3 * (col // 3)
        for r in range(br, br + 3):
            for c in range(bc, bc + 3):
                if (r, c) != (row, col) and self.board[r][c] == num:
                    conflicts.append((r, c))
        return conflicts

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if the puzzle is completely and correctly filled."""
        for r in range(9):
            for c in range(9):
                if self.board[r][c] == 0:
                    return
        # Board is full - verify it matches solution
        if self.board == self.solution:
            self.game_over = True
            if self.num_players == 2:
                if self.penalties[0] < self.penalties[1]:
                    self.winner = 1
                elif self.penalties[1] < self.penalties[0]:
                    self.winner = 2
                else:
                    self.winner = None  # draw
            else:
                self.winner = 1

    # ----------------------------------------------------------- state save/load
    def get_state(self):
        """Return serializable game state for saving."""
        return {
            "solution": [row[:] for row in self.solution],
            "puzzle": [row[:] for row in self.puzzle],
            "board": [row[:] for row in self.board],
            "fixed": [row[:] for row in self.fixed],
            "penalties": list(self.penalties),
            "num_players": self.num_players,
            "clues_count": self.clues_count,
            "label": self.label,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.solution = [row[:] for row in state["solution"]]
        self.puzzle = [row[:] for row in state["puzzle"]]
        self.board = [row[:] for row in state["board"]]
        self.fixed = [row[:] for row in state["fixed"]]
        self.penalties = list(state.get("penalties", [0, 0]))
        self.num_players = state.get("num_players", 1)
        self.clues_count = state.get("clues_count", 42)
        self.label = state.get("label", "Easy")

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive tutorial for Sudoku."""
        return f"""
{'='*60}
  SUDOKU - Tutorial
{'='*60}

  OVERVIEW:
  Sudoku is a logic-based number placement puzzle. The
  objective is to fill a 9x9 grid so that each row, each
  column, and each of the nine 3x3 boxes contains the
  digits 1 through 9 exactly once.

  CURRENT DIFFICULTY: {self.label}
  - Clues provided: ~{self.clues_count}

  BOARD LAYOUT:
  The board is a 9x9 grid divided into nine 3x3 boxes.
  Rows are labeled A-I, columns 1-9.

       1 2 3   4 5 6   7 8 9
     +-------+-------+-------+
  A  | . . 3 | . . 5 | . 1 . |
  B  | . 4 . | . . . | . . . |
  ...
     +-------+-------+-------+

  Fixed clues are pre-filled and cannot be changed.
  Empty cells are shown as dots (.).

  HOW TO PLAY:
  Each turn, choose an action:

  [P] Place a number:
      Enter the cell (e.g., A1) and a number (1-9).
      The number is checked against the solution.
      If correct, it is placed. If incorrect, it is
      rejected (with a penalty in 2-player mode).

  [E] Erase a number:
      Remove a previously placed number (not a clue).

  [H] Hint:
      Reveals the correct number for a random empty cell.
      In 2-player mode, using a hint costs 1 penalty point.

  TWO-PLAYER MODE:
  Players take turns placing numbers. An incorrect
  placement or using a hint adds 1 penalty point.
  When the puzzle is complete, the player with fewer
  penalties wins.

  RULES:
  1. Each ROW must contain 1-9 exactly once.
  2. Each COLUMN must contain 1-9 exactly once.
  3. Each 3x3 BOX must contain 1-9 exactly once.

  STRATEGY TIPS:
  - Start with rows, columns, or boxes that have the
    most clues already filled in.
  - Use elimination: if a number can only go in one
    cell within a row/column/box, place it there.
  - Look for "naked singles" (cells where only one
    number is possible) and "hidden singles" (numbers
    that can only go in one place in a unit).

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'='*60}
"""
