"""Can't Stop - Press-your-luck dice column race (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Column lengths: how many spaces to reach the top for each column 2-12
COLUMN_LENGTHS = {
    2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13,
    8: 11, 9: 9, 10: 7, 11: 5, 12: 3,
}


class CantStopGame(BaseGame):
    """Can't Stop - Roll dice, pick pairs, advance up columns. Don't bust!"""

    name = "Can't Stop"
    description = "Press-your-luck dice game - advance columns but don't bust"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Can't Stop (cap 3 columns to win)",
        "express": "Express (cap 2 columns to win)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Permanent progress: progress[player][column] = steps locked in
        self.progress = {1: {}, 2: {}}
        # Capped columns: capped[player] = set of column numbers
        self.capped = {1: set(), 2: set()}
        # Temporary progress this turn: temp[column] = extra steps
        self.temp = {}
        # Active runners (max 3 columns per turn)
        self.runners = set()
        # Current dice roll
        self.dice = [0, 0, 0, 0]
        # Phase: roll, choose_pairs, stop_or_continue, bust, turn_over
        self.phase = "roll"
        self.log = []
        self.columns_to_win = 3

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 10:
            self.log = self.log[-10:]

    def _opponent(self):
        return 2 if self.current_player == 1 else 1

    def _column_owner(self, col):
        """Return player who capped this column, or None."""
        for p in (1, 2):
            if col in self.capped[p]:
                return p
        return None

    def _effective_pos(self, player, col):
        """Player's effective position in a column (locked + temp if current)."""
        base = self.progress[player].get(col, 0)
        if player == self.current_player and col in self.temp:
            return base + self.temp[col]
        return base

    def _can_advance(self, col):
        """Check if a column can be advanced (not capped by anyone)."""
        return self._column_owner(col) is None

    def _possible_pairs(self):
        """Return all valid (pair1, pair2) combinations from 4 dice."""
        d = self.dice
        # 3 ways to pair 4 dice: (01+23), (02+13), (03+12)
        pairings = [
            (d[0] + d[1], d[2] + d[3]),
            (d[0] + d[2], d[1] + d[3]),
            (d[0] + d[3], d[1] + d[2]),
        ]
        valid = []
        for p1, p2 in pairings:
            can1 = self._can_use_column(p1)
            can2 = self._can_use_column(p2)
            if can1 or can2:
                valid.append((p1, p2, can1, can2))
        return valid

    def _can_use_column(self, col):
        """Check if we can advance in this column."""
        if not self._can_advance(col):
            return False
        cp = self.current_player
        pos = self._effective_pos(cp, col)
        if pos >= COLUMN_LENGTHS[col]:
            return False
        # Check runner limit: already a runner or room for new runner
        if col in self.runners:
            return True
        if len(self.runners) < 3:
            return True
        return False

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.columns_to_win = 2 if self.variation == "express" else 3
        self.progress = {1: {}, 2: {}}
        self.capped = {1: set(), 2: set()}
        self.temp = {}
        self.runners = set()
        self.dice = [0, 0, 0, 0]
        self.phase = "roll"
        self.log = []
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()

        print(f"\n{'=' * 60}")
        mode = "Express" if self.variation == "express" else "Standard"
        print(f"  CAN'T STOP  ({mode})  -  Turn {self.turn_number + 1}")
        print(f"  {self.players[cp - 1]}'s turn  |  Need {self.columns_to_win} capped columns to win")
        print(f"{'=' * 60}")

        # Column visualization
        print(f"\n  Column:  ", end="")
        for col in range(2, 13):
            print(f" {col:>3}", end="")
        print()
        print(f"  Length:  ", end="")
        for col in range(2, 13):
            print(f" {COLUMN_LENGTHS[col]:>3}", end="")
        print()

        # Player 1 positions
        for p in (1, 2):
            label = f"  P{p}"
            if p == cp:
                label += "*"
            print(f"{label:7s}:  ", end="")
            for col in range(2, 13):
                owner = self._column_owner(col)
                if owner == p:
                    print(f"  {chr(9650)}", end="")  # capped marker
                else:
                    pos = self._effective_pos(p, col)
                    if pos > 0:
                        print(f" {pos:>3}", end="")
                    else:
                        print(f"   .", end="")
            capped_count = len(self.capped[p])
            print(f"   | Capped: {capped_count}/{self.columns_to_win}")

        # Temp runners
        if self.temp:
            print(f"\n  Temp runners: ", end="")
            for col in sorted(self.runners):
                base = self.progress[cp].get(col, 0)
                tmp = self.temp.get(col, 0)
                print(f"Col {col} ({base}+{tmp}={base + tmp}/{COLUMN_LENGTHS[col]})  ", end="")
            print()

        # Dice
        if any(d > 0 for d in self.dice):
            print(f"\n  Dice: {self.dice[0]}  {self.dice[1]}  {self.dice[2]}  {self.dice[3]}")

        # Phase
        print(f"\n  Phase: {self.phase.replace('_', ' ').upper()}")

        # Log
        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-5:]:
                print(f"  {line}")

        print()

    # -------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if self.phase == "roll":
            print(f"  {self.players[cp - 1]}, type 'roll' to roll 4 dice.")
            while True:
                move = input_with_quit("  > ").strip().lower()
                if move == "roll":
                    return "roll"
                print("  Type 'roll' to roll the dice.")

        elif self.phase == "choose_pairs":
            return self._get_pair_choice()

        elif self.phase == "stop_or_continue":
            print(f"  'stop' to lock progress, or 'roll' to continue (risk bust)")
            while True:
                move = input_with_quit("  > ").strip().lower()
                if move in ("stop", "roll"):
                    return move
                print("  Type 'stop' or 'roll'.")

        elif self.phase == "bust":
            input_with_quit("  BUST! Press Enter to end turn... ")
            return "bust"

        elif self.phase == "turn_over":
            return "end_turn"

        return None

    def _get_pair_choice(self):
        pairs = self._possible_pairs()
        if not pairs:
            print("  No valid pairings available - BUST!")
            input_with_quit("  Press Enter... ")
            return "no_pairs"

        print(f"  Choose how to pair the dice ({self.dice}):")
        options = []
        for i, (p1, p2, c1, c2) in enumerate(pairs, 1):
            parts = []
            if c1:
                parts.append(f"Col {p1}")
            if c2 and p2 != p1:
                parts.append(f"Col {p2}")
            elif c2 and p2 == p1:
                parts.append(f"Col {p1} (x2)")
            desc = " + ".join(parts) if parts else "none usable"
            flag = ""
            if not c1 and c2:
                flag = f" (skip Col {p1})"
            elif c1 and not c2:
                flag = f" (skip Col {p2})"
            options.append((i, p1, p2, c1, c2))
            print(f"    {i}. {p1} + {p2}  ->  {desc}{flag}")

        while True:
            choice = input_with_quit("  Choose option: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(options):
                idx = int(choice) - 1
                _, p1, p2, c1, c2 = options[idx]
                return f"pair {p1} {p2} {int(c1)} {int(c2)}"
            print(f"  Choose 1-{len(options)}.")

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move == "roll":
            self.dice = [random.randint(1, 6) for _ in range(4)]
            self._add_log(f"{self.players[cp - 1]} rolled: {self.dice}")

            if self.phase == "roll":
                # First roll of turn
                self.phase = "choose_pairs"
            else:
                # Continuing roll
                pairs = self._possible_pairs()
                if not pairs:
                    self.phase = "bust"
                else:
                    self.phase = "choose_pairs"

            # Don't switch player
            self.current_player = cp
            return True

        elif move == "no_pairs":
            self._add_log(f"{self.players[cp - 1]} BUSTED! No valid pairs.")
            self.temp = {}
            self.runners = set()
            self.phase = "roll"
            return True

        elif move.startswith("pair"):
            parts = move.split()
            p1, p2 = int(parts[1]), int(parts[2])
            c1, c2 = bool(int(parts[3])), bool(int(parts[4]))

            advanced = []
            if c1 and self._can_use_column(p1):
                self.runners.add(p1)
                self.temp[p1] = self.temp.get(p1, 0) + 1
                advanced.append(str(p1))
            if c2 and p2 != p1 and self._can_use_column(p2):
                self.runners.add(p2)
                self.temp[p2] = self.temp.get(p2, 0) + 1
                advanced.append(str(p2))
            elif c2 and p2 == p1 and self._can_use_column(p1):
                self.temp[p1] = self.temp.get(p1, 0) + 1
                advanced.append(f"{p1}(x2)")

            if advanced:
                self._add_log(f"Advanced columns: {', '.join(advanced)}")

            # Check for auto-cap
            self._check_temp_caps(cp)

            self.phase = "stop_or_continue"
            self.current_player = cp
            return True

        elif move == "stop":
            # Lock in temp progress
            for col, steps in self.temp.items():
                base = self.progress[cp].get(col, 0)
                new_pos = base + steps
                length = COLUMN_LENGTHS[col]
                if new_pos >= length:
                    new_pos = length
                    self.capped[cp].add(col)
                    # Remove opponent progress from this column
                    opp = self._opponent()
                    if col in self.progress[opp]:
                        del self.progress[opp][col]
                    self._add_log(f"{self.players[cp - 1]} CAPPED column {col}!")
                self.progress[cp][col] = new_pos

            self._add_log(f"{self.players[cp - 1]} stops and locks progress.")
            self.temp = {}
            self.runners = set()
            self.phase = "roll"
            self.dice = [0, 0, 0, 0]
            return True

        elif move == "bust":
            self._add_log(f"{self.players[cp - 1]} BUSTED! Temp progress lost.")
            self.temp = {}
            self.runners = set()
            self.phase = "roll"
            self.dice = [0, 0, 0, 0]
            return True

        elif move == "end_turn":
            self.temp = {}
            self.runners = set()
            self.phase = "roll"
            self.dice = [0, 0, 0, 0]
            return True

        return False

    def _check_temp_caps(self, cp):
        """Check if any temp progress hits the cap."""
        for col in list(self.runners):
            pos = self._effective_pos(cp, col)
            if pos >= COLUMN_LENGTHS[col]:
                # Will be capped when stopped
                pass

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        if self.phase in ("choose_pairs", "stop_or_continue", "bust"):
            pass  # Don't switch during a turn
        else:
            super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        for p in (1, 2):
            if len(self.capped[p]) >= self.columns_to_win:
                self.game_over = True
                self.winner = p
                return

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "progress": {
                str(p): {str(k): v for k, v in cols.items()}
                for p, cols in self.progress.items()
            },
            "capped": {str(p): list(s) for p, s in self.capped.items()},
            "temp": {str(k): v for k, v in self.temp.items()},
            "runners": list(self.runners),
            "dice": self.dice,
            "phase": self.phase,
            "log": list(self.log),
            "columns_to_win": self.columns_to_win,
        }

    def load_state(self, state):
        self.progress = {
            int(p): {int(k): v for k, v in cols.items()}
            for p, cols in state["progress"].items()
        }
        self.capped = {int(p): set(s) for p, s in state["capped"].items()}
        self.temp = {int(k): v for k, v in state["temp"].items()}
        self.runners = set(state["runners"])
        self.dice = state["dice"]
        self.phase = state["phase"]
        self.log = list(state.get("log", []))
        self.columns_to_win = state.get("columns_to_win", 3)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        win_cols = self.columns_to_win
        return (
            f"\n{'=' * 58}\n"
            f"  CAN'T STOP - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Race up 11 columns (numbered 2-12). First to cap\n"
            f"  {win_cols} columns wins. Each column corresponds to a\n"
            f"  dice sum; column 7 is longest (13 spaces), while\n"
            f"  columns 2 and 12 are shortest (3 spaces).\n\n"
            f"  ON YOUR TURN:\n"
            f"  1. Roll 4 dice.\n"
            f"  2. Pair them into two sums (3 possible pairings).\n"
            f"  3. Advance your runner(s) in the matching column(s).\n"
            f"     You can have at most 3 active runners per turn.\n"
            f"  4. Choose: STOP to lock your progress, or ROLL again.\n\n"
            f"  BUSTING:\n"
            f"  If you roll and cannot make any valid pair (columns\n"
            f"  are capped or you already have 3 runners in other\n"
            f"  columns), you BUST and lose ALL temporary progress.\n\n"
            f"  CAPPING A COLUMN:\n"
            f"  When you reach the top of a column and stop, you\n"
            f"  cap it. Nobody else can advance in that column.\n"
            f"  The opponent loses any progress in that column.\n\n"
            f"  STRATEGY:\n"
            f"  - Columns 6, 7, 8 are safest (most dice combos).\n"
            f"  - Columns 2, 12 are risky but short.\n"
            f"  - Know when to stop! Greed leads to busting.\n\n"
            f"  COMMANDS:\n"
            f"  'roll'  - Roll the dice\n"
            f"  'stop'  - Lock progress and end turn\n"
            f"  1-3     - Choose dice pairing option\n"
            f"  'quit'  - Exit    'save' - Save game\n"
            f"  'help'  - Help    'tutorial' - This tutorial\n"
            f"{'=' * 58}"
        )
