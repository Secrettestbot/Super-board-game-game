"""Cribbage - A classic 2-player card game of pegging and hand scoring."""

import random
from itertools import combinations
from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ['H', 'D', 'C', 'S']
SUIT_SYMBOLS = {'H': '\u2665', 'D': '\u2666', 'C': '\u2663', 'S': '\u2660'}
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']


def card_value(card):
    """Return the counting value of a card (A=1, face=10)."""
    rank = card[0]
    if rank == 'A':
        return 1
    if rank in ('J', 'Q', 'K'):
        return 10
    return int(rank)


def card_rank_index(card):
    """Return the rank index for run detection (A=0, 2=1, ..., K=12)."""
    return RANKS.index(card[0])


def card_str(card):
    """Format a card for display: e.g. ('10','H') -> '10H'."""
    return f"{card[0]}{SUIT_SYMBOLS[card[1]]}"


def make_deck():
    """Return a shuffled standard 52-card deck. Cards are (rank, suit) tuples."""
    deck = [(r, s) for s in SUITS for r in RANKS]
    random.shuffle(deck)
    return deck


def count_fifteens(cards):
    """Count points from combinations summing to 15 (2 pts each)."""
    pts = 0
    values = [card_value(c) for c in cards]
    for r in range(2, len(values) + 1):
        for combo in combinations(values, r):
            if sum(combo) == 15:
                pts += 2
    return pts


def count_pairs(cards):
    """Count points from pairs (2 pts each)."""
    pts = 0
    for i in range(len(cards)):
        for j in range(i + 1, len(cards)):
            if cards[i][0] == cards[j][0]:
                pts += 2
    return pts


def count_runs(cards):
    """Count points from runs of 3+ consecutive ranks."""
    if len(cards) < 3:
        return 0
    indices = sorted([card_rank_index(c) for c in cards])
    best = 0
    # Check from longest possible run down to 3
    for length in range(len(cards), 2, -1):
        count = 0
        for combo in combinations(indices, length):
            sc = sorted(combo)
            if all(sc[k + 1] - sc[k] == 1 for k in range(len(sc) - 1)):
                count += 1
        if count > 0:
            best = count * length
            break
    return best


def count_flush(hand, starter, is_crib=False):
    """Count flush points. hand is 4 cards, starter is 1 card."""
    suits = [c[1] for c in hand]
    if len(set(suits)) == 1:
        if starter[1] == suits[0]:
            return 5
        if not is_crib:
            return 4
    return 0


def count_nobs(hand, starter):
    """1 point for Jack of starter's suit in hand."""
    for c in hand:
        if c[0] == 'J' and c[1] == starter[1]:
            return 1
    return 0


def score_hand(hand, starter, is_crib=False):
    """Score a 4-card hand with the starter card. Returns (total, breakdown)."""
    all_five = list(hand) + [starter]
    fifteens = count_fifteens(all_five)
    pairs = count_pairs(all_five)
    runs = count_runs(all_five)
    flush = count_flush(hand, starter, is_crib)
    nobs = count_nobs(hand, starter)
    total = fifteens + pairs + runs + flush + nobs
    breakdown = []
    if fifteens:
        breakdown.append(f"15s: {fifteens}")
    if pairs:
        breakdown.append(f"Pairs: {pairs}")
    if runs:
        breakdown.append(f"Runs: {runs}")
    if flush:
        breakdown.append(f"Flush: {flush}")
    if nobs:
        breakdown.append(f"Nobs: {nobs}")
    return total, breakdown


def score_pegging_play(played_cards, running_total):
    """Score points earned from the last card played during pegging.
    Returns (points, descriptions)."""
    pts = 0
    desc = []

    # 15
    if running_total == 15:
        pts += 2
        desc.append("15 for 2")

    # 31
    if running_total == 31:
        pts += 2
        desc.append("31 for 2")

    # Pairs: check suffix of played_cards for matching ranks
    if len(played_cards) >= 2:
        last_rank = played_cards[-1][0]
        pair_count = 0
        for i in range(len(played_cards) - 2, -1, -1):
            if played_cards[i][0] == last_rank:
                pair_count += 1
            else:
                break
        if pair_count == 1:
            pts += 2
            desc.append("Pair for 2")
        elif pair_count == 2:
            pts += 6
            desc.append("Three of a kind for 6")
        elif pair_count == 3:
            pts += 12
            desc.append("Four of a kind for 12")

    # Runs: check suffix of played_cards for runs
    if len(played_cards) >= 3:
        for length in range(len(played_cards), 2, -1):
            suffix = played_cards[-length:]
            indices = sorted([card_rank_index(c) for c in suffix])
            if all(indices[k + 1] - indices[k] == 1 for k in range(len(indices) - 1)):
                pts += length
                desc.append(f"Run of {length} for {length}")
                break

    return pts, desc


class CribbageGame(BaseGame):
    """Cribbage: A classic card game of pegging and hand scoring."""

    name = "Cribbage"
    description = "A classic 2-player card game of pegging and hand scoring"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Cribbage (121 points)",
        "short": "Short Game (61 points)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.scores = [0, 0]
        self.target_score = 121
        self.dealer = 0  # index 0 or 1
        self.hands = [[], []]
        self.crib = []
        self.starter = None
        self.deck = []
        self.phase = "discard"  # discard, pegging, show, round_over
        self.pegging_played = []  # cards played in current pegging sequence
        self.pegging_hands = [[], []]  # cards remaining for pegging
        self.pegging_current = 0  # index of player whose turn it is to peg
        self.pegging_total = 0
        self.pegging_go = [False, False]  # who has said go
        self.pegging_last_player = None
        self.round_messages = []

    def setup(self):
        """Initialize for the first round."""
        self.scores = [0, 0]
        self.target_score = 61 if self.variation == "short" else 121
        self.dealer = 0
        self._start_round()

    def _start_round(self):
        """Deal a new round."""
        self.deck = make_deck()
        self.hands = [self.deck[:6], self.deck[6:12]]
        self.deck = self.deck[12:]
        self.crib = []
        self.starter = None
        self.phase = "discard"
        self.pegging_played = []
        self.pegging_hands = [[], []]
        self.pegging_total = 0
        self.pegging_go = [False, False]
        self.pegging_current = 1 - self.dealer  # non-dealer leads
        self.pegging_last_player = None
        self.round_messages = []
        # Sort hands for display
        self.hands[0].sort(key=lambda c: (card_rank_index(c), c[1]))
        self.hands[1].sort(key=lambda c: (card_rank_index(c), c[1]))

    def _score_bar(self, score, target):
        """Return a progress bar string."""
        width = 30
        filled = int(score / target * width) if target > 0 else 0
        filled = min(filled, width)
        bar = '#' * filled + '-' * (width - filled)
        return f"[{bar}] {score}/{target}"

    def display(self):
        """Display the current game state."""
        mode = "Standard (121)" if self.variation == "standard" else "Short (61)"
        dealer_name = self.players[self.dealer]
        print(f"\n  === Cribbage ({mode}) ===")
        print(f"  Dealer: {dealer_name}")
        print()
        for i in range(2):
            print(f"  {self.players[i]}: {self._score_bar(self.scores[i], self.target_score)}")
        print()

        for msg in self.round_messages:
            print(f"  {msg}")
        if self.round_messages:
            print()

        if self.starter:
            print(f"  Starter: {card_str(self.starter)}")
            print()

        if self.phase == "discard":
            cp = self.current_player - 1
            hand = self.hands[cp]
            print(f"  {self.players[cp]}'s hand:")
            for i, c in enumerate(hand):
                print(f"    {i + 1}: {card_str(c)}")
            print()
        elif self.phase == "pegging":
            cp = self.pegging_current
            print(f"  Running total: {self.pegging_total}")
            if self.pegging_played:
                played_str = ' '.join(card_str(c) for c in self.pegging_played)
                print(f"  Played cards: {played_str}")
            print()
            hand = self.pegging_hands[cp]
            playable = [c for c in hand if card_value(c) + self.pegging_total <= 31]
            print(f"  {self.players[cp]}'s hand:")
            for i, c in enumerate(hand):
                marker = " " if c in playable else " (can't play)"
                print(f"    {i + 1}: {card_str(c)}{marker}")
            print()

    def get_move(self):
        """Get input from the current player."""
        if self.phase == "discard":
            cp = self.current_player - 1
            print(f"  {self.players[cp]}, choose 2 cards to discard to the crib.")
            print("  Enter two card numbers separated by space (e.g. '1 3')")
            return input_with_quit("  Discard: ").strip()
        elif self.phase == "pegging":
            cp = self.pegging_current
            hand = self.pegging_hands[cp]
            playable = [c for c in hand if card_value(c) + self.pegging_total <= 31]
            if not playable:
                print(f"  {self.players[cp]} cannot play. Type 'go'.")
                move = input_with_quit("  > ").strip()
                return move
            print(f"  {self.players[cp]}, play a card (number) or 'go' if you cannot play.")
            return input_with_quit("  Play: ").strip()
        elif self.phase in ("show", "round_over"):
            return "continue"
        return ""

    def make_move(self, move):
        """Process the move based on current phase. Returns True if valid."""
        if self.phase == "discard":
            return self._do_discard(move)
        elif self.phase == "pegging":
            return self._do_pegging(move)
        elif self.phase in ("show", "round_over"):
            return True
        return False

    def _do_discard(self, move):
        """Handle discarding 2 cards to the crib."""
        cp = self.current_player - 1
        try:
            parts = move.split()
            if len(parts) != 2:
                return False
            indices = [int(p) - 1 for p in parts]
            if indices[0] == indices[1]:
                return False
            for idx in indices:
                if idx < 0 or idx >= len(self.hands[cp]):
                    return False
        except (ValueError, IndexError):
            return False

        # Remove in reverse order to preserve indices
        indices.sort(reverse=True)
        discarded = []
        for idx in indices:
            discarded.append(self.hands[cp].pop(idx))
        self.crib.extend(discarded)

        # Check if both players have discarded
        if len(self.hands[0]) == 4 and len(self.hands[1]) == 4:
            # Both done, cut the starter
            self.starter = self.deck.pop(0)
            # Heels: if starter is a Jack, dealer gets 2 points
            if self.starter[0] == 'J':
                self.scores[self.dealer] += 2
                self.round_messages.append(
                    f"Heels! Starter is a Jack - {self.players[self.dealer]} scores 2 points!"
                )
                if self._check_win():
                    return True
            self.phase = "pegging"
            self.pegging_hands = [list(self.hands[0]), list(self.hands[1])]
            self.pegging_current = 1 - self.dealer  # non-dealer leads
        return True

    def _do_pegging(self, move):
        """Handle a pegging play."""
        cp = self.pegging_current
        hand = self.pegging_hands[cp]
        playable = [c for c in hand if card_value(c) + self.pegging_total <= 31]

        if move.lower() == 'go':
            if playable:
                print("  You can still play a card!")
                input("  Press Enter to continue...")
                return False
            self.pegging_go[cp] = True
            other = 1 - cp
            other_playable = [c for c in self.pegging_hands[other]
                              if card_value(c) + self.pegging_total <= 31]

            if self.pegging_go[other] or not other_playable:
                # Both can't play - last card point
                if self.pegging_last_player is not None and self.pegging_total < 31:
                    self.scores[self.pegging_last_player] += 1
                    self.round_messages.append(
                        f"Last card - {self.players[self.pegging_last_player]} scores 1 point."
                    )
                    if self._check_win():
                        return True
                # Reset for next sequence
                self._reset_pegging_sequence()
            else:
                self.pegging_current = other
            return True

        # Playing a card
        try:
            idx = int(move) - 1
            if idx < 0 or idx >= len(hand):
                return False
        except ValueError:
            return False

        card = hand[idx]
        if card_value(card) + self.pegging_total > 31:
            print("  That card would exceed 31!")
            input("  Press Enter to continue...")
            return False

        hand.pop(idx)
        self.pegging_played.append(card)
        self.pegging_total += card_value(card)
        self.pegging_last_player = cp
        self.pegging_go = [False, False]  # reset go flags when a card is played

        # Score the play
        pts, desc = score_pegging_play(self.pegging_played, self.pegging_total)
        if pts > 0:
            self.scores[cp] += pts
            for d in desc:
                self.round_messages.append(f"{self.players[cp]}: {d}")
            if self._check_win():
                return True

        # Check if 31 reached
        if self.pegging_total == 31:
            self._reset_pegging_sequence()
            return True

        # Check if both players out of cards for pegging
        if not self.pegging_hands[0] and not self.pegging_hands[1]:
            # Last card
            if self.pegging_total > 0 and self.pegging_total < 31:
                self.scores[cp] += 1
                self.round_messages.append(
                    f"Last card - {self.players[cp]} scores 1 point."
                )
                if self._check_win():
                    return True
            self.phase = "show"
            return True

        # Switch to other player if they can play
        other = 1 - cp
        other_playable = [c for c in self.pegging_hands[other]
                          if card_value(c) + self.pegging_total <= 31]
        if other_playable:
            self.pegging_current = other
        else:
            # Other can't play, check if current can
            my_playable = [c for c in hand if card_value(c) + self.pegging_total <= 31]
            if not my_playable:
                # Neither can play, award last card and reset
                self.scores[cp] += 1
                self.round_messages.append(
                    f"Go - {self.players[cp]} scores 1 point."
                )
                if self._check_win():
                    return True
                self._reset_pegging_sequence()
            # else current player continues

        return True

    def _reset_pegging_sequence(self):
        """Reset pegging sequence after 31 or both players can't play."""
        self.pegging_played = []
        self.pegging_total = 0
        self.pegging_go = [False, False]

        # Check if both players out of cards
        if not self.pegging_hands[0] and not self.pegging_hands[1]:
            self.phase = "show"
            return

        # Find next player who has cards, starting with non-dealer
        for candidate in [1 - self.dealer, self.dealer]:
            if self.pegging_hands[candidate]:
                self.pegging_current = candidate
                return

    def _check_win(self):
        """Check if either player has reached the target score."""
        for i in range(2):
            if self.scores[i] >= self.target_score:
                self.game_over = True
                self.winner = i + 1
                return True
        return False

    def _do_show_phase(self):
        """Score hands and crib. Called when phase becomes 'show'."""
        messages = []
        non_dealer = 1 - self.dealer

        # Non-dealer's hand first
        pts, bd = score_hand(self.hands[non_dealer], self.starter)
        self.scores[non_dealer] += pts
        hand_str = ' '.join(card_str(c) for c in self.hands[non_dealer])
        messages.append(f"{self.players[non_dealer]}'s hand ({hand_str}): {pts} pts")
        for b in bd:
            messages.append(f"    {b}")
        if self._check_win():
            self.round_messages.extend(messages)
            return

        # Dealer's hand
        pts, bd = score_hand(self.hands[self.dealer], self.starter)
        self.scores[self.dealer] += pts
        hand_str = ' '.join(card_str(c) for c in self.hands[self.dealer])
        messages.append(f"{self.players[self.dealer]}'s hand ({hand_str}): {pts} pts")
        for b in bd:
            messages.append(f"    {b}")
        if self._check_win():
            self.round_messages.extend(messages)
            return

        # Crib
        pts, bd = score_hand(self.crib, self.starter, is_crib=True)
        self.scores[self.dealer] += pts
        crib_str = ' '.join(card_str(c) for c in self.crib)
        messages.append(f"{self.players[self.dealer]}'s crib ({crib_str}): {pts} pts")
        for b in bd:
            messages.append(f"    {b}")
        self._check_win()

        self.round_messages.extend(messages)

    def check_game_over(self):
        """Check if the game is over after a move."""
        if self.game_over:
            return

        if self.phase == "show":
            self._do_show_phase()
            if not self.game_over:
                self.phase = "round_over"

        if self.phase == "round_over":
            # Start next round
            self.dealer = 1 - self.dealer
            self._start_round()

    def get_state(self):
        """Return serializable game state."""
        return {
            "scores": list(self.scores),
            "target_score": self.target_score,
            "dealer": self.dealer,
            "hands": [list(h) for h in self.hands],
            "crib": list(self.crib),
            "starter": self.starter,
            "deck": list(self.deck),
            "phase": self.phase,
            "pegging_played": list(self.pegging_played),
            "pegging_hands": [list(h) for h in self.pegging_hands],
            "pegging_current": self.pegging_current,
            "pegging_total": self.pegging_total,
            "pegging_go": list(self.pegging_go),
            "pegging_last_player": self.pegging_last_player,
            "round_messages": list(self.round_messages),
        }

    def load_state(self, state):
        """Restore game state."""
        self.scores = list(state["scores"])
        self.target_score = state["target_score"]
        self.dealer = state["dealer"]
        self.hands = [list(h) for h in state["hands"]]
        self.crib = list(state["crib"])
        self.starter = state["starter"]
        self.deck = list(state["deck"])
        self.phase = state["phase"]
        self.pegging_played = list(state["pegging_played"])
        self.pegging_hands = [list(h) for h in state["pegging_hands"]]
        self.pegging_current = state["pegging_current"]
        self.pegging_total = state["pegging_total"]
        self.pegging_go = list(state["pegging_go"])
        self.pegging_last_player = state["pegging_last_player"]
        self.round_messages = list(state["round_messages"])
        # Convert card lists back to tuples
        self.hands = [[tuple(c) for c in h] for h in self.hands]
        self.crib = [tuple(c) for c in self.crib]
        if self.starter:
            self.starter = tuple(self.starter)
        self.deck = [tuple(c) for c in self.deck]
        self.pegging_played = [tuple(c) for c in self.pegging_played]
        self.pegging_hands = [[tuple(c) for c in h] for h in self.pegging_hands]

    def get_tutorial(self):
        """Return tutorial with rules and strategy hints."""
        return """
==================================================
  Cribbage - Tutorial
==================================================

  OVERVIEW:
  Cribbage is a classic card game for 2 players.
  Race to 121 points (or 61 in short game) by
  forming card combinations during play and in
  your hand.

  GAME FLOW:
  1. DEAL: 6 cards each. Discard 2 to the crib
     (extra hand belonging to the dealer).
  2. CUT: A starter card is revealed.
     - Heels: If it's a Jack, dealer gets 2 pts.
  3. PEGGING: Alternate playing cards, keeping a
     running total. Score points for:
     - Hitting exactly 15: 2 points
     - Hitting exactly 31: 2 points
     - Pairs (matching rank): 2 points
     - Three of a kind: 6 points
     - Runs (consecutive ranks): 1 pt per card
     - Last card played: 1 point
     - Cannot exceed 31; say 'go' if you can't
       play. Total resets after 31 or both pass.
  4. SHOW: Count hands (non-dealer first, then
     dealer, then crib):
     - 15s: each combo summing to 15 = 2 pts
     - Pairs: each pair of matching rank = 2 pts
     - Runs: each run of 3+ = 1 pt per card
     - Flush: 4 same suit in hand = 4 pts
       (5 with starter = 5 pts)
     - Nobs: Jack of starter's suit = 1 pt

  HOW TO PLAY:
  - Discard: Enter two card numbers, e.g. '1 3'
  - Pegging: Enter a card number to play, or
    type 'go' if you cannot play.

  STRATEGY HINTS:
  - Keep cards that work together (15s, runs,
    pairs) and discard weak cards to the crib.
  - When you're the dealer, discard good cards
    to YOUR crib. As non-dealer, avoid giving
    the dealer good crib cards (5s are dangerous).
  - During pegging, try to score 15s and 31s.
  - Avoid playing a 5 early in pegging (opponent
    can easily make 15 with a face card).
  - Leading with a 4 is often safe during pegging.

==================================================
"""
