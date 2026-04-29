"""Gomoku (Five in a Row) game with standard and renju variations."""

from engine.base import BaseGame, input_with_quit, clear_screen


class GomokuGame(BaseGame):
    """Gomoku with standard and renju (restricted) variations."""

    name = "Gomoku"
    description = "Five in a Row on a Go-style board -- standard or renju rules"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "15x15 board, exactly 5 in a row to win",
        "renju": "15x15 board, black has restrictions (no double-three, double-four, overline)",
    }

    SYMBOLS = {0: "\u00b7", 1: "\u25cf", 2: "\u25cb"}  # · ● ○

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.size = 15
        # board[row][col], 0=empty, 1=black(●), 2=white(○)
        self.board = [[0] * self.size for _ in range(self.size)]

    # --------------------------------------------------------------- display
    def display(self):
        s = self.SYMBOLS
        p = self.players[self.current_player - 1]
        sym = s[self.current_player]
        print(f"\n  {self.name} ({self.variation})  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (Black {s[1]})  vs  {self.players[1]} (White {s[2]})")
        print(f"  Current: {p} ({sym})\n")

        # Column letters A-O
        col_labels = [chr(ord('A') + c) for c in range(self.size)]
        print("     " + "  ".join(col_labels))

        for r in range(self.size):
            row_num = self.size - r  # display row 15 at top, 1 at bottom
            row_str = f"  {row_num:2d}  "
            for c in range(self.size):
                row_str += f"{s[self.board[r][c]]}  "
            row_str += f"{row_num}"
            print(row_str)

        print("     " + "  ".join(col_labels))
        print()

    # --------------------------------------------------------------- get_move
    def get_move(self):
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, enter move (e.g. H8): "
            )
            parsed = self._parse_move(raw)
            if parsed is None:
                print("  Invalid format. Use letter+number, e.g. H8, A15, O1.")
                continue
            row, col = parsed
            if self.board[row][col] != 0:
                print("  That position is already occupied.")
                continue
            # Renju restrictions apply only to black (player 1)
            if self.variation == "renju" and self.current_player == 1:
                violation = self._check_renju_violation(row, col)
                if violation:
                    print(f"  Forbidden move (renju rule): {violation}")
                    continue
            return (row, col)

    def _parse_move(self, move_str):
        """Parse 'H8' style input into (row, col). Returns None on failure."""
        raw = move_str.strip().upper()
        if len(raw) < 2 or len(raw) > 3:
            return None
        col_ch = raw[0]
        row_str = raw[1:]
        if not col_ch.isalpha() or not row_str.isdigit():
            return None
        col = ord(col_ch) - ord('A')
        row_num = int(row_str)
        if col < 0 or col >= self.size:
            return None
        if row_num < 1 or row_num > self.size:
            return None
        # Row 15 is board row 0 (top), row 1 is board row 14 (bottom)
        row = self.size - row_num
        return (row, col)

    def _pos_to_str(self, row, col):
        """Convert (row, col) to display string like 'H8'."""
        return f"{chr(ord('A') + col)}{self.size - row}"

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        if move is None:
            return False
        row, col = move
        if self.board[row][col] != 0:
            return False
        self.board[row][col] = self.current_player
        return True

    def get_ai_move(self):
        import random
        difficulty = getattr(self, 'ai_difficulty', 'medium')
        player = self.current_player
        opponent = 2 if player == 1 else 1

        has_stones = any(self.board[r][c] != 0
                         for r in range(self.size) for c in range(self.size))
        if not has_stones:
            return (self.size // 2, self.size // 2)

        candidates = []
        for r in range(self.size):
            for c in range(self.size):
                if self.board[r][c] != 0:
                    continue
                if not self._ai_has_near(r, c, 2):
                    continue
                if self.variation == "renju" and player == 1:
                    if self._check_renju_violation(r, c):
                        continue
                candidates.append((r, c))

        if not candidates:
            center = self.size // 2
            return (center, center)

        if difficulty == 'easy':
            near1 = [(r, c) for r, c in candidates if self._ai_has_near(r, c, 1)]
            return random.choice(near1 if near1 else candidates)

        scored = []
        for r, c in candidates:
            score = self._ai_eval_pos(r, c, player, opponent, difficulty)
            scored.append((score, (r, c)))

        scored.sort(key=lambda x: -x[0])
        if difficulty == 'medium':
            top = scored[:max(1, len(scored) // 4)]
            return random.choice(top)[1]
        return scored[0][1]

    def _ai_has_near(self, r, c, radius):
        for dr in range(-radius, radius + 1):
            for dc in range(-radius, radius + 1):
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] != 0:
                    return True
        return False

    def _ai_eval_pos(self, r, c, player, opponent, difficulty):
        score = 0
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]

        self.board[r][c] = player
        for dr, dc in directions:
            count = 1
            nr, nc = r + dr, c + dc
            while 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == player:
                count += 1
                nr += dr
                nc += dc
            fwd_open = 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == 0
            nr, nc = r - dr, c - dc
            while 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == player:
                count += 1
                nr -= dr
                nc -= dc
            bwd_open = 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == 0
            if count >= 5:
                score += 10000
            elif count == 4:
                score += 5000 if (fwd_open and bwd_open) else 500
            elif count == 3:
                score += 200 if (fwd_open and bwd_open) else 50
            elif count == 2 and fwd_open and bwd_open:
                score += 20
        self.board[r][c] = 0

        self.board[r][c] = opponent
        for dr, dc in directions:
            count = 1
            nr, nc = r + dr, c + dc
            while 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == opponent:
                count += 1
                nr += dr
                nc += dc
            fwd_open = 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == 0
            nr, nc = r - dr, c - dc
            while 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == opponent:
                count += 1
                nr -= dr
                nc -= dc
            bwd_open = 0 <= nr < self.size and 0 <= nc < self.size and self.board[nr][nc] == 0
            if count >= 5:
                score += 9000
            elif count == 4:
                score += 4000 if (fwd_open or bwd_open) else 200
            elif count == 3 and fwd_open and bwd_open:
                score += 400
        self.board[r][c] = 0

        if difficulty == 'hard':
            center = self.size // 2
            score -= abs(r - center) + abs(c - center)

        return score

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        winner = self._find_winner()
        if winner:
            self.game_over = True
            self.winner = winner
            return
        # Draw if board is full
        if all(self.board[r][c] != 0 for r in range(self.size) for c in range(self.size)):
            self.game_over = True
            self.winner = None

    def _find_winner(self):
        """Return winning player (1 or 2), or 0 if no winner yet.

        In standard gomoku, exactly 5 in a row wins (overlines of 6+ also win).
        In renju, overlines (6+) do NOT win for black (player 1), but do for white.
        However, black is already prevented from making overlines by the renju
        violation check, so here we simply look for exactly 5 or more.
        """
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
        for r in range(self.size):
            for c in range(self.size):
                p = self.board[r][c]
                if p == 0:
                    continue
                for dr, dc in directions:
                    count = self._count_consecutive(r, c, dr, dc, p)
                    if count >= 5:
                        # In standard mode, any 5+ wins
                        # In renju, overline for black shouldn't happen (enforced at move time)
                        # but white can win with 5+
                        if self.variation == "renju" and p == 1 and count > 5:
                            continue  # black overline doesn't count as win
                        return p
        return 0

    def _count_consecutive(self, row, col, dr, dc, player):
        """Count consecutive stones of player starting from (row, col) in direction (dr, dc).
        Only count if (row-dr, col-dc) is not the same player (to avoid double-counting)."""
        # Make sure we're at the start of a run
        pr, pc = row - dr, col - dc
        if 0 <= pr < self.size and 0 <= pc < self.size and self.board[pr][pc] == player:
            return 0  # not the start of the run
        count = 0
        r, c = row, col
        while 0 <= r < self.size and 0 <= c < self.size and self.board[r][c] == player:
            count += 1
            r += dr
            c += dc
        return count

    # --------------------------------------------------------- renju helpers
    def _check_renju_violation(self, row, col):
        """Check if placing black at (row, col) violates renju rules.
        Returns a string describing the violation, or None if the move is legal.
        Black cannot:
          1. Create an overline (6 or more in a row)
          2. Create a double-three (two open threes simultaneously)
          3. Create a double-four (two fours simultaneously)
        """
        # Temporarily place the stone
        self.board[row][col] = 1

        # Check overline
        if self._has_overline(row, col):
            self.board[row][col] = 0
            return "overline (6+ in a row)"

        # Count open threes and fours created by this move
        open_threes = 0
        fours = 0
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
        for dr, dc in directions:
            line_info = self._analyze_line(row, col, dr, dc)
            if line_info == "open_three":
                open_threes += 1
            elif line_info == "four":
                fours += 1

        self.board[row][col] = 0

        if open_threes >= 2:
            return "double-three"
        if fours >= 2:
            return "double-four"
        return None

    def _has_overline(self, row, col):
        """Check if black has 6+ in a row through (row, col)."""
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
        for dr, dc in directions:
            count = 1
            # Count forward
            r, c = row + dr, col + dc
            while 0 <= r < self.size and 0 <= c < self.size and self.board[r][c] == 1:
                count += 1
                r += dr
                c += dc
            # Count backward
            r, c = row - dr, col - dc
            while 0 <= r < self.size and 0 <= c < self.size and self.board[r][c] == 1:
                count += 1
                r -= dr
                c -= dc
            if count >= 6:
                return True
        return False

    def _analyze_line(self, row, col, dr, dc):
        """Analyze the line through (row, col) in direction (dr, dc) for black stones.
        Returns 'open_three', 'four', or None.

        An 'open_three' is exactly 3 consecutive black stones with open ends on both sides
        (can become an open four).
        A 'four' is exactly 4 consecutive black stones (open or closed).
        """
        # Collect consecutive stones through (row, col)
        stones = [(row, col)]

        # Forward
        r, c = row + dr, col + dc
        while 0 <= r < self.size and 0 <= c < self.size and self.board[r][c] == 1:
            stones.append((r, c))
            r += dr
            c += dc
        end_fwd = (r, c)  # first cell after forward stones

        # Backward
        r, c = row - dr, col - dc
        while 0 <= r < self.size and 0 <= c < self.size and self.board[r][c] == 1:
            stones.append((r, c))
            r -= dr
            c -= dc
        end_bwd = (r, c)  # first cell after backward stones

        count = len(stones)

        if count == 5:
            return None  # exactly five is a win, not a violation component

        if count >= 6:
            return None  # overline handled separately

        if count == 4:
            return "four"

        if count == 3:
            # Check if both ends are open (empty and in bounds)
            fwd_open = (0 <= end_fwd[0] < self.size and 0 <= end_fwd[1] < self.size
                        and self.board[end_fwd[0]][end_fwd[1]] == 0)
            bwd_open = (0 <= end_bwd[0] < self.size and 0 <= end_bwd[1] < self.size
                        and self.board[end_bwd[0]][end_bwd[1]] == 0)
            if fwd_open and bwd_open:
                return "open_three"

        return None

    # ----------------------------------------------------------- state / save
    def get_state(self):
        return {
            "variation": self.variation,
            "size": self.size,
            "board": [row[:] for row in self.board],
        }

    def load_state(self, state):
        self.variation = state["variation"]
        self.size = state["size"]
        self.board = [row[:] for row in state["board"]]

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        return """
==============================================================
                     GOMOKU  TUTORIAL
==============================================================

OVERVIEW
  Gomoku (Five in a Row) is a two-player strategy game played
  on a 15x15 board (like a Go board).  Players take turns
  placing stones.  The first to get exactly 5 in a row wins.

  Player 1 plays Black (\u25cf) and always goes first.
  Player 2 plays White (\u25cb).

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  The board uses Go-style coordinates:
    Columns : A through O  (left to right)
    Rows    : 1 through 15 (bottom to top)

  Enter your move as a letter + number, e.g.:
    H8   = column H, row 8  (center of the board)
    A1   = bottom-left corner
    O15  = top-right corner

--------------------------------------------------------------
VARIATION: standard
--------------------------------------------------------------
  Board : 15 x 15
  Goal  : Place exactly 5 of your stones in an unbroken
          horizontal, vertical, or diagonal line.
  Note  : Overlines (6 or more in a row) also count as a win
          in the standard variation.

--------------------------------------------------------------
VARIATION: renju
--------------------------------------------------------------
  Board : 15 x 15
  Goal  : Same as standard -- get 5 in a row.

  Special restrictions for BLACK only:
  Black is subject to three forbidden-move rules.  If a move
  would create any of these patterns, it is illegal:

  1. OVERLINE
     Black may NOT form 6 or more stones in a row.
     (White CAN win with 6+ in a row.)

  2. DOUBLE-THREE
     Black may NOT simultaneously create two "open threes."
     An open three is exactly 3 consecutive black stones with
     empty cells on both ends (so it can become an open four).

  3. DOUBLE-FOUR
     Black may NOT simultaneously create two "fours."
     A four is exactly 4 consecutive black stones (open or
     closed on either end).

  These restrictions prevent Black from having too large a
  first-move advantage.  White has NO restrictions.

  If a move is forbidden, the game will tell you and ask for
  a different move.

STRATEGY TIPS
--------------------------------------------------------------
  - The center of the board is the strongest opening position.
  - Try to build threats in two directions at once.
  - An "open four" (four in a row with both ends open) is
    unstoppable, so force your opponent to block constantly.
  - In renju, White can try to lure Black into making a
    forbidden move.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial
==============================================================
"""
