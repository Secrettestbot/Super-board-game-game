"""Wari (Awale) - West African seed-sowing strategy game."""

from engine.base import BaseGame, input_with_quit, clear_screen


class WariGame(BaseGame):
    """Wari/Awale: A precise Mancala variant with strict capture and feeding rules."""

    name = "Wari"
    description = "West African seed-sowing game with elegant capture mechanics"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Wari/Awale",
    }

    NUM_PITS = 6
    INITIAL_SEEDS = 4
    TOTAL_SEEDS = 48
    WIN_THRESHOLD = 25

    def __init__(self, variation=None):
        super().__init__(variation or "standard")

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize the board: 2 rows of 6 pits with 4 seeds each."""
        # board[0][0..5] = Player 1's pits (bottom row, left to right)
        # board[1][0..5] = Player 2's pits (top row, right to left from P2's view)
        self.board = [
            [self.INITIAL_SEEDS] * self.NUM_PITS,
            [self.INITIAL_SEEDS] * self.NUM_PITS,
        ]
        self.stores = [0, 0]  # captured seeds: stores[0] = P1, stores[1] = P2
        self.stall_count = 0  # consecutive turns with no capture

    # --------------------------------------------------------------- display
    def display(self):
        """Display the board with pit numbers and seed counts."""
        print(f"\n  === Wari / Awale ===  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} (bottom) vs {self.players[1]} (top)")
        cur = self.players[self.current_player - 1]
        print(f"  Current: {cur}")
        print(f"  Captured: {self.players[0]}={self.stores[0]}  "
              f"{self.players[1]}={self.stores[1]}  "
              f"(need {self.WIN_THRESHOLD} to win)")
        print()

        # Player 2's row (top, displayed right-to-left so pit 1 is on left from P2's view)
        p2_pits = self.board[1]
        # Display P2's pits reversed so leftmost on screen is P2's pit 6
        p2_display = list(reversed(p2_pits))

        # Header with pit numbers for P2 (6 5 4 3 2 1 from left to right)
        hdr2 = "       "
        for i in range(self.NUM_PITS):
            hdr2 += f"  {self.NUM_PITS - i}  "
        print(f"  {self.players[1]}'s pits:")
        print(hdr2)

        # P2 row
        row2 = "       "
        for s in p2_display:
            row2 += f" [{s:2d}] "
        print(row2)

        # Separator with stores
        sep = f"  [{self.stores[1]:2d}] " + "-" * (self.NUM_PITS * 5 + 2) + f" [{self.stores[0]:2d}]"
        print(sep)

        # P1 row
        row1 = "       "
        for s in self.board[0]:
            row1 += f" [{s:2d}] "
        print(row1)

        # Header with pit numbers for P1 (1 2 3 4 5 6 from left to right)
        hdr1 = "       "
        for i in range(self.NUM_PITS):
            hdr1 += f"  {i + 1}  "
        print(hdr1)
        print(f"  {self.players[0]}'s pits:")
        print()

    # --------------------------------------------------------------- helpers
    def _opponent(self, player):
        """Return opponent index (0 or 1)."""
        return 1 - player

    def _total_seeds_on_side(self, side):
        """Count total seeds on one side of the board."""
        return sum(self.board[side])

    def _would_starve(self, side, pit):
        """Simulate a sow from (side, pit) and check if opponent gets zero seeds.

        Returns True if after sowing, the opponent's side has 0 seeds
        (meaning this move starves the opponent).
        """
        # Make a deep copy for simulation
        sim_board = [row[:] for row in self.board]
        opp = self._opponent(side)
        seeds = sim_board[side][pit]
        sim_board[side][pit] = 0

        current_side = side
        current_pit = pit
        while seeds > 0:
            # Advance counter-clockwise
            current_pit += 1
            if current_pit >= self.NUM_PITS:
                current_pit = 0
                current_side = self._opponent(current_side)

            # Skip starting pit if sowing >= 12 seeds
            if current_side == side and current_pit == pit:
                continue

            sim_board[current_side][current_pit] += 1
            seeds -= 1

        # Simulate captures (but we only care about whether opponent has seeds left)
        # Capture from opponent's side going backward
        captured_sim = 0
        if current_side == opp:
            while current_pit >= 0:
                val = sim_board[opp][current_pit]
                if val == 2 or val == 3:
                    captured_sim += val
                    sim_board[opp][current_pit] = 0
                    current_pit -= 1
                else:
                    break

        # Grand Slam check: if we'd capture ALL opponent's seeds, no capture happens
        if sum(sim_board[opp]) == 0 and captured_sim > 0:
            # Grand slam - move is played but no capture
            # Restore captured seeds to opponent
            # Actually, in grand slam the sowing still happens but captures don't
            # So re-simulate without captures
            sim_board2 = [row[:] for row in self.board]
            seeds2 = sim_board2[side][pit]
            sim_board2[side][pit] = 0
            cs, cp = side, pit
            while seeds2 > 0:
                cp += 1
                if cp >= self.NUM_PITS:
                    cp = 0
                    cs = self._opponent(cs)
                if cs == side and cp == pit:
                    continue
                sim_board2[cs][cp] += 1
                seeds2 -= 1
            return sum(sim_board2[opp]) == 0
        else:
            return sum(sim_board[opp]) == 0

    def _can_feed_opponent(self, side):
        """Check if any move by 'side' would leave seeds on opponent's side."""
        for pit in range(self.NUM_PITS):
            if self.board[side][pit] > 0:
                if not self._would_starve(side, pit):
                    return True
        return False

    def _get_valid_moves(self, side):
        """Return list of valid pit indices (0-based) for the given side."""
        opp = self._opponent(side)
        opp_has_seeds = self._total_seeds_on_side(opp) > 0

        valid = []
        for pit in range(self.NUM_PITS):
            if self.board[side][pit] == 0:
                continue
            valid.append(pit)

        if not opp_has_seeds:
            # Opponent has no seeds: must feed them if possible
            feeding = [p for p in valid if not self._would_starve(side, p)]
            if feeding:
                return feeding
            # If no move can feed, player has no valid moves (game ends)
            return []

        # Opponent has seeds: must feed if we can
        if self._can_feed_opponent(side):
            # Filter to only moves that don't starve
            feeding = [p for p in valid if not self._would_starve(side, p)]
            if feeding:
                return feeding
        # If all moves starve opponent, any non-empty pit is valid
        # (move plays but captures don't apply due to grand slam)
        return valid

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Get pit selection from current player."""
        side = self.current_player - 1
        name = self.players[self.current_player - 1]
        valid = self._get_valid_moves(side)

        if not valid:
            # No valid moves - this will be handled in make_move / check_game_over
            return None

        valid_display = [str(p + 1) for p in valid]
        while True:
            raw = input_with_quit(
                f"  {name}, choose a pit (1-{self.NUM_PITS}): "
            )
            try:
                pit = int(raw.strip()) - 1
                if pit not in valid:
                    if 0 <= pit < self.NUM_PITS and self.board[side][pit] == 0:
                        print("  That pit is empty.")
                    elif 0 <= pit < self.NUM_PITS:
                        print(f"  That move would starve your opponent. "
                              f"Valid pits: {', '.join(valid_display)}")
                    else:
                        print(f"  Enter a number from 1 to {self.NUM_PITS}.")
                    continue
                return pit
            except ValueError:
                print(f"  Invalid input. Enter a pit number (1-{self.NUM_PITS}).")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        """Sow seeds and perform captures. Returns True if valid."""
        if move is None:
            return True  # No valid moves - pass turn, game will end

        side = self.current_player - 1
        opp = self._opponent(side)
        pit = move

        if not (0 <= pit < self.NUM_PITS):
            return False
        if self.board[side][pit] == 0:
            return False

        seeds = self.board[side][pit]
        self.board[side][pit] = 0

        # Sow counter-clockwise
        current_side = side
        current_pit = pit
        sow_count = seeds
        while sow_count > 0:
            current_pit += 1
            if current_pit >= self.NUM_PITS:
                current_pit = 0
                current_side = self._opponent(current_side)

            # Skip starting pit if original seed count >= 12
            if current_side == side and current_pit == pit:
                continue

            self.board[current_side][current_pit] += 1
            sow_count -= 1

        # Determine captures before applying them
        captured = 0
        capture_pits = []
        if current_side == opp:
            cap_pit = current_pit
            while cap_pit >= 0:
                val = self.board[opp][cap_pit]
                if val == 2 or val == 3:
                    capture_pits.append(cap_pit)
                    captured += val
                    cap_pit -= 1
                else:
                    break

        # Grand Slam check: would capturing leave opponent with 0 seeds?
        remaining_opp = self._total_seeds_on_side(opp) - captured
        if captured > 0 and remaining_opp == 0:
            # Grand Slam: sowing happens but no capture
            captured = 0
            capture_pits = []
            self.stall_count += 1
        elif captured > 0:
            # Apply captures
            for cp in capture_pits:
                self.board[opp][cp] = 0
            self.stores[side] += captured
            self.stall_count = 0
        else:
            self.stall_count += 1

        return True

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check win conditions."""
        # Win by capturing 25+ seeds
        for i in range(2):
            if self.stores[i] >= self.WIN_THRESHOLD:
                self.game_over = True
                self.winner = i + 1
                return

        # Check if next player has any valid moves
        next_side = self._opponent(self.current_player - 1)
        next_valid = self._get_valid_moves(next_side)

        current_side = self.current_player - 1
        current_valid = self._get_valid_moves(current_side)

        if not next_valid and self._total_seeds_on_side(next_side) == 0:
            # Next player has no seeds and current player can't feed them
            # Remaining seeds go to current player's store
            for pit in range(self.NUM_PITS):
                self.stores[current_side] += self.board[current_side][pit]
                self.board[current_side][pit] = 0
            self._determine_winner()
            return

        if not next_valid and not current_valid:
            # Both sides stalled - remaining seeds go to respective owners
            for side in range(2):
                for pit in range(self.NUM_PITS):
                    self.stores[side] += self.board[side][pit]
                    self.board[side][pit] = 0
            self._determine_winner()
            return

        # Stall detection: if many turns with no capture, end game
        if self.stall_count >= 10:
            # Remaining seeds go to the side they're on
            for side in range(2):
                for pit in range(self.NUM_PITS):
                    self.stores[side] += self.board[side][pit]
                    self.board[side][pit] = 0
            self._determine_winner()
            return

    def _determine_winner(self):
        """Set winner based on captured seeds."""
        self.game_over = True
        if self.stores[0] > self.stores[1]:
            self.winner = 1
        elif self.stores[1] > self.stores[0]:
            self.winner = 2
        else:
            self.winner = None  # draw

    # ----------------------------------------------------------- state / save
    def get_state(self):
        """Return serializable game state."""
        return {
            "board": [row[:] for row in self.board],
            "stores": list(self.stores),
            "stall_count": self.stall_count,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board = [row[:] for row in state["board"]]
        self.stores = list(state["stores"])
        self.stall_count = state.get("stall_count", 0)

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return tutorial text for Wari/Awale."""
        return """
==============================================================
                    WARI / AWALE  TUTORIAL
==============================================================

OVERVIEW
  Wari (also called Awale, Oware, or Ayo) is a traditional
  West African seed-sowing game and one of the oldest known
  board games. It is a member of the Mancala family but has
  its own distinct capture and feeding rules that make it
  uniquely strategic.

--------------------------------------------------------------
BOARD LAYOUT
--------------------------------------------------------------
  The board has two rows of 6 pits. Each player owns the row
  closest to them. The game starts with 4 seeds in every pit
  (48 seeds total). Each player also has a store for captured
  seeds.

       Player 2's pits (top row)
       [  6] [  5] [  4] [  3] [  2] [  1]
  [P2]--------------------------------[P1]
       [  1] [  2] [  3] [  4] [  5] [  6]
       Player 1's pits (bottom row)

  Pit numbers go from 1-6 on each side.

--------------------------------------------------------------
SOWING
--------------------------------------------------------------
  On your turn, pick one of your non-empty pits. Take ALL the
  seeds from it and sow them one at a time counter-clockwise
  into subsequent pits.

  Sowing wraps around the board continuously through both
  players' pits.

  SKIP RULE: If you pick up 12 or more seeds, skip the
  starting pit when you come back around to it. (This means
  every pit gets at most one seed per sow.)

--------------------------------------------------------------
CAPTURING
--------------------------------------------------------------
  After sowing, if the LAST seed lands in an opponent's pit
  and brings that pit's count to exactly 2 or 3:
    - Capture all seeds in that pit.
    - Then check the PREVIOUS pit on the opponent's side:
      if it also has 2 or 3 seeds, capture those too.
    - Continue backward, capturing consecutive 2s and 3s.
    - Stop as soon as a pit does not have 2 or 3 seeds.

  Captured seeds go to your store and are out of play.

--------------------------------------------------------------
GRAND SLAM RULE
--------------------------------------------------------------
  You may NEVER capture ALL of your opponent's seeds in one
  move. If a move would capture every seed on the opponent's
  side, the sowing still happens but NO capture occurs.

--------------------------------------------------------------
FEEDING OBLIGATION
--------------------------------------------------------------
  If your opponent's side is empty, you MUST play a move that
  gives them seeds (if such a move exists). If no move can
  feed them, the game ends and remaining seeds on your side
  go to your store.

--------------------------------------------------------------
WINNING
--------------------------------------------------------------
  - First player to capture 25 or more seeds wins.
  - If the game stalls (no captures for many turns), the
    remaining seeds on each side go to that side's owner.
    The player with more total seeds wins.
  - 24-24 is a draw.

--------------------------------------------------------------
HOW TO ENTER MOVES
--------------------------------------------------------------
  Enter the pit number (1-6) of the pit you want to sow from.
  Example: "3" sows from your 3rd pit.

--------------------------------------------------------------
CONTROLS
--------------------------------------------------------------
  'quit'  / 'q'  -- Quit the game
  'save'  / 's'  -- Save and suspend the game
  'help'  / 'h'  -- Show quick help
  'tutorial' / 't' -- Show this tutorial

--------------------------------------------------------------
STRATEGY TIPS
--------------------------------------------------------------
  - Count seeds carefully. Knowing where your last seed will
    land is essential for setting up captures.
  - Build up large pits (12+ seeds) to sow all the way around
    the board and create capture opportunities.
  - Keep your opponent's pits at 1 or 2 seeds -- they become
    capture targets when you sow into them.
  - Use the feeding obligation to your advantage: sometimes
    you can force your opponent to make a bad move by emptying
    your side strategically.
  - Protect your pits from back-captures by avoiding
    consecutive 1s and 2s on your side.
==============================================================
"""
