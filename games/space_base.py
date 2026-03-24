"""Space Base - Dice activation engine builder with ship deployment."""

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

# Ship cards: (name, sector, cost, active_reward, deployed_reward)
# Active reward triggers on YOUR turn, deployed reward triggers on OPPONENT's turn
SHIP_CARDS = [
    {'name': 'Scout', 'sector': 1, 'cost': 2, 'active': {'income': 2}, 'deployed': {'income': 1},
     'desc': 'Scout: +2 income (active), +1 income (deployed)'},
    {'name': 'Frigate', 'sector': 2, 'cost': 3, 'active': {'income': 3}, 'deployed': {'income': 1},
     'desc': 'Frigate: +3 income (active), +1 income (deployed)'},
    {'name': 'Cargo Ship', 'sector': 3, 'cost': 3, 'active': {'income': 2, 'vp': 1}, 'deployed': {'income': 1},
     'desc': 'Cargo: +2 income +1 VP (active), +1 income (deployed)'},
    {'name': 'Destroyer', 'sector': 4, 'cost': 4, 'active': {'vp': 2}, 'deployed': {'vp': 1},
     'desc': 'Destroyer: +2 VP (active), +1 VP (deployed)'},
    {'name': 'Cruiser', 'sector': 5, 'cost': 5, 'active': {'income': 3, 'vp': 1}, 'deployed': {'income': 1},
     'desc': 'Cruiser: +3 income +1 VP (active), +1 income (deployed)'},
    {'name': 'Battleship', 'sector': 6, 'cost': 6, 'active': {'vp': 3}, 'deployed': {'vp': 1},
     'desc': 'Battleship: +3 VP (active), +1 VP (deployed)'},
    {'name': 'Carrier', 'sector': 7, 'cost': 7, 'active': {'income': 4, 'vp': 2}, 'deployed': {'income': 1},
     'desc': 'Carrier: +4 income +2 VP (active), +1 income (deployed)'},
    {'name': 'Dreadnought', 'sector': 8, 'cost': 8, 'active': {'vp': 4}, 'deployed': {'vp': 2},
     'desc': 'Dreadnought: +4 VP (active), +2 VP (deployed)'},
    {'name': 'Flagship', 'sector': 9, 'cost': 10, 'active': {'vp': 5, 'income': 2}, 'deployed': {'vp': 2},
     'desc': 'Flagship: +5 VP +2 income (active), +2 VP (deployed)'},
    {'name': 'Colony Ship', 'sector': 10, 'cost': 12, 'active': {'vp': 6}, 'deployed': {'vp': 3},
     'desc': 'Colony Ship: +6 VP (active), +3 VP (deployed)'},
    {'name': 'Station', 'sector': 11, 'cost': 14, 'active': {'vp': 7, 'income': 3}, 'deployed': {'vp': 3},
     'desc': 'Station: +7 VP +3 income (active), +3 VP (deployed)'},
    {'name': 'Titan', 'sector': 12, 'cost': 16, 'active': {'vp': 10}, 'deployed': {'vp': 4},
     'desc': 'Titan: +10 VP (active), +4 VP (deployed)'},
]

SAGA_SHIPS = [
    {'name': 'Recon Drone', 'sector': 1, 'cost': 3, 'active': {'income': 3}, 'deployed': {'income': 2},
     'desc': 'Recon Drone: +3 income (active), +2 income (deployed)'},
    {'name': 'War Frigate', 'sector': 2, 'cost': 4, 'active': {'income': 4}, 'deployed': {'income': 2},
     'desc': 'War Frigate: +4 income (active), +2 income (deployed)'},
    {'name': 'Trade Vessel', 'sector': 3, 'cost': 4, 'active': {'income': 3, 'vp': 2}, 'deployed': {'income': 1, 'vp': 1},
     'desc': 'Trade Vessel: +3 income +2 VP (a), +1 income +1 VP (d)'},
    {'name': 'Heavy Cruiser', 'sector': 5, 'cost': 7, 'active': {'vp': 4, 'income': 2}, 'deployed': {'vp': 2},
     'desc': 'Heavy Cruiser: +4 VP +2 income (a), +2 VP (d)'},
    {'name': 'Juggernaut', 'sector': 8, 'cost': 10, 'active': {'vp': 6}, 'deployed': {'vp': 3},
     'desc': 'Juggernaut: +6 VP (active), +3 VP (deployed)'},
    {'name': 'Mothership', 'sector': 12, 'cost': 18, 'active': {'vp': 12}, 'deployed': {'vp': 5},
     'desc': 'Mothership: +12 VP (active), +5 VP (deployed)'},
]

VP_TO_WIN = 40


class SpaceBaseGame(BaseGame):
    """Space Base: Dice activation engine builder with ship slots."""

    name = "Space Base"
    description = "Dice activation engine builder with 12 ship slots"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game (40 VP to win)',
        'saga': 'Saga variant with upgraded ships and 50 VP goal',
    }

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        self.vp_target = 50 if self.variation == 'saga' else VP_TO_WIN
        self.phase = 'roll'  # roll, activate, buy
        self.scores = {1: 0, 2: 0}
        self.income = {1: 5, 2: 5}
        self.current_income = {1: 0, 2: 0}
        # Each player has 12 sectors (1-12), each with active and deployed ships
        self.active_ships = {1: {}, 2: {}}
        self.deployed_ships = {1: {}, 2: {}}
        # Starting ships: basic +1 income in each sector
        for p in (1, 2):
            for s in range(1, 13):
                self.active_ships[p][s] = {'name': f'Starter-{s}', 'active': {'income': 1}, 'deployed': {'income': 0}}
        self.dice_result = []
        self.dice_choice = None
        self.shop = []
        self._refresh_shop()
        self.round_num = 1

    def _refresh_shop(self):
        base_cards = list(SHIP_CARDS)
        if self.variation == 'saga':
            base_cards.extend(SAGA_SHIPS)
        random.shuffle(base_cards)
        self.shop = base_cards[:6]

    def _roll_dice(self):
        return [random.randint(1, 6), random.randint(1, 6)]

    def _get_activatable_sectors(self, d1, d2):
        """Return list of possible sector activations from a roll."""
        options = []
        options.append(('split', d1, d2))  # activate both sectors separately
        total = d1 + d2
        if total <= 12:
            options.append(('combined', total))  # activate combined sector
        return options

    def _activate_sector(self, player, sector, is_active_turn):
        """Activate a sector for a player. Returns (vp_gained, income_gained)."""
        vp = 0
        inc = 0
        if is_active_turn:
            ship = self.active_ships[player].get(sector)
            if ship:
                reward = ship.get('active', {})
                vp += reward.get('vp', 0)
                inc += reward.get('income', 0)
        else:
            ship = self.deployed_ships[player].get(sector)
            if ship:
                reward = ship.get('deployed', {})
                vp += reward.get('vp', 0)
                inc += reward.get('income', 0)
        return vp, inc

    def display(self):
        cp = self.current_player
        opp = 2 if cp == 1 else 1
        print(f"\n{'=' * 62}")
        variant_tag = " [SAGA]" if self.variation == 'saga' else ""
        print(f"  SPACE BASE{variant_tag}  --  Target: {self.vp_target} VP")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"{'=' * 62}")

        for p in (1, 2):
            marker = f" {YELLOW}<<{RESET}" if p == cp else ""
            print(f"\n  {self.players[p-1]}: {GREEN}{self.scores[p]} VP{RESET} | "
                  f"Income: {YELLOW}{self.income[p]}{RESET}{marker}")

            # Show sectors in a compact grid
            line1 = "    Active:   "
            line2 = "    Deployed: "
            for s in range(1, 13):
                a_ship = self.active_ships[p].get(s)
                d_ship = self.deployed_ships[p].get(s)
                a_name = a_ship['name'][:3] if a_ship else "---"
                d_name = d_ship['name'][:3] if d_ship else "---"
                a_vp = a_ship.get('active', {}).get('vp', 0) if a_ship else 0
                a_inc = a_ship.get('active', {}).get('income', 0) if a_ship else 0
                d_vp = d_ship.get('deployed', {}).get('vp', 0) if d_ship else 0

                if a_ship and a_ship['name'].startswith('Starter'):
                    line1 += f"{DIM}{s:>2}:+1i{RESET} "
                elif a_ship:
                    line1 += f"{CYAN}{s:>2}:{a_name}{RESET} "
                else:
                    line1 += f"{DIM}{s:>2}:---{RESET} "

                if d_ship:
                    line2 += f"{MAGENTA}{s:>2}:{d_name}{RESET} "
                else:
                    line2 += f"{DIM}{s:>2}:---{RESET} "

            print(line1)
            print(line2)

        if self.dice_result:
            d1, d2 = self.dice_result
            print(f"\n  {WHITE}Dice: [{d1}] [{d2}] (sum={d1+d2}){RESET}")

        if self.phase == 'buy':
            print(f"\n  {DIM}-- Ship Shop (Income to spend: {self.income[cp]}) --{RESET}")
            for i, card in enumerate(self.shop):
                affordable = GREEN + "YES" + RESET if self.income[cp] >= card['cost'] else RED + "no" + RESET
                print(f"    {i+1}. [{card['cost']}] {card['desc']} [{affordable}]")

    def get_move(self):
        cp = self.current_player
        if self.phase == 'roll':
            raw = input_with_quit("  Press Enter to roll 2 dice: ")
            return ('roll',)

        elif self.phase == 'activate':
            d1, d2 = self.dice_result
            total = d1 + d2
            while True:
                if d1 == d2:
                    print(f"  Doubles! Activating sector {d1} (doubled effect) and sector {total}.")
                    return ('activate_doubles', d1, total)
                prompt = f"  (s)plit [{d1}]+[{d2}] or (c)ombine [{total}]? "
                raw = input_with_quit(prompt).strip().lower()
                if raw in ('s', 'split'):
                    return ('activate_split', d1, d2)
                elif raw in ('c', 'combine', 'combined'):
                    if total <= 12:
                        return ('activate_combined', total)
                    else:
                        print(f"  Sum {total} exceeds 12, must split.")
                else:
                    print("  Choose (s)plit or (c)ombine.")

        elif self.phase == 'buy':
            while True:
                raw = input_with_quit("  Buy ship # and assign to sector (e.g. '1 5'), or 'done': ").strip().lower()
                if raw in ('done', 'd', ''):
                    return ('done_buying',)
                parts = raw.split()
                try:
                    if len(parts) == 2:
                        shop_idx = int(parts[0]) - 1
                        sector = int(parts[1])
                        if 0 <= shop_idx < len(self.shop) and 1 <= sector <= 12:
                            return ('buy_ship', shop_idx, sector)
                    elif len(parts) == 1:
                        shop_idx = int(parts[0]) - 1
                        if 0 <= shop_idx < len(self.shop):
                            card = self.shop[shop_idx]
                            return ('buy_ship', shop_idx, card['sector'])
                except ValueError:
                    pass
                print("  Format: '<shop#> <sector>' or just '<shop#>' for default sector.")

    def make_move(self, move):
        cp = self.current_player
        opp = 2 if cp == 1 else 1

        if move[0] == 'roll':
            self.dice_result = self._roll_dice()
            self.phase = 'activate'
            return False

        elif move[0] in ('activate_split', 'activate_combined', 'activate_doubles'):
            total_vp = 0
            total_inc = 0

            if move[0] == 'activate_split':
                s1, s2 = move[1], move[2]
                for s in (s1, s2):
                    vp, inc = self._activate_sector(cp, s, True)
                    total_vp += vp
                    total_inc += inc
                    vp2, inc2 = self._activate_sector(opp, s, False)
                    self.scores[opp] += vp2
                    self.income[opp] += inc2

            elif move[0] == 'activate_combined':
                s = move[1]
                vp, inc = self._activate_sector(cp, s, True)
                total_vp += vp
                total_inc += inc
                vp2, inc2 = self._activate_sector(opp, s, False)
                self.scores[opp] += vp2
                self.income[opp] += inc2

            elif move[0] == 'activate_doubles':
                s1, s_total = move[1], move[2]
                vp, inc = self._activate_sector(cp, s1, True)
                total_vp += vp * 2
                total_inc += inc * 2
                if s_total <= 12:
                    vp3, inc3 = self._activate_sector(cp, s_total, True)
                    total_vp += vp3
                    total_inc += inc3
                for s in set([s1, s_total]):
                    if s <= 12:
                        vp2, inc2 = self._activate_sector(opp, s, False)
                        self.scores[opp] += vp2
                        self.income[opp] += inc2

            self.scores[cp] += total_vp
            self.income[cp] += total_inc
            if total_vp > 0 or total_inc > 0:
                print(f"  Gained: {total_vp} VP, {total_inc} income")
            self.phase = 'buy'
            return False

        elif move[0] == 'buy_ship':
            shop_idx, sector = move[1], move[2]
            card = self.shop[shop_idx]
            if self.income[cp] < card['cost']:
                print("  Not enough income!")
                return False
            self.income[cp] -= card['cost']
            # Current active ship moves to deployed
            old_active = self.active_ships[cp].get(sector)
            if old_active and not old_active['name'].startswith('Starter'):
                self.deployed_ships[cp][sector] = old_active
            # New ship becomes active
            self.active_ships[cp][sector] = {
                'name': card['name'],
                'active': dict(card['active']),
                'deployed': dict(card['deployed']),
            }
            self.shop.pop(shop_idx)
            # Refill shop
            base_cards = list(SHIP_CARDS)
            if self.variation == 'saga':
                base_cards.extend(SAGA_SHIPS)
            random.shuffle(base_cards)
            self.shop.append(base_cards[0])
            print(f"  Deployed {card['name']} to sector {sector}!")
            return False

        elif move[0] == 'done_buying':
            self.dice_result = []
            self.phase = 'roll'
            if cp == 2:
                self.round_num += 1
                self._refresh_shop()
            return True

        return False

    def check_game_over(self):
        for p in (1, 2):
            if self.scores[p] >= self.vp_target:
                self.game_over = True
                if self.scores[1] > self.scores[2]:
                    self.winner = 1
                elif self.scores[2] > self.scores[1]:
                    self.winner = 2
                else:
                    self.winner = None
                return

    def get_state(self):
        return {
            'vp_target': self.vp_target,
            'phase': self.phase,
            'scores': {str(k): v for k, v in self.scores.items()},
            'income': {str(k): v for k, v in self.income.items()},
            'active_ships': {str(k): v for k, v in self.active_ships.items()},
            'deployed_ships': {str(k): v for k, v in self.deployed_ships.items()},
            'dice_result': self.dice_result,
            'shop': self.shop,
            'round_num': self.round_num,
        }

    def load_state(self, state):
        self.vp_target = state['vp_target']
        self.phase = state['phase']
        self.scores = {int(k): v for k, v in state['scores'].items()}
        self.income = {int(k): v for k, v in state['income'].items()}
        self.active_ships = {int(k): {int(s): sh for s, sh in v.items()}
                             for k, v in state['active_ships'].items()}
        self.deployed_ships = {int(k): {int(s): sh for s, sh in v.items()}
                               for k, v in state['deployed_ships'].items()}
        self.dice_result = state['dice_result']
        self.shop = state['shop']
        self.round_num = state['round_num']

    def get_tutorial(self):
        return """
  ============================================================
    SPACE BASE - Tutorial
  ============================================================

  OVERVIEW
    Build an engine of ships across 12 sectors (1-12). Roll
    dice to activate ships and earn VP and income. First to
    40 VP wins (50 in Saga variant).

  SECTORS
    Each sector (1-12) has an ACTIVE ship and optionally a
    DEPLOYED ship underneath.

  DICE ACTIVATION
    On YOUR turn: Roll 2 dice. Choose to SPLIT (activate both
    individual sectors) or COMBINE (activate the sum sector).
    Active ships in those sectors trigger their rewards.

    On OPPONENT's turn: Their roll activates YOUR deployed
    ships in the matching sectors.

  BUYING SHIPS
    After activating, spend income to buy new ships from the
    shop. Place them in any sector (1-12).
    - The new ship becomes ACTIVE in that sector
    - The old active ship moves to DEPLOYED position
    - Deployed ships earn rewards on opponent turns

  REWARDS
    Ships give income (to buy more ships) and/or VP.
    Better ships cost more but have stronger effects.

  STRATEGY
    - Balance VP generation with income generation
    - Deploy ships to sectors matching common dice rolls
    - Sectors 6-8 are rolled most often (dice probability)
    - Deployed ships give passive income on opponent turns

  SAGA VARIANT
    Includes upgraded ship cards and requires 50 VP to win.
    Ships tend to be more powerful and expensive."""
