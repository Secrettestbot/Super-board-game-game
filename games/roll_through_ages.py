"""Roll Through the Ages - Dice civilization building game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

# Dice faces: each die has these 6 faces
# food, food, food+workers, workers, goods, coins, skull variants
DICE_FACES = [
    {'food': 3, 'workers': 0, 'goods': 0, 'coins': 0, 'skulls': 0},  # 3 food
    {'food': 0, 'workers': 3, 'goods': 0, 'coins': 0, 'skulls': 0},  # 3 workers
    {'food': 2, 'workers': 2, 'goods': 0, 'coins': 0, 'skulls': 0},  # 2 food + 2 workers
    {'food': 0, 'workers': 0, 'goods': 2, 'coins': 0, 'skulls': 0},  # 2 goods
    {'food': 0, 'workers': 0, 'goods': 0, 'coins': 7, 'skulls': 0},  # 7 coins
    {'food': 0, 'workers': 0, 'goods': 0, 'coins': 0, 'skulls': 1},  # skull
]

FACE_LABELS = ['3 Food', '3 Workers', '2 Food+2 Workers', '2 Goods', '7 Coins', 'Skull']

MONUMENTS_STANDARD = {
    'step_pyramid':  {'workers': 3,  'vp': 1,  'bonus': 3},
    'stone_henge':   {'workers': 5,  'vp': 2,  'bonus': 4},
    'temple':        {'workers': 7,  'vp': 4,  'bonus': 6},
    'hanging_garden': {'workers': 11, 'vp': 6,  'bonus': 8},
    'great_pyramid': {'workers': 15, 'vp': 8,  'bonus': 12},
    'great_wall':    {'workers': 13, 'vp': 7,  'bonus': 10},
    'obelisk':       {'workers': 9,  'vp': 5,  'bonus': 7},
}

MONUMENTS_IRON_AGE = {
    **MONUMENTS_STANDARD,
    'colossus':      {'workers': 17, 'vp': 10, 'bonus': 14},
    'great_library': {'workers': 19, 'vp': 12, 'bonus': 16},
}

DEVELOPMENTS_STANDARD = {
    'leadership':   {'cost': 10, 'vp': 2,  'desc': '+1 worker per turn'},
    'irrigation':   {'cost': 10, 'vp': 2,  'desc': '+1 food per turn'},
    'agriculture':  {'cost': 15, 'vp': 3,  'desc': '+2 food per turn'},
    'quarrying':    {'cost': 15, 'vp': 3,  'desc': '+1 goods per turn'},
    'medicine':     {'cost': 15, 'vp': 3,  'desc': 'Skulls do not cause disasters'},
    'engineering':  {'cost': 20, 'vp': 3,  'desc': 'Use goods as workers'},
    'caravans':     {'cost': 20, 'vp': 4,  'desc': 'No max on goods storage'},
    'religion':     {'cost': 25, 'vp': 6,  'desc': 'Skulls give +1 coin each'},
    'granaries':    {'cost': 25, 'vp': 6,  'desc': 'Swap food and workers freely'},
    'empire':       {'cost': 30, 'vp': 8,  'desc': '+3 coins per turn'},
}

DEVELOPMENTS_IRON_AGE = {
    **DEVELOPMENTS_STANDARD,
    'coinage':      {'cost': 12, 'vp': 2,  'desc': '+2 coins per turn'},
    'masonry':      {'cost': 18, 'vp': 3,  'desc': 'Monuments cost 2 fewer workers'},
    'philosophy':   {'cost': 35, 'vp': 10, 'desc': '+1 VP per development owned'},
}

MONUMENT_DISPLAY = {
    'step_pyramid': 'Step Pyramid', 'stone_henge': 'Stonehenge',
    'temple': 'Temple', 'hanging_garden': 'Hanging Gardens',
    'great_pyramid': 'Great Pyramid', 'great_wall': 'Great Wall',
    'obelisk': 'Obelisk', 'colossus': 'Colossus',
    'great_library': 'Great Library',
}


class RollThroughAgesGame(BaseGame):
    """Dice civilization building game for 2 players."""

    name = "Roll Through the Ages"
    description = "Dice civilization building - roll for food, workers, goods, and coins"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game with base monuments and developments',
        'iron_age': 'Iron Age variant with extra developments and monuments',
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.dice = []
        self.kept = []
        self.rolls_left = 3
        self.phase = 'roll'
        self.monuments = {}
        self.developments = {}
        self.player_data = {}

    def setup(self):
        if self.variation == 'iron_age':
            self.monuments = {k: dict(v) for k, v in MONUMENTS_IRON_AGE.items()}
            self.developments = {k: dict(v) for k, v in DEVELOPMENTS_IRON_AGE.items()}
        else:
            self.monuments = {k: dict(v) for k, v in MONUMENTS_STANDARD.items()}
            self.developments = {k: dict(v) for k, v in DEVELOPMENTS_STANDARD.items()}
        # Track who completed each monument first (for bonus VP)
        self.monument_completed_by = {}
        self.monument_first = {}  # monument -> player who finished first
        for p in (1, 2):
            self.player_data[p] = {
                'cities': 3,        # start with 3 cities = 3 dice
                'food': 0,
                'goods': 0,
                'coins': 0,
                'workers': 0,       # temporary per turn
                'developments': [],
                'monument_progress': {m: 0 for m in self.monuments},
                'monuments_completed': [],
                'disaster_points': 0,
                'fed': True,
            }
        self.dice = []
        self.kept = []
        self.rolls_left = 3
        self.phase = 'roll'
        self.game_over = False
        self.winner = None

    # ------------------------------------------------------------------ #
    #  Helpers
    # ------------------------------------------------------------------ #

    def _pd(self, player=None):
        """Shortcut to current player data."""
        return self.player_data[player or self.current_player]

    def _num_dice(self, player=None):
        return self._pd(player)['cities']

    def _has_dev(self, dev, player=None):
        return dev in self._pd(player)['developments']

    def _goods_cap(self, player=None):
        if self._has_dev('caravans', player):
            return 99
        return 6

    def _roll_die(self):
        return random.randint(0, 5)

    def _tally_dice(self, dice_indices=None):
        """Sum resources from kept dice and any remaining."""
        all_dice = self.kept + self.dice
        totals = {'food': 0, 'workers': 0, 'goods': 0, 'coins': 0, 'skulls': 0}
        for face_idx in all_dice:
            face = DICE_FACES[face_idx]
            for k in totals:
                totals[k] += face[k]
        return totals

    def _calc_vp(self, player):
        pd = self._pd(player)
        vp = 0
        # Monument VP
        for m in pd['monuments_completed']:
            vp += self.monuments[m]['vp']
            if self.monument_first.get(m) == player:
                vp += self.monuments[m]['bonus'] - self.monuments[m]['vp']
        # Development VP
        for d in pd['developments']:
            vp += self.developments[d]['vp']
        # Philosophy bonus
        if 'philosophy' in pd['developments']:
            vp += len(pd['developments']) - 1  # exclude philosophy itself
        # Disaster penalty
        vp -= pd['disaster_points']
        return vp

    # ------------------------------------------------------------------ #
    #  Display
    # ------------------------------------------------------------------ #

    def _render_dice_row(self):
        lines = []
        all_dice = self.kept + self.dice
        if not all_dice:
            return "  No dice rolled yet."
        header = ""
        for i, face_idx in enumerate(all_dice):
            tag = "[KEPT] " if i < len(self.kept) else "       "
            header += f"  {tag}Die {i + 1}    "
        lines.append(header)
        row = ""
        for i, face_idx in enumerate(all_dice):
            row += f"  [{FACE_LABELS[face_idx]:^17s}]"
        lines.append(row)
        return "\n".join(lines)

    def display(self):
        pd = self._pd()
        p = self.current_player
        print(f"\n{'=' * 64}")
        print(f"  ROLL THROUGH THE AGES  -  Turn {self.turn_number + 1}"
              f"  -  {self.players[p - 1]}'s turn  ({self.phase} phase)")
        print(f"{'=' * 64}")
        # Both players' stats
        for pl in (1, 2):
            d = self._pd(pl)
            marker = " <<" if pl == p else ""
            print(f"\n  {self.players[pl - 1]}{marker}")
            print(f"    Cities: {d['cities']}  |  Food: {d['food']}"
                  f"  |  Goods: {d['goods']}/{self._goods_cap(pl)}"
                  f"  |  Coins: {d['coins']}  |  VP: {self._calc_vp(pl)}")
            devs = ', '.join(d['developments']) if d['developments'] else 'none'
            print(f"    Developments: {devs}")
            if d['disaster_points'] > 0:
                print(f"    Disaster penalties: -{d['disaster_points']} VP")
        # Monuments
        print(f"\n  {'--- Monuments ---':^60}")
        for m, info in self.monuments.items():
            name = MONUMENT_DISPLAY.get(m, m)
            p1_prog = self._pd(1)['monument_progress'][m]
            p2_prog = self._pd(2)['monument_progress'][m]
            total = info['workers']
            first = self.monument_first.get(m)
            status = ""
            if first:
                status = f" [Completed first by {self.players[first - 1]}]"
            print(f"    {name:<18s} ({total:>2} workers) "
                  f"P1:{p1_prog:>2}/{total}  P2:{p2_prog:>2}/{total}{status}")
        # Dice
        if self.phase == 'roll' and (self.kept or self.dice):
            print(f"\n  --- Dice (Rolls left: {self.rolls_left}) ---")
            print(self._render_dice_row())
        print()

    # ------------------------------------------------------------------ #
    #  Move handling
    # ------------------------------------------------------------------ #

    def get_move(self):
        pd = self._pd()
        while True:
            if self.phase == 'roll':
                if self.rolls_left == 3:
                    raw = input_with_quit(f"  {self.players[self.current_player - 1]}"
                                          f", type 'roll' to roll {self._num_dice()} dice: ").strip().lower()
                elif self.rolls_left > 0:
                    raw = input_with_quit("  'roll', 'keep 1 3' to keep dice, or 'done' to finish rolling: ").strip().lower()
                else:
                    return ('end_roll',)
                if not raw:
                    continue
                parts = raw.split()
                cmd = parts[0]
                if cmd == 'roll':
                    if self.rolls_left <= 0:
                        print("  No rolls left!")
                        continue
                    return ('roll',)
                if cmd == 'keep' and self.rolls_left < 3:
                    try:
                        indices = [int(x) for x in parts[1:]]
                    except ValueError:
                        print("  Usage: keep 1 3 5")
                        continue
                    total = len(self.kept) + len(self.dice)
                    if any(i < 1 or i > total for i in indices):
                        print(f"  Dice numbers must be 1-{total}.")
                        continue
                    # Only allow keeping unkept dice
                    kept_count = len(self.kept)
                    for idx in indices:
                        if idx <= kept_count:
                            print(f"  Die {idx} is already kept.")
                            continue
                    return ('keep', indices)
                if cmd == 'done' and self.rolls_left < 3:
                    return ('end_roll',)
                print("  Commands: roll, keep <nums>, done")
            elif self.phase == 'feed':
                needed = pd['cities']
                have = pd['food']
                print(f"  You need {needed} food to feed {needed} cities. You have {have} food.")
                if have >= needed:
                    raw = input_with_quit("  'feed' to feed your people: ").strip().lower()
                    if raw == 'feed':
                        return ('feed',)
                else:
                    raw = input_with_quit("  'feed' to feed (will lose VP for shortage): ").strip().lower()
                    if raw == 'feed':
                        return ('feed',)
                print("  Type 'feed'.")
            elif self.phase == 'build':
                print("  Actions: 'city' (build city), 'monument <name> <workers>',"
                      " 'buy <development>', 'done' (end turn)")
                raw = input_with_quit("  > ").strip().lower()
                if not raw:
                    continue
                parts = raw.split()
                cmd = parts[0]
                if cmd == 'done':
                    return ('end_turn',)
                if cmd == 'city':
                    return ('build_city',)
                if cmd == 'monument' and len(parts) >= 3:
                    name = parts[1]
                    try:
                        w = int(parts[2])
                    except ValueError:
                        print("  Usage: monument <name> <workers>")
                        continue
                    return ('build_monument', name, w)
                if cmd == 'monument' and len(parts) == 2:
                    print("  Usage: monument <name> <workers>")
                    continue
                if cmd == 'buy' and len(parts) >= 2:
                    dev = parts[1]
                    return ('buy_dev', dev)
                if cmd == 'list':
                    self._show_available()
                    continue
                print("  Unknown command. Type 'list' to see options, 'done' to end turn.")

    def _show_available(self):
        pd = self._pd()
        print("\n  Available developments:")
        for d, info in self.developments.items():
            if d not in pd['developments']:
                print(f"    {d:<15s} cost:{info['cost']:>3} coins/goods  "
                      f"VP:{info['vp']:>2}  {info['desc']}")
        print()

    def make_move(self, move):
        action = move[0]
        pd = self._pd()

        if action == 'roll':
            # Roll unkept dice
            n = self._num_dice() - len(self.kept)
            self.dice = [self._roll_die() for _ in range(n)]
            self.rolls_left -= 1
            # Must keep skulls
            new_kept = list(self.kept)
            remaining = []
            for face_idx in self.dice:
                if DICE_FACES[face_idx]['skulls'] > 0:
                    new_kept.append(face_idx)
                else:
                    remaining.append(face_idx)
            self.kept = new_kept
            self.dice = remaining
            if self.rolls_left <= 0 or not self.dice:
                return self._process_end_roll()
            return self._continue_roll_phase()

        if action == 'keep':
            indices = move[1]
            kept_count = len(self.kept)
            new_kept = list(self.kept)
            remaining = []
            for i, face_idx in enumerate(self.dice):
                actual_idx = kept_count + i + 1
                if actual_idx in indices:
                    new_kept.append(face_idx)
                else:
                    remaining.append(face_idx)
            self.kept = new_kept
            self.dice = remaining
            if not self.dice:
                return self._process_end_roll()
            return self._continue_roll_phase()

        if action == 'end_roll':
            return self._process_end_roll()

        if action == 'feed':
            needed = pd['cities']
            if pd['food'] >= needed:
                pd['food'] -= needed
            else:
                shortage = needed - pd['food']
                pd['food'] = 0
                pd['disaster_points'] += shortage
                print(f"  Lost {shortage} VP from starvation!")
                input("  Press Enter to continue...")
            pd['fed'] = True
            self.phase = 'build'
            return self._continue_build_phase()

        if action == 'build_city':
            # Cost: 7 workers to add a city (max 7 cities)
            if pd['cities'] >= 7:
                print("  Maximum 7 cities!")
                input("  Press Enter...")
                return self._continue_build_phase()
            cost = 3 + pd['cities']  # progressive cost: 4,5,6,7
            if pd['workers'] >= cost:
                pd['workers'] -= cost
                pd['cities'] += 1
                print(f"  Built a city! Now have {pd['cities']} cities.")
                input("  Press Enter...")
            else:
                print(f"  Need {cost} workers to build next city. You have {pd['workers']}.")
                input("  Press Enter...")
            return self._continue_build_phase()

        if action == 'build_monument':
            name = move[1]
            workers = move[2]
            if name not in self.monuments:
                print(f"  Unknown monument '{name}'. Available: {', '.join(self.monuments.keys())}")
                input("  Press Enter...")
                return self._continue_build_phase()
            if name in pd['monuments_completed']:
                print(f"  You already completed {MONUMENT_DISPLAY.get(name, name)}!")
                input("  Press Enter...")
                return self._continue_build_phase()
            total_needed = self.monuments[name]['workers']
            if self._has_dev('masonry'):
                total_needed = max(1, total_needed - 2)
            remaining = total_needed - pd['monument_progress'][name]
            actual = min(workers, pd['workers'], remaining)
            if actual <= 0:
                print("  No workers to assign or monument already complete.")
                input("  Press Enter...")
                return self._continue_build_phase()
            pd['workers'] -= actual
            pd['monument_progress'][name] += actual
            if pd['monument_progress'][name] >= total_needed:
                pd['monuments_completed'].append(name)
                if name not in self.monument_first:
                    self.monument_first[name] = self.current_player
                    print(f"  Completed {MONUMENT_DISPLAY.get(name, name)} FIRST! "
                          f"Bonus VP: {self.monuments[name]['bonus']}!")
                else:
                    print(f"  Completed {MONUMENT_DISPLAY.get(name, name)}! "
                          f"VP: {self.monuments[name]['vp']}")
            else:
                print(f"  Assigned {actual} workers to {MONUMENT_DISPLAY.get(name, name)}. "
                      f"Progress: {pd['monument_progress'][name]}/{total_needed}")
            input("  Press Enter...")
            return self._continue_build_phase()

        if action == 'buy_dev':
            dev = move[1]
            if dev not in self.developments:
                print(f"  Unknown development. Type 'list' to see options.")
                input("  Press Enter...")
                return self._continue_build_phase()
            if dev in pd['developments']:
                print(f"  You already have {dev}!")
                input("  Press Enter...")
                return self._continue_build_phase()
            cost = self.developments[dev]['cost']
            total_funds = pd['coins'] + pd['goods']
            if total_funds < cost:
                print(f"  Need {cost} coins+goods. You have {pd['coins']} coins + {pd['goods']} goods = {total_funds}.")
                input("  Press Enter...")
                return self._continue_build_phase()
            # Spend goods first, then coins
            spent = 0
            goods_spent = min(pd['goods'], cost)
            pd['goods'] -= goods_spent
            spent += goods_spent
            if spent < cost:
                coins_needed = cost - spent
                pd['coins'] -= coins_needed
            pd['developments'].append(dev)
            print(f"  Purchased {dev}! {self.developments[dev]['desc']}")
            input("  Press Enter...")
            return self._continue_build_phase()

        if action == 'end_turn':
            # Apply engineering: leftover workers can convert to goods
            self.phase = 'roll'
            self.dice = []
            self.kept = []
            self.rolls_left = 3
            pd['workers'] = 0
            return True

        return False

    def _process_end_roll(self):
        """Tally dice results and move to feed phase."""
        pd = self._pd()
        totals = self._tally_dice()
        # Apply development bonuses
        if self._has_dev('irrigation'):
            totals['food'] += 1
        if self._has_dev('agriculture'):
            totals['food'] += 2
        if self._has_dev('leadership'):
            totals['workers'] += 1
        if self._has_dev('quarrying'):
            totals['goods'] += 1
        if self._has_dev('empire'):
            totals['coins'] += 3
        if self._has_dev('coinage'):
            totals['coins'] += 2
        if self._has_dev('religion'):
            totals['coins'] += totals['skulls']
        # Handle skulls (disasters)
        if totals['skulls'] >= 2 and not self._has_dev('medicine'):
            disaster_penalty = totals['skulls'] - 1
            # Disaster hits opponent with fewer VP, or both
            other = 2 if self.current_player == 1 else 1
            self._pd(other)['disaster_points'] += disaster_penalty
            print(f"  Disaster! {totals['skulls']} skulls - {self.players[other - 1]}"
                  f" loses {disaster_penalty} VP!")
            input("  Press Enter...")
        # Apply resources
        pd['food'] += totals['food']
        pd['workers'] = totals['workers']
        # Goods and coins accumulate
        pd['goods'] = min(pd['goods'] + totals['goods'], self._goods_cap())
        pd['coins'] += totals['coins']
        if self._has_dev('granaries'):
            # Can swap food and workers
            pass  # handled implicitly - player decides allocation
        if self._has_dev('engineering'):
            # Goods can be used as workers later in build phase
            pass
        self.phase = 'feed'
        self.dice = []
        return self._continue_feed_phase()

    def _continue_roll_phase(self):
        while True:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception:
                raise
            if move[0] == 'roll':
                n = self._num_dice() - len(self.kept)
                self.dice = [self._roll_die() for _ in range(n)]
                self.rolls_left -= 1
                new_kept = list(self.kept)
                remaining = []
                for face_idx in self.dice:
                    if DICE_FACES[face_idx]['skulls'] > 0:
                        new_kept.append(face_idx)
                    else:
                        remaining.append(face_idx)
                self.kept = new_kept
                self.dice = remaining
                if self.rolls_left <= 0 or not self.dice:
                    return self._process_end_roll()
                continue
            if move[0] == 'keep':
                indices = move[1]
                kept_count = len(self.kept)
                new_kept = list(self.kept)
                remaining = []
                for i, face_idx in enumerate(self.dice):
                    actual_idx = kept_count + i + 1
                    if actual_idx in indices:
                        new_kept.append(face_idx)
                    else:
                        remaining.append(face_idx)
                self.kept = new_kept
                self.dice = remaining
                if not self.dice:
                    return self._process_end_roll()
                continue
            if move[0] == 'end_roll':
                return self._process_end_roll()

    def _continue_feed_phase(self):
        while True:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception:
                raise
            if move[0] == 'feed':
                return self.make_move(move)

    def _continue_build_phase(self):
        while True:
            clear_screen()
            self.display()
            try:
                move = self.get_move()
            except Exception:
                raise
            result = self.make_move(move)
            if move[0] == 'end_turn':
                return True

    # ------------------------------------------------------------------ #
    #  Game over
    # ------------------------------------------------------------------ #

    def check_game_over(self):
        # Game ends when: all monuments completed OR any player has 5+ developments
        all_monuments_done = all(
            m in self._pd(1)['monuments_completed'] or m in self._pd(2)['monuments_completed']
            for m in self.monuments
        )
        five_devs = any(
            len(self._pd(p)['developments']) >= 5 for p in (1, 2)
        )
        if all_monuments_done or five_devs:
            self.game_over = True
            vp1 = self._calc_vp(1)
            vp2 = self._calc_vp(2)
            if vp1 > vp2:
                self.winner = 1
            elif vp2 > vp1:
                self.winner = 2
            else:
                self.winner = None

    # ------------------------------------------------------------------ #
    #  Save / Load
    # ------------------------------------------------------------------ #

    def get_state(self):
        return {
            'dice': self.dice,
            'kept': self.kept,
            'rolls_left': self.rolls_left,
            'phase': self.phase,
            'monument_first': {k: v for k, v in self.monument_first.items()},
            'player_data': {
                str(p): {
                    'cities': self._pd(p)['cities'],
                    'food': self._pd(p)['food'],
                    'goods': self._pd(p)['goods'],
                    'coins': self._pd(p)['coins'],
                    'workers': self._pd(p)['workers'],
                    'developments': list(self._pd(p)['developments']),
                    'monument_progress': dict(self._pd(p)['monument_progress']),
                    'monuments_completed': list(self._pd(p)['monuments_completed']),
                    'disaster_points': self._pd(p)['disaster_points'],
                    'fed': self._pd(p)['fed'],
                } for p in (1, 2)
            },
        }

    def load_state(self, state):
        self.dice = state['dice']
        self.kept = state['kept']
        self.rolls_left = state['rolls_left']
        self.phase = state['phase']
        self.monument_first = state.get('monument_first', {})
        if self.variation == 'iron_age':
            self.monuments = {k: dict(v) for k, v in MONUMENTS_IRON_AGE.items()}
            self.developments = {k: dict(v) for k, v in DEVELOPMENTS_IRON_AGE.items()}
        else:
            self.monuments = {k: dict(v) for k, v in MONUMENTS_STANDARD.items()}
            self.developments = {k: dict(v) for k, v in DEVELOPMENTS_STANDARD.items()}
        for p_str, pdata in state['player_data'].items():
            p = int(p_str)
            self.player_data[p] = {
                'cities': pdata['cities'],
                'food': pdata['food'],
                'goods': pdata['goods'],
                'coins': pdata['coins'],
                'workers': pdata['workers'],
                'developments': list(pdata['developments']),
                'monument_progress': dict(pdata['monument_progress']),
                'monuments_completed': list(pdata['monuments_completed']),
                'disaster_points': pdata['disaster_points'],
                'fed': pdata.get('fed', True),
            }

    # ------------------------------------------------------------------ #
    #  Tutorial
    # ------------------------------------------------------------------ #

    def get_tutorial(self):
        txt = """
==================================================
  ROLL THROUGH THE AGES TUTORIAL
==================================================

OVERVIEW:
  Build a civilization by rolling dice to gather
  food, workers, goods, and coins. Construct
  monuments and buy developments to earn VP.
  The player with the most VP wins!

EACH TURN HAS 3 PHASES:

  1. ROLL PHASE
     Roll dice equal to your number of cities
     (start with 3). You get up to 3 rolls.
     After each roll you may keep dice or reroll.
     Skulls MUST be kept and cannot be rerolled.

     Dice faces:
       3 Food         - feeds your cities
       3 Workers      - build cities/monuments
       2 Food+Workers - split resources
       2 Goods        - accumulate for buying
       7 Coins        - buy developments
       Skull          - disasters if 2+ rolled

  2. FEED PHASE
     You must feed your cities (1 food per city).
     Shortages cost 1 VP per missing food.

  3. BUILD PHASE
     Spend workers and resources:
     - 'city'                  Build a new city
                               (more dice next turn)
     - 'monument <name> <n>'   Assign workers to
                               a monument
     - 'buy <development>'     Buy a development
                               with coins+goods
     - 'list'                  Show available buys
     - 'done'                  End your turn

MONUMENTS:
  Shared between players. First to complete a
  monument earns bonus VP. Cost is in workers
  that can be assigned over multiple turns.

DEVELOPMENTS:
  Purchased with coins and goods. Each gives VP
  and a special ability. Examples:
    leadership  - +1 worker per turn
    irrigation  - +1 food per turn
    medicine    - skulls cause no disasters
    engineering - use goods as workers

DISASTERS:
  Rolling 2+ skulls triggers a disaster. The
  opponent with fewer VP loses (skulls-1) VP.

GAME END:
  The game ends when ALL monuments are completed
  (across both players) or any player purchases
  5 developments. Highest VP wins!
"""
        if self.variation == 'iron_age':
            txt += """
IRON AGE VARIANT:
  Adds extra monuments (Colossus, Great Library)
  and developments (Coinage, Masonry, Philosophy).
  Masonry reduces monument costs by 2 workers.
  Philosophy grants +1 VP per other development.
"""
        txt += """
COMMANDS:
  roll              - Roll/reroll the dice
  keep 1 3 5        - Keep specific dice
  done              - End rolling / end turn
  feed              - Feed your cities
  city              - Build a new city
  monument <n> <w>  - Build monument with workers
  buy <dev>         - Buy a development
  list              - List available purchases

  quit / q          - Quit the game
  save / s          - Save and suspend
  help / h          - Show help
  tutorial / t      - Show this tutorial
==================================================
"""
        return txt
