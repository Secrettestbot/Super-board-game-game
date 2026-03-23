"""Marco Polo - Dice worker placement along the Silk Road."""

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

# Cities on the Silk Road
CITIES = {
    'Venice': {'resources': {'gold': 2}, 'connections': ['Constantinople'], 'pos': 0},
    'Constantinople': {'resources': {'silk': 1}, 'connections': ['Venice', 'Antioch', 'Alexandria'],
                       'pos': 1},
    'Alexandria': {'resources': {'pepper': 1}, 'connections': ['Constantinople'], 'pos': 2},
    'Antioch': {'resources': {'gold': 1}, 'connections': ['Constantinople', 'Baghdad'], 'pos': 3},
    'Baghdad': {'resources': {'silk': 1, 'pepper': 1}, 'connections': ['Antioch', 'Hormuz', 'Kashgar'],
                'pos': 4},
    'Hormuz': {'resources': {'pepper': 2}, 'connections': ['Baghdad', 'Karachi'], 'pos': 5},
    'Karachi': {'resources': {'gold': 1, 'pepper': 1}, 'connections': ['Hormuz', 'Kashgar'], 'pos': 6},
    'Kashgar': {'resources': {'silk': 2}, 'connections': ['Baghdad', 'Karachi', 'Beijing'], 'pos': 7},
    'Beijing': {'resources': {'silk': 2, 'gold': 1}, 'connections': ['Kashgar'], 'pos': 8},
}

CITY_LIST = list(CITIES.keys())

# Action spaces
ACTION_SPACES = {
    'bazaar': {'desc': 'Gain resources based on dice value', 'min_dice': 1},
    'khan_favor': {'desc': 'Gain VP equal to dice value', 'min_dice': 1},
    'contracts': {'desc': 'Take a contract card', 'min_dice': 1},
    'travel': {'desc': 'Move along Silk Road (spaces = dice/2)', 'min_dice': 2},
    'city_action': {'desc': 'Use city special action', 'min_dice': 1},
}

# Character powers
CHARACTERS = {
    'Marco Polo': 'Start in Venice. When traveling, move 1 extra city.',
    'Kublai Khan': 'Start in Beijing. Gain 1 extra VP each round.',
    'Rashid al-Din': 'Start in Baghdad. Dice always count as 1 higher.',
    'Berke Khan': 'Start in Constantinople. Do not need to pay extra for occupied spaces.',
    'Matteo Polo': 'Start in Venice. Start with 1 extra die (6 total).',
    'Wilhelm von Rubruk': 'Start in Antioch. Gain double resources from bazaar.',
}

AGENT_CHARACTERS = {
    'Niccolo Polo': 'Start in Venice. Can place 2 dice on same action space.',
    'Ibn Battuta': 'Start in Alexandria. Travel costs 0 gold.',
    'Mercator': 'Start in Hormuz. All contracts give +2 VP bonus.',
}

CONTRACTS = [
    {'requires': {'silk': 2}, 'reward': {'vp': 5, 'gold': 1}, 'name': 'Silk Delivery'},
    {'requires': {'pepper': 2}, 'reward': {'vp': 5, 'gold': 1}, 'name': 'Pepper Delivery'},
    {'requires': {'gold': 3}, 'reward': {'vp': 7}, 'name': 'Gold Tribute'},
    {'requires': {'silk': 1, 'pepper': 1}, 'reward': {'vp': 4}, 'name': 'Mixed Goods'},
    {'requires': {'silk': 1, 'gold': 2}, 'reward': {'vp': 6}, 'name': 'Luxury Trade'},
    {'requires': {'pepper': 1, 'gold': 1}, 'reward': {'vp': 4, 'silk': 1}, 'name': 'Spice Route'},
    {'requires': {'silk': 3}, 'reward': {'vp': 8}, 'name': 'Grand Silk Road'},
    {'requires': {'pepper': 3}, 'reward': {'vp': 8}, 'name': 'Pepper Empire'},
    {'requires': {'silk': 1, 'pepper': 1, 'gold': 1}, 'reward': {'vp': 6}, 'name': 'Diverse Trade'},
    {'requires': {'gold': 2}, 'reward': {'vp': 3, 'pepper': 1}, 'name': 'Gold Exchange'},
]

RESOURCE_COLORS = {
    'gold': YELLOW,
    'silk': MAGENTA,
    'pepper': RED,
}


class MarcoPoloGame(BaseGame):
    """Marco Polo: Dice worker placement along the Silk Road."""

    name = "Marco Polo"
    description = "Dice worker placement with unique powers along the Silk Road"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game with 6 characters',
        'agents': 'Agents variant with 3 additional characters',
    }

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        self.round_num = 1
        self.max_rounds = 5
        self.phase = 'choose_character'  # choose_character, roll, place_dice, fulfill, end_round
        self.scores = {1: 0, 2: 0}
        self.resources = {
            1: {'gold': 3, 'silk': 0, 'pepper': 0},
            2: {'gold': 3, 'silk': 0, 'pepper': 0},
        }
        self.characters = {1: None, 2: None}
        self.positions = {1: 'Venice', 2: 'Venice'}
        self.visited_cities = {1: {'Venice'}, 2: {'Venice'}}
        self.dice = {1: [], 2: []}
        self.dice_count = {1: 5, 2: 5}
        self.contracts_held = {1: [], 2: []}
        self.contracts_available = []
        self._refresh_contracts()
        self.action_spaces_used = {}
        self.dice_placed = {1: 0, 2: 0}
        self.char_pool = list(CHARACTERS.keys())
        if self.variation == 'agents':
            self.char_pool.extend(AGENT_CHARACTERS.keys())
        random.shuffle(self.char_pool)

    def _refresh_contracts(self):
        pool = list(CONTRACTS)
        random.shuffle(pool)
        self.contracts_available = pool[:3]

    def _get_char_power(self, char_name):
        if char_name in CHARACTERS:
            return CHARACTERS[char_name]
        if char_name in AGENT_CHARACTERS:
            return AGENT_CHARACTERS[char_name]
        return ""

    def _roll_dice(self, player):
        count = self.dice_count[player]
        self.dice[player] = sorted([random.randint(1, 6) for _ in range(count)], reverse=True)
        char = self.characters[player]
        if char == 'Rashid al-Din':
            self.dice[player] = [min(d + 1, 6) for d in self.dice[player]]

    def _can_travel(self, player, dest):
        current = self.positions[player]
        if dest in CITIES[current]['connections']:
            return True
        return False

    def _travel_cost(self, player):
        char = self.characters[player]
        if char == 'Ibn Battuta':
            return 0
        return 1  # 1 gold per city traveled

    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 62}")
        variant_tag = " [Agents]" if self.variation == 'agents' else ""
        print(f"  MARCO POLO{variant_tag}  --  Round {self.round_num}/{self.max_rounds}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"{'=' * 62}")

        for p in (1, 2):
            marker = f" {YELLOW}<<{RESET}" if p == cp else ""
            char = self.characters[p] or "Not chosen"
            print(f"\n  {self.players[p-1]} ({char}): {GREEN}{self.scores[p]} VP{RESET}{marker}")
            res_str = ""
            for r in ('gold', 'silk', 'pepper'):
                color = RESOURCE_COLORS[r]
                res_str += f"{color}{r}:{self.resources[p][r]}{RESET}  "
            print(f"    Resources: {res_str}")
            pos = self.positions[p]
            visited = ', '.join(sorted(self.visited_cities[p]))
            print(f"    Location: {CYAN}{pos}{RESET} | Visited: {DIM}{visited}{RESET}")
            if self.dice[p]:
                dice_str = ' '.join(f"[{d}]" for d in self.dice[p])
                print(f"    Dice: {WHITE}{dice_str}{RESET}")
            if self.contracts_held[p]:
                for con in self.contracts_held[p]:
                    req = ', '.join(f"{r}:{v}" for r, v in con['requires'].items())
                    rew = ', '.join(f"{r}:{v}" for r, v in con['reward'].items())
                    print(f"    Contract: {con['name']} ({req} -> {rew})")

        # Map
        print(f"\n  {DIM}--- Silk Road ---{RESET}")
        route_str = ""
        for city in CITY_LIST:
            p1_here = "1" if self.positions[1] == city else " "
            p2_here = "2" if self.positions[2] == city else " "
            res_list = CITIES[city]['resources']
            res_str = ','.join(f"{r[0]}{v}" for r, v in res_list.items())
            route_str += f"  [{p1_here}{p2_here}]{city[:4]}({res_str})"
            conns = CITIES[city]['connections']
            next_cities = [c for c in conns if CITIES[c]['pos'] > CITIES[city]['pos']]
            if next_cities:
                route_str += " --"
        print(f"  {route_str}")

        if self.phase == 'choose_character':
            print(f"\n  {DIM}-- Choose Your Character --{RESET}")
            for i, char in enumerate(self.char_pool[:4]):
                power = self._get_char_power(char)
                print(f"    {i+1}. {char}: {power}")

        elif self.phase == 'place_dice':
            print(f"\n  {DIM}-- Action Spaces --{RESET}")
            for i, (action, info) in enumerate(ACTION_SPACES.items()):
                occupied = self.action_spaces_used.get(action, [])
                occ_str = f" (occupied by: {', '.join(str(o) for o in occupied)})" if occupied else ""
                print(f"    {i+1}. {action}: {info['desc']}{occ_str}")
            if self.contracts_available:
                print(f"\n  {DIM}-- Available Contracts --{RESET}")
                for i, con in enumerate(self.contracts_available):
                    req = ', '.join(f"{RESOURCE_COLORS.get(r, WHITE)}{r}:{v}{RESET}"
                                    for r, v in con['requires'].items())
                    rew = ', '.join(f"{r}:{v}" for r, v in con['reward'].items())
                    print(f"    {con['name']}: needs {req} -> gets {rew}")

        elif self.phase == 'fulfill':
            print(f"\n  {DIM}-- Fulfill Contracts Phase --{RESET}")

    def get_move(self):
        cp = self.current_player
        if self.phase == 'choose_character':
            while True:
                raw = input_with_quit("  Choose character # : ").strip()
                try:
                    idx = int(raw) - 1
                    if 0 <= idx < min(4, len(self.char_pool)):
                        return ('choose_char', idx)
                except ValueError:
                    pass
                print("  Enter a character number.")

        elif self.phase == 'roll':
            raw = input_with_quit("  Press Enter to roll your dice: ")
            return ('roll',)

        elif self.phase == 'place_dice':
            if not self.dice[cp]:
                return ('end_placement',)
            while True:
                actions = list(ACTION_SPACES.keys())
                raw = input_with_quit("  Place die on action (1-5) + die index, or 'pass': ").strip().lower()
                if raw in ('pass', 'p', 'done', 'd', ''):
                    return ('end_placement',)
                parts = raw.split()
                try:
                    if len(parts) >= 1:
                        action_idx = int(parts[0]) - 1
                        die_idx = int(parts[1]) - 1 if len(parts) > 1 else 0
                        if 0 <= action_idx < len(actions) and 0 <= die_idx < len(self.dice[cp]):
                            return ('place_die', actions[action_idx], die_idx)
                except ValueError:
                    pass
                print("  Format: '<action#> <die#>' e.g., '1 1' or just action# to use first die.")

        elif self.phase == 'fulfill':
            contracts = self.contracts_held[cp]
            if not contracts:
                return ('end_fulfill',)
            while True:
                raw = input_with_quit("  Fulfill contract # or 'done': ").strip().lower()
                if raw in ('done', 'd', ''):
                    return ('end_fulfill',)
                try:
                    idx = int(raw) - 1
                    if 0 <= idx < len(contracts):
                        return ('fulfill', idx)
                except ValueError:
                    pass
                print("  Enter contract number or 'done'.")

        elif self.phase == 'end_round':
            return ('next_round',)

    def make_move(self, move):
        cp = self.current_player
        opp = 2 if cp == 1 else 1

        if move[0] == 'choose_char':
            idx = move[1]
            char = self.char_pool[idx]
            self.characters[cp] = char
            self.char_pool.pop(idx)
            # Set starting position
            if char in ('Marco Polo', 'Matteo Polo', 'Niccolo Polo'):
                self.positions[cp] = 'Venice'
            elif char == 'Kublai Khan':
                self.positions[cp] = 'Beijing'
                self.visited_cities[cp].add('Beijing')
            elif char == 'Rashid al-Din':
                self.positions[cp] = 'Baghdad'
                self.visited_cities[cp].add('Baghdad')
            elif char == 'Berke Khan':
                self.positions[cp] = 'Constantinople'
                self.visited_cities[cp].add('Constantinople')
            elif char == 'Wilhelm von Rubruk':
                self.positions[cp] = 'Antioch'
                self.visited_cities[cp].add('Antioch')
            elif char == 'Ibn Battuta':
                self.positions[cp] = 'Alexandria'
                self.visited_cities[cp].add('Alexandria')
            elif char == 'Mercator':
                self.positions[cp] = 'Hormuz'
                self.visited_cities[cp].add('Hormuz')
            if char == 'Matteo Polo':
                self.dice_count[cp] = 6
            if self.characters[1] and self.characters[2]:
                self.phase = 'roll'
            return True

        elif move[0] == 'roll':
            self._roll_dice(cp)
            if self.dice[1] and self.dice[2]:
                self.phase = 'place_dice'
            elif not self.dice[opp]:
                return True  # other player needs to roll
            else:
                self.phase = 'place_dice'
            return True

        elif move[0] == 'place_die':
            action, die_idx = move[1], move[2]
            die_val = self.dice[cp][die_idx]
            occupied = self.action_spaces_used.get(action, [])
            char = self.characters[cp]

            # Must pay extra if space occupied (unless Berke Khan)
            if occupied and char != 'Berke Khan':
                cost = die_val  # must pay gold equal to die value
                if self.resources[cp]['gold'] < cost:
                    print(f"  Space occupied! Need {cost} gold to place here.")
                    return False
                self.resources[cp]['gold'] -= cost

            self.dice[cp].pop(die_idx)
            if action not in self.action_spaces_used:
                self.action_spaces_used[action] = []
            self.action_spaces_used[action].append(cp)
            self.dice_placed[cp] += 1

            # Resolve action
            if action == 'bazaar':
                amount = (die_val + 1) // 2
                if char == 'Wilhelm von Rubruk':
                    amount *= 2
                res_type = random.choice(['gold', 'silk', 'pepper'])
                self.resources[cp][res_type] += amount
                print(f"  Bazaar: gained {amount} {res_type}!")

            elif action == 'khan_favor':
                self.scores[cp] += die_val
                print(f"  Khan's Favor: gained {die_val} VP!")

            elif action == 'contracts':
                if self.contracts_available:
                    con = self.contracts_available.pop(0)
                    self.contracts_held[cp].append(con)
                    print(f"  Took contract: {con['name']}")
                    if not self.contracts_available:
                        self._refresh_contracts()
                else:
                    print("  No contracts available!")

            elif action == 'travel':
                steps = max(1, die_val // 2)
                if char == 'Marco Polo':
                    steps += 1
                current = self.positions[cp]
                travel_cost = self._travel_cost(cp)
                moved = 0
                for _ in range(steps):
                    connections = CITIES[current]['connections']
                    forward = [c for c in connections if CITIES[c]['pos'] > CITIES[current]['pos']]
                    if not forward:
                        forward = connections
                    if not forward:
                        break
                    if self.resources[cp]['gold'] < travel_cost:
                        print(f"  Not enough gold to travel further!")
                        break
                    if travel_cost > 0:
                        self.resources[cp]['gold'] -= travel_cost
                    dest = forward[0]
                    current = dest
                    moved += 1
                self.positions[cp] = current
                self.visited_cities[cp].add(current)
                # Gain city resources on arrival
                city_res = CITIES[current]['resources']
                for r, v in city_res.items():
                    self.resources[cp][r] += v
                print(f"  Traveled to {current} (moved {moved} cities)")

            elif action == 'city_action':
                city = self.positions[cp]
                city_res = CITIES[city]['resources']
                for r, v in city_res.items():
                    self.resources[cp][r] += v
                print(f"  City action in {city}: gained resources!")

            return False

        elif move[0] == 'end_placement':
            self.phase = 'fulfill'
            if self.dice[opp] and self.dice_placed[opp] < len(self.dice[opp]):
                pass
            return True

        elif move[0] == 'fulfill':
            idx = move[1]
            con = self.contracts_held[cp][idx]
            can_fulfill = True
            for r, needed in con['requires'].items():
                if self.resources[cp].get(r, 0) < needed:
                    can_fulfill = False
                    break
            if not can_fulfill:
                print("  Cannot fulfill - not enough resources!")
                return False
            for r, needed in con['requires'].items():
                self.resources[cp][r] -= needed
            for r, v in con['reward'].items():
                if r == 'vp':
                    bonus = 2 if self.characters[cp] == 'Mercator' else 0
                    self.scores[cp] += v + bonus
                else:
                    self.resources[cp][r] = self.resources[cp].get(r, 0) + v
            print(f"  Fulfilled contract: {con['name']}!")
            self.contracts_held[cp].pop(idx)
            return False

        elif move[0] == 'end_fulfill':
            if cp == 2 or self.phase == 'fulfill':
                self.phase = 'end_round'
            return True

        elif move[0] == 'next_round':
            # End of round bonuses
            for p in (1, 2):
                if self.characters[p] == 'Kublai Khan':
                    self.scores[p] += 1
                # VP for visited cities
                self.scores[p] += len(self.visited_cities[p])

            self.round_num += 1
            self.phase = 'roll'
            self.dice = {1: [], 2: []}
            self.action_spaces_used = {}
            self.dice_placed = {1: 0, 2: 0}
            self._refresh_contracts()
            return True

        return False

    def check_game_over(self):
        if self.round_num > self.max_rounds:
            self.game_over = True
            # End game scoring: VP for visited cities
            for p in (1, 2):
                self.scores[p] += len(self.visited_cities[p]) * 2
                # Bonus for reaching Beijing
                if 'Beijing' in self.visited_cities[p]:
                    self.scores[p] += 10
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
            'characters': {str(k): v for k, v in self.characters.items()},
            'positions': {str(k): v for k, v in self.positions.items()},
            'visited_cities': {str(k): list(v) for k, v in self.visited_cities.items()},
            'dice': {str(k): v for k, v in self.dice.items()},
            'dice_count': {str(k): v for k, v in self.dice_count.items()},
            'contracts_held': {str(k): v for k, v in self.contracts_held.items()},
            'contracts_available': self.contracts_available,
            'action_spaces_used': self.action_spaces_used,
            'dice_placed': {str(k): v for k, v in self.dice_placed.items()},
            'char_pool': self.char_pool,
        }

    def load_state(self, state):
        self.round_num = state['round_num']
        self.max_rounds = state['max_rounds']
        self.phase = state['phase']
        self.scores = {int(k): v for k, v in state['scores'].items()}
        self.resources = {int(k): v for k, v in state['resources'].items()}
        self.characters = {int(k): v for k, v in state['characters'].items()}
        self.positions = {int(k): v for k, v in state['positions'].items()}
        self.visited_cities = {int(k): set(v) for k, v in state['visited_cities'].items()}
        self.dice = {int(k): v for k, v in state['dice'].items()}
        self.dice_count = {int(k): v for k, v in state['dice_count'].items()}
        self.contracts_held = {int(k): v for k, v in state['contracts_held'].items()}
        self.contracts_available = state['contracts_available']
        self.action_spaces_used = state['action_spaces_used']
        self.dice_placed = {int(k): v for k, v in state['dice_placed'].items()}
        self.char_pool = state['char_pool']

    def get_tutorial(self):
        agents_text = ""
        if self.variation == 'agents':
            agents_text = """
  AGENTS VARIANT
    Three additional characters available:
    - Niccolo Polo: Can place 2 dice on same action space
    - Ibn Battuta: Travel costs 0 gold
    - Mercator: All contracts give +2 VP bonus"""
        return f"""
  ============================================================
    MARCO POLO - Tutorial
  ============================================================

  OVERVIEW
    Travel the Silk Road from Venice to Beijing! Place dice
    on action spaces, gather resources, fulfill contracts.
    Each player has a unique character power.

  CHARACTERS
    Each character starts in a different city and has a
    unique ability. Choose wisely!

  DICE & ACTIONS
    Roll 5 dice each round (6 for Matteo Polo). Place dice
    on action spaces. Higher dice = better rewards, but you
    must pay gold to place on occupied spaces.

    Actions:
    1. Bazaar     - Gain resources (amount = dice/2, rounded up)
    2. Khan Favor - Gain VP equal to dice value
    3. Contracts  - Take an available contract card
    4. Travel     - Move along Silk Road (spaces = dice/2)
    5. City Action - Use current city's special action

  TRAVEL
    Move between connected cities. Costs 1 gold per city
    moved (free for Ibn Battuta). Gain city resources on
    arrival. Each visited city scores VP.

  CONTRACTS
    Take contract cards, then fulfill them by spending the
    required resources for VP rewards.

  SCORING
    - Khan's Favor actions
    - Fulfilled contracts
    - Visited cities (1 VP per city per round, +2 each end game)
    - Beijing bonus: 10 VP if you reach Beijing

  WINNING
    After 5 rounds, highest score wins.
{agents_text}"""
