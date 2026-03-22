"""Kingdomino - A tile-drafting territory-building game."""

import random
import copy

from engine.base import BaseGame, input_with_quit, clear_screen


# Terrain types and display codes
TERRAINS = {
    'W': 'Wheat',
    'F': 'Forest',
    '~': 'Water',
    'G': 'Grassland',
    'S': 'Swamp',
    'M': 'Mine',
}

# Orientation deltas: direction the second half goes from the first
ORIENTATIONS = {
    'right': (0, 1),
    'down': (1, 0),
    'left': (0, -1),
    'up': (-1, 0),
}

# 48 domino tiles: (tile_number, (terrain1, crowns1), (terrain2, crowns2))
# Tile number determines draft order (lower = picks first next round).
# Based on the standard Kingdomino tile distribution.
TILE_SET = [
    (1,  ('W', 0), ('W', 0)),
    (2,  ('W', 0), ('W', 0)),
    (3,  ('F', 0), ('F', 0)),
    (4,  ('F', 0), ('F', 0)),
    (5,  ('F', 0), ('F', 0)),
    (6,  ('F', 0), ('F', 0)),
    (7,  ('~', 0), ('~', 0)),
    (8,  ('~', 0), ('~', 0)),
    (9,  ('~', 0), ('~', 0)),
    (10, ('G', 0), ('G', 0)),
    (11, ('G', 0), ('G', 0)),
    (12, ('S', 0), ('S', 0)),
    (13, ('W', 0), ('F', 0)),
    (14, ('W', 0), ('~', 0)),
    (15, ('W', 0), ('G', 0)),
    (16, ('W', 0), ('S', 0)),
    (17, ('F', 0), ('~', 0)),
    (18, ('F', 0), ('G', 0)),
    (19, ('W', 1), ('F', 0)),
    (20, ('W', 1), ('~', 0)),
    (21, ('W', 1), ('G', 0)),
    (22, ('W', 1), ('S', 0)),
    (23, ('W', 1), ('M', 0)),
    (24, ('F', 1), ('W', 0)),
    (25, ('F', 1), ('W', 0)),
    (26, ('F', 1), ('W', 0)),
    (27, ('F', 1), ('W', 0)),
    (28, ('F', 1), ('G', 0)),
    (29, ('F', 1), ('~', 0)),
    (30, ('~', 1), ('W', 0)),
    (31, ('~', 1), ('W', 0)),
    (32, ('~', 1), ('F', 0)),
    (33, ('~', 1), ('F', 0)),
    (34, ('~', 1), ('F', 0)),
    (35, ('~', 1), ('G', 0)),
    (36, ('G', 1), ('W', 0)),
    (37, ('G', 1), ('W', 0)),
    (38, ('G', 1), ('F', 0)),
    (39, ('S', 1), ('W', 0)),
    (40, ('S', 1), ('F', 0)),
    (41, ('M', 1), ('W', 0)),
    (42, ('W', 2), ('S', 0)),
    (43, ('~', 2), ('G', 0)),
    (44, ('F', 2), ('W', 0)),
    (45, ('M', 2), ('W', 0)),
    (46, ('M', 2), ('G', 0)),
    (47, ('M', 3), ('W', 0)),
    (48, ('M', 3), ('S', 0)),
]

# Building tiles for Queendomino variant
# (cost, bonus_points, name)
BUILDING_TILES = [
    (1, 3, 'Tower'),
    (1, 3, 'Tower'),
    (2, 5, 'Chapel'),
    (2, 5, 'Chapel'),
    (3, 7, 'Manor'),
    (3, 7, 'Manor'),
    (4, 10, 'Castle'),
    (5, 14, 'Cathedral'),
]


class KingdominoGame(BaseGame):
    """Kingdomino: Draft domino tiles to build a kingdom territory."""

    name = "Kingdomino"
    description = "A tile-drafting territory-building game"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Kingdomino",
        "queendomino": "Queendomino (with buildings)",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        # Each player's kingdom: 9x9 grid to allow placement around center castle
        # Cell format: (terrain, crowns) or None. Castle is ('C', 0).
        self.kingdoms = [None, None]
        # Track bounding box per player to enforce 5x5 max
        self.tile_deck = []
        self.current_offer = []  # list of (tile_number, half1, half2, claimed_by)
        self.next_offer = []
        self.pick_order = [1, 1, 2, 2]  # who picks in what order (2-player: each picks 2)
        self.next_pick_order = []
        self.phase = 'pick'  # 'pick' or 'place'
        self.picks_done = 0
        self.placements_to_do = []  # list of (player, tile) waiting to be placed
        self.current_placement = None  # (player, tile) currently being placed
        self.scores = [0, 0]
        self.round_number = 0
        self.tiles_remaining = 0
        # Queendomino
        self.buildings_available = []
        self.buildings_owned = [[], []]  # per player
        self.coins = [0, 0]

    def setup(self):
        """Initialize the game for a new session."""
        # Create 9x9 grids (castle at center 4,4)
        self.kingdoms = [
            [[None for _ in range(9)] for _ in range(9)],
            [[None for _ in range(9)] for _ in range(9)],
        ]
        # Place castles at center
        self.kingdoms[0][4][4] = ('C', 0)
        self.kingdoms[1][4][4] = ('C', 0)

        # Shuffle tile deck
        self.tile_deck = list(TILE_SET)
        random.shuffle(self.tile_deck)
        self.tiles_remaining = len(self.tile_deck)

        # Queendomino setup
        if self.variation == 'queendomino':
            self.buildings_available = [dict(cost=b[0], points=b[1], name=b[2])
                                        for b in BUILDING_TILES]
            self.coins = [0, 0]
            self.buildings_owned = [[], []]

        # Determine initial pick order randomly
        if random.random() < 0.5:
            self.pick_order = [1, 1, 2, 2]
        else:
            self.pick_order = [2, 2, 1, 1]

        self.phase = 'pick'
        self.picks_done = 0
        self.round_number = 1
        self.scores = [0, 0]
        self.placements_to_do = []
        self.current_placement = None

        # Draw first offer
        self._draw_offer()

    def _draw_offer(self):
        """Draw 4 tiles for the current offer, sorted by tile number."""
        drawn = self.tile_deck[:4]
        self.tile_deck = self.tile_deck[4:]
        # Sort by tile number (ascending)
        drawn.sort(key=lambda t: t[0])
        self.current_offer = []
        for tile in drawn:
            self.current_offer.append({
                'number': tile[0],
                'half1': tile[1],
                'half2': tile[2],
                'claimed_by': None,
            })
        self.tiles_remaining = len(self.tile_deck)

    def _get_kingdom_bounds(self, player_idx):
        """Get the bounding box (min_r, max_r, min_c, max_c) of placed tiles."""
        kingdom = self.kingdoms[player_idx]
        min_r, max_r, min_c, max_c = 9, -1, 9, -1
        for r in range(9):
            for c in range(9):
                if kingdom[r][c] is not None:
                    min_r = min(min_r, r)
                    max_r = max(max_r, r)
                    min_c = min(min_c, c)
                    max_c = max(max_c, c)
        if max_r == -1:
            return 4, 4, 4, 4  # only castle
        return min_r, max_r, min_c, max_c

    def _can_place_tile(self, player_idx, r1, c1, r2, c2, half1, half2):
        """Check if a tile can be placed at the given positions."""
        kingdom = self.kingdoms[player_idx]

        # Check bounds (within 9x9 grid)
        for r, c in [(r1, c1), (r2, c2)]:
            if r < 0 or r >= 9 or c < 0 or c >= 9:
                return False

        # Check cells are empty
        if kingdom[r1][c1] is not None or kingdom[r2][c2] is not None:
            return False

        # Check 5x5 constraint
        min_r, max_r, min_c, max_c = self._get_kingdom_bounds(player_idx)
        all_rows = [min_r, max_r, r1, r2]
        all_cols = [min_c, max_c, c1, c2]
        new_min_r, new_max_r = min(all_rows), max(all_rows)
        new_min_c, new_max_c = min(all_cols), max(all_cols)
        if (new_max_r - new_min_r + 1) > 5 or (new_max_c - new_min_c + 1) > 5:
            return False

        # Check adjacency: at least one half must be adjacent to a matching terrain
        # or adjacent to the castle (wild match)
        match_found = False
        for r, c, half in [(r1, c1, half1), (r2, c2, half2)]:
            terrain = half[0]
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < 9 and 0 <= nc < 9 and kingdom[nr][nc] is not None:
                    adj_terrain = kingdom[nr][nc][0]
                    if adj_terrain == 'C' or adj_terrain == terrain:
                        match_found = True
                        break
            if match_found:
                break

        return match_found

    def _has_any_valid_placement(self, player_idx, half1, half2):
        """Check if there is any valid placement for this tile."""
        for r in range(9):
            for c in range(9):
                for orient, (dr, dc) in ORIENTATIONS.items():
                    r2, c2 = r + dr, c + dc
                    if self._can_place_tile(player_idx, r, c, r2, c2, half1, half2):
                        return True
        return False

    def _place_tile(self, player_idx, r1, c1, r2, c2, half1, half2):
        """Place a tile on the kingdom."""
        self.kingdoms[player_idx][r1][c1] = half1
        self.kingdoms[player_idx][r2][c2] = half2

    def _calculate_score(self, player_idx):
        """Calculate score for a player's kingdom."""
        kingdom = self.kingdoms[player_idx]
        visited = [[False] * 9 for _ in range(9)]
        total_score = 0

        for r in range(9):
            for c in range(9):
                if kingdom[r][c] is not None and not visited[r][c]:
                    terrain = kingdom[r][c][0]
                    if terrain == 'C':
                        visited[r][c] = True
                        continue
                    # BFS to find connected region
                    region_size = 0
                    region_crowns = 0
                    stack = [(r, c)]
                    while stack:
                        cr, cc = stack.pop()
                        if visited[cr][cc]:
                            continue
                        if kingdom[cr][cc] is None or kingdom[cr][cc][0] != terrain:
                            continue
                        visited[cr][cc] = True
                        region_size += 1
                        region_crowns += kingdom[cr][cc][1]
                        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            nr, nc = cr + dr, cc + dc
                            if 0 <= nr < 9 and 0 <= nc < 9:
                                stack.append((nr, nc))
                    total_score += region_size * region_crowns

        # Bonuses
        min_r, max_r, min_c, max_c = self._get_kingdom_bounds(player_idx)
        # Center bonus: castle at exact center of 5x5 area
        if (max_r - min_r + 1) <= 5 and (max_c - min_c + 1) <= 5:
            mid_r = (min_r + max_r) / 2.0
            mid_c = (min_c + max_c) / 2.0
            if kingdom[4][4] is not None and kingdom[4][4][0] == 'C':
                if abs(mid_r - 4) < 0.01 and abs(mid_c - 4) < 0.01:
                    total_score += 10

        # Complete 5x5 bonus
        if (max_r - min_r + 1) == 5 and (max_c - min_c + 1) == 5:
            complete = True
            for rr in range(min_r, max_r + 1):
                for cc in range(min_c, max_c + 1):
                    if kingdom[rr][cc] is None:
                        complete = False
                        break
                if not complete:
                    break
            if complete:
                total_score += 5

        # Queendomino building bonuses
        if self.variation == 'queendomino':
            for bld in self.buildings_owned[player_idx]:
                total_score += bld['points']

        return total_score

    def _format_kingdom(self, player_idx):
        """Format a player's kingdom grid for display."""
        min_r, max_r, min_c, max_c = self._get_kingdom_bounds(player_idx)
        # Show at least the 5x5 area centered on the castle, or expand as needed
        display_min_r = min(min_r, 2)
        display_max_r = max(max_r, 6)
        display_min_c = min(min_c, 2)
        display_max_c = max(max_c, 6)

        kingdom = self.kingdoms[player_idx]
        lines = []
        # Column headers
        header = "    "
        for c in range(display_min_c, display_max_c + 1):
            header += f" {c}  "
        lines.append(header)

        for r in range(display_min_r, display_max_r + 1):
            row_str = f" {r}  "
            for c in range(display_min_c, display_max_c + 1):
                cell = kingdom[r][c]
                if cell is None:
                    row_str += " .  "
                elif cell[0] == 'C':
                    row_str += " C  "
                else:
                    terrain = cell[0]
                    crowns = cell[1]
                    if crowns > 0:
                        row_str += f"{terrain}{crowns}  "
                    else:
                        row_str += f" {terrain}  "
            lines.append(row_str)
        return "\n".join(lines)

    def _format_tile(self, tile_info):
        """Format a tile for display."""
        h1 = tile_info['half1']
        h2 = tile_info['half2']
        t1 = h1[0] + (str(h1[1]) if h1[1] > 0 else '')
        t2 = h2[0] + (str(h2[1]) if h2[1] > 0 else '')
        return f"[{t1}|{t2}]"

    def display(self):
        """Display the current game state."""
        print(f"\n{'='*60}")
        print(f"  KINGDOMINO - Round {self.round_number}")
        if self.variation == 'queendomino':
            print(f"  (Queendomino variant)")
        print(f"{'='*60}")

        # Show both kingdoms
        for p in range(2):
            score = self._calculate_score(p)
            self.scores[p] = score
            print(f"\n  {self.players[p]}'s Kingdom (Score: {score})")
            if self.variation == 'queendomino':
                print(f"  Coins: {self.coins[p]}  Buildings: {len(self.buildings_owned[p])}")
            print(self._format_kingdom(p))

        # Show current offer
        if self.phase == 'pick' and self.current_offer:
            print(f"\n  Available Tiles:")
            for i, tile in enumerate(self.current_offer):
                status = ""
                if tile['claimed_by'] is not None:
                    status = f" <- {self.players[tile['claimed_by']]}"
                fmt = self._format_tile(tile)
                print(f"    Tile {tile['number']:2d}: {fmt}{status}")

        # Show placement info
        if self.phase == 'place' and self.current_placement is not None:
            player_idx, tile = self.current_placement
            fmt = self._format_tile(tile)
            print(f"\n  Placing tile {tile['number']}: {fmt}")
            print(f"  for {self.players[player_idx]}")

        # Queendomino: show available buildings
        if self.variation == 'queendomino' and self.buildings_available and self.phase == 'pick':
            print(f"\n  Buildings Available:")
            for i, bld in enumerate(self.buildings_available):
                print(f"    {i+1}. {bld['name']} (Cost: {bld['cost']}, Points: {bld['points']})")

        print(f"\n  Tiles remaining in deck: {self.tiles_remaining}")
        print(f"{'='*60}")

    def get_move(self):
        """Get a move from the current player."""
        if self.phase == 'pick':
            whose_turn = self.pick_order[self.picks_done]
            self.current_player = whose_turn
            print(f"\n  {self.players[whose_turn - 1]}'s turn to pick a tile.")
            unclaimed = [t for t in self.current_offer if t['claimed_by'] is None]
            if not unclaimed:
                return {'action': 'auto_advance'}

            available_nums = [t['number'] for t in unclaimed]
            while True:
                raw = input_with_quit(f"  Pick a tile number ({', '.join(str(n) for n in available_nums)}): ")
                parts = raw.strip().lower().split()
                if len(parts) == 2 and parts[0] == 'pick':
                    try:
                        num = int(parts[1])
                        if num in available_nums:
                            move = {'action': 'pick', 'tile_number': num, 'player': whose_turn}
                            # Queendomino: option to buy a building after picking
                            if self.variation == 'queendomino' and self.buildings_available:
                                buy = input_with_quit("  Buy a building? (number or 'no'): ").strip().lower()
                                if buy != 'no' and buy != '':
                                    try:
                                        bidx = int(buy) - 1
                                        if 0 <= bidx < len(self.buildings_available):
                                            move['buy_building'] = bidx
                                    except ValueError:
                                        pass
                            return move
                        else:
                            print(f"  Tile {num} is not available.")
                    except ValueError:
                        print("  Invalid input. Use: pick <number>")
                elif len(parts) == 1:
                    try:
                        num = int(parts[0])
                        if num in available_nums:
                            move = {'action': 'pick', 'tile_number': num, 'player': whose_turn}
                            if self.variation == 'queendomino' and self.buildings_available:
                                buy = input_with_quit("  Buy a building? (number or 'no'): ").strip().lower()
                                if buy != 'no' and buy != '':
                                    try:
                                        bidx = int(buy) - 1
                                        if 0 <= bidx < len(self.buildings_available):
                                            move['buy_building'] = bidx
                                    except ValueError:
                                        pass
                            return move
                        else:
                            print(f"  Tile {num} is not available.")
                    except ValueError:
                        print("  Invalid input. Use: pick <number>")
                else:
                    print("  Invalid input. Use: pick <number>")

        elif self.phase == 'place':
            player_idx, tile = self.current_placement
            self.current_player = player_idx + 1

            # Check if any valid placement exists
            if not self._has_any_valid_placement(player_idx, tile['half1'], tile['half2']):
                print(f"\n  No valid placement for this tile. It will be discarded.")
                input_with_quit("  Press Enter to continue...")
                return {'action': 'discard', 'player': player_idx + 1}

            print(f"\n  {self.players[player_idx]} - place tile {tile['number']}: {self._format_tile(tile)}")
            print(f"  Enter: place <row> <col> <orientation>")
            print(f"  Orientations: right, down, left, up (direction of second half)")
            print(f"  Or 'discard' to discard this tile.")

            while True:
                raw = input_with_quit("  > ").strip().lower()
                if raw == 'discard':
                    return {'action': 'discard', 'player': player_idx + 1}

                parts = raw.split()
                if len(parts) >= 3:
                    # Allow "place r c orient" or "r c orient"
                    if parts[0] == 'place':
                        parts = parts[1:]
                    if len(parts) == 3:
                        try:
                            row = int(parts[0])
                            col = int(parts[1])
                            orient = parts[2]
                            if orient in ORIENTATIONS:
                                return {
                                    'action': 'place',
                                    'row': row,
                                    'col': col,
                                    'orientation': orient,
                                    'player': player_idx + 1,
                                }
                            else:
                                print(f"  Invalid orientation. Use: right, down, left, up")
                        except ValueError:
                            print("  Invalid row/col. Use integers.")
                    else:
                        print("  Usage: place <row> <col> <orientation>")
                else:
                    print("  Usage: place <row> <col> <orientation> (or 'discard')")

    def make_move(self, move):
        """Apply a move to the game state."""
        if move.get('action') == 'auto_advance':
            self._advance_after_picks()
            return True

        if move['action'] == 'pick':
            tile_num = move['tile_number']
            player = move['player']
            player_idx = player - 1

            # Claim the tile
            for tile in self.current_offer:
                if tile['number'] == tile_num and tile['claimed_by'] is None:
                    tile['claimed_by'] = player_idx
                    self.picks_done += 1

                    # Queendomino: handle building purchase
                    if self.variation == 'queendomino' and 'buy_building' in move:
                        bidx = move['buy_building']
                        if 0 <= bidx < len(self.buildings_available):
                            bld = self.buildings_available[bidx]
                            if self.coins[player_idx] >= bld['cost']:
                                self.coins[player_idx] -= bld['cost']
                                self.buildings_owned[player_idx].append(bld)
                                self.buildings_available.pop(bidx)

                    # Queendomino: earn a coin for each crown on picked tile
                    if self.variation == 'queendomino':
                        crowns = tile['half1'][1] + tile['half2'][1]
                        self.coins[player_idx] += crowns

                    # Check if all picks done
                    if self.picks_done >= len(self.pick_order):
                        self._advance_after_picks()
                    return True
            return False

        elif move['action'] == 'place':
            player_idx = move['player'] - 1
            r1 = move['row']
            c1 = move['col']
            orient = move['orientation']
            dr, dc = ORIENTATIONS[orient]
            r2, c2 = r1 + dr, c1 + dc
            tile = self.current_placement[1]

            if self._can_place_tile(player_idx, r1, c1, r2, c2, tile['half1'], tile['half2']):
                self._place_tile(player_idx, r1, c1, r2, c2, tile['half1'], tile['half2'])
                self._advance_after_placement()
                return True
            else:
                print("  Invalid placement!")
                return False

        elif move['action'] == 'discard':
            self._advance_after_placement()
            return True

        return False

    def _advance_after_picks(self):
        """After all picks are done, move to placement phase."""
        # Build placement order: tiles sorted by tile number (ascending),
        # each maps to the player who claimed it.
        placements = []
        for tile in sorted(self.current_offer, key=lambda t: t['number']):
            if tile['claimed_by'] is not None:
                placements.append((tile['claimed_by'], tile))

        self.placements_to_do = placements
        self.phase = 'place'

        # Build next round pick order based on current tile picks
        # Lower tile number picks first in next round
        self.next_pick_order = []
        for player_idx, tile in placements:
            self.next_pick_order.append(player_idx + 1)

        self._start_next_placement()

    def _start_next_placement(self):
        """Start the next placement from the queue."""
        if self.placements_to_do:
            self.current_placement = self.placements_to_do.pop(0)
        else:
            self._start_new_round()

    def _advance_after_placement(self):
        """Advance to the next placement or new round."""
        self.current_placement = None
        if self.placements_to_do:
            self._start_next_placement()
        else:
            self._start_new_round()

    def _start_new_round(self):
        """Start a new round."""
        if len(self.tile_deck) == 0:
            self.phase = 'done'
            return

        self.round_number += 1
        self.pick_order = self.next_pick_order if self.next_pick_order else self.pick_order
        self.next_pick_order = []
        self.picks_done = 0
        self.phase = 'pick'

        self._draw_offer()

    def check_game_over(self):
        """Check if the game is over."""
        if self.phase == 'done':
            self.scores[0] = self._calculate_score(0)
            self.scores[1] = self._calculate_score(1)
            self.game_over = True
            if self.scores[0] > self.scores[1]:
                self.winner = 1
            elif self.scores[1] > self.scores[0]:
                self.winner = 2
            else:
                self.winner = None  # draw

    def get_state(self):
        """Return serializable game state for saving."""
        return {
            'kingdoms': copy.deepcopy(self.kingdoms),
            'tile_deck': [(t[0], list(t[1]), list(t[2])) for t in self.tile_deck],
            'current_offer': copy.deepcopy(self.current_offer),
            'pick_order': list(self.pick_order),
            'next_pick_order': list(self.next_pick_order),
            'phase': self.phase,
            'picks_done': self.picks_done,
            'placements_to_do': [(p, copy.deepcopy(t)) for p, t in self.placements_to_do],
            'current_placement': (
                [self.current_placement[0], copy.deepcopy(self.current_placement[1])]
                if self.current_placement else None
            ),
            'scores': list(self.scores),
            'round_number': self.round_number,
            'tiles_remaining': self.tiles_remaining,
            'variation': self.variation,
            'buildings_available': copy.deepcopy(self.buildings_available),
            'buildings_owned': copy.deepcopy(self.buildings_owned),
            'coins': list(self.coins),
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.kingdoms = state['kingdoms']
        self.tile_deck = [(t[0], tuple(t[1]), tuple(t[2])) for t in state['tile_deck']]
        self.current_offer = state['current_offer']
        # Convert half1/half2 back to tuples
        for tile in self.current_offer:
            tile['half1'] = tuple(tile['half1'])
            tile['half2'] = tuple(tile['half2'])
        self.pick_order = state['pick_order']
        self.next_pick_order = state.get('next_pick_order', [])
        self.phase = state['phase']
        self.picks_done = state['picks_done']
        self.placements_to_do = []
        for p, t in state.get('placements_to_do', []):
            t['half1'] = tuple(t['half1'])
            t['half2'] = tuple(t['half2'])
            self.placements_to_do.append((p, t))
        cp = state.get('current_placement')
        if cp:
            cp[1]['half1'] = tuple(cp[1]['half1'])
            cp[1]['half2'] = tuple(cp[1]['half2'])
            self.current_placement = (cp[0], cp[1])
        else:
            self.current_placement = None
        self.scores = state['scores']
        self.round_number = state['round_number']
        self.tiles_remaining = state['tiles_remaining']
        self.variation = state.get('variation', 'standard')
        self.buildings_available = state.get('buildings_available', [])
        self.buildings_owned = state.get('buildings_owned', [[], []])
        self.coins = state.get('coins', [0, 0])
        # Convert kingdom cell lists back to tuples
        for p in range(2):
            for r in range(9):
                for c in range(9):
                    cell = self.kingdoms[p][r][c]
                    if cell is not None:
                        self.kingdoms[p][r][c] = tuple(cell)
        self._resumed = True

    def get_tutorial(self):
        """Return tutorial text for Kingdomino."""
        text = """
==================================================
  KINGDOMINO - Tutorial
==================================================

  OVERVIEW:
  Kingdomino is a tile-drafting territory-building
  game for 2 players. Build a 5x5 kingdom by
  drafting domino tiles with different terrains.

  TERRAINS:
  W = Wheat    F = Forest    ~ = Water
  G = Grassland  S = Swamp   M = Mine
  C = Castle (your starting square, wild for matching)

  CROWNS:
  Each terrain square has 0-3 crowns. Displayed as
  the terrain letter followed by the crown count
  (e.g., M2 = Mine with 2 crowns).

  HOW TO PLAY:
  1. DRAFTING: Each round, 4 tiles are revealed.
     Each player picks 2 tiles (pick order is based
     on previous tile numbers - lower picks first).
     Type: pick <tile_number>

  2. PLACEMENT: Place your tile so at least one half
     is adjacent to a matching terrain in your kingdom.
     The castle counts as a wild match for any terrain.
     Your kingdom cannot exceed 5x5 squares.
     Type: place <row> <col> <orientation>
     Orientations: right, down, left, up
     (direction the second half goes from the first)

  3. SCORING: Each connected group of same terrain
     scores: (number of squares) x (number of crowns)
     A region with 0 crowns scores 0 points!

  BONUSES:
  +10 points if your castle is in the exact center
  +5 points if you fill a complete 5x5 grid

  WINNING: Highest score after all tiles are placed.
"""
        if self.variation == 'queendomino':
            text += """
  QUEENDOMINO ADDITIONS:
  - You earn coins equal to crowns on picked tiles.
  - After picking a tile, you may buy a building.
  - Buildings cost coins and give bonus points.
  - Type the building number to buy, or 'no' to skip.
"""
        text += "=" * 50
        return text
