"""Zombie Dice - Push-your-luck dice game (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Dice colors and their face distributions
# Green: 3 brains, 1 shotgun, 2 runners
# Yellow: 2 brains, 2 shotguns, 2 runners
# Red: 1 brain, 3 shotguns, 2 runners
DICE_FACES = {
    "green": ["brain", "brain", "brain", "runner", "runner", "shotgun"],
    "yellow": ["brain", "brain", "runner", "runner", "shotgun", "shotgun"],
    "red": ["brain", "runner", "runner", "shotgun", "shotgun", "shotgun"],
}

# Standard cup: 6 green, 4 yellow, 3 red
STANDARD_CUP = (
    ["green"] * 6 + ["yellow"] * 4 + ["red"] * 3
)

# Double Feature special dice
DOUBLE_FEATURE_FACES = {
    "hunk": ["brain", "brain", "brain", "brain", "runner", "shotgun"],
    "hottie": ["brain", "brain", "brain", "brain", "runner", "shotgun"],
    "santa": ["brain", "brain", "double_brain", "runner", "shotgun", "shotgun"],
}

FACE_SYMBOLS = {
    "brain": "[B]",
    "shotgun": "[X]",
    "runner": "[R]",
    "double_brain": "[BB]",
}


class ZombieDiceGame(BaseGame):
    """Zombie Dice - Draw dice, roll for brains. Don't get shotgunned!"""

    name = "Zombie Dice"
    description = "Push-your-luck dice game - collect brains, avoid shotguns"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Zombie Dice (13 dice cup)",
        "double_feature": "Double Feature (adds special dice)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Cup: list of dice colors remaining to draw
        self.cup = []
        # Current hand: dice set aside as runners to re-roll
        self.runners_in_hand = []  # list of dice colors
        # Brains collected this turn
        self.turn_brains = 0
        # Shotguns this turn
        self.turn_shotguns = 0
        # Total score per player
        self.scores = {1: 0, 2: 0}
        # Current roll results: list of (color, face)
        self.current_roll = []
        # Phase: draw_roll, decide, bust, turn_over
        self.phase = "draw_roll"
        self.log = []
        self.brains_to_win = 13
        # Final round tracking (once someone hits 13, other player gets one more turn)
        self.final_round = False
        self.final_round_player = None

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 12:
            self.log = self.log[-12:]

    def _opponent(self):
        return 2 if self.current_player == 1 else 1

    def _refill_cup(self):
        """Create a fresh cup of dice."""
        if self.variation == "double_feature":
            cup = list(STANDARD_CUP) + ["hunk", "hottie", "santa"]
        else:
            cup = list(STANDARD_CUP)
        random.shuffle(cup)
        return cup

    def _roll_die(self, color):
        """Roll a single die and return the face."""
        if color in DICE_FACES:
            return random.choice(DICE_FACES[color])
        elif color in DOUBLE_FEATURE_FACES:
            return random.choice(DOUBLE_FEATURE_FACES[color])
        return "brain"

    def _draw_dice(self, count):
        """Draw dice from cup, refilling if needed. Returns list of colors."""
        drawn = []
        for _ in range(count):
            if not self.cup:
                # Refill cup (minus dice currently in hand as runners)
                self.cup = self._refill_cup()
                # Remove runner colors from cup to avoid duplicates
                for rc in self.runners_in_hand:
                    if rc in self.cup:
                        self.cup.remove(rc)
                if not self.cup:
                    break
            drawn.append(self.cup.pop())
        return drawn

    # ------------------------------------------------------------------ setup
    def setup(self):
        self.cup = self._refill_cup()
        self.runners_in_hand = []
        self.turn_brains = 0
        self.turn_shotguns = 0
        self.scores = {1: 0, 2: 0}
        self.current_roll = []
        self.phase = "draw_roll"
        self.log = []
        self.brains_to_win = 13
        self.final_round = False
        self.final_round_player = None
        self.game_over = False
        self.winner = None
        self.turn_number = 0
        self.current_player = 1

    def _start_turn(self):
        """Reset for a new turn."""
        self.cup = self._refill_cup()
        self.runners_in_hand = []
        self.turn_brains = 0
        self.turn_shotguns = 0
        self.current_roll = []
        self.phase = "draw_roll"

    # ---------------------------------------------------------------- display
    def display(self):
        cp = self.current_player
        opp = self._opponent()
        mode = "Double Feature" if self.variation == "double_feature" else "Standard"

        print(f"\n{'=' * 58}")
        print(f"  ZOMBIE DICE  ({mode})  -  Turn {self.turn_number + 1}")
        print(f"{'=' * 58}")

        # Scores
        print(f"\n  Scoreboard:")
        for p in (1, 2):
            marker = " <--" if p == cp else ""
            print(f"    {self.players[p - 1]}: {self.scores[p]} brains{marker}")
        print(f"    First to {self.brains_to_win} brains wins!")

        if self.final_round:
            print(f"    *** FINAL ROUND ***")

        # Current turn info
        print(f"\n  {self.players[cp - 1]}'s Turn:")
        print(f"    Brains collected : {self.turn_brains} {FACE_SYMBOLS['brain']}")
        print(f"    Shotguns taken   : {self.turn_shotguns}/3 {FACE_SYMBOLS['shotgun']}")
        print(f"    Dice in cup      : {len(self.cup)}")
        print(f"    Runners in hand  : {len(self.runners_in_hand)}")
        if self.runners_in_hand:
            runner_str = ", ".join(self.runners_in_hand)
            print(f"      ({runner_str})")

        # Current roll
        if self.current_roll:
            print(f"\n  Last Roll:")
            for color, face in self.current_roll:
                symbol = FACE_SYMBOLS.get(face, face)
                color_tag = color.upper()
                print(f"    {color_tag:8s} die: {symbol} {face}")

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

        if self.phase == "draw_roll":
            print(f"  {self.players[cp - 1]}, type 'roll' to draw and roll 3 dice.")
            while True:
                move = input_with_quit("  > ").strip().lower()
                if move == "roll":
                    return "roll"
                print("  Type 'roll'.")

        elif self.phase == "decide":
            print(f"  'roll' to push your luck, or 'stop' to bank {self.turn_brains} brains.")
            while True:
                move = input_with_quit("  > ").strip().lower()
                if move in ("roll", "stop"):
                    return move
                print("  Type 'roll' or 'stop'.")

        elif self.phase == "bust":
            input_with_quit("  BUSTED! 3 shotguns! Press Enter... ")
            return "bust"

        elif self.phase == "turn_over":
            return "end_turn"

        return None

    # -------------------------------------------------------------- make_move
    def make_move(self, move):
        cp = self.current_player

        if move == "roll":
            return self._do_roll(cp)
        elif move == "stop":
            return self._do_stop(cp)
        elif move == "bust":
            return self._do_bust(cp)
        elif move == "end_turn":
            self._start_turn()
            return True

        return False

    def _do_roll(self, cp):
        """Draw dice to fill hand to 3, then roll all."""
        # Need 3 dice total: runners carry over
        need = 3 - len(self.runners_in_hand)
        if need > 0:
            drawn = self._draw_dice(need)
            all_dice = self.runners_in_hand + drawn
        else:
            all_dice = self.runners_in_hand[:3]

        self.runners_in_hand = []
        self.current_roll = []

        # Roll each die
        new_brains = 0
        new_shotguns = 0
        new_runners = []

        for color in all_dice:
            face = self._roll_die(color)
            self.current_roll.append((color, face))

            if face == "brain":
                new_brains += 1
            elif face == "double_brain":
                new_brains += 2
            elif face == "shotgun":
                new_shotguns += 1
            elif face == "runner":
                new_runners.append(color)

        self.turn_brains += new_brains
        self.turn_shotguns += new_shotguns
        self.runners_in_hand = new_runners

        roll_desc = ", ".join(f"{c}={f}" for c, f in self.current_roll)
        self._add_log(f"Rolled: {roll_desc}")
        self._add_log(f"  Turn total: {self.turn_brains}B, {self.turn_shotguns}X")

        # Check for bust
        if self.turn_shotguns >= 3:
            self.phase = "bust"
        else:
            self.phase = "decide"

        # Stay on same player
        self.current_player = cp
        return True

    def _do_stop(self, cp):
        """Bank brains and end turn."""
        self.scores[cp] += self.turn_brains
        self._add_log(
            f"{self.players[cp - 1]} banks {self.turn_brains} brains! "
            f"Total: {self.scores[cp]}"
        )

        # Check if this triggers final round
        if self.scores[cp] >= self.brains_to_win and not self.final_round:
            self.final_round = True
            self.final_round_player = cp
            self._add_log(f"*** {self.players[cp - 1]} hit {self.brains_to_win}! Final round! ***")

        self._start_turn()
        return True

    def _do_bust(self, cp):
        """Lose all brains from this turn."""
        self._add_log(
            f"{self.players[cp - 1]} BUSTED with {self.turn_shotguns} shotguns! "
            f"Lost {self.turn_brains} brains."
        )
        self._start_turn()
        return True

    # -------------------------------------------------------- switch_player
    def switch_player(self):
        if self.phase in ("decide", "bust", "draw_roll"):
            if self.phase == "decide" or self.phase == "draw_roll":
                # Only switch when turn is actually done (stop/bust)
                pass
            else:
                super().switch_player()
        else:
            super().switch_player()

    # -------------------------------------------------------- check_game_over
    def check_game_over(self):
        # Game ends when final round completes
        if self.final_round:
            # If we just switched to the player who triggered final round,
            # then the other player has had their turn
            opp = self._opponent()
            if self.current_player == self.final_round_player:
                # Other player just finished their turn
                if self.scores[1] > self.scores[2]:
                    self.winner = 1
                elif self.scores[2] > self.scores[1]:
                    self.winner = 2
                else:
                    self.winner = None
                self.game_over = True
                return

        # Also check if both have had a chance and someone is at 13+
        for p in (1, 2):
            if self.scores[p] >= self.brains_to_win and not self.final_round:
                self.final_round = True
                self.final_round_player = p

    # -------------------------------------------------------- save / load
    def get_state(self):
        return {
            "cup": list(self.cup),
            "runners_in_hand": list(self.runners_in_hand),
            "turn_brains": self.turn_brains,
            "turn_shotguns": self.turn_shotguns,
            "scores": {str(k): v for k, v in self.scores.items()},
            "current_roll": self.current_roll,
            "phase": self.phase,
            "log": list(self.log),
            "brains_to_win": self.brains_to_win,
            "final_round": self.final_round,
            "final_round_player": self.final_round_player,
        }

    def load_state(self, state):
        self.cup = list(state["cup"])
        self.runners_in_hand = list(state["runners_in_hand"])
        self.turn_brains = state["turn_brains"]
        self.turn_shotguns = state["turn_shotguns"]
        self.scores = {int(k): v for k, v in state["scores"].items()}
        self.current_roll = [tuple(r) if isinstance(r, list) else r
                            for r in state["current_roll"]]
        self.phase = state["phase"]
        self.log = list(state.get("log", []))
        self.brains_to_win = state.get("brains_to_win", 13)
        self.final_round = state.get("final_round", False)
        self.final_round_player = state.get("final_round_player", None)

    # ------------------------------------------------------------ tutorial
    def get_tutorial(self):
        extra = ""
        if self.variation == "double_feature":
            extra = (
                f"\n  DOUBLE FEATURE DICE:\n"
                f"  Three special dice are added to the cup:\n"
                f"  - Hunk: 4 brains, 1 runner, 1 shotgun (easy)\n"
                f"  - Hottie: 4 brains, 1 runner, 1 shotgun (easy)\n"
                f"  - Santa: 2 brains, 1 double-brain, 1 runner,\n"
                f"           2 shotguns (risky but rewarding)\n\n"
            )

        return (
            f"\n{'=' * 58}\n"
            f"  ZOMBIE DICE - Tutorial ({self.variation.title()})\n"
            f"{'=' * 58}\n\n"
            f"  OVERVIEW:\n"
            f"  You are a zombie hunting for brains! Draw dice\n"
            f"  from a cup, roll them, and collect brains. But\n"
            f"  watch out - 3 shotguns and you're busted!\n"
            f"  First to {self.brains_to_win} brains wins.\n\n"
            f"  THE DICE:\n"
            f"  Cup contains 13 dice in 3 colors:\n"
            f"    Green  (6): 3 brains, 2 runners, 1 shotgun\n"
            f"    Yellow (4): 2 brains, 2 runners, 2 shotguns\n"
            f"    Red    (3): 1 brain,  2 runners, 3 shotguns\n\n"
            f"  EACH TURN:\n"
            f"  1. Draw 3 dice from the cup and roll them.\n"
            f"  2. Set aside Brains [B] and Shotguns [X].\n"
            f"  3. Runners [R] stay in your hand for re-rolling.\n"
            f"  4. Choose: STOP and bank your brains, or ROLL\n"
            f"     again (draw new dice to replace brains/shotguns\n"
            f"     so you always roll 3).\n\n"
            f"  BUSTING:\n"
            f"  If you accumulate 3 shotguns during a turn,\n"
            f"  you BUST and lose all brains from that turn.\n\n"
            f"{extra}"
            f"  WINNING:\n"
            f"  When a player reaches {self.brains_to_win}+ brains, the\n"
            f"  other player gets one final turn. Highest score wins.\n\n"
            f"  STRATEGY:\n"
            f"  - Green dice are safest; red are most dangerous.\n"
            f"  - Track which dice remain in the cup.\n"
            f"  - With 2 shotguns, stopping is usually wise.\n"
            f"  - Runners are free re-rolls - keep their colors\n"
            f"    in mind (red runners are still dangerous).\n\n"
            f"  COMMANDS:\n"
            f"  'roll' - Draw and roll dice\n"
            f"  'stop' - Bank brains and end turn\n"
            f"  'quit' - Exit    'save' - Save game\n"
            f"  'help' - Help    'tutorial' - This tutorial\n"
            f"{'=' * 58}"
        )
