"""No Thanks! - Card game of risk and reward."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


def _render_card(value, chips_on_card):
    """Render a card with its chip count as ASCII art."""
    v_str = str(value).center(5)
    c_str = f"{chips_on_card}ch".center(5)
    lines = [
        "+-------+",
        f"|{v_str}  |",
        "|       |",
        f"|  {c_str}|",
        "+-------+",
    ]
    return "\n".join(lines)


def _calculate_score(cards, chips):
    """Calculate a player's score: sum of card values (with runs collapsed) minus chips.

    Consecutive cards only count the lowest value in the run.
    E.g., holding 20, 21, 22 scores only 20.
    """
    if not cards:
        return -chips
    sorted_cards = sorted(cards)
    total = 0
    i = 0
    while i < len(sorted_cards):
        run_start = sorted_cards[i]
        # Walk consecutive cards
        while i + 1 < len(sorted_cards) and sorted_cards[i + 1] == sorted_cards[i] + 1:
            i += 1
        total += run_start
        i += 1
    return total - chips


def _format_cards(cards):
    """Format a list of cards showing runs highlighted."""
    if not cards:
        return "(none)"
    sorted_cards = sorted(cards)
    parts = []
    i = 0
    while i < len(sorted_cards):
        run = [sorted_cards[i]]
        while i + 1 < len(sorted_cards) and sorted_cards[i + 1] == sorted_cards[i] + 1:
            i += 1
            run.append(sorted_cards[i])
        if len(run) >= 2:
            parts.append(f"[{run[0]}-{run[-1]}]")
        else:
            parts.append(str(run[0]))
        i += 1
    return " ".join(parts)


class NoThanksGame(BaseGame):
    """No Thanks! card game adapted for 2 players."""

    name = "No Thanks!"
    description = "Card game of risk and reward -- pay chips or take cards"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard (cards 3-35, remove 9)",
        "short": "Short Game (cards 3-25, remove 5)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.hands = {1: [], 2: []}
        self.chips = {1: 0, 2: 0}
        self.current_card = None
        self.chips_on_card = 0
        self.cards_remaining = 0
        self.turn_message = ""

    def setup(self):
        """Initialize game state based on variation."""
        if self.variation == "short":
            all_cards = list(range(3, 26))  # 3-25
            remove_count = 5
            starting_chips = 11
        else:
            all_cards = list(range(3, 36))  # 3-35
            remove_count = 9
            starting_chips = 11

        random.shuffle(all_cards)
        # Remove cards face-down (unknown to players)
        self.deck = all_cards[remove_count:]
        random.shuffle(self.deck)

        self.hands = {1: [], 2: []}
        self.chips = {1: starting_chips, 2: starting_chips}
        self.current_card = self.deck.pop()
        self.chips_on_card = 0
        self.cards_remaining = len(self.deck)
        self.turn_message = ""
        self.game_over = False
        self.winner = None
        self.current_player = 1

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def display(self):
        """Show the full game state."""
        print(f"\n{'=' * 56}")
        variant_label = self.variations.get(self.variation, "No Thanks!")
        print(f"  NO THANKS!  -  {variant_label}")
        print(f"{'=' * 56}\n")

        # Show both players' info
        for p in (1, 2):
            marker = " <<" if p == self.current_player else ""
            score = _calculate_score(self.hands[p], self.chips[p])
            cards_str = _format_cards(self.hands[p])
            print(f"  {self.players[p - 1]}: {self.chips[p]} chips | Score: {score}{marker}")
            print(f"    Cards: {cards_str}")
        print()

        # Show current card
        if self.current_card is not None:
            print(f"  Cards remaining in deck: {self.cards_remaining}")
            print()
            print(f"  Current card:")
            for line in _render_card(self.current_card, self.chips_on_card).split("\n"):
                print(f"    {line}")
            print()

        if self.turn_message:
            print(f"  >>> {self.turn_message}")
            print()

    # ------------------------------------------------------------------ #
    #  Move handling
    # ------------------------------------------------------------------ #

    def get_move(self):
        """Get the player's action: take or pass."""
        player_name = self.players[self.current_player - 1]
        can_pass = self.chips[self.current_player] > 0

        while True:
            if can_pass:
                prompt = f"{player_name}, 'take' the card or 'pass' (pay 1 chip): "
            else:
                prompt = f"{player_name}, you have no chips -- you must 'take': "

            raw = input_with_quit(prompt).strip().lower()
            if not raw:
                continue

            if raw in ('take', 'k'):
                return 'take'
            elif raw in ('pass', 'p') and can_pass:
                return 'pass'
            elif raw in ('pass', 'p') and not can_pass:
                print("  You have no chips! You must take the card.")
            else:
                if can_pass:
                    print("  Commands: 'take' (or 'k'), 'pass' (or 'p')")
                else:
                    print("  Commands: 'take' (or 'k')")

    def make_move(self, move):
        """Apply a move (take or pass)."""
        player_name = self.players[self.current_player - 1]

        if move == 'take':
            # Player takes the card and all chips on it
            self.hands[self.current_player].append(self.current_card)
            self.chips[self.current_player] += self.chips_on_card
            self.turn_message = (
                f"{player_name} takes card {self.current_card} "
                f"(+{self.chips_on_card} chips)"
            )
            self.chips_on_card = 0

            # Draw next card
            if self.deck:
                self.current_card = self.deck.pop()
                self.cards_remaining = len(self.deck)
            else:
                self.current_card = None
                self.cards_remaining = 0

            return True

        elif move == 'pass':
            if self.chips[self.current_player] <= 0:
                return False
            # Pay 1 chip onto the card
            self.chips[self.current_player] -= 1
            self.chips_on_card += 1
            self.turn_message = (
                f"{player_name} passes (pays 1 chip, "
                f"{self.chips_on_card} chips now on card)"
            )
            return True

        return False

    # ------------------------------------------------------------------ #
    #  Game over
    # ------------------------------------------------------------------ #

    def check_game_over(self):
        """Check if all cards have been taken."""
        if self.current_card is None:
            self.game_over = True
            score1 = _calculate_score(self.hands[1], self.chips[1])
            score2 = _calculate_score(self.hands[2], self.chips[2])
            if score1 < score2:
                self.winner = 1
            elif score2 < score1:
                self.winner = 2
            else:
                self.winner = None  # draw

    def switch_player(self):
        """Switch player and reset turn state."""
        super().switch_player()
        self.turn_message = ""

    # ------------------------------------------------------------------ #
    #  Save / Load
    # ------------------------------------------------------------------ #

    def get_state(self):
        """Return serializable game state."""
        return {
            'deck': self.deck,
            'hands': {str(k): v for k, v in self.hands.items()},
            'chips': {str(k): v for k, v in self.chips.items()},
            'current_card': self.current_card,
            'chips_on_card': self.chips_on_card,
            'cards_remaining': self.cards_remaining,
            'turn_message': self.turn_message,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.deck = state['deck']
        self.hands = {int(k): v for k, v in state['hands'].items()}
        self.chips = {int(k): v for k, v in state['chips'].items()}
        self.current_card = state['current_card']
        self.chips_on_card = state['chips_on_card']
        self.cards_remaining = state['cards_remaining']
        self.turn_message = state.get('turn_message', '')

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        """Return tutorial text for No Thanks!"""
        txt = """
==================================================
  NO THANKS! TUTORIAL
==================================================

OVERVIEW:
  No Thanks! is a card game where players try to
  AVOID taking cards. Each card is worth its face
  value in points, and the LOWEST score wins.

  You can avoid taking a card by paying a chip,
  but chips are limited! Each chip you keep at
  the end subtracts 1 from your score.

HOW TO PLAY:
  - Cards numbered 3-35 are shuffled and 9 are
    removed face-down (unknown to all players).
  - Each player starts with 11 chips.
  - Each turn, a card is flipped face-up.
  - You must either:
    TAKE the card (and all chips placed on it)
    PASS by placing 1 of your chips on the card.
  - If you have no chips, you MUST take the card.

SCORING:
  - Each card is worth its face value in points.
  - RUNS of consecutive cards only count the
    lowest! (e.g., 20 + 21 + 22 = only 20 points)
  - Each remaining chip subtracts 1 point.
  - LOWEST total score wins!

STRATEGY TIPS:
  - Runs are powerful! Taking 21 when you have 20
    costs you nothing extra.
  - Chips on a card offset its cost -- a card with
    many chips might be worth taking.
  - Track which cards have been removed -- they
    can break potential runs.
"""
        if self.variation == "short":
            txt += """
SHORT VARIATION:
  - Cards 3-25 (instead of 3-35).
  - Only 5 cards removed face-down.
  - Faster game with tighter decisions.
"""
        txt += """
COMMANDS:
  take / k     - Take the current card
  pass / p     - Pay 1 chip to pass

  quit / q     - Quit the game
  save / s     - Save and suspend
  help / h     - Show help
  tutorial / t - Show this tutorial
==================================================
"""
        return txt
