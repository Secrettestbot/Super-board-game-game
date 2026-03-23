"""Roll Through the Ages - Dice civilization building game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

DICE_FACES = [
    {'food': 3, 'workers': 0, 'goods': 0, 'coins': 0, 'skulls': 0},
    {'food': 0, 'workers': 3, 'goods': 0, 'coins': 0, 'skulls': 0},
    {'food': 2, 'workers': 2, 'goods': 0, 'coins': 0, 'skulls': 0},
    {'food': 0, 'workers': 0, 'goods': 2, 'coins': 0, 'skulls': 0},
    {'food': 0, 'workers': 0, 'goods': 0, 'coins': 7, 'skulls': 0},
    {'food': 0, 'workers': 0, 'goods': 0, 'coins': 0, 'skulls': 1},
]
FACE_LABELS = ['3 Food', '3 Workers', '2Food+2Work', '2 Goods', '7 Coins', 'Skull']

MONUMENTS = {
    'standard': {
        'step_pyramid':   {'w': 3,  'vp': 1,  'bonus': 3},
        'stone_henge':    {'w': 5,  'vp': 2,  'bonus': 4},
        'temple':         {'w': 7,  'vp': 4,  'bonus': 6},
        'obelisk':        {'w': 9,  'vp': 5,  'bonus': 7},
        'hanging_garden': {'w': 11, 'vp': 6,  'bonus': 8},
        'great_wall':     {'w': 13, 'vp': 7,  'bonus': 10},
        'great_pyramid':  {'w': 15, 'vp': 8,  'bonus': 12},
    },
    'iron_age_extra': {
        'colossus':       {'w': 17, 'vp': 10, 'bonus': 14},
        'great_library':  {'w': 19, 'vp': 12, 'bonus': 16},
    },
}

DEVELOPMENTS = {
    'standard': {
        'leadership':  {'cost': 10, 'vp': 2, 'desc': '+1 worker/turn'},
        'irrigation':  {'cost': 10, 'vp': 2, 'desc': '+1 food/turn'},
        'agriculture': {'cost': 15, 'vp': 3, 'desc': '+2 food/turn'},
        'quarrying':   {'cost': 15, 'vp': 3, 'desc': '+1 goods/turn'},
        'medicine':    {'cost': 15, 'vp': 3, 'desc': 'No disasters from skulls'},
        'engineering': {'cost': 20, 'vp': 3, 'desc': 'Goods count as workers'},
        'caravans':    {'cost': 20, 'vp': 4, 'desc': 'No goods storage limit'},
        'religion':    {'cost': 25, 'vp': 6, 'desc': 'Skulls give +1 coin each'},
        'granaries':   {'cost': 25, 'vp': 6, 'desc': 'Swap food/workers freely'},
        'empire':      {'cost': 30, 'vp': 8, 'desc': '+3 coins/turn'},
    },
    'iron_age_extra': {
        'coinage':     {'cost': 12, 'vp': 2,  'desc': '+2 coins/turn'},
        'masonry':     {'cost': 18, 'vp': 3,  'desc': 'Monuments cost -2 workers'},
        'philosophy':  {'cost': 35, 'vp': 10, 'desc': '+1 VP per other dev'},
    },
}

MON_NAMES = {
    'step_pyramid': 'Step Pyramid', 'stone_henge': 'Stonehenge',
    'temple': 'Temple', 'obelisk': 'Obelisk',
    'hanging_garden': 'Hanging Gardens', 'great_wall': 'Great Wall',
    'great_pyramid': 'Great Pyramid', 'colossus': 'Colossus',
    'great_library': 'Great Library',
}


class RollThroughAgesGame(BaseGame):
    """Dice civilization building game for 2 players."""

    name = "Roll Through the Ages"
    description = "Dice civilization building - roll for food, workers, goods, and coins"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard monuments and developments',
        'iron_age': 'Extra developments and monuments',
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.dice = []
        self.kept = []
        self.rolls_left = 3
        self.phase = 'roll'
        self.mons = {}
        self.devs = {}
        self.pd = {}
        self.mon_first = {}

    def setup(self):
        iron = self.variation == 'iron_age'
        self.mons = dict(MONUMENTS['standard'])
        self.devs = dict(DEVELOPMENTS['standard'])
        if iron:
            self.mons.update(MONUMENTS['iron_age_extra'])
            self.devs.update(DEVELOPMENTS['iron_age_extra'])
        self.mon_first = {}
        for p in (1, 2):
            self.pd[p] = {
                'cities': 3, 'food': 0, 'goods': 0, 'coins': 0,
                'workers': 0, 'devs': [], 'mon_prog': {m: 0 for m in self.mons},
                'mon_done': [], 'disaster': 0,
            }
        self.dice = []
        self.kept = []
        self.rolls_left = 3
        self.phase = 'roll'
        self.game_over = False
        self.winner = None

    def _d(self, p=None):
        return self.pd[p or self.current_player]

    def _has(self, dev, p=None):
        return dev in self._d(p)['devs']

    def _gcap(self, p=None):
        return 99 if self._has('caravans', p) else 6

    def _tally(self):
        totals = {'food': 0, 'workers': 0, 'goods': 0, 'coins': 0, 'skulls': 0}
        for fi in self.kept + self.dice:
            for k in totals:
                totals[k] += DICE_FACES[fi][k]
        return totals

    def _vp(self, p):
        d = self._d(p)
        vp = -d['disaster']
        for m in d['mon_done']:
            vp += self.mons[m]['bonus'] if self.mon_first.get(m) == p else self.mons[m]['vp']
        for dv in d['devs']:
            vp += self.devs[dv]['vp']
        if 'philosophy' in d['devs']:
            vp += len(d['devs']) - 1
        return vp

    # -- Display --------------------------------------------------------- #

    def display(self):
        p = self.current_player
        print(f"\n{'=' * 64}")
        print(f"  ROLL THROUGH THE AGES  -  Turn {self.turn_number + 1}"
              f"  -  {self.players[p - 1]}'s turn  [{self.phase}]")
        print(f"{'=' * 64}")
        for pl in (1, 2):
            d = self._d(pl)
            tag = " <<" if pl == p else ""
            print(f"\n  {self.players[pl - 1]}{tag}")
            print(f"    Cities:{d['cities']}  Food:{d['food']}  "
                  f"Goods:{d['goods']}/{self._gcap(pl)}  "
                  f"Coins:{d['coins']}  Workers:{d['workers']}  VP:{self._vp(pl)}")
            devs = ', '.join(d['devs']) if d['devs'] else 'none'
            print(f"    Devs: {devs}")
            if d['disaster']:
                print(f"    Disaster penalty: -{d['disaster']} VP")
        print(f"\n  --- Monuments ---")
        for m, info in self.mons.items():
            nm = MON_NAMES.get(m, m)
            p1 = self._d(1)['mon_prog'][m]
            p2 = self._d(2)['mon_prog'][m]
            w = info['w']
            first = f" [1st: {self.players[self.mon_first[m] - 1]}]" if m in self.mon_first else ""
            print(f"    {nm:<18s} need:{w:>2}  P1:{p1:>2}/{w}  P2:{p2:>2}/{w}{first}")
        if self.phase == 'roll' and (self.kept or self.dice):
            print(f"\n  --- Dice (Rolls left: {self.rolls_left}) ---")
            all_d = self.kept + self.dice
            tags = ["[K]" if i < len(self.kept) else "   " for i in range(len(all_d))]
            print("  " + "  ".join(f"{tags[i]} {FACE_LABELS[all_d[i]]:<13s}" for i in range(len(all_d))))
        print()

    # -- Roll helpers ---------------------------------------------------- #

    def _do_roll(self):
        n = self._d()['cities'] - len(self.kept)
        self.dice = [random.randint(0, 5) for _ in range(n)]
        self.rolls_left -= 1
        new_kept, remaining = list(self.kept), []
        for fi in self.dice:
            (new_kept if DICE_FACES[fi]['skulls'] > 0 else remaining).append(fi)
        self.kept, self.dice = new_kept, remaining

    def _do_keep(self, indices):
        kc = len(self.kept)
        new_kept, remaining = list(self.kept), []
        for i, fi in enumerate(self.dice):
            (new_kept if (kc + i + 1) in indices else remaining).append(fi)
        self.kept, self.dice = new_kept, remaining

    def _process_end_roll(self):
        d = self._d()
        t = self._tally()
        for dev, key, amt in [('irrigation', 'food', 1), ('agriculture', 'food', 2),
                               ('leadership', 'workers', 1), ('quarrying', 'goods', 1),
                               ('empire', 'coins', 3), ('coinage', 'coins', 2)]:
            if self._has(dev):
                t[key] += amt
        if self._has('religion'):
            t['coins'] += t['skulls']
        if t['skulls'] >= 2 and not self._has('medicine'):
            other = 3 - self.current_player
            penalty = t['skulls'] - 1
            self._d(other)['disaster'] += penalty
            print(f"  Disaster! {t['skulls']} skulls - {self.players[other - 1]} loses {penalty} VP!")
            input("  Press Enter...")
        d['food'] += t['food']
        d['workers'] = t['workers']
        d['goods'] = min(d['goods'] + t['goods'], self._gcap())
        d['coins'] += t['coins']
        self.phase = 'feed'
        self.dice = []

    def _run_roll_phase(self):
        """Handle entire roll phase interactively."""
        while True:
            clear_screen()
            self.display()
            if self.rolls_left == 3:
                raw = input_with_quit(f"  Type 'roll' to roll {self._d()['cities']} dice: ").strip().lower()
            elif self.rolls_left > 0:
                raw = input_with_quit("  'roll', 'keep 1 3', or 'done': ").strip().lower()
            else:
                self._process_end_roll()
                return
            if not raw:
                continue
            parts = raw.split()
            cmd = parts[0]
            if cmd == 'roll' and self.rolls_left > 0:
                self._do_roll()
                if self.rolls_left <= 0 or not self.dice:
                    self._process_end_roll()
                    return
            elif cmd == 'keep' and 0 < self.rolls_left < 3:
                try:
                    idxs = [int(x) for x in parts[1:]]
                except ValueError:
                    print("  Usage: keep 1 3 5"); continue
                total = len(self.kept) + len(self.dice)
                if any(i < 1 or i > total or i <= len(self.kept) for i in idxs):
                    print("  Invalid die numbers."); continue
                self._do_keep(idxs)
                if not self.dice:
                    self._process_end_roll()
                    return
            elif cmd == 'done' and self.rolls_left < 3:
                self._process_end_roll()
                return
            else:
                print("  Commands: roll, keep <nums>, done")

    def _run_feed_phase(self):
        d = self._d()
        while True:
            clear_screen()
            self.display()
            needed = d['cities']
            print(f"  Need {needed} food for {needed} cities. Have {d['food']} food.")
            raw = input_with_quit("  Type 'feed': ").strip().lower()
            if raw == 'feed':
                if d['food'] >= needed:
                    d['food'] -= needed
                else:
                    short = needed - d['food']
                    d['food'] = 0
                    d['disaster'] += short
                    print(f"  Lost {short} VP from starvation!")
                    input("  Press Enter...")
                self.phase = 'build'
                return

    def _run_build_phase(self):
        d = self._d()
        while True:
            clear_screen()
            self.display()
            print(f"  Workers: {d['workers']}  Coins: {d['coins']}  Goods: {d['goods']}")
            print("  'city', 'monument <name> <w>', 'buy <dev>', 'list', 'done'")
            raw = input_with_quit("  > ").strip().lower()
            if not raw:
                continue
            parts = raw.split()
            cmd = parts[0]

            if cmd == 'done':
                self.phase = 'roll'
                self.dice, self.kept, self.rolls_left = [], [], 3
                d['workers'] = 0
                return

            if cmd == 'list':
                print("\n  Available developments:")
                for dv, info in self.devs.items():
                    if dv not in d['devs']:
                        print(f"    {dv:<14s} cost:{info['cost']:>3}  VP:{info['vp']:>2}  {info['desc']}")
                input("  Press Enter...")
                continue

            if cmd == 'city':
                if d['cities'] >= 7:
                    print("  Max 7 cities!"); input("  Press Enter..."); continue
                cost = 3 + d['cities']
                if d['workers'] < cost:
                    print(f"  Need {cost} workers, have {d['workers']}."); input("  Press Enter..."); continue
                d['workers'] -= cost
                d['cities'] += 1
                print(f"  Built city! Now {d['cities']} cities.")
                input("  Press Enter...")

            elif cmd == 'monument' and len(parts) >= 3:
                name = parts[1]
                try:
                    w = int(parts[2])
                except ValueError:
                    print("  Usage: monument <name> <workers>"); input("  Press Enter..."); continue
                if name not in self.mons:
                    print(f"  Unknown. Options: {', '.join(self.mons)}"); input("  Press Enter..."); continue
                if name in d['mon_done']:
                    print("  Already completed!"); input("  Press Enter..."); continue
                total_w = self.mons[name]['w'] - (2 if self._has('masonry') else 0)
                total_w = max(1, total_w)
                remain = total_w - d['mon_prog'][name]
                actual = min(w, d['workers'], remain)
                if actual <= 0:
                    print("  No workers or already done."); input("  Press Enter..."); continue
                d['workers'] -= actual
                d['mon_prog'][name] += actual
                if d['mon_prog'][name] >= total_w:
                    d['mon_done'].append(name)
                    nm = MON_NAMES.get(name, name)
                    if name not in self.mon_first:
                        self.mon_first[name] = self.current_player
                        print(f"  Completed {nm} FIRST! Bonus VP: {self.mons[name]['bonus']}!")
                    else:
                        print(f"  Completed {nm}! VP: {self.mons[name]['vp']}")
                else:
                    print(f"  +{actual} workers -> {d['mon_prog'][name]}/{total_w}")
                input("  Press Enter...")

            elif cmd == 'buy' and len(parts) >= 2:
                dv = parts[1]
                if dv not in self.devs:
                    print("  Unknown dev. Type 'list'."); input("  Press Enter..."); continue
                if dv in d['devs']:
                    print("  Already owned!"); input("  Press Enter..."); continue
                cost = self.devs[dv]['cost']
                funds = d['coins'] + d['goods']
                if funds < cost:
                    print(f"  Need {cost}, have {d['coins']}c+{d['goods']}g={funds}."); input("  Press Enter..."); continue
                g_spent = min(d['goods'], cost)
                d['goods'] -= g_spent
                d['coins'] -= (cost - g_spent)
                d['devs'].append(dv)
                print(f"  Bought {dv}! {self.devs[dv]['desc']}")
                input("  Press Enter...")
            else:
                print("  Unknown command.")

    # -- Main move interface --------------------------------------------- #

    def get_move(self):
        return ('turn',)

    def make_move(self, move):
        self._run_roll_phase()
        self._run_feed_phase()
        self._run_build_phase()
        return True

    # -- Game over ------------------------------------------------------- #

    def check_game_over(self):
        all_done = all(
            m in self._d(1)['mon_done'] or m in self._d(2)['mon_done']
            for m in self.mons)
        five_devs = any(len(self._d(p)['devs']) >= 5 for p in (1, 2))
        if all_done or five_devs:
            self.game_over = True
            v1, v2 = self._vp(1), self._vp(2)
            self.winner = 1 if v1 > v2 else (2 if v2 > v1 else None)

    # -- Save / Load ----------------------------------------------------- #

    def get_state(self):
        return {
            'dice': self.dice, 'kept': self.kept, 'rolls_left': self.rolls_left,
            'phase': self.phase, 'mon_first': dict(self.mon_first),
            'pd': {str(p): dict(self._d(p)) for p in (1, 2)},
        }

    def load_state(self, state):
        self.dice = state['dice']
        self.kept = state['kept']
        self.rolls_left = state['rolls_left']
        self.phase = state['phase']
        self.mon_first = {k: int(v) if isinstance(v, str) else v
                          for k, v in state.get('mon_first', {}).items()}
        iron = self.variation == 'iron_age'
        self.mons = dict(MONUMENTS['standard'])
        self.devs = dict(DEVELOPMENTS['standard'])
        if iron:
            self.mons.update(MONUMENTS['iron_age_extra'])
            self.devs.update(DEVELOPMENTS['iron_age_extra'])
        for ps, pdata in state['pd'].items():
            p = int(ps)
            self.pd[p] = dict(pdata)
            self.pd[p]['mon_prog'] = dict(pdata['mon_prog'])
            self.pd[p]['mon_done'] = list(pdata['mon_done'])
            self.pd[p]['devs'] = list(pdata['devs'])

    # -- Tutorial -------------------------------------------------------- #

    def get_tutorial(self):
        t = """
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
     (start with 3). Up to 3 rolls per turn.
     Keep dice between rolls. Skulls MUST be kept.

     Dice faces:
       3 Food          - feeds your cities
       3 Workers       - build cities/monuments
       2 Food+2 Work   - split resources
       2 Goods         - accumulate for buying
       7 Coins         - buy developments
       Skull           - disasters if 2+ rolled

  2. FEED PHASE
     Feed cities (1 food per city). Shortages
     cost 1 VP per missing food.

  3. BUILD PHASE
     Spend workers and resources:
     - 'city'                 Build a new city
       (cost = 3 + current cities; max 7)
     - 'monument <name> <n>'  Assign n workers
     - 'buy <development>'    Buy with coins+goods
     - 'list'                 Show what you can buy
     - 'done'                 End your turn

MONUMENTS:
  Shared race - first to complete gets bonus VP.
  Workers assigned over multiple turns.

DEVELOPMENTS:
  Buy with coins + goods combined. Each gives
  VP and a special ability:
    leadership  (+1 worker)   irrigation (+1 food)
    agriculture (+2 food)     quarrying  (+1 goods)
    medicine    (no disasters) engineering (goods=workers)
    caravans    (no goods cap) religion   (skull coins)
    granaries   (swap food/work) empire   (+3 coins)

DISASTERS:
  2+ skulls: opponent loses (skulls-1) VP.
  Medicine development prevents this.

GAME END:
  All monuments completed (between both players)
  OR any player buys 5 developments.
  Highest VP wins!
"""
        if self.variation == 'iron_age':
            t += """
IRON AGE VARIANT:
  Extra monuments: Colossus (17w), Great Library (19w)
  Extra developments: Coinage (+2 coins/turn),
    Masonry (monuments -2 workers),
    Philosophy (+1 VP per other dev owned)
"""
        t += """
COMMANDS:
  roll / keep 1 3 / done  - Rolling phase
  feed                    - Feed phase
  city / monument / buy   - Build phase
  list                    - Show purchasable devs

  quit / q   - Quit    save / s - Save
  help / h   - Help    tutorial / t - Tutorial
==================================================
"""
        return t
