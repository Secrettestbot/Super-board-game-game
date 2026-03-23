"""Skull King - Trick-taking card game with pirates.

Bid on tricks each round, special cards add chaos. Play over 10 rounds
with increasing hand sizes. Score points for accurate bids and bonus
cards captured.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

# Card types
SUITS = ["Parrot", "Treasure", "Jolly Roger", "Treasure Map"]
SUIT_SYMBOLS = {"Parrot": "P", "Treasure": "T", "Jolly Roger": "J", "Treasure Map": "M"}

SPECIAL_CARDS = ["Escape", "Pirate", "Skull King", "Mermaid", "Kraken", "White Whale"]


def make_deck(legendary=False):
    """Build a Skull King deck."""
    deck = []
    for suit in SUITS:
        for val in range(1, 15):
            deck.append({"type": "suited", "suit": suit, "value": val,
                         "name": f"{val} of {suit}"})
    # 5 Escape cards
    for i in range(5):
        deck.append({"type": "special", "suit": None, "value": 0,
                     "name": "Escape", "special": "Escape"})
    # 5 Pirate cards
    for i in range(5):
        deck.append({"type": "special", "suit": None, "value": 0,
                     "name": f"Pirate {i+1}", "special": "Pirate"})
    # 1 Skull King
    deck.append({"type": "special", "suit": None, "value": 0,
                 "name": "Skull King", "special": "Skull King"})
    if legendary:
        # 2 Mermaids
        for i in range(2):
            deck.append({"type": "special", "suit": None, "value": 0,
                         "name": f"Mermaid {i+1}", "special": "Mermaid"})
        # 1 Kraken
        deck.append({"type": "special", "suit": None, "value": 0,
                     "name": "Kraken", "special": "Kraken"})
    return deck


def card_str(card):
    if card["type"] == "suited":
        return f"{card['value']}{SUIT_SYMBOLS[card['suit']]}"
    return card["name"]


class SkullKingGame(BaseGame):
    """Skull King - Trick-taking card game with pirates."""

    name = "Skull King"
    description = "Trick-taking card game with pirates, bidding, and special cards"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Game",
        "legendary": "Legendary Expansion (mermaids/kraken)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.legendary = (self.variation == "legendary")
        self.round_number = 0
        self.max_rounds = 10
        self.hands = {"1": [], "2": []}
        self.bids = {"1": None, "2": None}
        self.tricks_won = {"1": 0, "2": 0}
        self.scores = {"1": 0, "2": 0}
        self.bonus_points = {"1": 0, "2": 0}
        self.trick_cards = []  # cards played this trick
        self.trick_leader = 1
        self.phase = "bidding"  # bidding, playing, round_end
        self.tricks_played = 0
        self.lead_suit = None
        self.log = []

    def setup(self):
        self.round_number = 0
        self.scores = {"1": 0, "2": 0}
        self.log = ["Skull King begins! Round 1."]
        self._start_round()

    def _start_round(self):
        self.round_number += 1
        deck = make_deck(self.legendary)
        random.shuffle(deck)
        hand_size = self.round_number
        self.hands = {"1": deck[:hand_size], "2": deck[hand_size:hand_size * 2]}
        self.bids = {"1": None, "2": None}
        self.tricks_won = {"1": 0, "2": 0}
        self.bonus_points = {"1": 0, "2": 0}
        self.trick_cards = []
        self.tricks_played = 0
        self.lead_suit = None
        self.phase = "bidding"
        self.current_player = 1
        self.trick_leader = ((self.round_number - 1) % 2) + 1

    def _determine_trick_winner(self):
        """Determine who wins the current trick."""
        if not self.trick_cards:
            return self.trick_leader
        cards = self.trick_cards
        p1_card = cards[0]
        p2_card = cards[1] if len(cards) > 1 else None
        if p2_card is None:
            return self.trick_leader

        leader = self.trick_leader
        follower = 2 if leader == 1 else 1
        lead_card = p1_card
        follow_card = p2_card

        # Kraken beats everything - trick goes to no one (leader keeps it for scoring)
        if self.legendary:
            for c in [lead_card, follow_card]:
                if c.get("special") == "Kraken":
                    return leader  # Kraken nullifies - leader wins by default

        # Skull King vs Mermaid special interaction
        lead_sp = lead_card.get("special", "")
        follow_sp = follow_card.get("special", "")

        if lead_sp == "Skull King" and follow_sp == "Mermaid":
            self.bonus_points[str(follower)] += 40
            return follower
        if follow_sp == "Skull King" and lead_sp == "Mermaid":
            self.bonus_points[str(leader)] += 40
            return leader

        # Skull King beats pirates
        if lead_sp == "Skull King" and follow_sp == "Pirate":
            self.bonus_points[str(leader)] += 30
            return leader
        if follow_sp == "Skull King" and lead_sp == "Pirate":
            self.bonus_points[str(follower)] += 30
            return follower

        # Skull King beats all suited
        if lead_sp == "Skull King":
            return leader
        if follow_sp == "Skull King":
            return follower

        # Pirates beat suited cards and escapes
        if lead_sp == "Pirate" and follow_sp != "Pirate":
            return leader
        if follow_sp == "Pirate" and lead_sp != "Pirate":
            return follower
        if lead_sp == "Pirate" and follow_sp == "Pirate":
            return leader  # first pirate wins

        # Mermaids beat suited cards
        if lead_sp == "Mermaid" and follow_sp not in ("Pirate", "Skull King", "Mermaid"):
            return leader
        if follow_sp == "Mermaid" and lead_sp not in ("Pirate", "Skull King", "Mermaid"):
            return follower
        if lead_sp == "Mermaid" and follow_sp == "Mermaid":
            return leader

        # Escape loses to everything
        if lead_sp == "Escape" and follow_sp == "Escape":
            return leader
        if lead_sp == "Escape":
            return follower
        if follow_sp == "Escape":
            return leader

        # Both suited
        lead_suit = lead_card.get("suit")
        follow_suit = follow_card.get("suit")

        # Jolly Roger is trump
        if lead_suit == "Jolly Roger" and follow_suit != "Jolly Roger":
            return leader
        if follow_suit == "Jolly Roger" and lead_suit != "Jolly Roger":
            return follower

        # Same suit or both trump - higher wins
        if lead_suit == follow_suit:
            return leader if lead_card["value"] > follow_card["value"] else follower

        # Different suits, no trump - leader wins
        return leader

    def _score_round(self):
        """Score the round for both players."""
        for p in ["1", "2"]:
            bid = self.bids[p]
            won = self.tricks_won[p]
            bonus = self.bonus_points[p]
            if bid == 0:
                # Bid zero: +round_number * 10 if correct, -round_number * 10 if wrong
                if won == 0:
                    self.scores[p] += self.round_number * 10
                else:
                    self.scores[p] -= self.round_number * 10
            else:
                if won == bid:
                    self.scores[p] += bid * 20 + bonus
                else:
                    diff = abs(won - bid)
                    self.scores[p] -= diff * 10

    def display(self):
        clear_screen()
        print(f"{'=' * 60}")
        mode = "Legendary" if self.legendary else "Standard"
        print(f"  SKULL KING - {mode} | Round {self.round_number}/{self.max_rounds}")
        print(f"{'=' * 60}")
        for p in [1, 2]:
            sp = str(p)
            marker = " <<" if p == self.current_player else ""
            bid_str = str(self.bids[sp]) if self.bids[sp] is not None else "?"
            print(f"  {self.players[p-1]}: Score={self.scores[sp]} | "
                  f"Bid={bid_str} | Tricks={self.tricks_won[sp]} | "
                  f"Cards={len(self.hands[sp])}{marker}")
        print()

        if self.trick_cards:
            print("  Trick table:")
            for i, c in enumerate(self.trick_cards):
                who = self.trick_leader if i == 0 else (2 if self.trick_leader == 1 else 1)
                print(f"    {self.players[who-1]}: {card_str(c)}")
            print()

        # Show current player's hand
        cp = str(self.current_player)
        if self.hands[cp]:
            hand_strs = [f"[{i+1}] {card_str(c)}" for i, c in enumerate(self.hands[cp])]
            print(f"  Your hand: {', '.join(hand_strs)}")
        print()
        print(f"  Phase: {self.phase} | Tricks played: {self.tricks_played}/{self.round_number}")
        if self.log:
            print(f"  Last: {self.log[-1]}")
        print()

    def get_move(self):
        cp = self.current_player
        sp = str(cp)

        if self.phase == "bidding":
            print(f"  {self.players[cp-1]}, how many tricks will you win? (0-{self.round_number})")
            val = input_with_quit("  Your bid: ").strip()
            try:
                bid = int(val)
                if 0 <= bid <= self.round_number:
                    return {"action": "bid", "bid": bid}
            except ValueError:
                pass
            return None

        elif self.phase == "playing":
            print(f"  {self.players[cp-1]}, play a card.")
            if self.lead_suit:
                print(f"  Lead suit: {self.lead_suit}")
            val = input_with_quit("  Card number: ").strip()
            try:
                idx = int(val) - 1
                if 0 <= idx < len(self.hands[sp]):
                    return {"action": "play", "index": idx}
            except ValueError:
                pass
            return None

        elif self.phase == "round_end":
            input_with_quit("  Press Enter to continue to next round...")
            return {"action": "next_round"}

        return None

    def make_move(self, move):
        if move is None:
            return False
        cp = self.current_player
        sp = str(cp)
        action = move["action"]

        if action == "bid":
            self.bids[sp] = move["bid"]
            self.log.append(f"{self.players[cp-1]} bid {move['bid']} tricks.")
            if self.bids["1"] is not None and self.bids["2"] is not None:
                self.phase = "playing"
                self.current_player = self.trick_leader
                self.log.append("Bidding complete! Play begins.")
                return True
            return True

        if action == "play":
            idx = move["index"]
            hand = self.hands[sp]
            if idx < 0 or idx >= len(hand):
                return False
            card = hand[idx]

            # Check lead suit following rule
            if self.trick_cards and self.lead_suit:
                if card["type"] == "suited" and card["suit"] != self.lead_suit:
                    has_lead = any(c["type"] == "suited" and c["suit"] == self.lead_suit
                                  for c in hand)
                    if has_lead:
                        return False  # Must follow suit

            # Play the card
            played = hand.pop(idx)
            self.trick_cards.append(played)

            # Set lead suit from first suited card played
            if len(self.trick_cards) == 1:
                if played["type"] == "suited":
                    self.lead_suit = played["suit"]
                else:
                    self.lead_suit = None

            self.log.append(f"{self.players[cp-1]} played {card_str(played)}")

            # Check if trick is complete
            if len(self.trick_cards) == 2:
                winner = self._determine_trick_winner()
                self.tricks_won[str(winner)] += 1
                self.log.append(f"{self.players[winner-1]} wins the trick!")
                self.trick_cards = []
                self.lead_suit = None
                self.tricks_played += 1
                self.trick_leader = winner
                self.current_player = winner

                # Check if round is over
                if self.tricks_played >= self.round_number:
                    self._score_round()
                    self.phase = "round_end"
                    self.log.append(
                        f"Round {self.round_number} over! "
                        f"Scores: {self.scores['1']} - {self.scores['2']}")
                return True

            return True

        if action == "next_round":
            if self.round_number >= self.max_rounds:
                self.game_over = True
                return True
            self._start_round()
            self.log.append(f"Round {self.round_number} begins! Hand size: {self.round_number}")
            return True

        return False

    def check_game_over(self):
        if self.round_number >= self.max_rounds and self.phase == "round_end":
            self.game_over = True
        if self.game_over:
            s1, s2 = self.scores["1"], self.scores["2"]
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            "round_number": self.round_number,
            "hands": self.hands,
            "bids": self.bids,
            "tricks_won": self.tricks_won,
            "scores": self.scores,
            "bonus_points": self.bonus_points,
            "trick_cards": self.trick_cards,
            "trick_leader": self.trick_leader,
            "phase": self.phase,
            "tricks_played": self.tricks_played,
            "lead_suit": self.lead_suit,
            "log": self.log,
        }

    def load_state(self, state):
        self.round_number = state["round_number"]
        self.hands = state["hands"]
        self.bids = state["bids"]
        self.tricks_won = state["tricks_won"]
        self.scores = state["scores"]
        self.bonus_points = state.get("bonus_points", {"1": 0, "2": 0})
        self.trick_cards = state["trick_cards"]
        self.trick_leader = state["trick_leader"]
        self.phase = state["phase"]
        self.tricks_played = state["tricks_played"]
        self.lead_suit = state["lead_suit"]
        self.log = state.get("log", [])

    def get_tutorial(self):
        extra = ""
        if self.legendary:
            extra = """
  LEGENDARY EXPANSION:
  - Mermaids: Beat Pirates but lose to Skull King.
    If Mermaid captures Skull King: +40 bonus!
  - Kraken: Nullifies the trick entirely.
"""
        return f"""
============================================================
  SKULL KING - Tutorial
============================================================

  OVERVIEW:
  A trick-taking card game played over 10 rounds.
  Round N deals N cards to each player.

  CARDS:
  - Suited cards (1-14) in 4 suits: Parrot, Treasure, Jolly Roger, Treasure Map
  - Jolly Roger suit is TRUMP (beats other suits)
  - Escape cards: Always lose
  - Pirates: Beat all suited cards
  - Skull King: Beats Pirates (+30 bonus per pirate captured)
{extra}
  BIDDING:
  - Before each round, bid how many tricks you'll win (0 to N)
  - Exact bid: +20 points per trick won, plus bonuses
  - Wrong bid: -10 per trick off
  - Bid 0 and succeed: +N*10. Fail: -N*10

  SUIT FOLLOWING:
  - Must follow the lead suit if you can
  - Special cards can always be played

  WINNING:
  - After 10 rounds, highest score wins!
============================================================
"""
