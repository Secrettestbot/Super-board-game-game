"""Nim - A mathematical strategy game of removing objects from heaps."""

from engine.base import BaseGame, input_with_quit, clear_screen


class NimGame(BaseGame):
    """Nim: Take turns removing objects from heaps."""

    name = "Nim"
    description = "A mathematical strategy game - take objects from heaps"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Normal play - last to take wins (heaps: 1,3,5,7)",
        "misere": "Misere play - last to take loses (heaps: 1,3,5,7)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.heaps = []

    def setup(self):
        """Initialize heaps."""
        self.heaps = [1, 3, 5, 7]

    def display(self):
        """Display heaps with visual stick representation."""
        mode = "Standard" if self.variation == "standard" else "Misere"
        print(f"\n  === Nim ({mode}) ===")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        for i, count in enumerate(self.heaps):
            sticks = " |" * count if count > 0 else " (empty)"
            print(f"  Heap {i + 1} [{count:2d}] :{sticks}")

        nim_sum = 0
        for h in self.heaps:
            nim_sum ^= h
        total = sum(self.heaps)
        print(f"\n  Total objects remaining: {total}")
        print()

    def get_move(self):
        """Get move as 'heap amount'."""
        print(f"  {self.players[self.current_player - 1]}, choose a heap and amount to take.")
        print("  Format: heap amount (e.g. '2 3' to take 3 from heap 2)")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Apply move. Returns True if valid."""
        try:
            parts = move.split()
            if len(parts) != 2:
                return False
            heap_idx = int(parts[0]) - 1
            amount = int(parts[1])
        except (ValueError, IndexError):
            return False

        if heap_idx < 0 or heap_idx >= len(self.heaps):
            return False
        if amount < 1 or amount > self.heaps[heap_idx]:
            return False

        self.heaps[heap_idx] -= amount
        return True

    def check_game_over(self):
        """Check if all heaps are empty."""
        if sum(self.heaps) == 0:
            self.game_over = True
            if self.variation == "standard":
                # Last to take wins - current player just took the last object
                self.winner = self.current_player
            else:
                # Misere - last to take loses
                self.winner = 2 if self.current_player == 1 else 1

    def get_state(self):
        """Return serializable game state."""
        return {
            "heaps": list(self.heaps),
        }

    def load_state(self, state):
        """Restore game state."""
        self.heaps = list(state["heaps"])

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Nim - Tutorial
==================================================

  RULES:
  - The game starts with several heaps of objects.
  - Default heaps: 1, 3, 5, 7 (16 objects total).
  - On your turn, you must take at least 1 object
    from exactly one heap.
  - You may take as many objects as you like from
    that single heap (even the whole heap).

  VARIATIONS:
  - Standard (Normal Play): The player who takes
    the LAST object WINS.
  - Misere: The player who takes the LAST object
    LOSES.

  HOW TO ENTER MOVES:
  - Type: heap_number amount
  - Example: "2 3" takes 3 objects from heap 2.
  - Example: "4 7" takes all 7 objects from heap 4.

  STRATEGY HINTS:
  - The key concept is the "Nim-sum" (XOR of all
    heap sizes).
  - Standard: You want to leave your opponent with
    a Nim-sum of 0. If the Nim-sum is currently
    non-zero, there is always a winning move.
  - Misere: Play like standard until all heaps have
    size 0 or 1, then leave an ODD number of heaps
    with 1 object.
  - If the Nim-sum is already 0 on your turn, your
    opponent has the advantage (assuming they play
    optimally).

==================================================
"""
