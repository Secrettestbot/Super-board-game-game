"""Battle Line - A 2-player card game of tactical flag combat."""

import random
from collections import Counter
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'

COLORS = {
    'R': ('Red', '\033[91m'),
    'O': ('Orange', '\033[33m'),
    'Y': ('Yellow', '\033[93m'),
    'G': ('Green', '\033[92m'),
    'B': ('Blue', '\033[94m'),
    'P': ('Purple', '\033[95m'),
}

FORMATION_RANKS = {
    'straight_flush': 5,
    'three_of_a_kind': 4,
    'flush': 3,
    'straight': 2,
    'host': 1,
}

FORMATION_NAMES = {
    'straight_flush': 'Straight Flush',
    'three_of_a_kind': 'Three of a Kind',
    'flush': 'Flush',
    'straight': 'Straight',
    'host': 'Host (sum)',
}

# Tactics cards for the tactics variation
TACTICS_CARDS = [
    ('T', 'Alexander', 'Wild: plays as any color/value'),
    ('T', 'Darius', 'Wild: plays as any color/value'),
    ('T', 'Companion', 'Wild 8: any color, value 8'),
    ('T', 'Shield', 'Wild 1-3: any color, value 1, 2, or 3'),
    ('T', 'Fog', 'Flag: disable formations, highest sum wins'),
    ('T', 'Mud', 'Flag: 4 cards per side instead of 3'),
    ('T', 'Scout', 'Draw 3 cards, return 2 to deck tops'),
    ('T', 'Redeploy', 'Move one of your cards to another flag or discard'),
    ('T', 'Deserter', 'Remove one opponent card from any unclaimed flag'),
    ('T', 'Traitor', 'Take one opponent card and play it on your side'),
]


def _make_troop_deck():
    """Create the 60-card troop deck: 6 colors x values 1-10."""
    deck = []
    for color in COLORS:
        for val in range(1, 11):
            deck.append((color, val))
    random.shuffle(deck)
    return deck


def _card_label(card):
    """Return a colored string for a card."""
    if card[0] == 'T':
        return f"\033[97m{card[1]}{RESET}"
    color_code = COLORS[card[0]][1]
    return f"{color_code}{card[0]}{card[1]}{RESET}"


def _card_sort_key(card):
    if card[0] == 'T':
        return (1, card[1])
    color_order = list(COLORS.keys())
    return (0, color_order.index(card[0]), card[1])


def _classify_formation(cards, fog=False, mud=False):
    """Classify a formation and return (rank, sum_value).

    For fog flags, always returns host rank.
    For mud flags, formations need 4 cards.
    """
    needed = 4 if mud else 3
    if len(cards) < needed:
        return None, sum(c[1] for c in cards if c[0] != 'T')

    # For simplicity in standard mode, only use troop cards
    vals = sorted([c[1] for c in cards])
    colors_set = set(c[0] for c in cards)
    total = sum(vals)

    if fog:
        return ('host', total)

    is_flush = len(colors_set) == 1
    is_straight = (vals == list(range(vals[0], vals[0] + len(vals))))

    val_counts = Counter(vals)
    is_three = any(v >= 3 for v in val_counts.values())
    is_four = any(v >= 4 for v in val_counts.values())

    if mud:
        if is_flush and is_straight:
            return ('straight_flush', total)
        if is_four:
            return ('three_of_a_kind', total)  # 4-of-a-kind in mud
        if is_flush:
            return ('flush', total)
        if is_straight:
            return ('straight', total)
        return ('host', total)

    if is_flush and is_straight:
        return ('straight_flush', total)
    if is_three:
        return ('three_of_a_kind', total)
    if is_flush:
        return ('flush', total)
    if is_straight:
        return ('straight', total)
    return ('host', total)


def _formation_beats(f1, f2):
    """Return True if formation f1 beats f2. f1/f2 are (rank, sum)."""
    if f1 is None or f2 is None:
        return False
    r1 = FORMATION_RANKS.get(f1[0], 0)
    r2 = FORMATION_RANKS.get(f2[0], 0)
    if r1 != r2:
        return r1 > r2
    return f1[1] > f2[1]


class BattleLineGame(BaseGame):
    """Battle Line card game."""

    name = "Battle Line"
    description = "Tactical card game with 9 flags"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard Battle Line (troops only)',
        'tactics': 'With Tactics cards (special powers)',
    }

    def setup(self):
        self.deck = _make_troop_deck()
        self.tactics_deck = []
        if self.variation == 'tactics':
            self.tactics_deck = list(TACTICS_CARDS)
            random.shuffle(self.tactics_deck)

        # 9 flags, each side has a list of cards
        self.flags = {i: {1: [], 2: []} for i in range(9)}
        self.flag_status = {i: 0 for i in range(9)}  # 0=unclaimed, 1=p1, 2=p2
        self.flag_fog = {i: False for i in range(9)}
        self.flag_mud = {i: False for i in range(9)}

        # Deal 7 cards each
        self.hands = {1: [], 2: []}
        for _ in range(7):
            self.hands[1].append(self.deck.pop())
            self.hands[2].append(self.deck.pop())

        self.discard = []
        self.tactics_played = {1: 0, 2: 0}  # track tactics card count

    def display(self):
        cp = self.current_player
        opp = 3 - cp

        print(f"\n{'=' * 65}")
        print(f"  BATTLE LINE  --  Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Deck: {len(self.deck)} troops", end="")
        if self.variation == 'tactics':
            print(f"  |  Tactics: {len(self.tactics_deck)}", end="")
        print(f"\n{'=' * 65}")

        # Display flags
        flag_labels = "  Flag:   " + "   ".join(f" {i+1} " for i in range(9))
        print(flag_labels)

        # Opponent side (top)
        print(f"\n  {self.players[opp - 1]}:")
        for row in range(3, -1, -1):
            line = "          "
            for i in range(9):
                cards = self.flags[i][opp]
                if row < len(cards):
                    line += f" {_card_label(cards[row])} "
                else:
                    line += "     "
            print(line)

        # Flag status line
        status_line = "  Status: "
        for i in range(9):
            s = self.flag_status[i]
            if s == 1:
                status_line += f" \033[92mP1\033[0m  "
            elif s == 2:
                status_line += f" \033[91mP2\033[0m  "
            else:
                mod = ""
                if self.flag_fog[i]:
                    mod = "F"
                elif self.flag_mud[i]:
                    mod = "M"
                status_line += f" [{mod or '.'}] "
        print(status_line)

        # Current player side (bottom)
        print(f"\n  {self.players[cp - 1]}:")
        for row in range(4):
            line = "          "
            for i in range(9):
                cards = self.flags[i][cp]
                if row < len(cards):
                    line += f" {_card_label(cards[row])} "
                else:
                    line += "     "
            print(line)

        # Hand
        hand = sorted(self.hands[cp], key=_card_sort_key)
        hand_str = "  ".join(f"{idx+1}:{_card_label(c)}" for idx, c in enumerate(hand))
        print(f"\n  Your hand: {hand_str}")

    def get_move(self):
        cp = self.current_player
        hand = sorted(self.hands[cp], key=_card_sort_key)
        self.hands[cp] = hand

        while True:
            prompt = "  Play card to flag (e.g. '3 5' = card 3 to flag 5)"
            if self.variation == 'tactics':
                prompt += "\n  Or 'claim <flag>' to claim a flag"
            else:
                prompt += "\n  Or 'claim <flag>' to claim"
            prompt += ": "
            raw = input_with_quit(prompt).strip().lower()

            if raw.startswith('claim'):
                parts = raw.split()
                if len(parts) == 2 and parts[1].isdigit():
                    flag_num = int(parts[1]) - 1
                    if 0 <= flag_num < 9:
                        return ('claim', flag_num)
                print("  Usage: claim <1-9>")
                continue

            parts = raw.split()
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                card_idx = int(parts[0]) - 1
                flag_num = int(parts[1]) - 1
                if 0 <= card_idx < len(self.hands[cp]) and 0 <= flag_num < 9:
                    return ('play', card_idx, flag_num)
            print("  Usage: <card#> <flag#>  (e.g. '2 5')")

    def make_move(self, move):
        cp = self.current_player

        if move[0] == 'claim':
            flag = move[1]
            if self.flag_status[flag] != 0:
                print("  That flag is already claimed.")
                return False
            result = self._try_claim(flag, cp)
            if result:
                self.flag_status[flag] = cp
                print(f"  Flag {flag + 1} claimed by {self.players[cp - 1]}!")
                return False  # claiming doesn't end your turn
            else:
                print("  Cannot claim that flag yet - formation not provably winning.")
                return False

        if move[0] == 'play':
            card_idx, flag = move[1], move[2]
            if self.flag_status[flag] != 0:
                print("  That flag is already claimed!")
                return False

            max_cards = 4 if self.flag_mud[flag] else 3
            if len(self.flags[flag][cp]) >= max_cards:
                print(f"  You already have {max_cards} cards at flag {flag + 1}.")
                return False

            card = self.hands[cp].pop(card_idx)
            self.flags[flag][cp].append(card)

            # Draw a card
            if self.deck:
                self.hands[cp].append(self.deck.pop())
            elif self.variation == 'tactics' and self.tactics_deck:
                self.hands[cp].append(self.tactics_deck.pop())

            # Auto-claim completed flags
            self._auto_claim()
            return True

        return False

    def _auto_claim(self):
        """Check and auto-claim any provably won flags."""
        for i in range(9):
            if self.flag_status[i] != 0:
                continue
            for p in (1, 2):
                if self._try_claim(i, p):
                    self.flag_status[i] = p

    def _try_claim(self, flag, player):
        """Check if player can claim this flag."""
        opp = 3 - player
        mud = self.flag_mud[flag]
        fog = self.flag_fog[flag]
        needed = 4 if mud else 3

        my_cards = self.flags[flag][player]
        opp_cards = self.flags[flag][opp]

        if len(my_cards) < needed:
            return False

        my_formation = _classify_formation(my_cards, fog=fog, mud=mud)

        # If opponent has full cards, compare directly
        if len(opp_cards) >= needed:
            opp_formation = _classify_formation(opp_cards, fog=fog, mud=mud)
            return _formation_beats(my_formation, opp_formation)

        # Check if opponent could possibly beat us with remaining cards
        # Simplified: if opponent has fewer cards, check if any possible
        # completion could beat our formation
        best_possible = self._best_possible_formation(flag, opp, fog, mud)
        if best_possible is None:
            return True
        return _formation_beats(my_formation, best_possible)

    def _best_possible_formation(self, flag, player, fog, mud):
        """Calculate the best possible formation opponent could achieve."""
        needed = 4 if mud else 3
        current = self.flags[flag][player]
        slots = needed - len(current)

        if slots <= 0:
            return _classify_formation(current, fog=fog, mud=mud)

        # Get all available cards (not played anywhere, not in our hand)
        used = set()
        for i in range(9):
            for p in (1, 2):
                for c in self.flags[i][p]:
                    if c[0] != 'T':
                        used.add((c[0], c[1]))
        # Cards in discard are also unavailable
        for c in self.discard:
            if c[0] != 'T':
                used.add((c[0], c[1]))

        available = []
        for color in COLORS:
            for val in range(1, 11):
                if (color, val) not in used:
                    available.append((color, val))

        if len(available) < slots:
            return None

        # For small slot counts, check best possible
        # This is a simplified check - for 1-2 slots we can be thorough
        best = None
        if slots == 1:
            for card in available:
                test = list(current) + [card]
                f = _classify_formation(test, fog=fog, mud=mud)
                if best is None or _formation_beats(f, best):
                    best = f
        elif slots == 2:
            # Sample combinations for performance
            for i in range(min(len(available), 30)):
                for j in range(i + 1, min(len(available), 30)):
                    test = list(current) + [available[i], available[j]]
                    f = _classify_formation(test, fog=fog, mud=mud)
                    if best is None or _formation_beats(f, best):
                        best = f
        else:
            # 3+ slots: opponent could potentially get anything
            # Return the best possible formation (straight flush of 8-9-10)
            best = ('straight_flush', 27)

        return best

    def check_game_over(self):
        # Win: 3 adjacent flags or any 5 flags
        for p in (1, 2):
            claimed = [i for i in range(9) if self.flag_status[i] == p]
            if len(claimed) >= 5:
                self.game_over = True
                self.winner = p
                return

            # Check 3 adjacent
            for i in range(7):
                if all(self.flag_status[i + j] == p for j in range(3)):
                    self.game_over = True
                    self.winner = p
                    return

        # Check if all flags are claimed
        if all(self.flag_status[i] != 0 for i in range(9)):
            self.game_over = True
            p1_count = sum(1 for i in range(9) if self.flag_status[i] == 1)
            p2_count = sum(1 for i in range(9) if self.flag_status[i] == 2)
            if p1_count > p2_count:
                self.winner = 1
            elif p2_count > p1_count:
                self.winner = 2
            else:
                self.winner = None
            return

        # Check if both players have empty hands and deck is empty
        if not self.deck and not self.hands[1] and not self.hands[2]:
            self.game_over = True
            p1_count = sum(1 for i in range(9) if self.flag_status[i] == 1)
            p2_count = sum(1 for i in range(9) if self.flag_status[i] == 2)
            if p1_count > p2_count:
                self.winner = 1
            elif p2_count > p1_count:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            'deck': self.deck,
            'tactics_deck': self.tactics_deck,
            'flags': {str(i): {str(p): self.flags[i][p] for p in (1, 2)} for i in range(9)},
            'flag_status': {str(i): self.flag_status[i] for i in range(9)},
            'flag_fog': {str(i): self.flag_fog[i] for i in range(9)},
            'flag_mud': {str(i): self.flag_mud[i] for i in range(9)},
            'hands': {str(p): self.hands[p] for p in (1, 2)},
            'discard': self.discard,
            'tactics_played': {str(p): self.tactics_played[p] for p in (1, 2)},
        }

    def load_state(self, state):
        self.deck = [tuple(c) for c in state['deck']]
        self.tactics_deck = [tuple(c) for c in state['tactics_deck']]
        self.flags = {}
        for i in range(9):
            self.flags[i] = {}
            for p in (1, 2):
                self.flags[i][p] = [tuple(c) for c in state['flags'][str(i)][str(p)]]
        self.flag_status = {int(k): v for k, v in state['flag_status'].items()}
        self.flag_fog = {int(k): v for k, v in state['flag_fog'].items()}
        self.flag_mud = {int(k): v for k, v in state['flag_mud'].items()}
        self.hands = {int(k): [tuple(c) for c in v] for k, v in state['hands'].items()}
        self.discard = [tuple(c) for c in state['discard']]
        self.tactics_played = {int(k): v for k, v in state['tactics_played'].items()}

    def get_tutorial(self):
        txt = """
  ============================================================
    BATTLE LINE - Tutorial
  ============================================================

  OVERVIEW
    Two generals face off across 9 flags. Play cards to build
    formations at each flag. Claim flags by proving your
    formation is superior.

  CARDS
    60 troop cards: 6 colors (R,O,Y,G,B,P) x values 1-10

  FORMATIONS (strongest to weakest)
    Straight Flush : same color, consecutive values (e.g. R7 R8 R9)
    Three of a Kind: same value, any colors (e.g. R5 B5 G5)
    Flush          : same color, any values (e.g. B2 B5 B9)
    Straight       : consecutive values, any colors (e.g. R3 G4 B5)
    Host           : any cards, compared by sum

  CLAIMING FLAGS
    Type 'claim <flag#>' to claim a flag. You can claim when:
    - Both sides have 3 cards: yours beats theirs
    - Your side full, theirs partial: no possible completion beats you

  WINNING
    Win 3 ADJACENT flags  OR  any 5 flags total.

  TURNS
    Play one card from your hand to an unclaimed flag, then
    draw from the deck.

  COMMANDS
    <card#> <flag#>  - Play card to flag (e.g. '3 5')
    claim <flag#>    - Try to claim a flag"""

        if self.variation == 'tactics':
            txt += """

  TACTICS VARIATION
    A separate deck of 10 tactics cards with special powers.
    You may never play more tactics cards than your opponent +1."""

        return txt
