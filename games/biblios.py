"""Biblios - Card drafting and auction game.

Phase 1 (Gift Phase): Draw cards, keep some, give some to opponent, put some
in auction pile. Phase 2 (Auction Phase): Bid on auctioned cards using gold
cards. Most influence in each scripture category wins that die. Dice values
are adjustable during the game.
"""

import random

from engine.base import BaseGame, input_with_quit, clear_screen

CATEGORIES_FULL = ["Pigments", "Holy Books", "Manuscripts", "Scrolls", "Relics"]
CATEGORIES_QUICK = ["Pigments", "Holy Books", "Manuscripts"]
CAT_ABBREV = {"Pigments": "Pig", "Holy Books": "HB", "Manuscripts": "Man",
              "Scrolls": "Scr", "Relics": "Rel"}


def build_deck(categories):
    """Build the card deck for given categories."""
    deck = []
    card_id = 0

    # Influence cards: 3 cards per category with values 1-3
    for cat in categories:
        for val in [1, 1, 2, 2, 3]:
            deck.append({"id": card_id, "type": "influence", "category": cat, "value": val})
            card_id += 1

    # Gold cards (used for bidding in auction phase)
    for val in [1, 1, 1, 2, 2, 2, 3, 3, 3, 4]:
        deck.append({"id": card_id, "type": "gold", "value": val})
        card_id += 1

    # Church cards (adjust die values)
    for cat in categories:
        deck.append({"id": card_id, "type": "church", "category": cat, "adjust": 1})
        card_id += 1
        deck.append({"id": card_id, "type": "church", "category": cat, "adjust": -1})
        card_id += 1

    return deck


def card_str(card):
    """Format a card for display."""
    if card["type"] == "influence":
        return f"[{CAT_ABBREV.get(card['category'], card['category'])} {card['value']}]"
    elif card["type"] == "gold":
        return f"[Gold {card['value']}]"
    elif card["type"] == "church":
        sign = "+" if card["adjust"] > 0 else ""
        return f"[Church: {CAT_ABBREV.get(card['category'], card['category'])} {sign}{card['adjust']}]"
    return "[???]"


class BibliosGame(BaseGame):
    """Biblios - Card drafting and auction game."""

    name = "Biblios"
    description = "Draft cards, adjust dice, then auction for scripture category majorities"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Full game with 5 scripture categories and complete deck",
        "quick": "Shorter game with 3 categories and fewer cards",
    }

    def setup(self):
        if self.variation == "quick":
            self.categories = list(CATEGORIES_QUICK)
            self.cards_per_draft = 3
        else:
            self.categories = list(CATEGORIES_FULL)
            self.cards_per_draft = 4

        # Dice values for each category (start at 3)
        self.dice = {cat: 3 for cat in self.categories}

        # Build and shuffle deck
        self.deck = build_deck(self.categories)
        random.shuffle(self.deck)

        # Player hands and the auction pile
        self.hands = {1: [], 2: []}
        self.auction_pile = []

        # Phase tracking
        self.phase = "draft"  # "draft" or "auction"
        self.draft_cards = []  # Cards drawn for current draft turn
        self.draft_step = 0   # Which card in draft we're deciding on

        # Auction state
        self.auction_index = 0
        self.current_auction_card = None
        self.bids = {1: 0, 2: 0}
        self.bid_phase_player = 1  # Who bids first
        self.bid_done = {1: False, 2: False}

        self.message = ""
        self.phase_message = "Draft Phase: Draw cards and decide their fate!"

    def display(self):
        clear_screen()
        print(f"=== Biblios - {self.variation.title()} ===")
        print(f"Phase: {self.phase.upper()} | Turn {self.turn_number + 1}")
        print(f"{self.players[self.current_player - 1]}'s turn")
        print()

        # Dice values
        print("Category Dice:")
        for cat in self.categories:
            print(f"  {CAT_ABBREV[cat]:4s}: {'*' * self.dice[cat]} ({self.dice[cat]})")
        print()

        # Player info (show only current player's hand)
        for p in [1, 2]:
            if p == self.current_player:
                hand = self.hands[p]
                influence = [c for c in hand if c["type"] == "influence"]
                gold = [c for c in hand if c["type"] == "gold"]
                church = [c for c in hand if c["type"] == "church"]
                print(f"{self.players[p-1]}'s hand ({len(hand)} cards):")
                if influence:
                    print(f"  Influence: {' '.join(card_str(c) for c in influence)}")
                if gold:
                    print(f"  Gold: {' '.join(card_str(c) for c in gold)}")
                if church:
                    print(f"  Church: {' '.join(card_str(c) for c in church)}")
            else:
                print(f"{self.players[p-1]}: {len(self.hands[p])} cards in hand")
        print()

        print(f"Deck: {len(self.deck)} | Auction pile: {len(self.auction_pile)}")
        print()

        if self.phase_message:
            print(self.phase_message)
        if self.message:
            print(self.message)
            self.message = ""

    def get_move(self):
        if self.phase == "draft":
            return self._get_draft_move()
        else:
            return self._get_auction_move()

    def _get_draft_move(self):
        """Handle draft phase: draw cards and assign them."""
        if not self.draft_cards:
            # Draw new set of cards
            n = min(self.cards_per_draft, len(self.deck))
            if n == 0:
                return "end_draft"
            self.draft_cards = [self.deck.pop() for _ in range(n)]
            self.draft_step = 0

        card = self.draft_cards[self.draft_step]
        print(f"\nCard {self.draft_step + 1}/{len(self.draft_cards)}: {card_str(card)}")
        print("Action: (k)eep, (g)ive to opponent, (a)uction pile")
        choice = input_with_quit("> ").strip().lower()
        return f"draft:{choice}"

    def _get_auction_move(self):
        """Handle auction phase: bid on cards."""
        if self.current_auction_card is None:
            if self.auction_index >= len(self.auction_pile):
                return "end_auction"
            self.current_auction_card = self.auction_pile[self.auction_index]
            self.bids = {1: 0, 2: 0}
            self.bid_done = {1: False, 2: False}

        card = self.current_auction_card
        print(f"\nAuction card: {card_str(card)}")
        print(f"Current bids - {self.players[0]}: {self.bids[1]}, {self.players[1]}: {self.bids[2]}")

        total_gold = sum(c["value"] for c in self.hands[self.current_player] if c["type"] == "gold")
        print(f"Your available gold: {total_gold}")
        print("Enter bid amount (0 to pass):")
        bid = input_with_quit("> ").strip()
        return f"bid:{bid}"

    def make_move(self, move):
        if move == "end_draft":
            self._start_auction()
            return True

        if move == "end_auction":
            self.game_over = True
            self._determine_winner()
            return True

        if move.startswith("draft:"):
            return self._handle_draft(move[6:])
        elif move.startswith("bid:"):
            return self._handle_bid(move[4:])

        self.message = "Invalid move."
        return False

    def _handle_draft(self, choice):
        if choice not in ("k", "keep", "g", "give", "a", "auction"):
            self.message = "Choose (k)eep, (g)ive, or (a)uction."
            return False

        card = self.draft_cards[self.draft_step]

        # Apply church cards immediately when assigned
        if choice in ("k", "keep"):
            if card["type"] == "church":
                self._apply_church(card)
            else:
                self.hands[self.current_player].append(card)
        elif choice in ("g", "give"):
            other = 2 if self.current_player == 1 else 1
            if card["type"] == "church":
                self._apply_church(card)
            else:
                self.hands[other].append(card)
        elif choice in ("a", "auction"):
            self.auction_pile.append(card)

        self.draft_step += 1
        if self.draft_step >= len(self.draft_cards):
            self.draft_cards = []
            self.draft_step = 0
            # Check if deck is empty
            if not self.deck:
                self._start_auction()
            return True

        return True

    def _apply_church(self, card):
        """Apply a church card to adjust a die."""
        cat = card["category"]
        self.dice[cat] = max(1, min(6, self.dice[cat] + card["adjust"]))
        self.message = f"Church card: {CAT_ABBREV[cat]} die adjusted to {self.dice[cat]}"

    def _start_auction(self):
        """Transition to auction phase."""
        self.phase = "auction"
        self.auction_index = 0
        self.current_auction_card = None
        random.shuffle(self.auction_pile)
        self.phase_message = "Auction Phase: Bid gold to win cards!"

    def _handle_bid(self, bid_str):
        try:
            bid = int(bid_str)
        except ValueError:
            self.message = "Enter a number."
            return False

        if bid < 0:
            self.message = "Bid must be non-negative."
            return False

        total_gold = sum(c["value"] for c in self.hands[self.current_player] if c["type"] == "gold")
        if bid > total_gold:
            self.message = f"You only have {total_gold} gold."
            return False

        self.bids[self.current_player] = bid
        self.bid_done[self.current_player] = True

        if all(self.bid_done.values()):
            # Resolve auction
            self._resolve_auction()
            return True

        return True

    def _resolve_auction(self):
        """Resolve the current auction."""
        card = self.current_auction_card
        b1, b2 = self.bids[1], self.bids[2]

        if b1 > b2:
            winner = 1
        elif b2 > b1:
            winner = 2
        else:
            # Tie: first bidder wins
            winner = self.bid_phase_player

        # Winner gets card, pays gold
        if card["type"] == "church":
            self._apply_church(card)
        else:
            self.hands[winner].append(card)

        # Remove gold cards to pay
        self._pay_gold(winner, self.bids[winner])

        self.message = f"{self.players[winner-1]} wins the auction for {card_str(card)} with bid {self.bids[winner]}!"

        # Next auction card
        self.auction_index += 1
        self.current_auction_card = None
        self.bid_done = {1: False, 2: False}

        # Alternate who bids first
        self.bid_phase_player = 2 if self.bid_phase_player == 1 else 1

    def _pay_gold(self, player, amount):
        """Remove gold cards from player's hand to pay amount."""
        if amount <= 0:
            return
        gold_cards = sorted(
            [c for c in self.hands[player] if c["type"] == "gold"],
            key=lambda c: c["value"]
        )
        paid = 0
        to_remove = []
        for gc in gold_cards:
            if paid >= amount:
                break
            to_remove.append(gc["id"])
            paid += gc["value"]
        self.hands[player] = [c for c in self.hands[player] if c["id"] not in to_remove]

    def check_game_over(self):
        if self.phase == "auction" and self.auction_index >= len(self.auction_pile):
            self.game_over = True
            self._determine_winner()

    def _determine_winner(self):
        """Score each category and determine winner."""
        scores = {1: 0, 2: 0}

        for cat in self.categories:
            inf1 = sum(c["value"] for c in self.hands[1]
                      if c["type"] == "influence" and c["category"] == cat)
            inf2 = sum(c["value"] for c in self.hands[2]
                      if c["type"] == "influence" and c["category"] == cat)

            if inf1 > inf2:
                scores[1] += self.dice[cat]
            elif inf2 > inf1:
                scores[2] += self.dice[cat]
            # Tie: nobody gets the die

        self.final_scores = dict(scores)
        if scores[1] > scores[2]:
            self.winner = 1
        elif scores[2] > scores[1]:
            self.winner = 2
        else:
            self.winner = None

    def get_state(self):
        def serialize_cards(cards):
            return [dict(c) for c in cards]

        return {
            "categories": list(self.categories),
            "dice": dict(self.dice),
            "deck": serialize_cards(self.deck),
            "hands": {str(k): serialize_cards(v) for k, v in self.hands.items()},
            "auction_pile": serialize_cards(self.auction_pile),
            "phase": self.phase,
            "draft_cards": serialize_cards(self.draft_cards),
            "draft_step": self.draft_step,
            "auction_index": self.auction_index,
            "current_auction_card": dict(self.current_auction_card) if self.current_auction_card else None,
            "bids": {str(k): v for k, v in self.bids.items()},
            "bid_phase_player": self.bid_phase_player,
            "bid_done": {str(k): v for k, v in self.bid_done.items()},
            "cards_per_draft": self.cards_per_draft,
            "message": self.message,
            "phase_message": self.phase_message,
        }

    def load_state(self, state):
        self.categories = state["categories"]
        self.dice = state["dice"]
        self.deck = state["deck"]
        self.hands = {int(k): v for k, v in state["hands"].items()}
        self.auction_pile = state["auction_pile"]
        self.phase = state["phase"]
        self.draft_cards = state["draft_cards"]
        self.draft_step = state["draft_step"]
        self.auction_index = state["auction_index"]
        self.current_auction_card = state["current_auction_card"]
        self.bids = {int(k): v for k, v in state["bids"].items()}
        self.bid_phase_player = state["bid_phase_player"]
        self.bid_done = {int(k): v for k, v in state["bid_done"].items()}
        self.cards_per_draft = state["cards_per_draft"]
        self.message = state.get("message", "")
        self.phase_message = state.get("phase_message", "")

    def get_tutorial(self):
        return """
=== BIBLIOS TUTORIAL ===

OVERVIEW:
  Biblios is a card drafting and auction game about collecting scripture
  categories. The game has two phases: Draft and Auction.

PHASE 1 - DRAFT:
  On your turn, draw cards one at a time (4 in standard, 3 in quick).
  For each card, choose:
    (k)eep  - Add to your hand
    (g)ive  - Give to your opponent
    (a)uction - Put in the auction pile for Phase 2

  Card types:
    Influence - Score in a category (e.g., [Pig 3] = 3 Pigments influence)
    Gold      - Used for bidding in the auction phase
    Church    - Immediately adjusts a category die value up or down

PHASE 2 - AUCTION:
  Cards from the auction pile are revealed one at a time.
  Both players secretly bid gold. Highest bidder wins the card
  and pays their bid in gold cards.

SCORING:
  For each category, the player with more influence wins that die.
  Die values start at 3 but can be adjusted by Church cards (range 1-6).
  Total your won dice values. Highest total wins!

STRATEGY:
  - Balance keeping influence cards vs. gold for auctions
  - Church cards can dramatically shift category values
  - Give low-value cards to opponents, auction the rest
"""
