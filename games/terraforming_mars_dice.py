"""Terraforming Mars Dice - Dice-based engine building to terraform Mars."""

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
ORANGE = '\033[38;5;208m'

RESOURCE_SYMBOLS = {
    'steel': ('S', '\033[90m'),
    'titanium': ('T', YELLOW),
    'plants': ('P', GREEN),
    'energy': ('E', MAGENTA),
    'heat': ('H', RED),
    'megacredits': ('M', YELLOW),
}

PRODUCTION_DICE = ['steel', 'titanium', 'plants', 'energy', 'heat', 'megacredits']

PROJECTS = [
    {'name': 'Greenery', 'cost': {'plants': 4}, 'effect': 'oxygen', 'vp': 1,
     'desc': 'Spend 4 plants to place greenery (+1 oxygen, +1 VP)'},
    {'name': 'City', 'cost': {'steel': 3, 'megacredits': 2}, 'effect': 'city', 'vp': 2,
     'desc': 'Build a city (+2 VP)'},
    {'name': 'Ocean', 'cost': {'megacredits': 5}, 'effect': 'ocean', 'vp': 0,
     'desc': 'Fund ocean placement (global parameter)'},
    {'name': 'Heat Release', 'cost': {'heat': 4}, 'effect': 'temperature', 'vp': 0,
     'desc': 'Spend 4 heat to raise temperature'},
    {'name': 'Power Grid', 'cost': {'energy': 3}, 'effect': 'production', 'vp': 1,
     'desc': 'Build power grid (+1 prod die, +1 VP)'},
    {'name': 'Mining Op', 'cost': {'steel': 2, 'titanium': 2}, 'effect': 'production', 'vp': 1,
     'desc': 'Mining operation (+1 prod die, +1 VP)'},
    {'name': 'Asteroid', 'cost': {'titanium': 4}, 'effect': 'temperature', 'vp': 2,
     'desc': 'Crash asteroid (+1 temp, +2 VP)'},
    {'name': 'Aquifer', 'cost': {'steel': 2, 'megacredits': 3}, 'effect': 'ocean', 'vp': 1,
     'desc': 'Pump aquifer (+1 ocean, +1 VP)'},
    {'name': 'Solar Farm', 'cost': {'energy': 2, 'megacredits': 2}, 'effect': 'production', 'vp': 1,
     'desc': 'Solar farm (+1 prod die, +1 VP)'},
    {'name': 'Space Station', 'cost': {'titanium': 3, 'energy': 2}, 'effect': 'wild', 'vp': 3,
     'desc': 'Build space station (+3 VP)'},
]

VENUS_PROJECTS = [
    {'name': 'Venus Cloud', 'cost': {'titanium': 2, 'energy': 1}, 'effect': 'venus', 'vp': 1,
     'desc': 'Venus cloud city (+1 venus, +1 VP)'},
    {'name': 'Aerobiology', 'cost': {'plants': 3, 'energy': 1}, 'effect': 'venus', 'vp': 2,
     'desc': 'Aerobiology research (+1 venus, +2 VP)'},
]

GLOBAL_PARAMS = {'temperature': -30, 'oxygen': 0, 'oceans': 0}
GLOBAL_MAX = {'temperature': 8, 'oxygen': 14, 'oceans': 9}
VENUS_MAX = 30


class TerraformingMarsDiceGame(BaseGame):
    """Terraforming Mars Dice: Roll production dice, buy projects, terraform."""

    name = "Terraforming Mars Dice"
    description = "Dice game of terraforming Mars with production and projects"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard terraforming (temperature, oxygen, oceans)',
        'venus': 'Includes Venus Next expansion parameters',
    }

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        self.round_num = 1
        self.max_rounds = 12
        self.phase = 'production'  # production, action
        self.scores = {1: 0, 2: 0}
        self.resources = {1: {r: 0 for r in PRODUCTION_DICE}, 2: {r: 0 for r in PRODUCTION_DICE}}
        self.production_dice_count = {1: 4, 2: 4}
        self.built_projects = {1: [], 2: []}
        self.globals = dict(GLOBAL_PARAMS)
        self.venus = 0
        self.current_roll = []
        self.tr = {1: 20, 2: 20}  # terraform rating
        self.rerolls = {1: 1, 2: 1}
        self.available_projects = list(range(len(PROJECTS)))
        if self.variation == 'venus':
            self.venus_projects = list(range(len(VENUS_PROJECTS)))

    def _roll_production(self, count):
        return [random.choice(PRODUCTION_DICE) for _ in range(count)]

    def _can_afford(self, project, player):
        for res, needed in project['cost'].items():
            if self.resources[player].get(res, 0) < needed:
                return False
        return True

    def _apply_project(self, project, player):
        for res, needed in project['cost'].items():
            self.resources[player][res] -= needed
        self.scores[player] += project['vp']
        effect = project['effect']
        if effect == 'oxygen':
            if self.globals['oxygen'] < GLOBAL_MAX['oxygen']:
                self.globals['oxygen'] += 1
                self.tr[player] += 1
        elif effect == 'temperature':
            if self.globals['temperature'] < GLOBAL_MAX['temperature']:
                self.globals['temperature'] += 2
                self.tr[player] += 1
        elif effect == 'ocean':
            if self.globals['oceans'] < GLOBAL_MAX['oceans']:
                self.globals['oceans'] += 1
                self.tr[player] += 1
        elif effect == 'production':
            self.production_dice_count[player] = min(self.production_dice_count[player] + 1, 8)
        elif effect == 'venus':
            if self.venus < VENUS_MAX:
                self.venus += 2
                self.tr[player] += 1

    def _all_global_params_maxed(self):
        maxed = (self.globals['temperature'] >= GLOBAL_MAX['temperature'] and
                 self.globals['oxygen'] >= GLOBAL_MAX['oxygen'] and
                 self.globals['oceans'] >= GLOBAL_MAX['oceans'])
        if self.variation == 'venus':
            maxed = maxed and self.venus >= VENUS_MAX
        return maxed

    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 60}")
        print(f"  TERRAFORMING MARS DICE  --  Round {self.round_num}/{self.max_rounds}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"{'=' * 60}")

        # Global parameters
        temp_pct = int((self.globals['temperature'] + 30) / 38 * 10)
        oxy_pct = int(self.globals['oxygen'] / 14 * 10)
        ocn_pct = int(self.globals['oceans'] / 9 * 10)
        print(f"\n  {RED}Temp: {self.globals['temperature']}C{RESET}  "
              f"{CYAN}O2: {self.globals['oxygen']}%{RESET}  "
              f"{BLUE}Oceans: {self.globals['oceans']}/9{RESET}", end="")
        if self.variation == 'venus':
            print(f"  {MAGENTA}Venus: {self.venus}%{RESET}", end="")
        print()

        # Player info
        for p in (1, 2):
            marker = f" {YELLOW}<<{RESET}" if p == cp else ""
            print(f"\n  {self.players[p-1]}: TR={self.tr[p]} | VP={self.scores[p]} | "
                  f"Dice={self.production_dice_count[p]} | Rerolls={self.rerolls[p]}{marker}")
            res_str = "    Resources: "
            for r in PRODUCTION_DICE:
                sym, color = RESOURCE_SYMBOLS[r]
                count = self.resources[p][r]
                if count > 0:
                    res_str += f"{color}{sym}:{count}{RESET}  "
            print(res_str)
            if self.built_projects[p]:
                built_names = [pr for pr in self.built_projects[p]]
                print(f"    Built: {', '.join(built_names)}")

        if self.phase == 'production' and self.current_roll:
            roll_str = "  Roll: "
            for r in self.current_roll:
                sym, color = RESOURCE_SYMBOLS[r]
                roll_str += f"{color}[{r}]{RESET} "
            print(f"\n{roll_str}")

        if self.phase == 'action':
            print(f"\n  {DIM}-- Available Projects --{RESET}")
            all_projs = [(i, PROJECTS[i], 'standard') for i in self.available_projects]
            if self.variation == 'venus' and hasattr(self, 'venus_projects'):
                all_projs += [(i, VENUS_PROJECTS[i], 'venus') for i in self.venus_projects]
            for idx, (pi, proj, ptype) in enumerate(all_projs):
                affordable = GREEN + "YES" + RESET if self._can_afford(proj, cp) else RED + "no" + RESET
                tag = f" {MAGENTA}[VENUS]{RESET}" if ptype == 'venus' else ""
                print(f"    {idx+1}. {proj['desc']}{tag} [{affordable}]")

    def get_move(self):
        cp = self.current_player
        if self.phase == 'production':
            if not self.current_roll:
                raw = input_with_quit(f"  Press Enter to roll {self.production_dice_count[cp]} production dice: ")
                return ('roll',)
            else:
                while True:
                    options = "(a)ccept"
                    if self.rerolls[cp] > 0:
                        options += ", (r)eroll dice #s"
                    raw = input_with_quit(f"  {options}: ").strip().lower()
                    if raw in ('a', 'accept', ''):
                        return ('accept_roll',)
                    elif raw.startswith('r') and self.rerolls[cp] > 0:
                        parts = raw.replace('r', '').replace('reroll', '').strip().split()
                        try:
                            indices = [int(x) - 1 for x in parts]
                            if all(0 <= i < len(self.current_roll) for i in indices) and indices:
                                return ('reroll', indices)
                        except ValueError:
                            pass
                        print("  Enter 'r' followed by dice numbers, e.g. 'r 1 3 4'")
                    else:
                        print("  Invalid input.")

        elif self.phase == 'action':
            while True:
                raw = input_with_quit("  Buy project # or 'done': ").strip().lower()
                if raw in ('done', 'd', ''):
                    return ('end_actions',)
                try:
                    idx = int(raw) - 1
                    all_projs = [(i, PROJECTS[i], 'standard') for i in self.available_projects]
                    if self.variation == 'venus' and hasattr(self, 'venus_projects'):
                        all_projs += [(i, VENUS_PROJECTS[i], 'venus') for i in self.venus_projects]
                    if 0 <= idx < len(all_projs):
                        return ('buy_project', idx)
                except ValueError:
                    pass
                print("  Enter project number or 'done'.")

    def make_move(self, move):
        cp = self.current_player
        if move[0] == 'roll':
            self.current_roll = self._roll_production(self.production_dice_count[cp])
            return False

        elif move[0] == 'reroll':
            indices = move[1]
            self.rerolls[cp] -= 1
            for i in indices:
                self.current_roll[i] = random.choice(PRODUCTION_DICE)
            return False

        elif move[0] == 'accept_roll':
            for r in self.current_roll:
                self.resources[cp][r] += 1
            self.current_roll = []
            self.phase = 'action'
            return False

        elif move[0] == 'buy_project':
            idx = move[1]
            all_projs = [(i, PROJECTS[i], 'standard') for i in self.available_projects]
            if self.variation == 'venus' and hasattr(self, 'venus_projects'):
                all_projs += [(i, VENUS_PROJECTS[i], 'venus') for i in self.venus_projects]
            if idx >= len(all_projs):
                print("  Invalid project.")
                return False
            pi, proj, ptype = all_projs[idx]
            if not self._can_afford(proj, cp):
                print("  Cannot afford this project!")
                return False
            self._apply_project(proj, cp)
            self.built_projects[cp].append(proj['name'])
            return False

        elif move[0] == 'end_actions':
            self.phase = 'production'
            self.rerolls[cp] = 1
            if cp == 2:
                self.round_num += 1
            return True

        return False

    def check_game_over(self):
        if self.round_num > self.max_rounds or self._all_global_params_maxed():
            self.game_over = True
            for p in (1, 2):
                self.scores[p] += self.tr[p]
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
            'resources': {str(k): v for k, v in self.resources.items()},
            'production_dice_count': {str(k): v for k, v in self.production_dice_count.items()},
            'built_projects': {str(k): v for k, v in self.built_projects.items()},
            'globals': self.globals,
            'venus': self.venus,
            'current_roll': self.current_roll,
            'tr': {str(k): v for k, v in self.tr.items()},
            'rerolls': {str(k): v for k, v in self.rerolls.items()},
            'available_projects': self.available_projects,
            'venus_projects': getattr(self, 'venus_projects', []),
        }

    def load_state(self, state):
        self.round_num = state['round_num']
        self.max_rounds = state['max_rounds']
        self.phase = state['phase']
        self.scores = {int(k): v for k, v in state['scores'].items()}
        self.resources = {int(k): v for k, v in state['resources'].items()}
        self.production_dice_count = {int(k): v for k, v in state['production_dice_count'].items()}
        self.built_projects = {int(k): v for k, v in state['built_projects'].items()}
        self.globals = state['globals']
        self.venus = state['venus']
        self.current_roll = state['current_roll']
        self.tr = {int(k): v for k, v in state['tr'].items()}
        self.rerolls = {int(k): v for k, v in state['rerolls'].items()}
        self.available_projects = state['available_projects']
        if self.variation == 'venus':
            self.venus_projects = state.get('venus_projects', [])

    def get_tutorial(self):
        venus_text = ""
        if self.variation == 'venus':
            venus_text = """
  VENUS EXPANSION
    Additional Venus parameter to raise (0 -> 30%).
    New Venus projects available for purchase.
    Raising Venus also increases your TR."""
        return f"""
  ============================================================
    TERRAFORMING MARS DICE - Tutorial
  ============================================================

  OVERVIEW
    Compete to terraform Mars! Roll production dice for
    resources, buy project cards, and raise global parameters.

  PRODUCTION PHASE
    Roll your production dice (start with 4, max 8).
    Each die produces one resource: steel, titanium, plants,
    energy, heat, or megacredits.
    You get 1 reroll per round to reroll any dice.

  ACTION PHASE
    Spend resources to buy projects:
    - Greenery: 4 plants -> +1 oxygen, +1 VP
    - City: 3 steel + 2 MC -> +2 VP
    - Ocean: 5 MC -> +1 ocean
    - Heat Release: 4 heat -> +1 temperature
    - Power Grid: 3 energy -> +1 prod die, +1 VP
    - And more...

  TERRAFORM RATING (TR)
    Raising global parameters increases your TR.
    TR is added to VP at game end.

  GLOBAL PARAMETERS
    Temperature: -30C to +8C (raised by 2 per step)
    Oxygen: 0% to 14%
    Oceans: 0 to 9

  WINNING
    Game ends after 12 rounds or when all parameters are maxed.
    Score = VP from projects + TR. Highest score wins.
{venus_text}"""
