"""Cryptid - A deduction game about finding a hidden creature on a hex grid."""

import random

from engine.base import BaseGame, input_with_quit, clear_screen


# Terrain types for the hex grid
TERRAINS = ["Forest", "Desert", "Swamp", "Mountain", "Water", "Plains"]
TERRAIN_CHARS = {"Forest": "F", "Desert": "D", "Swamp": "S", "Mountain": "M", "Water": "W", "Plains": "P"}

# Structure types that can appear on tiles
STRUCTURES = ["Standing Stone", "Abandoned Shack", "Bear Territory", "Cougar Territory"]
STRUCTURE_CHARS = {"Standing Stone": "*", "Abandoned Shack": "#", "Bear Territory": "B", "Cougar Territory": "C"}


def _hex_distance(r1, c1, r2, c2):
    """Compute approximate hex distance using offset coordinates."""
    # Convert offset coords to cube coords for accurate distance
    x1 = c1 - (r1 - (r1 & 1)) // 2
    z1 = r1
    y1 = -x1 - z1
    x2 = c2 - (r2 - (r2 & 1)) // 2
    z2 = r2
    y2 = -x2 - z2
    return max(abs(x1 - x2), abs(y1 - y2), abs(z1 - z2))


def _hex_neighbors(row, col, rows, cols):
    """Get valid neighbor coordinates for a hex in an offset-coordinate grid."""
    neighbors = []
    if row % 2 == 0:
        deltas = [(-1, -1), (-1, 0), (0, -1), (0, 1), (1, -1), (1, 0)]
    else:
        deltas = [(-1, 0), (-1, 1), (0, -1), (0, 1), (1, 0), (1, 1)]
    for dr, dc in deltas:
        nr, nc = row + dr, col + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            neighbors.append((nr, nc))
    return neighbors


# Clue generators: each returns (description, checker_function_as_lambda_on_grid)
def _generate_clues(grid, structures, rows, cols, easy=False):
    """Generate a pool of clues that can be used in the game."""
    clues = []

    # Terrain clues: "within N spaces of <terrain>"
    for terrain in TERRAINS:
        dist = 1 if easy else 2
        desc = f"Within {dist} space(s) of {terrain}"
        terrain_positions = set()
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == terrain:
                    terrain_positions.add((r, c))

        def make_checker(tp, d):
            def checker(r, c):
                for tr, tc in tp:
                    if _hex_distance(r, c, tr, tc) <= d:
                        return True
                return False
            return checker
        clues.append((desc, make_checker(terrain_positions, dist)))

    # Structure clues: "within N spaces of <structure>"
    for struct_name, positions in structures.items():
        if not positions:
            continue
        dist = 2 if easy else 3
        desc = f"Within {dist} space(s) of {struct_name}"

        def make_struct_checker(sp, d):
            def checker(r, c):
                for sr, sc in sp:
                    if _hex_distance(r, c, sr, sc) <= d:
                        return True
                return False
            return checker
        clues.append((desc, make_struct_checker(positions, dist)))

    # Terrain-is clue: "on <terrain>"
    for terrain in TERRAINS:
        desc = f"On {terrain} terrain"

        def make_on_checker(t):
            def checker(r, c):
                return grid[r][c] == t
            return checker
        clues.append((desc, make_on_checker(terrain)))

    # Not-on-terrain clue
    for terrain in TERRAINS:
        desc = f"NOT on {terrain} terrain"

        def make_not_checker(t):
            def checker(r, c):
                return grid[r][c] != t
            return checker
        clues.append((desc, make_not_checker(terrain)))

    return clues


class CryptidGame(BaseGame):
    """Cryptid: Deduce the creature's hidden location on a hex grid."""

    name = "Cryptid"
    description = "A deduction game - find the hidden creature on a hex grid"
    min_players = 2
    max_players = 2
    variations = {
        "standard": "Standard 6x9 grid with complex clues",
        "easy": "Smaller 5x7 grid with simpler clues",
    }

    def __init__(self, variation=None):
        super().__init__(variation)
        self.rows = 6
        self.cols = 9
        self.grid = []           # terrain grid
        self.structures = {}     # structure_name -> list of (r,c)
        self.struct_map = {}     # (r,c) -> structure_name
        self.creature_pos = None # (row, col)
        self.clues = []          # [(description, checker), ...] per player (index 0,1)
        self.clue_texts = []     # text per player
        self.search_markers = [] # per player: set of (r,c) with result
        self.player_tokens = []  # per player: dict (r,c)->bool (True=yes, False=no)
        self.phase = "search"    # "search" or "guess"

    def setup(self):
        if self.variation == "easy":
            self.rows = 5
            self.cols = 7
        else:
            self.rows = 6
            self.cols = 9

        # Generate random terrain grid
        self.grid = []
        for r in range(self.rows):
            row = []
            for c in range(self.cols):
                row.append(random.choice(TERRAINS))
            self.grid.append(row)

        # Place structures randomly
        self.structures = {s: [] for s in STRUCTURES}
        self.struct_map = {}
        num_each = 2 if self.variation != "easy" else 1
        all_positions = [(r, c) for r in range(self.rows) for c in range(self.cols)]
        random.shuffle(all_positions)
        idx = 0
        for struct in STRUCTURES:
            for _ in range(num_each):
                if idx < len(all_positions):
                    pos = all_positions[idx]
                    self.structures[struct].append(pos)
                    self.struct_map[pos] = struct
                    idx += 1

        # Generate clue pool
        easy = self.variation == "easy"
        clue_pool = _generate_clues(self.grid, self.structures, self.rows, self.cols, easy)
        random.shuffle(clue_pool)

        # Find a creature position that satisfies at least 2 clues
        # and assign one clue per player such that only the creature satisfies BOTH
        creature_found = False
        attempts = 0
        while not creature_found and attempts < 200:
            attempts += 1
            random.shuffle(clue_pool)
            if len(clue_pool) < 2:
                break
            c1_desc, c1_fn = clue_pool[0]
            c2_desc, c2_fn = clue_pool[1]

            # Find positions satisfying both
            both = []
            for r in range(self.rows):
                for c in range(self.cols):
                    if c1_fn(r, c) and c2_fn(r, c):
                        both.append((r, c))

            # Find positions satisfying only one (to make it non-trivial)
            only1 = []
            only2 = []
            for r in range(self.rows):
                for c in range(self.cols):
                    if c1_fn(r, c) and not c2_fn(r, c):
                        only1.append((r, c))
                    if c2_fn(r, c) and not c1_fn(r, c):
                        only2.append((r, c))

            if len(both) >= 1 and len(both) <= 5 and len(only1) >= 2 and len(only2) >= 2:
                self.creature_pos = random.choice(both)
                self.clues = [(c1_desc, c1_fn), (c2_desc, c2_fn)]
                self.clue_texts = [c1_desc, c2_desc]
                creature_found = True

        if not creature_found:
            # Fallback: pick any position and make simple clues
            self.creature_pos = (self.rows // 2, self.cols // 2)
            terrain = self.grid[self.creature_pos[0]][self.creature_pos[1]]
            c1_desc = f"On {terrain} terrain"
            c1_fn = lambda r, c, t=terrain: self.grid[r][c] == t
            c2_desc = f"NOT on Water terrain"
            c2_fn = lambda r, c: self.grid[r][c] != "Water"
            self.clues = [(c1_desc, c1_fn), (c2_desc, c2_fn)]
            self.clue_texts = [c1_desc, c2_desc]

        self.player_tokens = [{}, {}]
        self.search_markers = [set(), set()]
        self.phase = "search"

    def display(self):
        p = self.current_player
        print(f"\n  === CRYPTID === Turn {self.turn_number + 1}")
        print(f"  {self.players[0]} vs {self.players[1]}")
        print(f"  Current: {self.players[p - 1]} | Phase: {self.phase.upper()}")
        print()

        # Show the player's own clue (secret from the other player)
        print(f"  YOUR SECRET CLUE: {self.clue_texts[p - 1]}")
        print(f"  (The creature satisfies BOTH players' clues)")
        print()

        # Column headers
        header = "     "
        for c in range(self.cols):
            header += f" {c:2d} "
        print(header)
        print("     " + "----" * self.cols)

        for r in range(self.rows):
            offset = " " if r % 2 == 0 else "  "
            line = f"  {r:2d} {offset}"
            for c in range(self.cols):
                terrain_ch = TERRAIN_CHARS[self.grid[r][c]]
                # Check for structure
                if (r, c) in self.struct_map:
                    cell = STRUCTURE_CHARS[self.struct_map[(r, c)]]
                else:
                    cell = terrain_ch

                # Overlay tokens
                t1 = self.player_tokens[0].get((r, c))
                t2 = self.player_tokens[1].get((r, c))
                if t1 is not None and t2 is not None:
                    if t1 and t2:
                        cell = "!!"[0]  # both yes
                    else:
                        cell = "."
                elif t1 is not None:
                    cell = "1" if t1 else "x"
                elif t2 is not None:
                    cell = "2" if t2 else "o"

                line += f"[{cell}] " if (r, c) == self.creature_pos and self.game_over else f" {cell}  "
            print(line)

        print()
        # Legend
        print("  Terrain: F=Forest D=Desert S=Swamp M=Mountain W=Water P=Plains")
        print("  Structures: *=Standing Stone #=Abandoned Shack B=Bear C=Cougar")
        print("  Tokens: 1/2=Player confirmed YES  x/o=Player confirmed NO  !=Both YES")
        print()

        # Show all tokens placed so far
        for pi in range(2):
            yes_cells = [pos for pos, v in self.player_tokens[pi].items() if v]
            no_cells = [pos for pos, v in self.player_tokens[pi].items() if not v]
            print(f"  {self.players[pi]} tokens: YES at {sorted(yes_cells)} | NO at {sorted(no_cells)}")
        print()

    def get_move(self):
        print("  Actions:")
        print("    search <row> <col>  - Ask opponent about a location")
        print("    guess  <row> <col>  - Guess the creature's location")
        print()
        raw = input_with_quit(f"  {self.players[self.current_player - 1]}> ").strip().lower()
        parts = raw.split()
        if len(parts) != 3:
            return None
        action = parts[0]
        try:
            row, col = int(parts[1]), int(parts[2])
        except ValueError:
            return None
        if action not in ("search", "guess"):
            return None
        return (action, row, col)

    def make_move(self, move):
        if move is None:
            return False
        action, row, col = move
        if row < 0 or row >= self.rows or col < 0 or col >= self.cols:
            print(f"  Position ({row},{col}) is out of bounds!")
            input("  Press Enter...")
            return False

        p = self.current_player  # 1 or 2
        opp = 2 if p == 1 else 1

        if action == "search":
            # The opponent must reveal whether their clue matches this location
            opp_clue_fn = self.clues[opp - 1][1]
            result = opp_clue_fn(row, col)
            self.player_tokens[opp - 1][(row, col)] = result

            clear_screen()
            self.display()
            if result:
                print(f"  >>> {self.players[opp - 1]} says: YES, my clue matches ({row},{col})!")
            else:
                print(f"  >>> {self.players[opp - 1]} says: NO, my clue does NOT match ({row},{col}).")
            input("  Press Enter to continue...")
            return True

        elif action == "guess":
            # Player guesses the creature location
            # First, verify with own clue
            own_clue_fn = self.clues[p - 1][1]
            if not own_clue_fn(row, col):
                print(f"  Your own clue doesn't match ({row},{col})! Bad guess.")
                print(f"  You must place a NO token there for yourself.")
                self.player_tokens[p - 1][(row, col)] = False
                input("  Press Enter to continue...")
                return True

            # Check opponent's clue
            opp_clue_fn = self.clues[opp - 1][1]
            opp_result = opp_clue_fn(row, col)
            self.player_tokens[opp - 1][(row, col)] = opp_result

            if (row, col) == self.creature_pos:
                self.game_over = True
                self.winner = p
                print(f"\n  >>> CORRECT! The creature was at ({row},{col})!")
                print(f"  >>> {self.players[p - 1]} WINS!")
                input("  Press Enter to continue...")
            else:
                clear_screen()
                self.display()
                print(f"  >>> WRONG! The creature is not at ({row},{col}).")
                if not opp_result:
                    print(f"  >>> {self.players[opp - 1]}'s clue didn't match there either.")
                else:
                    print(f"  >>> {self.players[opp - 1]}'s clue DID match, but something else is wrong.")
                self.player_tokens[p - 1][(row, col)] = False
                input("  Press Enter to continue...")
            return True

        return False

    def check_game_over(self):
        # Already handled in make_move for guesses
        pass

    def get_state(self):
        return {
            "rows": self.rows,
            "cols": self.cols,
            "grid": self.grid,
            "structures": {k: list(v) for k, v in self.structures.items()},
            "struct_map": {f"{r},{c}": s for (r, c), s in self.struct_map.items()},
            "creature_pos": list(self.creature_pos),
            "clue_texts": self.clue_texts,
            "player_tokens": [
                {f"{r},{c}": v for (r, c), v in pt.items()}
                for pt in self.player_tokens
            ],
            "phase": self.phase,
            "current_player": self.current_player,
            "turn_number": self.turn_number,
            "game_over": self.game_over,
            "winner": self.winner,
        }

    def load_state(self, state):
        self.rows = state["rows"]
        self.cols = state["cols"]
        self.grid = state["grid"]
        self.structures = {k: [tuple(p) for p in v] for k, v in state["structures"].items()}
        self.struct_map = {
            (int(k.split(",")[0]), int(k.split(",")[1])): v
            for k, v in state["struct_map"].items()
        }
        self.creature_pos = tuple(state["creature_pos"])
        self.clue_texts = state["clue_texts"]
        self.phase = state["phase"]
        self.current_player = state["current_player"]
        self.turn_number = state["turn_number"]
        self.game_over = state["game_over"]
        self.winner = state["winner"]

        # Restore tokens
        self.player_tokens = []
        for pt_dict in state["player_tokens"]:
            restored = {}
            for k, v in pt_dict.items():
                r, c = int(k.split(",")[0]), int(k.split(",")[1])
                restored[(r, c)] = v
            self.player_tokens.append(restored)

        # Regenerate clue functions from texts
        easy = self.variation == "easy"
        clue_pool = _generate_clues(self.grid, self.structures, self.rows, self.cols, easy)
        clue_map = {desc: fn for desc, fn in clue_pool}
        self.clues = []
        for text in self.clue_texts:
            if text in clue_map:
                self.clues.append((text, clue_map[text]))
            else:
                # Fallback: clue that always returns True
                self.clues.append((text, lambda r, c: True))

        self.search_markers = [set(), set()]

    def get_tutorial(self):
        return """
=== CRYPTID TUTORIAL ===

OVERVIEW:
  A creature is hiding on the hex grid. Each player has a SECRET CLUE
  about the creature's location. The creature is at the ONE position
  that satisfies ALL players' clues simultaneously.

GOAL:
  Be the first to correctly guess the creature's location.

TERRAIN & STRUCTURES:
  The grid has terrain types (Forest, Desert, Swamp, Mountain, Water,
  Plains) and structures (Standing Stones, Abandoned Shacks, Bear/Cougar
  Territory). Clues reference these features.

HOW TO PLAY:
  On your turn, choose one action:

  1. SEARCH a location (search <row> <col>):
     Ask your opponent whether their clue matches a specific position.
     They MUST answer honestly. A token is placed showing the result.

  2. GUESS the creature (guess <row> <col>):
     Declare where you think the creature is. If correct, you win!
     If wrong, tokens are placed revealing information.

STRATEGY:
  - Use searches to narrow down your opponent's clue.
  - Cross-reference search results with your own clue.
  - The creature is at the intersection of both clues.
  - Don't guess until you're confident!

COMMANDS:
  search <row> <col>  - Search a location
  guess <row> <col>   - Guess creature location
  quit/q              - Quit game
  save/s              - Save game
  help/h              - Show help
"""
