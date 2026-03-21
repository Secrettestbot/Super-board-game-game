"""Spades - A 2-player variant of the classic trick-taking card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ['C', 'D', 'H', 'S']
SUIT_SYMBOLS = {'H': '\u2665', 'D': '\u2666', 'C': '\u2663', 'S': '\u2660'}
SUIT_NAMES = {'H': 'Hearts', 'D': 'Diamonds', 'C': 'Clubs', 'S': 'Spades'}
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']


def rank_index(rank):
    """Return numeric index of a rank for sorting/comparison."""
    return RANKS.index(rank)


def card_str(card):
    """Format a card for display: e.g. ('10','H') -> '10H'."""
    return f"{card[0]}{SUIT_SYMBOLS[card[1]]}"


def card_sort_key(card):
    """Sort key: group by suit (CDHS order), then by rank."""
    return (SUITS.index(card[1]), rank_index(card[0]))


def make_deck():
    """Return a shuffled standard 52-card deck. Cards are (rank, suit) tuples."""
    deck = [(r, s) for s in SUITS for r in RANKS]
    random.shuffle(deck)
    return deck


class SpadesGame(BaseGame):
    """Spades: A 2-player variant of the classic trick-taking card game."""

    name = "Spades"
    description = "A 2-player variant of the classic trick-taking card game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Spades (500 points)",
        "short": "Short Game (200 points)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.scores = [0, 0]
        self.target_score = 500
        self.hands = [[], []]
        self.hand_number = 0
        self.phase = "bid"  # bid, play, trick_done, hand_over
        self.spades_broken = False
        self.current_trick = []  # list of (player_index, card)
        self.trick_leader = 0
        self.tricks_won = [0, 0]  # tricks won this hand
        self.bids = [None, None]  # each player's bid (int or 0 for nil)
        self.nil_bids = [False, False]  # whether each player bid nil
        self.sandbags = [0, 0]  # accumulated overtricks
        self.round_messages = []

    def setup(self):
        """Initialize for the first hand."""
        self.scores = [0, 0]
        self.target_score = 200 if self.variation == "short" else 500
        self.hand_number = 0
        self.sandbags = [0, 0]
        self._start_hand()

    def _start_hand(self):
        """Deal a new hand."""
        deck = make_deck()
        self.hands = [sorted(deck[:13], key=card_sort_key),
                      sorted(deck[13:26], key=card_sort_key)]
        # Remaining 26 cards set aside (not used in 2-player variant)
        self.spades_broken = False
        self.current_trick = []
        self.tricks_won = [0, 0]
        self.bids = [None, None]
        self.nil_bids = [False, False]
        self.round_messages = []
        self.phase = "bid"
        self.current_player = 1  # Player 1 bids first
        self.hand_number += 1

    def display(self):
        """Display the current game state."""
        mode = f"Standard ({self.target_score})" if self.variation == "standard" else f"Short ({self.target_score})"
        print(f"\n  === Spades ({mode}) ===")
        print(f"  Hand #{self.hand_number}")
        print()

        for i in range(2):
            bid_str = self._bid_display(i)
            print(f"  {self.players[i]}: {self.scores[i]} pts | "
                  f"Bid: {bid_str} | Tricks: {self.tricks_won[i]} | "
                  f"Bags: {self.sandbags[i]}")
        print()
        print(f"  Spades broken: {'Yes' if self.spades_broken else 'No'}")
        print()

        for msg in self.round_messages:
            print(f"  {msg}")
        if self.round_messages:
            print()

        cp = self.current_player - 1

        if self.phase == "bid":
            hand = self.hands[cp]
            print(f"  {self.players[cp]}'s hand:")
            for i, c in enumerate(hand):
                print(f"    {i + 1}: {card_str(c)}")
            print()

        elif self.phase == "play":
            if self.current_trick:
                print("  Current trick:")
                for pi, card in self.current_trick:
                    print(f"    {self.players[pi]}: {card_str(card)}")
                print()
            hand = self.hands[cp]
            playable = self._get_playable_cards(cp)
            print(f"  {self.players[cp]}'s hand:")
            for i, c in enumerate(hand):
                marker = "" if c in playable else " (can't play)"
                print(f"    {i + 1}: {card_str(c)}{marker}")
            print()

        elif self.phase == "trick_done":
            if self.current_trick:
                print("  Completed trick:")
                for pi, card in self.current_trick:
                    print(f"    {self.players[pi]}: {card_str(card)}")
                print()

    def _bid_display(self, player_idx):
        """Return a string representation of a player's bid."""
        bid = self.bids[player_idx]
        if bid is None:
            return "---"
        if self.nil_bids[player_idx]:
            return "Nil"
        return str(bid)

    def _get_playable_cards(self, player_idx):
        """Return list of cards the player can legally play."""
        hand = self.hands[player_idx]
        if not hand:
            return []

        # Leading a trick
        if not self.current_trick:
            if self.spades_broken:
                return list(hand)
            else:
                non_spades = [c for c in hand if c[1] != 'S']
                if non_spades:
                    return non_spades
                else:
                    # Only spades left, can lead them
                    return list(hand)

        # Following suit
        lead_suit = self.current_trick[0][1][1]
        follow = [c for c in hand if c[1] == lead_suit]
        if follow:
            return follow

        # Can't follow suit - can play anything
        return list(hand)

    def get_move(self):
        """Get input from the current player."""
        cp = self.current_player - 1

        if self.phase == "bid":
            print(f"  {self.players[cp]}, enter your bid (1-13 or 'nil'):")
            return input_with_quit("  Bid: ").strip()

        elif self.phase == "play":
            print(f"  {self.players[cp]}, play a card (enter number):")
            return input_with_quit("  Play: ").strip()

        elif self.phase == "trick_done":
            input_with_quit("  Press Enter to continue...")
            return "continue"

        elif self.phase == "hand_over":
            return "continue"

        return ""

    def make_move(self, move):
        """Process the move based on current phase."""
        if self.phase == "bid":
            return self._do_bid(move)
        elif self.phase == "play":
            return self._do_play(move)
        elif self.phase in ("trick_done", "hand_over"):
            return self._do_continue()
        return False

    def _do_bid(self, move):
        """Handle bidding."""
        cp = self.current_player - 1

        if move.lower() == "nil":
            self.bids[cp] = 0
            self.nil_bids[cp] = True
            self.round_messages.append(f"{self.players[cp]} bids Nil!")
        else:
            try:
                bid = int(move)
                if bid < 1 or bid > 13:
                    print("  Bid must be between 1 and 13 (or 'nil').")
                    input("  Press Enter to continue...")
                    return False
                self.bids[cp] = bid
                self.nil_bids[cp] = False
                self.round_messages.append(f"{self.players[cp]} bids {bid}.")
            except ValueError:
                return False

        # Check if both players have bid
        if self.bids[0] is not None and self.bids[1] is not None:
            self.phase = "play"
            # Player 1 leads the first trick
            self.trick_leader = 0
            self.current_player = 1
        else:
            # Switch to the other player for bidding
            self.current_player = 2 if cp == 0 else 1

        return True

    def _do_play(self, move):
        """Handle playing a card to the current trick."""
        cp = self.current_player - 1
        hand = self.hands[cp]
        playable = self._get_playable_cards(cp)

        try:
            idx = int(move) - 1
            if idx < 0 or idx >= len(hand):
                return False
        except ValueError:
            return False

        card = hand[idx]
        if card not in playable:
            print("  That card cannot be played right now!")
            input("  Press Enter to continue...")
            return False

        # Play the card
        hand.pop(idx)
        self.current_trick.append((cp, card))

        # Check if spades are broken
        if card[1] == 'S' and not self.spades_broken:
            self.spades_broken = True
            self.round_messages.append("Spades have been broken!")

        # Check if trick is complete (2 cards played)
        if len(self.current_trick) == 2:
            self.phase = "trick_done"
            self._resolve_trick()
            return True

        # Switch to other player
        self.current_player = (1 - cp) + 1
        return True

    def _resolve_trick(self):
        """Determine winner of the current trick."""
        lead_suit = self.current_trick[0][1][1]
        best_player = self.current_trick[0][0]
        best_card = self.current_trick[0][1]
        best_is_trump = best_card[1] == 'S'
        best_rank = rank_index(best_card[0])

        for pi, card in self.current_trick[1:]:
            is_trump = card[1] == 'S'
            r = rank_index(card[0])

            if is_trump and not best_is_trump:
                # Trump beats non-trump
                best_player = pi
                best_card = card
                best_is_trump = True
                best_rank = r
            elif is_trump and best_is_trump:
                # Higher trump wins
                if r > best_rank:
                    best_player = pi
                    best_card = card
                    best_rank = r
            elif not is_trump and not best_is_trump:
                # Must be same as lead suit to win
                if card[1] == lead_suit and r > best_rank:
                    best_player = pi
                    best_card = card
                    best_rank = r

        self.tricks_won[best_player] += 1

        winner_name = self.players[best_player]
        trick_str = ' '.join(card_str(c) for _, c in self.current_trick)
        self.round_messages.append(f"{winner_name} wins trick ({trick_str})")

        # Set winner as next leader
        self.trick_leader = best_player

    def _do_continue(self):
        """Handle continue after trick or hand end."""
        if self.phase == "trick_done":
            # Check if hand is over (no cards left)
            if not self.hands[0] and not self.hands[1]:
                self._score_hand()
                self.phase = "hand_over"
            else:
                self.current_trick = []
                self.current_player = self.trick_leader + 1
                self.phase = "play"
            return True

        if self.phase == "hand_over":
            if not self.game_over:
                self._start_hand()
            return True

        return True

    def _score_hand(self):
        """Score the completed hand."""
        for i in range(2):
            bid = self.bids[i]
            won = self.tricks_won[i]

            if self.nil_bids[i]:
                if won == 0:
                    self.scores[i] += 100
                    self.round_messages.append(
                        f"{self.players[i]}: Nil bid successful! +100"
                    )
                else:
                    self.scores[i] -= 100
                    self.round_messages.append(
                        f"{self.players[i]}: Nil bid failed! -100"
                    )
            else:
                if won >= bid:
                    overtricks = won - bid
                    points = 10 * bid + overtricks
                    self.scores[i] += points
                    self.sandbags[i] += overtricks

                    msg = f"{self.players[i]}: Made {won}/{bid} = +{points}"
                    if overtricks > 0:
                        msg += f" ({overtricks} overtrick{'s' if overtricks != 1 else ''})"
                    self.round_messages.append(msg)

                    # Sandbag penalty
                    if self.sandbags[i] >= 10:
                        penalties = self.sandbags[i] // 10
                        self.sandbags[i] %= 10
                        penalty = penalties * 100
                        self.scores[i] -= penalty
                        self.round_messages.append(
                            f"{self.players[i]}: Sandbag penalty! -{penalty}"
                        )
                else:
                    penalty = 10 * bid
                    self.scores[i] -= penalty
                    self.round_messages.append(
                        f"{self.players[i]}: Failed {won}/{bid} = -{penalty}"
                    )

        self.round_messages.append(
            f"Scores: {self.players[0]} = {self.scores[0]}, "
            f"{self.players[1]} = {self.scores[1]}"
        )

    def check_game_over(self):
        """Check if someone has reached the target score."""
        if self.game_over:
            return
        # Only check at end of a hand
        if self.phase != "hand_over":
            return

        either_reached = any(s >= self.target_score for s in self.scores)
        if either_reached:
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None  # tie

    def switch_player(self):
        """Override: Spades manages its own player switching."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "scores": list(self.scores),
            "target_score": self.target_score,
            "hands": [list(self.hands[0]), list(self.hands[1])],
            "hand_number": self.hand_number,
            "phase": self.phase,
            "spades_broken": self.spades_broken,
            "current_trick": list(self.current_trick),
            "trick_leader": self.trick_leader,
            "tricks_won": list(self.tricks_won),
            "bids": list(self.bids),
            "nil_bids": list(self.nil_bids),
            "sandbags": list(self.sandbags),
            "round_messages": list(self.round_messages),
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.scores = list(state["scores"])
        self.target_score = state["target_score"]
        self.hands = [[tuple(c) for c in h] for h in state["hands"]]
        self.hand_number = state["hand_number"]
        self.phase = state["phase"]
        self.spades_broken = state["spades_broken"]
        self.current_trick = [(pi, tuple(c)) for pi, c in state["current_trick"]]
        self.trick_leader = state["trick_leader"]
        self.tricks_won = list(state["tricks_won"])
        self.bids = list(state["bids"])
        self.nil_bids = list(state["nil_bids"])
        self.sandbags = list(state["sandbags"])
        self.round_messages = list(state["round_messages"])

    def get_tutorial(self):
        """Return tutorial text for Spades."""
        return """
==================================================
  Spades - Tutorial (2-Player Variant)
==================================================

  OVERVIEW:
  Spades is a trick-taking card game where you bid
  on how many tricks you will win each hand. Spades
  are always trump. The goal is to reach the target
  score first.

  SETUP:
  - Standard 52-card deck. Each player is dealt 13
    cards. The remaining 26 cards are set aside.

  BIDDING:
  - Each player bids how many tricks they expect to
    win (1-13).
  - You may also bid "nil" (zero tricks) for a
    bonus or penalty.

  PLAY:
  - Player 1 leads the first trick each hand.
  - You must follow the lead suit if you can.
  - If you cannot follow suit, you may play any
    card, including a spade (trump).
  - Spades cannot be LED until they are "broken"
    (a spade has been played on a previous trick
    because a player could not follow suit).
  - The highest card of the lead suit wins the
    trick, UNLESS a spade is played, in which case
    the highest spade wins.

  SCORING:
  - Make your bid: 10 x bid + 1 per overtrick.
    Example: Bid 4, win 5 = 40 + 1 = 41 points.
  - Fail your bid: -10 x bid.
    Example: Bid 4, win 3 = -40 points.
  - Nil bid success: +100 points.
  - Nil bid failure: -100 points.

  SANDBAGS:
  - Overtricks (tricks won above your bid)
    accumulate as "sandbags."
  - Every 10 accumulated sandbags = -100 point
    penalty.
  - Sandbag count resets after each penalty.

  GAME END:
  - Standard game: first to 500 points wins.
  - Short game: first to 200 points wins.
  - Scores can go negative.
  - Highest score wins.

  HOW TO PLAY:
  - During bidding: enter a number (1-13) or 'nil'.
  - During play: enter the card number from your
    hand to play it.

  STRATEGY HINTS:
  - Bid conservatively - overtricks are risky due
    to the sandbag penalty.
  - High spades are very powerful; count them when
    bidding.
  - A nil bid is risky but can swing the game in
    your favor.
  - Try to lead with your strong suits to control
    the tricks you need.

==================================================
"""
