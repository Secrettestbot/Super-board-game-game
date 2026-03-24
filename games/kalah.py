"""Kalah - A classic Mancala variant with capture and extra-turn rules."""

from engine.base import BaseGame, input_with_quit, clear_screen


class KalahGame(BaseGame):
    """Kalah: Sow seeds counter-clockwise, capture, and earn extra turns."""

    name = "Kalah"
    description = "A classic Mancala variant - sow seeds and capture to win"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Kalah (6 pits, 4 seeds)",
        "large": "Large Kalah (6 pits, 6 seeds)",
        "small": "Small Kalah (4 pits, 3 seeds)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.pits = []       # pits[0..n-1] = P1 pits, pits[n] = P1 store,
                             # pits[n+1..2n] = P2 pits, pits[2n+1] = P2 store
        self.num_pits = 6
        self.seeds_per_pit = 4
        self._extra_turn = False

    def setup(self):
        """Initialize the board based on the chosen variation."""
        if self.variation == "large":
            self.num_pits = 6
            self.seeds_per_pit = 6
        elif self.variation == "small":
            self.num_pits = 4
            self.seeds_per_pit = 3
        else:
            self.num_pits = 6
            self.seeds_per_pit = 4

        n = self.num_pits
        # Layout: [P1 pit 0 .. P1 pit n-1, P1 store, P2 pit 0 .. P2 pit n-1, P2 store]
        self.pits = []
        for _ in range(n):
            self.pits.append(self.seeds_per_pit)
        self.pits.append(0)  # P1 store at index n
        for _ in range(n):
            self.pits.append(self.seeds_per_pit)
        self.pits.append(0)  # P2 store at index 2n+1
        self._extra_turn = False

    def _store_index(self, player):
        """Return the store index for a player (1 or 2)."""
        n = self.num_pits
        if player == 1:
            return n
        return 2 * n + 1

    def _pit_range(self, player):
        """Return (start, end) indices for a player's pits (exclusive end)."""
        n = self.num_pits
        if player == 1:
            return (0, n)
        return (n + 1, 2 * n + 1)

    def display(self):
        """Display the board with ASCII art."""
        n = self.num_pits
        p1_start, p1_end = self._pit_range(1)
        p2_start, p2_end = self._pit_range(2)
        p1_store = self._store_index(1)
        p2_store = self._store_index(2)

        # P2 pits displayed right-to-left (so pit 1 is on the left from P2's view)
        p2_pits = list(reversed(self.pits[p2_start:p2_end]))
        p1_pits = self.pits[p1_start:p1_end]

        var_label = self.variation.capitalize() if self.variation else "Standard"
        print(f"\n  === Kalah ({var_label}) ===")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current turn: {self.players[self.current_player - 1]}")
        print()

        # Build the board display
        pit_width = 4
        # P2 label row
        if self.current_player == 2:
            # Number the pits for P2 (reversed, so from P2's perspective left-to-right = pit n..1)
            nums = "  " + " ".join(f"  {i} " for i in range(n, 0, -1))
            print(f"    {nums}")
        print(f"    {'  ' + self.players[1]}")

        # P2 pits row
        p2_str = " ".join(f"[{s:>2}]" for s in p2_pits)
        print(f"    {'  ' + p2_str}")

        # Stores row
        store_gap = "  " + " " * (n * pit_width + (n - 1)) + "  "
        print(f"  [{self.pits[p2_store]:>2}]{store_gap}[{self.pits[p1_store]:>2}]")

        # P1 pits row
        p1_str = " ".join(f"[{s:>2}]" for s in p1_pits)
        print(f"    {'  ' + p1_str}")

        print(f"    {'  ' + self.players[0]}")
        if self.current_player == 1:
            nums = "  " + " ".join(f"  {i} " for i in range(1, n + 1))
            print(f"    {nums}")

        # Score summary
        print(f"\n  Stores: {self.players[0]}={self.pits[p1_store]}  "
              f"{self.players[1]}={self.pits[p2_store]}")
        print()

    def get_move(self):
        """Get the pit number from the current player."""
        n = self.num_pits
        player_name = self.players[self.current_player - 1]
        print(f"  {player_name}, choose a pit (1-{n}).")
        move_str = input_with_quit("  Your move: ").strip()
        return move_str

    def make_move(self, move):
        """Sow seeds from the chosen pit. Returns True if valid."""
        try:
            pit_num = int(move)
        except (ValueError, TypeError):
            return False

        n = self.num_pits
        if pit_num < 1 or pit_num > n:
            return False

        player = self.current_player
        start, end = self._pit_range(player)
        pit_index = start + pit_num - 1

        seeds = self.pits[pit_index]
        if seeds == 0:
            return False

        # Pick up all seeds
        self.pits[pit_index] = 0
        total_positions = len(self.pits)
        opponent = 2 if player == 1 else 1
        opponent_store = self._store_index(opponent)

        current_index = pit_index
        while seeds > 0:
            current_index = (current_index + 1) % total_positions
            # Skip opponent's store
            if current_index == opponent_store:
                continue
            self.pits[current_index] += 1
            seeds -= 1

        last_index = current_index

        # Check for extra turn: last seed landed in player's own store
        my_store = self._store_index(player)
        if last_index == my_store:
            self._extra_turn = True
        else:
            self._extra_turn = False

        # Check for capture: last seed landed in an empty pit on player's side
        my_start, my_end = self._pit_range(player)
        if (my_start <= last_index < my_end
                and self.pits[last_index] == 1):
            # The pit was empty before we dropped the last seed (now has 1)
            # Find the opposite pit
            opp_start, opp_end = self._pit_range(opponent)
            offset = last_index - my_start
            opposite_index = opp_start + (n - 1 - offset)
            opposite_seeds = self.pits[opposite_index]
            if opposite_seeds > 0:
                # Capture: move captured seeds + the landing seed to player's store
                self.pits[my_store] += opposite_seeds + 1
                self.pits[opposite_index] = 0
                self.pits[last_index] = 0

        return True

    def switch_player(self):
        """Switch to the next player, unless the current player earned an extra turn."""
        if self._extra_turn:
            self._extra_turn = False
            return
        super().switch_player()

    def check_game_over(self):
        """Check if one side is empty; if so, collect remaining seeds."""
        n = self.num_pits
        for player in (1, 2):
            start, end = self._pit_range(player)
            if sum(self.pits[start:end]) == 0:
                self.game_over = True
                # Other player collects remaining seeds
                opponent = 2 if player == 1 else 1
                opp_start, opp_end = self._pit_range(opponent)
                opp_store = self._store_index(opponent)
                remaining = sum(self.pits[opp_start:opp_end])
                self.pits[opp_store] += remaining
                for i in range(opp_start, opp_end):
                    self.pits[i] = 0

                # Determine winner
                p1_score = self.pits[self._store_index(1)]
                p2_score = self.pits[self._store_index(2)]
                if p1_score > p2_score:
                    self.winner = 1
                elif p2_score > p1_score:
                    self.winner = 2
                else:
                    self.winner = None  # draw
                return

    def get_state(self):
        """Return serializable game state."""
        return {
            "pits": list(self.pits),
            "num_pits": self.num_pits,
            "seeds_per_pit": self.seeds_per_pit,
            "extra_turn": self._extra_turn,
        }

    def load_state(self, state):
        """Restore game state."""
        self.pits = list(state["pits"])
        self.num_pits = state["num_pits"]
        self.seeds_per_pit = state["seeds_per_pit"]
        self._extra_turn = state.get("extra_turn", False)

    def get_tutorial(self):
        """Return tutorial with rules and strategy tips."""
        return """
==================================================
  Kalah - Tutorial
==================================================

  RULES:
  - The board has two rows of pits and a store
    (mancala) on each end.
  - Each pit starts with a set number of seeds
    (4 in standard, 6 in large, 3 in small).
  - On your turn, pick up ALL seeds from one of
    your pits and sow them counter-clockwise, one
    per pit/store.
  - You DO drop seeds into your own store, but you
    SKIP your opponent's store.
  - If your last seed lands in YOUR STORE, you get
    another turn!
  - If your last seed lands in an EMPTY PIT on your
    side, you capture that seed plus all seeds in
    the OPPOSITE pit. All captured seeds go to your
    store.
  - The game ends when one player's pits are all
    empty. The other player collects all remaining
    seeds on their side into their store.
  - The player with the most seeds wins!

  VARIATIONS:
  - Standard: 6 pits per side, 4 seeds each (48
    total seeds).
  - Large: 6 pits per side, 6 seeds each (72
    total seeds).
  - Small: 4 pits per side, 3 seeds each (24
    total seeds).

  HOW TO ENTER MOVES:
  - Type the number of the pit you want to sow
    from (1 to 6 in standard, 1 to 4 in small).
  - Pits are numbered left-to-right from your
    perspective.

  STRATEGY HINTS:
  - Aim for moves that land your last seed in your
    store to earn extra turns. Chaining multiple
    extra turns is very powerful.
  - Set up captures by emptying pits on your side
    so that a future sow lands there when the
    opposite pit is full.
  - Keep seeds on your side of the board; an empty
    side ends the game and your opponent collects
    whatever remains on theirs.
  - Early in the game, prefer moves from pits
    closer to your store for more control.
  - Count seeds carefully - knowing exactly where
    your last seed will land is the key to strong
    play.

==================================================
"""
