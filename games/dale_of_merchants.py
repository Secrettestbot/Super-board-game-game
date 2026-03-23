"""Dale of Merchants - A deck-building animalfolk stall game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen


# Animalfolk types and their special abilities
ANIMALFOLK = {
    "Macaws": {"color": "Red", "ability": "draw_extra", "desc": "Draw an extra card when purchasing"},
    "Chameleons": {"color": "Green", "ability": "copy", "desc": "Copy another card's value"},
    "Pandas": {"color": "Black", "desc": "Gain bonus when building stalls", "ability": "stall_bonus"},
    "Squirrels": {"color": "Brown", "ability": "hoard", "desc": "Keep extra cards in hand"},
    "Ocelots": {"color": "Gold", "ability": "sneak", "desc": "Peek at top of deck"},
    "Platypuses": {"color": "Teal", "ability": "versatile", "desc": "Cards count as any type for stalls"},
}

ANIMALFOLK_LIST = list(ANIMALFOLK.keys())


def _make_card(name, folk, value, ability=None):
    """Create a card dictionary."""
    return {
        "name": name,
        "folk": folk,
        "value": value,
        "ability": ability,
    }


def _generate_market_deck(folk_types):
    """Generate the shared market deck from chosen animalfolk types."""
    deck = []
    for folk in folk_types:
        info = ANIMALFOLK[folk]
        for v in range(1, 6):
            card_name = f"{folk} {v}"
            ability = info["ability"] if v >= 3 else None
            deck.append(_make_card(card_name, folk, v, ability))
    random.shuffle(deck)
    return deck


def _starting_deck():
    """Each player starts with 10 junk cards (value 1 each, no folk)."""
    deck = []
    for i in range(10):
        deck.append(_make_card("Junk", "None", 1, None))
    random.shuffle(deck)
    return deck


def _card_str(card):
    """Short string representation of a card."""
    folk_tag = card["folk"][:3] if card["folk"] != "None" else "---"
    ab = "*" if card.get("ability") else ""
    return f"[{folk_tag}:{card['value']}{ab}]{card['name']}"


class DaleOfMerchantsGame(BaseGame):
    """Dale of Merchants: Build stalls from animalfolk card sets."""

    name = "Dale of Merchants"
    description = "Deck-building animalfolk stall game - buy cards, build stalls to win"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard game (8 stalls to win)",
        "quick": "Quick game (5 stalls to win)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.stalls_to_win = 8
        self.market_deck = []
        self.market_display = []
        self.market_size = 5
        self.player_decks = [[], []]
        self.player_hands = [[], []]
        self.player_discards = [[], []]
        self.player_stalls = [[], []]
        self.player_stall_count = [0, 0]
        self.active_folk = []
        self.phase = "action"

    def setup(self):
        if self.variation == "quick":
            self.stalls_to_win = 5
        # Pick 4 animalfolk types
        self.active_folk = random.sample(ANIMALFOLK_LIST, 4)
        self.market_deck = _generate_market_deck(self.active_folk)
        self._refill_market()
        for i in range(2):
            self.player_decks[i] = _starting_deck()
            random.shuffle(self.player_decks[i])
            self._draw_cards(i, 5)

    def _refill_market(self):
        while len(self.market_display) < self.market_size and self.market_deck:
            self.market_display.append(self.market_deck.pop())

    def _draw_cards(self, player_idx, count):
        for _ in range(count):
            if not self.player_decks[player_idx]:
                if self.player_discards[player_idx]:
                    self.player_decks[player_idx] = self.player_discards[player_idx][:]
                    self.player_discards[player_idx] = []
                    random.shuffle(self.player_decks[player_idx])
                else:
                    break
            if self.player_decks[player_idx]:
                self.player_hands[player_idx].append(self.player_decks[player_idx].pop())

    def _hand_value(self, player_idx, card_indices):
        total = 0
        hand = self.player_hands[player_idx]
        for i in card_indices:
            if 0 <= i < len(hand):
                total += hand[i]["value"]
        return total

    def display(self):
        clear_screen()
        p = self.current_player - 1
        opp = 1 - p
        print(f"{'='*60}")
        print(f"  DALE OF MERCHANTS - Turn {self.turn_number + 1}")
        print(f"  Goal: Build {self.stalls_to_win} stalls | Active folk: {', '.join(self.active_folk)}")
        print(f"{'='*60}")
        print()

        # Opponent info
        opp_name = self.players[opp]
        print(f"  {opp_name}: {self.player_stall_count[opp]} stalls | "
              f"Hand: {len(self.player_hands[opp])} cards | "
              f"Deck: {len(self.player_decks[opp])} | "
              f"Discard: {len(self.player_discards[opp])}")
        if self.player_stalls[opp]:
            for si, stall in enumerate(self.player_stalls[opp]):
                cards_str = ", ".join(_card_str(c) for c in stall["cards"])
                print(f"    Stall {stall['level']}: {cards_str}")
        print()

        # Market
        print(f"  --- MARKET (deck: {len(self.market_deck)}) ---")
        for i, card in enumerate(self.market_display):
            print(f"    {i+1}. {_card_str(card)}")
        print()

        # Current player info
        cur_name = self.players[p]
        print(f"  {cur_name} (YOU): {self.player_stall_count[p]} stalls | "
              f"Deck: {len(self.player_decks[p])} | "
              f"Discard: {len(self.player_discards[p])}")
        if self.player_stalls[p]:
            for si, stall in enumerate(self.player_stalls[p]):
                cards_str = ", ".join(_card_str(c) for c in stall["cards"])
                print(f"    Stall {stall['level']}: {cards_str}")
        print()

        # Hand
        print("  YOUR HAND:")
        hand = self.player_hands[p]
        if not hand:
            print("    (empty)")
        else:
            for i, card in enumerate(hand):
                print(f"    {i+1}. {_card_str(card)}")
        total = sum(c["value"] for c in hand)
        print(f"    Total hand value: {total}")
        print()

    def get_move(self):
        p = self.current_player - 1
        hand = self.player_hands[p]
        next_stall_level = self.player_stall_count[p] + 1

        print("  ACTIONS:")
        print(f"    buy <market#> <hand cards to pay>  - Buy a market card (pay with hand cards)")
        print(f"    stall <hand cards>                 - Build stall #{next_stall_level} (need value>={next_stall_level})")
        print(f"    discard <hand card#>               - Discard a card from hand (technique)")
        print(f"    pass                               - End turn, discard hand, draw 5")
        print()
        move_str = input_with_quit(f"  {self.players[p]}> ")
        return move_str.strip()

    def make_move(self, move):
        p = self.current_player - 1
        hand = self.player_hands[p]
        parts = move.lower().split()
        if not parts:
            return False

        action = parts[0]

        if action == "buy":
            return self._do_buy(p, parts)
        elif action == "stall":
            return self._do_build_stall(p, parts)
        elif action == "discard":
            return self._do_discard(p, parts)
        elif action == "pass":
            return self._do_pass(p)
        else:
            return False

    def _do_buy(self, p, parts):
        """Buy a card from market using hand cards as payment."""
        if len(parts) < 3:
            print("  Usage: buy <market#> <hand card indices to pay, e.g. 1 3 4>")
            input("  Press Enter...")
            return False
        try:
            market_idx = int(parts[1]) - 1
            pay_indices = sorted([int(x) - 1 for x in parts[2:]], reverse=True)
        except ValueError:
            print("  Invalid numbers.")
            input("  Press Enter...")
            return False

        hand = self.player_hands[p]
        if market_idx < 0 or market_idx >= len(self.market_display):
            print("  Invalid market card.")
            input("  Press Enter...")
            return False
        for idx in pay_indices:
            if idx < 0 or idx >= len(hand):
                print("  Invalid hand card index.")
                input("  Press Enter...")
                return False

        target_card = self.market_display[market_idx]
        payment = self._hand_value(p, pay_indices)

        if payment < target_card["value"]:
            print(f"  Not enough value! Need {target_card['value']}, paying {payment}.")
            input("  Press Enter...")
            return False

        # Remove payment cards from hand (descending order to preserve indices)
        paid_cards = []
        for idx in pay_indices:
            paid_cards.append(hand.pop(idx))

        # Discard paid cards
        self.player_discards[p].extend(paid_cards)

        # Gain the purchased card
        bought = self.market_display.pop(market_idx)

        # Macaw ability: draw extra
        if bought.get("ability") == "draw_extra":
            self.player_discards[p].append(bought)
            self._draw_cards(p, 1)
        else:
            self.player_discards[p].append(bought)

        self._refill_market()

        # End turn
        self._end_turn(p)
        return True

    def _do_build_stall(self, p, parts):
        """Build a stall from hand cards."""
        if len(parts) < 2:
            print("  Usage: stall <hand card indices, e.g. 1 3 4>")
            input("  Press Enter...")
            return False
        try:
            indices = sorted([int(x) - 1 for x in parts[1:]], reverse=True)
        except ValueError:
            print("  Invalid numbers.")
            input("  Press Enter...")
            return False

        hand = self.player_hands[p]
        for idx in indices:
            if idx < 0 or idx >= len(hand):
                print("  Invalid hand card index.")
                input("  Press Enter...")
                return False

        # All cards in a stall must be the same folk type (or Platypus versatile)
        chosen_cards = [hand[i] for i in sorted(indices)]
        folk_types = set()
        has_versatile = False
        for c in chosen_cards:
            if c.get("ability") == "versatile":
                has_versatile = True
            else:
                folk_types.add(c["folk"])

        if not has_versatile and len(folk_types) > 1:
            print("  All stall cards must be the same folk type!")
            input("  Press Enter...")
            return False
        if has_versatile and len(folk_types) > 1:
            print("  Non-versatile cards must all be the same folk type!")
            input("  Press Enter...")
            return False

        total_value = sum(c["value"] for c in chosen_cards)
        next_level = self.player_stall_count[p] + 1

        if total_value < next_level:
            print(f"  Need total value >= {next_level}, got {total_value}.")
            input("  Press Enter...")
            return False

        # Build the stall
        stall_cards = []
        for idx in indices:
            stall_cards.append(hand.pop(idx))

        self.player_stalls[p].append({"level": next_level, "cards": stall_cards})
        self.player_stall_count[p] = next_level

        # Panda bonus: draw extra card
        if any(c.get("ability") == "stall_bonus" for c in stall_cards):
            self._draw_cards(p, 1)

        # End turn
        self._end_turn(p)
        return True

    def _do_discard(self, p, parts):
        """Discard a card from hand (technique action)."""
        if len(parts) < 2:
            print("  Usage: discard <hand card#>")
            input("  Press Enter...")
            return False
        try:
            idx = int(parts[1]) - 1
        except ValueError:
            return False

        hand = self.player_hands[p]
        if idx < 0 or idx >= len(hand):
            print("  Invalid card index.")
            input("  Press Enter...")
            return False

        card = hand.pop(idx)
        # Discard removes from game entirely (trash)
        # This is the "technique" to thin your deck

        # End turn
        self._end_turn(p)
        return True

    def _do_pass(self, p):
        """Pass turn, discard remaining hand, draw 5."""
        self._end_turn(p)
        return True

    def _end_turn(self, p):
        """Discard remaining hand, draw 5 new cards."""
        self.player_discards[p].extend(self.player_hands[p])
        self.player_hands[p] = []
        self._draw_cards(p, 5)

    def check_game_over(self):
        for i in range(2):
            if self.player_stall_count[i] >= self.stalls_to_win:
                self.game_over = True
                self.winner = i + 1
                return

    def get_state(self):
        return {
            "stalls_to_win": self.stalls_to_win,
            "market_deck": copy.deepcopy(self.market_deck),
            "market_display": copy.deepcopy(self.market_display),
            "market_size": self.market_size,
            "player_decks": copy.deepcopy(self.player_decks),
            "player_hands": copy.deepcopy(self.player_hands),
            "player_discards": copy.deepcopy(self.player_discards),
            "player_stalls": copy.deepcopy(self.player_stalls),
            "player_stall_count": self.player_stall_count[:],
            "active_folk": self.active_folk[:],
            "phase": self.phase,
        }

    def load_state(self, state):
        self.stalls_to_win = state["stalls_to_win"]
        self.market_deck = state["market_deck"]
        self.market_display = state["market_display"]
        self.market_size = state["market_size"]
        self.player_decks = state["player_decks"]
        self.player_hands = state["player_hands"]
        self.player_discards = state["player_discards"]
        self.player_stalls = state["player_stalls"]
        self.player_stall_count = state["player_stall_count"]
        self.active_folk = state["active_folk"]
        self.phase = state["phase"]

    def get_tutorial(self):
        return """
====================================================
  DALE OF MERCHANTS - Tutorial
====================================================

OVERVIEW:
  You are a merchant in the great dale, competing to
  build the most impressive market stalls using cards
  from various animalfolk trading guilds.

GOAL:
  Be the first to build the required number of stalls
  (8 in standard, 5 in quick mode).

EACH TURN, choose ONE action:
  1. BUY a card from the market
     - Pay with hand cards (total value >= card cost)
     - Paid cards go to your discard pile
     - Bought card goes to your discard pile

  2. BUILD A STALL
     - Use hand cards of the same folk type
     - Total value must be >= stall level
     - Stall 1 needs value>=1, Stall 2 needs >=2, etc.

  3. DISCARD (Technique)
     - Remove a card from your hand permanently
     - Good for thinning junk from your deck

  4. PASS
     - Skip your action

After your action, discard remaining hand, draw 5.

ANIMALFOLK ABILITIES (on cards value 3+):
  Macaws     - Draw an extra card when purchased
  Chameleons - Copy another card's value
  Pandas     - Gain bonus draw when building stalls
  Squirrels  - Keep extra cards in hand
  Ocelots    - Peek at top of deck
  Platypuses - Count as any type for stalls

COMMANDS:
  buy <market#> <hand cards...>  - Buy from market
  stall <hand cards...>          - Build a stall
  discard <card#>                - Trash a card
  pass                           - End turn
====================================================
"""
