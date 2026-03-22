"""Hearts - A 2-player variant of the classic trick-taking card game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ['C', 'D', 'S', 'H']
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
    """Sort key: group by suit (CDSH order), then by rank."""
    return (SUITS.index(card[1]), rank_index(card[0]))


def make_deck():
    """Return a shuffled standard 52-card deck. Cards are (rank, suit) tuples."""
    deck = [(r, s) for s in SUITS for r in RANKS]
    random.shuffle(deck)
    return deck


def card_points(card):
    """Return point value of a card (hearts=1, QS=13, else 0)."""
    if card[1] == 'H':
        return 1
    if card == ('Q', 'S'):
        return 13
    return 0


PASS_DIRECTIONS = ['left', 'right', 'across', 'none']


class HeartsGame(BaseGame):
    """Hearts: A 2-player variant of the classic trick-taking card game."""

    name = "Hearts"
    description = "A 2-player variant of the classic trick-taking card game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Hearts (100 points)",
        "short": "Short Game (50 points)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.scores = [0, 0]
        self.target_score = 100
        self.hands = [[], []]
        self.hand_number = 0
        self.phase = "pass"  # pass, play, trick_done, hand_over
        self.hearts_broken = False
        self.current_trick = []  # list of (player_index, card)
        self.lead_suit = None
        self.trick_leader = 0
        self.tricks_taken = [[], []]  # cards won by each player
        self.hand_scores = [0, 0]
        self.first_trick = True
        self.pass_cards = [[], []]  # cards each player selected to pass
        self.round_messages = []
        self.two_of_clubs_player = None

    def setup(self):
        """Initialize for the first hand."""
        self.scores = [0, 0]
        self.target_score = 50 if self.variation == "short" else 100
        self.hand_number = 0
        self._start_hand()

    def _start_hand(self):
        """Deal a new hand."""
        deck = make_deck()
        self.hands = [sorted(deck[:13], key=card_sort_key),
                      sorted(deck[13:26], key=card_sort_key)]
        # Remaining 26 cards set aside (not used in 2-player variant)
        self.hearts_broken = False
        self.current_trick = []
        self.lead_suit = None
        self.tricks_taken = [[], []]
        self.hand_scores = [0, 0]
        self.first_trick = True
        self.pass_cards = [[], []]
        self.round_messages = []

        # Determine pass direction
        pass_dir = PASS_DIRECTIONS[self.hand_number % 4]
        if pass_dir == 'none':
            self.phase = "play"
            self._find_two_of_clubs_leader()
        else:
            self.phase = "pass"
            # Player 1 passes first
            self.current_player = 1

        self.hand_number += 1

    def _find_two_of_clubs_leader(self):
        """Find who has the 2 of clubs and set them as leader."""
        for i in range(2):
            if ('2', 'C') in self.hands[i]:
                self.trick_leader = i
                self.current_player = i + 1
                self.two_of_clubs_player = i
                return
        # Fallback: player 0 leads
        self.trick_leader = 0
        self.current_player = 1
        self.two_of_clubs_player = None

    def _pass_direction_name(self):
        """Return the name of the current pass direction."""
        idx = (self.hand_number) % 4  # hand_number already incremented
        # Before increment it would be hand_number-1, but we call this before increment
        # Actually we call after _start_hand which increments, so use hand_number-1
        return PASS_DIRECTIONS[(self.hand_number - 1) % 4]

    def display(self):
        """Display the current game state."""
        mode = "Standard (100)" if self.variation == "standard" else "Short (50)"
        print(f"\n  === Hearts ({mode}) ===")
        print(f"  Hand #{self.hand_number}")
        print()
        for i in range(2):
            print(f"  {self.players[i]}: {self.scores[i]} pts"
                  f"  (this hand: {self.hand_scores[i]} pts)")
        print()
        print(f"  Hearts broken: {'Yes' if self.hearts_broken else 'No'}")
        print()

        for msg in self.round_messages:
            print(f"  {msg}")
        if self.round_messages:
            print()

        cp = self.current_player - 1

        if self.phase == "pass":
            pass_dir = self._pass_direction_name()
            print(f"  Pass direction: {pass_dir}")
            print()
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

    def _get_playable_cards(self, player_idx):
        """Return list of cards the player can legally play."""
        hand = self.hands[player_idx]
        if not hand:
            return []

        # First trick of the hand: must lead 2 of clubs if you have it
        if self.first_trick and not self.current_trick:
            if ('2', 'C') in hand:
                return [('2', 'C')]

        # Leading a trick
        if not self.current_trick:
            if self.hearts_broken:
                return list(hand)
            else:
                non_hearts = [c for c in hand if c[1] != 'H']
                if non_hearts:
                    return non_hearts
                else:
                    # Only hearts left, can lead them
                    return list(hand)

        # Following suit
        lead = self.current_trick[0][1][1]  # suit of lead card
        follow = [c for c in hand if c[1] == lead]
        if follow:
            return follow

        # Can't follow suit
        if self.first_trick:
            # No hearts or QS on first trick (unless that's all you have)
            safe = [c for c in hand if c[1] != 'H' and c != ('Q', 'S')]
            if safe:
                return safe
        return list(hand)

    def get_move(self):
        """Get input from the current player."""
        cp = self.current_player - 1

        if self.phase == "pass":
            already = len(self.pass_cards[cp])
            remaining = 3 - already
            if remaining > 0:
                print(f"  {self.players[cp]}, choose {remaining} card(s) to pass.")
                if already > 0:
                    sel_str = ', '.join(card_str(c) for c in self.pass_cards[cp])
                    print(f"  Selected so far: {sel_str}")
                print("  Enter card number:")
                return input_with_quit("  Pass card: ").strip()
            return "done"

        elif self.phase == "play":
            playable = self._get_playable_cards(cp)
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
        if self.phase == "pass":
            return self._do_pass(move)
        elif self.phase == "play":
            return self._do_play(move)
        elif self.phase in ("trick_done", "hand_over"):
            return self._do_continue()
        return False

    def _do_pass(self, move):
        """Handle passing cards."""
        cp = self.current_player - 1

        if move == "done":
            return True

        try:
            idx = int(move) - 1
            if idx < 0 or idx >= len(self.hands[cp]):
                return False
        except ValueError:
            return False

        card = self.hands[cp][idx]
        if card in self.pass_cards[cp]:
            # Deselect
            self.pass_cards[cp].remove(card)
            return True

        if len(self.pass_cards[cp]) >= 3:
            print("  Already selected 3 cards. Play continues.")
            return False

        self.pass_cards[cp].append(card)

        if len(self.pass_cards[cp]) == 3:
            # This player is done passing
            if self.current_player == 1:
                # Switch to player 2
                self.current_player = 2
                return True
            else:
                # Both players done, execute the pass
                self._execute_pass()
                return True

        return True

    def _execute_pass(self):
        """Swap the selected pass cards between players."""
        for i in range(2):
            for card in self.pass_cards[i]:
                self.hands[i].remove(card)

        # In 2-player, left/right/across all mean swap with opponent
        for i in range(2):
            other = 1 - i
            self.hands[other].extend(self.pass_cards[i])

        # Re-sort hands
        self.hands[0].sort(key=card_sort_key)
        self.hands[1].sort(key=card_sort_key)

        self.pass_cards = [[], []]
        self.phase = "play"
        self._find_two_of_clubs_leader()

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
            input_with_quit("  Press Enter to continue...")
            return False

        # Play the card
        hand.pop(idx)
        self.current_trick.append((cp, card))

        # Check if hearts are broken
        if card[1] == 'H' and not self.hearts_broken:
            self.hearts_broken = True
            self.round_messages.append("Hearts have been broken!")

        # Check if trick is complete (2 cards played)
        if len(self.current_trick) == 2:
            self.phase = "trick_done"
            self._resolve_trick()
            return True

        # Switch to other player
        self.current_player = (1 - cp) + 1
        return True

    def _resolve_trick(self):
        """Determine winner of the current trick and assign points."""
        lead_suit = self.current_trick[0][1][1]
        best_player = self.current_trick[0][0]
        best_rank = rank_index(self.current_trick[0][1][0])

        for pi, card in self.current_trick[1:]:
            if card[1] == lead_suit and rank_index(card[0]) > best_rank:
                best_player = pi
                best_rank = rank_index(card[0])

        # Collect cards
        trick_cards = [card for _, card in self.current_trick]
        self.tricks_taken[best_player].extend(trick_cards)

        # Calculate points for this trick
        pts = sum(card_points(c) for c in trick_cards)
        self.hand_scores[best_player] += pts

        winner_name = self.players[best_player]
        trick_str = ' '.join(card_str(c) for c in trick_cards)
        msg = f"{winner_name} wins trick ({trick_str})"
        if pts > 0:
            msg += f" [{pts} pts]"
        self.round_messages.append(msg)

        # Set winner as next leader
        self.trick_leader = best_player
        self.first_trick = False

    def _do_continue(self):
        """Handle continue after trick or hand end."""
        if self.phase == "trick_done":
            # Check if hand is over (no cards left)
            if not self.hands[0] and not self.hands[1]:
                self._score_hand()
                self.phase = "hand_over"
            else:
                self.current_trick = []
                self.lead_suit = None
                self.current_player = self.trick_leader + 1
                self.phase = "play"
            return True

        if self.phase == "hand_over":
            if not self.game_over:
                self._start_hand()
            return True

        return True

    def _score_hand(self):
        """Score the completed hand, checking for shooting the moon."""
        for i in range(2):
            if self.hand_scores[i] == 26:
                # Shot the moon!
                other = 1 - i
                self.round_messages.append(
                    f"{self.players[i]} shot the moon! "
                    f"{self.players[other]} gets 26 points!"
                )
                self.scores[other] += 26
                self.round_messages.append(
                    f"Scores: {self.players[0]} = {self.scores[0]}, "
                    f"{self.players[1]} = {self.scores[1]}"
                )
                return

        for i in range(2):
            self.scores[i] += self.hand_scores[i]

        self.round_messages.append(
            f"Hand complete: {self.players[0]} +{self.hand_scores[0]}, "
            f"{self.players[1]} +{self.hand_scores[1]}"
        )
        self.round_messages.append(
            f"Scores: {self.players[0]} = {self.scores[0]}, "
            f"{self.players[1]} = {self.scores[1]}"
        )

    def check_game_over(self):
        """Check if someone has reached the target score."""
        if self.game_over:
            return
        for i in range(2):
            if self.scores[i] >= self.target_score:
                self.game_over = True
                # Lowest score wins
                if self.scores[0] < self.scores[1]:
                    self.winner = 1
                elif self.scores[1] < self.scores[0]:
                    self.winner = 2
                else:
                    self.winner = None  # tie
                return

    def switch_player(self):
        """Override: Hearts manages its own player switching."""
        pass

    def get_state(self):
        """Return serializable game state."""
        return {
            "scores": list(self.scores),
            "target_score": self.target_score,
            "hands": [list(self.hands[0]), list(self.hands[1])],
            "hand_number": self.hand_number,
            "phase": self.phase,
            "hearts_broken": self.hearts_broken,
            "current_trick": list(self.current_trick),
            "lead_suit": self.lead_suit,
            "trick_leader": self.trick_leader,
            "tricks_taken": [list(self.tricks_taken[0]), list(self.tricks_taken[1])],
            "hand_scores": list(self.hand_scores),
            "first_trick": self.first_trick,
            "pass_cards": [list(self.pass_cards[0]), list(self.pass_cards[1])],
            "round_messages": list(self.round_messages),
            "two_of_clubs_player": self.two_of_clubs_player,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.scores = list(state["scores"])
        self.target_score = state["target_score"]
        self.hands = [[tuple(c) for c in h] for h in state["hands"]]
        self.hand_number = state["hand_number"]
        self.phase = state["phase"]
        self.hearts_broken = state["hearts_broken"]
        self.current_trick = [(pi, tuple(c)) for pi, c in state["current_trick"]]
        self.lead_suit = state["lead_suit"]
        self.trick_leader = state["trick_leader"]
        self.tricks_taken = [[tuple(c) for c in t] for t in state["tricks_taken"]]
        self.hand_scores = list(state["hand_scores"])
        self.first_trick = state["first_trick"]
        self.pass_cards = [[tuple(c) for c in p] for p in state["pass_cards"]]
        self.round_messages = list(state["round_messages"])
        self.two_of_clubs_player = state["two_of_clubs_player"]

    def get_tutorial(self):
        """Return tutorial text for Hearts."""
        return """
==================================================
  Hearts - Tutorial (2-Player Variant)
==================================================

  OVERVIEW:
  Hearts is a trick-taking card game where the
  goal is to AVOID taking points. The player with
  the lowest score when someone reaches the target
  wins.

  SETUP:
  - Standard 52-card deck. Each player is dealt 13
    cards. The remaining 26 cards are set aside.

  PASSING:
  - Before each hand, pass 3 cards to your opponent.
  - The pass direction rotates each hand:
    left, right, across, no pass (then repeats).
  - In the 2-player variant, all directions pass
    to your single opponent except "no pass."

  PLAY:
  - The player with the 2 of clubs leads it to
    start the first trick.
  - You must follow the lead suit if you can.
  - If you cannot follow suit, you may play any
    card EXCEPT: no hearts or Queen of Spades on
    the first trick (unless that is all you have).
  - Hearts cannot be LED until they are "broken"
    (a heart has been discarded on a previous trick).
  - Highest card of the lead suit wins the trick.
    (Cards of other suits cannot win.)

  SCORING:
  - Each heart card = 1 point
  - Queen of Spades = 13 points
  - Total points per hand = 26
  - LOW SCORE WINS!

  SHOOTING THE MOON:
  - If one player takes ALL 26 points in a hand,
    they "shoot the moon" - the opponent gets 26
    points instead!

  GAME END:
  - The game ends when a player reaches 100 points
    (or 50 in the short variant).
  - The player with the LOWEST score wins.

  HOW TO PLAY:
  - Enter the card number from your hand to play.
  - During passing, enter card numbers one at a
    time to select 3 cards to pass.

  STRATEGY HINTS:
  - Avoid taking hearts and especially the Queen
    of Spades (13 points!).
  - Try to void a suit early so you can dump
    point cards when that suit is led.
  - If you have the Queen of Spades, try to get
    rid of it when you cannot follow suit.
  - Consider shooting the moon if you have many
    high hearts and the Queen of Spades.

==================================================
"""
