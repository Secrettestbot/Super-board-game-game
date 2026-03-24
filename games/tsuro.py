"""Tsuro - The Game of the Path. A path-building board game."""

import random
import copy
from engine.base import BaseGame, input_with_quit, clear_screen


def _generate_all_tiles():
    """Generate all unique Tsuro tiles.

    Each tile has 8 ports (0-7):
        Top: 0, 1
        Right: 2, 3
        Bottom: 4, 5
        Left: 6, 7

    A tile connects ports in 4 pairs. We enumerate all distinct pairings
    of 8 ports (ignoring rotational equivalence).
    """
    # Generate all perfect matchings of ports 0-7
    def _matchings(ports):
        if len(ports) == 0:
            return [()]
        if len(ports) == 2:
            return [((ports[0], ports[1]),)]
        first = ports[0]
        rest = ports[1:]
        results = []
        for i, partner in enumerate(rest):
            remaining = rest[:i] + rest[i + 1:]
            for matching in _matchings(remaining):
                results.append(((first, partner),) + matching)
        return results

    all_matchings = _matchings(list(range(8)))

    def _rotate_port(port, times=1):
        """Rotate a port 90 degrees clockwise, 'times' times."""
        for _ in range(times):
            # 0->2, 1->3, 2->4, 3->5, 4->6, 5->7, 6->0, 7->1
            port = (port + 2) % 8
        return port

    def _rotate_tile(connections, times=1):
        """Rotate tile connections 90 degrees clockwise, 'times' times."""
        rotated = []
        for a, b in connections:
            ra = _rotate_port(a, times)
            rb = _rotate_port(b, times)
            rotated.append((min(ra, rb), max(ra, rb)))
        return tuple(sorted(rotated))

    def _canonical(connections):
        """Get canonical form of tile (minimum across all rotations)."""
        forms = []
        for r in range(4):
            forms.append(_rotate_tile(connections, r))
        return min(forms)

    seen = set()
    unique_tiles = []
    for matching in all_matchings:
        normalized = tuple(sorted((min(a, b), max(a, b)) for a, b in matching))
        canon = _canonical(normalized)
        if canon not in seen:
            seen.add(canon)
            unique_tiles.append(list(list(pair) for pair in canon))

    return unique_tiles


# Pre-generate all unique tiles
ALL_TILES = _generate_all_tiles()


def _rotate_connections(connections, times=1):
    """Rotate tile connections 90 degrees clockwise, 'times' times."""
    result = [list(pair) for pair in connections]
    for _ in range(times):
        new_result = []
        for a, b in result:
            ra = (a + 2) % 8
            rb = (b + 2) % 8
            new_result.append([min(ra, rb), max(ra, rb)])
        result = sorted(new_result)
    return result


def _build_port_map(connections):
    """Build a bidirectional port mapping from connections."""
    port_map = {}
    for a, b in connections:
        port_map[a] = b
        port_map[b] = a
    return port_map


# Edge port directions: which direction from cell does each port face?
# Ports 0,1 = top; 2,3 = right; 4,5 = bottom; 6,7 = left
PORT_EDGE = {0: 'top', 1: 'top', 2: 'right', 3: 'right',
             4: 'bottom', 5: 'bottom', 6: 'left', 7: 'left'}

# When exiting port P of cell (r,c), what cell and entry port do we arrive at?
# Exit port -> (dr, dc, entry_port)
EXIT_TO_ENTRY = {
    0: (-1, 0, 5),   # top-left exit -> cell above, bottom-right entry
    1: (-1, 0, 4),   # top-right exit -> cell above, bottom-left entry
    2: (0, 1, 7),    # right-top exit -> cell right, left-bottom entry
    3: (0, 1, 6),    # right-bottom exit -> cell right, left-top entry
    4: (1, 0, 1),    # bottom-left exit -> cell below, top-right entry
    5: (1, 0, 0),    # bottom-right exit -> cell below, top-left entry
    6: (0, -1, 3),   # left-top exit -> cell left, right-bottom entry
    7: (0, -1, 2),   # left-bottom exit -> cell left, right-top entry
}


class TsuroGame(BaseGame):
    """Tsuro: The Game of the Path - build paths and stay on the board."""

    name = "Tsuro"
    description = "Build paths with tiles and stay on the board to win"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard Tsuro (6x6)",
        "small": "Small Tsuro (4x4)",
    }

    def __init__(self, variation=None):
        super().__init__(variation or "standard")
        self.board_size = 6
        self.board = []  # board[r][c] = tile connections or None
        self.deck = []
        self.hands = {}  # {player_num: [tile, ...]}
        # Player positions: {player_num: (row, col, port)}
        # row, col = cell the player is at the edge of (or on)
        # port = which port of that cell the player is sitting on (from outside)
        self.positions = {}
        self.alive = {}
        self.markers = {1: 'A', 2: 'B'}

    def setup(self):
        """Initialize the board, deck, and player positions."""
        if self.variation == "small":
            self.board_size = 4
        else:
            self.board_size = 6

        self.board = [[None for _ in range(self.board_size)]
                      for _ in range(self.board_size)]

        # Create deck from all tiles
        self.deck = [list(list(p) for p in tile) for tile in ALL_TILES]
        random.shuffle(self.deck)

        # Player starting positions (edge ports)
        # P1: top-left area, facing into cell (0,0) from port 0 (top edge)
        # P2: bottom-right area, facing into cell (bs-1, bs-1) from port 4 (bottom edge)
        bs = self.board_size
        # Position format: (row, col, port) means the player is at the
        # boundary of cell (row, col), about to enter through port 'port'.
        self.positions = {
            1: (0, 0, 0),      # top edge of cell (0,0), port 0
            2: (bs - 1, bs - 1, 4),  # bottom edge of cell (bs-1, bs-1), port 4
        }
        self.alive = {1: True, 2: True}

        # Deal 3 tiles to each player
        self.hands = {1: [], 2: []}
        for p in [1, 2]:
            for _ in range(3):
                if self.deck:
                    self.hands[p].append(self.deck.pop())

    def _tile_symbol(self, connections):
        """Create a compact 3-line representation of a tile for display."""
        port_map = _build_port_map(connections)
        # Show connections as lines
        # Top row: ports 0 and 1
        # Middle: shows connections compactly
        # Bottom: ports 4 and 5
        lines = []
        # Connection summary string
        pairs = []
        for a, b in sorted(connections):
            pairs.append(f"{a}-{b}")
        return ",".join(pairs)

    def _render_tile_3x5(self, connections):
        """Render a single tile as a 3-line, 5-char wide block."""
        if connections is None:
            return ["  .  ", "  .  ", "  .  "]
        pm = _build_port_map(connections)
        # Simplified visual: show port connections
        # top: 0 1, right: 2 3, bottom: 4 5, left: 6 7
        # Line 0: top ports
        # Line 1: left/right ports
        # Line 2: bottom ports
        t0 = str(pm[0])
        t1 = str(pm[1])
        r2 = str(pm[2])
        r3 = str(pm[3])
        b4 = str(pm[4])
        b5 = str(pm[5])
        l6 = str(pm[6])
        l7 = str(pm[7])
        line0 = f"|{t0} {t1}|"
        line1 = f"|{l6}.{r2}|"
        line2 = f"|{b4} {b5}|"
        return [line0, line1, line2]

    def _format_hand_tile(self, tile, index):
        """Format a hand tile for display."""
        lines = self._render_tile_3x5(tile)
        header = f" [{index}]  "
        return [header] + lines

    def display(self):
        """Display the board, positions, and current player's hand."""
        bs = self.board_size
        print(f"\n  === TSURO ({bs}x{bs}) - Turn {self.turn_number + 1} ===\n")

        # Column headers
        col_header = "     "
        for c in range(bs):
            col_header += f"  {c}    "
        print(col_header)
        print("     " + "+-----" * bs + "+")

        for r in range(bs):
            # Each cell is 3 lines tall
            for line_idx in range(3):
                row_str = ""
                if line_idx == 1:
                    row_str = f"  {r}  "
                else:
                    row_str = "     "

                for c in range(bs):
                    tile = self.board[r][c]
                    if tile is not None:
                        lines = self._render_tile_3x5(tile)
                        cell_str = lines[line_idx]
                    else:
                        cell_str = "  .  "

                    # Check for player markers at this cell's ports
                    cell_str = self._overlay_markers(cell_str, r, c, line_idx)
                    row_str += cell_str + "|" if line_idx == 1 else cell_str + " "

                print(row_str)

            print("     " + "+-----" * bs + "+")

        # Show player status
        print()
        for p in [1, 2]:
            marker = self.markers[p]
            status = "ALIVE" if self.alive[p] else "ELIMINATED"
            r, c, port = self.positions[p]
            pos_str = f"cell({r},{c}) port {port}"
            name = self.players[p - 1]
            print(f"  {marker} {name}: {status} at {pos_str}")

        # Show current player's hand
        if self.alive[self.current_player]:
            print(f"\n  {self.players[self.current_player - 1]}'s Hand:")
            hand = self.hands[self.current_player]
            if not hand:
                print("    (empty)")
            else:
                # Show each tile with its connections
                for i, tile in enumerate(hand):
                    pairs = ", ".join(f"{a}-{b}" for a, b in tile)
                    print(f"    Tile {i}: [{pairs}]")

            print(f"\n  Tiles remaining in deck: {len(self.deck)}")
            print("  Enter: tile_index rotation (e.g. '0 0' or '1 2')")
            print("  Rotation: 0=none, 1=90°, 2=180°, 3=270° clockwise")

    def _overlay_markers(self, cell_str, r, c, line_idx):
        """Overlay player markers on the cell display string."""
        # Check each alive player
        for p in [1, 2]:
            if not self.alive[p]:
                continue
            pr, pc, port = self.positions[p]
            if pr != r or pc != c:
                continue
            marker = self.markers[p]
            # Place marker based on port location
            # line 0: top (ports 0, 1)
            # line 1: left/right (ports 6, 7, 2, 3)
            # line 2: bottom (ports 4, 5)
            if line_idx == 0 and port in (0, 1):
                pos = 1 if port == 0 else 3
                cell_str = cell_str[:pos] + marker + cell_str[pos + 1:]
            elif line_idx == 1 and port in (6, 7):
                pos = 0
                cell_str = marker + cell_str[1:]
            elif line_idx == 1 and port in (2, 3):
                pos = 4
                cell_str = cell_str[:pos] + marker + cell_str[pos + 1:]
            elif line_idx == 2 and port in (4, 5):
                pos = 1 if port == 5 else 3
                cell_str = cell_str[:pos] + marker + cell_str[pos + 1:]
        return cell_str

    def get_move(self):
        """Get tile placement from current player."""
        move_str = input_with_quit(
            f"\n  {self.players[self.current_player - 1]}'s move > "
        )
        return move_str.strip()

    def make_move(self, move):
        """Place a tile and follow paths. Returns True if valid."""
        # Parse move
        parts = move.split()
        if len(parts) != 2:
            print("  Format: tile_index rotation (e.g. '0 1')")
            return False

        try:
            tile_idx = int(parts[0])
            rotation = int(parts[1])
        except ValueError:
            print("  Invalid numbers.")
            return False

        hand = self.hands[self.current_player]
        if tile_idx < 0 or tile_idx >= len(hand):
            print(f"  Tile index must be 0-{len(hand) - 1}.")
            return False

        if rotation not in (0, 1, 2, 3):
            print("  Rotation must be 0, 1, 2, or 3.")
            return False

        # Get the tile and apply rotation
        tile = hand[tile_idx]
        if rotation > 0:
            tile = _rotate_connections(tile, rotation)

        # Determine where to place the tile
        # The tile must be placed at the cell the current player is facing
        r, c, port = self.positions[self.current_player]

        # Check that cell is on the board
        if r < 0 or r >= self.board_size or c < 0 or c >= self.board_size:
            print("  You are off the board!")
            return False

        # Check that cell is empty
        if self.board[r][c] is not None:
            print("  That cell already has a tile.")
            return False

        # Place the tile
        self.board[r][c] = tile

        # Remove tile from hand
        hand.pop(tile_idx)

        # Follow paths for ALL players that are at this cell
        # (current player first, then others)
        players_to_move = []
        for p in [1, 2]:
            if not self.alive[p]:
                continue
            pr, pc, pport = self.positions[p]
            if pr == r and pc == c:
                players_to_move.append(p)

        # Follow paths
        eliminated = set()
        for p in players_to_move:
            self._follow_path(p)
            pr, pc, pport = self.positions[p]
            # Check if off board
            if pr < 0 or pr >= self.board_size or pc < 0 or pc >= self.board_size:
                eliminated.add(p)
                self.alive[p] = False

        # Check for collision (two players on same position)
        if self.alive[1] and self.alive[2]:
            if self.positions[1] == self.positions[2]:
                # Both eliminated - but the one who placed the tile loses
                # With 2 players, both eliminated = draw (simultaneous)
                eliminated.add(1)
                eliminated.add(2)
                self.alive[1] = False
                self.alive[2] = False

        # Draw a new tile
        if self.deck and self.alive[self.current_player]:
            hand.append(self.deck.pop())

        return True

    def _follow_path(self, player):
        """Follow the path from a player's current position through tiles."""
        r, c, port = self.positions[player]

        # Keep following through connected tiles
        while True:
            # Check bounds
            if r < 0 or r >= self.board_size or c < 0 or c >= self.board_size:
                self.positions[player] = (r, c, port)
                return

            tile = self.board[r][c]
            if tile is None:
                # No tile here; player waits at this port
                self.positions[player] = (r, c, port)
                return

            # Follow the path through the tile
            port_map = _build_port_map(tile)
            exit_port = port_map[port]

            # Move to the next cell via the exit port
            dr, dc, entry_port = EXIT_TO_ENTRY[exit_port]
            r = r + dr
            c = c + dc
            port = entry_port

        self.positions[player] = (r, c, port)

    def check_game_over(self):
        """Check if the game is over."""
        alive_players = [p for p in [1, 2] if self.alive[p]]

        if len(alive_players) == 0:
            # Both eliminated - draw
            self.game_over = True
            self.winner = None
        elif len(alive_players) == 1:
            # One survivor wins
            self.game_over = True
            self.winner = alive_players[0]
        elif all(len(self.hands[p]) == 0 for p in [1, 2]) and len(self.deck) == 0:
            # No more tiles to play - both survive, it's a draw
            self.game_over = True
            self.winner = None

    def get_state(self):
        """Return serializable game state for saving."""
        return {
            'board_size': self.board_size,
            'board': self.board,
            'deck': self.deck,
            'hands': {str(k): v for k, v in self.hands.items()},
            'positions': {str(k): list(v) for k, v in self.positions.items()},
            'alive': {str(k): v for k, v in self.alive.items()},
            'markers': {str(k): v for k, v in self.markers.items()},
        }

    def load_state(self, state):
        """Restore game state from saved data."""
        self.board_size = state['board_size']
        self.board = state['board']
        self.deck = state['deck']
        self.hands = {int(k): v for k, v in state['hands'].items()}
        self.positions = {int(k): tuple(v) for k, v in state['positions'].items()}
        self.alive = {int(k): v for k, v in state['alive'].items()}
        self.markers = {int(k): v for k, v in state['markers'].items()}

    def get_tutorial(self):
        """Return tutorial text for Tsuro."""
        return """
╔══════════════════════════════════════════════════════════════╗
║                    TSURO - THE GAME OF THE PATH             ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  OVERVIEW:                                                   ║
║  Tsuro is a path-building game. Place tiles to extend your   ║
║  path while trying to keep your marker on the board.         ║
║                                                              ║
║  BOARD:                                                      ║
║  The board is a 6x6 grid (or 4x4 in small variant).         ║
║  Each tile has 8 ports (2 per edge) connected by 4 paths.    ║
║                                                              ║
║  TILE PORTS:                                                 ║
║       0  1                                                   ║
║     +------+                                                 ║
║   7 |      | 2                                               ║
║   6 |      | 3                                               ║
║     +------+                                                 ║
║       5  4                                                   ║
║                                                              ║
║  HOW TO PLAY:                                                ║
║  1. You start at an edge port on the board boundary.         ║
║  2. Each turn, play a tile from your hand (3 tiles) at the   ║
║     cell your marker is facing.                              ║
║  3. Your marker follows the path through the tile.           ║
║  4. If your path leads off the board, you are eliminated!    ║
║  5. After placing, draw a tile from the deck (if available). ║
║                                                              ║
║  INPUT FORMAT:                                               ║
║  Enter: tile_index rotation                                  ║
║  Example: "0 0" = play first tile, no rotation               ║
║  Example: "1 2" = play second tile, rotated 180 degrees      ║
║  Rotations: 0=none, 1=90°CW, 2=180°, 3=270°CW              ║
║                                                              ║
║  WINNING:                                                    ║
║  - Last player with their marker on the board wins.          ║
║  - If both players are eliminated simultaneously, it's a     ║
║    draw.                                                     ║
║                                                              ║
║  TIPS:                                                       ║
║  - Study each tile's connections before placing.             ║
║  - Try to keep your path going toward the center.            ║
║  - Force your opponent toward the edge!                      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"""
