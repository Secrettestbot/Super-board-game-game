"""Snakes and Ladders - Race to the finish while dodging snakes!"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Board definitions per variation
BOARD_CONFIGS = {
    "standard": {
        "size": 100,
        "rows": 10,
        "cols": 10,
        "snakes": {
            16: 6, 47: 26, 49: 11, 56: 53, 62: 19,
            64: 60, 87: 24, 93: 73, 95: 75, 98: 78,
        },
        "ladders": {
            1: 38, 4: 14, 9: 31, 21: 42, 28: 84,
            36: 44, 51: 67, 71: 91, 80: 100,
        },
    },
    "mini": {
        "size": 25,
        "rows": 5,
        "cols": 5,
        "snakes": {
            17: 7, 21: 11, 24: 16,
        },
        "ladders": {
            3: 12, 6: 14, 10: 19,
        },
    },
}


class SnakesLaddersGame(BaseGame):
    """Snakes and Ladders - dice-rolling race game."""

    name = "Snakes and Ladders"
    description = "Roll the dice, climb ladders, and avoid snakes"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (10x10, 100 squares)",
        "mini": "Mini (5x5, 25 squares)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        config = BOARD_CONFIGS.get(self.variation, BOARD_CONFIGS["standard"])
        self.board_size = config["size"]
        self.rows = config["rows"]
        self.cols = config["cols"]
        self.snakes = dict(config["snakes"])
        self.ladders = dict(config["ladders"])
        self.positions = {1: 0, 2: 0}  # 0 = not on board yet, 1..size = on board
        self.last_roll = None
        self.last_event = ""  # description of what happened last turn

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize player positions off the board."""
        self.positions = {1: 0, 2: 0}
        self.last_roll = None
        self.last_event = ""
        self.current_player = 1

    # --------------------------------------------------------------- display
    def display(self):
        p = self.current_player
        print(f"{'=' * 55}")
        print(f"  SNAKES AND LADDERS  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (P1)  vs  {self.players[1]} (P2)")
        print(f"{'=' * 55}")

        if self.last_event:
            print(f"\n  Last: {self.last_event}")

        print(f"\n  Positions: {self.players[0]} = {self._pos_str(1)}"
              f"  |  {self.players[1]} = {self._pos_str(2)}")
        print()

        self._draw_board()

        print(f"\n  Current turn: {self.players[p - 1]}")

    def _pos_str(self, player):
        pos = self.positions[player]
        if pos == 0:
            return "Start"
        return str(pos)

    def _draw_board(self):
        """Draw the board with snake/ladder markers and player positions."""
        rows = self.rows
        cols = self.cols
        size = self.board_size

        # Build a map of square number -> display string
        cell_map = {}
        for sq in range(1, size + 1):
            cell_map[sq] = f"{sq:3}"

        # Mark snakes and ladders
        for head, tail in self.snakes.items():
            cell_map[head] = f"{'v' + str(head):>3}"  # snake head (down)
        for bottom, top in self.ladders.items():
            cell_map[bottom] = f"{'L' + str(bottom):>3}"  # ladder bottom (up)

        # Draw rows (bottom-to-top, with boustrophedon numbering)
        for r in range(rows - 1, -1, -1):
            # Determine square numbers for this row
            if r % 2 == 0:
                # Left to right
                squares = [r * cols + c + 1 for c in range(cols)]
            else:
                # Right to left
                squares = [r * cols + (cols - 1 - c) + 1 for c in range(cols)]

            row_cells = []
            for sq in squares:
                display = cell_map.get(sq, f"{sq:3}")
                # Check if any player is on this square
                markers = []
                if self.positions[1] == sq:
                    markers.append("1")
                if self.positions[2] == sq:
                    markers.append("2")
                if markers:
                    display = f"{'P' + ''.join(markers):>3}"
                row_cells.append(display)

            print("  " + " | ".join(row_cells))
            if r > 0:
                print("  " + "-----" * cols)

        # Legend
        print(f"\n  Legend: Lnn = Ladder start, vnn = Snake head, Pn = Player n")

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Player presses Enter to roll the dice."""
        input_with_quit(f"  Press Enter to roll the dice... ")
        roll = random.randint(1, 6)
        self.last_roll = roll
        return roll

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return False

        roll = move
        p = self.current_player
        old_pos = self.positions[p]
        new_pos = old_pos + roll

        event_parts = [f"{self.players[p - 1]} rolled a {roll}"]

        # Must land exactly on or before the last square
        if new_pos > self.board_size:
            event_parts.append(f"but needed {self.board_size - old_pos} or less. Stay at {old_pos}.")
            self.last_event = " ".join(event_parts)
            return True

        event_parts.append(f"({old_pos} -> {new_pos})")

        # Check for snake
        if new_pos in self.snakes:
            dest = self.snakes[new_pos]
            event_parts.append(f"-- SNAKE! Slide down from {new_pos} to {dest}")
            new_pos = dest

        # Check for ladder
        elif new_pos in self.ladders:
            dest = self.ladders[new_pos]
            event_parts.append(f"-- LADDER! Climb from {new_pos} to {dest}")
            new_pos = dest

        self.positions[p] = new_pos
        self.last_event = " ".join(event_parts)
        return True

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if self.positions[p] == self.board_size:
                self.game_over = True
                self.winner = p
                return

    # ----------------------------------------------------------- state save/load
    def get_state(self):
        return {
            "positions": {str(k): v for k, v in self.positions.items()},
            "last_roll": self.last_roll,
            "last_event": self.last_event,
            "board_size": self.board_size,
            "rows": self.rows,
            "cols": self.cols,
            "snakes": {str(k): v for k, v in self.snakes.items()},
            "ladders": {str(k): v for k, v in self.ladders.items()},
        }

    def load_state(self, state):
        self.positions = {int(k): v for k, v in state["positions"].items()}
        self.last_roll = state.get("last_roll")
        self.last_event = state.get("last_event", "")
        self.board_size = state.get("board_size", self.board_size)
        self.rows = state.get("rows", self.rows)
        self.cols = state.get("cols", self.cols)
        if "snakes" in state:
            self.snakes = {int(k): v for k, v in state["snakes"].items()}
        if "ladders" in state:
            self.ladders = {int(k): v for k, v in state["ladders"].items()}

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        size = self.board_size
        snake_list = ", ".join(f"{h}->{t}" for h, t in sorted(self.snakes.items()))
        ladder_list = ", ".join(f"{b}->{t}" for b, t in sorted(self.ladders.items()))
        return f"""
{'=' * 60}
  SNAKES AND LADDERS - Tutorial
{'=' * 60}

  OBJECTIVE:
  Be the first player to reach square {size}.

  GAMEPLAY:
  1. Players take turns rolling a single die (1-6).
  2. Move forward by the number rolled.
  3. If you land on the head of a SNAKE, you slide DOWN
     to its tail.
  4. If you land on the bottom of a LADDER, you climb UP
     to its top.
  5. You must reach square {size} by exact count. If your
     roll would take you past {size}, you stay in place.

  SNAKES (head -> tail):
  {snake_list}

  LADDERS (bottom -> top):
  {ladder_list}

  BOARD DISPLAY:
  Lnn  = Ladder start at square nn
  vnn  = Snake head at square nn
  Pn   = Player n's position

  INPUT:
  Just press Enter to roll the dice. The roll is automatic.

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'=' * 60}
"""
