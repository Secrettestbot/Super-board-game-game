"""Undaunted - Deck-building tactical combat game."""

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

# Unit types with their stats
UNIT_TYPES = {
    'Rifleman': {
        'attack': 2,
        'defense': 1,
        'movement': 2,
        'range': 2,
        'ability': 'Standard combat unit',
        'symbol': 'R',
    },
    'Scout': {
        'attack': 1,
        'defense': 1,
        'movement': 3,
        'range': 1,
        'ability': 'Recon: reveals fog of war, draws 1 card',
        'symbol': 'S',
    },
    'Sniper': {
        'attack': 4,
        'defense': 0,
        'movement': 1,
        'range': 4,
        'ability': 'Long range attack, ignores cover',
        'symbol': 'N',
    },
    'Machine Gunner': {
        'attack': 3,
        'defense': 2,
        'movement': 1,
        'range': 2,
        'ability': 'Suppression: targeted unit cannot act next turn',
        'symbol': 'M',
    },
    'Squad Leader': {
        'attack': 1,
        'defense': 1,
        'movement': 2,
        'range': 1,
        'ability': 'Command: play another card from hand',
        'symbol': 'L',
    },
    'Mortar': {
        'attack': 3,
        'defense': 0,
        'movement': 0,
        'range': 3,
        'ability': 'Area attack: hits all enemies in target cell',
        'symbol': 'T',
    },
    'Medic': {
        'attack': 0,
        'defense': 1,
        'movement': 2,
        'range': 0,
        'ability': 'Recover: return 1 card from casualties to discard',
        'symbol': 'E',
    },
    'Platoon Sergeant': {
        'attack': 1,
        'defense': 2,
        'movement': 2,
        'range': 1,
        'ability': 'Inspire: all friendly units in cell get +1 attack this turn',
        'symbol': 'P',
    },
}

# Objective markers
OBJECTIVE = 'O'
COVER = '+'
OPEN = '.'


def _build_deck(grid_size):
    """Build a starting deck for a player."""
    if grid_size == 3:
        # Skirmish: 20 cards
        deck = []
        composition = {
            'Rifleman': 6,
            'Scout': 4,
            'Sniper': 2,
            'Machine Gunner': 2,
            'Squad Leader': 2,
            'Mortar': 1,
            'Medic': 2,
            'Platoon Sergeant': 1,
        }
    else:
        # Standard: 30 cards
        deck = []
        composition = {
            'Rifleman': 8,
            'Scout': 5,
            'Sniper': 3,
            'Machine Gunner': 3,
            'Squad Leader': 3,
            'Mortar': 2,
            'Medic': 3,
            'Platoon Sergeant': 3,
        }

    for unit_type, count in composition.items():
        stats = UNIT_TYPES[unit_type]
        for i in range(count):
            deck.append({
                'name': unit_type,
                'id': f"{unit_type}_{i}",
                'attack': stats['attack'],
                'defense': stats['defense'],
                'movement': stats['movement'],
                'range': stats['range'],
                'symbol': stats['symbol'],
            })
    random.shuffle(deck)
    return deck


def _build_grid(grid_size):
    """Build the tactical grid."""
    grid = {}
    for r in range(grid_size):
        for c in range(grid_size):
            # Randomize terrain
            if random.random() < 0.3:
                terrain = COVER
            else:
                terrain = OPEN
            grid[f"{r},{c}"] = {
                'terrain': terrain,
                'objective': False,
                'units': {},  # player_id -> list of unit symbols
            }

    # Place objectives
    if grid_size == 4:
        objectives = [(0, 1), (1, 3), (2, 0), (3, 2), (1, 1)]
    else:
        objectives = [(0, 1), (1, 2), (2, 0)]

    for r, c in objectives:
        grid[f"{r},{c}"]['objective'] = True

    return grid, objectives


class UndauntedGame(BaseGame):
    name = "Undaunted"
    description = "Deck-building tactical combat on a grid"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard: 4x4 grid, 30-card decks',
        'skirmish': 'Skirmish: 3x3 grid, 20-card decks',
    }

    def setup(self):
        """Initialize the game."""
        if self.variation == 'skirmish':
            self.grid_size = 3
        else:
            self.grid_size = 4

        self.grid, self.objective_positions = _build_grid(self.grid_size)

        # Player state
        self.player_data = {}
        for p in [1, 2]:
            deck = _build_deck(self.grid_size)
            hand = deck[:4]
            draw_pile = deck[4:]

            self.player_data[str(p)] = {
                'draw_pile': draw_pile,
                'hand': hand,
                'discard': [],
                'casualties': [],
                'objectives_controlled': 0,
            }

        # Place starting units on the grid
        # P1 starts bottom, P2 starts top
        for p in [1, 2]:
            if p == 1:
                start_r = self.grid_size - 1
            else:
                start_r = 0
            for c in range(min(2, self.grid_size)):
                key = f"{start_r},{c}"
                if str(p) not in self.grid[key]['units']:
                    self.grid[key]['units'][str(p)] = []
                self.grid[key]['units'][str(p)].append('R')  # Start with riflemen

        self.objective_control = {}  # "r,c" -> player who controls
        self.suppressed = {}  # "r,c" -> {player: True} if units suppressed

        self.message = "Battle begins! Play cards to command your units."
        self.phase = 'play_card'  # 'play_card'

    def _draw_cards(self, player, count):
        """Draw cards for a player, reshuffling discard if needed."""
        pd = self.player_data[str(player)]
        for _ in range(count):
            if not pd['draw_pile']:
                if pd['discard']:
                    pd['draw_pile'] = pd['discard']
                    pd['discard'] = []
                    random.shuffle(pd['draw_pile'])
                else:
                    break
            if pd['draw_pile']:
                pd['hand'].append(pd['draw_pile'].pop())

    def display(self):
        """Display the current game state."""
        clear_screen()
        p = self.current_player
        pd = self.player_data[str(p)]
        color = BLUE if p == 1 else RED

        print(f"{BOLD}{'=' * 60}")
        print(f"  UNDAUNTED - {self.players[p - 1]}'s Turn (Turn {self.turn_number + 1})")
        print(f"{'=' * 60}{RESET}")

        # Grid
        print(f"\n  {BOLD}Battlefield ({self.grid_size}x{self.grid_size}):{RESET}")
        print(f"     {''.join(f'{c:6d}' for c in range(self.grid_size))}")
        print(f"    +{'------' * self.grid_size}+")

        for r in range(self.grid_size):
            # Top line: terrain and objective
            line1 = f"  {r} |"
            for c in range(self.grid_size):
                key = f"{r},{c}"
                cell = self.grid[key]
                terr = cell['terrain']
                obj = cell['objective']
                ctrl = self.objective_control.get(key)
                if obj:
                    if ctrl == 1:
                        marker = f"{BLUE}[O]{RESET}"
                    elif ctrl == 2:
                        marker = f"{RED}[O]{RESET}"
                    else:
                        marker = f"{YELLOW}[O]{RESET}"
                else:
                    marker = f" {terr} "
                line1 += f" {marker}  |"
            print(line1)

            # Bottom line: units
            line2 = f"    |"
            for c in range(self.grid_size):
                key = f"{r},{c}"
                cell = self.grid[key]
                units_str = ""
                for pp in [1, 2]:
                    ulist = cell['units'].get(str(pp), [])
                    if ulist:
                        pc = BLUE if pp == 1 else RED
                        units_str += f"{pc}{''.join(ulist[:3])}{RESET}"
                if not units_str:
                    units_str = "     "
                else:
                    # Pad
                    raw_len = sum(len(cell['units'].get(str(pp), [])) for pp in [1, 2])
                    units_str += " " * max(0, 5 - raw_len)
                line2 += f"{units_str}|"
            print(line2)
            print(f"    +{'------' * self.grid_size}+")

        # Legend
        print(f"\n  {YELLOW}[O]{RESET}=Objective  {DIM}+{RESET}=Cover  {DIM}.{RESET}=Open")
        print(f"  R=Rifleman S=Scout N=Sniper M=MG L=Leader T=Mortar E=Medic P=Sgt")

        # Control status
        p1_obj = self.player_data['1']['objectives_controlled']
        p2_obj = self.player_data['2']['objectives_controlled']
        total_obj = len(self.objective_positions)
        print(f"\n  Objectives: {BLUE}P1={p1_obj}{RESET} / {RED}P2={p2_obj}{RESET} "
              f"(need {total_obj // 2 + 1} to win)")

        # Player info
        print(f"\n  {color}{self.players[p - 1]}:{RESET}")
        print(f"  Deck: {len(pd['draw_pile'])} | Discard: {len(pd['discard'])} "
              f"| Casualties: {len(pd['casualties'])}")

        # Hand
        print(f"\n  {BOLD}Hand:{RESET}")
        for i, card in enumerate(pd['hand']):
            print(f"    [{i + 1}] {card['name']} "
                  f"(ATK:{card['attack']} DEF:{card['defense']} "
                  f"MOV:{card['movement']} RNG:{card['range']})")

        if self.message:
            print(f"\n  {YELLOW}>> {self.message}{RESET}")

    def get_move(self):
        """Get a move from the current player."""
        pd = self.player_data[str(self.current_player)]

        if not pd['hand']:
            print("\n  No cards in hand! Turn ends.")
            return ('end_turn',)

        print(f"\n  Actions: [p]lay card, [e]nd turn")
        action = input_with_quit("  Choice: ").strip().lower()

        if action == 'e':
            return ('end_turn',)
        elif action == 'p':
            cidx = input_with_quit(f"  Card number (1-{len(pd['hand'])}): ").strip()
            print(f"  Use card for: [a]ttack, [m]ove, [c]ontrol objective, [s]pecial ability")
            use = input_with_quit("  Action: ").strip().lower()

            if use == 'a':
                target = input_with_quit("  Target cell (row,col): ").strip()
                return ('attack', cidx, target)
            elif use == 'm':
                from_cell = input_with_quit("  Move unit from (row,col): ").strip()
                to_cell = input_with_quit("  Move unit to (row,col): ").strip()
                return ('move', cidx, from_cell, to_cell)
            elif use == 'c':
                target = input_with_quit("  Control objective at (row,col): ").strip()
                return ('control', cidx, target)
            elif use == 's':
                return ('special', cidx)
            else:
                return ('invalid',)
        else:
            return ('invalid',)

    def _find_unit_cell(self, player, unit_symbol):
        """Find which cell a unit type is in for a player."""
        for key, cell in self.grid.items():
            ulist = cell['units'].get(str(player), [])
            if unit_symbol in ulist:
                return key
        return None

    def make_move(self, move):
        """Apply a move to the game state."""
        pd = self.player_data[str(self.current_player)]
        opp = 2 if self.current_player == 1 else 1

        if move[0] == 'invalid':
            self.message = "Invalid command."
            return False

        if move[0] == 'end_turn':
            # Discard remaining hand, draw new hand
            pd['discard'].extend(pd['hand'])
            pd['hand'] = []
            self._draw_cards(self.current_player, 4)
            self.message = "Turn ended. Drew new hand."
            return True

        if move[0] == 'attack':
            try:
                cidx = int(move[1]) - 1
                parts = move[2].replace(' ', '').split(',')
                tr, tc = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                self.message = "Invalid input."
                return False

            if cidx < 0 or cidx >= len(pd['hand']):
                self.message = "Invalid card number."
                return False

            card = pd['hand'][cidx]
            target_key = f"{tr},{tc}"

            if target_key not in self.grid:
                self.message = "Invalid cell."
                return False

            target_cell = self.grid[target_key]
            enemy_units = target_cell['units'].get(str(opp), [])

            if not enemy_units:
                self.message = "No enemy units in target cell!"
                return False

            # Check range: find attacker's position
            attacker_pos = self._find_unit_cell(self.current_player, card['symbol'])
            if not attacker_pos:
                self.message = f"No {card['name']} on the field to attack with!"
                return False

            ar, ac = map(int, attacker_pos.split(','))
            dist = abs(ar - tr) + abs(ac - tc)
            if dist > card['range']:
                self.message = f"Target out of range! (range={card['range']}, distance={dist})"
                return False

            # Attack resolution
            attack_power = card['attack']
            # Cover bonus for defender
            if target_cell['terrain'] == COVER:
                defense = 1
            else:
                defense = 0

            # Check suppression
            supp_key = f"{self.current_player},{attacker_pos}"
            if supp_key in self.suppressed:
                self.message = "This unit is suppressed and cannot act!"
                return False

            # Sniper ignores cover
            if card['name'] == 'Sniper':
                defense = 0

            hit = attack_power > defense + random.randint(0, 1)

            # Remove played card
            pd['hand'].pop(cidx)
            pd['discard'].append(card)

            if hit:
                # Remove an enemy unit from the field
                killed_symbol = enemy_units.pop(0)
                if not enemy_units:
                    target_cell['units'][str(opp)] = []

                # Remove matching card from opponent's deck (casualties)
                opp_data = self.player_data[str(opp)]
                casualty_card = None
                # Check draw pile first
                for i, c in enumerate(opp_data['draw_pile']):
                    if c['symbol'] == killed_symbol:
                        casualty_card = opp_data['draw_pile'].pop(i)
                        break
                if not casualty_card:
                    for i, c in enumerate(opp_data['discard']):
                        if c['symbol'] == killed_symbol:
                            casualty_card = opp_data['discard'].pop(i)
                            break
                if casualty_card:
                    opp_data['casualties'].append(casualty_card)

                # Suppression for Machine Gunner
                if card['name'] == 'Machine Gunner' and enemy_units:
                    self.suppressed[f"{opp},{target_key}"] = True

                self.message = f"{card['name']} hit! Enemy unit eliminated at ({tr},{tc})!"
            else:
                # Suppression for Machine Gunner even on miss
                if card['name'] == 'Machine Gunner':
                    self.suppressed[f"{opp},{target_key}"] = True
                    self.message = f"{card['name']} missed but suppressed enemies at ({tr},{tc})!"
                else:
                    self.message = f"{card['name']} missed!"

            return True

        if move[0] == 'move':
            try:
                cidx = int(move[1]) - 1
                fparts = move[2].replace(' ', '').split(',')
                fr, fc = int(fparts[0]), int(fparts[1])
                tparts = move[3].replace(' ', '').split(',')
                tr, tc = int(tparts[0]), int(tparts[1])
            except (ValueError, IndexError):
                self.message = "Invalid input."
                return False

            if cidx < 0 or cidx >= len(pd['hand']):
                self.message = "Invalid card number."
                return False

            card = pd['hand'][cidx]
            from_key = f"{fr},{fc}"
            to_key = f"{tr},{tc}"

            if from_key not in self.grid or to_key not in self.grid:
                self.message = "Invalid cell."
                return False

            from_cell = self.grid[from_key]
            my_units = from_cell['units'].get(str(self.current_player), [])

            if card['symbol'] not in my_units:
                self.message = f"No {card['name']} in cell ({fr},{fc})!"
                return False

            dist = abs(fr - tr) + abs(fc - tc)
            if dist > card['movement']:
                self.message = f"Too far! Movement={card['movement']}, distance={dist}"
                return False

            # Check suppression
            supp_key = f"{self.current_player},{from_key}"
            if supp_key in self.suppressed:
                self.message = "This unit is suppressed and cannot move!"
                return False

            # Move the unit
            my_units.remove(card['symbol'])
            if not my_units:
                from_cell['units'][str(self.current_player)] = []
            to_cell = self.grid[to_key]
            if str(self.current_player) not in to_cell['units']:
                to_cell['units'][str(self.current_player)] = []
            to_cell['units'][str(self.current_player)].append(card['symbol'])

            # Discard card
            pd['hand'].pop(cidx)
            pd['discard'].append(card)

            # Scout ability: draw a card
            if card['name'] == 'Scout':
                self._draw_cards(self.current_player, 1)
                self.message = f"Scout moved to ({tr},{tc}) and drew a card!"
            else:
                self.message = f"{card['name']} moved to ({tr},{tc})."

            return True

        if move[0] == 'control':
            try:
                cidx = int(move[1]) - 1
                parts = move[2].replace(' ', '').split(',')
                tr, tc = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                self.message = "Invalid input."
                return False

            if cidx < 0 or cidx >= len(pd['hand']):
                self.message = "Invalid card number."
                return False

            target_key = f"{tr},{tc}"
            if target_key not in self.grid:
                self.message = "Invalid cell."
                return False

            cell = self.grid[target_key]
            if not cell['objective']:
                self.message = "No objective at that location!"
                return False

            my_units = cell['units'].get(str(self.current_player), [])
            enemy_units = cell['units'].get(str(opp), [])

            if not my_units:
                self.message = "Need a unit at the objective to control it!"
                return False
            if enemy_units:
                self.message = "Cannot control while enemy units present!"
                return False

            # Check if already controlled
            prev_controller = self.objective_control.get(target_key)
            if prev_controller == self.current_player:
                self.message = "You already control this objective!"
                return False

            card = pd['hand'].pop(cidx)
            pd['discard'].append(card)

            if prev_controller:
                self.player_data[str(prev_controller)]['objectives_controlled'] -= 1
            self.objective_control[target_key] = self.current_player
            pd['objectives_controlled'] += 1

            self.message = f"Captured objective at ({tr},{tc})!"
            return True

        if move[0] == 'special':
            try:
                cidx = int(move[1]) - 1
            except (ValueError, IndexError):
                self.message = "Invalid input."
                return False

            if cidx < 0 or cidx >= len(pd['hand']):
                self.message = "Invalid card number."
                return False

            card = pd['hand'][cidx]

            if card['name'] == 'Squad Leader':
                # Draw a card
                pd['hand'].pop(cidx)
                pd['discard'].append(card)
                self._draw_cards(self.current_player, 1)
                self.message = "Squad Leader: Drew an extra card!"
                return True

            elif card['name'] == 'Medic':
                # Recover a card from casualties
                if not pd['casualties']:
                    self.message = "No casualties to recover!"
                    return False
                pd['hand'].pop(cidx)
                pd['discard'].append(card)
                recovered = pd['casualties'].pop(0)
                pd['discard'].append(recovered)
                self.message = f"Medic recovered {recovered['name']} from casualties!"
                return True

            elif card['name'] == 'Platoon Sergeant':
                # Inspire: boost attack of all friendly in same cell
                pos = self._find_unit_cell(self.current_player, card['symbol'])
                if pos:
                    pd['hand'].pop(cidx)
                    pd['discard'].append(card)
                    self.message = f"Platoon Sergeant inspires! +1 attack to all at ({pos})."
                    return True
                else:
                    self.message = "No Platoon Sergeant on the field!"
                    return False

            elif card['name'] == 'Mortar':
                # Area attack
                pd['hand'].pop(cidx)
                pd['discard'].append(card)
                pos = self._find_unit_cell(self.current_player, card['symbol'])
                if pos:
                    target = input_with_quit("  Mortar target cell (row,col): ").strip()
                    try:
                        parts = target.replace(' ', '').split(',')
                        tr, tc = int(parts[0]), int(parts[1])
                    except (ValueError, IndexError):
                        self.message = "Invalid target."
                        return True  # Card already used
                    ar, ac = map(int, pos.split(','))
                    dist = abs(ar - tr) + abs(ac - tc)
                    if dist <= card['range']:
                        tkey = f"{tr},{tc}"
                        if tkey in self.grid:
                            enemies = self.grid[tkey]['units'].get(str(opp), [])
                            if enemies:
                                killed = enemies.pop(0)
                                # Casualty
                                opp_data = self.player_data[str(opp)]
                                for i, c in enumerate(opp_data['draw_pile']):
                                    if c['symbol'] == killed:
                                        opp_data['casualties'].append(opp_data['draw_pile'].pop(i))
                                        break
                                self.message = f"Mortar strike! Hit at ({tr},{tc})!"
                            else:
                                self.message = "Mortar strike missed - no enemies there."
                        else:
                            self.message = "Invalid target cell."
                    else:
                        self.message = "Target out of mortar range!"
                else:
                    self.message = "No mortar on the field!"
                return True

            else:
                pd['hand'].pop(cidx)
                pd['discard'].append(card)
                self.message = f"{card['name']} used special ability: {UNIT_TYPES[card['name']]['ability']}"
                return True

        self.message = "Unknown action."
        return False

    def check_game_over(self):
        """Check if the game is over."""
        # Clear suppression at start of checking (after full round)
        if self.current_player == 1:
            # Clear P1's suppression (it was set last turn by P2)
            keys_to_remove = [k for k in self.suppressed if k.startswith("1,")]
            for k in keys_to_remove:
                del self.suppressed[k]
        else:
            keys_to_remove = [k for k in self.suppressed if k.startswith("2,")]
            for k in keys_to_remove:
                del self.suppressed[k]

        total_obj = len(self.objective_positions)
        majority = total_obj // 2 + 1

        for p in [1, 2]:
            if self.player_data[str(p)]['objectives_controlled'] >= majority:
                self.game_over = True
                self.winner = p
                return

        # Also check if a player has lost all units (cards)
        for p in [1, 2]:
            pd = self.player_data[str(p)]
            total_cards = len(pd['draw_pile']) + len(pd['hand']) + len(pd['discard'])
            if total_cards == 0:
                self.game_over = True
                self.winner = 1 if p == 2 else 2
                return

    def get_state(self):
        """Return serializable game state."""
        return {
            'grid_size': self.grid_size,
            'grid': self.grid,
            'objective_positions': self.objective_positions,
            'objective_control': self.objective_control,
            'player_data': self.player_data,
            'suppressed': self.suppressed,
            'message': self.message,
            'phase': self.phase,
        }

    def load_state(self, state):
        """Restore game state."""
        self.grid_size = state['grid_size']
        self.grid = state['grid']
        self.objective_positions = state['objective_positions']
        self.objective_control = state['objective_control']
        self.player_data = state['player_data']
        self.suppressed = state['suppressed']
        self.message = state['message']
        self.phase = state['phase']

    def get_tutorial(self):
        return f"""{BOLD}=== UNDAUNTED TUTORIAL ==={RESET}

Undaunted is a deck-building tactical combat game for 2 players.

{BOLD}OBJECTIVE:{RESET}
  Control a majority of objective markers on the grid to win.
  Alternatively, eliminate all enemy units (cards).

{BOLD}EACH TURN:{RESET}
  You start with 4 cards in hand.
  Play cards one at a time to command units on the field.
  When done (or out of cards), end your turn and draw 4 new cards.

{BOLD}CARD ACTIONS:{RESET}
  [a]ttack  - Attack enemies within range of your matching unit
  [m]ove    - Move your matching unit on the grid
  [c]ontrol - Capture an objective (unit must be there, no enemies)
  [s]pecial - Use the unit's special ability

{BOLD}UNIT TYPES:{RESET}
  R=Rifleman  - Balanced fighter (ATK:2, MOV:2, RNG:2)
  S=Scout     - Fast recon, draws cards (ATK:1, MOV:3, RNG:1)
  N=Sniper    - Deadly range, ignores cover (ATK:4, MOV:1, RNG:4)
  M=Machine Gunner - Suppresses targets (ATK:3, MOV:1, RNG:2)
  L=Squad Leader  - Play extra cards (Command ability)
  T=Mortar    - Area attack at range (ATK:3, MOV:0, RNG:3)
  E=Medic     - Recover casualties to deck
  P=Platoon Sgt  - Inspires nearby units (+1 ATK)

{BOLD}COMBAT:{RESET}
  Attack power vs defense + cover + luck.
  Casualties permanently remove cards from the enemy's deck!

{BOLD}TERRAIN:{RESET}
  + = Cover (defense bonus)  . = Open ground

{BOLD}CONTROLS:{RESET}
  Type 'q' to quit, 's' to save, 'h' for help, 't' for tutorial.
"""
