"""Race Game - Horse racing card game with betting (2-player)."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


class RaceGame(BaseGame):
    """Horse racing card game where players bet on horses and play movement cards."""

    name = "Race"
    description = "Horse racing card game with secret bets and movement cards"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard race (20 spaces, 5 horses)",
        "quick": "Quick race (12 spaces, 3 horses)",
    }

    HORSE_COLORS = ["Red", "Blue", "Green", "Yellow", "White"]
    HORSE_SYMBOLS = ["R", "B", "G", "Y", "W"]

    def __init__(self, variation=None):
        super().__init__(variation)
        self.track_length = 20
        self.num_horses = 5
        self.horse_positions = []
        self.player_hands = {1: [], 2: []}
        self.player_bets = {1: [], 2: []}
        self.player_scores = {1: 0, 2: 0}
        self.phase = "betting"
        self.cards_per_hand = 10
        self.round_number = 1
        self.max_rounds = 3
        self.log = []
        self.bet_placed = {1: False, 2: False}
        self.racing_done = False

    def _add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 8:
            self.log = self.log[-8:]

    def setup(self):
        if self.variation == "quick":
            self.track_length = 12
            self.num_horses = 3
            self.cards_per_hand = 6
            self.max_rounds = 2
        else:
            self.track_length = 20
            self.num_horses = 5
            self.cards_per_hand = 10
            self.max_rounds = 3

        self.horse_positions = [0] * self.num_horses
        self.player_scores = {1: 0, 2: 0}
        self.round_number = 1
        self.phase = "betting"
        self.bet_placed = {1: False, 2: False}
        self.racing_done = False
        self.log = []
        self.game_over = False
        self.winner = None
        self._deal_cards()
        self._add_log("Round 1 begins! Place your bets!")

    def _deal_cards(self):
        """Deal movement cards to both players."""
        for p in (1, 2):
            hand = []
            for _ in range(self.cards_per_hand):
                horse_idx = random.randint(0, self.num_horses - 1)
                value = random.randint(1, 6)
                hand.append([horse_idx, value])
            self.player_hands[p] = hand

    def _get_active_colors(self):
        return self.HORSE_COLORS[:self.num_horses]

    def _get_active_symbols(self):
        return self.HORSE_SYMBOLS[:self.num_horses]

    def display(self):
        clear_screen()
        colors = self._get_active_colors()
        symbols = self._get_active_symbols()

        print(f"{'=' * 56}")
        print(f"  HORSE RACE  |  Round {self.round_number}/{self.max_rounds}  |  Phase: {self.phase.upper()}")
        print(f"{'=' * 56}")
        print(f"  Scores: {self.players[0]}: {self.player_scores[1]}  |  {self.players[1]}: {self.player_scores[2]}")
        print(f"{'=' * 56}")

        # Draw the track
        print("\n  TRACK:")
        finish = self.track_length
        print(f"  {'START':<6}" + " " * (finish - 4) + "FINISH")
        print(f"  |" + "-" * finish + "|")
        for i in range(self.num_horses):
            pos = min(self.horse_positions[i], finish)
            track = "." * finish
            track_list = list(track)
            if pos < finish:
                track_list[pos] = symbols[i]
            else:
                track_list[-1] = symbols[i]
            line = "".join(track_list)
            print(f"  |{line}| {colors[i]} ({symbols[i]})")
        print(f"  |" + "-" * finish + "|")

        # Show bets for current player (hidden from opponent)
        if self.phase == "betting":
            print(f"\n  {self.players[self.current_player - 1]}'s turn to bet.")
            if self.bet_placed[self.current_player]:
                print("  You have already placed your bet.")
        elif self.phase == "racing":
            cp = self.current_player
            print(f"\n  {self.players[cp - 1]}'s turn to play a card.")
            print(f"  Your bets: ", end="")
            if self.player_bets[cp]:
                bet_strs = [f"{colors[b[0]]}(wager:{b[1]})" for b in self.player_bets[cp]]
                print(", ".join(bet_strs))
            else:
                print("None")
            print(f"\n  Your hand:")
            for idx, card in enumerate(self.player_hands[cp]):
                print(f"    [{idx + 1}] {colors[card[0]]} horse, move {card[1]} spaces")
        elif self.phase == "scoring":
            print("\n  RACE COMPLETE! Scoring...")

        # Log
        if self.log:
            print(f"\n  {'~' * 40}")
            for entry in self.log[-5:]:
                print(f"  {entry}")

    def get_move(self):
        if self.phase == "betting":
            return self._get_bet_move()
        elif self.phase == "racing":
            return self._get_race_move()
        elif self.phase == "scoring":
            input_with_quit("\n  Press Enter to see results...")
            return "score"
        return None

    def _get_bet_move(self):
        colors = self._get_active_colors()
        print(f"\n  Choose a horse to bet on:")
        for i, c in enumerate(colors):
            print(f"    [{i + 1}] {c}")
        while True:
            choice = input_with_quit(f"  Horse number (1-{self.num_horses}): ")
            try:
                horse_idx = int(choice) - 1
                if 0 <= horse_idx < self.num_horses:
                    break
            except ValueError:
                pass
            print(f"  Invalid choice. Enter 1-{self.num_horses}.")

        while True:
            wager = input_with_quit("  Wager amount (1-5): ")
            try:
                w = int(wager)
                if 1 <= w <= 5:
                    return ["bet", horse_idx, w]
            except ValueError:
                pass
            print("  Invalid wager. Enter 1-5.")

    def _get_race_move(self):
        hand = self.player_hands[self.current_player]
        if not hand:
            return ["pass"]
        while True:
            choice = input_with_quit(f"  Play card (1-{len(hand)}): ")
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(hand):
                    return ["play", idx]
            except ValueError:
                pass
            print(f"  Invalid. Enter 1-{len(hand)}.")

    def make_move(self, move):
        if move[0] == "bet":
            _, horse_idx, wager = move
            self.player_bets[self.current_player].append([horse_idx, wager])
            colors = self._get_active_colors()
            self._add_log(f"{self.players[self.current_player - 1]} placed a secret bet.")
            self.bet_placed[self.current_player] = True

            # Check if both players have bet
            if self.bet_placed[1] and self.bet_placed[2]:
                self.phase = "racing"
                self._add_log("Bets are locked! The race begins!")
            return True

        elif move[0] == "play":
            _, card_idx = move
            cp = self.current_player
            hand = self.player_hands[cp]
            card = hand.pop(card_idx)
            horse_idx, value = card[0], card[1]
            colors = self._get_active_colors()

            self.horse_positions[horse_idx] += value
            self._add_log(f"{self.players[cp - 1]} plays {colors[horse_idx]} +{value} (now at {self.horse_positions[horse_idx]})")

            # Check if all cards played
            if not self.player_hands[1] and not self.player_hands[2]:
                self.phase = "scoring"
                self._add_log("All cards played! Scoring time!")
            return True

        elif move[0] == "pass":
            return True

        elif move == "score":
            self._score_round()
            return True

        return False

    def _score_round(self):
        colors = self._get_active_colors()
        # Rank horses by position
        ranked = sorted(range(self.num_horses), key=lambda i: self.horse_positions[i], reverse=True)
        winner_idx = ranked[0]
        second_idx = ranked[1] if len(ranked) > 1 else -1

        self._add_log(f"Winner: {colors[winner_idx]}! 2nd: {colors[second_idx] if second_idx >= 0 else 'N/A'}")

        for p in (1, 2):
            for bet in self.player_bets[p]:
                horse_idx, wager = bet[0], bet[1]
                if horse_idx == winner_idx:
                    points = wager * 3
                    self.player_scores[p] += points
                    self._add_log(f"{self.players[p - 1]} wins {points} pts (1st place bet!)")
                elif horse_idx == second_idx:
                    points = wager
                    self.player_scores[p] += points
                    self._add_log(f"{self.players[p - 1]} wins {points} pt (2nd place bet)")
                else:
                    self.player_scores[p] -= wager
                    self._add_log(f"{self.players[p - 1]} loses {wager} pts (bad bet)")

        # Next round or end
        self.round_number += 1
        if self.round_number > self.max_rounds:
            self.racing_done = True
        else:
            # Reset for next round
            self.horse_positions = [0] * self.num_horses
            self.player_bets = {1: [], 2: []}
            self.bet_placed = {1: False, 2: False}
            self.phase = "betting"
            self._deal_cards()
            self._add_log(f"Round {self.round_number} begins! Place your bets!")

    def check_game_over(self):
        if self.racing_done:
            self.game_over = True
            if self.player_scores[1] > self.player_scores[2]:
                self.winner = 1
            elif self.player_scores[2] > self.player_scores[1]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "track_length": self.track_length,
            "num_horses": self.num_horses,
            "horse_positions": self.horse_positions,
            "player_hands": {str(k): v for k, v in self.player_hands.items()},
            "player_bets": {str(k): v for k, v in self.player_bets.items()},
            "player_scores": {str(k): v for k, v in self.player_scores.items()},
            "phase": self.phase,
            "cards_per_hand": self.cards_per_hand,
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "log": self.log,
            "bet_placed": {str(k): v for k, v in self.bet_placed.items()},
            "racing_done": self.racing_done,
        }

    def load_state(self, state):
        self.track_length = state["track_length"]
        self.num_horses = state["num_horses"]
        self.horse_positions = state["horse_positions"]
        self.player_hands = {int(k): v for k, v in state["player_hands"].items()}
        self.player_bets = {int(k): v for k, v in state["player_bets"].items()}
        self.player_scores = {int(k): v for k, v in state["player_scores"].items()}
        self.phase = state["phase"]
        self.cards_per_hand = state["cards_per_hand"]
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]
        self.log = state["log"]
        self.bet_placed = {int(k): v for k, v in state["bet_placed"].items()}
        self.racing_done = state["racing_done"]

    def get_tutorial(self):
        return """
========================================
  HORSE RACE - Tutorial
========================================

OVERVIEW:
  Players bet on horses, then play movement cards to advance
  horses along the track. Score points based on your bets!

PHASES:
  1. BETTING - Each player secretly bets on a horse with a wager (1-5).
  2. RACING  - Players alternate playing movement cards from their hand.
     Each card moves a specific horse forward by 1-6 spaces.
  3. SCORING - The horse in 1st place pays 3x the wager to bettors.
     2nd place pays 1x. Wrong bets lose the wager amount.

STRATEGY:
  - Bet on horses you have good cards for.
  - Play cards strategically - boost your horse, but don't
    telegraph your bet too early!
  - Multiple rounds mean long-term scoring matters.

VARIATIONS:
  Standard: 20-space track, 5 horses, 3 rounds
  Quick:    12-space track, 3 horses, 2 rounds

COMMANDS:
  Type 'quit' to quit, 'save' to save, 'help' for help.
========================================
"""
