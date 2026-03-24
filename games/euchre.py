"""Euchre - A 2-player variant of the classic trick-taking card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ['C', 'D', 'H', 'S']
SUIT_SYMBOLS = {'H': '\u2665', 'D': '\u2666', 'C': '\u2663', 'S': '\u2660'}
SUIT_NAMES = {'H': 'Hearts', 'D': 'Diamonds', 'C': 'Clubs', 'S': 'Spades'}
SUIT_COLORS = {'H': 'red', 'D': 'red', 'C': 'black', 'S': 'black'}
SAME_COLOR = {'H': 'D', 'D': 'H', 'C': 'S', 'S': 'C'}
RANKS = ['9', '10', 'J', 'Q', 'K', 'A']
SUIT_FROM_NAME = {'hearts': 'H', 'diamonds': 'D', 'clubs': 'C', 'spades': 'S'}


def card_str(card):
    """Format a card for display: e.g. ('10','H') -> '10H'."""
    return f"{card[0]}{SUIT_SYMBOLS[card[1]]}"


def make_deck():
    """Return a shuffled 24-card Euchre deck. Cards are (rank, suit) tuples."""
    deck = [(r, s) for s in SUITS for r in RANKS]
    random.shuffle(deck)
    return deck


def effective_suit(card, trump):
    """Return the effective suit of a card considering the left bower."""
    rank, suit = card
    if rank == 'J' and suit == SAME_COLOR[trump]:
        return trump
    return suit


def card_trick_value(card, trump, led_suit):
    """Return a numeric value for comparing cards in a trick.

    Higher value wins. Trump cards beat all non-trump.
    Right bower > Left bower > A > K > Q > 10 > 9 of trump.
    """
    rank, suit = card
    eff_suit = effective_suit(card, trump)
    base_ranks = {'9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5}

    if eff_suit == trump:
        # Right bower (Jack of trump suit)
        if rank == 'J' and suit == trump:
            return 200
        # Left bower (Jack of same-color suit)
        if rank == 'J' and suit == SAME_COLOR[trump]:
            return 190
        return 100 + base_ranks[rank]
    elif eff_suit == led_suit:
        return base_ranks[rank]
    else:
        return -1  # Cannot win if not following suit and not trump


def card_sort_key(card, trump):
    """Sort key: trump suit last, then by suit, then by rank within suit."""
    rank, suit = card
    eff = effective_suit(card, trump)
    base_ranks = {'9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5}

    if eff == trump:
        suit_order = 4  # Trump goes last (rightmost)
        if rank == 'J' and suit == trump:
            rank_order = 8  # Right bower highest
        elif rank == 'J' and suit == SAME_COLOR[trump]:
            rank_order = 7  # Left bower second
        else:
            rank_order = base_ranks[rank]
    else:
        suit_order = SUITS.index(suit)
        rank_order = base_ranks[rank]

    return (suit_order, rank_order)


class EuchreGame(BaseGame):
    """Euchre: A 2-player variant of the classic trick-taking card game."""

    name = "Euchre"
    description = "A 2-player variant of the classic trick-taking card game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Euchre",
        "stick_the_dealer": "Stick the Dealer (must call)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.scores = [0, 0]
        self.target_score = 10
        self.hands = [[], []]
        self.dealer = 0  # index: 0 or 1
        self.trump = None
        self.maker = None  # index of player who called trump
        self.kitty_card = None
        self.phase = "bid_round1"
        # bid_round1, bid_round2, discard, play, trick_done, hand_over
        self.current_trick = []  # list of (player_index, card)
        self.trick_leader = 0
        self.tricks_won = [0, 0]
        self.bid_turn = 0  # index of player currently bidding
        self.round_messages = []
        self.hand_number = 0

    def setup(self):
        """Initialize for the first hand."""
        self.scores = [0, 0]
        self.hand_number = 0
        self.dealer = random.randint(0, 1)
        self._start_hand()

    def _start_hand(self):
        """Deal a new hand."""
        self.hand_number += 1
        deck = make_deck()
        self.hands = [deck[:5], deck[5:10]]
        self.kitty_card = deck[10]
        self.trump = None
        self.maker = None
        self.current_trick = []
        self.tricks_won = [0, 0]
        self.phase = "bid_round1"
        # Non-dealer bids first
        self.bid_turn = 1 - self.dealer
        self.trick_leader = 1 - self.dealer  # Non-dealer leads first trick
        self.current_player = self.bid_turn + 1  # 1-indexed for BaseGame
        self.round_messages = []
        self._sort_hands()

    def _sort_hands(self):
        """Sort both hands. Use trump if known, else by default suit order."""
        trump = self.trump if self.trump else 'S'  # Default sort before trump chosen
        for i in range(2):
            self.hands[i].sort(key=lambda c: card_sort_key(c, trump))

    def _valid_plays(self, player_idx):
        """Return list of cards the player can legally play."""
        hand = self.hands[player_idx]
        if not self.current_trick:
            return list(hand)
        led_card = self.current_trick[0][1]
        led_suit = effective_suit(led_card, self.trump)
        # Must follow suit (considering left bower as trump)
        follow = [c for c in hand if effective_suit(c, self.trump) == led_suit]
        if follow:
            return follow
        return list(hand)

    def display(self):
        """Display the current game state."""
        print(f"\n{'='*50}")
        print(f"  EUCHRE  -  Hand #{self.hand_number}")
        print(f"{'='*50}")
        print(f"  {self.players[0]}: {self.scores[0]} pts"
              f"{'  [DEALER]' if self.dealer == 0 else ''}")
        print(f"  {self.players[1]}: {self.scores[1]} pts"
              f"{'  [DEALER]' if self.dealer == 1 else ''}")
        print(f"  First to {self.target_score} wins.")
        print(f"{'='*50}")

        if self.trump:
            print(f"  Trump: {SUIT_NAMES[self.trump]} {SUIT_SYMBOLS[self.trump]}")
            print(f"  Maker: {self.players[self.maker]}")
        elif self.kitty_card and self.phase.startswith("bid"):
            print(f"  Turned up card: {card_str(self.kitty_card)}")

        if self.phase == "play" or self.phase == "trick_done":
            print(f"  Tricks - {self.players[0]}: {self.tricks_won[0]},"
                  f"  {self.players[1]}: {self.tricks_won[1]}")

        if self.current_trick:
            print(f"\n  Current trick:")
            for pi, c in self.current_trick:
                print(f"    {self.players[pi]}: {card_str(c)}")
        print()

        for msg in self.round_messages:
            print(f"  {msg}")
        if self.round_messages:
            print()

        # Show current player's hand
        if not self.game_over:
            cp = self.current_player - 1  # 0-indexed
            hand = self.hands[cp]
            print(f"  {self.players[cp]}'s hand:")
            display_parts = []
            for i, c in enumerate(hand):
                display_parts.append(f"  [{i}] {card_str(c)}")
            print("  " + "  ".join(display_parts))
            print()

    def get_move(self):
        """Get a move from the current player."""
        cp = self.current_player - 1

        if self.phase == "bid_round1":
            suit_name = SUIT_NAMES[self.kitty_card[1]]
            if cp == 1 - self.dealer:
                prompt = (f"  {self.players[cp]}: Order up {suit_name}? "
                          f"(order/pass): ")
            else:
                prompt = (f"  {self.players[cp]}: Pick up {suit_name}? "
                          f"(order/pass): ")
            choice = input_with_quit(prompt).strip().lower()
            return ("bid1", choice)

        elif self.phase == "bid_round2":
            turned_suit = self.kitty_card[1]
            available = [s for s in SUITS if s != turned_suit]
            avail_names = [SUIT_NAMES[s].lower() for s in available]
            stick = (self.variation == "stick_the_dealer" and cp == self.dealer)
            if stick:
                prompt = (f"  {self.players[cp]}: You must call trump. "
                          f"Name suit ({'/'.join(avail_names)}): ")
            else:
                prompt = (f"  {self.players[cp]}: Name trump suit "
                          f"({'/'.join(avail_names)}/pass): ")
            choice = input_with_quit(prompt).strip().lower()
            return ("bid2", choice)

        elif self.phase == "discard":
            prompt = (f"  {self.players[cp]}: Choose a card to discard "
                      f"(0-{len(self.hands[cp])-1}): ")
            choice = input_with_quit(prompt).strip()
            return ("discard", choice)

        elif self.phase == "play":
            valid = self._valid_plays(cp)
            prompt = (f"  {self.players[cp]}: Play a card "
                      f"(0-{len(self.hands[cp])-1}): ")
            choice = input_with_quit(prompt).strip()
            return ("play", choice)

        elif self.phase == "trick_done":
            input_with_quit("  Press Enter to continue...")
            return ("continue", "")

        elif self.phase == "hand_over":
            input_with_quit("  Press Enter for next hand...")
            return ("next_hand", "")

        return ("unknown", "")

    def make_move(self, move):
        """Apply a move to the game state. Returns True if valid."""
        action, value = move
        cp = self.current_player - 1

        if action == "bid1":
            return self._handle_bid_round1(cp, value)
        elif action == "bid2":
            return self._handle_bid_round2(cp, value)
        elif action == "discard":
            return self._handle_discard(cp, value)
        elif action == "play":
            return self._handle_play(cp, value)
        elif action == "continue":
            return self._handle_trick_done()
        elif action == "next_hand":
            return self._handle_next_hand()
        return False

    def _handle_bid_round1(self, cp, value):
        """Handle first round of bidding (on the turned-up card)."""
        if value == "order":
            trump_suit = self.kitty_card[1]
            self.trump = trump_suit
            self.maker = cp
            # Dealer picks up the kitty card
            self.hands[self.dealer].append(self.kitty_card)
            self.round_messages.append(
                f"{self.players[cp]} ordered up {SUIT_NAMES[trump_suit]}!")
            if self.dealer == cp:
                self.round_messages[-1] = (
                    f"{self.players[cp]} picked up {SUIT_NAMES[trump_suit]}!")
            self.phase = "discard"
            self.current_player = self.dealer + 1
            self._sort_hands()
            return True
        elif value == "pass":
            self.round_messages.append(f"{self.players[cp]} passed.")
            if cp == self.dealer:
                # Both passed round 1, move to round 2
                self.phase = "bid_round2"
                self.bid_turn = 1 - self.dealer
                self.current_player = self.bid_turn + 1
            else:
                # Non-dealer passed, dealer's turn
                self.bid_turn = self.dealer
                self.current_player = self.dealer + 1
            return True
        return False

    def _handle_bid_round2(self, cp, value):
        """Handle second round of bidding (naming any other suit)."""
        turned_suit = self.kitty_card[1]
        stick = (self.variation == "stick_the_dealer" and cp == self.dealer)

        if value == "pass":
            if stick:
                # Dealer must call in stick-the-dealer
                return False
            self.round_messages.append(f"{self.players[cp]} passed.")
            if cp == self.dealer:
                # Both passed round 2: redeal
                self.round_messages.append("All passed! Redealing...")
                self.dealer = 1 - self.dealer
                self._start_hand()
                self.round_messages.append("New hand dealt after all players passed.")
                return True
            else:
                self.bid_turn = self.dealer
                self.current_player = self.dealer + 1
                return True
        elif value in SUIT_FROM_NAME:
            chosen = SUIT_FROM_NAME[value]
            if chosen == turned_suit:
                self.round_messages.append(
                    f"Cannot name {SUIT_NAMES[turned_suit]}; it was turned down.")
                return False
            self.trump = chosen
            self.maker = cp
            self.round_messages.append(
                f"{self.players[cp]} called {SUIT_NAMES[chosen]} as trump!")
            self.phase = "play"
            self.current_player = self.trick_leader + 1
            self._sort_hands()
            return True
        return False

    def _handle_discard(self, cp, value):
        """Dealer discards one card after picking up kitty."""
        try:
            idx = int(value)
        except ValueError:
            return False
        if idx < 0 or idx >= len(self.hands[cp]):
            return False
        discarded = self.hands[cp].pop(idx)
        self.round_messages.append(
            f"{self.players[cp]} discarded {card_str(discarded)}.")
        self.phase = "play"
        self.current_player = self.trick_leader + 1
        self._sort_hands()
        return True

    def _handle_play(self, cp, value):
        """Handle playing a card."""
        try:
            idx = int(value)
        except ValueError:
            return False
        hand = self.hands[cp]
        if idx < 0 or idx >= len(hand):
            return False
        card = hand[idx]
        valid = self._valid_plays(cp)
        if card not in valid:
            self.round_messages.append("You must follow suit!")
            return False
        hand.pop(idx)
        self.current_trick.append((cp, card))

        if len(self.current_trick) == 2:
            # Trick complete
            self.phase = "trick_done"
            led_suit = effective_suit(self.current_trick[0][1], self.trump)
            val0 = card_trick_value(
                self.current_trick[0][1], self.trump, led_suit)
            val1 = card_trick_value(
                self.current_trick[1][1], self.trump, led_suit)
            if val0 >= val1:
                winner = self.current_trick[0][0]
            else:
                winner = self.current_trick[1][0]
            self.tricks_won[winner] += 1
            self.trick_leader = winner
            self.round_messages = [
                f"{self.players[winner]} wins the trick! "
                f"(Tricks: {self.tricks_won[0]}-{self.tricks_won[1]})"
            ]
            self.current_player = cp + 1  # Stay for display
        else:
            # Second player's turn
            self.current_player = (1 - cp) + 1
            self.round_messages = []
        return True

    def _handle_trick_done(self):
        """After viewing trick result, start next trick or end hand."""
        self.current_trick = []
        if not self.hands[0] and not self.hands[1]:
            # Hand is over
            self._score_hand()
            self.phase = "hand_over"
        else:
            self.phase = "play"
            self.current_player = self.trick_leader + 1
        return True

    def _score_hand(self):
        """Score the completed hand."""
        maker = self.maker
        defender = 1 - maker
        maker_tricks = self.tricks_won[maker]
        self.round_messages = []

        if maker_tricks >= 5:
            pts = 2
            self.round_messages.append(
                f"{self.players[maker]} made a MARCH! (+{pts} points)")
        elif maker_tricks >= 3:
            pts = 1
            self.round_messages.append(
                f"{self.players[maker]} made their bid! (+{pts} point)")
        else:
            pts = 0
            euchre_pts = 2
            self.round_messages.append(
                f"{self.players[maker]} was EUCHRED! "
                f"{self.players[defender]} gets +{euchre_pts} points!")

        if maker_tricks >= 3:
            self.scores[maker] += pts
        else:
            self.scores[defender] += 2

        self.round_messages.append(
            f"Score: {self.players[0]} {self.scores[0]} - "
            f"{self.players[1]} {self.scores[1]}")

    def _handle_next_hand(self):
        """Start the next hand."""
        self.check_game_over()
        if not self.game_over:
            self.dealer = 1 - self.dealer
            self._start_hand()
        return True

    def check_game_over(self):
        """Check if a player has reached the target score."""
        for i in range(2):
            if self.scores[i] >= self.target_score:
                self.game_over = True
                self.winner = i + 1  # 1-indexed
                return
        self.game_over = False

    def switch_player(self):
        """Override: player switching is handled internally."""
        pass

    def get_state(self):
        """Return serializable game state for saving."""
        return {
            'scores': self.scores,
            'hands': [[(r, s) for r, s in h] for h in self.hands],
            'dealer': self.dealer,
            'trump': self.trump,
            'maker': self.maker,
            'kitty_card': list(self.kitty_card) if self.kitty_card else None,
            'phase': self.phase,
            'current_trick': [(pi, list(c)) for pi, c in self.current_trick],
            'trick_leader': self.trick_leader,
            'tricks_won': self.tricks_won,
            'bid_turn': self.bid_turn,
            'hand_number': self.hand_number,
            'round_messages': self.round_messages,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.scores = state['scores']
        self.hands = [[tuple(c) for c in h] for h in state['hands']]
        self.dealer = state['dealer']
        self.trump = state['trump']
        self.maker = state['maker']
        self.kitty_card = tuple(state['kitty_card']) if state['kitty_card'] else None
        self.phase = state['phase']
        self.current_trick = [(pi, tuple(c)) for pi, c in state['current_trick']]
        self.trick_leader = state['trick_leader']
        self.tricks_won = state['tricks_won']
        self.bid_turn = state['bid_turn']
        self.hand_number = state['hand_number']
        self.round_messages = state.get('round_messages', [])

    def get_tutorial(self):
        """Return tutorial text for Euchre."""
        return """
==================================================
  EUCHRE TUTORIAL (2-Player Variant)
==================================================

  OVERVIEW:
  Euchre is a trick-taking card game using a 24-card deck
  (9, 10, J, Q, K, A in four suits). The goal is to be
  the first player to reach 10 points.

  DEALING:
  Each player is dealt 5 cards. One card is turned face-up
  from the remaining deck (the "kitty card").

  BIDDING (2 rounds):
  Round 1: Starting with the non-dealer, each player may
  "order up" the turned-up card's suit as trump, or pass.
  If ordered up, the dealer picks up the kitty card and
  discards one card from their hand.

  Round 2: If both players pass in round 1, each may name
  any OTHER suit as trump, or pass. If both pass again,
  the hand is redealt with the other player as dealer.
  (In "Stick the Dealer" mode, the dealer must call.)

  TRUMP RANKING (highest to lowest):
  1. Right Bower - Jack of the trump suit
  2. Left Bower  - Jack of the same-color suit
  3. A, K, Q, 10, 9 of trump suit

  PLAY:
  Non-dealer leads the first trick. You must follow the
  led suit if you can (the Left Bower counts as trump,
  not its printed suit). Highest trump wins; if no trump,
  highest card of the led suit wins.

  SCORING:
  - Maker wins 3-4 tricks: 1 point
  - Maker wins all 5 tricks (march): 2 points
  - Maker wins fewer than 3 (euchred): defender gets 2 pts

  COMMANDS:
  - "order" or "pass" during bidding
  - Suit name (e.g., "hearts") to name trump
  - Card number (0, 1, 2...) to play a card
  - "quit" to exit, "save" to save game

==================================================
"""
