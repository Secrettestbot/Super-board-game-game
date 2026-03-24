"""Catan Dice Game - A 2-player dice-based resource and building game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
GREEN = '\033[92m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
WHITE = '\033[97m'

RESOURCES = ['Brick', 'Wood', 'Sheep', 'Wheat', 'Ore', 'Gold']
RES_COLORS = {
    'Brick': RED, 'Wood': GREEN, 'Sheep': '\033[92m',
    'Wheat': YELLOW, 'Ore': '\033[90m', 'Gold': '\033[93m',
}

BUILDINGS = {
    'road': {'cost': {'Brick': 1, 'Wood': 1}, 'vp': 1, 'symbol': '='},
    'settlement': {'cost': {'Brick': 1, 'Wood': 1, 'Sheep': 1, 'Wheat': 1}, 'vp': 3, 'symbol': 'S'},
    'city': {'cost': {'Wheat': 2, 'Ore': 3}, 'vp': 7, 'symbol': 'C'},
    'knight': {'cost': {'Sheep': 1, 'Ore': 1, 'Wheat': 1}, 'vp': 2, 'symbol': 'K'},
}


class CatanDiceGame(BaseGame):
    name = "Catan Dice"
    description = "Dice-based resource collecting and building game"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game (15 rounds)',
        'short': 'Short game (10 rounds)',
    }

    def setup(self):
        self.max_rounds = 15 if self.variation == 'standard' else 10
        self.round_num = 1
        self.phase = 'roll'  # 'roll', 'build', 'done'
        self.scores = {1: 0, 2: 0}
        self.buildings = {1: [], 2: []}
        self.dice = []
        self.kept = []
        self.rolls_left = 3
        self.current_resources = {}
        self.knights = {1: 0, 2: 0}
        self.roads = {1: 0, 2: 0}
        self.longest_road_holder = None
        self.largest_army_holder = None

    def _roll_dice(self, count):
        return [random.choice(RESOURCES) for _ in range(count)]

    def _count_resources(self):
        res = {}
        for r in self.kept + self.dice:
            res[r] = res.get(r, 0) + 1
        # Gold can substitute for any resource
        self.current_resources = res

    def _can_build(self, building):
        cost = BUILDINGS[building]['cost']
        res = dict(self.current_resources)
        gold = res.get('Gold', 0)
        for r, needed in cost.items():
            have = res.get(r, 0)
            if have < needed:
                shortfall = needed - have
                if gold >= shortfall:
                    gold -= shortfall
                else:
                    return False
        return True

    def _build(self, building):
        cost = BUILDINGS[building]['cost']
        res = dict(self.current_resources)
        gold_used = 0
        for r, needed in cost.items():
            have = res.get(r, 0)
            used = min(have, needed)
            res[r] = have - used
            shortfall = needed - used
            if shortfall > 0:
                gold_used += shortfall
        res['Gold'] = res.get('Gold', 0) - gold_used
        self.current_resources = res
        cp = self.current_player
        self.buildings[cp].append(building)
        self.scores[cp] += BUILDINGS[building]['vp']
        if building == 'knight':
            self.knights[cp] += 1
        elif building == 'road':
            self.roads[cp] += 1

    def _check_bonuses(self):
        # Longest road (5+ roads)
        for p in (1, 2):
            if self.roads[p] >= 5:
                if self.largest_army_holder != p:
                    old = self.longest_road_holder
                    if old and old != p:
                        self.scores[old] -= 2
                    if old != p:
                        self.longest_road_holder = p
                        self.scores[p] += 2
        # Largest army (3+ knights)
        for p in (1, 2):
            if self.knights[p] >= 3:
                old = self.largest_army_holder
                if old and old != p and self.knights[p] > self.knights[old]:
                    self.scores[old] -= 2
                    self.largest_army_holder = p
                    self.scores[p] += 2
                elif old is None:
                    self.largest_army_holder = p
                    self.scores[p] += 2

    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 55}")
        print(f"  CATAN DICE  --  Round {self.round_num}/{self.max_rounds}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"{'=' * 55}")

        for p in (1, 2):
            marker = " <<" if p == cp else ""
            bld_counts = {}
            for b in self.buildings[p]:
                bld_counts[b] = bld_counts.get(b, 0) + 1
            bld_str = ', '.join(f"{BUILDINGS[b]['symbol']}x{c}" for b, c in bld_counts.items()) or "none"
            bonuses = []
            if self.longest_road_holder == p:
                bonuses.append("LongestRoad")
            if self.largest_army_holder == p:
                bonuses.append("LargestArmy")
            bonus_str = f" [{', '.join(bonuses)}]" if bonuses else ""
            print(f"\n  {self.players[p-1]}: {self.scores[p]} VP | {bld_str}{bonus_str}{marker}")

        if self.phase == 'roll':
            print(f"\n  Rolls left: {self.rolls_left}")
            if self.dice:
                dice_str = '  '.join(f"{RES_COLORS.get(d, WHITE)}{d}{RESET}" for d in self.dice)
                print(f"  Current roll: {dice_str}")
            if self.kept:
                kept_str = '  '.join(f"{RES_COLORS.get(d, WHITE)}{d}{RESET}" for d in self.kept)
                print(f"  Kept dice: {kept_str}")
        elif self.phase == 'build':
            res_str = '  '.join(f"{RES_COLORS.get(r, WHITE)}{r}:{c}{RESET}"
                               for r, c in sorted(self.current_resources.items()) if c > 0)
            print(f"\n  Resources: {res_str}")
            print(f"  Buildable:")
            for bname, bdata in BUILDINGS.items():
                cost_str = ', '.join(f"{r}:{c}" for r, c in bdata['cost'].items())
                can = GREEN + "YES" + RESET if self._can_build(bname) else RED + "no" + RESET
                print(f"    {bdata['symbol']} {bname:<12} ({cost_str}) = {bdata['vp']}VP [{can}]")

    def get_move(self):
        if self.phase == 'roll':
            while True:
                if not self.dice and self.rolls_left == 3:
                    raw = input_with_quit("  Press Enter to roll 6 dice: ").strip()
                    return ('roll_all',)
                else:
                    prompt = "  Keep dice #s (e.g. '1 3 5'), 'all' to keep all, or Enter to reroll rest: "
                    raw = input_with_quit(prompt).strip().lower()
                    if raw == '' and self.rolls_left > 0:
                        return ('reroll',)
                    elif raw == '' and self.rolls_left == 0:
                        return ('done_rolling',)
                    elif raw == 'all' or raw == 'a':
                        return ('keep_all',)
                    elif raw == 'done' or raw == 'd':
                        return ('done_rolling',)
                    else:
                        try:
                            indices = [int(x) - 1 for x in raw.split()]
                            if all(0 <= i < len(self.dice) for i in indices):
                                return ('keep', indices)
                        except ValueError:
                            pass
                        print("  Invalid input. Enter dice numbers, 'all', 'done', or press Enter.")

        elif self.phase == 'build':
            while True:
                raw = input_with_quit("  Build (road/settlement/city/knight) or 'done': ").strip().lower()
                if raw in ('done', 'd', ''):
                    return ('end_build',)
                if raw in ('road', 'r'):
                    return ('build', 'road')
                if raw in ('settlement', 's'):
                    return ('build', 'settlement')
                if raw in ('city', 'c'):
                    return ('build', 'city')
                if raw in ('knight', 'k'):
                    return ('build', 'knight')
                print("  Choose: road, settlement, city, knight, or done")

    def make_move(self, move):
        if move[0] == 'roll_all':
            self.dice = self._roll_dice(6)
            self.rolls_left -= 1
            return False  # stay on same player

        elif move[0] == 'keep':
            indices = sorted(move[1], reverse=True)
            for i in indices:
                self.kept.append(self.dice.pop(i))
            if self.rolls_left > 0 and self.dice:
                return False
            else:
                self._count_resources()
                self.phase = 'build'
                return False

        elif move[0] == 'keep_all':
            self.kept.extend(self.dice)
            self.dice = []
            self._count_resources()
            self.phase = 'build'
            return False

        elif move[0] == 'reroll':
            if self.rolls_left > 0:
                self.dice = self._roll_dice(len(self.dice))
                self.rolls_left -= 1
                if self.rolls_left == 0:
                    self.kept.extend(self.dice)
                    self.dice = []
                    self._count_resources()
                    self.phase = 'build'
            return False

        elif move[0] == 'done_rolling':
            self.kept.extend(self.dice)
            self.dice = []
            self._count_resources()
            self.phase = 'build'
            return False

        elif move[0] == 'build':
            building = move[1]
            if not self._can_build(building):
                print(f"  Can't afford {building}!")
                return False
            self._build(building)
            self._check_bonuses()
            return False

        elif move[0] == 'end_build':
            # End this player's turn
            self.dice = []
            self.kept = []
            self.rolls_left = 3
            self.current_resources = {}
            self.phase = 'roll'
            # After both players go, advance round
            if self.current_player == 2:
                self.round_num += 1
            return True

        return False

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
            'max_rounds': self.max_rounds,
            'round_num': self.round_num,
            'phase': self.phase,
            'scores': {str(k): v for k, v in self.scores.items()},
            'buildings': {str(k): v for k, v in self.buildings.items()},
            'dice': self.dice,
            'kept': self.kept,
            'rolls_left': self.rolls_left,
            'current_resources': self.current_resources,
            'knights': {str(k): v for k, v in self.knights.items()},
            'roads': {str(k): v for k, v in self.roads.items()},
            'longest_road_holder': self.longest_road_holder,
            'largest_army_holder': self.largest_army_holder,
        }

    def load_state(self, state):
        self.max_rounds = state['max_rounds']
        self.round_num = state['round_num']
        self.phase = state['phase']
        self.scores = {int(k): v for k, v in state['scores'].items()}
        self.buildings = {int(k): v for k, v in state['buildings'].items()}
        self.dice = state['dice']
        self.kept = state['kept']
        self.rolls_left = state['rolls_left']
        self.current_resources = state['current_resources']
        self.knights = {int(k): v for k, v in state['knights'].items()}
        self.roads = {int(k): v for k, v in state['roads'].items()}
        self.longest_road_holder = state['longest_road_holder']
        self.largest_army_holder = state['largest_army_holder']

    def get_tutorial(self):
        return """
  ============================================================
    CATAN DICE - Tutorial
  ============================================================

  OVERVIEW
    Roll 6 resource dice and use the results to build roads,
    settlements, cities, and recruit knights. Score points for
    each building. Most VP after all rounds wins.

  DICE
    Each die shows one of: Brick, Wood, Sheep, Wheat, Ore, Gold.
    Gold is wild - it can substitute for any resource.

  ROLLING
    Roll all 6 dice up to 3 times. Between rolls, you may keep
    any dice and reroll the rest.

  BUILDING COSTS
    Road       : 1 Brick + 1 Wood           = 1 VP
    Settlement : 1 Brick + 1 Wood + 1 Sheep + 1 Wheat = 3 VP
    City       : 2 Wheat + 3 Ore            = 7 VP
    Knight     : 1 Sheep + 1 Ore + 1 Wheat  = 2 VP

  BONUSES
    Longest Road  : 5+ roads = +2 VP
    Largest Army  : 3+ knights = +2 VP

  WINNING
    Most VP after all rounds wins."""
