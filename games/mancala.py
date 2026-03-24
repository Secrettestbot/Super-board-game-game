"""Mancala - Ancient seed-sowing board game with multiple variations."""

from engine.base import BaseGame, input_with_quit, clear_screen


class MancalaGame(BaseGame):
    """Mancala: Sow seeds around the board to capture the most."""

    name = "Mancala"
    description = "Ancient seed-sowing strategy game with multiple rule sets"
    min_players = 2
    max_players = 2
    variations = {
        "kalah": "Standard Mancala/Kalah - 6 pits, 4 seeds, capture & extra turns",
        "oware": "Oware/Awari - 6 pits, 4 seeds, 2-or-3 capture rule, no extra turns",
        "congkak": "Congkak - 7 pits, 7 seeds, larger board with extra turns",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "kalah")
        self.pits = []
        self.stores = [0, 0]
        self.num_pits = 6
        self.extra_turn = False

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Initialize the board based on the variation."""
        if self.variation == "congkak":
            self.num_pits = 7
            seeds_per_pit = 7
        else:
            self.num_pits = 6
            seeds_per_pit = 4

        # pits[0..n-1] = Player 1's pits (left to right from P1's view)
        # pits[n..2n-1] = Player 2's pits (left to right from P2's view)
        self.pits = [seeds_per_pit] * (self.num_pits * 2)
        self.stores = [0, 0]
        self.extra_turn = False

    # ------------------------------------------------------------- display
    def display(self):
        """Display the Mancala board."""
        n = self.num_pits
        var_name = {"kalah": "Kalah", "oware": "Oware", "congkak": "Congkak"}
        print(f"\n  === Mancala ({var_name.get(self.variation, self.variation)}) ===")
        print(f"  {self.players[0]} vs {self.players[1]}")
        cur = self.players[self.current_player - 1]
        print(f"  Current turn: {cur}")
        if self.extra_turn:
            print(f"  ** Extra turn! **")
        print()

        p1_pits = self.pits[0:n]
        p2_pits = self.pits[n:n * 2]

        # Build pit number labels
        p2_nums = "   "
        p2_vals = "   "
        for i in range(n - 1, -1, -1):
            p2_nums += f"  {i + 1:>2} "
            p2_vals += f"  {p2_pits[i]:>2} "

        p1_nums = "   "
        p1_vals = "   "
        for i in range(n):
            p1_nums += f"  {i + 1:>2} "
            p1_vals += f"  {p1_pits[i]:>2} "

        inner_width = n * 5 + 1
        border = "+" + "-" * 5 + "+" + "-" * inner_width + "+" + "-" * 5 + "+"

        print(f"       {self.players[1]}'s side")
        print(f"  {p2_nums}")
        print(f"  {border}")
        print(f"  |     |{p2_vals} |     |")
        print(f"  | {self.stores[1]:>3} |{' ' * ((inner_width - 3) // 2)}---{' ' * ((inner_width - 3) // 2)} | {self.stores[0]:>3} |")
        print(f"  |     |{p1_vals} |     |")
        print(f"  {border}")
        print(f"  {p1_nums}")
        print(f"       {self.players[0]}'s side")
        print()
        total_seeds = sum(self.pits) + sum(self.stores)
        print(f"  Score: {self.players[0]}={self.stores[0]}  {self.players[1]}={self.stores[1]}  (Total seeds: {total_seeds})")
        print()

    # ------------------------------------------------------------- get_move
    def get_move(self):
        """Get pit number from current player."""
        n = self.num_pits
        while True:
            raw = input_with_quit(
                f"  {self.players[self.current_player - 1]}, choose a pit (1-{n}): "
            )
            raw = raw.strip()
            try:
                pit = int(raw)
                if 1 <= pit <= n:
                    if self.current_player == 1:
                        idx = pit - 1
                    else:
                        idx = n + pit - 1
                    if self.pits[idx] > 0:
                        return pit
                    else:
                        print("  That pit is empty! Choose another.")
                else:
                    print(f"  Enter a number from 1 to {n}.")
            except ValueError:
                print(f"  Invalid input. Enter a number from 1 to {n}.")

    # ----------------------------------------------------------- make_move
    def make_move(self, move):
        """Apply the chosen move. Returns True if valid."""
        self.extra_turn = False

        if self.variation == "oware":
            return self._make_move_oware(move)
        else:
            return self._make_move_kalah(move)

    def _make_move_kalah(self, pit_num):
        """Kalah and Congkak sowing rules with capture and extra turns."""
        n = self.num_pits
        player = self.current_player

        # Convert player's pit number (1-based) to board index
        if player == 1:
            start_idx = pit_num - 1
        else:
            start_idx = n + pit_num - 1

        seeds = self.pits[start_idx]
        if seeds == 0:
            return False
        self.pits[start_idx] = 0

        # Sowing uses a linear layout with stores:
        # Positions 0..n-1: P1 pits
        # Position n: P1 store
        # Positions n+1..2n: P2 pits
        # Position 2n+1: P2 store
        # Total: 2n + 2 positions
        total_pos = 2 * n + 2
        p1_store = n
        p2_store = 2 * n + 1

        # Map board index to sow position
        if start_idx < n:
            sow_pos = start_idx
        else:
            sow_pos = start_idx + 1  # skip P1 store position

        # Opponent's store to skip
        skip_store = p2_store if player == 1 else p1_store

        last_pos = sow_pos
        while seeds > 0:
            sow_pos = (sow_pos + 1) % total_pos
            if sow_pos == skip_store:
                continue
            # Drop seed
            if sow_pos == p1_store:
                self.stores[0] += 1
            elif sow_pos == p2_store:
                self.stores[1] += 1
            else:
                # Map sow position back to pits index
                if sow_pos < p1_store:
                    self.pits[sow_pos] += 1
                else:
                    self.pits[sow_pos - 1] += 1
            seeds -= 1
            last_pos = sow_pos

        # Extra turn: last seed in own store
        own_store = p1_store if player == 1 else p2_store
        if last_pos == own_store:
            self.extra_turn = True

        # Capture: last seed in empty pit on own side (pit now has exactly 1)
        if not self.extra_turn:
            if player == 1 and 0 <= last_pos < n:
                pit_idx = last_pos
                if self.pits[pit_idx] == 1:
                    opposite_idx = n + (n - 1 - pit_idx)
                    if self.pits[opposite_idx] > 0:
                        self.stores[0] += self.pits[opposite_idx] + 1
                        self.pits[opposite_idx] = 0
                        self.pits[pit_idx] = 0
            elif player == 2 and n + 1 <= last_pos <= 2 * n:
                pit_idx = last_pos - 1  # map sow position back to pits index
                if self.pits[pit_idx] == 1:
                    p2_local = pit_idx - n  # 0-based within P2's pits
                    opposite_idx = n - 1 - p2_local
                    if self.pits[opposite_idx] > 0:
                        self.stores[1] += self.pits[opposite_idx] + 1
                        self.pits[opposite_idx] = 0
                        self.pits[pit_idx] = 0

        return True

    def _make_move_oware(self, pit_num):
        """Oware sowing and capture rules. No stores in sowing, no extra turns."""
        n = self.num_pits
        player = self.current_player

        if player == 1:
            start_idx = pit_num - 1
        else:
            start_idx = n + pit_num - 1

        seeds = self.pits[start_idx]
        if seeds == 0:
            return False

        # Save state for potential grand slam undo
        saved_pits = list(self.pits)
        saved_stores = list(self.stores)

        self.pits[start_idx] = 0

        # Oware: sow only into pits (no stores). Skip starting pit if >= 12 seeds.
        total_pits = 2 * n
        pos = start_idx
        while seeds > 0:
            pos = (pos + 1) % total_pits
            if pos == start_idx:
                continue  # skip starting pit on wrap-around
            self.pits[pos] += 1
            seeds -= 1

        # Capture: if last seed lands on opponent's side and makes 2 or 3
        if player == 1:
            opp_range = range(n, 2 * n)
        else:
            opp_range = range(0, n)

        captured = 0
        if pos in opp_range:
            check = pos
            while check in opp_range and self.pits[check] in (2, 3):
                captured += self.pits[check]
                self.pits[check] = 0
                check -= 1

        # Grand slam check: if capture leaves opponent with no seeds, cancel it
        if captured > 0:
            opp_total = sum(self.pits[i] for i in opp_range)
            if opp_total == 0:
                # Grand slam - restore state and just do the sowing without capture
                self.pits = saved_pits
                self.stores = saved_stores
                self.pits[start_idx] = 0
                seeds_to_sow = saved_pits[start_idx]
                pos = start_idx
                while seeds_to_sow > 0:
                    pos = (pos + 1) % total_pits
                    if pos == start_idx:
                        continue
                    self.pits[pos] += 1
                    seeds_to_sow -= 1
                # No capture applied
            else:
                self.stores[player - 1] += captured

        # No extra turns in Oware
        self.extra_turn = False
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        """Override to handle extra turns in Kalah/Congkak."""
        if self.extra_turn:
            # Don't switch - current player goes again
            return
        super().switch_player()

    # ---------------------------------------------------- check_game_over
    def check_game_over(self):
        """Game ends when one side is completely empty."""
        n = self.num_pits
        p1_seeds = sum(self.pits[0:n])
        p2_seeds = sum(self.pits[n:n * 2])

        if p1_seeds == 0 or p2_seeds == 0:
            # Remaining seeds go to the player whose side still has them
            self.stores[0] += p1_seeds
            self.stores[1] += p2_seeds
            for i in range(n * 2):
                self.pits[i] = 0

            self.game_over = True
            if self.stores[0] > self.stores[1]:
                self.winner = 1
            elif self.stores[1] > self.stores[0]:
                self.winner = 2
            else:
                self.winner = None  # draw

    # --------------------------------------------------------- get_state
    def get_state(self):
        """Return serializable game state."""
        return {
            "pits": list(self.pits),
            "stores": list(self.stores),
            "num_pits": self.num_pits,
            "extra_turn": self.extra_turn,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.pits = list(state["pits"])
        self.stores = list(state["stores"])
        self.num_pits = state["num_pits"]
        self.extra_turn = state.get("extra_turn", False)

    # --------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive tutorial text."""
        return """
==============================================================
                    MANCALA  TUTORIAL
==============================================================

OVERVIEW
  Mancala is a family of ancient seed-sowing games. Two players
  sit on opposite sides of a board with rows of pits. Players
  take turns picking up all seeds from one of their pits and
  sowing them one-by-one into subsequent pits. The goal is to
  collect the most seeds in your store.

--------------------------------------------------------------
BOARD LAYOUT
--------------------------------------------------------------
  The board is displayed with Player 2's pits on top and
  Player 1's pits on the bottom. Stores are on the sides:
  Player 2's store is on the LEFT, Player 1's store is on
  the RIGHT.

  Seeds are sown counter-clockwise: Player 1 sows right along
  their pits, into their store, then along Player 2's pits.

--------------------------------------------------------------
VARIATION: Kalah (Standard Mancala)
--------------------------------------------------------------
  Board  : 6 pits per side, 4 seeds each (48 total).
           Each player has a store on their right.

  Sowing : Pick up all seeds from one of YOUR pits. Drop them
           one at a time counter-clockwise into each subsequent
           pit and your own store. Skip your opponent's store.

  Extra Turn:
           If your last seed lands in YOUR store, you get
           another turn immediately.

  Capture:
           If your last seed lands in an EMPTY pit on YOUR
           side, and the opposite pit on your opponent's side
           has seeds, you capture BOTH that seed and all seeds
           in the opposite pit. All captured seeds go to your
           store.

  End    : The game ends when one player's pits are all empty.
           Remaining seeds on the other side go to that
           player's store. Highest store total wins.

--------------------------------------------------------------
VARIATION: Oware (Awari)
--------------------------------------------------------------
  Board  : 6 pits per side, 4 seeds each (48 total).

  Sowing : Pick up all seeds from one of YOUR pits. Drop them
           one at a time counter-clockwise. Seeds are only
           sown into pits (NOT stores). If you have 12+ seeds,
           skip the starting pit on wrap-around.

  Capture:
           If your last seed lands on your OPPONENT's side and
           brings that pit to exactly 2 or 3 seeds, you capture
           those seeds. Then check the previous pit on the
           opponent's side: if it also has 2 or 3, capture those
           too. Continue backward until a pit does not have 2 or
           3, or you leave the opponent's side.

  Grand Slam:
           If a capture would take ALL of the opponent's seeds,
           the capture is cancelled. The opponent must always
           have seeds to play with.

  No Extra Turns:
           Players always alternate turns. There are no extra
           turns in Oware.

  End    : The game ends when one player cannot move (all their
           pits are empty). The other player collects all
           remaining seeds on their side.

--------------------------------------------------------------
VARIATION: Congkak
--------------------------------------------------------------
  Board  : 7 pits per side, 7 seeds each (98 total).
           Each player has a store on their right.

  Sowing : Same as Kalah but on a larger board. Pick up seeds
           from one of your 7 pits and sow counter-clockwise.
           Skip the opponent's store.

  Extra Turn:
           Same as Kalah: if your last seed lands in YOUR
           store, you get another turn.

  Capture:
           Same as Kalah: landing in an empty pit on your side
           captures that seed plus the opposite pit's seeds.

  End    : Same as Kalah: game ends when one side is empty.
           Remaining seeds go to the other player's store.

--------------------------------------------------------------
HOW TO PLAY
--------------------------------------------------------------
  On your turn, enter the pit number you want to sow from.
  Pits are numbered 1 through 6 (or 1-7 for Congkak).
  Pit 1 is on your LEFT, and the highest number is on your
  RIGHT (closest to your store).

  You can only choose pits on YOUR side that contain seeds.

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
  Kalah / Congkak:
  - Plan moves to land your last seed in your store for extra
    turns. Chain multiple extra turns when possible.
  - Empty pits on your side can become capture traps.
  - Count seeds to predict where your last seed will land.
  - In the endgame, try to sweep remaining seeds efficiently.

  Oware:
  - Keep opponent's pits at 1 seed so you can make them 2 or 3.
  - Set up chain captures across multiple adjacent opponent pits.
  - Be aware of the grand slam rule: sometimes you cannot
    capture even when the conditions are met.
  - Try to keep seeds distributed to maintain options.
==============================================================
"""
