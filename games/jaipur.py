"""Jaipur - A 2-player trading card game of goods and camels."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen


# Goods types and their token values (highest to lowest)
GOODS_TOKENS = {
    'diamonds':  [7, 7, 5, 5, 5],
    'gold':      [6, 6, 5, 5, 5],
    'silver':    [5, 5, 5, 5, 5],
    'cloth':     [5, 3, 3, 2, 2, 1, 1],
    'spice':     [5, 3, 3, 2, 2, 1, 1],
    'leather':   [4, 3, 2, 1, 1, 1, 1, 1, 1],
}

# Bonus tokens for selling sets of 3, 4, or 5+
BONUS_TOKENS_3 = [3, 3, 2, 2, 2, 1, 1]
BONUS_TOKENS_4 = [6, 6, 5, 5, 4, 4]
BONUS_TOKENS_5 = [10, 10, 9, 8, 8]

# Number of each good card in the deck
GOODS_COUNTS = {
    'diamonds': 6,
    'gold':     6,
    'silver':   6,
    'cloth':    8,
    'spice':    8,
    'leather':  10,
}
CAMEL_COUNT = 11

# Display colors
GOOD_COLORS = {
    'diamonds': '\033[96m',   # cyan
    'gold':     '\033[93m',   # yellow
    'silver':   '\033[97m',   # white/bright
    'cloth':    '\033[95m',   # magenta
    'spice':    '\033[92m',   # green
    'leather':  '\033[33m',   # dark yellow/brown
    'camel':    '\033[90m',   # gray
}
RESET = '\033[0m'

HAND_LIMIT = 7

GOOD_ABBREV = {
    'd': 'diamonds', 'di': 'diamonds', 'diamonds': 'diamonds',
    'g': 'gold', 'go': 'gold', 'gold': 'gold',
    's': 'silver', 'si': 'silver', 'silver': 'silver',
    'c': 'cloth', 'cl': 'cloth', 'cloth': 'cloth',
    'sp': 'spice', 'spice': 'spice',
    'l': 'leather', 'le': 'leather', 'leather': 'leather',
}

ALL_ABBREV = dict(GOOD_ABBREV)
ALL_ABBREV.update({
    'ca': 'camel', 'camel': 'camel', 'camels': 'camel',
})


def colored(good, text=None):
    """Return colored text for a good type."""
    if text is None:
        text = good.capitalize()
    color = GOOD_COLORS.get(good, '')
    return f"{color}{text}{RESET}"


def make_deck():
    """Create the full Jaipur deck (goods + camels)."""
    deck = []
    for good, count in GOODS_COUNTS.items():
        deck.extend([good] * count)
    deck.extend(['camel'] * CAMEL_COUNT)
    random.shuffle(deck)
    return deck


def parse_good(text):
    """Parse a good name from user input. Returns good name or None."""
    text = text.strip().lower()
    return GOOD_ABBREV.get(text)


def parse_card(text):
    """Parse a card name (good or camel) from user input. Returns name or None."""
    text = text.strip().lower()
    return ALL_ABBREV.get(text)


class JaipurGame(BaseGame):
    """Jaipur card game implementation."""

    name = "Jaipur"
    description = "A 2-player trading card game of goods and camels"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Jaipur (best of 3 rounds)",
        "quick": "Quick Game (single round)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.deck = []
        self.market = []
        self.hands = {1: [], 2: []}
        self.camels = {1: 0, 2: 0}
        self.tokens = {}
        self.bonus_3 = []
        self.bonus_4 = []
        self.bonus_5 = []
        self.score = {1: 0, 2: 0}
        self.round_number = 1
        self.total_rounds = 3
        self.rounds_won = {1: 0, 2: 0}

    def setup(self):
        """Initialize the game state."""
        if self.variation == 'quick':
            self.total_rounds = 1
        self._setup_round()

    def _setup_round(self):
        """Set up a new round."""
        self.deck = make_deck()
        self.market = []
        self.hands = {1: [], 2: []}
        self.camels = {1: 0, 2: 0}
        self.score = {1: 0, 2: 0}

        # Set up token piles (copy so we can pop from them)
        self.tokens = {good: list(vals) for good, vals in GOODS_TOKENS.items()}

        # Set up bonus token piles (shuffled)
        self.bonus_3 = list(BONUS_TOKENS_3)
        self.bonus_4 = list(BONUS_TOKENS_4)
        self.bonus_5 = list(BONUS_TOKENS_5)
        random.shuffle(self.bonus_3)
        random.shuffle(self.bonus_4)
        random.shuffle(self.bonus_5)

        # Place 3 camels in the market
        camels_placed = 0
        new_deck = []
        for card in self.deck:
            if card == 'camel' and camels_placed < 3:
                self.market.append('camel')
                camels_placed += 1
            else:
                new_deck.append(card)
        self.deck = new_deck

        # Fill market to 5 cards
        while len(self.market) < 5 and self.deck:
            self.market.append(self.deck.pop())

        # Deal 5 cards to each player
        for _ in range(5):
            if self.deck:
                self.hands[1].append(self.deck.pop())
            if self.deck:
                self.hands[2].append(self.deck.pop())

        # Move camels from hand to camel pile
        for p in [1, 2]:
            camel_cards = [c for c in self.hands[p] if c == 'camel']
            for c in camel_cards:
                self.hands[p].remove(c)
                self.camels[p] += 1

        # Sort hands
        for p in [1, 2]:
            self.hands[p].sort()

    def display(self):
        """Display the current game state."""
        player = self.current_player
        opponent = 2 if player == 1 else 1

        print(f"\n{'=' * 60}")
        round_info = f"Round {self.round_number}/{self.total_rounds}" if self.total_rounds > 1 else "Single Round"
        print(f"  JAIPUR - {round_info}   |   Deck: {len(self.deck)} cards")
        print(f"{'=' * 60}")

        # Rounds won (if multi-round)
        if self.total_rounds > 1:
            for p in [1, 2]:
                if self.rounds_won[p] > 0:
                    print(f"  {self.players[p-1]} rounds won: {self.rounds_won[p]}")

        # Opponent info
        print(f"\n  {self.players[opponent-1]} (opponent):")
        print(f"    Hand: {len(self.hands[opponent])} cards   |   Camels: {self.camels[opponent]}")

        # Market
        print(f"\n  MARKET:")
        market_strs = []
        for i, card in enumerate(self.market):
            market_strs.append(f"[{i+1}]{colored(card)}")
        print(f"    {' '.join(market_strs)}")

        # Token piles
        print(f"\n  TOKEN PILES:")
        pile_strs = []
        for good in GOODS_TOKENS:
            remaining = self.tokens[good]
            if remaining:
                top_val = remaining[0]
                pile_strs.append(f"    {colored(good)}: {top_val} (x{len(remaining)})")
            else:
                pile_strs.append(f"    {colored(good)}: empty")
        print('\n'.join(pile_strs))
        print(f"    Bonus 3+: {len(self.bonus_3)} left  |  "
              f"Bonus 4+: {len(self.bonus_4)} left  |  "
              f"Bonus 5+: {len(self.bonus_5)} left")

        # Current player info
        print(f"\n  {self.players[player-1]} (YOU):")
        print(f"    Camels: {self.camels[player]}   |   Score: {self.score[player]}")
        hand = self.hands[player]
        if hand:
            hand_strs = []
            for card in hand:
                hand_strs.append(colored(card))
            print(f"    Hand ({len(hand)}/{HAND_LIMIT}): {', '.join(hand_strs)}")
        else:
            print(f"    Hand: (empty)")
        print()

    def get_move(self):
        """Get a move from the current player."""
        print(f"  {self.players[self.current_player-1]}'s turn:")
        print(f"  Actions:")
        print(f"    take <good>         - Take a single good from the market")
        print(f"    take camels         - Take ALL camels from the market")
        print(f"    exchange <g1 g2..> for <g3 g4..>")
        print(f"                        - Exchange cards (give from hand/camels, take from market)")
        print(f"    sell <good> <count> - Sell goods of one type for tokens")
        move_str = input_with_quit("  > ").strip().lower()
        return move_str

    def make_move(self, move_str):
        """Apply a move. Returns True if valid."""
        parts = move_str.split()
        if not parts:
            print("  Please enter a command.")
            return False

        action = parts[0]

        if action == 'take':
            return self._handle_take(parts[1:])
        elif action == 'exchange':
            return self._handle_exchange(move_str)
        elif action == 'sell':
            return self._handle_sell(parts[1:])
        else:
            print("  Unknown action. Use: take, exchange, or sell.")
            return False

    def _handle_take(self, args):
        """Handle taking a single good or all camels from the market."""
        if not args:
            print("  Specify what to take: 'take <good>' or 'take camels'.")
            return False

        player = self.current_player
        card_name = parse_card(args[0])

        if card_name is None:
            print(f"  Unknown good '{args[0]}'.")
            return False

        if card_name == 'camel':
            # Take all camels from market
            camel_count = self.market.count('camel')
            if camel_count == 0:
                print("  There are no camels in the market.")
                return False
            self.camels[player] += camel_count
            self.market = [c for c in self.market if c != 'camel']
            # Refill market
            self._refill_market()
            return True
        else:
            # Take a single good
            if card_name not in self.market:
                print(f"  {card_name.capitalize()} is not in the market.")
                return False
            if len(self.hands[player]) >= HAND_LIMIT:
                print(f"  Your hand is full ({HAND_LIMIT} cards). Sell or exchange first.")
                return False
            self.market.remove(card_name)
            self.hands[player].append(card_name)
            self.hands[player].sort()
            # Refill market
            self._refill_market()
            return True

    def _handle_exchange(self, move_str):
        """Handle exchanging cards between hand/camels and market.

        Format: exchange <give1 give2 ...> for <take1 take2 ...>
        Use 'camel' for camel cards from your herd.
        """
        player = self.current_player

        # Split on 'for'
        if ' for ' not in move_str:
            print("  Format: exchange <give1 give2 ...> for <take1 take2 ...>")
            return False

        parts = move_str.split(' for ')
        give_part = parts[0].replace('exchange', '', 1).strip()
        take_part = parts[1].strip()

        give_tokens = give_part.split()
        take_tokens = take_part.split()

        if len(give_tokens) < 2 or len(take_tokens) < 2:
            print("  You must exchange at least 2 cards.")
            return False

        if len(give_tokens) != len(take_tokens):
            print("  You must give and take the same number of cards.")
            return False

        # Parse give cards
        give_cards = []
        for token in give_tokens:
            card = parse_card(token)
            if card is None:
                print(f"  Unknown card '{token}'.")
                return False
            give_cards.append(card)

        # Parse take cards
        take_cards = []
        for token in take_tokens:
            card = parse_card(token)
            if card is None:
                print(f"  Unknown card '{token}'.")
                return False
            if card == 'camel':
                print("  You cannot take camels during an exchange (use 'take camels').")
                return False
            take_cards.append(card)

        # Validate give cards are available
        hand_copy = list(self.hands[player])
        camels_used = 0
        for card in give_cards:
            if card == 'camel':
                camels_used += 1
                if camels_used > self.camels[player]:
                    print("  You don't have enough camels.")
                    return False
            else:
                if card in hand_copy:
                    hand_copy.remove(card)
                else:
                    print(f"  You don't have {card.capitalize()} in your hand.")
                    return False

        # Validate take cards are in market
        market_copy = list(self.market)
        for card in take_cards:
            if card in market_copy:
                market_copy.remove(card)
            else:
                print(f"  {card.capitalize()} is not in the market.")
                return False

        # Check hand limit after exchange
        goods_given = sum(1 for c in give_cards if c != 'camel')
        goods_taken = len(take_cards)
        new_hand_size = len(self.hands[player]) - goods_given + goods_taken
        if new_hand_size > HAND_LIMIT:
            print(f"  Exchange would exceed hand limit of {HAND_LIMIT}.")
            return False

        # Cannot exchange a card for the same card type you put in
        # (this prevents taking and giving back the same cards)
        # Actually in Jaipur rules, you just can't take and give back the same cards
        # but different types are fine. We just need >= 2 cards exchanged.

        # Perform the exchange
        for card in give_cards:
            if card == 'camel':
                self.camels[player] -= 1
            else:
                self.hands[player].remove(card)

        for card in take_cards:
            self.market.remove(card)
            self.hands[player].append(card)

        # Put give cards into market
        for card in give_cards:
            self.market.append(card)

        self.hands[player].sort()
        return True

    def _handle_sell(self, args):
        """Handle selling goods for tokens."""
        player = self.current_player

        if len(args) < 2:
            print("  Format: sell <good> <count>")
            return False

        good = parse_good(args[0])
        if good is None:
            print(f"  Unknown good '{args[0]}'.")
            return False

        try:
            count = int(args[1])
        except ValueError:
            print("  Count must be a number.")
            return False

        if count < 1:
            print("  Must sell at least 1 card.")
            return False

        # Diamonds, gold, silver require minimum 2 to sell
        if good in ('diamonds', 'gold', 'silver') and count < 2:
            print(f"  {good.capitalize()} requires selling at least 2 cards.")
            return False

        # Check player has enough of this good
        hand_count = self.hands[player].count(good)
        if hand_count < count:
            print(f"  You only have {hand_count} {good.capitalize()} card(s).")
            return False

        # Collect tokens
        points = 0
        tokens_taken = 0
        for _ in range(count):
            if self.tokens[good]:
                points += self.tokens[good].pop(0)
                tokens_taken += 1

        # Bonus tokens for large sales
        bonus = 0
        if count >= 5:
            if self.bonus_5:
                bonus = self.bonus_5.pop()
        elif count == 4:
            if self.bonus_4:
                bonus = self.bonus_4.pop()
        elif count == 3:
            if self.bonus_3:
                bonus = self.bonus_3.pop()

        total = points + bonus
        self.score[player] += total

        # Remove cards from hand
        for _ in range(count):
            self.hands[player].remove(good)

        # Report the sale
        bonus_str = f" + {bonus} bonus" if bonus else ""
        print(f"  Sold {count} {good.capitalize()} for {points} points{bonus_str} = {total} total!")
        input_with_quit("  Press Enter to continue...")

        return True

    def _refill_market(self):
        """Refill the market to 5 cards from the deck."""
        while len(self.market) < 5 and self.deck:
            self.market.append(self.deck.pop())

    def check_game_over(self):
        """Check if the round/game is over."""
        # Round ends when 3 token piles are empty or deck runs out
        empty_piles = sum(1 for good in self.tokens if not self.tokens[good])
        round_over = False

        if empty_piles >= 3:
            round_over = True
        elif not self.deck and len(self.market) < 5:
            round_over = True

        if round_over:
            self._end_round()

    def _end_round(self):
        """End the current round and determine the winner."""
        clear_screen()
        print(f"\n{'=' * 60}")
        print(f"  ROUND {self.round_number} COMPLETE!")
        print(f"{'=' * 60}")

        # Camel bonus: player with most camels gets 5 points
        if self.camels[1] > self.camels[2]:
            self.score[1] += 5
            print(f"\n  {self.players[0]} gets 5 points for most camels ({self.camels[1]} vs {self.camels[2]})")
        elif self.camels[2] > self.camels[1]:
            self.score[2] += 5
            print(f"\n  {self.players[1]} gets 5 points for most camels ({self.camels[2]} vs {self.camels[1]})")
        else:
            print(f"\n  Tied on camels ({self.camels[1]} each) -- no bonus awarded")

        # Show final scores
        for p in [1, 2]:
            print(f"  {self.players[p-1]}: {self.score[p]} points")

        # Determine round winner
        if self.score[1] > self.score[2]:
            round_winner = 1
        elif self.score[2] > self.score[1]:
            round_winner = 2
        else:
            round_winner = None

        if round_winner:
            self.rounds_won[round_winner] += 1
            print(f"\n  {self.players[round_winner-1]} wins round {self.round_number}!")
        else:
            print(f"\n  Round {self.round_number} is a tie! No round point awarded.")

        if self.total_rounds > 1:
            print(f"\n  Rounds won: {self.players[0]} {self.rounds_won[1]} - {self.rounds_won[2]} {self.players[1]}")

        # Check if match is over
        match_over = False
        if self.total_rounds == 1:
            match_over = True
            if round_winner:
                self.winner = round_winner
            else:
                self.winner = None
            self.game_over = True
        elif self.rounds_won[1] >= 2:
            match_over = True
            self.winner = 1
            self.game_over = True
        elif self.rounds_won[2] >= 2:
            match_over = True
            self.winner = 2
            self.game_over = True
        elif self.round_number >= self.total_rounds:
            # All rounds played
            match_over = True
            if self.rounds_won[1] > self.rounds_won[2]:
                self.winner = 1
            elif self.rounds_won[2] > self.rounds_won[1]:
                self.winner = 2
            else:
                self.winner = None
            self.game_over = True

        if match_over:
            input_with_quit("\n  Press Enter to see final results...")
        else:
            self.round_number += 1
            input_with_quit("\n  Press Enter to start the next round...")
            self._setup_round()

    def get_state(self):
        """Return serializable game state."""
        return {
            'variation': self.variation,
            'deck': self.deck,
            'market': self.market,
            'hands': {str(k): v for k, v in self.hands.items()},
            'camels': {str(k): v for k, v in self.camels.items()},
            'tokens': self.tokens,
            'bonus_3': self.bonus_3,
            'bonus_4': self.bonus_4,
            'bonus_5': self.bonus_5,
            'score': {str(k): v for k, v in self.score.items()},
            'round_number': self.round_number,
            'total_rounds': self.total_rounds,
            'rounds_won': {str(k): v for k, v in self.rounds_won.items()},
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.variation = state.get('variation', 'standard')
        self.deck = state.get('deck', [])
        self.market = state.get('market', [])
        self.hands = {int(k): v for k, v in state.get('hands', {}).items()}
        self.camels = {int(k): v for k, v in state.get('camels', {}).items()}
        self.tokens = state.get('tokens', {})
        self.bonus_3 = state.get('bonus_3', [])
        self.bonus_4 = state.get('bonus_4', [])
        self.bonus_5 = state.get('bonus_5', [])
        self.score = {int(k): v for k, v in state.get('score', {}).items()}
        self.round_number = state.get('round_number', 1)
        self.total_rounds = state.get('total_rounds', 3)
        self.rounds_won = {int(k): v for k, v in state.get('rounds_won', {}).items()}

    def get_tutorial(self):
        """Return tutorial text for Jaipur."""
        return f"""
{'=' * 60}
  JAIPUR - Tutorial
{'=' * 60}

  OVERVIEW:
  Jaipur is a 2-player trading card game. You are competing
  merchants trying to earn the most rupees by buying, selling,
  and exchanging goods at the market.

  THE CARDS:
  There are 6 types of goods:
    - Diamonds (6 cards)    - Gold (6 cards)
    - Silver (6 cards)      - Cloth (8 cards)
    - Spice (8 cards)       - Leather (10 cards)
  Plus 11 Camel cards (not held in hand).

  SETUP:
  The market starts with 5 face-up cards (including 3 camels).
  Each player gets 5 cards; camels go to your camel herd.
  Hand limit is {HAND_LIMIT} cards (camels don't count).

  ON YOUR TURN (pick ONE action):

  1) TAKE A SINGLE GOOD from the market:
     'take diamonds'  or  'take cloth'
     (The market is refilled from the deck.)

  2) TAKE ALL CAMELS from the market:
     'take camels'
     (All camels go to your herd. Market is refilled.)

  3) EXCHANGE cards between your hand/camels and the market:
     'exchange camel camel for diamonds gold'
     'exchange cloth leather for diamonds silver'
     (Must exchange at least 2 cards. You can use camels.)
     (You cannot take camels from the market in an exchange.)

  4) SELL goods of one type for tokens:
     'sell leather 3'  or  'sell diamonds 2'
     Diamonds, Gold, and Silver require selling at least 2.
     Tokens decrease in value, so sell early for more points!

  BONUS TOKENS:
  Selling 3 cards: random bonus (1-3 points)
  Selling 4 cards: random bonus (4-6 points)
  Selling 5+ cards: random bonus (8-10 points)

  ROUND END:
  A round ends when 3 token piles are empty or the deck runs out.
  The player with the most camels gets 5 bonus points.
  The player with the most points wins the round.

  WINNING:
  {"Best of 3 rounds wins the match!" if self.total_rounds > 1 else "The player with the most points wins!"}

  ABBREVIATIONS:
  Goods: d(iamonds), g(old), s(ilver), c(loth), sp(ice), l(eather)
  Also: ca(mel) for camel cards

  STRATEGY TIPS:
  - Sell early to get the highest-value tokens.
  - Collect camels -- they help with exchanges and the bonus.
  - Selling 3+ cards earns bonus tokens.
  - Precious goods (diamonds, gold, silver) are worth more
    but harder to collect in quantity.

{'=' * 60}
"""
