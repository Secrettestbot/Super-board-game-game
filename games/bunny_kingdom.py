"""Bunny Kingdom - Card drafting and area control on a grid."""

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

GRID_ROWS = 8
GRID_COLS = 8
RESOURCES = ['carrot', 'fish', 'wood', 'crystal', 'mushroom']
RESOURCE_SYMBOLS = {
    'carrot': (YELLOW, 'Cr'),
    'fish': (BLUE, 'Fi'),
    'wood': (GREEN, 'Wd'),
    'crystal': (MAGENTA, 'Cy'),
    'mushroom': (RED, 'Mu'),
    'empty': (DIM, '..'),
}

CITY_LEVELS = {1: 'Village', 2: 'Town', 3: 'City', 4: 'Fortress'}
CITY_SYMBOLS = {1: 'v', 2: 't', 3: 'C', 4: 'F'}


def _coord_label(r, c):
    return f"{chr(65 + c)}{r + 1}"


def _parse_coord(s):
    s = s.strip().upper()
    if len(s) >= 2 and s[0].isalpha() and s[1:].isdigit():
        c = ord(s[0]) - 65
        r = int(s[1:]) - 1
        if 0 <= r < GRID_ROWS and 0 <= c < GRID_COLS:
            return r, c
    return None


class BunnyKingdomGame(BaseGame):
    """Bunny Kingdom: Draft cards, place bunnies, build cities, score fiefs."""

    name = "Bunny Kingdom"
    description = "Card drafting and area control on a grid, score fiefs"
    min_players = 2
    max_players = 2
    variations = {
        'standard': 'Standard game with basic resources and cities',
        'celestial': 'Celestial variant with sky territories and bonus cards',
    }

    def __init__(self, variation=None):
        super().__init__(variation)

    def setup(self):
        self.round_num = 1
        self.max_rounds = 4
        self.phase = 'draft'  # draft, place, score
        self.scores = {1: 0, 2: 0}
        self.grid_owner = [[0] * GRID_COLS for _ in range(GRID_ROWS)]
        self.grid_resource = [[None] * GRID_COLS for _ in range(GRID_ROWS)]
        self.grid_city = [[0] * GRID_COLS for _ in range(GRID_ROWS)]
        self._generate_map()
        self.hands = {1: [], 2: []}
        self.selected = {1: [], 2: []}
        self.parchments = {1: [], 2: []}
        self.draft_idx = {1: 0, 2: 0}
        self.sky_territories = {1: 0, 2: 0} if self.variation == 'celestial' else {}
        self._deal_cards()
        self.cards_to_play = {1: [], 2: []}
        self.play_phase_idx = 0

    def _generate_map(self):
        for r in range(GRID_ROWS):
            for c in range(GRID_COLS):
                if random.random() < 0.35:
                    self.grid_resource[r][c] = random.choice(RESOURCES)

    def _make_card_pool(self):
        cards = []
        for r in range(GRID_ROWS):
            for c in range(GRID_COLS):
                cards.append({'type': 'territory', 'pos': (r, c), 'label': _coord_label(r, c)})
        for _ in range(8):
            cards.append({'type': 'city', 'level': random.choice([1, 2, 2, 3, 3, 4]),
                          'label': 'Build City'})
        for _ in range(6):
            res = random.choice(RESOURCES)
            cards.append({'type': 'resource', 'resource': res,
                          'label': f'Add {res}'})
        for _ in range(4):
            ptype = random.choice(['connector', 'diversity', 'majority'])
            cards.append({'type': 'parchment', 'parchment': ptype,
                          'label': f'Parchment: {ptype}'})
        if self.variation == 'celestial':
            for _ in range(4):
                cards.append({'type': 'celestial', 'label': 'Sky Territory (+2 to fief)'})
        random.shuffle(cards)
        return cards

    def _deal_cards(self):
        pool = self._make_card_pool()
        hand_size = 12
        self.hands[1] = pool[:hand_size]
        self.hands[2] = pool[hand_size:hand_size * 2]

    def _card_str(self, card):
        if card['type'] == 'territory':
            return f"Territory {card['label']}"
        elif card['type'] == 'city':
            return f"Build {CITY_LEVELS[card['level']]} (Lv{card['level']})"
        elif card['type'] == 'resource':
            sym_color, sym = RESOURCE_SYMBOLS.get(card['resource'], (WHITE, '??'))
            return f"{sym_color}Add {card['resource']}{RESET}"
        elif card['type'] == 'parchment':
            return f"{MAGENTA}Parchment: {card['parchment']}{RESET}"
        elif card['type'] == 'celestial':
            return f"{CYAN}Sky Territory{RESET}"
        return str(card)

    def _find_fiefs(self, player):
        visited = [[False] * GRID_COLS for _ in range(GRID_ROWS)]
        fiefs = []
        for r in range(GRID_ROWS):
            for c in range(GRID_COLS):
                if self.grid_owner[r][c] == player and not visited[r][c]:
                    fief_cells = []
                    stack = [(r, c)]
                    while stack:
                        cr, cc = stack.pop()
                        if visited[cr][cc]:
                            continue
                        if self.grid_owner[cr][cc] != player:
                            continue
                        visited[cr][cc] = True
                        fief_cells.append((cr, cc))
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = cr + dr, cc + dc
                            if 0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS:
                                if not visited[nr][nc] and self.grid_owner[nr][nc] == player:
                                    stack.append((nr, nc))
                    fiefs.append(fief_cells)
        return fiefs

    def _score_fief(self, player, fief_cells):
        resources_found = set()
        max_city = 0
        for r, c in fief_cells:
            res = self.grid_resource[r][c]
            if res:
                resources_found.add(res)
            city_lv = self.grid_city[r][c]
            if city_lv > max_city:
                max_city = city_lv
        towers = max_city
        if self.variation == 'celestial':
            towers += self.sky_territories.get(player, 0)
        variety = len(resources_found)
        return towers * variety

    def _score_parchments(self, player):
        score = 0
        for p in self.parchments[player]:
            if p == 'connector':
                fiefs = self._find_fiefs(player)
                biggest = max((len(f) for f in fiefs), default=0)
                score += biggest
            elif p == 'diversity':
                all_res = set()
                for r in range(GRID_ROWS):
                    for c in range(GRID_COLS):
                        if self.grid_owner[r][c] == player and self.grid_resource[r][c]:
                            all_res.add(self.grid_resource[r][c])
                score += len(all_res) * 3
            elif p == 'majority':
                own_count = sum(1 for r in range(GRID_ROWS) for c in range(GRID_COLS)
                                if self.grid_owner[r][c] == player)
                opp = 2 if player == 1 else 1
                opp_count = sum(1 for r in range(GRID_ROWS) for c in range(GRID_COLS)
                                if self.grid_owner[r][c] == opp)
                if own_count > opp_count:
                    score += 5
        return score

    def display(self):
        cp = self.current_player
        print(f"\n{'=' * 58}")
        variant_tag = " [Celestial]" if self.variation == 'celestial' else ""
        print(f"  BUNNY KINGDOM{variant_tag}  --  Round {self.round_num}/{self.max_rounds}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"{'=' * 58}")

        for p in (1, 2):
            marker = f" {YELLOW}<<{RESET}" if p == cp else ""
            sky_str = f" | Sky: {self.sky_territories[p]}" if self.variation == 'celestial' else ""
            parch_str = f" | Parchments: {len(self.parchments[p])}" if self.parchments[p] else ""
            print(f"  {self.players[p-1]}: {GREEN}{self.scores[p]} VP{RESET}{sky_str}{parch_str}{marker}")

        # Grid display
        print(f"\n     ", end="")
        for c in range(GRID_COLS):
            print(f" {chr(65+c)}  ", end="")
        print()
        for r in range(GRID_ROWS):
            print(f"  {r+1:2} ", end="")
            for c in range(GRID_COLS):
                owner = self.grid_owner[r][c]
                res = self.grid_resource[r][c]
                city = self.grid_city[r][c]
                if owner == 1:
                    owner_color = CYAN
                elif owner == 2:
                    owner_color = RED
                else:
                    owner_color = DIM

                cell = ""
                if city > 0:
                    cell = f"{YELLOW}{CITY_SYMBOLS[city]}{RESET}"
                elif res:
                    sym_color, sym = RESOURCE_SYMBOLS.get(res, (WHITE, '??'))
                    cell = f"{sym_color}{sym}{RESET}"
                else:
                    cell = f"{DIM}..{RESET}"

                if owner > 0:
                    print(f"{owner_color}[{RESET}{cell}{owner_color}]{RESET}", end="")
                else:
                    print(f" {cell} ", end="")
            print()

        if self.phase == 'draft':
            hand = self.hands[cp]
            if hand:
                print(f"\n  {DIM}-- Your Hand ({len(hand)} cards) --{RESET}")
                for i, card in enumerate(hand):
                    print(f"    {i+1}. {self._card_str(card)}")
                print(f"  Select 2 cards to keep (the rest pass to opponent).")

        elif self.phase == 'place':
            cards = self.cards_to_play[cp]
            if cards:
                print(f"\n  {DIM}-- Cards to Play --{RESET}")
                for i, card in enumerate(cards):
                    print(f"    {i+1}. {self._card_str(card)}")

    def get_move(self):
        cp = self.current_player
        if self.phase == 'draft':
            hand = self.hands[cp]
            if not hand:
                return ('draft_done',)
            while True:
                raw = input_with_quit("  Pick 2 cards (e.g. '1 3'): ").strip()
                parts = raw.split()
                try:
                    if len(parts) == 2:
                        i1, i2 = int(parts[0]) - 1, int(parts[1]) - 1
                        if i1 != i2 and 0 <= i1 < len(hand) and 0 <= i2 < len(hand):
                            return ('draft_pick', i1, i2)
                except ValueError:
                    pass
                if len(hand) == 1:
                    return ('draft_pick_last',)
                print("  Pick exactly 2 different card numbers.")

        elif self.phase == 'place':
            cards = self.cards_to_play[cp]
            if not cards:
                return ('place_done',)
            while True:
                card = cards[0]
                if card['type'] == 'territory':
                    r, c = card['pos']
                    if self.grid_owner[r][c] == 0:
                        return ('place_territory', 0)
                    else:
                        return ('place_skip', 0)
                elif card['type'] == 'city':
                    raw = input_with_quit(f"  Place {CITY_LEVELS[card['level']]} on your territory (e.g. 'A3'): ").strip()
                    coord = _parse_coord(raw)
                    if coord:
                        r, c = coord
                        if self.grid_owner[r][c] == cp:
                            return ('place_city', 0, r, c)
                        print("  Must place on YOUR territory.")
                    else:
                        print("  Invalid coordinate. Use letter+number like 'A3'.")
                elif card['type'] == 'resource':
                    raw = input_with_quit(f"  Add {card['resource']} to your territory (e.g. 'A3'): ").strip()
                    coord = _parse_coord(raw)
                    if coord:
                        r, c = coord
                        if self.grid_owner[r][c] == cp:
                            return ('place_resource', 0, r, c)
                        print("  Must place on YOUR territory.")
                    else:
                        print("  Invalid coordinate.")
                elif card['type'] == 'parchment':
                    return ('place_parchment', 0)
                elif card['type'] == 'celestial':
                    return ('place_celestial', 0)
                else:
                    return ('place_skip', 0)

    def make_move(self, move):
        cp = self.current_player
        opp = 2 if cp == 1 else 1

        if move[0] == 'draft_pick':
            i1, i2 = move[1], move[2]
            hand = self.hands[cp]
            picked = [hand[i1], hand[i2]]
            self.cards_to_play[cp].extend(picked)
            remaining = [c for i, c in enumerate(hand) if i not in (i1, i2)]
            self.hands[cp] = remaining
            if cp == 2 or (cp == 1 and len(self.hands[2]) == 0):
                # Swap remaining hands
                self.hands[1], self.hands[2] = self.hands[2], self.hands[1]
                if not self.hands[1] and not self.hands[2]:
                    self.phase = 'place'
                    self.play_phase_idx = 0
            return True

        elif move[0] == 'draft_pick_last':
            hand = self.hands[cp]
            if hand:
                self.cards_to_play[cp].extend(hand)
                self.hands[cp] = []
            if not self.hands[1] and not self.hands[2]:
                self.phase = 'place'
            return True

        elif move[0] == 'draft_done':
            if not self.hands[1] and not self.hands[2]:
                self.phase = 'place'
            return True

        elif move[0] == 'place_territory':
            card = self.cards_to_play[cp].pop(0)
            r, c = card['pos']
            if self.grid_owner[r][c] == 0:
                self.grid_owner[r][c] = cp
            return False

        elif move[0] == 'place_skip':
            self.cards_to_play[cp].pop(0)
            return False

        elif move[0] == 'place_city':
            card = self.cards_to_play[cp].pop(0)
            r, c = move[2], move[3]
            self.grid_city[r][c] = max(self.grid_city[r][c], card['level'])
            return False

        elif move[0] == 'place_resource':
            card = self.cards_to_play[cp].pop(0)
            r, c = move[2], move[3]
            self.grid_resource[r][c] = card['resource']
            return False

        elif move[0] == 'place_parchment':
            card = self.cards_to_play[cp].pop(0)
            self.parchments[cp].append(card['parchment'])
            return False

        elif move[0] == 'place_celestial':
            card = self.cards_to_play[cp].pop(0)
            self.sky_territories[cp] = self.sky_territories.get(cp, 0) + 1
            return False

        elif move[0] == 'place_done':
            if not self.cards_to_play[1] and not self.cards_to_play[2]:
                self._score_round()
                self.round_num += 1
                self.phase = 'draft'
                self._deal_cards()
            return True

        return False

    def _score_round(self):
        for p in (1, 2):
            fiefs = self._find_fiefs(p)
            round_score = 0
            for fief in fiefs:
                round_score += self._score_fief(p, fief)
            if self.round_num == self.max_rounds:
                round_score += self._score_parchments(p)
            self.scores[p] += round_score

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
            'round_num': self.round_num,
            'max_rounds': self.max_rounds,
            'phase': self.phase,
            'scores': {str(k): v for k, v in self.scores.items()},
            'grid_owner': self.grid_owner,
            'grid_resource': self.grid_resource,
            'grid_city': self.grid_city,
            'hands': {str(k): v for k, v in self.hands.items()},
            'cards_to_play': {str(k): v for k, v in self.cards_to_play.items()},
            'parchments': {str(k): v for k, v in self.parchments.items()},
            'sky_territories': {str(k): v for k, v in self.sky_territories.items()} if self.sky_territories else {},
        }

    def load_state(self, state):
        self.round_num = state['round_num']
        self.max_rounds = state['max_rounds']
        self.phase = state['phase']
        self.scores = {int(k): v for k, v in state['scores'].items()}
        self.grid_owner = state['grid_owner']
        self.grid_resource = state['grid_resource']
        self.grid_city = state['grid_city']
        self.hands = {int(k): v for k, v in state['hands'].items()}
        self.cards_to_play = {int(k): v for k, v in state['cards_to_play'].items()}
        self.parchments = {int(k): v for k, v in state['parchments'].items()}
        if state.get('sky_territories'):
            self.sky_territories = {int(k): v for k, v in state['sky_territories'].items()}
        else:
            self.sky_territories = {}

    def get_tutorial(self):
        celestial_text = ""
        if self.variation == 'celestial':
            celestial_text = """
  CELESTIAL VARIANT
    Sky Territory cards add bonus tower strength to ALL your
    fiefs. Each sky territory adds +2 to your city level for
    scoring purposes."""
        return f"""
  ============================================================
    BUNNY KINGDOM - Tutorial
  ============================================================

  OVERVIEW
    Draft cards to claim territories on an 8x8 grid. Place
    bunnies, build cities, gather resources. Score your fiefs
    (connected territories) each round.

  CARD DRAFTING
    Each round, receive 12 cards. Pick 2 to keep, pass rest
    to opponent. Repeat until all cards are drafted.

  CARD TYPES
    Territory : Claim a grid space (place your bunny there)
    City      : Build a city on one of your territories
                (Villages=1, Towns=2, Cities=3, Fortresses=4)
    Resource  : Add a resource to one of your territories
    Parchment : End-game bonus scoring card

  RESOURCES
    Carrot, Fish, Wood, Crystal, Mushroom.
    Each type in a fief counts once for scoring.

  SCORING FIEFS
    A fief is a connected group of your territories.
    Score = (highest city level) x (number of different resources)

    Example: A fief with a Town (2) and 3 different resources
    scores 2 x 3 = 6 points.

  PARCHMENTS (scored in final round)
    Connector : Points equal to your largest fief size
    Diversity : 3 points per unique resource type you own
    Majority  : 5 points if you own more territories than opponent

  GRID NOTATION
    Columns: A-H, Rows: 1-8 (e.g., 'A3', 'D7')

  WINNING
    After 4 rounds, highest total score wins.
{celestial_text}"""
