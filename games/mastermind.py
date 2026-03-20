"""Mastermind - A code-breaking deduction game."""

from engine.base import BaseGame, input_with_quit, clear_screen


# Variation configs: (code_length, colors, max_guesses, label)
VARIATION_CONFIG = {
    "standard": {
        "code_length": 4,
        "colors": ["R", "G", "B", "Y", "W", "O"],
        "max_guesses": 10,
        "label": "Standard",
    },
    "super": {
        "code_length": 5,
        "colors": ["R", "G", "B", "Y", "W", "O", "P", "C"],
        "max_guesses": 12,
        "label": "Super Mastermind",
    },
    "mini": {
        "code_length": 3,
        "colors": ["R", "G", "B", "Y"],
        "max_guesses": 6,
        "label": "Mini",
    },
}

COLOR_NAMES = {
    "R": "Red",
    "G": "Green",
    "B": "Blue",
    "Y": "Yellow",
    "W": "White",
    "O": "Orange",
    "P": "Purple",
    "C": "Cyan",
}


class MastermindGame(BaseGame):
    """Mastermind - a code-breaking deduction game."""

    name = "Mastermind"
    description = "Break the secret code using logic and deduction"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (4 pegs, 6 colors, 10 guesses)",
        "super": "Super Mastermind (5 pegs, 8 colors, 12 guesses)",
        "mini": "Mini (3 pegs, 4 colors, 6 guesses)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        config = VARIATION_CONFIG.get(self.variation, VARIATION_CONFIG["standard"])
        self.code_length = config["code_length"]
        self.colors = list(config["colors"])
        self.max_guesses = config["max_guesses"]
        self.label = config["label"]
        self.secret_code = []
        self.guesses = []
        self.feedback = []
        self.phase = "setup"  # "setup" or "guessing"

    # ------------------------------------------------------------------ setup
    def setup(self):
        """Codemaker enters the secret code, then screen is cleared."""
        self.secret_code = []
        self.guesses = []
        self.feedback = []
        self.phase = "setup"
        self.current_player = 1  # Player 1 is codemaker

        clear_screen()
        print(f"\n{'='*50}")
        print(f"  MASTERMIND ({self.label}) - Code Setup")
        print(f"{'='*50}")
        print(f"\n  {self.players[0]} (Codemaker): enter your secret code.")
        print(f"  Colors available: {' '.join(self.colors)}")
        print(f"  Code length: {self.code_length}")
        print(f"  (Duplicates are allowed)\n")

        while True:
            raw = input_with_quit(f"  Enter secret code (e.g., {''.join(self.colors[:self.code_length])}): ").strip().upper()
            code = list(raw)
            if len(code) != self.code_length:
                print(f"  Code must be exactly {self.code_length} characters long.")
                continue
            if not all(c in self.colors for c in code):
                print(f"  Invalid color(s). Use only: {' '.join(self.colors)}")
                continue
            self.secret_code = code
            break

        # Clear screen so the codebreaker cannot see the code
        clear_screen()
        print(f"\n  Secret code has been set!")
        print(f"  Hand the device to {self.players[1]} (Codebreaker).")
        input("  Press Enter when ready...")

        self.phase = "guessing"
        self.current_player = 2  # Player 2 is codebreaker

    # --------------------------------------------------------------- display
    def display(self):
        """Display game board with all previous guesses and feedback."""
        guess_num = len(self.guesses) + 1
        print(f"\n{'='*50}")
        print(f"  === Mastermind ({self.label}) ===")
        print(f"  Codemaker: {self.players[0]} | Codebreaker: {self.players[1]}")
        print(f"  Colors: {' '.join(self.colors)}")
        print(f"  Guess {guess_num} of {self.max_guesses}")
        print(f"{'='*50}\n")

        if not self.guesses:
            print("  No guesses yet.\n")
        else:
            for i, (guess, fb) in enumerate(zip(self.guesses, self.feedback), 1):
                exact, misplaced = fb
                # Build peg display
                pegs = []
                for _ in range(exact):
                    pegs.append("\u25cf")  # ● for exact
                for _ in range(misplaced):
                    pegs.append("\u25cb")  # ○ for misplaced
                remaining = self.code_length - exact - misplaced
                for _ in range(remaining):
                    pegs.append("\u00b7")  # · for no match
                peg_str = " ".join(pegs)
                guess_str = " ".join(guess)
                print(f"  {i:2d}: {guess_str}  -> {peg_str}   ({exact} exact, {misplaced} misplaced)")
            print()

        if self.game_over:
            print(f"  Secret code was: {' '.join(self.secret_code)}\n")

    # --------------------------------------------------------------- get_move
    def get_move(self):
        """Prompt codebreaker for a guess."""
        example = "".join(self.colors[:self.code_length])
        print(f"  Enter guess (e.g., {example}):")
        raw = input_with_quit(f"  {self.players[1]}'s guess: ").strip().upper()
        return raw

    # --------------------------------------------------------------- make_move
    def make_move(self, move):
        """Validate guess and compute feedback. Returns True if valid."""
        guess = list(move)

        # Validate length
        if len(guess) != self.code_length:
            print(f"  Guess must be exactly {self.code_length} characters long.")
            input("  Press Enter to try again...")
            return False

        # Validate colors
        if not all(c in self.colors for c in guess):
            print(f"  Invalid color(s). Use only: {' '.join(self.colors)}")
            input("  Press Enter to try again...")
            return False

        # Compute feedback
        exact, misplaced = self._compute_feedback(guess)

        self.guesses.append(guess)
        self.feedback.append((exact, misplaced))
        return True

    def _compute_feedback(self, guess):
        """Compute black (exact) and white (misplaced) peg counts."""
        exact = 0
        secret_remaining = []
        guess_remaining = []

        # First pass: find exact matches
        for i in range(self.code_length):
            if guess[i] == self.secret_code[i]:
                exact += 1
            else:
                secret_remaining.append(self.secret_code[i])
                guess_remaining.append(guess[i])

        # Second pass: find color matches (misplaced)
        misplaced = 0
        secret_pool = list(secret_remaining)
        for g in guess_remaining:
            if g in secret_pool:
                misplaced += 1
                secret_pool.remove(g)

        return exact, misplaced

    # --------------------------------------------------------- check_game_over
    def check_game_over(self):
        """Check if code was guessed or max guesses reached."""
        if not self.guesses:
            return

        last_exact, _ = self.feedback[-1]

        # Codebreaker guessed correctly
        if last_exact == self.code_length:
            self.game_over = True
            self.winner = 2  # Codebreaker wins
            return

        # Out of guesses
        if len(self.guesses) >= self.max_guesses:
            self.game_over = True
            self.winner = 1  # Codemaker wins
            return

    # ----------------------------------------------------------- state save/load
    def get_state(self):
        """Return serializable game state for saving."""
        return {
            "secret_code": list(self.secret_code),
            "guesses": [list(g) for g in self.guesses],
            "feedback": list(self.feedback),
            "max_guesses": self.max_guesses,
            "code_length": self.code_length,
            "colors": list(self.colors),
            "label": self.label,
            "phase": self.phase,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.secret_code = list(state["secret_code"])
        self.guesses = [list(g) for g in state["guesses"]]
        self.feedback = [tuple(f) for f in state["feedback"]]
        self.max_guesses = state["max_guesses"]
        self.code_length = state["code_length"]
        self.colors = list(state["colors"])
        self.label = state.get("label", "Standard")
        self.phase = state.get("phase", "guessing")

    # -------------------------------------------------------------- tutorial
    def get_tutorial(self):
        """Return comprehensive tutorial for Mastermind."""
        color_list = ", ".join(f"{c} ({COLOR_NAMES[c]})" for c in self.colors)
        return f"""
{'='*60}
  MASTERMIND - Tutorial
{'='*60}

  OVERVIEW:
  Mastermind is a code-breaking game for two players.
  One player (the Codemaker) creates a secret code, and
  the other player (the Codebreaker) tries to deduce it
  through a series of guesses and feedback.

  ROLES:
  - Player 1 is the Codemaker. They set the secret code
    at the start of the game.
  - Player 2 is the Codebreaker. They attempt to guess
    the code within the allowed number of guesses.

  CURRENT VARIATION: {self.label}
  - Code length: {self.code_length} pegs
  - Available colors: {color_list}
  - Maximum guesses: {self.max_guesses}
  - Duplicate colors ARE allowed in the code.

  HOW TO PLAY:
  1. The Codemaker enters a secret code of {self.code_length} colors.
     The screen is cleared so the Codebreaker cannot see it.
  2. The Codebreaker enters guesses one at a time.
     Type the color letters together (e.g., {''.join(self.colors[:self.code_length])}).
  3. After each guess, feedback is displayed:
     \u25cf (black peg) = correct color in the correct position
     \u25cb (white peg) = correct color but in the wrong position
     \u00b7 (dot)       = no match for this peg
  4. The Codebreaker uses the feedback to refine their
     next guess.

  WINNING:
  - The Codebreaker wins by guessing the exact code
    within {self.max_guesses} guesses.
  - The Codemaker wins if the Codebreaker fails to crack
    the code in {self.max_guesses} guesses.

  STRATEGY TIPS FOR THE CODEBREAKER:
  - Start with a guess that uses several different colors
    to gather maximum information.
  - Pay close attention to exact vs misplaced counts.
    Exact matches tell you both color and position;
    misplaced matches confirm a color but rule out its
    current position.
  - Use process of elimination. If a color gets no
    feedback at all across multiple guesses, it is
    likely not in the code.
  - Try changing one peg at a time to isolate which
    positions are correct.

  STRATEGY TIPS FOR THE CODEMAKER:
  - Using duplicate colors can make the code harder
    to crack, as it complicates the Codebreaker's
    deduction.
  - Avoid overly simple patterns (e.g., all one color
    or a rainbow sequence) as experienced players will
    try those early.

  EXAMPLE ROUND:
  Secret code: R G B Y
  Guess 1: R B G O  -> \u25cf \u25cb \u25cb \u00b7  (1 exact, 2 misplaced)
    R is exact (right color, right position).
    B and G are in the code but in wrong positions.
    O is not in the code at all.

  COMMANDS:
  'quit' / 'q'     - Quit game
  'save' / 's'     - Save and suspend game
  'help' / 'h'     - Show help
  'tutorial' / 't' - Show this tutorial
{'='*60}
"""
