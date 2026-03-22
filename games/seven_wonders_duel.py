"""Seven Wonders Duel - Simplified 2-player card drafting civilization game."""

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

RESOURCE = 'resource'
MILITARY = 'military'
SCIENCE = 'science'
COMMERCE = 'commerce'
GUILD = 'guild'
CIVIC = 'civic'

SCIENCE_SYMBOLS = ['Wheel', 'Compass', 'Tablet', 'Sundial', 'Mortar', 'Quill']

TYPE_COLORS = {
    RESOURCE: ('\033[33m', 'Res'),
    MILITARY: (RED, 'Mil'),
    SCIENCE: (GREEN, 'Sci'),
    COMMERCE: (YELLOW, 'Com'),
    GUILD: (MAGENTA, 'Gld'),
    CIVIC: (BLUE, 'Civ'),
}


def _make_age_cards(age):
    cards = []
    if age == 1:
        for i in range(4):
            cards.append({'name': f'Lumber Yard {i+1}', 'type': RESOURCE, 'vp': 0, 'military': 0, 'science': None, 'cost': 0, 'resource': 'wood'})
        for i in range(3):
            cards.append({'name': f'Stone Pit {i+1}', 'type': RESOURCE, 'vp': 0, 'military': 0, 'science': None, 'cost': 0, 'resource': 'stone'})
        for i in range(3):
            cards.append({'name': f'Clay Pool {i+1}', 'type': RESOURCE, 'vp': 0, 'military': 0, 'science': None, 'cost': 0, 'resource': 'clay'})
        for i in range(3):
            cards.append({'name': f'Guard Tower {i+1}', 'type': MILITARY, 'vp': 0, 'military': 1, 'science': None, 'cost': 1, 'resource': None})
        cards.append({'name': 'Stable', 'type': MILITARY, 'vp': 0, 'military': 1, 'science': None, 'cost': 1, 'resource': None})
        cards.append({'name': 'Apothecary', 'type': SCIENCE, 'vp': 1, 'military': 0, 'science': 'Wheel', 'cost': 1, 'resource': None})
        cards.append({'name': 'Scriptorium', 'type': SCIENCE, 'vp': 0, 'military': 0, 'science': 'Quill', 'cost': 1, 'resource': None})
        cards.append({'name': 'Workshop', 'type': SCIENCE, 'vp': 1, 'military': 0, 'science': 'Compass', 'cost': 1, 'resource': None})
        cards.append({'name': 'Theater', 'type': CIVIC, 'vp': 3, 'military': 0, 'science': None, 'cost': 2, 'resource': None})
        cards.append({'name': 'Altar', 'type': CIVIC, 'vp': 3, 'military': 0, 'science': None, 'cost': 1, 'resource': None})
    elif age == 2:
        for i in range(3):
            cards.append({'name': f'Sawmill {i+1}', 'type': RESOURCE, 'vp': 0, 'military': 0, 'science': None, 'cost': 2, 'resource': 'wood'})
        for i in range(3):
            cards.append({'name': f'Brickyard {i+1}', 'type': RESOURCE, 'vp': 0, 'military': 0, 'science': None, 'cost': 2, 'resource': 'clay'})
        for i in range(2):
            cards.append({'name': f'Barracks {i+1}', 'type': MILITARY, 'vp': 0, 'military': 2, 'science': None, 'cost': 2, 'resource': None})
        cards.append({'name': 'Horse Breeders', 'type': MILITARY, 'vp': 0, 'military': 1, 'science': None, 'cost': 2, 'resource': None})
        cards.append({'name': 'Walls', 'type': MILITARY, 'vp': 0, 'military': 2, 'science': None, 'cost': 3, 'resource': None})
        cards.append({'name': 'Library', 'type': SCIENCE, 'vp': 2, 'military': 0, 'science': 'Tablet', 'cost': 3, 'resource': None})
        cards.append({'name': 'School', 'type': SCIENCE, 'vp': 1, 'military': 0, 'science': 'Wheel', 'cost': 2, 'resource': None})
        cards.append({'name': 'Laboratory', 'type': SCIENCE, 'vp': 1, 'military': 0, 'science': 'Compass', 'cost': 3, 'resource': None})
        cards.append({'name': 'Dispensary', 'type': SCIENCE, 'vp': 2, 'military': 0, 'science': 'Mortar', 'cost': 3, 'resource': None})
        cards.append({'name': 'Courthouse', 'type': CIVIC, 'vp': 5, 'military': 0, 'science': None, 'cost': 3, 'resource': None})
        cards.append({'name': 'Statue', 'type': CIVIC, 'vp': 4, 'military': 0, 'science': None, 'cost': 3, 'resource': None})
        cards.append({'name': 'Aqueduct', 'type': CIVIC, 'vp': 5, 'military': 0, 'science': None, 'cost': 4, 'resource': None})
        cards.append({'name': 'Forum', 'type': COMMERCE, 'vp': 0, 'military': 0, 'science': None, 'cost': 2, 'resource': 'gold'})
        cards.append({'name': 'Caravansery', 'type': COMMERCE, 'vp': 0, 'military': 0, 'science': None, 'cost': 3, 'resource': 'gold'})
    else:
        for i in range(2):
            cards.append({'name': f'Arsenal {i+1}', 'type': MILITARY, 'vp': 0, 'military': 3, 'science': None, 'cost': 4, 'resource': None})
        cards.append({'name': 'Siege Workshop', 'type': MILITARY, 'vp': 0, 'military': 2, 'science': None, 'cost': 4, 'resource': None})
        cards.append({'name': 'Fortification', 'type': MILITARY, 'vp': 0, 'military': 2, 'science': None, 'cost': 3, 'resource': None})
        cards.append({'name': 'University', 'type': SCIENCE, 'vp': 2, 'military': 0, 'science': 'Sundial', 'cost': 4, 'resource': None})
        cards.append({'name': 'Observatory', 'type': SCIENCE, 'vp': 2, 'military': 0, 'science': 'Sundial', 'cost': 5, 'resource': None})
        cards.append({'name': 'Academy', 'type': SCIENCE, 'vp': 3, 'military': 0, 'science': 'Tablet', 'cost': 5, 'resource': None})
        cards.append({'name': 'Study', 'type': SCIENCE, 'vp': 3, 'military': 0, 'science': 'Quill', 'cost': 5, 'resource': None})
        cards.append({'name': 'Senate', 'type': CIVIC, 'vp': 7, 'military': 0, 'science': None, 'cost': 5, 'resource': None})
        cards.append({'name': 'Palace', 'type': CIVIC, 'vp': 7, 'military': 0, 'science': None, 'cost': 6, 'resource': None})
        cards.append({'name': 'Town Hall', 'type': CIVIC, 'vp': 7, 'military': 0, 'science': None, 'cost': 5, 'resource': None})
        cards.append({'name': 'Pantheon', 'type': CIVIC, 'vp': 6, 'military': 0, 'science': None, 'cost': 4, 'resource': None})
        cards.append({'name': 'Gardens', 'type': CIVIC, 'vp': 6, 'military': 0, 'science': None, 'cost': 4, 'resource': None})
        cards.append({'name': "Merchants' Guild", 'type': GUILD, 'vp': 0, 'military': 0, 'science': None, 'cost': 4, 'resource': None})
        cards.append({'name': "Builders' Guild", 'type': GUILD, 'vp': 0, 'military': 0, 'science': None, 'cost': 5, 'resource': None})
        cards.append({'name': "Scientists' Guild", 'type': GUILD, 'vp': 0, 'military': 0, 'science': 'Mortar', 'cost': 5, 'resource': None})
    random.shuffle(cards)
    return cards


def _build_pyramid(cards, age):
    if age == 1:
        row_sizes = [2, 3, 4, 5, 6]
    elif age == 2:
        row_sizes = [6, 5, 4, 3, 2]
    else:
        row_sizes = [2, 3, 4, 5, 6]
    pyramid = []
    idx = 0
    for r, size in enumerate(row_sizes):
        row = []
        for c in range(size):
            if idx < len(cards):
                face_up = (r % 2 == 0)
                row.append({'card': cards[idx], 'face_up': face_up, 'taken': False})
                idx += 1
            else:
                row.append(None)
        pyramid.append(row)
    return pyramid


def _is_exposed(pyramid, row, col):
    if row < 0 or row >= len(pyramid):
        return False
    if col < 0 or col >= len(pyramid[row]):
        return False
    slot = pyramid[row][col]
    if slot is None or slot['taken']:
        return False
    if row == len(pyramid) - 1:
        return True
    next_row = row + 1
    if next_row >= len(pyramid):
        return True
    left_child = col
    right_child = col + 1
    left_taken = True
    right_taken = True
    if left_child < len(pyramid[next_row]):
        slot_l = pyramid[next_row][left_child]
        if slot_l is not None and not slot_l['taken']:
            left_taken = False
    if right_child < len(pyramid[next_row]):
        slot_r = pyramid[next_row][right_child]
        if slot_r is not None and not slot_r['taken']:
            right_taken = False
    return left_taken and right_taken


class SevenWondersDuelGame(BaseGame):
    name = "Seven Wonders Duel"
    description = "2-player card drafting civilization game"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game (3 ages)',
        'quick': 'Quick game (2 ages)',
    }

    def setup(self):
        self.age = 1
        self.max_age = 3 if self.variation == 'standard' else 2
        self.coins = {1: 7, 2: 7}
        self.military = 0
        self.tableaux = {1: [], 2: []}
        self.science_symbols = {1: set(), 2: set()}
        self.resources = {1: {'wood': 0, 'stone': 0, 'clay': 0, 'gold': 0},
                         2: {'wood': 0, 'stone': 0, 'clay': 0, 'gold': 0}}
        self._setup_age()

    def _setup_age(self):
        cards = _make_age_cards(self.age)
        self.pyramid = _build_pyramid(cards, self.age)
        self._reveal_exposed()

    def _reveal_exposed(self):
        for r in range(len(self.pyramid)):
            for c in range(len(self.pyramid[r])):
                slot = self.pyramid[r][c]
                if slot and not slot['taken'] and not slot['face_up']:
                    if _is_exposed(self.pyramid, r, c):
                        slot['face_up'] = True

    def _get_available_cards(self):
        available = []
        for r in range(len(self.pyramid)):
            for c in range(len(self.pyramid[r])):
                slot = self.pyramid[r][c]
                if slot and not slot['taken'] and _is_exposed(self.pyramid, r, c):
                    available.append((r, c))
        return available

    def _vp_for_player(self, player):
        vp = 0
        for card in self.tableaux[player]:
            vp += card.get('vp', 0)
        for card in self.tableaux[player]:
            if card['type'] == GUILD:
                if 'Merchants' in card['name']:
                    vp += self.coins[player] // 3
                elif 'Builders' in card['name']:
                    vp += len(self.tableaux[player]) // 3
        vp += self.coins[player] // 3
        if player == 1 and self.military < -5:
            vp += 10
        elif player == 1 and self.military < -2:
            vp += 5
        elif player == 1 and self.military < 0:
            vp += 2
        elif player == 2 and self.military > 5:
            vp += 10
        elif player == 2 and self.military > 2:
            vp += 5
        elif player == 2 and self.military > 0:
            vp += 2
        return vp

    def _can_afford(self, player, card):
        cost = card.get('cost', 0)
        total_res = sum(self.resources[player].values())
        effective_cost = max(0, cost - total_res)
        return self.coins[player] >= effective_cost

    def _pay_for_card(self, player, card):
        cost = card.get('cost', 0)
        total_res = sum(self.resources[player].values())
        effective_cost = max(0, cost - total_res)
        self.coins[player] -= effective_cost

    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 60}")
        print(f"  SEVEN WONDERS DUEL  --  Age {self.age}/{self.max_age}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"{'=' * 60}")

        mil_pos = max(-9, min(9, self.military))
        track = ['.'] * 19
        track[9 + mil_pos] = '\033[91mX\033[0m'
        print(f"\n  Military: P1 [{''.join(track)}] P2")

        for p in (1, 2):
            marker = " <<" if p == cp else ""
            sci = ', '.join(sorted(self.science_symbols[p])) if self.science_symbols[p] else 'none'
            res = self.resources[p]
            res_str = f"W:{res['wood']} S:{res['stone']} C:{res['clay']} G:{res['gold']}"
            print(f"\n  {self.players[p-1]}: {self.coins[p]} coins | VP:{self._vp_for_player(p)} | {res_str}")
            print(f"    Science: {sci} ({len(self.science_symbols[p])}/6){marker}")

        print(f"\n  --- Pyramid ---")
        available = self._get_available_cards()
        card_num = 1
        self._display_map = {}
        for r in range(len(self.pyramid)):
            indent = "  " + "  " * (len(self.pyramid) - 1 - r)
            line = indent
            for c in range(len(self.pyramid[r])):
                slot = self.pyramid[r][c]
                if slot is None or slot['taken']:
                    line += "       "
                elif not slot['face_up']:
                    line += f" {DIM}[???]{RESET} "
                else:
                    card = slot['card']
                    tc = TYPE_COLORS.get(card['type'], (WHITE, '???'))
                    if (r, c) in available:
                        self._display_map[card_num] = (r, c)
                        line += f" {tc[0]}{card_num}:{tc[1]}{RESET}  "
                        card_num += 1
                    else:
                        line += f" {DIM}{tc[1]}{RESET}   "
            print(line)

        if available:
            print(f"\n  Available cards:")
            for num, (r, c) in self._display_map.items():
                card = self.pyramid[r][c]['card']
                tc = TYPE_COLORS.get(card['type'], (WHITE, '???'))
                details = f"{tc[0]}{card['name']}{RESET}"
                details += f" (cost:{card['cost']}"
                if card['vp']:
                    details += f" vp:{card['vp']}"
                if card['military']:
                    details += f" mil:{card['military']}"
                if card['science']:
                    details += f" sci:{card['science']}"
                if card.get('resource'):
                    details += f" +{card['resource']}"
                details += ")"
                affordable = "OK" if self._can_afford(cp, card) else "$$"
                print(f"    {num}: {details} [{affordable}]")

    def get_move(self):
        while True:
            raw = input_with_quit("  Take card # (or 'discard #' for 2 coins): ").strip().lower()
            if raw.startswith('d'):
                parts = raw.split()
                if len(parts) == 2 and parts[1].isdigit():
                    num = int(parts[1])
                    if num in self._display_map:
                        return ('discard', self._display_map[num])
                print("  Usage: discard <card#>")
                continue
            if raw.isdigit():
                num = int(raw)
                if num in self._display_map:
                    return ('take', self._display_map[num])
                print(f"  Invalid card number.")
            else:
                print("  Enter a card number or 'discard <#>'")

    def make_move(self, move):
        cp = self.current_player
        action, (r, c) = move
        slot = self.pyramid[r][c]
        card = slot['card']

        if action == 'take':
            if not self._can_afford(cp, card):
                print("  You can't afford that card!")
                return False
            self._pay_for_card(cp, card)
            self.tableaux[cp].append(card)
            if card['military']:
                if cp == 1:
                    self.military -= card['military']
                else:
                    self.military += card['military']
            if card['science']:
                self.science_symbols[cp].add(card['science'])
            if card.get('resource'):
                self.resources[cp][card['resource']] = self.resources[cp].get(card['resource'], 0) + 1
        elif action == 'discard':
            self.coins[cp] += 2

        slot['taken'] = True
        self._reveal_exposed()

        available = self._get_available_cards()
        if not available:
            if self.age < self.max_age:
                self.age += 1
                self._setup_age()
        return True

    def check_game_over(self):
        if self.military <= -9:
            self.game_over = True
            self.winner = 1
            return
        if self.military >= 9:
            self.game_over = True
            self.winner = 2
            return
        for p in (1, 2):
            if len(self.science_symbols[p]) >= 6:
                self.game_over = True
                self.winner = p
                return
        available = self._get_available_cards()
        if not available and self.age >= self.max_age:
            self.game_over = True
            vp1 = self._vp_for_player(1)
            vp2 = self._vp_for_player(2)
            if vp1 > vp2:
                self.winner = 1
            elif vp2 > vp1:
                self.winner = 2
            else:
                self.winner = None

    def get_state(self):
        return {
            'age': self.age, 'max_age': self.max_age,
            'coins': {str(k): v for k, v in self.coins.items()},
            'military': self.military,
            'tableaux': {str(k): v for k, v in self.tableaux.items()},
            'science_symbols': {str(k): list(v) for k, v in self.science_symbols.items()},
            'resources': {str(k): v for k, v in self.resources.items()},
            'pyramid': [
                [{'card': s['card'], 'face_up': s['face_up'], 'taken': s['taken']} if s else None for s in row]
                for row in self.pyramid
            ],
        }

    def load_state(self, state):
        self.age = state['age']
        self.max_age = state['max_age']
        self.coins = {int(k): v for k, v in state['coins'].items()}
        self.military = state['military']
        self.tableaux = {int(k): v for k, v in state['tableaux'].items()}
        self.science_symbols = {int(k): set(v) for k, v in state['science_symbols'].items()}
        self.resources = {int(k): v for k, v in state['resources'].items()}
        self.pyramid = [
            [s if s else None for s in row]
            for row in state['pyramid']
        ]

    def get_tutorial(self):
        return """
  ============================================================
    SEVEN WONDERS DUEL - Tutorial
  ============================================================

  OVERVIEW
    Build a civilization by drafting cards from a shared pyramid.
    Win through military supremacy, scientific supremacy, or
    most victory points.

  CARD TYPES
    Resource (brown) : Produce resources to reduce card costs
    Military (red)   : Push the conflict token toward opponent
    Science (green)  : Collect symbols for science supremacy
    Commerce (yellow): Gain gold and trade benefits
    Civic (blue)     : Pure victory points
    Guild (purple)   : End-game scoring bonuses

  PYRAMID
    Cards are arranged in a pyramid. Only exposed cards (not
    covered by cards below) can be taken. Face-down cards are
    revealed when exposed.

  TAKING A CARD
    Enter the card number to take it. Pay its cost minus your
    total resources (in coins). Or 'discard #' to discard for
    2 coins.

  WINNING
    Military Supremacy: Push conflict token to opponent's capital
    Science Supremacy : Collect all 6 different science symbols
    Victory Points    : Most VP at end of final age"""
