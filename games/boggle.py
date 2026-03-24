"""Boggle - Word-finding dice game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Standard 16 Boggle dice (4x4)
STANDARD_DICE = [
    "AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS",
    "AOOTTW", "CIMOTU", "DEILRX", "DELRVY",
    "DISTTY", "EEGHNW", "EEINSU", "EHRTVW",
    "EIOSST", "ELRTTY", "HIMNQU", "HLNNRZ",
]

# Big Boggle uses 25 dice (5x5)
BIG_DICE = [
    "AAAFRS", "AAEEEE", "AAFIRS", "ADENNN", "AEEEEM",
    "AEEGMU", "AEGMNN", "AFIRSY", "BJKQXZ", "CCENST",
    "CEIILT", "CEILPT", "CEIPST", "DDHNOT", "DHHLOR",
    "DHLNOR", "DHLNOR", "EIIITT", "EMOTTT", "ENSSSU",
    "FIPRSY", "GORRVW", "IPRRRY", "NOOTUW", "OOOTTU",
]

# Scoring table: word length -> points
SCORE_TABLE = {3: 1, 4: 1, 5: 2, 6: 3, 7: 5}
# 8+ letters = 11 points


def _word_score(word):
    """Return the point value for a word based on its length."""
    length = len(word)
    if length < 3:
        return 0
    if length >= 8:
        return 11
    return SCORE_TABLE.get(length, 0)


def _build_grid(size):
    """Shake the dice and place them on the grid."""
    dice = STANDARD_DICE if size == 4 else BIG_DICE
    shuffled = list(dice)
    random.shuffle(shuffled)
    letters = []
    for die in shuffled:
        face = random.choice(die)
        letters.append(face)
    grid = []
    for r in range(size):
        row = letters[r * size:(r + 1) * size]
        grid.append(row)
    return grid


def _get_neighbors(r, c, size):
    """Return list of (row, col) neighbors for a cell."""
    neighbors = []
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            nr, nc = r + dr, c + dc
            if 0 <= nr < size and 0 <= nc < size:
                neighbors.append((nr, nc))
    return neighbors


def _can_trace(word, grid, size):
    """Check if a word can be traced on the grid following adjacency rules.

    Each die may only be used once per word. 'Qu' on a die counts as two
    letters in the word.
    """
    # Build a representation that accounts for Qu
    # First, expand grid letters: Q -> QU (the die face is Q but represents QU)
    cell_strings = []
    for r in range(size):
        row = []
        for c in range(size):
            ch = grid[r][c]
            row.append("QU" if ch == "Q" else ch)
        cell_strings.append(row)

    # Find all starting positions
    def search(pos, word_idx, visited):
        r, c = pos
        cell = cell_strings[r][c]
        # Check if current cell matches current position in word
        segment = word[word_idx:word_idx + len(cell)]
        if segment != cell:
            return False
        next_idx = word_idx + len(cell)
        if next_idx == len(word):
            return True
        # Try neighbors
        for nr, nc in _get_neighbors(r, c, size):
            if (nr, nc) not in visited:
                visited.add((nr, nc))
                if search((nr, nc), next_idx, visited):
                    return True
                visited.remove((nr, nc))
        return False

    word = word.upper()
    for r in range(size):
        for c in range(size):
            visited = {(r, c)}
            if search((r, c), 0, visited):
                return True
    return False


class BoggleGame(BaseGame):
    """Boggle word-finding dice game."""

    name = "Boggle"
    description = "Find words in a grid of letter dice"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Boggle (4x4)",
        "big": "Big Boggle (5x5)",
    }

    def setup(self):
        """Initialize the game board and state."""
        self.size = 5 if self.variation == "big" else 4
        self.min_word_len = 4 if self.variation == "big" else 3
        self.grid = _build_grid(self.size)
        self.scores = [0, 0]
        self.round_number = 1
        self.round_words = {1: [], 2: []}  # words found this round per player
        self.phase = "collect"  # collect or score
        self.collecting_player = 1
        self.round_scored = False
        self.round_summary = ""
        self.target_score = 50

    def display(self):
        """Display the current game state."""
        label = "Big Boggle" if self.size == 5 else "Boggle"
        print(f"\n  === {label} - Round {self.round_number} ===")
        print(f"  {self.players[0]}: {self.scores[0]} pts  |  "
              f"{self.players[1]}: {self.scores[1]} pts")
        print(f"  First to {self.target_score} wins!\n")

        # Draw the grid
        cell_w = 4
        border = "+" + (("-" * cell_w + "+") * self.size)
        for r in range(self.size):
            print(f"  {border}")
            row_str = "  |"
            for c in range(self.size):
                letter = self.grid[r][c]
                display = "Qu" if letter == "Q" else letter
                row_str += f" {display:<{cell_w - 1}}|"
            print(row_str)
        print(f"  {border}")
        print()

        if self.round_summary:
            print(self.round_summary)

    def get_move(self):
        """Get words from the current player or advance phases."""
        if self.phase == "score":
            # Show scoring summary, then advance
            input_with_quit("Press Enter to continue to next round...")
            return "next_round"

        player_name = self.players[self.collecting_player - 1]
        min_len = self.min_word_len

        print(f"  {player_name}'s turn to find words!")
        print(f"  (Minimum {min_len} letters. Type 'done' when finished.)\n")

        words = list(self.round_words[self.collecting_player])

        if words:
            print(f"  Words found so far: {', '.join(words)}")
            print()

        while True:
            entry = input_with_quit(f"  Enter a word (or 'done'): ").strip().upper()

            if entry == "DONE":
                self.round_words[self.collecting_player] = words
                return "done"

            if len(entry) < min_len:
                print(f"    Word must be at least {min_len} letters.")
                continue

            if not entry.isalpha():
                print("    Letters only, please.")
                continue

            if entry in words:
                print("    You already entered that word.")
                continue

            if not _can_trace(entry, self.grid, self.size):
                print("    That word cannot be traced on the board!")
                continue

            words.append(entry)
            score = _word_score(entry)
            print(f"    Added '{entry}' ({score} pts)")

        return "done"

    def make_move(self, move):
        """Apply a move to the game state."""
        if move == "next_round":
            # Start a new round
            self.round_number += 1
            self.grid = _build_grid(self.size)
            self.round_words = {1: [], 2: []}
            self.phase = "collect"
            self.collecting_player = 1
            self.round_scored = False
            self.round_summary = ""
            return True

        if move == "done":
            if self.collecting_player == 1:
                # Player 1 done, now player 2 enters words
                self.collecting_player = 2
                return True
            else:
                # Both players done, score the round
                self._score_round()
                self.phase = "score"
                return True

        return False

    def _score_round(self):
        """Score the current round, canceling shared words."""
        words1 = set(self.round_words.get(1, []))
        words2 = set(self.round_words.get(2, []))

        shared = words1 & words2
        unique1 = words1 - shared
        unique2 = words2 - shared

        p1_points = sum(_word_score(w) for w in unique1)
        p2_points = sum(_word_score(w) for w in unique2)

        self.scores[0] += p1_points
        self.scores[1] += p2_points

        # Build summary
        lines = []
        lines.append(f"  --- Round {self.round_number} Results ---\n")

        if shared:
            lines.append(f"  Cancelled (both found): {', '.join(sorted(shared))}\n")

        lines.append(f"  {self.players[0]}'s unique words:")
        if unique1:
            for w in sorted(unique1):
                lines.append(f"    {w} ({_word_score(w)} pts)")
        else:
            lines.append("    (none)")
        lines.append(f"  Round points: {p1_points}\n")

        lines.append(f"  {self.players[1]}'s unique words:")
        if unique2:
            for w in sorted(unique2):
                lines.append(f"    {w} ({_word_score(w)} pts)")
        else:
            lines.append("    (none)")
        lines.append(f"  Round points: {p2_points}\n")

        lines.append(f"  Totals: {self.players[0]} {self.scores[0]} | "
                      f"{self.players[1]} {self.scores[1]}")

        self.round_summary = "\n".join(lines)
        self.round_scored = True

    def check_game_over(self):
        """Check if any player has reached the target score."""
        if self.scores[0] >= self.target_score or self.scores[1] >= self.target_score:
            if self.scores[0] >= self.target_score and self.scores[1] >= self.target_score:
                # Both crossed on same round — higher wins
                if self.scores[0] > self.scores[1]:
                    self.winner = 1
                elif self.scores[1] > self.scores[0]:
                    self.winner = 2
                else:
                    self.winner = None  # draw
            elif self.scores[0] >= self.target_score:
                self.winner = 1
            else:
                self.winner = 2
            self.game_over = True

    def get_state(self):
        """Return serializable game state for saving."""
        return {
            "size": self.size,
            "min_word_len": self.min_word_len,
            "grid": self.grid,
            "scores": self.scores,
            "round_number": self.round_number,
            "round_words": {str(k): v for k, v in self.round_words.items()},
            "phase": self.phase,
            "collecting_player": self.collecting_player,
            "round_scored": self.round_scored,
            "round_summary": self.round_summary,
            "target_score": self.target_score,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.size = state["size"]
        self.min_word_len = state["min_word_len"]
        self.grid = state["grid"]
        self.scores = state["scores"]
        self.round_number = state["round_number"]
        self.round_words = {int(k): v for k, v in state["round_words"].items()}
        self.phase = state["phase"]
        self.collecting_player = state["collecting_player"]
        self.round_scored = state["round_scored"]
        self.round_summary = state["round_summary"]
        self.target_score = state["target_score"]

    def get_tutorial(self):
        """Return tutorial text for Boggle."""
        size_label = "5x5" if self.variation == "big" else "4x4"
        min_len = 4 if self.variation == "big" else 3
        return f"""
{'='*50}
  BOGGLE TUTORIAL
{'='*50}

  OVERVIEW:
  Boggle is a word-finding game played on a {size_label} grid
  of letter dice. Players compete to find as many words
  as possible by connecting adjacent letters.

  HOW TO PLAY:
  1. A grid of random letters is generated each round.
  2. Each player takes a turn entering words they can
     find in the grid. Type one word at a time, then
     type 'done' when finished.
  3. Words are formed by connecting adjacent letters
     (horizontally, vertically, or diagonally). Each
     die can only be used once per word.
  4. Words must be at least {min_len} letters long.
  5. 'Qu' appears as a single die face but counts as
     two letters in your word.

  SCORING:
  After both players enter their words, shared words
  are cancelled (worth 0 to both). Unique words score:
    3-4 letters:  1 point
    5 letters:    2 points
    6 letters:    3 points
    7 letters:    5 points
    8+ letters:  11 points

  WINNING:
  The first player to reach 50 cumulative points wins!

  TIPS:
  - Look for common prefixes and suffixes (-ING, -ED, RE-)
  - Check all eight directions from each letter
  - Longer words are worth much more — hunt for them!
  - Remember, the opponent can find the same words,
    so unique finds are what matter.

  COMMANDS:
  Type a word to add it, or 'done' to finish your turn.
  Type 'quit' to exit, 'save' to suspend.
{'='*50}
"""
