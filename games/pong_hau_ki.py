"""Pong Hau K'i - Simple Chinese blocking game."""

from engine.base import BaseGame, input_with_quit, clear_screen


class PongHauKiGame(BaseGame):
    """Pong Hau K'i (also known as Ou Moul Ko No).

    A simple Chinese game played on 5 points connected in a specific pattern.
    Each player has 2 pieces. Players take turns moving one piece to the
    adjacent empty point. The first player who cannot move loses.
    """

    name = "Pong Hau K'i"
    description = "Simple Chinese blocking game"
    min_players = 2
    max_players = 2
    variations = {"standard": "Standard"}

    # Board layout (point numbering):
    #
    #   1 --- 2
    #   |\ /|
    #   | 5  |
    #   |/ \|
    #   3 --- 4
    #
    # Adjacency map: which points connect to which
    ADJACENCY = {
        1: [2, 3, 5],
        2: [1, 4, 5],
        3: [1, 4, 5],
        4: [2, 3, 5],
        5: [1, 2, 3, 4],
    }

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        """Initialize the board. Player 1 gets points 1,2; Player 2 gets points 3,4.
        Point 5 (center) starts empty."""
        # board[point] = 0 (empty), 1 (player 1), 2 (player 2)
        self.board = {
            1: 1,
            2: 1,
            3: 2,
            4: 2,
            5: 0,
        }

    def display(self):
        """Display the board as text art."""
        symbols = {0: '.', 1: 'X', 2: 'O'}
        b = {k: symbols[v] for k, v in self.board.items()}

        print(f"\n  Pong Hau K'i   Turn {self.turn_number}")
        print(f"  {self.players[0]} (X) vs {self.players[1]} (O)")
        print(f"  Current: {self.players[self.current_player - 1]}")
        print()
        print(f"    {b[1]}-----{b[2]}")
        print(f"    |\\   /|")
        print(f"    | \\ / |")
        print(f"    |  {b[5]}  |")
        print(f"    | / \\ |")
        print(f"    |/   \\|")
        print(f"    {b[3]}-----{b[4]}")
        print()
        print(f"  Points: 1=top-left 2=top-right")
        print(f"          3=bot-left 4=bot-right 5=center")
        print()

    def get_move(self):
        """Get move as 'from to' point numbers."""
        move_str = input_with_quit(
            f"  {self.players[self.current_player - 1]}, enter move (from to): "
        )
        parts = move_str.strip().split()
        if len(parts) != 2:
            return None
        try:
            frm, to = int(parts[0]), int(parts[1])
            return (frm, to)
        except ValueError:
            return None

    def make_move(self, move):
        """Apply a move. Returns True if valid."""
        if move is None:
            return False
        frm, to = move
        if frm not in self.board or to not in self.board:
            return False
        if self.board[frm] != self.current_player:
            return False
        if self.board[to] != 0:
            return False
        if to not in self.ADJACENCY[frm]:
            return False

        self.board[frm] = 0
        self.board[to] = self.current_player
        return True

    def _has_moves(self, player):
        """Check if a player has any legal move."""
        empty = [p for p, v in self.board.items() if v == 0]
        if not empty:
            return False
        for p, v in self.board.items():
            if v == player:
                for adj in self.ADJACENCY[p]:
                    if self.board[adj] == 0:
                        return True
        return False

    def check_game_over(self):
        """Game is over when the current (next) player cannot move."""
        opponent = 2 if self.current_player == 1 else 1
        if not self._has_moves(opponent):
            self.game_over = True
            self.winner = self.current_player

    def get_state(self):
        """Return serializable game state."""
        return {"board": {str(k): v for k, v in self.board.items()}}

    def load_state(self, state):
        """Restore game state."""
        self.board = {int(k): v for k, v in state["board"].items()}

    def get_tutorial(self):
        return """
==================================================
  PONG HAU K'I - Tutorial
==================================================

  OVERVIEW
  --------
  Pong Hau K'i is a traditional Chinese blocking
  game for 2 players. It is one of the simplest
  abstract strategy games in existence.

  BOARD
  -----
  The board has 5 points connected as follows:

    1-----2
    |\\   /|
    | \\ / |
    |  5  |
    | / \\ |
    |/   \\|
    3-----4

  SETUP
  -----
  Player 1 (X) starts on points 1 and 2 (top).
  Player 2 (O) starts on points 3 and 4 (bottom).
  Point 5 (center) is empty.

  HOW TO PLAY
  -----------
  Players take turns moving ONE of their pieces
  to the single empty adjacent point.

  Enter moves as: from to
  Example: "1 5" moves your piece from point 1
  to point 5 (center).

  WINNING
  -------
  You win by blocking your opponent so they
  cannot make any move on their turn.

  STRATEGY TIP
  ------------
  Try to control the center point (5) and force
  your opponent into a corner where they have
  no legal moves.

  COMMANDS
  --------
  Type 'quit' to quit, 'save' to save,
  'help' for help, 'tutorial' for this text.
==================================================
"""
