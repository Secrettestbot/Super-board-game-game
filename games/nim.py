"""Nim - A mathematical strategy game of removing objects from heaps."""

import random
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
    side_labels = ("Player 1", "Player 2")

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
        if move is None:
            return False
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

    def get_ai_move(self):
        """Return an AI move as a string 'heap amount'."""
        # Find valid heaps (non-empty)
        valid_heaps = [(i, self.heaps[i]) for i in range(len(self.heaps)) if self.heaps[i] > 0]
        if not valid_heaps:
            return "1 1"  # shouldn't happen

        difficulty = getattr(self, 'ai_difficulty', 'medium')

        if difficulty == "easy":
            # Random valid move
            heap_idx, heap_size = random.choice(valid_heaps)
            amount = random.randint(1, heap_size)
            return f"{heap_idx + 1} {amount}"

        # Medium and hard use Nim-sum (XOR) strategy
        # Hard always plays optimally; medium sometimes makes random moves
        if difficulty == "medium" and random.random() < 0.3:
            heap_idx, heap_size = random.choice(valid_heaps)
            amount = random.randint(1, heap_size)
            return f"{heap_idx + 1} {amount}"

        nim_sum = 0
        for h in self.heaps:
            nim_sum ^= h

        if self.variation == "misere":
            # Misere endgame: when all heaps are 0 or 1, leave ODD number of heaps with 1
            all_small = all(h <= 1 for h in self.heaps)
            if all_small:
                ones = sum(1 for h in self.heaps if h == 1)
                if ones % 2 == 0:
                    # We want odd number of 1s, so remove one heap of 1
                    for i, h in enumerate(self.heaps):
                        if h == 1:
                            return f"{i + 1} 1"
                else:
                    # Already odd, any move loses - just play anything
                    heap_idx, heap_size = random.choice(valid_heaps)
                    return f"{heap_idx + 1} {heap_size}"
            else:
                # Not endgame yet - play toward nim_sum = 0 but beware of misere endgame
                if nim_sum != 0:
                    for i, h in enumerate(self.heaps):
                        target = h ^ nim_sum
                        if target < h:
                            # Check if this would leave all heaps <= 1
                            new_heaps = list(self.heaps)
                            new_heaps[i] = target
                            if all(nh <= 1 for nh in new_heaps):
                                ones = sum(1 for nh in new_heaps if nh == 1)
                                if ones % 2 == 1:
                                    return f"{i + 1} {h - target}"
                            else:
                                return f"{i + 1} {h - target}"
                # Nim sum is 0 or no good move found - play randomly
                heap_idx, heap_size = random.choice(valid_heaps)
                amount = random.randint(1, heap_size)
                return f"{heap_idx + 1} {amount}"
        else:
            # Standard Nim: leave opponent with nim_sum = 0
            if nim_sum != 0:
                for i, h in enumerate(self.heaps):
                    target = h ^ nim_sum
                    if target < h:
                        return f"{i + 1} {h - target}"
            # Nim sum is already 0 (losing position) - play randomly
            heap_idx, heap_size = random.choice(valid_heaps)
            amount = random.randint(1, heap_size)
            return f"{heap_idx + 1} {amount}"

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
