"""The Mind - Cooperative card game.

Players must play numbered cards in ascending order without communicating.
Synchronize your minds to play cards at the right moment!
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class TheMindGame(BaseGame):
    """The Mind - Cooperative synchronization card game."""

    name = "The Mind"
    description = "Play numbered cards in ascending order without communicating"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "extreme": "Extreme Mode (with directions)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.level = 1
        self.max_level = 8
        self.lives = 0
        self.throwing_stars = 0
        self.hands = {}
        self.played_cards = []
        self.deck = []
        self.phase = "play"  # play, level_complete, use_star
        self.extreme_direction = "ascending"  # ascending or descending (extreme mode)
        self.log = []

    def setup(self):
        self.level = 1
        self.lives = 3 if self.variation == "standard" else 2
        self.throwing_stars = 1
        self.hands = {"1": [], "2": []}
        self.played_cards = []
        self.phase = "play"
        self.extreme_direction = "ascending"
        self.log = ["Level 1 begins! Play cards in ascending order."]
        self._deal_level()

    def _deal_level(self):
        """Deal cards for the current level."""
        self.deck = list(range(1, 101))
        random.shuffle(self.deck)
        self.played_cards = []
        self.hands = {"1": [], "2": []}
        for _ in range(self.level):
            self.hands["1"].append(self.deck.pop())
            self.hands["2"].append(self.deck.pop())
        self.hands["1"].sort()
        self.hands["2"].sort()
        if self.variation == "extreme":
            self.extreme_direction = random.choice(["ascending", "descending"])
            self.log.append(f"Direction: {self.extreme_direction.upper()}!")

    def _get_lowest_unplayed(self):
        """Get the lowest card that should be played next."""
        all_cards = sorted(self.hands["1"] + self.hands["2"])
        if self.extreme_direction == "descending":
            all_cards = sorted(all_cards, reverse=True)
        return all_cards[0] if all_cards else None

    def _check_valid_play(self, card, player_sp):
        """Check if playing this card causes a life loss."""
        other_sp = "2" if player_sp == "1" else "1"
        if self.extreme_direction == "ascending":
            # Any card in opponent's hand lower than this = lost life
            lower = [c for c in self.hands[other_sp] if c < card]
            return len(lower) == 0, lower
        else:
            higher = [c for c in self.hands[other_sp] if c > card]
            return len(higher) == 0, higher

    def display(self):
        clear_screen()
        mode = "Extreme" if self.variation == "extreme" else "Standard"
        print(f"{'=' * 55}")
        print(f"  THE MIND - {mode} | Level {self.level}/{self.max_level}")
        print(f"{'=' * 55}")
        print(f"  Lives: {'<3 ' * self.lives}  Throwing Stars: {'* ' * self.throwing_stars}")
        if self.variation == "extreme":
            arrow = ">>>" if self.extreme_direction == "ascending" else "<<<"
            print(f"  Direction: {self.extreme_direction.upper()} {arrow}")
        print()

        # Played cards
        if self.played_cards:
            cards_str = " ".join(f"[{c}]" for c in self.played_cards[-10:])
            print(f"  Played: {cards_str}")
        else:
            print("  Played: (none)")
        print()

        for p in [1, 2]:
            sp = str(p)
            n_cards = len(self.hands[sp])
            marker = " <<" if p == self.current_player else ""
            if p == self.current_player:
                hand_str = " ".join(f"[{c}]" for c in sorted(self.hands[sp]))
                print(f"  {self.players[p-1]}: {hand_str}{marker}")
            else:
                print(f"  {self.players[p-1]}: [{n_cards} cards hidden]{marker}")
        print()

        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = str(self.current_player)

        if self.phase == "use_star":
            choice = input_with_quit("  Use a throwing star? All show lowest card (y/n): ").strip().lower()
            return {"action": "star_decision", "use": choice == "y"}

        hand = sorted(self.hands[cp])
        if not hand:
            return {"action": "pass_turn"}

        print(f"  Your cards: {' '.join(f'[{c}]' for c in hand)}")
        if self.throwing_stars > 0:
            print("  Commands: play a card number, or 'star' to propose throwing star")

        choice = input_with_quit("  Play card: ").strip().lower()
        if choice == "star" and self.throwing_stars > 0:
            return {"action": "use_star"}
        try:
            card = int(choice)
            if card in self.hands[cp]:
                return {"action": "play", "card": card}
        except ValueError:
            pass
        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = str(self.current_player)
        action = move.get("action")

        if action == "pass_turn":
            return True

        if action == "use_star":
            self.phase = "use_star"
            return True

        if action == "star_decision":
            if move["use"] and self.throwing_stars > 0:
                self.throwing_stars -= 1
                # Both players discard their lowest (or highest in descending)
                for sp in ["1", "2"]:
                    if self.hands[sp]:
                        if self.extreme_direction == "ascending":
                            lowest = min(self.hands[sp])
                        else:
                            lowest = max(self.hands[sp])
                        self.hands[sp].remove(lowest)
                        self.played_cards.append(lowest)
                self.played_cards.sort()
                self.log.append("Throwing star used! Both discarded their extreme card.")
            self.phase = "play"
            return True

        if action == "play":
            card = move["card"]
            if card not in self.hands[cp]:
                return False

            valid, penalty_cards = self._check_valid_play(card, cp)
            self.hands[cp].remove(card)
            self.played_cards.append(card)

            if not valid:
                # Lost cards between played and actual lowest
                for pc in penalty_cards:
                    other_sp = "2" if cp == "1" else "1"
                    if pc in self.hands[other_sp]:
                        self.hands[other_sp].remove(pc)
                        self.played_cards.append(pc)
                self.played_cards.sort()
                self.lives -= 1
                lost_str = ", ".join(str(c) for c in penalty_cards)
                self.log.append(
                    f"Wrong! {self.players[self.current_player-1]} played {card} "
                    f"but {lost_str} was lower. Lost a life! ({self.lives} left)"
                )
            else:
                self.log.append(f"{self.players[self.current_player-1]} played {card}. Safe!")

            # Check if level complete
            if not self.hands["1"] and not self.hands["2"]:
                self.phase = "level_complete"
                self.level += 1
                if self.level <= self.max_level:
                    # Bonus: gain star every 3 levels, gain life at level 5
                    if (self.level - 1) % 3 == 0:
                        self.throwing_stars = min(self.throwing_stars + 1, 3)
                    if self.level == 5:
                        self.lives = min(self.lives + 1, 5)
                    self.log.append(f"Level {self.level - 1} complete! Starting level {self.level}.")
                    self._deal_level()
                    self.phase = "play"
            return True

        return False

    def check_game_over(self):
        if self.lives <= 0:
            self.game_over = True
            self.winner = None
            self.log.append(f"Game over! Reached level {self.level}.")
        elif self.level > self.max_level:
            self.game_over = True
            self.winner = 1  # Both win (cooperative)
            self.log.append("You won! All levels completed!")

    def get_state(self):
        return {
            "level": self.level,
            "lives": self.lives,
            "throwing_stars": self.throwing_stars,
            "hands": {k: list(v) for k, v in self.hands.items()},
            "played_cards": list(self.played_cards),
            "phase": self.phase,
            "extreme_direction": self.extreme_direction,
            "log": self.log,
        }

    def load_state(self, state):
        self.level = state["level"]
        self.lives = state["lives"]
        self.throwing_stars = state["throwing_stars"]
        self.hands = state["hands"]
        self.played_cards = state["played_cards"]
        self.phase = state.get("phase", "play")
        self.extreme_direction = state.get("extreme_direction", "ascending")
        self.log = state.get("log", [])

    def get_tutorial(self):
        return """
============================================================
  THE MIND - Tutorial
============================================================

  OVERVIEW:
  The Mind is a cooperative card game. Players hold numbered
  cards (1-100) and must play them to the center in ascending
  order - WITHOUT communicating about their cards!

  GAMEPLAY:
  - Each level deals more cards (level 1 = 1 card each, etc.)
  - On your turn, play a card from your hand
  - Cards must be played in ascending order overall
  - If you play a card and an opponent had a lower card,
    you lose a life and those lower cards are discarded

  THROWING STARS:
  - Propose to use a star: both players reveal and discard
    their lowest card. Use when you feel stuck!

  LEVELS:
  - Complete 8 levels to win
  - Gain a throwing star every 3 levels
  - Gain a life at level 5

  EXTREME MODE:
  - Some levels require DESCENDING order instead!
  - The direction is shown at the start of each level

  TIPS:
  - Try to feel when your card is "low enough" to play
  - Use throwing stars when gaps feel dangerous
============================================================
"""
