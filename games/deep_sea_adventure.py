"""Deep Sea Adventure - Push-your-luck diving game for 2-4 players."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class DeepSeaAdventureGame(BaseGame):
    """Deep Sea Adventure - dive for treasure but share the oxygen!"""

    name = "Deep Sea Adventure"
    description = "Push-your-luck diving game with shared oxygen"
    min_players = 2
    max_players = 4
    variations = {
        "standard": "Standard game (3 rounds)",
        "short": "Short game (2 rounds)",
    }

    # Treasure tokens by depth tier (value ranges)
    TIER_VALUES = {
        1: [0, 1, 1, 2, 2, 3],       # Shallow (positions 1-6)
        2: [3, 4, 4, 5, 5, 6],       # Mid (positions 7-12)
        3: [6, 7, 7, 8, 8, 9],       # Deep (positions 13-18)
        4: [9, 10, 11, 12, 13, 14],  # Abyss (positions 19-24)
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.num_players = 2
        self.max_rounds = 3
        self.current_round = 0
        self.oxygen = 25
        self.positions = {}
        self.carried_treasure = {}
        self.scored_treasure = {}
        self.treasure_track = []
        self.returned = {}
        self.direction = {}  # 1 = descending, -1 = ascending
        self.phase = "diving"
        self.log = []
        self.round_scores = {}

    def setup(self):
        self.num_players = len(self.players)
        if self.variation == "short":
            self.max_rounds = 2
        else:
            self.max_rounds = 3
        self.current_round = 0
        self.scored_treasure = {p: [] for p in range(1, self.num_players + 1)}
        self.round_scores = {p: 0 for p in range(1, self.num_players + 1)}
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1
        self.log = []
        self._start_new_round()

    def _start_new_round(self):
        """Set up a new diving round."""
        self.current_round += 1
        self.oxygen = 25
        self.positions = {p: 0 for p in range(1, self.num_players + 1)}
        self.carried_treasure = {p: [] for p in range(1, self.num_players + 1)}
        self.returned = {p: False for p in range(1, self.num_players + 1)}
        self.direction = {p: 1 for p in range(1, self.num_players + 1)}
        self.phase = "diving"
        # Build treasure track: 24 face-down tokens in 4 tiers
        self.treasure_track = []
        for tier in range(1, 5):
            values = list(self.TIER_VALUES[tier])
            random.shuffle(values)
            for v in values:
                self.treasure_track.append({"value": v, "picked": False})
        self._add_log(f"--- Round {self.current_round} begins! Oxygen: 25 ---")

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 15:
            self.log = self.log[-15:]

    def _tier_for_pos(self, pos):
        """Return the depth tier for a track position (1-based)."""
        if pos <= 6:
            return 1
        elif pos <= 12:
            return 2
        elif pos <= 18:
            return 3
        else:
            return 4

    def _tier_name(self, tier):
        names = {1: "Shallow", 2: "Mid", 3: "Deep", 4: "Abyss"}
        return names.get(tier, "?")

    def _roll_dice(self):
        """Roll two dice (1-3 each), return tuple and sum."""
        d1 = random.randint(1, 3)
        d2 = random.randint(1, 3)
        return d1, d2, d1 + d2

    def _active_divers(self):
        """Players still actively diving (not returned, not drowned)."""
        return [
            p for p in range(1, self.num_players + 1)
            if not self.returned[p]
        ]

    def _all_done(self):
        """Check if all players are done (returned or drowned via oxygen)."""
        return len(self._active_divers()) == 0

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 58}")
        print(f"  DEEP SEA ADVENTURE  (Round {self.current_round}/{self.max_rounds})")
        print(f"{'=' * 58}")
        print(f"  Oxygen: {'O' * self.oxygen}{'.' * (25 - self.oxygen)} [{self.oxygen}/25]")
        print()

        # Track visualization - show top portion
        track_display = []
        for i, token in enumerate(self.treasure_track):
            pos = i + 1
            tier = self._tier_for_pos(pos)
            # Check if any player is at this position
            players_here = [
                p for p in range(1, self.num_players + 1)
                if self.positions[p] == pos and not self.returned[p]
            ]
            if players_here:
                label = ",".join(f"P{p}" for p in players_here)
            elif token["picked"]:
                label = "__"
            else:
                label = f"T{tier}"
            track_display.append(f"{label:>3}")

        # Show track in rows of 12
        print("  Depth track (T1=Shallow T2=Mid T3=Deep T4=Abyss):")
        print(f"  Sub  {'  '.join(track_display[:12])}")
        print(f"       {'  '.join(track_display[12:])}")
        print()

        # Player statuses
        for p in range(1, self.num_players + 1):
            marker = " <<" if p == cp else ""
            status = ""
            if self.returned[p]:
                status = "RETURNED to sub"
            elif self.positions[p] == 0:
                status = "On submarine"
            else:
                dir_str = "descending" if self.direction[p] == 1 else "ASCENDING"
                status = f"Pos {self.positions[p]} ({dir_str})"
            carried = len(self.carried_treasure[p])
            scored = sum(v for v in self.scored_treasure[p])
            print(
                f"  {self.players[p - 1]}: {status}, "
                f"carrying {carried} treasure, scored {scored} pts{marker}"
            )

        if self.log:
            print(f"\n  --- Log ---")
            for line in self.log[-5:]:
                print(f"  {line}")
        print()

    # ---------------------------------------------------------------- get_move
    def get_move(self):
        cp = self.current_player

        if self.phase == "round_over":
            input_with_quit("  Press Enter to continue... ")
            return "next_round"

        if self.returned[cp]:
            return "skip"

        # Reduce oxygen by number of treasures carried
        carried = len(self.carried_treasure[cp])
        self.oxygen = max(0, self.oxygen - carried)
        if carried > 0:
            self._add_log(
                f"{self.players[cp - 1]} consumes {carried} oxygen (carrying {carried} treasure)"
            )

        if self.oxygen <= 0:
            self._add_log("OXYGEN DEPLETED! All remaining divers lose their treasure!")
            # All active divers lose their carried treasure (sinks to bottom)
            for p in self._active_divers():
                self.carried_treasure[p] = []
                self.returned[p] = True
            self.phase = "round_over"
            input_with_quit("  Oxygen ran out! Press Enter... ")
            return "next_round"

        # Roll dice
        d1, d2, total = self._roll_dice()
        movement = max(1, total - carried)

        print(f"  You rolled: [{d1}] + [{d2}] = {total}")
        if carried > 0:
            print(f"  Carrying {carried} treasure: movement reduced to {movement}")
        print(f"  Current direction: {'Descending' if self.direction[cp] == 1 else 'Ascending'}")

        # If descending, option to turn around
        if self.direction[cp] == 1:
            print("  Options: 'dive' to keep descending, 'turn' to turn back")
            while True:
                choice = input_with_quit("  > ").strip().lower()
                if choice in ("dive", "d"):
                    break
                elif choice in ("turn", "t", "back"):
                    self.direction[cp] = -1
                    self._add_log(f"{self.players[cp - 1]} turns back toward the sub!")
                    break
                else:
                    print("  Enter 'dive' or 'turn'.")
        else:
            print("  (Ascending back to sub)")

        # Move the player
        new_pos = self.positions[cp] + (movement * self.direction[cp])

        # Skip occupied spaces
        occupied = {
            self.positions[p]
            for p in range(1, self.num_players + 1)
            if p != cp and not self.returned[p] and self.positions[p] > 0
        }
        if self.direction[cp] == 1:
            while new_pos in occupied and new_pos <= 24:
                new_pos += 1
        else:
            while new_pos in occupied and new_pos > 0:
                new_pos -= 1

        if new_pos <= 0:
            # Returned to submarine!
            self.positions[cp] = 0
            self.returned[cp] = True
            # Score carried treasure
            for val in self.carried_treasure[cp]:
                self.scored_treasure[cp].append(val)
                self.round_scores[cp] = sum(self.scored_treasure[cp])
            scored = sum(self.carried_treasure[cp])
            self._add_log(
                f"{self.players[cp - 1]} returns to sub! Scored {scored} points."
            )
            self.carried_treasure[cp] = []
            print(f"  You made it back! Scored {scored} points from this dive.")
            input_with_quit("  Press Enter... ")
            return "returned"

        new_pos = min(new_pos, 24)
        self.positions[cp] = new_pos
        self._add_log(
            f"{self.players[cp - 1]} moves to position {new_pos} "
            f"(tier {self._tier_for_pos(new_pos)})"
        )

        # Option to pick up or drop treasure
        token = self.treasure_track[new_pos - 1]
        options = []
        if not token["picked"]:
            options.append("'pick' to pick up treasure")
        if self.carried_treasure[cp]:
            options.append("'drop' to drop one treasure here")
        options.append("'pass' to do nothing")

        if len(options) > 1 or (not token["picked"] and not self.carried_treasure[cp]):
            print(f"  Position {new_pos} (Tier {self._tier_for_pos(new_pos)}).")
            if not token["picked"]:
                print(f"  There is a treasure token here.")
            print(f"  Options: {', '.join(options)}")
            while True:
                choice = input_with_quit("  > ").strip().lower()
                if choice in ("pick", "p") and not token["picked"]:
                    token["picked"] = True
                    self.carried_treasure[cp].append(token["value"])
                    self._add_log(f"{self.players[cp - 1]} picks up treasure!")
                    return f"move {new_pos} pick"
                elif choice in ("drop",) and self.carried_treasure[cp]:
                    dropped = self.carried_treasure[cp].pop(0)
                    # Place dropped treasure at current position as new token
                    self.treasure_track[new_pos - 1] = {"value": dropped, "picked": False}
                    self._add_log(f"{self.players[cp - 1]} drops a treasure.")
                    return f"move {new_pos} drop"
                elif choice in ("pass", "n", "no"):
                    return f"move {new_pos} pass"
                else:
                    print("  Enter 'pick', 'drop', or 'pass'.")
        else:
            return f"move {new_pos} pass"

    # ---------------------------------------------------------------- make_move
    def make_move(self, move):
        if move == "next_round":
            return self._do_next_round()
        if move in ("skip", "returned"):
            return True
        if move.startswith("move"):
            return True  # Already handled in get_move
        return False

    def _do_next_round(self):
        """Start the next round or end the game."""
        if self.current_round >= self.max_rounds:
            self.game_over = True
            # Determine winner by total scored treasure
            best_score = -1
            best_player = None
            for p in range(1, self.num_players + 1):
                total = sum(self.scored_treasure[p])
                if total > best_score:
                    best_score = total
                    best_player = p
            self.winner = best_player
            return True

        self._start_new_round()
        self.current_player = 1
        return True

    def switch_player(self):
        if self.phase == "round_over":
            return
        active = self._active_divers()
        if not active:
            self.phase = "round_over"
            return
        # Move to next player in order
        next_p = self.current_player % self.num_players + 1
        attempts = 0
        while self.returned[next_p] and attempts < self.num_players:
            next_p = next_p % self.num_players + 1
            attempts += 1
        if self.returned[next_p]:
            self.phase = "round_over"
        else:
            self.current_player = next_p

    def check_game_over(self):
        if self._all_done() and self.current_round >= self.max_rounds:
            self.game_over = True
            best_score = -1
            best_player = None
            for p in range(1, self.num_players + 1):
                total = sum(self.scored_treasure[p])
                if total > best_score:
                    best_score = total
                    best_player = p
            self.winner = best_player

    def get_state(self):
        return {
            "num_players": self.num_players,
            "max_rounds": self.max_rounds,
            "current_round": self.current_round,
            "oxygen": self.oxygen,
            "positions": {str(k): v for k, v in self.positions.items()},
            "carried_treasure": {str(k): v for k, v in self.carried_treasure.items()},
            "scored_treasure": {str(k): v for k, v in self.scored_treasure.items()},
            "treasure_track": self.treasure_track,
            "returned": {str(k): v for k, v in self.returned.items()},
            "direction": {str(k): v for k, v in self.direction.items()},
            "phase": self.phase,
            "log": list(self.log),
            "round_scores": {str(k): v for k, v in self.round_scores.items()},
        }

    def load_state(self, state):
        self.num_players = state["num_players"]
        self.max_rounds = state["max_rounds"]
        self.current_round = state["current_round"]
        self.oxygen = state["oxygen"]
        self.positions = {int(k): v for k, v in state["positions"].items()}
        self.carried_treasure = {int(k): v for k, v in state["carried_treasure"].items()}
        self.scored_treasure = {int(k): v for k, v in state["scored_treasure"].items()}
        self.treasure_track = state["treasure_track"]
        self.returned = {int(k): v for k, v in state["returned"].items()}
        self.direction = {int(k): v for k, v in state["direction"].items()}
        self.phase = state["phase"]
        self.log = list(state.get("log", []))
        self.round_scores = {int(k): v for k, v in state.get("round_scores", {}).items()}

    def get_tutorial(self):
        rounds = "2" if self.variation == "short" else "3"
        return (
            f"\n{'=' * 58}\n"
            f"  DEEP SEA ADVENTURE - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  Divers share a submarine and a limited oxygen supply (25).\n"
            f"  Dive down to collect treasure tokens at increasing depths.\n"
            f"  Return to the submarine before the oxygen runs out!\n"
            f"  Play {rounds} rounds. Highest total score wins.\n\n"
            f"  EACH TURN:\n"
            f"  1. Oxygen decreases by the number of treasures you carry.\n"
            f"  2. Roll two dice (1-3 each). Movement = roll - treasures carried.\n"
            f"  3. Choose to continue diving or turn back.\n"
            f"  4. At your new position, pick up, drop, or pass on treasure.\n\n"
            f"  TREASURE:\n"
            f"  24 tokens in 4 tiers of increasing value:\n"
            f"    Tier 1 (Shallow, pos 1-6):   0-3 points\n"
            f"    Tier 2 (Mid, pos 7-12):      3-6 points\n"
            f"    Tier 3 (Deep, pos 13-18):    6-9 points\n"
            f"    Tier 4 (Abyss, pos 19-24):   9-14 points\n\n"
            f"  OXYGEN:\n"
            f"  All divers share the same oxygen tank (starts at 25).\n"
            f"  Each treasure a diver carries costs 1 oxygen per turn.\n"
            f"  When oxygen hits 0, all remaining divers lose their treasure!\n\n"
            f"  SCORING:\n"
            f"  Only treasure brought back to the sub counts.\n"
            f"  Highest total after {rounds} rounds wins.\n\n"
            f"  COMMANDS:\n"
            f"  'dive'/'turn'   - Continue diving or turn back\n"
            f"  'pick'/'drop'   - Pick up or drop treasure\n"
            f"  'pass'          - Do nothing at current position\n"
            f"  'quit'          - Exit game\n"
            f"  'save'          - Save and suspend\n"
            f"  'help'          - Show help\n"
            f"  'tutorial'      - Show this tutorial\n"
            f"{'=' * 58}"
        )
