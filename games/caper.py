"""Caper - Card drafting heist game."""

import random
from engine.base import BaseGame, input_with_quit, clear_screen

RESET = '\033[0m'
RED = '\033[91m'
BLUE = '\033[94m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
MAGENTA = '\033[95m'
DIM = '\033[2m'
BOLD = '\033[1m'

# Thief abilities
THIEF_ABILITIES = [
    {'name': 'Lockpick', 'ability': 'steal_gear', 'power': 2, 'desc': '+2 power, can steal gear'},
    {'name': 'Hacker', 'ability': 'disable_security', 'power': 1, 'desc': '+1 power, lowers security by 1'},
    {'name': 'Muscle', 'ability': 'intimidate', 'power': 3, 'desc': '+3 power, pure strength'},
    {'name': 'Acrobat', 'ability': 'bypass', 'power': 1, 'desc': '+1 power, ignores security'},
    {'name': 'Mastermind', 'ability': 'plan', 'power': 0, 'desc': '+0 power, doubles gear bonuses'},
    {'name': 'Driver', 'ability': 'escape', 'power': 2, 'desc': '+2 power, +2 if you capture'},
    {'name': 'Forger', 'ability': 'forge', 'power': 1, 'desc': '+1 power, +1 per gear equipped'},
    {'name': 'Sneak', 'ability': 'stealth', 'power': 2, 'desc': '+2 power, opponent cannot see'},
    {'name': 'Safecracker', 'ability': 'crack', 'power': 1, 'desc': '+1 power, +3 if at vault'},
    {'name': 'Demolitions', 'ability': 'blast', 'power': 2, 'desc': '+2 power, destroys one enemy gear'},
]

# Gear cards
GEAR_CARDS = [
    {'name': 'Grapple Hook', 'bonus': 2, 'type': 'tool'},
    {'name': 'Smoke Bomb', 'bonus': 1, 'type': 'tool'},
    {'name': 'EMP Device', 'bonus': 3, 'type': 'tech'},
    {'name': 'Night Vision', 'bonus': 2, 'type': 'tech'},
    {'name': 'Lock Pick Set', 'bonus': 2, 'type': 'tool'},
    {'name': 'Disguise Kit', 'bonus': 1, 'type': 'outfit'},
    {'name': 'Body Armor', 'bonus': 2, 'type': 'outfit'},
    {'name': 'Comm Earpiece', 'bonus': 1, 'type': 'tech'},
    {'name': 'Stun Gun', 'bonus': 3, 'type': 'weapon'},
    {'name': 'Laptop', 'bonus': 2, 'type': 'tech'},
    {'name': 'Skeleton Key', 'bonus': 3, 'type': 'tool'},
    {'name': 'Flash Grenade', 'bonus': 2, 'type': 'weapon'},
]

# Location definitions
LOCATIONS = [
    {'name': 'The Bank', 'security': 5, 'vault': True, 'reward': 8},
    {'name': 'The Museum', 'security': 4, 'vault': False, 'reward': 6},
    {'name': 'The Casino', 'security': 3, 'vault': False, 'reward': 5},
    {'name': 'The Embassy', 'security': 6, 'vault': True, 'reward': 10},
    {'name': 'The Warehouse', 'security': 2, 'vault': False, 'reward': 4},
]


class CaperGame(BaseGame):
    name = "Caper"
    description = "Card drafting heist game with thieves and gear"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game (3 locations, 6 rounds)',
        'quick': 'Quick game (2 locations, 4 rounds)',
    }

    def setup(self):
        if self.variation == 'quick':
            self.num_locations = 2
            self.total_rounds = 4
        else:
            self.num_locations = 3
            self.total_rounds = 6

        # Select locations
        locs = random.sample(LOCATIONS, self.num_locations)
        self.locations = []
        for loc in locs:
            self.locations.append({
                'name': loc['name'],
                'security': loc['security'],
                'vault': loc['vault'],
                'reward': loc['reward'],
                'thieves': {'1': [], '2': []},  # Each thief: {name, ability, power, gear: []}
            })

        self.current_round = 1
        self.phase = 'draft_thief'  # draft_thief, place_thief, draft_gear, place_gear
        self.sub_phase_step = 0  # Track within a round

        # Create thief deck and gear deck
        self.thief_deck = list(THIEF_ABILITIES)
        random.shuffle(self.thief_deck)
        self.gear_deck = list(GEAR_CARDS)
        random.shuffle(self.gear_deck)

        # Hands: each player gets cards to draft from
        hand_size = 4
        self.hands = {
            '1': [self.thief_deck.pop() for _ in range(min(hand_size, len(self.thief_deck)))],
            '2': [self.thief_deck.pop() for _ in range(min(hand_size, len(self.thief_deck)))],
        }

        self.player_data = {
            '1': {'drafted_thief': None, 'drafted_gear': None, 'score': 0},
            '2': {'drafted_thief': None, 'drafted_gear': None, 'score': 0},
        }

        self.message = "Round 1: Draft a thief from your hand!"

    def display(self):
        clear_screen()
        p = str(self.current_player)
        print(f"{BOLD}=== CAPER - The Heist Game ==={RESET}")
        print(f"Round {self.current_round}/{self.total_rounds} | "
              f"{self.players[self.current_player - 1]}'s turn | Phase: {self.phase}")
        if self.message:
            print(f"{YELLOW}{self.message}{RESET}")
        print()

        # Display locations
        for i, loc in enumerate(self.locations):
            vault_str = f" {RED}[VAULT]{RESET}" if loc['vault'] else ""
            print(f"{BOLD}Location {i + 1}: {loc['name']}{RESET}{vault_str}")
            print(f"  Security: {'!' * loc['security']} ({loc['security']}) | Reward: {loc['reward']} pts")

            for pp in ['1', '2']:
                color = BLUE if pp == '1' else RED
                pname = self.players[int(pp) - 1]
                thieves = loc['thieves'][pp]
                if thieves:
                    print(f"  {color}{pname}:{RESET}")
                    for t in thieves:
                        gear_str = ""
                        if t['gear']:
                            gear_names = [g['name'] for g in t['gear']]
                            gear_str = f" [{', '.join(gear_names)}]"
                        print(f"    {t['name']} (pow:{t['power']}) {DIM}{t['desc']}{RESET}{gear_str}")
                else:
                    print(f"  {color}{pname}: (no thieves){RESET}")
            print()

        # Scores
        for pp in ['1', '2']:
            color = BLUE if pp == '1' else RED
            print(f"{color}{self.players[int(pp) - 1]} Score: {self.player_data[pp]['score']}{RESET}")
        print()

        # Show current hand
        if self.phase == 'draft_thief' and self.hands.get(p):
            print(f"{BOLD}Your hand (thieves):{RESET}")
            for i, card in enumerate(self.hands[p]):
                print(f"  {i + 1}. {card['name']} - Power:{card['power']} {DIM}{card['desc']}{RESET}")
        elif self.phase == 'draft_gear' and self.hands.get(p):
            print(f"{BOLD}Your hand (gear):{RESET}")
            for i, card in enumerate(self.hands[p]):
                print(f"  {i + 1}. {card['name']} - Bonus:+{card['bonus']} ({card['type']})")

        if self.phase == 'place_thief' and self.player_data[p]['drafted_thief']:
            t = self.player_data[p]['drafted_thief']
            print(f"\n{BOLD}Drafted thief to place:{RESET} {t['name']} (pow:{t['power']})")
        elif self.phase == 'place_gear' and self.player_data[p]['drafted_gear']:
            g = self.player_data[p]['drafted_gear']
            print(f"\n{BOLD}Drafted gear to place:{RESET} {g['name']} (+{g['bonus']})")

        print()

    def get_move(self):
        p = str(self.current_player)

        if self.phase == 'draft_thief':
            hand = self.hands.get(p, [])
            if not hand:
                return {'action': 'skip_draft'}
            print("Choose a thief to draft (enter number):")
            val = input_with_quit("  > ")
            try:
                idx = int(val.strip()) - 1
                return {'action': 'draft_thief', 'index': idx}
            except (ValueError, IndexError):
                return {'action': 'invalid'}

        if self.phase == 'place_thief':
            print(f"Place thief at which location? (1-{self.num_locations}):")
            val = input_with_quit("  > ")
            try:
                loc_idx = int(val.strip()) - 1
                return {'action': 'place_thief', 'location': loc_idx}
            except (ValueError, IndexError):
                return {'action': 'invalid'}

        if self.phase == 'draft_gear':
            hand = self.hands.get(p, [])
            if not hand:
                return {'action': 'skip_draft'}
            print("Choose a gear card to draft (enter number):")
            val = input_with_quit("  > ")
            try:
                idx = int(val.strip()) - 1
                return {'action': 'draft_gear', 'index': idx}
            except (ValueError, IndexError):
                return {'action': 'invalid'}

        if self.phase == 'place_gear':
            # List thieves with indices
            print("Equip gear to which thief? Enter as 'location,thief' (e.g. 1,1):")
            all_thieves = []
            for li, loc in enumerate(self.locations):
                for ti, thief in enumerate(loc['thieves'][p]):
                    all_thieves.append((li, ti, thief))
                    print(f"  Loc {li + 1}, Thief {ti + 1}: {thief['name']}"
                          f" (gear: {len(thief['gear'])})")
            if not all_thieves:
                print("  No thieves to equip! Gear is discarded.")
                return {'action': 'discard_gear'}
            val = input_with_quit("  > ")
            try:
                parts = val.strip().split(',')
                loc_idx = int(parts[0].strip()) - 1
                thief_idx = int(parts[1].strip()) - 1
                return {'action': 'place_gear', 'location': loc_idx, 'thief': thief_idx}
            except (ValueError, IndexError):
                return {'action': 'invalid'}

        return {'action': 'invalid'}

    def _swap_hands(self):
        """Swap hands between players (card drafting mechanic)."""
        self.hands['1'], self.hands['2'] = self.hands['2'], self.hands['1']

    def _deal_gear_hands(self):
        """Deal gear cards to both players."""
        hand_size = 3
        self.hands = {
            '1': [self.gear_deck.pop() for _ in range(min(hand_size, len(self.gear_deck)))],
            '2': [self.gear_deck.pop() for _ in range(min(hand_size, len(self.gear_deck)))],
        }

    def _advance_round(self):
        """Advance to next round or end game."""
        self.current_round += 1
        if self.current_round > self.total_rounds:
            self._score_game()
            return

        # Alternate between thief and gear rounds
        if self.current_round % 2 == 1:
            # Thief draft round
            self.phase = 'draft_thief'
            # Refill thief hands if needed
            hand_size = 4
            for pp in ['1', '2']:
                while len(self.hands.get(pp, [])) < hand_size and self.thief_deck:
                    if pp not in self.hands:
                        self.hands[pp] = []
                    self.hands[pp].append(self.thief_deck.pop())
            self.message = f"Round {self.current_round}: Draft a thief!"
        else:
            # Gear draft round
            self.phase = 'draft_gear'
            self._deal_gear_hands()
            self.message = f"Round {self.current_round}: Draft gear for your thieves!"

    def _calculate_power(self, p, loc_idx):
        """Calculate total power for a player at a location."""
        loc = self.locations[loc_idx]
        total = 0
        for thief in loc['thieves'][p]:
            t_power = thief['power']
            gear_bonus = sum(g['bonus'] for g in thief['gear'])

            # Apply abilities
            if thief['ability'] == 'mastermind':
                gear_bonus *= 2
            if thief['ability'] == 'forger':
                t_power += len(thief['gear'])
            if thief['ability'] == 'crack' and loc['vault']:
                t_power += 3
            if thief['ability'] == 'bypass':
                pass  # Handled in scoring

            total += t_power + gear_bonus
        return total

    def _score_game(self):
        """Score all locations and determine winner."""
        for li, loc in enumerate(self.locations):
            for pp in ['1', '2']:
                power = self._calculate_power(pp, li)
                opp = '2' if pp == '1' else '1'
                opp_power = self._calculate_power(opp, li)

                # Check if player captures location
                bypass_count = sum(1 for t in loc['thieves'][pp] if t['ability'] == 'bypass')
                effective_security = max(0, loc['security'] -
                                         sum(1 for t in loc['thieves'][pp]
                                             if t['ability'] == 'disable_security'))

                if bypass_count > 0:
                    effective_security = 0

                if power > effective_security and power > opp_power:
                    reward = loc['reward']
                    # Driver bonus
                    for t in loc['thieves'][pp]:
                        if t['ability'] == 'escape':
                            reward += 2
                    self.player_data[pp]['score'] += reward

        self.game_over = True
        s1 = self.player_data['1']['score']
        s2 = self.player_data['2']['score']
        if s1 > s2:
            self.winner = 1
        elif s2 > s1:
            self.winner = 2
        else:
            self.winner = None

    def make_move(self, move):
        if move['action'] == 'invalid':
            self.message = "Invalid input."
            return False

        p = str(self.current_player)

        if move['action'] == 'skip_draft':
            if self.phase == 'draft_thief':
                self.phase = 'draft_gear'
                self._deal_gear_hands()
                self.message = f"No thieves left. Gear phase!"
            elif self.phase == 'draft_gear':
                self._advance_round()
            return True

        if move['action'] == 'draft_thief':
            idx = move['index']
            hand = self.hands.get(p, [])
            if idx < 0 or idx >= len(hand):
                self.message = "Invalid card number."
                return False
            self.player_data[p]['drafted_thief'] = dict(hand[idx])
            self.player_data[p]['drafted_thief']['gear'] = []
            hand.pop(idx)
            self._swap_hands()
            self.phase = 'place_thief'
            self.message = f"Thief drafted! Place them at a location."
            return False  # Don't switch player, need to place

        if move['action'] == 'place_thief':
            loc_idx = move['location']
            if loc_idx < 0 or loc_idx >= self.num_locations:
                self.message = "Invalid location."
                return False
            thief = self.player_data[p]['drafted_thief']
            if not thief:
                self.message = "No thief to place."
                return False
            # Max 2 thieves per location per player
            if len(self.locations[loc_idx]['thieves'][p]) >= 2:
                self.message = "Max 2 thieves per location!"
                return False
            self.locations[loc_idx]['thieves'][p].append(thief)
            self.player_data[p]['drafted_thief'] = None
            self.phase = 'draft_thief'
            self.message = ""
            return True  # Switch player

        if move['action'] == 'draft_gear':
            idx = move['index']
            hand = self.hands.get(p, [])
            if idx < 0 or idx >= len(hand):
                self.message = "Invalid card number."
                return False
            self.player_data[p]['drafted_gear'] = dict(hand[idx])
            hand.pop(idx)
            self._swap_hands()
            self.phase = 'place_gear'
            self.message = "Gear drafted! Equip it to a thief."
            return False

        if move['action'] == 'place_gear':
            loc_idx = move['location']
            thief_idx = move['thief']
            if loc_idx < 0 or loc_idx >= self.num_locations:
                self.message = "Invalid location."
                return False
            thieves = self.locations[loc_idx]['thieves'][p]
            if thief_idx < 0 or thief_idx >= len(thieves):
                self.message = "Invalid thief."
                return False
            gear = self.player_data[p]['drafted_gear']
            if not gear:
                self.message = "No gear to place."
                return False
            # Max 3 gear per thief
            if len(thieves[thief_idx]['gear']) >= 3:
                self.message = "Max 3 gear per thief!"
                return False
            thieves[thief_idx]['gear'].append(gear)
            self.player_data[p]['drafted_gear'] = None
            self.phase = 'draft_gear'
            self.message = ""
            return True

        if move['action'] == 'discard_gear':
            self.player_data[p]['drafted_gear'] = None
            self.phase = 'draft_gear'
            self.message = "Gear discarded (no thieves to equip)."
            return True

        return False

    def check_game_over(self):
        # Check if we've exceeded total rounds
        if self.current_round > self.total_rounds:
            if not self.game_over:
                self._score_game()

    def get_state(self):
        return {
            'locations': self.locations,
            'current_round': self.current_round,
            'total_rounds': self.total_rounds,
            'num_locations': self.num_locations,
            'phase': self.phase,
            'sub_phase_step': self.sub_phase_step,
            'thief_deck': self.thief_deck,
            'gear_deck': self.gear_deck,
            'hands': self.hands,
            'player_data': self.player_data,
            'message': self.message,
        }

    def load_state(self, state):
        self.locations = state['locations']
        self.current_round = state['current_round']
        self.total_rounds = state['total_rounds']
        self.num_locations = state['num_locations']
        self.phase = state['phase']
        self.sub_phase_step = state['sub_phase_step']
        self.thief_deck = state['thief_deck']
        self.gear_deck = state['gear_deck']
        self.hands = state['hands']
        self.player_data = state['player_data']
        self.message = state['message']

    def get_tutorial(self):
        return f"""{BOLD}=== CAPER TUTORIAL ==={RESET}

Caper is a card-drafting heist game for 2 players.

{BOLD}OVERVIEW:{RESET}
  Compete to capture locations by deploying thieves and equipping them
  with gear. The player with the most points wins.

{BOLD}ROUND STRUCTURE:{RESET}
  Odd rounds: Draft and place THIEVES
  Even rounds: Draft and equip GEAR

{BOLD}DRAFTING:{RESET}
  Each player starts with a hand of cards. Pick one card, then
  swap hands with your opponent. This continues until hands are empty.

{BOLD}THIEVES:{RESET}
  Each thief has a power value and special ability:
  - Lockpick: Can steal opponent's gear
  - Hacker: Reduces location security by 1
  - Muscle: Pure power (+3)
  - Acrobat: Ignores security entirely
  - Mastermind: Doubles all gear bonuses
  - Driver: +2 bonus if you capture the location
  - Forger: +1 per gear equipped
  - Safecracker: +3 at vault locations
  Max 2 thieves per location per player.

{BOLD}GEAR:{RESET}
  Equip gear to your thieves for bonus power.
  Max 3 gear per thief. Types: tool, tech, outfit, weapon.

{BOLD}SCORING:{RESET}
  At game end, each location is scored:
  - Your total power must exceed the security level
  - Your power must exceed your opponent's power
  - If both conditions met, you capture the location's reward points
  Highest total score wins!

{BOLD}COMMANDS:{RESET}
  'q' = Quit  's' = Save  'h' = Help  't' = Tutorial
"""
