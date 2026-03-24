"""Puerto Rico Card Game - Simplified San Juan card game with role selection."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
GREEN = '\033[92m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
MAGENTA = '\033[95m'
WHITE = '\033[97m'

ROLES = ['Builder', 'Producer', 'Trader', 'Councillor', 'Prospector']

ROLE_COLORS = {
    'Builder': BLUE, 'Producer': GREEN, 'Trader': YELLOW,
    'Councillor': MAGENTA, 'Prospector': CYAN,
}

BUILDING_CARDS = [
    {'name': 'Indigo Plant', 'cost': 1, 'vp': 1, 'production': 'indigo', 'count': 5},
    {'name': 'Sugar Mill', 'cost': 2, 'vp': 1, 'production': 'sugar', 'count': 4},
    {'name': 'Tobacco Storage', 'cost': 3, 'vp': 2, 'production': 'tobacco', 'count': 3},
    {'name': 'Coffee Roaster', 'cost': 4, 'vp': 2, 'production': 'coffee', 'count': 3},
    {'name': 'Silver Smelter', 'cost': 5, 'vp': 3, 'production': 'silver', 'count': 2},
    {'name': 'Smithy', 'cost': 1, 'vp': 1, 'production': None, 'count': 3},
    {'name': 'Market Hall', 'cost': 2, 'vp': 1, 'production': None, 'count': 3},
    {'name': 'Archive', 'cost': 1, 'vp': 1, 'production': None, 'count': 3},
    {'name': 'Crane', 'cost': 2, 'vp': 1, 'production': None, 'count': 2},
    {'name': 'Quarry', 'cost': 4, 'vp': 2, 'production': None, 'count': 2},
    {'name': 'Trading House', 'cost': 3, 'vp': 2, 'production': None, 'count': 2},
    {'name': 'Guild Hall', 'cost': 6, 'vp': 0, 'production': None, 'count': 1},
    {'name': 'City Hall', 'cost': 6, 'vp': 0, 'production': None, 'count': 1},
    {'name': 'Palace', 'cost': 6, 'vp': 0, 'production': None, 'count': 1},
    {'name': 'Triumphal Arch', 'cost': 6, 'vp': 0, 'production': None, 'count': 1},
]

TRADE_VALUES = {
    'indigo': 1, 'sugar': 2, 'tobacco': 3, 'coffee': 4, 'silver': 5,
}


def _make_deck():
    deck = []
    for card_def in BUILDING_CARDS:
        for _ in range(card_def['count']):
            deck.append(dict(card_def))
    random.shuffle(deck)
    return deck


class PuertoRicoCardGame(BaseGame):
    name = "Puerto Rico Card"
    description = "Role selection card game inspired by San Juan"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game (12 rounds)',
        'quick': 'Quick game (8 rounds)',
    }

    def setup(self):
        self.max_rounds = 12 if self.variation == 'standard' else 8
        self.round_num = 1
        self.deck = _make_deck()
        self.hands = {1: [], 2: []}
        self.tableaux = {1: [], 2: []}
        self.goods = {1: [], 2: []}
        self.role_phase = True  # True = choosing role, False = executing
        self.chosen_role = None
        self.role_chooser = None
        self.roles_used = []
        self.phase_step = 0

        # Deal 4 cards each
        for _ in range(4):
            for p in (1, 2):
                if self.deck:
                    self.hands[p].append(self.deck.pop())

    def _draw_cards(self, player, count):
        drawn = []
        for _ in range(count):
            if self.deck:
                drawn.append(self.deck.pop())
            else:
                # Reshuffle discard - simplified: make new deck
                self.deck = _make_deck()
                drawn.append(self.deck.pop())
        self.hands[player].extend(drawn)
        return drawn

    def _vp_for_player(self, player):
        vp = 0
        production_buildings = 0
        non_production = 0
        monuments = 0
        for card in self.tableaux[player]:
            vp += card['vp']
            if card['production']:
                production_buildings += 1
            else:
                non_production += 1
            if card['cost'] >= 6:
                monuments += 1

        # Special building bonuses
        for card in self.tableaux[player]:
            if card['name'] == 'Guild Hall':
                vp += production_buildings * 2
            elif card['name'] == 'City Hall':
                vp += non_production
            elif card['name'] == 'Palace':
                vp += len(self.tableaux[player]) // 4
            elif card['name'] == 'Triumphal Arch':
                vp += monuments * 3
        return vp

    def _has_building(self, player, name):
        return any(c['name'] == name for c in self.tableaux[player])

    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 55}")
        print(f"  PUERTO RICO CARD  --  Round {self.round_num}/{self.max_rounds}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Deck: {len(self.deck)} cards")
        print(f"{'=' * 55}")

        for p in (1, 2):
            marker = " <<" if p == cp else ""
            vp = self._vp_for_player(p)
            buildings = ', '.join(c['name'] for c in self.tableaux[p]) or 'none'
            goods_str = ', '.join(self.goods[p]) or 'none'
            print(f"\n  {self.players[p-1]}: {vp} VP | Hand: {len(self.hands[p])} cards{marker}")
            print(f"    Buildings: {buildings}")
            print(f"    Goods: {goods_str}")

        if self.role_phase:
            used_str = ', '.join(self.roles_used) if self.roles_used else 'none'
            print(f"\n  Used roles this round: {used_str}")
            print(f"  Available roles:")
            for i, role in enumerate(ROLES):
                if role not in self.roles_used:
                    color = ROLE_COLORS.get(role, WHITE)
                    print(f"    {i+1}: {color}{role}{RESET}")
        else:
            color = ROLE_COLORS.get(self.chosen_role, WHITE)
            print(f"\n  Current role: {color}{self.chosen_role}{RESET}")
            if self.role_chooser == cp:
                print(f"  (You chose this role - you get the privilege!)")

        # Show hand to current player
        if self.hands[cp]:
            hand_str = '  '.join(f"{i+1}:{c['name']}({c['cost']})" for i, c in enumerate(self.hands[cp]))
            print(f"\n  Your hand: {hand_str}")

    def get_move(self):
        cp = self.current_player

        if self.role_phase:
            while True:
                raw = input_with_quit("  Choose a role (number): ").strip()
                if raw.isdigit():
                    idx = int(raw) - 1
                    if 0 <= idx < len(ROLES) and ROLES[idx] not in self.roles_used:
                        return ('choose_role', ROLES[idx])
                    print("  That role is unavailable.")
                else:
                    print("  Enter a role number.")

        # Executing role
        if self.chosen_role == 'Builder':
            while True:
                raw = input_with_quit("  Build card # from hand (or 'pass'): ").strip().lower()
                if raw in ('pass', 'p', ''):
                    return ('pass',)
                if raw.isdigit():
                    idx = int(raw) - 1
                    if 0 <= idx < len(self.hands[cp]):
                        return ('build', idx)
                print("  Enter a card number or 'pass'.")

        elif self.chosen_role == 'Producer':
            prod_buildings = [c for c in self.tableaux[cp] if c['production']
                            and c['production'] not in self.goods[cp]]
            if not prod_buildings:
                return ('auto_produce',)
            print("  Production buildings without goods:")
            for i, c in enumerate(prod_buildings):
                print(f"    {i+1}: {c['name']} -> {c['production']}")
            while True:
                raw = input_with_quit("  Produce at # (or 'all'): ").strip().lower()
                if raw in ('all', 'a', ''):
                    return ('produce_all',)
                if raw.isdigit():
                    idx = int(raw) - 1
                    if 0 <= idx < len(prod_buildings):
                        return ('produce', prod_buildings[idx]['production'])
                print("  Enter a building number or 'all'.")

        elif self.chosen_role == 'Trader':
            if not self.goods[cp]:
                return ('auto_trade',)
            print("  Goods to trade:")
            for i, g in enumerate(self.goods[cp]):
                val = TRADE_VALUES.get(g, 1)
                print(f"    {i+1}: {g} (worth {val} cards)")
            while True:
                raw = input_with_quit("  Trade good # (or 'all' or 'pass'): ").strip().lower()
                if raw in ('pass', 'p'):
                    return ('pass',)
                if raw in ('all', 'a', ''):
                    return ('trade_all',)
                if raw.isdigit():
                    idx = int(raw) - 1
                    if 0 <= idx < len(self.goods[cp]):
                        return ('trade', idx)
                print("  Enter a good number, 'all', or 'pass'.")

        elif self.chosen_role == 'Councillor':
            return ('councillor',)

        elif self.chosen_role == 'Prospector':
            return ('prospector',)

        return ('pass',)

    def make_move(self, move):
        cp = self.current_player

        if move[0] == 'choose_role':
            role = move[1]
            self.chosen_role = role
            self.role_chooser = cp
            self.roles_used.append(role)
            self.role_phase = False
            self.phase_step = 0
            return False  # Don't switch player - execute role

        if move[0] == 'build':
            idx = move[1]
            card = self.hands[cp][idx]
            discount = 1 if cp == self.role_chooser else 0
            if self._has_building(cp, 'Smithy'):
                discount += 1
            effective_cost = max(0, card['cost'] - discount)
            # Pay with cards from hand
            if len(self.hands[cp]) - 1 < effective_cost:
                print(f"  Not enough cards! Need {effective_cost} cards to pay.")
                return False
            # Remove the card being built
            built = self.hands[cp].pop(idx)
            # Discard payment cards (from end of hand)
            for _ in range(effective_cost):
                if self.hands[cp]:
                    self.hands[cp].pop()
            self.tableaux[cp].append(built)
            print(f"  Built {built['name']}!")
            self._advance_role()
            return self._check_role_done()

        if move[0] == 'pass':
            self._advance_role()
            return self._check_role_done()

        if move[0] in ('produce_all', 'auto_produce'):
            for card in self.tableaux[cp]:
                if card['production'] and card['production'] not in self.goods[cp]:
                    self.goods[cp].append(card['production'])
            if cp == self.role_chooser:
                # Privilege: produce one extra (if possible)
                pass
            print(f"  Produced goods: {', '.join(self.goods[cp]) or 'none'}")
            self._advance_role()
            return self._check_role_done()

        if move[0] == 'produce':
            good = move[1]
            if good not in self.goods[cp]:
                self.goods[cp].append(good)
            self._advance_role()
            return self._check_role_done()

        if move[0] in ('trade_all', 'auto_trade'):
            total_cards = 0
            extra = 1 if cp == self.role_chooser else 0
            market_bonus = 1 if self._has_building(cp, 'Market Hall') else 0
            for g in list(self.goods[cp]):
                val = TRADE_VALUES.get(g, 1) + market_bonus
                total_cards += val
            if total_cards > 0:
                self._draw_cards(cp, total_cards + extra)
                print(f"  Traded all goods for {total_cards + extra} cards!")
            self.goods[cp] = []
            self._advance_role()
            return self._check_role_done()

        if move[0] == 'trade':
            idx = move[1]
            if idx < len(self.goods[cp]):
                g = self.goods[cp].pop(idx)
                market_bonus = 1 if self._has_building(cp, 'Market Hall') else 0
                extra = 1 if cp == self.role_chooser else 0
                val = TRADE_VALUES.get(g, 1) + market_bonus + extra
                self._draw_cards(cp, val)
                print(f"  Traded {g} for {val} cards!")
            self._advance_role()
            return self._check_role_done()

        if move[0] == 'councillor':
            count = 5 if cp == self.role_chooser else 3
            self._draw_cards(cp, count)
            # Hand limit: discard down to 7
            while len(self.hands[cp]) > 7:
                self.hands[cp].pop()
            print(f"  Drew {count} cards. Hand: {len(self.hands[cp])}")
            self._advance_role()
            return self._check_role_done()

        if move[0] == 'prospector':
            if cp == self.role_chooser:
                self._draw_cards(cp, 1)
                print("  Gained 1 card (privilege)!")
            else:
                print("  No benefit (not the chooser).")
            self._advance_role()
            return self._check_role_done()

        return False

    def _advance_role(self):
        self.phase_step += 1

    def _check_role_done(self):
        if self.phase_step >= 2:
            # Both players have acted on this role
            self.role_phase = True
            self.chosen_role = None

            # Check if both players have chosen roles this round
            if len(self.roles_used) >= 2:
                # Round over
                self.roles_used = []
                self.round_num += 1
                return True  # switch player for next round's first pick

            return True  # switch to other player's role pick
        else:
            return True  # switch to other player for role execution

    def check_game_over(self):
        if self.round_num > self.max_rounds:
            self.game_over = True
            vp1 = self._vp_for_player(1)
            vp2 = self._vp_for_player(2)
            if vp1 > vp2:
                self.winner = 1
            elif vp2 > vp1:
                self.winner = 2
            else:
                self.winner = None

        # Also end if someone builds 12+ buildings
        for p in (1, 2):
            if len(self.tableaux[p]) >= 12:
                self.game_over = True
                vp1 = self._vp_for_player(1)
                vp2 = self._vp_for_player(2)
                if vp1 > vp2:
                    self.winner = 1
                elif vp2 > vp1:
                    self.winner = 2
                else:
                    self.winner = None

    def get_state(self):
        return {
            'max_rounds': self.max_rounds,
            'round_num': self.round_num,
            'deck': self.deck,
            'hands': {str(k): v for k, v in self.hands.items()},
            'tableaux': {str(k): v for k, v in self.tableaux.items()},
            'goods': {str(k): v for k, v in self.goods.items()},
            'role_phase': self.role_phase,
            'chosen_role': self.chosen_role,
            'role_chooser': self.role_chooser,
            'roles_used': self.roles_used,
            'phase_step': self.phase_step,
        }

    def load_state(self, state):
        self.max_rounds = state['max_rounds']
        self.round_num = state['round_num']
        self.deck = state['deck']
        self.hands = {int(k): v for k, v in state['hands'].items()}
        self.tableaux = {int(k): v for k, v in state['tableaux'].items()}
        self.goods = {int(k): v for k, v in state['goods'].items()}
        self.role_phase = state['role_phase']
        self.chosen_role = state['chosen_role']
        self.role_chooser = state['role_chooser']
        self.roles_used = state['roles_used']
        self.phase_step = state['phase_step']

    def get_tutorial(self):
        return """
  ============================================================
    PUERTO RICO CARD GAME - Tutorial
  ============================================================

  OVERVIEW
    Choose roles each round to build buildings, produce goods,
    and trade for cards. Most VP from buildings wins.

  ROLES (choose 1 per round)
    Builder    : Build a building (privilege: -1 cost)
    Producer   : Produce goods on production buildings
    Trader     : Sell goods for cards (privilege: +1 card)
    Councillor : Draw cards (privilege: 5 instead of 3)
    Prospector : Gain 1 card (privilege only)

  BUILDING
    Pay a building's cost by discarding that many cards from
    your hand. Production buildings generate goods.

  TRADING
    Sell goods for cards based on value:
    Indigo=1, Sugar=2, Tobacco=3, Coffee=4, Silver=5

  WINNING
    Most VP from buildings at game end.
    Special 6-cost buildings give bonus VP."""
