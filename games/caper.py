"""Caper - Card drafting heist game."""

import random
import copy
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
WHITE = '\033[97m'

# Thief abilities
THIEF_ABILITIES = {
    'Lockpick': 'Adds +2 to location capture',
    'Hacker': 'Steals 1 gear from opponent at same location',
    'Muscle': 'Adds +3 to location capture',
    'Lookout': 'Draws 1 extra card next round',
    'Driver': 'Can move to another location after placement',
    'Mastermind': 'All gear at this location worth +1',
    'Cat Burglar': 'Ignores 2 security at location',
    'Insider': 'Reduces location security by 2',
    'Safecracker': 'Worth 3 bonus points if location captured',
    'Fixer': 'Adjacent locations get +1 capture bonus',
}

# Gear types and bonuses
GEAR_TYPES = {
    'Grappling Hook': {'capture': 1, 'points': 1},
    'Smoke Bomb': {'capture': 2, 'points': 0},
    'Disguise Kit': {'capture': 0, 'points': 3},
    'Laptop': {'capture': 1, 'points': 2},
    'Explosives': {'capture': 3, 'points': 0},
    'Night Vision': {'capture': 1, 'points': 1},
    'Lockpick Set': {'capture': 2, 'points': 1},
    'Getaway Car': {'capture': 0, 'points': 4},
    'Blueprint': {'capture': 2, 'points': 2},
    'Silencer': {'capture': 1, 'points': 1},
    'EMP Device': {'capture': 3, 'points': 1},
    'Forged ID': {'capture': 0, 'points': 2},
}


def _make_thief_deck():
    """Create the thief card deck."""
    deck = []
    for name, ability in THIEF_ABILITIES.items():
        # Each thief has a power value (for capture)
        power = random.randint(1, 3)
        deck.append({
            'name': name,
            'type': 'thief',
            'power': power,
            'ability': ability,
        })
    # Duplicate some for variety
    extras = random.sample(list(THIEF_ABILITIES.keys()), 5)
    for name in extras:
        deck.append({
            'name': name,
            'type': 'thief',
            'power': random.randint(1, 3),
            'ability': THIEF_ABILITIES[name],
        })
    random.shuffle(deck)
    return deck


def _make_gear_deck():
    """Create the gear card deck."""
    deck = []
    for name, stats in GEAR_TYPES.items():
        deck.append({
            'name': name,
            'type': 'gear',
            'capture': stats['capture'],
            'points': stats['points'],
        })
    # Duplicates
    extras = random.sample(list(GEAR_TYPES.keys()), 6)
    for name in extras:
        stats = GEAR_TYPES[name]
        deck.append({
            'name': name,
            'type': 'gear',
            'capture': stats['capture'],
            'points': stats['points'],
        })
    random.shuffle(deck)
    return deck


def _make_locations(count):
    """Create location cards."""
    all_locations = [
        {'name': 'Museum', 'security': 5, 'reward': 8},
        {'name': 'Bank Vault', 'security': 7, 'reward': 12},
        {'name': 'Casino', 'security': 4, 'reward': 6},
        {'name': 'Jewelry Store', 'security': 3, 'reward': 5},
        {'name': 'Tech Lab', 'security': 6, 'reward': 10},
    ]
    random.shuffle(all_locations)
    return all_locations[:count]


class CaperGame(BaseGame):
    name = "Caper"
    description = "Card drafting heist game with thieves and gear"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game: 3 locations, 6 rounds',
        'quick': 'Quick game: 2 locations, 4 rounds',
    }

    def setup(self):
        """Initialize the game."""
        if self.variation == 'quick':
            self.num_locations = 2
            self.max_rounds = 4
        else:
            self.num_locations = 3
            self.max_rounds = 6

        self.locations = _make_locations(self.num_locations)
        self.thief_deck = _make_thief_deck()
        self.gear_deck = _make_gear_deck()

        self.round_num = 1
        self.phase = 'thief'  # 'thief' or 'gear', alternates each round

        # Player state
        self.player_data = {}
        for p in [1, 2]:
            loc_state = {}
            for i in range(self.num_locations):
                loc_state[str(i)] = {
                    'thieves': [],
                    'gear': [],
                }
            self.player_data[str(p)] = {
                'hand': [],
                'locations': loc_state,
                'score': 0,
                'bonus_cards': 0,
            }

        # Deal initial hands
        self._deal_hands()
        self.message = "Round 1: Draft thief cards!"
        self.draft_step = 0  # track picks within a round
        self.pending_picks = {}  # simultaneous draft: both pick, then swap

    def _deal_hands(self):
        """Deal cards to players based on current phase."""
        hand_size = 4
        deck = self.thief_deck if self.phase == 'thief' else self.gear_deck
        for p in [1, 2]:
            hand = []
            for _ in range(hand_size):
                if deck:
                    hand.append(deck.pop())
            self.player_data[str(p)]['hand'] = hand

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        pd = self.player_data[str(p)]
        color = BLUE if p == 1 else RED

        print(f"{BOLD}{'=' * 65}")
        print(f"  CAPER - Round {self.round_num}/{self.max_rounds} "
              f"({self.phase.upper()} Phase) - {self.players[p - 1]}'s Pick")
        print(f"{'=' * 65}{RESET}")

        # Locations
        print(f"\n  {BOLD}LOCATIONS:{RESET}")
        for i, loc in enumerate(self.locations):
            sec_color = RED if loc['security'] > 5 else YELLOW if loc['security'] > 3 else GREEN
            print(f"\n  [{i + 1}] {BOLD}{loc['name']}{RESET} "
                  f"(Security: {sec_color}{loc['security']}{RESET}, "
                  f"Reward: {YELLOW}{loc['reward']}{RESET} pts)")

            for pp in [1, 2]:
                pcolor = BLUE if pp == 1 else RED
                pdata = self.player_data[str(pp)]['locations'][str(i)]
                thieves_str = ', '.join(
                    f"{t['name']}({t['power']})" for t in pdata['thieves']
                ) or 'none'
                gear_str = ', '.join(
                    f"{g['name']}" for g in pdata['gear']
                ) or 'none'
                total_power = sum(t['power'] for t in pdata['thieves'])
                total_capture = total_power + sum(g['capture'] for g in pdata['gear'])
                print(f"      {pcolor}P{pp}{RESET}: Thieves=[{thieves_str}] "
                      f"Gear=[{gear_str}] Capture={total_capture}")

        # Score summary
        print(f"\n  {BOLD}SCORES:{RESET}  "
              f"{BLUE}P1: {self.player_data['1']['score']}{RESET}  |  "
              f"{RED}P2: {self.player_data['2']['score']}{RESET}")

        # Current hand
        print(f"\n  {color}Your Hand ({self.phase} cards):{RESET}")
        for i, card in enumerate(pd['hand']):
            if card['type'] == 'thief':
                print(f"    [{i + 1}] {BOLD}{card['name']}{RESET} "
                      f"(Power: {card['power']}) - {DIM}{card['ability']}{RESET}")
            else:
                print(f"    [{i + 1}] {BOLD}{card['name']}{RESET} "
                      f"(Capture: +{card['capture']}, Points: {card['points']})")

        if self.message:
            print(f"\n  {YELLOW}>> {self.message}{RESET}")

    def get_move(self):
        """Get a move from the current player."""
        pd = self.player_data[str(self.current_player)]

        if not pd['hand']:
            return ('no_cards',)

        card_idx = input_with_quit(f"\n  Pick a card (1-{len(pd['hand'])}): ").strip()
        if self.phase == 'thief':
            loc_idx = input_with_quit(
                f"  Place at which location? (1-{self.num_locations}): ").strip()
            return ('draft_thief', card_idx, loc_idx)
        else:
            loc_idx = input_with_quit(
                f"  Equip to which location? (1-{self.num_locations}): ").strip()
            return ('draft_gear', card_idx, loc_idx)

    def make_move(self, move):
        """Apply a move to the game state."""
        pd = self.player_data[str(self.current_player)]

        if move[0] == 'no_cards':
            # End of draft round
            self._end_draft_round()
            return True

        if move[0] in ('draft_thief', 'draft_gear'):
            try:
                cidx = int(move[1]) - 1
                lidx = int(move[2]) - 1
            except (ValueError, IndexError):
                self.message = "Invalid input. Enter card number and location number."
                return False

            if cidx < 0 or cidx >= len(pd['hand']):
                self.message = "Invalid card number."
                return False
            if lidx < 0 or lidx >= self.num_locations:
                self.message = "Invalid location number."
                return False

            card = pd['hand'].pop(cidx)
            loc = pd['locations'][str(lidx)]

            if card['type'] == 'thief':
                # Max 2 thieves per location
                if len(loc['thieves']) >= 2:
                    pd['hand'].insert(cidx, card)
                    self.message = "Max 2 thieves per location!"
                    return False
                loc['thieves'].append(card)
                self.message = f"Placed {card['name']} at {self.locations[lidx]['name']}."
            else:
                # Gear: must have a thief at location
                if not loc['thieves']:
                    pd['hand'].insert(cidx, card)
                    self.message = "Need a thief at this location first!"
                    return False
                # Max 3 gear per location
                if len(loc['gear']) >= 3:
                    pd['hand'].insert(cidx, card)
                    self.message = "Max 3 gear per location!"
                    return False
                loc['gear'].append(card)
                self.message = f"Equipped {card['name']} at {self.locations[lidx]['name']}."

            # After both players have picked, swap remaining hands (drafting)
            self.draft_step += 1

            # Check if both players have picked this step
            if self.draft_step % 2 == 0:
                # Swap hands between players
                h1 = self.player_data['1']['hand']
                h2 = self.player_data['2']['hand']
                self.player_data['1']['hand'] = h2
                self.player_data['2']['hand'] = h1

                if not self.player_data['1']['hand'] and not self.player_data['2']['hand']:
                    self._end_draft_round()

            return True

        self.message = "Unknown action."
        return False

    def _end_draft_round(self):
        """Process end of a draft round."""
        self.round_num += 1
        self.draft_step = 0

        if self.round_num > self.max_rounds:
            self._final_scoring()
            return

        # Alternate phase
        if self.phase == 'thief':
            self.phase = 'gear'
        else:
            self.phase = 'thief'

        self._deal_hands()
        self.message = f"Round {self.round_num}: Draft {self.phase} cards!"

    def _final_scoring(self):
        """Calculate final scores."""
        for p in [1, 2]:
            pd = self.player_data[str(p)]
            total = 0
            for i in range(self.num_locations):
                loc = self.locations[i]
                my_data = pd['locations'][str(i)]
                opp = '2' if p == 1 else '1'
                opp_data = self.player_data[opp]['locations'][str(i)]

                # Calculate capture power
                my_power = sum(t['power'] for t in my_data['thieves'])
                my_capture = my_power + sum(g['capture'] for g in my_data['gear'])

                # Apply thief abilities
                for t in my_data['thieves']:
                    if t['name'] == 'Cat Burglar':
                        my_capture += 2  # ignores 2 security effectively
                    elif t['name'] == 'Insider':
                        my_capture += 2
                    elif t['name'] == 'Mastermind':
                        for g in my_data['gear']:
                            my_capture += 1

                opp_power = sum(t['power'] for t in opp_data['thieves'])
                opp_capture = opp_power + sum(g['capture'] for g in opp_data['gear'])

                for t in opp_data['thieves']:
                    if t['name'] == 'Cat Burglar':
                        opp_capture += 2
                    elif t['name'] == 'Insider':
                        opp_capture += 2
                    elif t['name'] == 'Mastermind':
                        for g in opp_data['gear']:
                            opp_capture += 1

                # Location capture: higher capture wins if >= security
                if my_capture >= loc['security'] and my_capture > opp_capture:
                    total += loc['reward']
                    # Safecracker bonus
                    for t in my_data['thieves']:
                        if t['name'] == 'Safecracker':
                            total += 3

                # Gear points
                for g in my_data['gear']:
                    total += g['points']

            pd['score'] = total

    def check_game_over(self):
        """Check if the game is over."""
        if self.round_num > self.max_rounds:
            self.game_over = True
            s1 = self.player_data['1']['score']
            s2 = self.player_data['2']['score']
            if s1 > s2:
                self.winner = 1
            elif s2 > s1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        """Return serializable game state."""
        return {
            'locations': self.locations,
            'thief_deck': self.thief_deck,
            'gear_deck': self.gear_deck,
            'round_num': self.round_num,
            'phase': self.phase,
            'num_locations': self.num_locations,
            'max_rounds': self.max_rounds,
            'player_data': self.player_data,
            'message': self.message,
            'draft_step': self.draft_step,
        }

    def load_state(self, state):
        """Restore game state."""
        self.locations = state['locations']
        self.thief_deck = state['thief_deck']
        self.gear_deck = state['gear_deck']
        self.round_num = state['round_num']
        self.phase = state['phase']
        self.num_locations = state['num_locations']
        self.max_rounds = state['max_rounds']
        self.player_data = state['player_data']
        self.message = state['message']
        self.draft_step = state['draft_step']

    def get_tutorial(self):
        return f"""{BOLD}=== CAPER TUTORIAL ==={RESET}

Caper is a card-drafting heist game for 2 players.

{BOLD}OBJECTIVE:{RESET}
  Score the most points by deploying thieves and gear to capture locations.

{BOLD}GAME STRUCTURE:{RESET}
  The game alternates between THIEF and GEAR drafting phases.
  Each round, you draft cards from a hand and pass the rest to your opponent.

{BOLD}THIEF PHASE:{RESET}
  Pick a thief card and place at a location (max 2 thieves per location).
  Thieves have Power values that help capture locations.
  Each thief has a special ability.

{BOLD}GEAR PHASE:{RESET}
  Pick a gear card and equip it at a location (must have a thief there).
  Gear adds Capture bonuses and/or direct Points.

{BOLD}CAPTURING LOCATIONS:{RESET}
  At game end, for each location:
  - Your total Capture = thief Power + gear Capture bonuses + abilities
  - If your Capture >= location Security AND > opponent's Capture, you win it
  - Winning awards the location's Reward points

{BOLD}SCORING:{RESET}
  Location rewards + gear point bonuses + thief ability bonuses.
  Highest total score wins!

{BOLD}CONTROLS:{RESET}
  Type 'q' to quit, 's' to save, 'h' for help, 't' for tutorial.
"""
