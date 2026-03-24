"""Okiya - Japanese-themed tactical placement game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class OkiyaGame(BaseGame):
    """Okiya - Claim garden cards by matching seasons and elements."""

    name = "Okiya"
    description = "Japanese tactical placement - match seasons and elements to claim cards"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (4x4 grid, 4 seasons, 4 elements)",
        "extended": "Extended (5x5 grid, 5 seasons, 5 elements)",
    }

    SEASONS_4 = ["Spring", "Summer", "Autumn", "Winter"]
    ELEMENTS_4 = ["Bird", "Rain", "Sun", "Maple"]
    SEASONS_5 = ["Spring", "Summer", "Autumn", "Winter", "Monsoon"]
    ELEMENTS_5 = ["Bird", "Rain", "Sun", "Maple", "Stone"]

    SEASON_SYM = {"Spring": "Sp", "Summer": "Su", "Autumn": "Au",
                  "Winter": "Wi", "Monsoon": "Mo"}
    ELEMENT_SYM = {"Bird": "Bi", "Rain": "Ra", "Sun": "Su",
                   "Maple": "Ma", "Stone": "St"}

    def __init__(self, variation=None):
        super().__init__(variation)
        self.grid_size = 4
        self.seasons = []
        self.elements = []
        # grid[r][c] = {"season": ..., "element": ..., "owner": 0/1/2}
        self.grid = []
        self.last_move = None  # {"season": ..., "element": ...} of last claimed card
        self.log = []

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        if self.variation == "extended":
            self.grid_size = 5
            self.seasons = list(self.SEASONS_5)
            self.elements = list(self.ELEMENTS_5)
        else:
            self.grid_size = 4
            self.seasons = list(self.SEASONS_4)
            self.elements = list(self.ELEMENTS_4)

        n = self.grid_size
        # Create all season-element combinations
        cards = []
        for s in self.seasons:
            for e in self.elements:
                cards.append({"season": s, "element": e})

        # We need exactly n*n cards
        needed = n * n
        if len(cards) < needed:
            # Duplicate some cards to fill the grid
            while len(cards) < needed:
                cards.append(random.choice(cards[:len(self.seasons) * len(self.elements)]).copy())
        elif len(cards) > needed:
            random.shuffle(cards)
            cards = cards[:needed]

        random.shuffle(cards)

        self.grid = []
        idx = 0
        for r in range(n):
            row = []
            for c in range(n):
                card = cards[idx]
                card["owner"] = 0
                row.append(card)
                idx += 1
            self.grid.append(row)

        self.last_move = None
        self.log = []
        self.game_over = False
        self.winner = None
        self.current_player = 1

    def _get_valid_moves(self):
        """Get list of valid (r, c) positions the current player can claim."""
        valid = []
        n = self.grid_size
        for r in range(n):
            for c in range(n):
                if self.grid[r][c]["owner"] == 0:
                    if self.last_move is None:
                        valid.append((r, c))
                    else:
                        card = self.grid[r][c]
                        if (card["season"] == self.last_move["season"] or
                                card["element"] == self.last_move["element"]):
                            valid.append((r, c))
        return valid

    def _check_win(self, player):
        """Check if player has 4 (or 5 for extended) in a row/col/diagonal."""
        n = self.grid_size
        target = 4  # always need 4 in a row

        # Check rows
        for r in range(n):
            for start_c in range(n - target + 1):
                if all(self.grid[r][start_c + i]["owner"] == player for i in range(target)):
                    return True

        # Check columns
        for c in range(n):
            for start_r in range(n - target + 1):
                if all(self.grid[start_r + i][c]["owner"] == player for i in range(target)):
                    return True

        # Check diagonals (top-left to bottom-right)
        for r in range(n - target + 1):
            for c in range(n - target + 1):
                if all(self.grid[r + i][c + i]["owner"] == player for i in range(target)):
                    return True

        # Check diagonals (top-right to bottom-left)
        for r in range(n - target + 1):
            for c in range(target - 1, n):
                if all(self.grid[r + i][c - i]["owner"] == player for i in range(target)):
                    return True

        # Check 2x2 square
        for r in range(n - 1):
            for c in range(n - 1):
                if (self.grid[r][c]["owner"] == player and
                        self.grid[r][c + 1]["owner"] == player and
                        self.grid[r + 1][c]["owner"] == player and
                        self.grid[r + 1][c + 1]["owner"] == player):
                    return True

        return False

    def display(self):
        clear_screen()
        n = self.grid_size
        print("=" * 60)
        print(f"  OKIYA - Japanese Garden Tactics")
        print(f"  {self.players[0]} = [1] | {self.players[1]} = [2]")
        print("=" * 60)

        if self.last_move:
            print(f"\n  Last claimed card: {self.last_move['season']}/{self.last_move['element']}")
            print(f"  You must match: {self.last_move['season']} (season) "
                  f"OR {self.last_move['element']} (element)")
        else:
            print(f"\n  First move: any card may be claimed!")

        # Display grid
        print()
        # Column headers
        header = "       "
        for c in range(n):
            header += f"  {c}      "
        print(header)

        print("     " + "+--------" * n + "+")
        for r in range(n):
            row_str = f"  {r}  |"
            for c in range(n):
                card = self.grid[r][c]
                if card["owner"] != 0:
                    owner_mark = str(card["owner"])
                    row_str += f"  [{owner_mark}]   |"
                else:
                    ss = self.SEASON_SYM[card["season"]]
                    es = self.ELEMENT_SYM[card["element"]]
                    row_str += f" {ss}/{es} |"
            print(row_str)
            print("     " + "+--------" * n + "+")

        # Legend
        print(f"\n  Seasons: " + ", ".join(
            f"{self.SEASON_SYM[s]}={s}" for s in self.seasons))
        print(f"  Elements: " + ", ".join(
            f"{self.ELEMENT_SYM[e]}={e}" for e in self.elements))

        # Show valid moves
        valid = self._get_valid_moves()
        if valid:
            valid_str = ", ".join(f"({r},{c})" for r, c in valid)
            print(f"\n  Valid moves: {valid_str}")
        else:
            print(f"\n  No valid moves available!")

        # Claimed counts
        p1_count = sum(1 for r in range(n) for c in range(n)
                       if self.grid[r][c]["owner"] == 1)
        p2_count = sum(1 for r in range(n) for c in range(n)
                       if self.grid[r][c]["owner"] == 2)
        print(f"\n  Claimed: {self.players[0]}={p1_count}, {self.players[1]}={p2_count}")

        if self.log:
            print("\n  Recent:")
            for msg in self.log[-4:]:
                print(f"    {msg}")
        print()

    def get_move(self):
        p = self.current_player
        valid = self._get_valid_moves()

        if not valid:
            # Current player can't move - opponent wins!
            print(f"  {self.players[p-1]} has no valid moves!")
            input_with_quit("  Press Enter to continue...")
            return "no_move"

        print(f"  {self.players[p-1]}'s turn (you are [{p}]):")

        while True:
            pos = input_with_quit("  Claim card at (row,col): ").strip()
            try:
                parts = pos.replace(" ", "").split(",")
                r, c = int(parts[0]), int(parts[1])
                if (r, c) in valid:
                    return {"row": r, "col": c}
                else:
                    if 0 <= r < self.grid_size and 0 <= c < self.grid_size:
                        card = self.grid[r][c]
                        if card["owner"] != 0:
                            print("  That card is already claimed.")
                        elif self.last_move:
                            print(f"  Must match {self.last_move['season']} (season) "
                                  f"or {self.last_move['element']} (element).")
                    else:
                        print(f"  Out of bounds. Grid is {self.grid_size}x{self.grid_size}.")
            except (ValueError, IndexError):
                print("  Enter as row,col (e.g., 1,2)")

    def make_move(self, move):
        p = self.current_player

        if move == "no_move":
            # Opponent wins by blocking
            self.game_over = True
            opponent = 2 if p == 1 else 1
            self.winner = opponent
            self._add_log(f"{self.players[p-1]} blocked! {self.players[opponent-1]} wins!")
            return True

        r, c = move["row"], move["col"]
        card = self.grid[r][c]

        if card["owner"] != 0:
            return False

        if self.last_move is not None:
            if (card["season"] != self.last_move["season"] and
                    card["element"] != self.last_move["element"]):
                return False

        card["owner"] = p
        self.last_move = {"season": card["season"], "element": card["element"]}
        self._add_log(f"{self.players[p-1]} claimed ({r},{c}): "
                      f"{card['season']}/{card['element']}")

        return True

    def check_game_over(self):
        if self.game_over:
            return

        # Check if current player (after switch) has no moves -> they lose
        # But check_game_over is called before switch_player in the base loop...
        # Actually it's called after make_move and before switch_player.
        # Let's check the player who just moved for a win.
        prev_player = self.current_player  # hasn't switched yet
        if self._check_win(prev_player):
            self.game_over = True
            self.winner = prev_player
            self._add_log(f"{self.players[prev_player-1]} wins with 4 in a pattern!")
            return

        # Check if all cards claimed
        n = self.grid_size
        unclaimed = sum(1 for r in range(n) for c in range(n)
                        if self.grid[r][c]["owner"] == 0)
        if unclaimed == 0:
            self.game_over = True
            # Score by count
            p1 = sum(1 for r in range(n) for c in range(n) if self.grid[r][c]["owner"] == 1)
            p2 = sum(1 for r in range(n) for c in range(n) if self.grid[r][c]["owner"] == 2)
            if p1 > p2:
                self.winner = 1
            elif p2 > p1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        # Convert grid to serializable format
        grid_data = []
        for row in self.grid:
            row_data = []
            for card in row:
                row_data.append({
                    "season": card["season"],
                    "element": card["element"],
                    "owner": card["owner"],
                })
            grid_data.append(row_data)

        return {
            "grid": grid_data,
            "grid_size": self.grid_size,
            "last_move": self.last_move,
            "seasons": self.seasons,
            "elements": self.elements,
            "log": self.log,
        }

    def load_state(self, state):
        self.grid = state["grid"]
        self.grid_size = state["grid_size"]
        self.last_move = state["last_move"]
        self.seasons = state["seasons"]
        self.elements = state["elements"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
==================================================
  OKIYA - Tutorial
==================================================

OVERVIEW:
  Okiya is a Japanese-themed tactical placement game. Players compete
  to claim garden cards on a grid by matching seasons and elements.

GRID:
  The grid shows garden cards, each with a Season and an Element.
  Seasons: Spring (Sp), Summer (Su), Autumn (Au), Winter (Wi)
  Elements: Bird (Bi), Rain (Ra), Sun (Su), Maple (Ma)
  (Extended adds Monsoon and Stone)

GAMEPLAY:
  1. The first player may claim ANY unclaimed card.
  2. After that, each player must claim a card that matches either:
     - The SEASON of the last claimed card, OR
     - The ELEMENT of the last claimed card
  3. Claimed cards show the player's number [1] or [2].

WINNING:
  You win by:
  - Getting 4 cards in a row (horizontal, vertical, or diagonal)
  - Getting 4 cards in a 2x2 square
  - Blocking your opponent so they have NO valid moves

STRATEGY:
  - Think about what options your move leaves for your opponent!
  - Claiming a card with a rare season/element combo can limit
    opponent options.
  - Try to build toward multiple winning patterns at once.
  - Sometimes the best move is one that restricts your opponent.
"""
