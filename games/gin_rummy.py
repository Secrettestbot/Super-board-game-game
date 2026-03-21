"""Gin Rummy - A classic 2-player card game of forming melds and reducing deadwood."""

import random
from itertools import combinations
from engine.base import BaseGame, input_with_quit, clear_screen


SUITS = ['H', 'D', 'C', 'S']
SUIT_SYMBOLS = {'H': '\u2665', 'D': '\u2666', 'C': '\u2663', 'S': '\u2660'}
SUIT_ORDER = {'S': 0, 'H': 1, 'D': 2, 'C': 3}
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']


def card_value(card):
    """Return the deadwood value of a card (A=1, face=10, others=face value)."""
    rank = card[0]
    if rank == 'A':
        return 1
    if rank in ('J', 'Q', 'K'):
        return 10
    return int(rank)


def rank_index(card):
    """Return the rank index (A=0, 2=1, ..., K=12)."""
    return RANKS.index(card[0])


def card_str(card):
    """Format a card for display: e.g. ('10','H') -> '10\u2665'."""
    return f"{card[0]}{SUIT_SYMBOLS[card[1]]}"


def card_sort_key(card):
    """Sort key: by rank then suit."""
    return (rank_index(card), SUIT_ORDER[card[1]])


def make_deck():
    """Return a shuffled standard 52-card deck. Cards are (rank, suit) tuples."""
    deck = [(r, s) for s in SUITS for r in RANKS]
    random.shuffle(deck)
    return deck


def find_best_melds(hand):
    """Find the arrangement of melds that minimizes deadwood.

    Returns (melds, deadwood_cards, deadwood_value) where melds is a list of
    lists of cards.
    """
    all_possible = _find_all_melds(hand)
    best_melds = []
    best_deadwood = list(hand)
    best_value = sum(card_value(c) for c in hand)

    # Try all combinations of non-overlapping melds
    _search_melds(all_possible, [], set(), hand, best_melds, best_deadwood,
                  best_value, [None])

    result_melds = best_melds if best_melds != [] else []
    # Use the stored best from the mutable container
    return result_melds, _get_deadwood_cards(hand, result_melds), _get_deadwood_value(hand, result_melds)


def _search_melds(all_melds, current_melds, used_cards, hand,
                  best_melds_ref, best_dw_ref, best_val_ref, container):
    """Recursively search for best non-overlapping meld combination."""
    if container[0] is None:
        container[0] = best_val_ref

    dw_val = _get_deadwood_value(hand, current_melds)
    if dw_val < container[0]:
        container[0] = dw_val
        best_melds_ref.clear()
        best_melds_ref.extend([list(m) for m in current_melds])
        best_dw_ref.clear()
        best_dw_ref.extend(_get_deadwood_cards(hand, current_melds))

    for i, meld in enumerate(all_melds):
        meld_set = frozenset(meld)
        if not meld_set & used_cards:
            new_used = used_cards | meld_set
            current_melds.append(meld)
            _search_melds(all_melds[i + 1:], current_melds, new_used, hand,
                          best_melds_ref, best_dw_ref, best_val_ref, container)
            current_melds.pop()


def _find_all_melds(hand):
    """Find all possible melds (sets and runs) in a hand."""
    melds = []

    # Find sets (3 or 4 cards of the same rank)
    by_rank = {}
    for card in hand:
        by_rank.setdefault(card[0], []).append(card)
    for rank, cards in by_rank.items():
        if len(cards) >= 3:
            for combo in combinations(cards, 3):
                melds.append(list(combo))
            if len(cards) >= 4:
                melds.append(list(cards[:4]))

    # Find runs (3+ consecutive cards of the same suit)
    by_suit = {}
    for card in hand:
        by_suit.setdefault(card[1], []).append(card)
    for suit, cards in by_suit.items():
        sorted_cards = sorted(cards, key=rank_index)
        indices = [rank_index(c) for c in sorted_cards]
        # Find all runs of length 3+
        for start in range(len(sorted_cards)):
            run = [sorted_cards[start]]
            for j in range(start + 1, len(sorted_cards)):
                if indices[j] == indices[j - 1] + 1:
                    run.append(sorted_cards[j])
                    if len(run) >= 3:
                        melds.append(list(run))
                else:
                    break

    return melds


def _get_deadwood_cards(hand, melds):
    """Return cards not in any meld."""
    melded = set()
    for meld in melds:
        for card in meld:
            melded.add(card)
    return [c for c in hand if c not in melded]


def _get_deadwood_value(hand, melds):
    """Return total deadwood value."""
    return sum(card_value(c) for c in _get_deadwood_cards(hand, melds))


def can_lay_off(card, melds):
    """Check if a card can extend any of the given melds."""
    for meld in melds:
        if _card_extends_meld(card, meld):
            return True
    return False


def _card_extends_meld(card, meld):
    """Check if a single card can be added to a meld."""
    # Set meld: all same rank
    if len(set(c[0] for c in meld)) == 1:
        if card[0] == meld[0][0] and len(meld) < 4:
            return True
        return False

    # Run meld: consecutive same suit
    if card[1] != meld[0][1]:
        return False
    indices = sorted(rank_index(c) for c in meld)
    ci = rank_index(card)
    if ci == indices[0] - 1 or ci == indices[-1] + 1:
        return True
    return False


def lay_off_card(card, melds):
    """Add a card to the first meld it extends. Returns True if successful."""
    for meld in melds:
        if _card_extends_meld(card, meld):
            meld.append(card)
            meld.sort(key=card_sort_key)
            return True
    return False


class GinRummyGame(BaseGame):
    """Gin Rummy: A classic card game of forming melds and reducing deadwood."""

    name = "Gin Rummy"
    description = "A classic 2-player card game of forming melds and reducing deadwood"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Gin Rummy",
        "oklahoma": "Oklahoma Gin (variable knock value)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.scores = [0, 0]
        self.target_score = 100
        self.dealer = 0
        self.hands = [[], []]
        self.draw_pile = []
        self.discard_pile = []
        self.phase = "draw"  # draw, discard, knock_melds, opponent_layoff, scoring, round_over
        self.knock_value = 10  # max deadwood to knock (varies in Oklahoma)
        self.knocker = None
        self.knocker_melds = []
        self.knocker_deadwood = []
        self.opponent_melds = []
        self.opponent_deadwood = []
        self.round_messages = []
        self.hand_number = 0

    def setup(self):
        """Initialize for the first round."""
        self.scores = [0, 0]
        self.dealer = 0
        self.hand_number = 0
        self._start_round()

    def _start_round(self):
        """Deal a new hand."""
        self.hand_number += 1
        deck = make_deck()
        non_dealer = 1 - self.dealer
        # Deal 10 cards each, non-dealer first
        self.hands[non_dealer] = deck[:10]
        self.hands[self.dealer] = deck[10:20]
        self.discard_pile = [deck[20]]
        self.draw_pile = deck[21:]
        # Sort hands
        self.hands[0].sort(key=card_sort_key)
        self.hands[1].sort(key=card_sort_key)
        self.phase = "draw"
        self.knocker = None
        self.knocker_melds = []
        self.knocker_deadwood = []
        self.opponent_melds = []
        self.opponent_deadwood = []
        self.round_messages = []
        # Non-dealer goes first
        self.current_player = non_dealer + 1  # 1-indexed

        # Oklahoma variant: initial discard sets knock value
        if self.variation == "oklahoma":
            self.knock_value = card_value(self.discard_pile[0])
        else:
            self.knock_value = 10

    def display(self):
        """Display the current game state."""
        variant = "Oklahoma" if self.variation == "oklahoma" else "Standard"
        print(f"\n  === Gin Rummy ({variant}) ===")
        print(f"  Hand #{self.hand_number}  |  Knock threshold: {self.knock_value}")
        print()
        for i in range(2):
            marker = " (dealer)" if i == self.dealer else ""
            print(f"  {self.players[i]}{marker}: {self.scores[i]} pts")
        print(f"  First to {self.target_score} wins.")
        print()

        for msg in self.round_messages:
            print(f"  {msg}")
        if self.round_messages:
            print()

        # Show draw/discard pile info
        top_discard = card_str(self.discard_pile[-1]) if self.discard_pile else "(empty)"
        print(f"  Draw pile: {len(self.draw_pile)} cards remaining")
        print(f"  Discard pile top: {top_discard}")
        print()

        if self.phase in ("draw", "discard"):
            cp = self.current_player - 1
            hand = self.hands[cp]
            melds, dw_cards, dw_val = find_best_melds(hand)
            melded_set = set()
            for meld in melds:
                for c in meld:
                    melded_set.add(c)

            print(f"  {self.players[cp]}'s hand (deadwood: {dw_val}):")
            for i, c in enumerate(hand):
                marker = " *" if c in melded_set else ""
                print(f"    {i + 1:2d}: {card_str(c)}{marker}")
            if melds:
                meld_strs = [' '.join(card_str(c) for c in m) for m in melds]
                print(f"  Melds: {' | '.join(meld_strs)}")
            print()

        elif self.phase == "knock_melds":
            cp = self.knocker
            hand = self.hands[cp]
            melds, dw_cards, dw_val = find_best_melds(hand)
            melded_set = set()
            for meld in melds:
                for c in meld:
                    melded_set.add(c)
            print(f"  {self.players[cp]} is knocking! (deadwood: {dw_val})")
            print(f"  {self.players[cp]}'s hand:")
            for i, c in enumerate(hand):
                marker = " *" if c in melded_set else ""
                print(f"    {i + 1:2d}: {card_str(c)}{marker}")
            if melds:
                meld_strs = [' '.join(card_str(c) for c in m) for m in melds]
                print(f"  Melds: {' | '.join(meld_strs)}")
            print()

        elif self.phase == "opponent_layoff":
            opp = 1 - self.knocker
            print(f"  {self.players[self.knocker]}'s melds:")
            for m in self.knocker_melds:
                print(f"    {' '.join(card_str(c) for c in m)}")
            print(f"  {self.players[self.knocker]}'s deadwood: "
                  f"{sum(card_value(c) for c in self.knocker_deadwood)}")
            print()
            print(f"  {self.players[opp]}'s hand:")
            opp_melds_set = set()
            for m in self.opponent_melds:
                for c in m:
                    opp_melds_set.add(c)
            for i, c in enumerate(self.opponent_deadwood):
                layoff_ok = can_lay_off(c, self.knocker_melds)
                marker = " (can lay off)" if layoff_ok else ""
                print(f"    {i + 1:2d}: {card_str(c)}{marker}")
            if self.opponent_melds:
                meld_strs = [' '.join(card_str(c) for c in m) for m in self.opponent_melds]
                print(f"  Your melds: {' | '.join(meld_strs)}")
            print()

        elif self.phase == "scoring":
            # Show final scoring details
            print(f"  --- Scoring ---")
            print(f"  {self.players[self.knocker]}'s melds:")
            for m in self.knocker_melds:
                print(f"    {' '.join(card_str(c) for c in m)}")
            k_dw = sum(card_value(c) for c in self.knocker_deadwood)
            print(f"  Deadwood: {k_dw}")
            print()
            opp = 1 - self.knocker
            print(f"  {self.players[opp]}'s melds:")
            for m in self.opponent_melds:
                print(f"    {' '.join(card_str(c) for c in m)}")
            o_dw = sum(card_value(c) for c in self.opponent_deadwood)
            print(f"  Deadwood: {o_dw}")
            print()

    def get_move(self):
        """Get input from the current player."""
        if self.phase == "draw":
            cp = self.current_player - 1
            print(f"  {self.players[cp]}, draw a card.")
            print("  Commands: 'draw deck', 'draw discard', 'knock', 'gin', 'big gin'")
            return input_with_quit("  > ").strip().lower()

        elif self.phase == "discard":
            cp = self.current_player - 1
            print(f"  {self.players[cp]}, discard a card.")
            print("  Enter card number to discard (e.g. 'discard 3'),")
            print("  or 'knock' to knock, or 'gin' for gin.")
            return input_with_quit("  > ").strip().lower()

        elif self.phase == "knock_melds":
            print("  Press Enter to confirm melds (auto-detected).")
            return input_with_quit("  > ").strip().lower()

        elif self.phase == "opponent_layoff":
            opp = 1 - self.knocker
            print(f"  {self.players[opp]}, lay off cards on knocker's melds.")
            print("  Enter card number to lay off, or 'done' when finished.")
            return input_with_quit("  > ").strip().lower()

        elif self.phase in ("scoring", "round_over"):
            input_with_quit("  Press Enter to continue...")
            return "continue"

        return ""

    def make_move(self, move):
        """Process the move based on current phase."""
        if self.phase == "draw":
            return self._do_draw(move)
        elif self.phase == "discard":
            return self._do_discard(move)
        elif self.phase == "knock_melds":
            return self._do_knock_melds(move)
        elif self.phase == "opponent_layoff":
            return self._do_layoff(move)
        elif self.phase in ("scoring", "round_over"):
            return True
        return False

    def _do_draw(self, move):
        """Handle the draw phase."""
        cp = self.current_player - 1

        # Check for Big Gin before drawing
        if move == "big gin":
            melds, dw_cards, dw_val = find_best_melds(self.hands[cp])
            if dw_val == 0 and len(self.hands[cp]) == 10:
                # Need all 10 cards in melds - but big gin requires 11 cards
                # Big gin only works if player can form melds with all 11 cards
                print("  Big Gin requires 11 cards in melds. Draw first.")
                input("  Press Enter to continue...")
                return False
            print("  Big Gin requires 0 deadwood with all 11 cards. Draw first.")
            input("  Press Enter to continue...")
            return False

        if move == "draw deck":
            if not self.draw_pile:
                self.round_messages.append("Draw pile empty - hand is a draw.")
                self.phase = "round_over"
                return True
            card = self.draw_pile.pop(0)
            self.hands[cp].append(card)
            self.hands[cp].sort(key=card_sort_key)
            self.phase = "discard"
            return True

        elif move == "draw discard":
            if not self.discard_pile:
                print("  Discard pile is empty!")
                input("  Press Enter to continue...")
                return False
            card = self.discard_pile.pop()
            self.hands[cp].append(card)
            self.hands[cp].sort(key=card_sort_key)
            self.phase = "discard"
            return True

        elif move in ("knock", "gin"):
            # Player must draw first before knocking/gin
            print("  You must draw a card first!")
            input("  Press Enter to continue...")
            return False

        else:
            print("  Invalid command. Use 'draw deck' or 'draw discard'.")
            input("  Press Enter to continue...")
            return False

    def _do_discard(self, move):
        """Handle the discard phase, including knock/gin declarations."""
        cp = self.current_player - 1
        hand = self.hands[cp]

        # Check for Big Gin (all 11 cards form melds, no discard needed)
        if move == "big gin":
            melds, dw_cards, dw_val = find_best_melds(hand)
            if dw_val == 0 and len(hand) == 11:
                self.knocker = cp
                self.knocker_melds = melds
                self.knocker_deadwood = []
                self._score_hand(bonus_type="big_gin")
                return True
            else:
                print(f"  Cannot Big Gin - deadwood is {dw_val} (need 0 with all 11 cards).")
                input("  Press Enter to continue...")
                return False

        # Knock or gin: must specify which card to discard
        if move.startswith("knock") or move == "gin":
            parts = move.split()
            if len(parts) == 1 and move == "gin":
                # Auto-detect: try all possible discards for gin
                for i in range(len(hand)):
                    remaining = hand[:i] + hand[i + 1:]
                    _, _, dw = find_best_melds(remaining)
                    if dw == 0:
                        discard_card = hand[i]
                        self.hands[cp] = remaining
                        self.discard_pile.append(discard_card)
                        self.knocker = cp
                        melds, dw_cards, dw_val = find_best_melds(self.hands[cp])
                        self.knocker_melds = melds
                        self.knocker_deadwood = dw_cards
                        self._score_hand(bonus_type="gin")
                        return True
                print("  Cannot Gin - no discard leaves 0 deadwood.")
                input("  Press Enter to continue...")
                return False

            if len(parts) == 2 and parts[0] == "knock":
                try:
                    idx = int(parts[1]) - 1
                except ValueError:
                    return False
                if idx < 0 or idx >= len(hand):
                    print("  Invalid card number.")
                    input("  Press Enter to continue...")
                    return False
                # Check if knocking is possible after discarding this card
                remaining = hand[:idx] + hand[idx + 1:]
                melds, dw_cards, dw_val = find_best_melds(remaining)
                if dw_val > self.knock_value:
                    print(f"  Cannot knock - deadwood would be {dw_val} (max {self.knock_value}).")
                    input("  Press Enter to continue...")
                    return False
                discard_card = hand[idx]
                self.hands[cp] = remaining
                self.discard_pile.append(discard_card)
                self.knocker = cp
                self.knocker_melds = melds
                self.knocker_deadwood = dw_cards
                if dw_val == 0:
                    self._score_hand(bonus_type="gin")
                else:
                    self.phase = "knock_melds"
                return True

            if len(parts) == 2 and parts[0] == "gin":
                try:
                    idx = int(parts[1]) - 1
                except ValueError:
                    return False
                if idx < 0 or idx >= len(hand):
                    print("  Invalid card number.")
                    input("  Press Enter to continue...")
                    return False
                remaining = hand[:idx] + hand[idx + 1:]
                melds, dw_cards, dw_val = find_best_melds(remaining)
                if dw_val != 0:
                    print(f"  Cannot Gin - deadwood would be {dw_val} (need 0).")
                    input("  Press Enter to continue...")
                    return False
                discard_card = hand[idx]
                self.hands[cp] = remaining
                self.discard_pile.append(discard_card)
                self.knocker = cp
                self.knocker_melds = melds
                self.knocker_deadwood = dw_cards
                self._score_hand(bonus_type="gin")
                return True

            print("  Usage: 'knock <card#>' or 'gin' or 'gin <card#>'")
            input("  Press Enter to continue...")
            return False

        # Regular discard
        if move.startswith("discard"):
            parts = move.split()
            if len(parts) != 2:
                print("  Usage: 'discard <card#>'")
                input("  Press Enter to continue...")
                return False
            try:
                idx = int(parts[1]) - 1
            except ValueError:
                return False
            if idx < 0 or idx >= len(hand):
                print("  Invalid card number.")
                input("  Press Enter to continue...")
                return False
            discard_card = hand.pop(idx)
            self.discard_pile.append(discard_card)
            self.phase = "draw"
            # Check for draw pile exhaustion
            if len(self.draw_pile) == 0:
                self.round_messages.append("Draw pile empty - hand is a draw.")
                self.phase = "round_over"
            return True

        # Try parsing as just a number (shorthand for discard)
        try:
            idx = int(move) - 1
            if 0 <= idx < len(hand):
                discard_card = hand.pop(idx)
                self.discard_pile.append(discard_card)
                self.phase = "draw"
                if len(self.draw_pile) == 0:
                    self.round_messages.append("Draw pile empty - hand is a draw.")
                    self.phase = "round_over"
                return True
        except ValueError:
            pass

        print("  Invalid command. Use 'discard <#>', '<#>', 'knock <#>', 'gin', or 'big gin'.")
        input("  Press Enter to continue...")
        return False

    def _do_knock_melds(self, move):
        """Confirm knocker's melds and move to opponent layoff phase."""
        # Auto-detected melds, just confirm
        opp = 1 - self.knocker
        opp_melds, opp_dw, opp_dw_val = find_best_melds(self.hands[opp])
        self.opponent_melds = opp_melds
        self.opponent_deadwood = opp_dw
        self.phase = "opponent_layoff"
        self.current_player = opp + 1
        return True

    def _do_layoff(self, move):
        """Handle opponent laying off cards on knocker's melds."""
        if move == "done" or move == "":
            self._score_hand(bonus_type="knock")
            return True

        try:
            idx = int(move) - 1
        except ValueError:
            print("  Enter a card number or 'done'.")
            input("  Press Enter to continue...")
            return False

        if idx < 0 or idx >= len(self.opponent_deadwood):
            print("  Invalid card number.")
            input("  Press Enter to continue...")
            return False

        card = self.opponent_deadwood[idx]
        if lay_off_card(card, self.knocker_melds):
            self.opponent_deadwood.pop(idx)
            self.round_messages.append(
                f"  {self.players[1 - self.knocker]} lays off {card_str(card)}")
            return True
        else:
            print(f"  {card_str(card)} cannot be laid off on any of the knocker's melds.")
            input("  Press Enter to continue...")
            return False

    def _score_hand(self, bonus_type="knock"):
        """Score the completed hand and set up for next round or game end."""
        knocker = self.knocker
        opp = 1 - knocker

        # Calculate opponent melds/deadwood if not done yet
        if not self.opponent_melds and not self.opponent_deadwood:
            opp_melds, opp_dw, _ = find_best_melds(self.hands[opp])
            self.opponent_melds = opp_melds
            self.opponent_deadwood = opp_dw

        k_dw_val = sum(card_value(c) for c in self.knocker_deadwood)
        o_dw_val = sum(card_value(c) for c in self.opponent_deadwood)

        self.round_messages = []

        if bonus_type == "big_gin":
            points = o_dw_val + 31
            self.scores[knocker] += points
            self.round_messages.append(
                f"BIG GIN! {self.players[knocker]} scores {points} points! "
                f"(opponent deadwood {o_dw_val} + 31 bonus)")

        elif bonus_type == "gin":
            points = o_dw_val + 25
            self.scores[knocker] += points
            self.round_messages.append(
                f"GIN! {self.players[knocker]} scores {points} points! "
                f"(opponent deadwood {o_dw_val} + 25 bonus)")

        else:  # regular knock
            if o_dw_val <= k_dw_val:
                # Undercut!
                points = k_dw_val - o_dw_val + 25
                self.scores[opp] += points
                self.round_messages.append(
                    f"UNDERCUT! {self.players[opp]} scores {points} points! "
                    f"(difference {k_dw_val - o_dw_val} + 25 bonus)")
            else:
                points = o_dw_val - k_dw_val
                self.scores[knocker] += points
                self.round_messages.append(
                    f"{self.players[knocker]} scores {points} points! "
                    f"(deadwood difference: {o_dw_val} - {k_dw_val})")

        self.phase = "scoring"

    def check_game_over(self):
        """Check if the game is over after a move."""
        if self.game_over:
            return

        if self.phase == "scoring":
            # Check if anyone reached target
            for i in range(2):
                if self.scores[i] >= self.target_score:
                    self.game_over = True
                    self.winner = i + 1
                    return
            self.phase = "round_over"

        if self.phase == "round_over":
            # Start next round, switch dealer
            self.dealer = 1 - self.dealer
            self._start_round()

    def switch_player(self):
        """Override: only switch during draw phase transitions."""
        # Player switching is handled internally based on phase
        if self.phase == "draw":
            super().switch_player()

    def get_state(self):
        """Return serializable game state."""
        return {
            "scores": list(self.scores),
            "target_score": self.target_score,
            "dealer": self.dealer,
            "hands": [list(h) for h in self.hands],
            "draw_pile": list(self.draw_pile),
            "discard_pile": list(self.discard_pile),
            "phase": self.phase,
            "knock_value": self.knock_value,
            "knocker": self.knocker,
            "knocker_melds": [list(m) for m in self.knocker_melds],
            "knocker_deadwood": list(self.knocker_deadwood),
            "opponent_melds": [list(m) for m in self.opponent_melds],
            "opponent_deadwood": list(self.opponent_deadwood),
            "round_messages": list(self.round_messages),
            "hand_number": self.hand_number,
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.scores = list(state["scores"])
        self.target_score = state["target_score"]
        self.dealer = state["dealer"]
        self.hands = [[tuple(c) for c in h] for h in state["hands"]]
        self.draw_pile = [tuple(c) for c in state["draw_pile"]]
        self.discard_pile = [tuple(c) for c in state["discard_pile"]]
        self.phase = state["phase"]
        self.knock_value = state["knock_value"]
        self.knocker = state["knocker"]
        self.knocker_melds = [[tuple(c) for c in m] for m in state["knocker_melds"]]
        self.knocker_deadwood = [tuple(c) for c in state["knocker_deadwood"]]
        self.opponent_melds = [[tuple(c) for c in m] for m in state["opponent_melds"]]
        self.opponent_deadwood = [tuple(c) for c in state["opponent_deadwood"]]
        self.round_messages = list(state["round_messages"])
        self.hand_number = state["hand_number"]

    def get_tutorial(self):
        """Return tutorial text for Gin Rummy."""
        return """
==================================================
  Gin Rummy - Tutorial
==================================================

  OVERVIEW:
  Gin Rummy is a classic 2-player card game.
  Form melds to reduce your deadwood (unmelded
  cards) and be the first to reach 100 points
  across multiple hands.

  MELDS:
  - Sets: 3 or 4 cards of the same rank
    (e.g. 7H 7D 7C)
  - Runs: 3+ consecutive cards of the same suit
    (e.g. 4S 5S 6S 7S)

  CARD VALUES (for deadwood):
  - Ace = 1 point
  - Number cards = face value
  - Face cards (J, Q, K) = 10 points

  GAME FLOW:
  1. DEAL: 10 cards each. One card placed face-up
     as the discard pile. Rest is the draw pile.
  2. Each turn:
     a. DRAW: Take from draw pile ('draw deck')
        or discard pile ('draw discard').
     b. DISCARD: Put one card on discard pile
        ('discard <#>' or just the card number).

  ENDING A HAND:
  - KNOCK: When your deadwood <= 10, you can
    knock ('knock <card#>'). Lay down your melds;
    opponent can lay off cards on your melds.
  - GIN: Knock with 0 deadwood ('gin' or
    'gin <card#>'). Bonus 25 points. Opponent
    cannot lay off cards.
  - BIG GIN: All 11 cards form melds before
    discarding ('big gin'). Bonus 31 points.

  SCORING:
  - Knocker scores difference in deadwood values.
  - If opponent's deadwood <= knocker's deadwood,
    it's an UNDERCUT: opponent scores the
    difference + 25 bonus points.
  - Gin bonus: 25 points + opponent's deadwood.
  - Big Gin bonus: 31 points + opponent's deadwood.
  - Game ends when a player reaches 100 points.

  OKLAHOMA VARIANT:
  The value of the initial face-up card sets the
  maximum deadwood value for knocking that hand.

  DISPLAY:
  - Cards marked with * are part of detected melds.
  - Your current deadwood value is shown.

  COMMANDS:
  - 'draw deck'    - Draw from draw pile
  - 'draw discard' - Take top of discard pile
  - 'discard <#>'  - Discard card by number
  - '<#>'          - Shorthand for discard
  - 'knock <#>'    - Knock and discard card #
  - 'gin'          - Declare Gin (auto-pick discard)
  - 'gin <#>'      - Declare Gin discarding card #
  - 'big gin'      - Declare Big Gin (11-card meld)
  - 'done'         - Finish laying off cards

==================================================
"""
