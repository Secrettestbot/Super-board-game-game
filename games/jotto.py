"""Jotto - Word guessing deduction game.

Each player picks a secret word, then takes turns guessing. After each guess,
told how many letters match the secret word. First to guess opponent's word wins.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Word lists by length
WORDS_5 = [
    "apple", "brain", "chair", "delta", "flame", "grape", "house", "ivory",
    "juice", "knife", "lemon", "mango", "nerve", "ocean", "piano", "queen",
    "river", "stone", "tiger", "ultra", "voice", "whale", "yield", "zebra",
    "blaze", "crane", "drift", "earth", "frost", "globe", "haste", "index",
    "joker", "kneel", "labor", "maple", "noble", "orbit", "plumb", "quest",
    "reign", "sworn", "trace", "union", "vigor", "waste", "xenon", "youth",
    "zones", "brave", "cloud", "dream", "eagle", "forge", "grain", "hover",
    "inner", "jewel", "karma", "laser", "metal", "night", "olive", "power",
    "quilt", "raise", "shelf", "tower", "urban", "valve", "winds", "oxide",
]

WORDS_4 = [
    "able", "bare", "calm", "dare", "each", "face", "gain", "half", "iron",
    "joke", "keen", "lame", "mast", "nail", "opal", "pace", "quiz", "rain",
    "safe", "tame", "upon", "vase", "wade", "yawn", "zeal", "bark", "cave",
    "daze", "earn", "fawn", "gaze", "haze", "isle", "jade", "kite", "lake",
    "maze", "nest", "oath", "palm", "raft", "sage", "tale", "unit", "veil",
    "wane", "yard", "zinc", "bond", "core", "dome", "echo", "fern", "glow",
]

WORDS_6 = [
    "absurd", "bright", "candle", "donkey", "engine", "fabric", "garden",
    "hammer", "insect", "jigsaw", "kitten", "lament", "mingle", "narrow",
    "orange", "palace", "quiver", "remark", "silver", "trophy", "unique",
    "velvet", "wander", "yogurt", "zenith", "basket", "closet", "dimple",
    "effort", "fright", "gravel", "hustle", "ignore", "jersey", "kennel",
    "listen", "market", "nickel", "octave", "planet", "quarry", "rustic",
    "sponge", "tumble", "unfold", "volume", "winter", "oxygen", "zephyr",
]


def count_matching_letters(secret, guess):
    """Count how many letters in guess appear in secret (multiset intersection)."""
    secret_counts = {}
    for ch in secret:
        secret_counts[ch] = secret_counts.get(ch, 0) + 1
    guess_counts = {}
    for ch in guess:
        guess_counts[ch] = guess_counts.get(ch, 0) + 1
    matches = 0
    for ch, cnt in guess_counts.items():
        matches += min(cnt, secret_counts.get(ch, 0))
    return matches


class JottoGame(BaseGame):
    """Jotto - Word guessing deduction game."""

    name = "Jotto"
    description = "Word guessing deduction game - guess your opponent's secret word"
    min_players = 2
    max_players = 2
    variations = {
        "five": "5-Letter Words",
        "four": "4-Letter Words",
        "six": "6-Letter Words",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        if self.variation == "four":
            self.word_length = 4
            self.word_pool = WORDS_4
        elif self.variation == "six":
            self.word_length = 6
            self.word_pool = WORDS_6
        else:
            self.word_length = 5
            self.word_pool = WORDS_5
        self.secret_words = {}
        self.guesses = {}  # player -> list of (guess, match_count)
        self.log = []

    def setup(self):
        # AI (player 2) picks a random word
        ai_word = random.choice(self.word_pool)
        self.secret_words = {"1": None, "2": ai_word}
        self.guesses = {"1": [], "2": []}
        self.log = ["Game started! Player 1, choose your secret word."]
        self.current_player = 1

    def _ai_pick_guess(self):
        """AI picks a guess based on previous feedback."""
        sp = "2"
        prev = self.guesses[sp]
        candidates = list(self.word_pool)
        # Filter candidates based on previous guesses
        for guess, match_count in prev:
            candidates = [w for w in candidates if count_matching_letters(w, guess) == match_count]
        if not candidates:
            candidates = list(self.word_pool)
        # Avoid guessing same word twice
        already_guessed = {g for g, _ in prev}
        remaining = [w for w in candidates if w not in already_guessed]
        if not remaining:
            remaining = [w for w in self.word_pool if w not in already_guessed]
        if not remaining:
            remaining = list(self.word_pool)
        return random.choice(remaining)

    def display(self):
        clear_screen()
        print(f"{'=' * 55}")
        print(f"  JOTTO - {self.word_length}-Letter Words")
        print(f"{'=' * 55}")

        if self.secret_words["1"] is None:
            print(f"\n  {self.players[0]}, choose your secret {self.word_length}-letter word.\n")
            return

        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            print(f"\n  {self.players[p-1]}{marker}")
            print(f"  Guesses made: {len(self.guesses[sp])}")
            if self.guesses[sp]:
                print(f"  {'Guess':<{self.word_length+2}} Matches")
                print(f"  {'-'*(self.word_length+10)}")
                for guess, match_count in self.guesses[sp]:
                    exact = " ** JOTTO! **" if match_count == self.word_length else ""
                    print(f"  {guess:<{self.word_length+2}} {match_count}{exact}")
        print()
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        # Phase: player 1 picks secret word
        if self.secret_words["1"] is None:
            print(f"  Valid words are {self.word_length} letters long.")
            word = input_with_quit(f"  Enter your secret word: ").strip().lower()
            return {"action": "set_secret", "word": word}

        # Guessing phase
        if cp == 2:
            # AI turn
            guess = self._ai_pick_guess()
            print(f"  {self.players[1]} guesses: {guess}")
            input_with_quit("  Press Enter to continue...")
            return {"action": "guess", "word": guess}

        print(f"  {self.players[cp-1]}, guess your opponent's word.")
        print(f"  (Must be {self.word_length} letters)")
        guess = input_with_quit("  Your guess: ").strip().lower()
        return {"action": "guess", "word": guess}

    def make_move(self, move):
        if move is None:
            return False
        action = move.get("action")
        cp = self.current_player
        sp = str(cp)

        if action == "set_secret":
            word = move["word"]
            if len(word) != self.word_length:
                return False
            if not word.isalpha():
                return False
            self.secret_words["1"] = word
            self.log.append(f"{self.players[0]} has chosen a secret word.")
            return True

        if action == "guess":
            word = move["word"]
            if len(word) != self.word_length:
                return False
            if not word.isalpha():
                return False
            # Determine which player's secret we're checking against
            target_player = "2" if sp == "1" else "1"
            secret = self.secret_words[target_player]
            matches = count_matching_letters(secret, word)
            self.guesses[sp].append((word, matches))
            if matches == self.word_length and word == secret:
                self.log.append(f"{self.players[cp-1]} guessed '{word}' - JOTTO! All {matches} letters match!")
            else:
                self.log.append(f"{self.players[cp-1]} guessed '{word}' - {matches} matching letters")
            return True

        return False

    def check_game_over(self):
        for p in [1, 2]:
            sp = str(p)
            if self.guesses[sp]:
                last_guess, last_match = self.guesses[sp][-1]
                target = "2" if sp == "1" else "1"
                if last_guess == self.secret_words[target]:
                    self.game_over = True
                    self.winner = p
                    return
        # Also check if too many rounds (draw after 20 guesses each)
        if len(self.guesses["1"]) >= 20 and len(self.guesses["2"]) >= 20:
            self.game_over = True
            self.winner = None

    def get_state(self):
        return {
            "secret_words": self.secret_words,
            "guesses": self.guesses,
            "log": self.log,
            "word_length": self.word_length,
        }

    def load_state(self, state):
        self.secret_words = state["secret_words"]
        self.guesses = state["guesses"]
        self.log = state.get("log", [])
        self.word_length = state.get("word_length", 5)

    def get_tutorial(self):
        return f"""
============================================================
  JOTTO - Tutorial
============================================================

  OVERVIEW:
  Jotto is a word deduction game for 2 players. Each player
  chooses a secret {self.word_length}-letter word. Players take turns
  guessing each other's word.

  GAMEPLAY:
  1. Each player picks a secret {self.word_length}-letter word
  2. Take turns guessing your opponent's word
  3. After each guess, you learn how many letters match
     (count of shared letters, not position)
  4. Use deduction to narrow down the word

  MATCHING:
  - "apple" vs "plead" = 3 matches (a, p, l)
  - Letters counted by frequency (min of each letter)
  - Exact word match = JOTTO! You win!

  WINNING:
  - First player to guess the opponent's exact word wins
  - After 20 guesses each with no winner, it's a draw
============================================================
"""
