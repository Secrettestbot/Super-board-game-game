"""Quacks of Quedlinburg - Bag-building push-your-luck cauldron brewing game."""

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
DIM = '\033[2m'

# Chip types: (name, color_code, description)
CHIP_TYPES = {
    'white': (WHITE, 'Cherry Bomb', 1),
    'green': (GREEN, 'Healing Herb', 1),
    'blue': (BLUE, 'Toadstool', 1),
    'red': (RED, 'Mandrake', 1),
    'yellow': (YELLOW, 'Crow Skull', 1),
    'purple': (MAGENTA, 'Ghost Breath', 1),
    'orange': ('\033[38;5;208m', 'Pumpkin', 1),
}

# Ingredient costs by value
SHOP_ITEMS = [
    {'name': 'green_2', 'type': 'green', 'value': 2, 'cost': 4, 'desc': 'Green-2: When drawn, draw 1 extra chip'},
    {'name': 'blue_2', 'type': 'blue', 'value': 2, 'cost': 5, 'desc': 'Blue-2: Worth 2 spaces in cauldron'},
    {'name': 'red_2', 'type': 'red', 'value': 2, 'cost': 6, 'desc': 'Red-2: Worth 2 spaces, +1 VP'},
    {'name': 'yellow_2', 'type': 'yellow', 'value': 2, 'cost': 8, 'desc': 'Yellow-2: Worth 2 spaces, +2 ruby'},
    {'name': 'green_4', 'type': 'green', 'value': 4, 'cost': 10, 'desc': 'Green-4: When drawn, draw 2 extra chips'},
    {'name': 'blue_4', 'type': 'blue', 'value': 4, 'cost': 14, 'desc': 'Blue-4: Worth 4 spaces in cauldron'},
    {'name': 'purple_1', 'type': 'purple', 'value': 1, 'cost': 5, 'desc': 'Purple-1: Worth 1, last white chip counts as 0'},
    {'name': 'orange_1', 'type': 'orange', 'value': 1, 'cost': 3, 'desc': 'Orange-1: Worth 1 space'},
]

HERB_WITCH_SHOP = [
    {'name': 'green_2', 'type': 'green', 'value': 2, 'cost': 4, 'desc': 'Green-2: Draw 1 extra chip'},
    {'name': 'blue_2', 'type': 'blue', 'value': 2, 'cost': 5, 'desc': 'Blue-2: Worth 2 spaces'},
    {'name': 'red_2', 'type': 'red', 'value': 2, 'cost': 6, 'desc': 'Red-2: Worth 2 spaces, +1 VP'},
    {'name': 'yellow_2', 'type': 'yellow', 'value': 2, 'cost': 7, 'desc': 'Yellow-2: Worth 2, place white back in bag'},
    {'name': 'green_4', 'type': 'green', 'value': 4, 'cost': 9, 'desc': 'Green-4: Draw 2 extra chips'},
    {'name': 'blue_4', 'type': 'blue', 'value': 4, 'cost': 12, 'desc': 'Blue-4: Worth 4 spaces'},
    {'name': 'purple_1', 'type': 'purple', 'value': 1, 'cost': 4, 'desc': 'Purple-1: Reduce white total by 1'},
    {'name': 'orange_1', 'type': 'orange', 'value': 1, 'cost': 3, 'desc': 'Orange-1: Worth 1 space'},
]

# Score track: position -> (VP, coins)
SCORE_TRACK = {}
for i in range(0, 36):
    vp = max(0, i - 5)
    coins = i
    SCORE_TRACK[i] = (vp, coins)

BUST_LIMIT = 7


class QuacksGame(BaseGame):
    """Quacks of Quedlinburg: Draw chips, push your luck, brew potions."""

    name = "Quacks of Quedlinburg"
    description = "Bag-building push-your-luck cauldron brewing game"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard ingredient set',
        'herb_witches': 'Herb Witches variant with modified ingredients',
    }

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        self.round_num = 1
        self.max_rounds = 9
        self.phase = 'draw'  # draw, buy, scoring
        self.scores = {1: 0, 2: 0}
        self.rubies = {1: 1, 2: 1}
        self.coins = {1: 0, 2: 0}
        self.bags = {}
        self.cauldrons = {1: [], 2: []}
        self.cauldron_pos = {1: 0, 2: 0}
        self.white_total = {1: 0, 2: 0}
        self.busted = {1: False, 2: False}
        self.stopped = {1: False, 2: False}
        self.rat_tails = {1: 0, 2: 0}
        self.bonus_draws = {1: 0, 2: 0}
        for p in (1, 2):
            self.bags[p] = self._starting_bag()
            random.shuffle(self.bags[p])
        self.round_done_players = set()

    def _starting_bag(self):
        bag = []
        for _ in range(4):
            bag.append(('white', 1))
        for _ in range(2):
            bag.append(('white', 2))
        bag.append(('white', 3))
        bag.append(('orange', 1))
        bag.append(('green', 1))
        return bag

    def _get_shop(self):
        if self.variation == 'herb_witches':
            return HERB_WITCH_SHOP
        return SHOP_ITEMS

    def _draw_chip(self, player):
        if not self.bags[player]:
            return None
        chip = self.bags[player].pop()
        return chip

    def _cauldron_value(self, player):
        total = 0
        for chip_type, chip_val in self.cauldrons[player]:
            if chip_type != 'white':
                total += chip_val
            else:
                total += chip_val
        return total

    def _position(self, player):
        pos = 0
        for chip_type, chip_val in self.cauldrons[player]:
            if chip_type == 'blue':
                pos += chip_val
            elif chip_type != 'white':
                pos += chip_val
            else:
                pos += chip_val
        return min(pos, 35)

    def _white_sum(self, player):
        total = 0
        for chip_type, chip_val in self.cauldrons[player]:
            if chip_type == 'white':
                total += chip_val
        if self.variation == 'herb_witches':
            purple_count = sum(1 for ct, cv in self.cauldrons[player] if ct == 'purple')
            total = max(0, total - purple_count)
        return total

    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 58}")
        print(f"  QUACKS OF QUEDLINBURG  --  Round {self.round_num}/{self.max_rounds}")
        variant_str = " (Herb Witches)" if self.variation == 'herb_witches' else ""
        print(f"  {self.players[0]} vs {self.players[1]}{variant_str}")
        print(f"{'=' * 58}")

        for p in (1, 2):
            marker = f" {YELLOW}<<{RESET}" if p == cp else ""
            status = ""
            if self.busted[p]:
                status = f" {RED}[BUSTED]{RESET}"
            elif self.stopped[p]:
                status = f" {GREEN}[STOPPED]{RESET}"
            pos = self._position(p)
            vp_val = SCORE_TRACK.get(min(pos, 35), (0, 0))[0]
            coin_val = SCORE_TRACK.get(min(pos, 35), (0, 0))[1]
            print(f"\n  {self.players[p-1]}: {self.scores[p]} VP | "
                  f"Rubies: {self.rubies[p]} | Bag: {len(self.bags[p])} chips{marker}{status}")

            cauldron_str = ""
            for ct, cv in self.cauldrons[p]:
                color_code = CHIP_TYPES.get(ct, (WHITE, '', 1))[0]
                cauldron_str += f"{color_code}[{ct[0].upper()}{cv}]{RESET} "
            if cauldron_str:
                print(f"    Cauldron: {cauldron_str}")
                white_s = self._white_sum(p)
                print(f"    Position: {pos} | White total: {white_s}/{BUST_LIMIT} | "
                      f"Earns: {vp_val} VP, {coin_val} coins")
            else:
                print(f"    Cauldron: empty")

        if self.phase == 'draw':
            print(f"\n  {DIM}Phase: DRAWING (push your luck!){RESET}")
        elif self.phase == 'buy':
            cp_coins = self.coins[cp]
            print(f"\n  {DIM}Phase: BUYING -- Coins available: {cp_coins}{RESET}")
            shop = self._get_shop()
            for i, item in enumerate(shop):
                color_code = CHIP_TYPES.get(item['type'], (WHITE, '', 1))[0]
                affordable = GREEN + "YES" + RESET if cp_coins >= item['cost'] else RED + "no" + RESET
                print(f"    {i+1}. {color_code}{item['desc']}{RESET} -- Cost: {item['cost']} [{affordable}]")

    def get_move(self):
        cp = self.current_player
        if self.phase == 'draw':
            if self.busted[cp] or self.stopped[cp]:
                return ('next_player',)
            while True:
                if self.rubies[cp] >= 2:
                    raw = input_with_quit("  (d)raw, (s)top, (r)uby-return-white? ").strip().lower()
                else:
                    raw = input_with_quit("  (d)raw a chip or (s)top? ").strip().lower()
                if raw in ('d', 'draw', ''):
                    return ('draw',)
                elif raw in ('s', 'stop'):
                    return ('stop',)
                elif raw in ('r', 'ruby') and self.rubies[cp] >= 2:
                    return ('ruby_return',)
                print("  Invalid choice.")

        elif self.phase == 'buy':
            while True:
                raw = input_with_quit("  Buy item # (or 'done'): ").strip().lower()
                if raw in ('done', 'd', ''):
                    return ('done_buying',)
                try:
                    idx = int(raw) - 1
                    shop = self._get_shop()
                    if 0 <= idx < len(shop):
                        return ('buy', idx)
                except ValueError:
                    pass
                print("  Enter item number or 'done'.")

    def make_move(self, move):
        cp = self.current_player
        if move[0] == 'draw':
            chip = self._draw_chip(cp)
            if chip is None:
                print("  Bag is empty! You must stop.")
                self.stopped[cp] = True
                return False
            self.cauldrons[cp].append(chip)
            ct, cv = chip
            if ct == 'green' and cv >= 2:
                extra = min(cv // 2, len(self.bags[cp]))
                for _ in range(extra):
                    bonus = self._draw_chip(cp)
                    if bonus:
                        self.cauldrons[cp].append(bonus)
            white_s = self._white_sum(cp)
            if white_s > BUST_LIMIT:
                self.busted[cp] = True
                print(f"  {RED}BUST! White total {white_s} > {BUST_LIMIT}!{RESET}")
                input("  Press Enter...")
            return False

        elif move[0] == 'stop':
            self.stopped[cp] = True
            return False

        elif move[0] == 'ruby_return':
            whites_in_cauldron = [(i, c) for i, c in enumerate(self.cauldrons[cp]) if c[0] == 'white']
            if whites_in_cauldron:
                idx, chip = whites_in_cauldron[-1]
                self.cauldrons[cp].pop(idx)
                self.bags[cp].append(chip)
                random.shuffle(self.bags[cp])
                self.rubies[cp] -= 2
                print(f"  Returned a white chip to bag. Rubies: {self.rubies[cp]}")
            else:
                print("  No white chips in cauldron to return.")
            return False

        elif move[0] == 'next_player':
            if cp == 1 and not (self.busted[2] or self.stopped[2]):
                return True
            elif cp == 2 and not (self.busted[1] or self.stopped[1]):
                return True
            both_done = all(self.busted[p] or self.stopped[p] for p in (1, 2))
            if both_done:
                self._resolve_round()
                return True
            return True

        elif move[0] == 'buy':
            shop = self._get_shop()
            item = shop[move[1]]
            if self.coins[cp] >= item['cost']:
                self.coins[cp] -= item['cost']
                self.bags[cp].append((item['type'], item['value']))
                random.shuffle(self.bags[cp])
                print(f"  Bought {item['desc'].split(':')[0]}!")
                if item['type'] == 'red':
                    self.scores[cp] += 1
                if item['type'] == 'yellow' and item['value'] >= 2:
                    self.rubies[cp] += 1
                return False
            else:
                print("  Not enough coins!")
                return False

        elif move[0] == 'done_buying':
            if cp in self.round_done_players:
                return True
            self.round_done_players.add(cp)
            if len(self.round_done_players) >= 2:
                self._end_round()
                return True
            return True

        return False

    def _resolve_round(self):
        for p in (1, 2):
            pos = self._position(p)
            capped = min(pos, 35)
            vp_val, coin_val = SCORE_TRACK.get(capped, (0, 0))
            if self.busted[p]:
                choice = random.choice(['vp', 'coins'])
                if choice == 'vp':
                    self.scores[p] += vp_val
                else:
                    self.coins[p] += coin_val
            else:
                self.scores[p] += vp_val
                self.coins[p] += coin_val

        p1_pos = self._position(1)
        p2_pos = self._position(2)
        if not self.busted[1] and not self.busted[2]:
            diff = abs(p1_pos - p2_pos)
            if diff > 0:
                behind = 1 if p1_pos < p2_pos else 2
                self.rat_tails[behind] = diff

        self.phase = 'buy'

    def _end_round(self):
        for p in (1, 2):
            drawn = self.cauldrons[p]
            self.bags[p].extend(drawn)
            self.cauldrons[p] = []
            random.shuffle(self.bags[p])

        self.round_num += 1
        self.phase = 'draw'
        self.busted = {1: False, 2: False}
        self.stopped = {1: False, 2: False}
        self.round_done_players = set()
        self.rat_tails = {1: 0, 2: 0}

    def check_game_over(self):
        if self.round_num > self.max_rounds:
            self.game_over = True
            if self.scores[1] > self.scores[2]:
                self.winner = 1
            elif self.scores[2] > self.scores[1]:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            'round_num': self.round_num,
            'max_rounds': self.max_rounds,
            'phase': self.phase,
            'scores': {str(k): v for k, v in self.scores.items()},
            'rubies': {str(k): v for k, v in self.rubies.items()},
            'coins': {str(k): v for k, v in self.coins.items()},
            'bags': {str(k): v for k, v in self.bags.items()},
            'cauldrons': {str(k): v for k, v in self.cauldrons.items()},
            'busted': {str(k): v for k, v in self.busted.items()},
            'stopped': {str(k): v for k, v in self.stopped.items()},
            'rat_tails': {str(k): v for k, v in self.rat_tails.items()},
            'round_done_players': list(self.round_done_players),
        }

    def load_state(self, state):
        self.round_num = state['round_num']
        self.max_rounds = state['max_rounds']
        self.phase = state['phase']
        self.scores = {int(k): v for k, v in state['scores'].items()}
        self.rubies = {int(k): v for k, v in state['rubies'].items()}
        self.coins = {int(k): v for k, v in state['coins'].items()}
        self.bags = {int(k): [tuple(c) for c in v] for k, v in state['bags'].items()}
        self.cauldrons = {int(k): [tuple(c) for c in v] for k, v in state['cauldrons'].items()}
        self.busted = {int(k): v for k, v in state['busted'].items()}
        self.stopped = {int(k): v for k, v in state['stopped'].items()}
        self.rat_tails = {int(k): v for k, v in state['rat_tails'].items()}
        self.round_done_players = set(state['round_done_players'])

    def get_tutorial(self):
        return """
  ============================================================
    QUACKS OF QUEDLINBURG - Tutorial
  ============================================================

  OVERVIEW
    You are charlatans brewing potions! Draw ingredient chips
    from your bag to fill your cauldron. Push your luck -- but
    beware of cherry bombs (white chips)!

  DRAWING PHASE
    Each turn, draw chips one at a time from your bag.
    Chips advance your position in the cauldron track.

    WHITE chips are Cherry Bombs. If your white chip total
    exceeds 7, you BUST and must choose EITHER victory points
    OR coins (not both) for that round.

    You may stop drawing at any time to lock in your position.

  SPECIAL CHIPS
    Green : Draw bonus chips when pulled
    Blue  : Worth extra spaces in cauldron
    Red   : Worth extra VP when bought
    Yellow: Earn rubies when bought
    Purple: Reduce your white chip penalty
    Orange: Basic filler chip

  BUYING PHASE
    After drawing, spend coins to buy new ingredient chips
    for your bag. Better chips cost more but give powerful
    effects when drawn.

  RUBIES
    Spend 2 rubies to return 1 white chip from your cauldron
    back to your bag (before drawing).

  SCORING
    Your cauldron position determines VP and coins earned.
    Higher position = more rewards. After 9 rounds, most VP wins.

  VARIANT: HERB WITCHES
    Modified ingredient costs and effects. Purple chips reduce
    white chip totals. Yellow chips return whites to bag."""
