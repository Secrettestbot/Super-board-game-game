"""Pinch - A trick-taking card game with pinch mechanics."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ["Clubs", "Diamonds", "Hearts", "Spades"]
SUIT_SYMBOLS = {"Clubs": "C", "Diamonds": "D", "Hearts": "H", "Spades": "S"}


def _card_str(card):
    """Format a card for display."""
    value, suit = card
    face = {1: "A", 11: "J", 12: "Q", 13: "K"}.get(value, str(value))
    return f"{face}{SUIT_SYMBOLS[suit]}"


def _card_sort_key(card):
    """Sort key for cards: by suit then value."""
    value, suit = card
    return (SUITS.index(suit), value)


class PinchGame(BaseGame):
    """Pinch - trick-taking with pinch mechanics."""

    name = "Pinch"
    description = "Trick-taking with a twist - pinch cards to change the game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "13 cards each, full bidding (values 1-13)",
        "quick": "7 cards each, simplified (values 1-7)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.max_value = 13 if self.variation == "standard" else 7
        self.cards_per_hand = self.max_value

        self.hands = {1: [], 2: []}
        self.bids = {1: -1, 2: -1}  # -1 means not yet bid
        self.tricks_won = {1: 0, 2: 0}
        self.scores = {1: 0, 2: 0}
        self.current_trick = []  # list of (player, (value, suit))
        self.pinched = []  # cards pinched out of current trick
        self.lead_player = 1
        self.trick_number = 0
        self.phase = "bidding"  # "bidding", "playing", "scoring"
        self.round_number = 1
        self.max_rounds = 3
        self.trump_suit = None
        self.log = []

    def setup(self):
        """Initialize the game."""
        self._deal_round()

    def _deal_round(self):
        """Deal cards for a new round."""
        deck = []
        for suit in SUITS:
            for value in range(1, self.max_value + 1):
                deck.append([value, suit])
        random.shuffle(deck)

        self.hands = {1: [], 2: []}
        for i in range(self.cards_per_hand):
            self.hands[1].append(deck.pop())
            self.hands[2].append(deck.pop())

        # Sort hands
        self.hands[1].sort(key=_card_sort_key)
        self.hands[2].sort(key=_card_sort_key)

        # Determine trump from remaining deck (if any)
        if deck:
            trump_card = deck[0]
            self.trump_suit = trump_card[1]
        else:
            self.trump_suit = random.choice(SUITS)

        self.bids = {1: -1, 2: -1}
        self.tricks_won = {1: 0, 2: 0}
        self.current_trick = []
        self.pinched = []
        self.trick_number = 0
        self.phase = "bidding"
        self.lead_player = 1
        self.log.append(f"Round {self.round_number}: Cards dealt! "
                       f"Trump: {self.trump_suit} ({SUIT_SYMBOLS[self.trump_suit]})")

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        opp = 2 if p == 1 else 1

        print("=" * 58)
        print(f"  PINCH - Round {self.round_number}/{self.max_rounds} "
              f"| Trump: {self.trump_suit} ({SUIT_SYMBOLS[self.trump_suit]})")
        print("=" * 58)

        # Scores
        for pp in [1, 2]:
            marker = ">>" if pp == p else "  "
            bid_str = str(self.bids[pp]) if self.bids[pp] >= 0 else "?"
            print(f"  {marker} {self.players[pp-1]}: Score={self.scores[pp]} | "
                  f"Bid={bid_str} | Tricks={self.tricks_won[pp]}")

        print("-" * 58)

        # Current trick
        if self.phase == "playing":
            print(f"  Trick {self.trick_number + 1}/{self.cards_per_hand}:")
            if self.current_trick:
                print("    Played: ", end="")
                for player, card in self.current_trick:
                    print(f"{self.players[player-1]}:{_card_str(card)} ", end="")
                print()
                if self.pinched:
                    print("    Pinched: ", end="")
                    for card in self.pinched:
                        print(f"{_card_str(card)} ", end="")
                    print()
            else:
                leader = self.lead_player
                print(f"    {self.players[leader-1]} leads this trick.")

        print("-" * 58)

        # Current player's hand
        print(f"  {self.players[p-1]}'s Hand:")
        if self.hands[p]:
            line = "    "
            for i, card in enumerate(self.hands[p]):
                line += f"{i+1}.{_card_str(card)}  "
                if (i + 1) % 7 == 0 and i < len(self.hands[p]) - 1:
                    line += "\n    "
            print(line)
        else:
            print("    (empty)")

        # Opponent hand size
        print(f"  {self.players[opp-1]}: {len(self.hands[opp])} cards")

        print("-" * 58)
        if self.log:
            for line in self.log[-4:]:
                print(f"  {line}")
        print("=" * 58)

    def get_move(self):
        """Get a move from the current player."""
        p = self.current_player

        if self.phase == "bidding":
            max_tricks = self.cards_per_hand
            print(f"\n  How many tricks do you think you'll win? (0-{max_tricks})")
            bid = input_with_quit(f"  {self.players[p-1]}'s bid: ").strip()
            try:
                b = int(bid)
                if 0 <= b <= max_tricks:
                    return ("bid", b)
                else:
                    print(f"  Must be between 0 and {max_tricks}.")
            except ValueError:
                print("  Enter a number.")
            return None

        elif self.phase == "playing":
            if not self.hands[p]:
                return None

            # Determine valid plays
            valid_indices = self._get_valid_plays(p)
            print(f"\n  Play a card (1-{len(self.hands[p])}):")
            choice = input_with_quit(f"  {self.players[p-1]} plays: ").strip()
            try:
                idx = int(choice) - 1
                if idx in valid_indices:
                    return ("play", idx)
                elif 0 <= idx < len(self.hands[p]):
                    print("  Must follow lead suit if possible!")
                else:
                    print("  Invalid card number.")
            except ValueError:
                print("  Enter a number.")
            return None

        return None

    def _get_valid_plays(self, player):
        """Get indices of valid cards to play."""
        hand = self.hands[player]
        if not self.current_trick:
            # Leading: any card is valid
            return list(range(len(hand)))

        lead_suit = self.current_trick[0][1][1]
        # Must follow suit if possible
        suit_cards = [i for i, c in enumerate(hand) if c[1] == lead_suit]
        if suit_cards:
            return suit_cards
        # Can play any card
        return list(range(len(hand)))

    def make_move(self, move):
        """Apply a move to the game state."""
        if move is None:
            return False

        p = self.current_player
        self.log = []

        if isinstance(move, tuple) and move[0] == "bid":
            _, bid_value = move
            self.bids[p] = bid_value
            self.log.append(f"{self.players[p-1]} bids {bid_value} tricks.")

            # Check if both players have bid
            if self.bids[1] >= 0 and self.bids[2] >= 0:
                self.phase = "playing"
                self.log.append("Bidding complete! Let the tricks begin.")
            return True

        elif isinstance(move, tuple) and move[0] == "play":
            _, idx = move
            if idx >= len(self.hands[p]):
                return False

            card = self.hands[p].pop(idx)
            card_list = [card[0], card[1]]  # ensure it's a list

            # Check for pinch: same value as a card already in the trick
            pinch_occurred = False
            for trick_player, trick_card in list(self.current_trick):
                if trick_card[0] == card_list[0]:
                    # PINCH! Both cards are removed from the trick
                    self.pinched.append(list(trick_card))
                    self.pinched.append(list(card_list))
                    self.current_trick = [(tp, tc) for tp, tc in self.current_trick
                                         if not (tc[0] == card_list[0] and tc[1] == trick_card[1])]
                    pinch_occurred = True
                    self.log.append(f"PINCH! {_card_str(card_list)} pinches "
                                  f"{_card_str(trick_card)} - both removed!")
                    break

            if not pinch_occurred:
                self.current_trick.append((p, card_list))
                self.log.append(f"{self.players[p-1]} plays {_card_str(card_list)}")

            # Check if trick is complete (both players have played)
            cards_played_this_trick = len(self.current_trick) + len(self.pinched)
            # Each player plays once per trick
            players_played = set()
            for tp, tc in self.current_trick:
                players_played.add(tp)
            # If current card was pinched, current player already "played"
            if pinch_occurred:
                players_played.add(p)
            # Also count pinched cards' players
            # We track by: each player plays once, trick ends after 2 plays
            total_plays = len(self.current_trick) + (len(self.pinched) // 2 if pinch_occurred else 0)

            # Simple check: trick is done when it's the second play
            is_second_play = (p != self.lead_player) or (len(self.current_trick) == 0 and pinch_occurred)

            if is_second_play or (self.current_trick and len(set(tp for tp, tc in self.current_trick)) == 0 and pinch_occurred):
                # Trick complete - determine winner
                self._resolve_trick()
                return True

            return True

        return False

    def _resolve_trick(self):
        """Resolve a completed trick."""
        if not self.current_trick:
            # All cards were pinched - no one wins the trick
            self.log.append("All cards pinched! No one wins this trick.")
            self.pinched = []
            self.trick_number += 1
            self._check_round_end()
            return

        # Determine trick winner
        lead_suit = None
        if self.current_trick:
            lead_suit = self.current_trick[0][1][1]

        best_player = None
        best_value = -1
        best_is_trump = False

        for trick_player, card in self.current_trick:
            is_trump = card[1] == self.trump_suit
            value = card[0]

            if best_player is None:
                best_player = trick_player
                best_value = value
                best_is_trump = is_trump
            elif is_trump and not best_is_trump:
                best_player = trick_player
                best_value = value
                best_is_trump = is_trump
            elif is_trump == best_is_trump:
                if is_trump:
                    if value > best_value:
                        best_player = trick_player
                        best_value = value
                elif card[1] == lead_suit and value > best_value:
                    best_player = trick_player
                    best_value = value

        if best_player is not None:
            self.tricks_won[best_player] += 1
            # Pinched tricks score differently: worth 0 extra
            pinch_penalty = len(self.pinched) > 0
            self.log.append(f"{self.players[best_player-1]} wins trick "
                          f"{self.trick_number + 1}!"
                          + (" (pinched trick)" if pinch_penalty else ""))
            self.lead_player = best_player

        self.current_trick = []
        self.pinched = []
        self.trick_number += 1
        self._check_round_end()

    def _check_round_end(self):
        """Check if the round is over."""
        if not self.hands[1] and not self.hands[2]:
            # Round over - score it
            self.log.append(f"Round {self.round_number} complete!")
            for pp in [1, 2]:
                bid = self.bids[pp]
                won = self.tricks_won[pp]
                if won == bid:
                    points = 10 * won if won > 0 else 5
                    self.scores[pp] += points
                    self.log.append(f"  {self.players[pp-1]}: Bid {bid}, Won {won} - "
                                  f"+{points} pts (exact!)")
                else:
                    diff = abs(won - bid)
                    penalty = -5 * diff
                    self.scores[pp] += penalty
                    self.log.append(f"  {self.players[pp-1]}: Bid {bid}, Won {won} - "
                                  f"{penalty} pts (off by {diff})")

            self.round_number += 1
            if self.round_number <= self.max_rounds:
                self._deal_round()

    def switch_player(self):
        """Switch player, but respect trick leading."""
        if self.phase == "bidding":
            super().switch_player()
        elif self.phase == "playing":
            if not self.current_trick:
                # Start of a new trick - lead player goes first
                self.current_player = self.lead_player
            else:
                super().switch_player()

    def check_game_over(self):
        """Check if all rounds are complete."""
        if self.round_number > self.max_rounds:
            self.game_over = True
            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None
            self.log.append(f"Game Over! Final: {self.players[0]}={self.scores[1]} "
                          f"vs {self.players[1]}={self.scores[2]}")

    def get_state(self):
        """Return serializable game state."""
        # Convert card tuples to lists for JSON
        return {
            "max_value": self.max_value,
            "cards_per_hand": self.cards_per_hand,
            "hands": {
                "1": self.hands[1],
                "2": self.hands[2],
            },
            "bids": {"1": self.bids[1], "2": self.bids[2]},
            "tricks_won": {"1": self.tricks_won[1], "2": self.tricks_won[2]},
            "scores": {"1": self.scores[1], "2": self.scores[2]},
            "current_trick": [[tp, tc] for tp, tc in self.current_trick],
            "pinched": self.pinched,
            "lead_player": self.lead_player,
            "trick_number": self.trick_number,
            "phase": self.phase,
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "trump_suit": self.trump_suit,
            "log": self.log,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.max_value = state["max_value"]
        self.cards_per_hand = state["cards_per_hand"]
        self.hands = {
            1: state["hands"]["1"],
            2: state["hands"]["2"],
        }
        self.bids = {1: state["bids"]["1"], 2: state["bids"]["2"]}
        self.tricks_won = {1: state["tricks_won"]["1"], 2: state["tricks_won"]["2"]}
        self.scores = {1: state["scores"]["1"], 2: state["scores"]["2"]}
        self.current_trick = [(tp, tc) for tp, tc in state["current_trick"]]
        self.pinched = state["pinched"]
        self.lead_player = state["lead_player"]
        self.trick_number = state["trick_number"]
        self.phase = state["phase"]
        self.round_number = state["round_number"]
        self.max_rounds = state["max_rounds"]
        self.trump_suit = state["trump_suit"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        """Return tutorial text."""
        return """
============================================================
  PINCH - Tutorial
============================================================

  OVERVIEW:
  A trick-taking card game with a twist! Playing a card
  with the same VALUE as one already in the trick "pinches"
  both cards out, changing who wins the trick.

  SETUP:
  - 4 suits: Clubs(C), Diamonds(D), Hearts(H), Spades(S)
  - Standard: values 1-13 (A,2-10,J,Q,K), 13 cards each
  - Quick: values 1-7, 7 cards each
  - Trump suit is randomly determined each round

  BIDDING:
  Before play begins, each player bids how many tricks
  they think they'll win. Accuracy is rewarded!

  TRICK PLAY:
  1. Lead player plays any card
  2. Other player must follow suit if possible
  3. Highest card of lead suit wins (trump beats all)
  4. Trick winner leads next trick

  THE PINCH:
  If you play a card with the SAME VALUE as one already
  in the trick, BOTH cards are removed ("pinched")!
  - If all cards are pinched, no one wins the trick
  - This changes predictions and scoring strategy

  SCORING (per round):
  - Exact bid: +10 points per trick won (min +5 for 0 bid)
  - Wrong bid: -5 points per trick off

  The game lasts 3 rounds. Highest total score wins!

  STRATEGY:
  - Use pinches to deny opponents predicted tricks
  - Bid carefully - being exact is everything
  - Trump cards are powerful but predictable
  - Save matching values to pinch at key moments
============================================================
"""
